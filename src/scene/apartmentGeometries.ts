import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  applyArchitecturalBoxUVs,
  diffRegions,
  extrudePlanPolygons,
  intersectRegions,
  mergeBufferGeometries,
  polylineToRegion,
  polysToRegion,
  rectsToRegion,
  regionToPolygonsWithHoles,
  unionRegions,
  type PlanRegion,
} from '../geometry/plan2d';
import { buildAllPlanFixtures, type FixtureBucketKey } from './fixtureBuilders';
import { TEX_INCHES } from './textures';
import type { Rect4, SolvedPlan } from '../types';

export type { FixtureBucketKey } from './fixtureBuilders';

export interface BuiltWindowGeometry {
  readonly frameFull: THREE.BufferGeometry;
  readonly glassFull: THREE.BufferGeometry;
  readonly frameLow: THREE.BufferGeometry;
  readonly glassLow: THREE.BufferGeometry;
}

export interface ApartmentGeometrySet {
  readonly floorWood: THREE.BufferGeometry;
  readonly floorTile: THREE.BufferGeometry;
  readonly slabPlinth: THREE.BufferGeometry;
  readonly wallFull: THREE.BufferGeometry;
  readonly wallLow: THREE.BufferGeometry;
  readonly sillCaps: THREE.BufferGeometry;
  readonly baseboard: THREE.BufferGeometry;
  readonly doorFramesFull: THREE.BufferGeometry;
  readonly doorFramesLow: THREE.BufferGeometry;
  readonly doorLeavesFull: THREE.BufferGeometry;
  readonly doorLeavesLow: THREE.BufferGeometry;
  readonly doorHardware: THREE.BufferGeometry;
  readonly closetWood: THREE.BufferGeometry;
  readonly closetFabric: THREE.BufferGeometry;
  readonly closetDark: THREE.BufferGeometry;
  readonly closetMetal: THREE.BufferGeometry;
  readonly wallTileLow: THREE.BufferGeometry;
  readonly wallTileUpper: THREE.BufferGeometry;
  readonly windows: BuiltWindowGeometry;
  readonly fixtures: Partial<Record<FixtureBucketKey, THREE.BufferGeometry>>;
}

const DOOR_HEIGHT = 82.0;

/** Merges parts into one geometry and frees the per-part GPU-side buffers. */
function mergeAndDispose(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeBufferGeometries(parts);
  parts.forEach((g) => g.dispose());
  return merged;
}

function buildWindowMeshes(plan: SolvedPlan, wallTop: number): { frame: THREE.BufferGeometry; glass: THREE.BufferGeometry } {
  const frames: THREE.BufferGeometry[] = [];
  const panes: THREE.BufferGeometry[] = [];
  const full = wallTop > 60;

  const pushBox = (arr: THREE.BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number) => {
    if (w <= 0.05 || h <= 0.05 || d <= 0.05) return;
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    arr.push(g);
  };

  for (const w of plan.windows) {
    const [x0, z0, x1, z1] = w.r;
    const y0 = w.kind === 'full' ? 0 : plan.spec.sillHeight;
    const y1 = wallTop;
    if (y1 <= y0 + 1.5) continue;
    const alongX = x1 - x0 > z1 - z0;
    const span = alongX ? x1 - x0 : z1 - z0;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const ft = 1.4;
    const fd = 2.4;
    const cap = full ? ft : 0.7;
    const hIn = y1 - y0 - ft - cap;
    const bays = Math.max(1, Math.round(span / 40));
    const hasTransom = full && hIn > 48;
    const transomY = y0 + ft + hIn * 0.72;

    if (alongX) {
      pushBox(frames, span, ft, fd, cx, y0 + ft / 2, cz);
      pushBox(frames, span, cap, fd, cx, y1 - cap / 2, cz);
      pushBox(frames, ft, hIn, fd, x0 + ft / 2, y0 + ft + hIn / 2, cz);
      pushBox(frames, ft, hIn, fd, x1 - ft / 2, y0 + ft + hIn / 2, cz);
      for (let i = 1; i < bays; i++) {
        pushBox(frames, 1.15, hIn, fd * 0.92, x0 + (span * i) / bays, y0 + ft + hIn / 2, cz);
      }
      if (hasTransom) {
        pushBox(frames, span - 2 * ft, 1.05, fd * 0.88, cx, transomY, cz);
      }
      // Double-glazed low-E panes
      pushBox(panes, Math.max(0.2, span - 2 * ft), hIn, 0.55, cx, y0 + ft + hIn / 2, cz);
    } else {
      pushBox(frames, fd, ft, span, cx, y0 + ft / 2, cz);
      pushBox(frames, fd, cap, span, cx, y1 - cap / 2, cz);
      pushBox(frames, fd, hIn, ft, cx, y0 + ft + hIn / 2, z0 + ft / 2);
      pushBox(frames, fd, hIn, ft, cx, y0 + ft + hIn / 2, z1 - ft / 2);
      for (let i = 1; i < bays; i++) {
        pushBox(frames, fd * 0.92, hIn, 1.15, cx, y0 + ft + hIn / 2, z0 + (span * i) / bays);
      }
      if (hasTransom) {
        pushBox(frames, fd * 0.88, 1.05, span - 2 * ft, cx, transomY, cz);
      }
      pushBox(panes, 0.55, hIn, Math.max(0.2, span - 2 * ft), cx, y0 + ft + hIn / 2, cz);
    }
  }

  return {
    frame: mergeAndDispose(frames),
    glass: mergeAndDispose(panes),
  };
}

