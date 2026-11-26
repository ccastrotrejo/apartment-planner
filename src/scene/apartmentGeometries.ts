import { Paths64 } from 'clipper2-js';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  applyArchitecturalBoxUVs,
  diffPaths,
  extrudePlanPolygons,
  inflatePaths,
  inflatePolyline,
  intersectPaths,
  mergeBufferGeometries,
  pathsToPolygonsWithHoles,
  rectsToPaths64,
  toPath64,
  unionPaths,
} from '../geometry/plan2d';
import { frontFrom } from '../layout/walkCheck';
import { TEX_INCHES } from './textures';
import type { Compass, Rect4, SolvedPlan, Vec2 } from '../types';

export type FixtureBucketKey =
  | 'cabWood'
  | 'cabWhite'
  | 'countertop'
  | 'ceramic'
  | 'appliance'
  | 'cooktop'
  | 'fixtureDark'
  | 'fixtureMetal'
  | 'backing'
  | 'showerGlass'
  | 'upper_cabWhite'
  | 'upper_cabWood'
  | 'upper_backsplash'
  | 'upper_appliance'
  | 'upper_fixtureDark'
  | 'upper_fixtureMetal'
  | 'upper_backing'
  | 'upper_bulb'
  | 'upper_mirror';

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
const UPPER_Y0 = 54.0;
const UPPER_Y1 = 88.0;
const UPPER_D = 13.0;

function localBox(
  u0: number,
  v0: number,
  y0: number,
  u1: number,
  v1: number,
  y1: number,
  r = 0,
): THREE.BufferGeometry {
  const ua = Math.min(u0, u1);
  const ub = Math.max(u0, u1);
  const va = Math.min(v0, v1);
  const vb = Math.max(v0, v1);
  const ya = Math.min(y0, y1);
  const yb = Math.max(y0, y1);
  const w = Math.max(0.02, ub - ua);
  const h = Math.max(0.02, yb - ya);
  const d = Math.max(0.02, vb - va);
  const rad = Math.min(r, w * 0.45, h * 0.45, d * 0.45);
  const g = rad > 0.02 ? new RoundedBoxGeometry(w, h, d, 3, rad) : new THREE.BoxGeometry(w, h, d);
  // Local frame: x = u, y = y, z = -v (front at v=0 -> z=0, back at v=D -> z=-D)
  g.translate((ua + ub) / 2, (ya + yb) / 2, -(va + vb) / 2);
  return g;
}

function localCylY(
  u: number,
  v: number,
  y0: number,
  y1: number,
  rBottom: number,
  rTop = rBottom,
  segs = 24,
): THREE.BufferGeometry {
  const h = Math.max(0.02, y1 - y0);
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, segs);
  g.translate(u, (y0 + y1) / 2, -v);
  return g;
}

function localCylV(
  u: number,
  vBack: number,
  y: number,
  length: number,
  rBack: number,
  rFront = rBack,
  segs = 24,
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rFront, rBack, length, segs);
  g.rotateX(Math.PI / 2);
  g.translate(u, y, -(vBack - length / 2));
  return g;
}

function localTube(pts: ReadonlyArray<readonly [number, number, number]>, radius: number, segs = 16): THREE.BufferGeometry {
  const vectors = pts.map(([u, v, y]) => new THREE.Vector3(u, y, -v));
  const curve = new THREE.CatmullRomCurve3(vectors, false, 'catmullrom', 0.18);
  return new THREE.TubeGeometry(curve, Math.max(12, pts.length * 5), radius, segs, false);
}

function localPlateWithCutout(
  u0: number,
  v0: number,
  y0: number,
  u1: number,
  v1: number,
  y1: number,
  hole: readonly [number, number, number, number, number],
): THREE.BufferGeometry {
  const [hu0, hv0, hu1, hv1, hr] = hole;
  // Shape in (u, v) plane: extrude upward along Y
  const shape = new THREE.Shape([
    new THREE.Vector2(u0, v0),
    new THREE.Vector2(u1, v0),
    new THREE.Vector2(u1, v1),
    new THREE.Vector2(u0, v1),
  ]);
  const r = Math.min(hr, (hu1 - hu0) * 0.45, (hv1 - hv0) * 0.45);
  const p = new THREE.Path();
  p.moveTo(hu0 + r, hv0);
  p.lineTo(hu1 - r, hv0);
  p.quadraticCurveTo(hu1, hv0, hu1, hv0 + r);
  p.lineTo(hu1, hv1 - r);
  p.quadraticCurveTo(hu1, hv1, hu1 - r, hv1);
  p.lineTo(hu0 + r, hv1);
  p.quadraticCurveTo(hu0, hv1, hu0, hv1 - r);
  p.lineTo(hu0, hv0 + r);
  p.quadraticCurveTo(hu0, hv0, hu0 + r, hv0);
  shape.holes.push(p);

  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, curveSegments: 14 });
  // ExtrudeGeometry creates (shapeX=u, shapeY=v, z=depth). Rotate -90 deg about X -> (u, depth, -v)!
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  return g;
}

function fixtureFrame(
  front: Compass,
  [x0, z0, x1, z1]: Rect4,
): {
  W: number;
  D: number;
  matrix: THREE.Matrix4;
  toUV: (x: number, z: number) => [number, number];
} {
  const m = new THREE.Matrix4();
  if (front === 'E') {
    m.makeRotationY(Math.PI / 2).setPosition(x1, 0, z1);
    return { W: z1 - z0, D: x1 - x0, matrix: m, toUV: (x, z) => [z1 - z, x1 - x] };
  }
  if (front === 'W') {
    m.makeRotationY(-Math.PI / 2).setPosition(x0, 0, z0);
    return { W: z1 - z0, D: x1 - x0, matrix: m, toUV: (x, z) => [z - z0, x - x0] };
  }
  if (front === 'N') {
    m.makeRotationY(Math.PI).setPosition(x1, 0, z0);
    return { W: x1 - x0, D: z1 - z0, matrix: m, toUV: (x, z) => [x1 - x, z - z0] };
  }
  m.makeRotationY(0).setPosition(x0, 0, z1);
  return { W: x1 - x0, D: z1 - z0, matrix: m, toUV: (x, z) => [x - x0, z1 - z] };
}

function localRect(toUV: (x: number, z: number) => [number, number], [x0, z0, x1, z1]: Rect4): Rect4 {
  const [au, av] = toUV(x0, z0);
  const [bu, bv] = toUV(x1, z1);
  return [Math.min(au, bu), Math.min(av, bv), Math.max(au, bu), Math.max(av, bv)];
}

