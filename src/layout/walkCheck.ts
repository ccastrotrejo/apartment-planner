import { FURNITURE_CATALOG } from '../furniture/catalog';
import {
  cleanRing,
  diffRegions,
  distPointToRing,
  expandConvexPoly,
  intersectRegions,
  type PlanRegion,
  polysToRegion,
  rectsToRegion,
  rectToPoly,
  regionArea,
  segmentCapsulePoly,
  transformHitCorners,
} from '../geometry/plan2d';
import type { Compass, HitRect, LayoutExceptionRule, PlacementTuple, Rect4, SolvedPlan, Vec2 } from '../types';

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

export function pieceWorldPolys(piece: string, x: number, z: number, rotation: number): Vec2[][] {
  const spec = FURNITURE_CATALOG[piece];
  const rects = spec.hits ?? [spec.hit];
  return rects.map((r) => transformHitCorners(x, z, rotation, r));
}

export class WalkCheck {
  readonly allowedExceptions: ReadonlyArray<LayoutExceptionRule>;
  private readonly base: PlanRegion;
  private readonly footprintRegion: PlanRegion;
  private readonly footprintRing: ReadonlyArray<Vec2>;
  private readonly staticObstaclePolys: Vec2[][];
  private readonly erodedStaticCache = new Map<number, PlanRegion>();
  private readonly doorSwings: Array<{ name: string; region: PlanRegion }>;
  private readonly fixtureZones: Array<{ name: string; region: PlanRegion }>;
  private readonly targets: Array<{ name: string; region: PlanRegion }>;
  private readonly entryPt: Vec2;

  constructor(plan: SolvedPlan) {
    this.allowedExceptions = plan.spec.allowedLayoutExceptions ?? [];
    this.footprintRing = plan.footprint;
    this.footprintRegion = polysToRegion([plan.footprint]);

    const staticRects: Rect4[] = [
      ...plan.walls,
      ...plan.fixtures.map((f) => f.bounds),
      ...plan.windows.map((w) => w.r),
    ];
    this.staticObstaclePolys = staticRects.map(rectToPoly);
    const staticBlocked = rectsToRegion(staticRects);
    this.base = diffRegions(this.footprintRegion, staticBlocked);

    this.doorSwings = plan.doors.map((d) => ({
      name: d.name,
      region: polysToRegion([d.poly]),
    }));

    this.fixtureZones = [];
    const rawTargets: Array<{ name: string; region: PlanRegion }> = [];

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
      const zone = intersectRegions(rectsToRegion([boxRect]), this.base);
      this.fixtureZones.push({ name: fx.def.name, region: zone });
      rawTargets.push({ name: `the ${fx.def.name}`, region: zone });
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
          region: polysToRegion([circlePoly([mx + sign * 20 * nx, mz + sign * 20 * nz], 4)]),
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
          region: polysToRegion([circlePoly([mx + sign * 20 * nx, mz + sign * 20 * nz], 4)]),
        });
      }
    }

    const entryDoor = plan.doors.find((d) => d.name === 'entry')!;
    this.entryPt = [entryDoor.hinge[0] - 19, entryDoor.hinge[1] - 20];
    const emptyReach = this.reachable([], WALK_WIDTH / 2);
    this.targets = rawTargets.filter(
      (t) => emptyReach !== null && regionArea(intersectRegions(t.region, emptyReach)) > 1e-3,
    );
  }

  private getErodedStaticBase(radius: number): PlanRegion {
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
    const clip = polysToRegion([...capsules, ...expandedStatic]);
    const res = diffRegions(this.footprintRegion, clip);
    this.erodedStaticCache.set(radius, res);
    return res;
  }

  private reachable(solidPolys: ReadonlyArray<ReadonlyArray<Vec2>>, radius = WALK_WIDTH / 2): PlanRegion | null {
    const staticEroded = this.getErodedStaticBase(radius);
    const eroded =
      solidPolys.length > 0
        ? diffRegions(staticEroded, polysToRegion(solidPolys.map((p) => expandConvexPoly(p, radius, 5))))
        : staticEroded;

    if (eroded.length === 0) return null;

    let bestPoly: PlanRegion[number] | null = null;
    let bestDist = Infinity;
    for (const poly of eroded) {
      if (poly.length === 0) continue;
      const outer = cleanRing(poly[0]);
      if (outer.length < 3) continue;
      const d = distPointToRing(this.entryPt, outer);
      if (d < radius && d < bestDist) {
        bestDist = d;
        bestPoly = poly;
      }
    }
    return bestPoly ? [bestPoly] : null;
  }

  problems(items: ReadonlyArray<PlacementTuple>): string[] {
    const problems = new Set<string>();
    const solidPolys: Vec2[][] = [];

    for (const [piece, x, z, rotation] of items) {
      const spec = FURNITURE_CATALOG[piece];
      if (!spec || spec.flat) continue;

      const polys = pieceWorldPolys(piece, x, z, rotation);
      const itemRegion = polysToRegion(polys);
      if (!spec.seat) {
        solidPolys.push(...polys);
      }

      for (const { name, region: swing } of this.doorSwings) {
        if (regionArea(intersectRegions(itemRegion, swing)) > 1.0) {
          problems.add(`${spec.name} blocks the ${name} door swing`);
        }
      }

      for (const { name, region: zone } of this.fixtureZones) {
        if (spec.seat && name === 'counter') continue;
        if (regionArea(intersectRegions(itemRegion, zone)) > 1.0) {
          problems.add(`${spec.name} is in front of the ${name}`);
        }
      }
    }

    const walkable = this.reachable(solidPolys, WALK_WIDTH / 2);
    if (!walkable) {
      return [...problems, `no ${WALK_WIDTH}" path from the entry`].sort();
    }

    for (const { name, region: target } of this.targets) {
      if (regionArea(intersectRegions(target, walkable)) <= 1e-3) {
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
        const targetRegion = polysToRegion([targetPoly]);
        const ok = localAccess !== null && regionArea(intersectRegions(targetRegion, localAccess)) > 1e-3;
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
  let problems = checker.problems(items);
  for (const rule of checker.allowedExceptions) {
    if (!problems.includes(rule.allowedProblem)) continue;
    const allPresent = rule.requiredPieces.every(([rk, rx, rz, rr]) =>
      items.some(([k, x, z, r]) => k === rk && x === rx && z === rz && r === rr),
    );
    if (!allPresent) continue;
    const [primaryPiece] = rule.requiredPieces;
    const withoutPrimary = items.filter(
      ([k, x, z, r]) =>
        !(k === primaryPiece[0] && x === primaryPiece[1] && z === primaryPiece[2] && r === primaryPiece[3]),
    );
    if (!checker.problems(withoutPrimary).includes(rule.allowedProblem)) {
      problems = problems.filter((p) => p !== rule.allowedProblem);
    }
  }
  return problems;
}
