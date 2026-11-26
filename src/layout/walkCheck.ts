import { Clipper, Path64, Paths64, Point64, PointInPolygonResult } from 'clipper2-js';
import { FURNITURE_CATALOG } from '../furniture/catalog';
import {
  areaOfPaths,
  diffPaths,
  expandConvexPoly,
  fromPath64,
  intersectPaths,
  polysToPaths64,
  rectsToPaths64,
  rectToPoly,
  segmentCapsulePoly,
  toPath64,
  transformHitCorners,
  unionPaths,
} from '../geometry/plan2d';
import type { Compass, HitRect, PlacementTuple, Rect4, SolvedPlan, Vec2 } from '../types';

const WALK_WIDTH = 30.0;
const ACCESS_WIDTH = 24.0;

const FIXTURE_CLEARANCE: Record<string, number> = {
  cabinets: 30.0,
  range: 30.0,
  fridge: 33.0,
  vanity: 21.0,
  toilet: 21.0,
  tub: 21.0,
  appliance: 30.0,
};

const ACCESS_SIDES: Record<string, ReadonlyArray<'front' | 'left' | 'right' | 'around'>> = {
  'queen-bed': ['left', 'right'],
  sectional: ['front'],
  'standing-desk': ['front'],
  'shoe-cabinet': ['front'],
  'hall-cabinet': ['front'],
  'arched-mirror': ['front'],
  'tier-shelf': ['front'],
  'coat-rack': ['around'],
};

export function frontFrom(center: Vec2, toward: Vec2): Compass {
  const dx = toward[0] - center[0];
  const dz = toward[1] - center[1];
  if (Math.abs(dx) >= Math.abs(dz)) return dx > 0 ? 'E' : 'W';
  return dz > 0 ? 'S' : 'N';
}

function opposite(side: Compass): Compass {
  return ({ E: 'W', W: 'E', N: 'S', S: 'N' } as const)[side];
}

function circlePoly([cx, cz]: Vec2, r: number, segs = 20): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < segs; i++) {
    const a = (2 * Math.PI * i) / segs;
    pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
  }
  return pts;
}

function distPointToPath([px, pz]: Vec2, path: Path64): number {
  const pt64 = new Point64(Math.round(px * 1000), Math.round(pz * 1000));
  const pip = Clipper.pointInPolygon(pt64, path);
  if (pip !== PointInPolygonResult.IsOutside) return 0;
  const pts = fromPath64(path);
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + 1) % pts.length];
    const dx = x2 - x1;
    const dz = z2 - z1;
    const denom = dx * dx + dz * dz;
    const t = denom > 1e-9 ? Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / denom)) : 0;
    const d = Math.hypot(px - x1 - t * dx, pz - z1 - t * dz);
    if (d < best) best = d;
  }
  return best;
}

export function pieceWorldPolys(piece: string, x: number, z: number, rotation: number): Vec2[][] {
  const spec = FURNITURE_CATALOG[piece];
  const rects = spec.hits ?? [spec.hit];
  return rects.map((r) => transformHitCorners(x, z, rotation, r));
}

export class WalkCheck {
  private readonly base: Paths64;
  private readonly footprintPaths: Paths64;
  private readonly footprintRing: ReadonlyArray<Vec2>;
  private readonly staticObstaclePolys: Vec2[][];
  private readonly erodedStaticCache = new Map<number, Paths64>();
  private readonly doorSwings: Array<{ name: string; paths: Paths64 }>;
  private readonly fixtureZones: Array<{ name: string; paths: Paths64 }>;
  private readonly targets: Array<{ name: string; paths: Paths64 }>;
  private readonly entryPt: Vec2;