type Buckets = Record<FixtureBucketKey, THREE.BufferGeometry[]>;

function addBacking(b: Buckets, W: number, D: number, h: number, top = UPPER_Y1): void {
  b.backing.push(localBox(0, D - 0.3, 0, W, D + 0.04, h - 0.05));
  b.upper_backing.push(localBox(0, D - 0.3, h - 0.05, W, D + 0.04, top - 0.02));
}

function addUppers(b: Buckets, W: number, D: number, y0: number): void {
  const v0 = D - UPPER_D;
  b.upper_cabWhite.push(localBox(0, v0 + 0.85, y0, W, D, UPPER_Y1, 0.08));
  const nb = Math.max(1, Math.round(W / 18.0));
  const du = W / nb;
  for (let i = 0; i < nb; i++) {
    b.upper_cabWhite.push(localBox(i * du + 0.08, v0, y0 + 0.1, (i + 1) * du - 0.08, v0 + 0.84, UPPER_Y1 - 0.1, 0.12));
  }
  if (y0 <= UPPER_Y0 + 0.1) {
    // Warm recessed under-cabinet LED light bar
    b.upper_bulb.push(localBox(1.2, v0 + 1.4, y0 - 0.24, W - 1.2, v0 + 2.1, y0 + 0.02, 0.06));
  }
}

function buildCabinets(
  b: Buckets,
  W: number,
  D: number,
  h: number,
  sink: Rect4 | null,
  endPanel: 'lo' | 'hi' | null,
): void {
  // Recessed dark toe-kick
  b.fixtureDark.push(localBox(0, 3.0, 0, W, D, 3.8));
  if (sink) {
    const [su0, sv0, su1, sv1] = sink;
    b.cabWood.push(localPlateWithCutout(0, 0.85, 3.8, W, D, h - 1.25, [su0 - 0.6, sv0 - 0.6, su1 + 0.6, sv1 + 0.6, 1.3]));
  } else {
    b.cabWood.push(localBox(0, 0.85, 3.8, W, D, h - 1.25));
  }

  const nb = Math.max(1, Math.round(W / 18.0));
  const du = W / nb;
  for (let i = 0; i < nb; i++) {
    const u0 = i * du + 0.08;
    const u1 = (i + 1) * du - 0.08;
    // Integrated panel dishwasher next to sink gets a subtle upper control reveal
    const isDishwasher = sink !== null && i === nb - 1 && nb >= 3;
    if (isDishwasher) {
      b.cabWood.push(localBox(u0, 0.08, 4.0, u1, 0.86, h - 5.2, 0.1));
      b.cabWood.push(localBox(u0, 0.08, h - 5.0, u1, 0.86, h - 2.7, 0.08));
      b.fixtureMetal.push(localBox(u0 + 2.2, 0.02, h - 3.3, u1 - 2.2, 0.2, h - 3.05, 0.04));
    } else {
      b.cabWood.push(localBox(u0, 0.08, 4.0, u1, 0.86, h - 2.7, 0.1));
    }
  }
  // Shadow finger-pull channel beneath quartz countertop
  b.fixtureDark.push(localBox(0, 0.55, h - 2.7, W, 0.92, h - 1.25));

  if (endPanel) {
    const [eu0, eu1] = endPanel === 'lo' ? [0, 0.78] : [W - 0.78, W];
    b.cabWood.push(localBox(eu0, 0, 0, eu1, D, h - 1.25, 0.08));
  }

  if (sink) {
    const [su0, sv0, su1, sv1] = sink;
    b.countertop.push(localPlateWithCutout(0, -0.65, h - 1.25, W, D, h, [su0, sv0, su1, sv1, 1.2]));

    // Stainless undermount sink walls + basin bottom + strainer basket
    const wallT = 0.45;
    b.fixtureMetal.push(
      localPlateWithCutout(
        su0 - wallT,
        sv0 - wallT,
        h - 8.4,
        su1 + wallT,
        sv1 + wallT,
        h - 1.2,
        [su0, sv0, su1, sv1, 1.1],
      ),
    );
    b.fixtureMetal.push(localBox(su0 - wallT, sv0 - wallT, h - 8.75, su1 + wallT, sv1 + wallT, h - 8.35, 0.12));
    const cu = (su0 + su1) / 2;
    const cv = (sv0 + sv1) / 2;
    b.fixtureDark.push(localCylY(cu, cv, h - 8.38, h - 8.18, 1.65, 1.65, 24));
    b.fixtureMetal.push(localCylY(cu, cv, h - 8.4, h - 8.12, 1.85, 1.95, 24));

    // Pull-down architectural gooseneck faucet + spray head + single-lever mixer + built-in soap pump
    const fv = Math.min(sv1 + 2.1, D - 1.3);
    const arc: Array<[number, number, number]> = [
      [cu, fv, h - 0.05],
      [cu, fv, h + 9.2],
    ];
    for (let i = 0; i <= 14; i++) {
      const rad = ((168 * i) / 14) * (Math.PI / 180);
      arc.push([cu, fv - 3.5 * (1 - Math.cos(rad)), h + 9.2 + 3.5 * Math.sin(rad)]);
    }
    b.fixtureMetal.push(localTube(arc, 0.42, 16));
    b.fixtureMetal.push(localCylY(cu, fv, h - 0.05, h + 1.4, 0.98, 0.82, 24));
    b.fixtureDark.push(localCylY(cu, fv - 7.0 + 0.12, h + 9.4, h + 10.6, 0.56, 0.46, 20));
    b.fixtureMetal.push(localTube([[cu + 0.8, fv, h + 2.4], [cu + 2.9, fv - 0.3, h + 4.4]], 0.2, 12));

    // Built-in deck soap dispenser + stainless bottom sink grid
    b.fixtureMetal.push(localCylY(su1 - 2.2, fv, h - 0.05, h + 2.4, 0.55, 0.42, 18));
    b.fixtureMetal.push(localTube([[su1 - 2.2, fv, h + 2.2], [su1 - 2.2, fv - 1.7, h + 2.0]], 0.14, 10));
    for (let gu = su0 + 2.2; gu <= su1 - 2.2; gu += 2.6) {
      b.fixtureMetal.push(localBox(gu - 0.06, sv0 + 1.2, h - 8.2, gu + 0.06, sv1 - 1.2, h - 8.08));
    }

    // End-grain butcher-block cutting board + chef's knife on prep zone toward range (u < su0)
    if (su0 > 18) {
      b.cabWood.push(localBox(4.5, 3.2, h, 18.5, 14.8, h + 1.05, 0.28));
      b.fixtureMetal.push(localBox(8.2, 6.2, h + 1.05, 15.2, 7.35, h + 1.14, 0.03));
      b.fixtureDark.push(localBox(5.2, 6.45, h + 1.05, 8.3, 7.15, h + 1.45, 0.15));
    }

    // Brushed-stainless espresso bar + porcelain cup + ceramic artisan fruit bowl on north counter end (u > su1)
    if (W - su1 > 22) {
      const eu = W - 9.5;
      b.appliance.push(localBox(eu - 4.4, D - 13.5, h, eu + 4.4, D - 2.5, h + 11.4, 0.45));
      b.fixtureDark.push(localBox(eu - 4.2, D - 15.2, h, eu + 4.2, D - 13.2, h + 1.1, 0.2));
      b.fixtureMetal.push(localBox(eu - 4.0, D - 15.0, h + 1.08, eu + 4.0, D - 13.3, h + 1.2, 0.05));
      b.fixtureDark.push(localCylY(eu, D - 13.9, h + 6.8, h + 8.4, 1.35, 1.45, 20));
      b.fixtureMetal.push(localTube([[eu, D - 13.9, h + 7.1], [eu - 2.4, D - 17.2, h + 6.9]], 0.24, 12));
      b.fixtureMetal.push(localTube([[eu + 3.1, D - 13.2, h + 8.2], [eu + 3.6, D - 15.0, h + 4.2]], 0.14, 10));
      b.ceramic.push(localCylY(eu, D - 14.1, h + 1.2, h + 3.2, 1.05, 1.35, 20));

      const bowlPts = [
        new THREE.Vector2(0.01, h),
        new THREE.Vector2(2.4, h),
        new THREE.Vector2(4.4, h + 1.6),
        new THREE.Vector2(4.8, h + 3.1),
        new THREE.Vector2(4.45, h + 3.2),
        new THREE.Vector2(2.2, h + 0.45),
        new THREE.Vector2(0.01, h + 0.45),
      ];
      const bowl = new THREE.LatheGeometry(bowlPts, 28);
      bowl.translate(su1 + 9.5, 0, -(D * 0.44));
      b.ceramic.push(bowl);
    }
  } else {
    b.countertop.push(localBox(0, -0.65, h - 1.25, W, D, h, 0.1));
  }

  // Backsplash GFCI duplex outlets (42.5" height)
  for (let ou = 9.0; ou < W - 6.0; ou += 32.0) {
    b.upper_cabWhite.push(localBox(ou - 1.4, D - 0.52, 40.8, ou + 1.4, D - 0.34, 45.2, 0.08));
    b.upper_fixtureDark.push(localBox(ou - 0.65, D - 0.56, 41.6, ou + 0.65, D - 0.48, 44.4, 0.04));
  }

  b.upper_backsplash.push(localBox(0, D - 0.38, h, W, D, UPPER_Y0));
  addUppers(b, W, D, UPPER_Y0);
  addBacking(b, W, D, h);
}