function buildDoorsAndHeaders(plan: SolvedPlan): {
  headerRects: Rect4[];
  framesFull: THREE.BufferGeometry;
  framesLow: THREE.BufferGeometry;
  leavesFull: THREE.BufferGeometry;
  leavesLow: THREE.BufferGeometry;
  hardware: THREE.BufferGeometry;
} {
  const X = plan.X;
  const Y = plan.Y;
  const headerRects: Rect4[] = [
    // Entry, bedroom, bath, W/D, hall closet, and bedroom closet doorway headers (82"..90"): [x0, z0, x1, z1]
    plan.entryBounds,
    [X.part_W, Y.door_top, X.bed_W, Y.door_bot],
    [X.core_W, Y.bath_door_top, X.core_W_in, Y.bath_door_bot],
    [X.core_W, Y.wd_door_top, X.core_W_in, Y.wd_door_bot],
    [X.core_W, Y.cl_door_top, X.core_W_in, Y.cl_door_bot],
    [X.bcl_W, Y.bed_S_out, X.bcl_W_in, Y.bcl_door_bot],
  ];

  const buildSet = (maxH: number) => {
    const frames: THREE.BufferGeometry[] = [];
    const leaves: THREE.BufferGeometry[] = [];
    const hw: THREE.BufferGeometry[] = [];
    const topY = Math.min(DOOR_HEIGHT, maxH);

    const addBox = (arr: THREE.BufferGeometry[], x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
      const w = Math.abs(x1 - x0);
      const h = Math.abs(y1 - y0);
      const d = Math.abs(z1 - z0);
      if (w < 0.03 || h < 0.03 || d < 0.03) return;
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      arr.push(g);
    };

    // 1. Entry door (south exterior wall): closed architectural flush wood/painted door + casing + brushed lever
    {
      const [ex0, ez0, ex1, ez1] = plan.entryBounds;
      const jamb = 0.75;
      addBox(frames, ex0 - 0.35, 0, ez0 - 0.35, ex0 + jamb, topY, ez1 + 0.35);
      addBox(frames, ex1 - jamb, 0, ez0 - 0.35, ex1 + 0.35, topY, ez1 + 0.35);
      if (maxH >= DOOR_HEIGHT) {
        addBox(frames, ex0 - 0.35, DOOR_HEIGHT - jamb, ez0 - 0.35, ex1 + 0.35, DOOR_HEIGHT + 0.35, ez1 + 0.35);
      }
      const cz = (ez0 + ez1) / 2;
      addBox(leaves, ex0 + jamb + 0.08, 0.15, cz - 0.88, ex1 - jamb - 0.08, topY - (maxH >= DOOR_HEIGHT ? jamb + 0.08 : 0), cz + 0.88);
      if (maxH >= 42) {
        // Lever handle on latch side (entry_L = west side)
        addBox(hw, ex0 + 2.2, 37.5, cz - 2.3, ex0 + 2.9, 38.3, cz + 2.3);
        addBox(hw, ex0 + 2.2, 37.7, cz - 2.3, ex0 + 4.8, 38.2, cz - 1.85);
        addBox(hw, ex0 + 2.2, 37.7, cz + 1.85, ex0 + 4.8, 38.2, cz + 2.3);
      }
    }

    // 2. Jamb casings on interior doorways (bedroom, bath, W/D, hall closet): [x0, z0, x1, z1]
    const nsOpenings: Array<{ rect: Rect4; closedLeaf?: 'single' | 'double' | 'louver' }> = [
      { rect: [X.part_W, Y.door_top, X.bed_W, Y.door_bot] },
      { rect: [X.core_W, Y.bath_door_top, X.core_W_in, Y.bath_door_bot] },
      { rect: [X.core_W, Y.wd_door_top, X.core_W_in, Y.wd_door_bot], closedLeaf: 'louver' },
      { rect: [X.core_W, Y.cl_door_top, X.core_W_in, Y.cl_door_bot], closedLeaf: 'double' },
    ];
    for (const op of nsOpenings) {
      const [ox0, oz0, ox1, oz1] = op.rect;
      const jt = 0.65;
      addBox(frames, ox0 - 0.3, 0, oz0 - 0.25, ox1 + 0.3, topY, oz0 + jt);
      addBox(frames, ox0 - 0.3, 0, oz1 - jt, ox1 + 0.3, topY, oz1 + 0.25);
      if (maxH >= DOOR_HEIGHT) {
        addBox(frames, ox0 - 0.3, DOOR_HEIGHT - jt, oz0 - 0.25, ox1 + 0.3, DOOR_HEIGHT + 0.25, oz1 + 0.25);
      }
      const cx = (ox0 + ox1) / 2;
      const leafTop = topY - (maxH >= DOOR_HEIGHT ? jt + 0.1 : 0);
      if (op.closedLeaf === 'double') {
        const midZ = (oz0 + oz1) / 2;
        addBox(leaves, cx - 0.68, 0.25, oz0 + jt + 0.08, cx + 0.68, leafTop, midZ - 0.06);
        addBox(leaves, cx - 0.68, 0.25, midZ + 0.06, cx + 0.68, leafTop, oz1 - jt - 0.08);
        if (maxH >= 42) {
          addBox(hw, ox0 - 0.55, 36.5, midZ - 1.4, cx - 0.65, 40.5, midZ - 0.9);
          addBox(hw, ox0 - 0.55, 36.5, midZ + 0.9, cx - 0.65, 40.5, midZ + 1.4);
        }
      } else if (op.closedLeaf === 'louver') {
        addBox(leaves, cx - 0.68, 0.35, oz0 + jt + 0.08, cx + 0.68, leafTop, oz1 - jt - 0.08);
        if (maxH >= 42) {
          addBox(hw, ox0 - 0.55, 36.5, oz0 + 2.2, cx - 0.65, 40.5, oz0 + 2.7);
        }
      }
    }

    // 3. Bypass sliding closet doors in bedroom closet opening
    {
      const sx0 = X.bcl_W;
      const sx1 = X.bcl_W_in;
      const sz0 = Y.bed_S_out;
      const sz1 = Y.bcl_door_bot;
      const midX = (sx0 + sx1) / 2;
      const span = sz1 - sz0;
      const leafTop = topY - (maxH >= DOOR_HEIGHT ? 0.8 : 0);
      addBox(frames, sx0 - 0.25, 0, sz1 - 0.6, sx1 + 0.25, topY, sz1 + 0.25);
      addBox(leaves, midX - 0.9, 0.25, sz0 + 0.2, midX - 0.15, leafTop, sz0 + span * 0.54);
      addBox(leaves, midX + 0.15, 0.25, sz0 + span * 0.46, midX + 0.9, leafTop, sz1 - 0.65);
    }

    return {
      frames: applyArchitecturalBoxUVs(mergeAndDispose(frames), 36),
      leaves: applyArchitecturalBoxUVs(mergeAndDispose(leaves), 36),
      hw: mergeAndDispose(hw),
    };
  };

  const fullSet = buildSet(plan.spec.wallHeight);
  const lowSet = buildSet(48);
  lowSet.hw.dispose();

  return {
    headerRects,
    framesFull: fullSet.frames,
    framesLow: lowSet.frames,
    leavesFull: fullSet.leaves,
    leavesLow: lowSet.leaves,
    hardware: fullSet.hw,
  };
}