  constructor(plan: SolvedPlan) {
    this.footprintRing = plan.footprint;
    this.footprintPaths = new Paths64();
    const fpPath = toPath64(plan.footprint);
    if (Clipper.area(fpPath) < 0) fpPath.reverse();
    this.footprintPaths.push(fpPath);

    const staticRects: Rect4[] = [
      ...plan.walls,
      ...plan.fixtures.map((f) => f.bounds),
      ...plan.windows.map((w) => w.r),
    ];
    this.staticObstaclePolys = staticRects.map(rectToPoly);
    const staticBlocked = unionPaths(rectsToPaths64(staticRects));
    this.base = diffPaths(this.footprintPaths, staticBlocked);

    this.doorSwings = plan.doors.map((d) => ({
      name: d.name,
      paths: polysToPaths64([d.poly]),
    }));

    this.fixtureZones = [];
    const rawTargets: Array<{ name: string; paths: Paths64 }> = [];

    const tank = plan.fixtures.find((f) => f.def.name.includes('tank'))?.bounds;
    const hinges = new Map<string, Vec2>(plan.doors.map((d) => [d.name, d.hinge]));

    for (const fx of plan.fixtures) {
      const kind = fx.def.kind;
      if (!kind || !(kind in FIXTURE_CLEARANCE)) continue;
      const [x0, z0, x1, z1] = fx.bounds;
      const center: Vec2 = [(x0 + x1) / 2, (z0 + z1) / 2];
      let front = fx.def.front;
      if (kind === 'toilet' && tank) {
        const tankCenter: Vec2 = [(tank[0] + tank[2]) / 2, (tank[1] + tank[3]) / 2];
        front = opposite(frontFrom(center, tankCenter));
      }
      if (kind === 'appliance' && !front) {
        front = frontFrom(center, hinges.get('W/D') ?? center);
      }
      const c = FIXTURE_CLEARANCE[kind];
      const boxRect: Rect4 =
        front === 'E'
          ? [x1, z0, x1 + c, z1]
          : front === 'W'
            ? [x0 - c, z0, x0, z1]
            : front === 'N'
              ? [x0, z0 - c, x1, z0]
              : [x0, z1, x1, z1 + c];
      const zone = intersectPaths(rectsToPaths64([boxRect]), this.base);
      this.fixtureZones.push({ name: fx.def.name, paths: zone });
      rawTargets.push({ name: `the ${fx.def.name}`, paths: zone });
    }

    for (const door of plan.doors) {
      const [hx, hz] = door.hinge;
      const [cx, cz] = door.closed;
      const len = Math.hypot(cx - hx, cz - hz) || 1;
      const mx = (hx + cx) / 2;
      const mz = (hz + cz) / 2;
      const nx = -(cz - hz) / len;
      const nz = (cx - hx) / len;
      for (const sign of [1, -1]) {
        rawTargets.push({
          name: `the ${door.name} door`,
          paths: polysToPaths64([circlePoly([mx + sign * 20 * nx, mz + sign * 20 * nz], 4)]),
        });
      }
    }

    for (const path of plan.sliders) {
      const [sx, sz] = path[0];
      const [ex, ez] = path[path.length - 1];
      const len = Math.hypot(ex - sx, ez - sz) || 1;
      const mx = (sx + ex) / 2;
      const mz = (sz + ez) / 2;
      const nx = -(ez - sz) / len;
      const nz = (ex - sx) / len;
      for (const sign of [1, -1]) {
        rawTargets.push({
          name: 'the closet slider',
          paths: polysToPaths64([circlePoly([mx + sign * 20 * nx, mz + sign * 20 * nz], 4)]),
        });
      }
    }

    const entryDoor = plan.doors.find((d) => d.name === 'entry')!;
    this.entryPt = [entryDoor.hinge[0] - 19, entryDoor.hinge[1] - 20];
    const emptyReach = this.reachable([], WALK_WIDTH / 2);
    this.targets = rawTargets.filter(
      (t) => emptyReach !== null && areaOfPaths(intersectPaths(t.paths, emptyReach)) > 1e-3,
    );
  }