function buildRange(b: Buckets, W: number, D: number, h: number): void {
  b.appliance.push(localBox(0.12, 0.85, 0, W - 0.12, D, h - 0.45, 0.15));
  // Bottom warming drawer
  b.appliance.push(localBox(0.22, 0.08, 0.5, W - 0.22, 0.9, 6.7, 0.16));
  // Oven door frame around dark glass window
  b.appliance.push(localPlateWithCutout(0.22, 0.08, 7.1, W - 0.22, 0.9, 29.8, [4.2, 11.2, W - 4.2, 25.4, 0.6]));
  b.fixtureDark.push(localBox(3.8, 0.26, 10.8, W - 3.8, 0.68, 25.8, 0.1));
  // Angled front control fascia
  b.appliance.push(localBox(0.22, -0.06, 30.2, W - 0.22, 0.9, 35.5, 0.18));
  b.fixtureDark.push(localBox(W / 2 - 3.4, -0.1, 32.1, W / 2 + 3.4, 0.2, 33.8, 0.08));

  // Recessed porcelain-enamel cooktop + two continuous cast-iron grates + brass/dark burner caps
  b.cooktop.push(localBox(0.2, 0.15, h - 0.48, W - 0.2, D - 0.45, h, 0.2));
  const gv0 = 1.25;
  const gv1 = D - 1.6;
  const gy = h + 0.92;
  for (const [ga, gb] of [
    [0.9, W / 2 - 0.22],
    [W / 2 + 0.22, W - 0.9],
  ] as const) {
    b.fixtureDark.push(localBox(ga, gv0, h, gb, gv0 + 0.48, gy, 0.08));
    b.fixtureDark.push(localBox(ga, gv1 - 0.48, h, gb, gv1, gy, 0.08));
    b.fixtureDark.push(localBox(ga, gv0, h, ga + 0.48, gv1, gy, 0.08));
    b.fixtureDark.push(localBox(gb - 0.48, gv0, h, gb, gv1, gy, 0.08));
    b.fixtureDark.push(localBox((ga + gb) / 2 - 0.22, gv0, h, (ga + gb) / 2 + 0.22, gv1, gy, 0.06));
    b.fixtureDark.push(localBox(ga, (gv0 + gv1) / 2 - 0.22, h, gb, (gv0 + gv1) / 2 + 0.22, gy, 0.06));
  }
  for (const fv of [0.28, 0.72]) {
    for (const fu of [0.25, 0.75]) {
      const bu = W * fu;
      const bv = gv0 + (gv1 - gv0) * fv;
      b.fixtureMetal.push(localCylY(bu, bv, h, h + 0.35, 1.75, 1.6, 24));
      b.fixtureDark.push(localCylY(bu, bv, h + 0.34, h + 0.62, 1.55, 1.42, 24));
    }
  }

  // Tubular stainless oven bar handle + 5 control knobs
  b.fixtureMetal.push(
    localTube(
      [
        [2.8, 0.1, 27.8],
        [2.8, -1.15, 27.8],
        [W - 2.8, -1.15, 27.8],
        [W - 2.8, 0.1, 27.8],
      ],
      0.34,
      14,
    ),
  );
  for (const ku of [3.2, 6.4, W - 6.4, W - 3.2]) {
    b.fixtureMetal.push(localCylV(ku, 0.0, 32.85, 0.78, 0.72, 0.64, 20));
  }

  // Over-the-range stainless microwave + backsplash + upper cabinet
  b.upper_backsplash.push(localBox(0, D - 0.38, h, W, D, UPPER_Y0));
  b.upper_appliance.push(localBox(0.25, D - 15.6, UPPER_Y0, W - 0.25, D - 0.35, UPPER_Y0 + 16.4, 0.28));
  b.upper_fixtureDark.push(localBox(1.8, D - 15.72, UPPER_Y0 + 2.4, W - 6.8, D - 15.35, UPPER_Y0 + 13.8, 0.14));
  b.upper_fixtureDark.push(localBox(W - 5.2, D - 15.7, UPPER_Y0 + 2.4, W - 1.6, D - 15.35, UPPER_Y0 + 13.8, 0.1));
  b.upper_fixtureMetal.push(
    localTube(
      [
        [W - 5.9, D - 15.5, UPPER_Y0 + 2.6],
        [W - 5.9, D - 16.65, UPPER_Y0 + 2.6],
        [W - 5.9, D - 16.65, UPPER_Y0 + 13.6],
        [W - 5.9, D - 15.5, UPPER_Y0 + 13.6],
      ],
      0.28,
      12,
    ),
  );
  addUppers(b, W, D, UPPER_Y0 + 16.8);
  addBacking(b, W, D, h);
}