export function buildApartmentGeometrySet(plan: SolvedPlan): ApartmentGeometrySet {
  const X = plan.X;
  const Y = plan.Y;
  const wallH = plan.spec.wallHeight;
  const sillH = plan.spec.sillHeight;

  // 1. Seamless oak & porcelain wet-zone floors + architectural slab plinth below y = 0
  const footprintRegion = polysToRegion([plan.footprint]);
  const wetRects: Rect4[] = plan.spec.wetFloors.map(([x0, x1, y0, y1]) => [
    Math.min(X[x0], X[x1]),
    Math.min(Y[y0], Y[y1]),
    Math.max(X[x0], X[x1]),
    Math.max(Y[y0], Y[y1]),
  ]);
  const wetRegion = rectsToRegion(wetRects);
  const floorWood = extrudePlanPolygons(
    regionToPolygonsWithHoles(diffRegions(footprintRegion, wetRegion)),
    -0.5,
    0.0,
    TEX_INCHES.planks,
  );
  const floorTile = extrudePlanPolygons(
    regionToPolygonsWithHoles(intersectRegions(footprintRegion, wetRegion)),
    -0.5,
    0.0,
    TEX_INCHES.tile,
  );
  const slabPlinth = extrudePlanPolygons(regionToPolygonsWithHoles(footprintRegion), -3.2, -0.48, [64, 64]);

  // 2. Walls + knee-walls below window sills + 82"..90" doorway headers
  const wallRegion = rectsToRegion(plan.walls);
  const sillWindowRects = plan.windows.filter((w) => w.kind === 'sill').map((w) => w.r);
  const sillKneeGeo = extrudePlanPolygons(
    regionToPolygonsWithHoles(rectsToRegion(sillWindowRects)),
    0,
    sillH - 0.65,
    TEX_INCHES.plaster,
  );

  const doorsInfo = buildDoorsAndHeaders(plan);
  const headerGeo = extrudePlanPolygons(
    regionToPolygonsWithHoles(rectsToRegion(doorsInfo.headerRects)),
    DOOR_HEIGHT,
    wallH,
    TEX_INCHES.plaster,
  );

  const wallPolys = regionToPolygonsWithHoles(wallRegion);
  const wallMainFull = extrudePlanPolygons(wallPolys, 0, wallH, TEX_INCHES.plaster);
  const wallMainLow = extrudePlanPolygons(wallPolys, 0, 48, TEX_INCHES.plaster);
  const wallFull = mergeBufferGeometries([wallMainFull, sillKneeGeo, headerGeo]);
  const wallLow = mergeBufferGeometries([wallMainLow, sillKneeGeo]);
  [wallMainFull, wallMainLow, sillKneeGeo, headerGeo].forEach((g) => g.dispose());

  // Overhanging honed stone window sill caps sitting atop the knee walls
  const sillCapGeos: THREE.BufferGeometry[] = [];
  for (const [x0, z0, x1, z1] of sillWindowRects) {
    const alongX = x1 - x0 > z1 - z0;
    const sx0 = alongX ? x0 : x0 - 0.35;
    const sx1 = alongX ? x1 : x1 + 0.65;
    const sz0 = alongX ? z0 - 0.35 : z0;
    const sz1 = alongX ? z1 + 0.65 : z1;
    const g = new RoundedBoxGeometry(sx1 - sx0, 0.72, sz1 - sz0, 2, 0.12);
    g.translate((sx0 + sx1) / 2, sillH - 0.32, (sz0 + sz1) / 2);
    applyArchitecturalBoxUVs(g, TEX_INCHES.quartz);
    sillCapGeos.push(g);
  }
  const sillCaps = mergeAndDispose(sillCapGeos);

  // 3. Stepped baseboards along interior room walls, clear of doorways, sliders, built-ins, and tiled bath.
  // Walls are axis-aligned rects, so a miter offset by `pad` is exactly the padded-rect union.
  const clearRegions: PlanRegion[] = [rectsToRegion([plan.entryBounds], 0.8)];
  const fullWindowRects = plan.windows.filter((w) => w.kind === 'full').map((w) => w.r);
  clearRegions.push(rectsToRegion(fullWindowRects, 0.8));
  for (const sl of plan.sliders) clearRegions.push(polylineToRegion(sl, 1.2, 'square'));
  const doorRects: Rect4[] = plan.doors.map((d) => [
    Math.min(d.hinge[0], d.closed[0]),
    Math.min(d.hinge[1], d.closed[1]),
    Math.max(d.hinge[0], d.closed[0]),
    Math.max(d.hinge[1], d.closed[1]),
  ]);
  clearRegions.push(rectsToRegion(doorRects, 1.2));
  clearRegions.push(rectsToRegion(plan.fixtures.map((fx) => fx.bounds), 0.15));
  const [bx0n, bx1n, bz0n, bz1n] = plan.spec.bathTile;
  const bathBox: Rect4 = [
    Math.min(X[bx0n], X[bx1n]),
    Math.min(Y[bz0n], Y[bz1n]),
    Math.max(X[bx0n], X[bx1n]),
    Math.max(Y[bz0n], Y[bz1n]),
  ];
  clearRegions.push(rectsToRegion([bathBox]));
  const clearUnion = unionRegions(clearRegions);

  // Inset the footprint slightly so baseboards only appear on interior faces, never the building exterior.
  const footprintBorder = polylineToRegion([...plan.footprint, plan.footprint[0]], 0.08, 'square');
  const roomInner = diffRegions(footprintRegion, footprintBorder);

  const baseSteps: THREE.BufferGeometry[] = [];
  for (const [bw, bh] of [
    [0.45, 3.2],
    [0.3, 3.85],
  ] as const) {
    const ring = diffRegions(
      intersectRegions(diffRegions(rectsToRegion(plan.walls, bw), wallRegion), roomInner),
      clearUnion,
    );
    baseSteps.push(extrudePlanPolygons(regionToPolygonsWithHoles(ring), 0, bh, [36, 36]));
  }
  const baseboard = mergeAndDispose(baseSteps);

  // 4. Floor-to-ceiling bathroom wall tile skin (split at 48" for 4' wall cut mode)
  const bathDoorIdx = plan.doors.findIndex((d) => d.name === 'bath');
  const bathDoorClear: PlanRegion = bathDoorIdx >= 0 ? rectsToRegion([doorRects[bathDoorIdx]], 1.0) : [];
  const tileBand = diffRegions(
    diffRegions(intersectRegions(rectsToRegion([bathBox]), rectsToRegion(plan.walls, 0.32)), wallRegion),
    bathDoorClear,
  );
  const tileBandPolys = regionToPolygonsWithHoles(tileBand);
  const wallTileLow = extrudePlanPolygons(tileBandPolys, 0, 47.95, TEX_INCHES.walltile);
  const wallTileUpper = extrudePlanPolygons(tileBandPolys, 47.95, wallH, TEX_INCHES.walltile);

  // 5. Window assemblies (Full & 4' cut variants)
  const winFull = buildWindowMeshes(plan, wallH);
  const winLow = buildWindowMeshes(plan, 48);

  // 6. Built-in kitchen, bath, and laundry fixtures
  const fixtures = buildAllPlanFixtures(plan);

  // 7. Closet shelves, chrome rods, hung garments, and Decora wall plates (shown with solid full walls)
  const cWood: THREE.BufferGeometry[] = [];
  const cFabric: THREE.BufferGeometry[] = [];
  const cDark: THREE.BufferGeometry[] = [];
  const cMetal: THREE.BufferGeometry[] = [];
  const addClosetInterior = (cx0: number, cz0: number, cx1: number, cz1: number) => {
    const midX = (cx0 + cx1) / 2;
    const shelf = new RoundedBoxGeometry(cx1 - cx0 - 0.6, 0.75, cz1 - cz0 - 0.6, 2, 0.1);
    shelf.translate(midX, 67.2, (cz0 + cz1) / 2);
    cWood.push(shelf);

    const rod = new THREE.CylinderGeometry(0.45, 0.45, cz1 - cz0 - 1.2, 16);
    rod.rotateX(Math.PI / 2);
    rod.translate(midX, 64.2, (cz0 + cz1) / 2);
    cMetal.push(rod);

    let idx = 0;
    for (let gz = cz0 + 5.0; gz <= cz1 - 5.0; gz += 4.2) {
      const gw = 15.5 + (idx % 3) * 1.4;
      const gh = idx % 3 === 0 ? 34.0 : 25.0;
      const garment = new RoundedBoxGeometry(gw, gh, 2.6, 2, 0.85);
      garment.translate(midX, 61.8 - gh / 2, gz);
      [cDark, cFabric, cWood][idx % 3].push(garment);

      const hook = new THREE.CylinderGeometry(0.1, 0.1, 2.8, 8);
      hook.translate(midX, 63.0, gz);
      cMetal.push(hook);
      idx++;
    }
    const stackBox = new RoundedBoxGeometry(11.5, 4.8, 12.5, 2, 0.7);
    stackBox.translate(midX, 70.0, cz0 + (cz1 - cz0) * 0.32);
    cFabric.push(stackBox);
  };
  addClosetInterior(X.bcl_W_in, Y.bed_S_out, X.bcl_E_in, Y.alc_S);
  addClosetInterior(X.core_W_in, Y.cl_N, X.cl_E_in, Y.S_in);

  const wallPlate = (wx: number, wy: number, wz: number, alongZ: boolean) => {
    const g = new THREE.BoxGeometry(alongZ ? 0.22 : 2.9, 4.6, alongZ ? 2.9 : 0.22);
    g.translate(wx, wy, wz);
    return g;
  };
  cFabric.push(
    wallPlate(X.entry_L - 5.5, 44, Y.S_in - 0.12, false),
    wallPlate(X.part_W - 0.12, 44, Y.door_top - 6.0, true),
    wallPlate(X.core_W - 0.12, 44, Y.bath_door_top - 5.0, true),
    wallPlate(X.W_in + 0.12, 14, 72, true),
    wallPlate(X.W_in + 0.12, 14, 155, true),
    wallPlate(X.part_W - 0.12, 14, 96, true),
    wallPlate(X.bed_E - 0.12, 14, 28, true),
    wallPlate(X.bed_E - 0.12, 14, 98, true),
  );

  return {
    floorWood,
    floorTile,
    slabPlinth,
    wallFull,
    wallLow,
    sillCaps,
    baseboard,
    doorFramesFull: doorsInfo.framesFull,
    doorFramesLow: doorsInfo.framesLow,
    doorLeavesFull: doorsInfo.leavesFull,
    doorLeavesLow: doorsInfo.leavesLow,
    doorHardware: doorsInfo.hardware,
    closetWood: applyArchitecturalBoxUVs(mergeAndDispose(cWood), TEX_INCHES.laminate),
    closetFabric: mergeAndDispose(cFabric),
    closetDark: mergeAndDispose(cDark),
    closetMetal: mergeAndDispose(cMetal),
    wallTileLow,
    wallTileUpper,
    windows: {
      frameFull: winFull.frame,
      glassFull: winFull.glass,
      frameLow: winLow.frame,
      glassLow: winLow.glass,
    },
    fixtures,
  };
}

/** Releases every GPU buffer owned by a geometry set built by `buildApartmentGeometrySet`. */
export function disposeApartmentGeometrySet(set: ApartmentGeometrySet): void {
  const { windows, fixtures, ...surfaces } = set;
  for (const g of [...Object.values(surfaces), ...Object.values(windows), ...Object.values(fixtures)]) {
    g?.dispose();
  }
}