  private getErodedStaticBase(radius: number): Paths64 {
    const cached = this.erodedStaticCache.get(radius);
    if (cached) return cached;
    const capsules: Vec2[][] = [];
    for (let i = 0; i < this.footprintRing.length; i++) {
      const a = this.footprintRing[i];
      const b = this.footprintRing[(i + 1) % this.footprintRing.length];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-3) {
        capsules.push(segmentCapsulePoly(a, b, radius, 6));
      }
    }
    const expandedStatic = this.staticObstaclePolys.map((p) => expandConvexPoly(p, radius, 5));
    const clip = unionPaths(polysToPaths64([...capsules, ...expandedStatic]));
    const res = diffPaths(this.footprintPaths, clip);
    this.erodedStaticCache.set(radius, res);
    return res;
  }

  /**
   * Exact morphological erosion `(Footprint \ Obstacles) ⊖ Disk(radius)` using analytical
   * convex-polygon disk expansion + Clipper boolean Difference (avoids ClipperOffset artifacts).
   */
  private reachable(solidPolys: ReadonlyArray<ReadonlyArray<Vec2>>, radius = WALK_WIDTH / 2): Paths64 | null {
    const staticEroded = this.getErodedStaticBase(radius);
    const eroded =
      solidPolys.length > 0
        ? diffPaths(
            staticEroded,
            unionPaths(polysToPaths64(solidPolys.map((p) => expandConvexPoly(p, radius, 5)))),
          )
        : staticEroded;

    const shells = eroded.filter((p) => Clipper.area(p) > 0);
    if (shells.length === 0) return null;

    let best: Path64 | null = null;
    let bestDist = Infinity;
    for (const shell of shells) {
      const d = distPointToPath(this.entryPt, shell);
      if (d < radius && d < bestDist) {
        bestDist = d;
        best = shell;
      }
    }
    if (!best) return null;

    const holes = eroded.filter((p) => {
      if (Clipper.area(p) >= 0 || p.length === 0) return false;
      return Clipper.pointInPolygon(new Point64(p[0].x, p[0].y), best!) !== PointInPolygonResult.IsOutside;
    });
    const out = new Paths64();
    out.push(best, ...holes);
    return out;
  }

  problems(items: ReadonlyArray<PlacementTuple>): string[] {
    const problems = new Set<string>();
    const solidPolys: Vec2[][] = [];

    for (const [piece, x, z, rotation] of items) {
      const spec = FURNITURE_CATALOG[piece];
      if (!spec || spec.flat) continue;

      const polys = pieceWorldPolys(piece, x, z, rotation);
      const itemPaths = polysToPaths64(polys);
      if (!spec.seat) {
        solidPolys.push(...polys);
      }

      for (const { name, paths: swing } of this.doorSwings) {
        if (areaOfPaths(intersectPaths(itemPaths, swing)) > 1.0) {
          problems.add(`${spec.name} blocks the ${name} door swing`);
        }
      }

      for (const { name, paths: zone } of this.fixtureZones) {
        if (spec.seat && name === 'counter') continue;
        if (areaOfPaths(intersectPaths(itemPaths, zone)) > 1.0) {
          problems.add(`${spec.name} is in front of the ${name}`);
        }
      }
    }

    const walkable = this.reachable(solidPolys, WALK_WIDTH / 2);
    if (!walkable) {
      return [...problems, `no ${WALK_WIDTH}" path from the entry`].sort();
    }

    for (const { name, paths: target } of this.targets) {
      if (areaOfPaths(intersectPaths(target, walkable)) <= 1e-3) {
        problems.add(`no ${WALK_WIDTH}" path to ${name}`);
      }
    }

    const localAccess = this.reachable(solidPolys, ACCESS_WIDTH / 2);
    for (const [piece, x, z, rotation] of items) {
      const sides = ACCESS_SIDES[piece];
      if (!sides) continue;
      const spec = FURNITURE_CATALOG[piece];
      const [width, depth] = spec.size;
      const accessRects: Record<'front' | 'left' | 'right' | 'around', HitRect> = {
        front: [-width * 0.35, width * 0.35, depth / 2 + 1, depth / 2 + 1 + ACCESS_WIDTH],
        left: [-width / 2 - 1 - ACCESS_WIDTH, -width / 2 - 1, -depth * 0.25, depth * 0.25],
        right: [width / 2 + 1, width / 2 + 1 + ACCESS_WIDTH, -depth * 0.25, depth * 0.25],
        around: [-width / 2 - ACCESS_WIDTH, width / 2 + ACCESS_WIDTH, -depth / 2 - ACCESS_WIDTH, depth / 2 + ACCESS_WIDTH],
      };
      for (const side of sides) {
        const targetPoly = transformHitCorners(x, z, rotation, accessRects[side]);
        const targetPaths = polysToPaths64([targetPoly]);
        const ok = localAccess !== null && areaOfPaths(intersectPaths(targetPaths, localAccess)) > 1e-3;
        if (!ok) {
          const loc = spec.name.toLowerCase();
          problems.add(
            side === 'around'
              ? `no ${ACCESS_WIDTH}" access to ${loc}`
              : `no ${ACCESS_WIDTH}" access to the ${side} of ${loc}`,
          );
        }
      }
    }

    return [...problems].sort();
  }
}

export function unexpectedLayoutProblems(
  checker: WalkCheck,
  items: ReadonlyArray<PlacementTuple>,
): string[] {
  const problems = checker.problems(items);
  const hasDefaultBike = items.some(
    ([k, x, z, r]) => k === 'bike-black' && x === 142.8 && z === 84 && r === 90,
  );
  const hasDefaultBed = items.some(
    ([k, x, z, r]) => k === 'queen-bed' && x === 201.2 && z === 62.9 && r === -90,
  );
  const warning = 'no 24" access to the left of queen bed';
  if (hasDefaultBike && hasDefaultBed && problems.includes(warning)) {
    const withoutBike = items.filter(
      ([k, x, z, r]) => !(k === 'bike-black' && x === 142.8 && z === 84 && r === 90),
    );
    if (!checker.problems(withoutBike).includes(warning)) {
      return problems.filter((p) => p !== warning);
    }
  }
  return problems;
}