function buildFridge(b: Buckets, W: number, D: number, h: number): void {
  const pu0 = 0.8;
  const pu1 = W - 0.8;
  // Dark gasket carcass behind stainless doors
  b.fixtureDark.push(localBox(pu0 + 0.25, 1.85, 0.5, pu1 - 0.25, D, h - 0.4));
  b.appliance.push(localBox(pu0 + 0.18, 2.2, 0.4, pu1 - 0.18, D, h - 0.35, 0.15));
  // Bottom freezer drawer + upper refrigerator door
  b.appliance.push(localBox(pu0 + 0.2, 0.0, 0.8, pu1 - 0.2, 2.05, 26.8, 0.32));
  b.appliance.push(localBox(pu0 + 0.2, 0.0, 27.45, pu1 - 0.2, 2.05, h, 0.32));
  // Brushed stainless bar handles
  b.fixtureMetal.push(
    localTube(
      [
        [pu0 + 2.1, 0.0, 31.0],
        [pu0 + 2.1, -1.2, 31.0],
        [pu0 + 2.1, -1.2, 61.5],
        [pu0 + 2.1, 0.0, 61.5],
      ],
      0.34,
      14,
    ),
  );
  b.fixtureMetal.push(
    localTube(
      [
        [pu0 + 3.6, 0.0, 23.8],
        [pu0 + 3.6, -1.15, 23.8],
        [pu1 - 3.6, -1.15, 23.8],
        [pu1 - 3.6, 0.0, 23.8],
      ],
      0.32,
      14,
    ),
  );

  // Built-in rift-oak surround panels + over-fridge cabinet
  for (const [u0, u1] of [
    [0, 0.78],
    [W - 0.78, W],
  ] as const) {
    b.cabWood.push(localBox(u0, 0, 0, u1, D, h, 0.06));
    b.upper_cabWood.push(localBox(u0, 0, h, u1, D, UPPER_Y1, 0.06));
  }
  b.upper_cabWood.push(localBox(0.78, 0.85, h + 0.45, W - 0.78, D, UPPER_Y1));
  b.upper_cabWood.push(localBox(0.86, 0, h + 0.55, W / 2 - 0.08, 0.84, UPPER_Y1 - 0.1, 0.1));
  b.upper_cabWood.push(localBox(W / 2 + 0.08, 0, h + 0.55, W - 0.86, 0.84, UPPER_Y1 - 0.1, 0.1));
  addBacking(b, W, D, h);
}

function buildVanity(b: Buckets, W: number, D: number, h: number): void {
  const cu = W / 2;
  const cv = D / 2 - 1.4;
  const sw = Math.min(16.4, W - 5.8);
  const sd = Math.min(11.2, D - 7.6);

  // Tubular chrome legs
  for (const lu of [1.15, W - 1.15]) {
    for (const lv of [1.25, D - 1.25]) {
      b.fixtureMetal.push(localCylY(lu, lv, 0, 8.2, 0.42, 0.42, 20));
    }
  }

  // Greige cabinet carcass + two handle-less slab drawers
  b.cabWood.push(
    localPlateWithCutout(0.2, 0.82, 8.0, W - 0.2, D, h - 1.25, [
      cu - sw / 2 - 0.8,
      cv - sd / 2 - 0.8,
      cu + sw / 2 + 0.8,
      cv + sd / 2 + 0.8,
      1.8,
    ]),
  );
  const mid = 8.0 + (h - 1.25 - 8.0) / 2;
  b.fixtureDark.push(localBox(0.3, 0.5, mid - 0.35, W - 0.3, 0.9, mid + 0.35));
  b.fixtureDark.push(localBox(0.3, 0.5, h - 2.15, W - 0.3, 0.9, h - 1.25));
  b.cabWood.push(localBox(0.25, 0.08, 8.15, W - 0.25, 0.84, mid - 0.28, 0.1));
  b.cabWood.push(localBox(0.25, 0.08, mid + 0.28, W - 0.25, 0.84, h - 2.05, 0.1));

  // Integrated white porcelain top, backsplash lip, and sculpted basin
  b.ceramic.push(
    localPlateWithCutout(-0.25, -0.35, h - 1.25, W + 0.25, D, h, [
      cu - sw / 2,
      cv - sd / 2,
      cu + sw / 2,
      cv + sd / 2,
      1.8,
    ]),
  );
  b.ceramic.push(localBox(-0.2, D - 0.55, h - 0.05, W + 0.2, D, h + 2.8, 0.12));
  b.ceramic.push(
    localPlateWithCutout(
      cu - sw / 2 - 0.65,
      cv - sd / 2 - 0.65,
      h - 6.2,
      cu + sw / 2 + 0.65,
      cv + sd / 2 + 0.65,
      h - 1.15,
      [cu - sw / 2, cv - sd / 2, cu + sw / 2, cv + sd / 2, 1.6],
    ),
  );
  b.ceramic.push(localBox(cu - sw / 2 - 0.65, cv - sd / 2 - 0.65, h - 6.6, cu + sw / 2 + 0.65, cv + sd / 2 + 0.65, h - 6.15, 0.2));
  b.fixtureMetal.push(localCylY(cu, cv, h - 6.16, h - 5.98, 1.0, 1.0, 20));

  // Single-hole chrome basin faucet + ceramic soap dispenser & tumbler + side towel bar
  const fv = cv + sd / 2 + 1.85;
  b.fixtureMetal.push(localCylY(cu, fv, h - 0.05, h + 4.8, 0.48, 0.44, 20));
  b.fixtureMetal.push(localTube([[cu, fv, h + 4.2], [cu, fv - 3.6, h + 4.6]], 0.3, 14));
  b.fixtureMetal.push(localTube([[cu, fv, h + 4.8], [cu, fv - 1.6, h + 5.2]], 0.16, 12));

  // Vanity countertop accessories (apothecary soap bottle + ceramic tumbler)
  b.fixtureDark.push(localCylY(W - 3.4, D - 4.2, h, h + 4.6, 1.15, 1.05, 18));
  b.fixtureMetal.push(localCylY(W - 3.4, D - 4.2, h + 4.6, h + 5.6, 0.28, 0.24, 14));
  b.ceramic.push(localCylY(2.9, D - 4.4, h, h + 3.8, 1.05, 1.18, 18));

  // Chrome hand-towel bar + folded waffle-weave towel on side of vanity
  b.fixtureMetal.push(localTube([[W + 0.1, 3.0, h - 4.5], [W + 1.6, 3.0, h - 4.5], [W + 1.6, D - 3.5, h - 4.5], [W + 0.1, D - 3.5, h - 4.5]], 0.2, 10));
  b.cabWhite.push(localBox(W + 1.15, 4.4, h - 14.5, W + 2.05, D - 4.9, h - 4.15, 0.35));

  // Frameless recessed medicine mirror cabinet + dual globe vanity light bar
  b.upper_fixtureDark.push(localBox(0.7, D - 1.25, h + 8.1, W - 0.7, D, 71.9, 0.12));
  b.upper_mirror.push(localBox(0.55, D - 1.38, h + 8.0, W - 0.55, D - 1.18, 72.0, 0.08));
  b.upper_fixtureMetal.push(localBox(cu - 9.2, D - 1.1, 76.2, cu + 9.2, D, 77.6, 0.28));
  for (const du of [-5.6, 5.6]) {
    b.upper_fixtureMetal.push(localCylV(cu + du, D - 1.0, 76.9, 1.8, 0.36, 0.32, 18));
    const globe = new THREE.SphereGeometry(2.25, 24, 20);
    globe.translate(cu + du, 75.2, -(D - 2.75));
    b.upper_bulb.push(globe);
  }
}

function buildToilet(b: Buckets, bowl: Rect4, tank: Rect4): void {
  const [u0, v0, u1, v1] = bowl;
  const [tu0, tv0, tu1, tv1] = tank;
  const cu = (u0 + u1) / 2;
  const cv = (v0 + v1) / 2;
  const ru = (u1 - u0) / 2;
  const rv = (v1 - v0) / 2;

  // Sculpted skirted porcelain bowl via LatheGeometry scaled elliptically
  const lathePts = [
    new THREE.Vector2(0.01, 0),
    new THREE.Vector2(0.68, 0),
    new THREE.Vector2(0.76, 4.5),
    new THREE.Vector2(0.94, 11.2),
    new THREE.Vector2(1.0, 14.4),
    new THREE.Vector2(0.84, 14.7),
    new THREE.Vector2(0.01, 14.5),
  ];
  const skirt = new THREE.LatheGeometry(lathePts, 32);
  skirt.scale(ru, 1, rv);
  skirt.translate(cu, 0, -cv);

  // Soft-close contoured seat lid
  const lidPts = [
    new THREE.Vector2(0.01, 14.7),
    new THREE.Vector2(0.98, 14.7),
    new THREE.Vector2(0.99, 15.25),
    new THREE.Vector2(0.86, 15.55),
    new THREE.Vector2(0.01, 15.65),
  ];
  const lid = new THREE.LatheGeometry(lidPts, 32);
  lid.scale(ru, 1, rv);
  lid.translate(cu, 0, -cv);

  const bridge = localBox(u0 + 1.3, v1 - 4.5, 0, u1 - 1.3, tv1 - 0.15, 14.6, 0.8);
  const tankBody = localBox(tu0 + 0.3, tv0 + 0.2, 14.3, tu1 - 0.3, tv1 - 0.12, 28.0, 0.85);
  const tankLid = localBox(tu0, tv0, 27.95, tu1, tv1, 29.1, 0.45);
  b.ceramic.push(skirt, lid, bridge, tankBody, tankLid);

  // Dual-flush top chrome button + side lever + wall-mounted toilet-paper holder & roll
  b.fixtureMetal.push(localCylY((tu0 + tu1) / 2, (tv0 + tv1) / 2, 29.05, 29.22, 1.05, 1.05, 22));
  b.fixtureMetal.push(localBox(tu0 + 0.45, tv0 - 0.42, 26.2, tu0 + 2.2, tv0 + 0.4, 26.68, 0.12));
  b.fixtureMetal.push(localTube([[u1 + 3.2, tv1, 24.5], [u1 + 3.2, tv1 - 3.6, 24.5], [u1 + 7.4, tv1 - 3.6, 24.5]], 0.18, 10));
  const roll = new THREE.CylinderGeometry(2.1, 2.1, 4.2, 22);
  roll.rotateZ(Math.PI / 2);
  roll.translate(u1 + 5.4, 24.5, -(tv1 - 3.6));
  b.cabWhite.push(roll);
}

function buildTub(b: Buckets, W: number, D: number, h: number): void {
  // Recessed paneled front apron + deep contoured soaking basin
  b.cabWhite.push(localBox(0, 0.28, 0, W, 1.35, h - 0.85, 0.08));
  b.cabWhite.push(localBox(0, 0, 0, 2.8, 0.35, h - 0.85));
  b.cabWhite.push(localBox(W - 2.8, 0, 0, W, 0.35, h - 0.85));
  b.cabWhite.push(localBox(0, 0, 0, W, 0.35, 2.6));
  b.cabWhite.push(localBox(0, 0, h - 3.0, W, 0.35, h - 0.85));

  b.ceramic.push(
    localPlateWithCutout(0, 0, h - 1.15, W, D, h, [3.6, 3.2, W - 3.6, D - 2.8, 5.2]),
  );
  b.ceramic.push(
    localPlateWithCutout(0.2, 1.1, 2.8, W - 0.2, D - 0.1, h - 1.1, [3.9, 3.5, W - 3.9, D - 3.0, 5.0]),
  );
  b.ceramic.push(localBox(0.2, 1.1, 0, W - 0.2, D - 0.1, 2.9, 0.2));

  // Chrome drain, overflow plate, tub spout, mixer valve, rain showerhead, and frameless glass tub screen
  const mv = D / 2 + 0.15;
  b.fixtureMetal.push(localCylY(7.4, mv, 2.88, 3.08, 1.3, 1.3, 24));
  b.fixtureMetal.push(localTube([[-0.05, mv, h + 3.6], [4.8, mv, h + 3.3], [4.9, mv, h + 2.8]], 0.54, 16));

  const overflow = new THREE.CylinderGeometry(1.15, 1.15, 0.35, 24);
  overflow.rotateZ(Math.PI / 2);
  overflow.translate(3.85, h - 4.4, -mv);
  b.fixtureMetal.push(overflow);

  const valve = new THREE.CylinderGeometry(2.1, 2.1, 0.35, 28);
  valve.rotateZ(Math.PI / 2);
  valve.translate(0.18, h + 11.5, -mv);
  b.fixtureMetal.push(valve);
  b.fixtureMetal.push(localTube([[0.25, mv, h + 11.5], [1.65, mv, h + 11.5], [1.65, mv - 2.2, h + 10.6]], 0.22, 12));

  // Rain showerhead on upper layer
  b.upper_fixtureMetal.push(localTube([[-0.05, mv, 74.5], [7.5, mv, 74.5], [7.5, mv, 72.2]], 0.36, 14));
  b.upper_fixtureMetal.push(localCylY(7.5, mv, 71.5, 72.25, 3.8, 1.2, 28));

  // Frameless architectural glass shower screen at the faucet end (u = 0..24") + chrome wall clamps
  b.showerGlass.push(localBox(0.35, 1.2, h, 24.5, 1.62, 76.0, 0.08));
  b.upper_fixtureMetal.push(localBox(0.0, 0.85, h + 6.0, 1.1, 1.95, h + 8.2, 0.12));
  b.upper_fixtureMetal.push(localBox(0.0, 0.85, 68.0, 1.1, 1.95, 70.2, 0.12));

  // Shampoo & conditioner apothecary bottles on the corner tub deck + plush bath mat outside tub
  for (const [bu, bh, dark] of [
    [2.1, 6.2, true],
    [4.6, 5.8, true],
    [7.0, 4.8, false],
  ] as const) {
    const target = dark ? b.fixtureDark : b.ceramic;
    target.push(localCylY(bu, D - 2.1, h, h + bh, 1.02, 0.95, 16));
    b.fixtureMetal.push(localCylY(bu, D - 2.1, h + bh, h + bh + 0.9, 0.24, 0.2, 12));
  }
  b.cabWhite.push(localBox(W * 0.34, -18.5, 0.02, W * 0.82, -2.5, 0.32, 0.15));
}

function buildLaundry(b: Buckets, W: number, D: number, h: number): void {
  const cu = W / 2;
  b.appliance.push(localBox(0.1, 0.85, 0.2, W - 0.1, D, 37.6, 0.55));
  b.appliance.push(localBox(0.1, 0.85, 38.2, W - 0.1, D, h, 0.55));
  b.fixtureDark.push(localBox(0.35, 0.72, 37.55, W - 0.35, D - 0.4, 38.28));

  for (const yh of [18.8, 56.8]) {
    // Sculpted chrome porthole bezel + recessed tinted drum glass
    const bezel = new THREE.TorusGeometry(6.6, 0.82, 16, 36);
    bezel.translate(cu, yh, -0.78);
    b.fixtureMetal.push(bezel);
    b.fixtureDark.push(localCylV(cu, 1.1, yh, 0.65, 5.95, 5.95, 32));
  }
  // Control panels + rotary selector dials
  for (const cy of [34.4, h - 3.4]) {
    b.fixtureDark.push(localBox(cu - 3.6, 0.68, cy - 1.1, cu + 3.6, 0.92, cy + 1.1, 0.12));
    b.fixtureMetal.push(localCylV(W - 4.6, 0.95, cy, 0.65, 0.95, 0.88, 22));
  }
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
    frame: mergeBufferGeometries(frames),
    glass: mergeBufferGeometries(panes),
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
      frames: applyArchitecturalBoxUVs(mergeBufferGeometries(frames), 36),
      leaves: applyArchitecturalBoxUVs(mergeBufferGeometries(leaves), 36),
      hw: mergeBufferGeometries(hw),
    };
  };

  const fullSet = buildSet(plan.spec.wallHeight);
  const lowSet = buildSet(48);

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
  const footprintPaths = new Paths64();
  footprintPaths.push(toPath64(plan.footprint));

  const wetRects: Rect4[] = plan.spec.wetFloors.map(([x0, x1, y0, y1]) => [
    Math.min(X[x0], X[x1]),
    Math.min(Y[y0], Y[y1]),
    Math.max(X[x0], X[x1]),
    Math.max(Y[y0], Y[y1]),
  ]);
  const wetPaths = unionPaths(rectsToPaths64(wetRects));
  const woodFloorPolys = pathsToPolygonsWithHoles(diffPaths(footprintPaths, wetPaths));
  const tileFloorPolys = pathsToPolygonsWithHoles(intersectPaths(footprintPaths, wetPaths));

  const floorWood = extrudePlanPolygons(woodFloorPolys, -0.5, 0.0, TEX_INCHES.planks);
  const floorTile = extrudePlanPolygons(tileFloorPolys, -0.5, 0.0, TEX_INCHES.tile);
  const slabPlinth = extrudePlanPolygons(pathsToPolygonsWithHoles(footprintPaths), -3.2, -0.48, [64, 64]);

  // 2. Walls + knee-walls below window sills + 82"..90" doorway headers (so walls & knee-walls share See-through!)
  const wallPaths = unionPaths(rectsToPaths64(plan.walls));
  const sillWindowRects = plan.windows.filter((w) => w.kind === 'sill').map((w) => w.r);
  const sillKneeGeo = extrudePlanPolygons(
    pathsToPolygonsWithHoles(unionPaths(rectsToPaths64(sillWindowRects))),
    0,
    sillH - 0.65,
    TEX_INCHES.plaster,
  );

  const doorsInfo = buildDoorsAndHeaders(plan);
  const headerGeo = extrudePlanPolygons(
    pathsToPolygonsWithHoles(unionPaths(rectsToPaths64(doorsInfo.headerRects))),
    DOOR_HEIGHT,
    wallH,
    TEX_INCHES.plaster,
  );

  const wallPolys = pathsToPolygonsWithHoles(wallPaths);
  const wallMainFull = extrudePlanPolygons(wallPolys, 0, wallH, TEX_INCHES.plaster);
  const wallMainLow = extrudePlanPolygons(wallPolys, 0, 48, TEX_INCHES.plaster);
  const wallFull = mergeBufferGeometries([wallMainFull, sillKneeGeo, headerGeo]);
  const wallLow = mergeBufferGeometries([wallMainLow, sillKneeGeo]);

  // Overhanging honed stone window sill caps sitting atop the knee walls
  const sillCapGeos: THREE.BufferGeometry[] = [];
  for (const r of sillWindowRects) {
    const [x0, z0, x1, z1] = r;
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
  const sillCaps = mergeBufferGeometries(sillCapGeos);

  // 3. Stepped baseboards along interior room walls, clear of doorways, sliders, built-ins, and tiled bath
  const clearParts: Paths64[] = [];
  clearParts.push(inflatePaths(rectsToPaths64([plan.entryBounds]), 0.8, 'miter'));
  for (const w of plan.windows) {
    if (w.kind === 'full') clearParts.push(inflatePaths(rectsToPaths64([w.r]), 0.8, 'miter'));
  }
  for (const sl of plan.sliders) {
    clearParts.push(inflatePolyline(sl, 1.2, 'square'));
  }
  for (const d of plan.doors) {
    const dx0 = Math.min(d.hinge[0], d.closed[0]);
    const dz0 = Math.min(d.hinge[1], d.closed[1]);
    const dx1 = Math.max(d.hinge[0], d.closed[0]);
    const dz1 = Math.max(d.hinge[1], d.closed[1]);
    clearParts.push(inflatePaths(rectsToPaths64([[dx0, dz0, dx1, dz1]]), 1.2, 'miter'));
  }
  for (const fx of plan.fixtures) {
    clearParts.push(inflatePaths(rectsToPaths64([fx.bounds]), 0.15, 'miter'));
  }
  const [bx0n, bx1n, bz0n, bz1n] = plan.spec.bathTile;
  const bathBox: Rect4 = [
    Math.min(X[bx0n], X[bx1n]),
    Math.min(Y[bz0n], Y[bz1n]),
    Math.max(X[bx0n], X[bx1n]),
    Math.max(Y[bz0n], Y[bz1n]),
  ];
  clearParts.push(rectsToPaths64([bathBox]));

  const allClear = new Paths64();
  for (const cp of clearParts) allClear.push(...cp);
  const clearUnion = unionPaths(allClear);
  const roomInner = inflatePaths(footprintPaths, -0.08, 'miter');

  const baseSteps: THREE.BufferGeometry[] = [];
  for (const [bw, bh] of [
    [0.45, 3.2],
    [0.3, 3.85],
  ] as const) {
    const ring = diffPaths(
      intersectPaths(diffPaths(inflatePaths(wallPaths, bw, 'miter'), wallPaths), roomInner),
      clearUnion,
    );
    baseSteps.push(extrudePlanPolygons(pathsToPolygonsWithHoles(ring), 0, bh, [36, 36]));
  }
  const baseboard = mergeBufferGeometries(baseSteps);

  // 4. Floor-to-ceiling bathroom wall tile skin (split at 48" for 4' wall cut mode)
  const bathDoor = plan.doors.find((d) => d.name === 'bath');
  const bathDoorClear = bathDoor
    ? inflatePaths(
        rectsToPaths64([
          [
            Math.min(bathDoor.hinge[0], bathDoor.closed[0]),
            Math.min(bathDoor.hinge[1], bathDoor.closed[1]),
            Math.max(bathDoor.hinge[0], bathDoor.closed[0]),
            Math.max(bathDoor.hinge[1], bathDoor.closed[1]),
          ],
        ]),
        1.0,
        'miter',
      )
    : new Paths64();
  const tileBand = diffPaths(
    diffPaths(intersectPaths(rectsToPaths64([bathBox]), inflatePaths(wallPaths, 0.32, 'miter')), wallPaths),
    bathDoorClear,
  );
  const tileBandPolys = pathsToPolygonsWithHoles(tileBand);
  const wallTileLow = extrudePlanPolygons(tileBandPolys, 0, 47.95, TEX_INCHES.walltile);
  const wallTileUpper = extrudePlanPolygons(tileBandPolys, 47.95, wallH, TEX_INCHES.walltile);

  // 5. Window assemblies (Full & 4' cut variants)
  const winFull = buildWindowMeshes(plan, wallH);
  const winLow = buildWindowMeshes(plan, 48);

  // 6. Detailed multi-material built-in kitchen, bath, and laundry fixtures
  const bucketKeys: FixtureBucketKey[] = [
    'cabWood',
    'cabWhite',
    'countertop',
    'ceramic',
    'appliance',
    'cooktop',
    'fixtureDark',
    'fixtureMetal',
    'backing',
    'showerGlass',
    'upper_cabWhite',
    'upper_cabWood',
    'upper_backsplash',
    'upper_appliance',
    'upper_fixtureDark',
    'upper_fixtureMetal',
    'upper_backing',
    'upper_bulb',
    'upper_mirror',
  ];
  const worldBuckets: Buckets = Object.fromEntries(bucketKeys.map((k) => [k, []])) as unknown as Buckets;

  const placeFixture = (front: Compass, bounds: Rect4, fn: (local: Buckets, W: number, D: number, toUV: (x: number, z: number) => [number, number]) => void) => {
    const { W, D, matrix, toUV } = fixtureFrame(front, bounds);
    const local: Buckets = Object.fromEntries(bucketKeys.map((k) => [k, []])) as unknown as Buckets;
    fn(local, W, D, toUV);
    for (const k of bucketKeys) {
      for (const g of local[k]) {
        g.applyMatrix4(matrix);
        worldBuckets[k].push(g);
      }
    }
  };

  const exposedEnd = (front: Compass, [x0, z0, x1, z1]: Rect4, selfIdx: number): 'lo' | 'hi' | null => {
    const strips: Record<Compass, readonly [Rect4, Rect4]> = {
      E: [
        [x0, z1, x1, z1 + 1],
        [x0, z0 - 1, x1, z0],
      ],
      W: [
        [x0, z0 - 1, x1, z0],
        [x0, z1, x1, z1 + 1],
      ],
      N: [
        [x1, z0, x1 + 1, z1],
        [x0 - 1, z0, x0, z1],
      ],
      S: [
        [x0 - 1, z0, x0, z1],
        [x1, z0, x1 + 1, z1],
      ],
    };
    const [lo, hi] = strips[front];
    const free = ([sx0, sz0, sx1, sz1]: Rect4) =>
      !plan.fixtures.some((other, idx) => {
        if (idx === selfIdx) return false;
        const [ox0, oz0, ox1, oz1] = other.bounds;
        const ix = Math.max(0, Math.min(sx1, ox1) - Math.max(sx0, ox0));
        const iz = Math.max(0, Math.min(sz1, oz1) - Math.max(sz0, oz0));
        return ix * iz > 0.5;
      });
    return free(hi) ? 'hi' : free(lo) ? 'lo' : null;
  };

  const tankBounds = plan.fixtures.find((f) => f.def.name.includes('tank'))?.bounds;
  const wdHinge = plan.doors.find((d) => d.name === 'W/D')?.hinge;

  plan.fixtures.forEach((fx, idx) => {
    const kind = fx.def.kind;
    const b = fx.bounds;
    const h = fx.def.h;
    if (kind === 'cabinets' && fx.def.front) {
      const end = exposedEnd(fx.def.front, b, idx);
      placeFixture(fx.def.front, b, (L, W, D, uv) => {
        buildCabinets(L, W, D, h, fx.sinkBounds ? localRect(uv, fx.sinkBounds) : null, end);
      });
    } else if (kind === 'range' && fx.def.front) {
      placeFixture(fx.def.front, b, (L, W, D) => buildRange(L, W, D, h));
    } else if (kind === 'fridge' && fx.def.front) {
      placeFixture(fx.def.front, b, (L, W, D) => buildFridge(L, W, D, h));
    } else if (kind === 'vanity' && fx.def.front) {
      placeFixture(fx.def.front, b, (L, W, D) => buildVanity(L, W, D, h));
    } else if (kind === 'tub' && fx.def.front) {
      placeFixture(fx.def.front, b, (L, W, D) => buildTub(L, W, D, h));
    } else if (kind === 'toilet' && tankBounds) {
      const c: Vec2 = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
      const tc: Vec2 = [(tankBounds[0] + tankBounds[2]) / 2, (tankBounds[1] + tankBounds[3]) / 2];
      const opp: Record<Compass, Compass> = { E: 'W', W: 'E', N: 'S', S: 'N' };
      const front = opp[frontFrom(c, tc)];
      const both: Rect4 = [
        Math.min(b[0], tankBounds[0]),
        Math.min(b[1], tankBounds[1]),
        Math.max(b[2], tankBounds[2]),
        Math.max(b[3], tankBounds[3]),
      ];
      placeFixture(front, both, (L, _W, _D, uv) => buildToilet(L, localRect(uv, b), localRect(uv, tankBounds)));
    } else if (kind === 'appliance') {
      const c: Vec2 = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
      const front = fx.def.front ?? (wdHinge ? frontFrom(c, wdHinge) : 'S');
      placeFixture(front, b, (L, W, D) => buildLaundry(L, W, D, h));
    }
  });

  // Brushed metal threshold transition strips under wet-room doors
  for (const d of plan.doors) {
    if (plan.spec.wetDoors.includes(d.name)) {
      const strip = inflatePolyline([d.hinge, d.closed], 0.34, 'butt');
      worldBuckets.fixtureMetal.push(extrudePlanPolygons(pathsToPolygonsWithHoles(strip), 0, 0.1, [24, 24]));
    }
  }

  // Built-in closet shelves, chrome hanging rods, and hung garments (shown with solid full walls)
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
      if (idx % 3 === 0) cDark.push(garment);
      else if (idx % 3 === 1) cFabric.push(garment);
      else cWood.push(garment);

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
  const closetWood = applyArchitecturalBoxUVs(mergeBufferGeometries(cWood), TEX_INCHES.laminate);
  const closetFabric = mergeBufferGeometries(cFabric);
  const closetDark = mergeBufferGeometries(cDark);
  const closetMetal = mergeBufferGeometries(cMetal);

  // Subtle Decora wall switches & outlets rendered on solid walls only
  const addWallPlate = (wx: number, wy: number, wz: number, alongZ: boolean) => {
    const g = new THREE.BoxGeometry(alongZ ? 0.22 : 2.9, 4.6, alongZ ? 2.9 : 0.22);
    g.translate(wx, wy, wz);
    return g;
  };
  const wallPlates = mergeBufferGeometries([
    addWallPlate(X.entry_L - 5.5, 44, Y.S_in - 0.12, false),
    addWallPlate(X.part_W - 0.12, 44, Y.door_top - 6.0, true),
    addWallPlate(X.core_W - 0.12, 44, Y.bath_door_top - 5.0, true),
    addWallPlate(X.W_in + 0.12, 14, 72, true),
    addWallPlate(X.W_in + 0.12, 14, 155, true),
    addWallPlate(X.part_W - 0.12, 14, 96, true),
    addWallPlate(X.bed_E - 0.12, 14, 28, true),
    addWallPlate(X.bed_E - 0.12, 14, 98, true),
  ]);
  const closetFabricWithPlates = mergeBufferGeometries([closetFabric, wallPlates]);

  const uvSizeByBucket: Partial<Record<FixtureBucketKey, readonly [number, number]>> = {
    cabWood: TEX_INCHES.laminate,
    upper_cabWood: TEX_INCHES.laminate,
    countertop: TEX_INCHES.quartz,
    upper_backsplash: TEX_INCHES.backsplash,
    appliance: TEX_INCHES.stainless,
    upper_appliance: TEX_INCHES.stainless,
  };

  const fixtures: Partial<Record<FixtureBucketKey, THREE.BufferGeometry>> = {};
  for (const k of bucketKeys) {
    if (worldBuckets[k].length === 0) continue;
    const merged = mergeBufferGeometries(worldBuckets[k]);
    worldBuckets[k].forEach((g) => g.dispose());
    const uvScale = uvSizeByBucket[k];
    if (uvScale) applyArchitecturalBoxUVs(merged, uvScale);
    fixtures[k] = merged;
  }

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
    closetWood,
    closetFabric: closetFabricWithPlates,
    closetDark,
    closetMetal,
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
