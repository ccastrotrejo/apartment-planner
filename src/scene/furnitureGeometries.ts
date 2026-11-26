import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { FURNITURE_CATALOG } from '../furniture/catalog';
import { applyArchitecturalBoxUVs, mergeBufferGeometries } from '../geometry/plan2d';
import { createRoleMaterial } from './materials';
import { TEX_INCHES } from './textures';
import type { MaterialRole } from '../types';

export interface FurniturePartDef {
  readonly geometry: THREE.BufferGeometry;
  readonly withPlanEdges: boolean;
  edgesCache?: THREE.BufferGeometry | null;
  readonly color: string;
  readonly role: MaterialRole;
}

export function getPartPlanEdges(part: FurniturePartDef): THREE.BufferGeometry | null {
  if (!part.withPlanEdges) return null;
  if (part.edgesCache === undefined) {
    part.edgesCache = new THREE.EdgesGeometry(part.geometry, 34);
  }
  return part.edgesCache;
}

const PART_CACHE = new Map<string, FurniturePartDef[]>();

function rbox(
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  r = 0.25,
  segs = 2,
): THREE.BufferGeometry {
  const w = Math.max(0.02, Math.abs(x1 - x0));
  const h = Math.max(0.02, Math.abs(y1 - y0));
  const d = Math.max(0.02, Math.abs(z1 - z0));
  const rad = Math.min(r, w * 0.46, h * 0.46, d * 0.46);
  const g = rad > 0.02 ? new RoundedBoxGeometry(w, h, d, segs, rad) : new THREE.BoxGeometry(w, h, d);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

/** Softly crowned pillow/cushion geometry centered between (x0..x1, y0..y1, z0..z1). */
function cushion(
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  r = 1.4,
  crown = 0.4,
): THREE.BufferGeometry {
  const w = Math.abs(x1 - x0);
  const h = Math.abs(y1 - y0);
  const d = Math.abs(z1 - z0);
  const rad = Math.min(r, w * 0.46, h * 0.46, d * 0.46);
  const g = new RoundedBoxGeometry(w, h, d, 3, rad);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const nx = pos.getX(i) / (w / 2);
    const ny = pos.getY(i) / (h / 2);
    const nz = pos.getZ(i) / (d / 2);
    const bulge = Math.max(0, 1 - 0.55 * (nx * nx + nz * nz));
    if (ny > 0) {
      pos.setY(i, pos.getY(i) + crown * bulge * ny);
    }
  }
  g.computeVertexNormals();
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

function cylY(
  x: number,
  z: number,
  y0: number,
  y1: number,
  rBot: number,
  rTop = rBot,
  segs = 22,
): THREE.BufferGeometry {
  const h = Math.max(0.02, y1 - y0);
  const g = new THREE.CylinderGeometry(rTop, rBot, h, segs);
  g.translate(x, (y0 + y1) / 2, z);
  return g;
}

function strut(
  p0: readonly [number, number, number],
  p1: readonly [number, number, number],
  r0: number,
  r1 = r0,
  segs = 18,
): THREE.BufferGeometry {
  const a = new THREE.Vector3(p0[0], p0[1], p0[2]);
  const b = new THREE.Vector3(p1[0], p1[1], p1[2]);
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = Math.max(0.02, dir.length());
  const g = new THREE.CylinderGeometry(r1, r0, len, segs);
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  const m = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return g;
}

function tubePath(
  pts: ReadonlyArray<readonly [number, number, number]>,
  radius: number,
  segs = 14,
  closed = false,
): THREE.BufferGeometry {
  const v = pts.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const curve = new THREE.CatmullRomCurve3(v, closed, 'catmullrom', 0.15);
  return new THREE.TubeGeometry(curve, Math.max(12, pts.length * 6), radius, segs, closed);
}

function makePart(
  geos: THREE.BufferGeometry[],
  color: string,
  role: MaterialRole,
  withPlanEdges = true,
): FurniturePartDef {
  const merged = mergeBufferGeometries(geos);
  geos.forEach((g) => g.dispose());
  const uvSize =
    role === 'wood' || role === 'walnut' || role === 'oak'
      ? TEX_INCHES.walnut
      : role === 'rattan'
        ? TEX_INCHES.cane
        : role === 'rug' || role === 'knit'
          ? TEX_INCHES.rug
          : TEX_INCHES.fabric;
  applyArchitecturalBoxUVs(merged, uvSize);
  return { geometry: merged, withPlanEdges, color, role };
}

function buildSectional(): FurniturePartDef[] {
  const c = FURNITURE_CATALOG.sectional.colors;
  // W=100 (-50..50), D=64 (-32..32), back at z=-32, sofa front at z=+6, chaise (-50..-17) front at z=+32
  const lh = 4.0;
  const sh = 18.0;
  const uph: THREE.BufferGeometry[] = [];

  // Upholstered base deck, backrest frame, and right track arm (x = +44..+50)
  uph.push(rbox(-50, lh, -32, -17, lh + 4.4, 32, 1.1));
  uph.push(rbox(-18, lh, -32, 50, lh + 4.4, 6, 1.1));
  uph.push(rbox(-50, lh + 1.0, -32, 50, 30.2, -26.5, 1.15));
  uph.push(rbox(44, lh, -32, 50, 24.0, 6, 1.2));

  // Plump individual crowned seat cushions (chaise + two sofa seats)
  uph.push(cushion(-49.8, lh + 4.1, -25.5, -17.15, sh, 32, 1.55, 0.55));
  uph.push(cushion(-16.85, lh + 4.1, -25.5, 13.4, sh, 6, 1.55, 0.55));
  uph.push(cushion(13.7, lh + 4.1, -25.5, 44.0, sh, 6, 1.55, 0.55));

  // Subtle upholstered tuft buttons along the seats
  const buttonProto = new THREE.SphereGeometry(0.38, 10, 8);
  buttonProto.scale(1, 0.35, 1);
  for (const bx of [-41.5, -33.5, -25.5, -9, -1.5, 6, 21.5, 29, 36.5]) {
    for (const bz of [-18, -9, 0, 9, 18, 25]) {
      if (bz <= 1.5 || bx < -18) {
        const btn = buttonProto.clone();
        btn.translate(bx, sh + 0.12, bz);
        uph.push(btn);
      }
    }
  }
  buttonProto.dispose();

  // Three reclined plush back cushions reaching y = 33"
  const backW = 93.6 / 3;
  for (let i = 0; i < 3; i++) {
    const x0 = -49.6 + i * backW + 0.15;
    const x1 = -49.6 + (i + 1) * backW - 0.15;
    const bc = cushion(x0, 0, -2.5, x1, 15.2, 2.5, 1.65, 0.45);
    bc.rotateX(0.11);
    bc.translate(0, sh - 0.4, -24.8);
    uph.push(bc);
  }

  // Piped cylindrical bolster against the right arm
  const bolster = new THREE.CapsuleGeometry(3.4, 15.5, 10, 22);
  bolster.rotateX(Math.PI / 2);
  bolster.translate(40.6, sh + 3.1, -10.5);
  uph.push(bolster);

  // Accent throw pillow angled into the chaise corner
  const throwPillow = cushion(-7.5, 0, -2.2, 7.5, 14.5, 2.2, 1.6, 0.55);
  throwPillow.rotateX(0.22);
  throwPillow.rotateY(0.45);
  throwPillow.translate(-40.5, sh - 0.2, -21.2);

  // Six turned tapered walnut legs
  const legs = [
    [-47.8, -29.8],
    [47.8, -29.8],
    [47.8, 3.8],
    [-14.8, 3.8],
    [-47.8, 29.8],
    [-19.2, 29.8],
  ].map(([lx, lz]) => cylY(lx, lz, 0, lh + 0.4, 0.68, 1.12, 20));

  return [
    makePart(uph, c.upholstery, 'fabric', true),
    makePart([throwPillow], c.pillow, 'linen', false),
    makePart(legs, c.legs, 'walnut', false),
  ];
}

function buildCoffeeTable(lifted: boolean): FurniturePartDef[] {
  const spec = FURNITURE_CATALOG[lifted ? 'coffee-table-open' : 'coffee-table'];
  const c = spec.colors;
  // Closed: W=42 (-21..21), D=21 (-10.5..10.5). Lifted: D=29 (-14.5..14.5); back stays put so box is at z = -14.5..6.5, top at -6.5..14.5
  const boxZ0 = lifted ? -14.5 : -10.5;
  const boxZ1 = lifted ? 6.5 : 10.5;
  const topZ0 = lifted ? -6.5 : -10.5;
  const topZ1 = lifted ? 14.5 : 10.5;
  const lh = 5.0;
  const caseTop = 17.15;
  const topY1 = lifted ? 25.0 : 18.5;

  const body: THREE.BufferGeometry[] = [];
  if (lifted) {
    // Open storage box walls + bottom + center divider
    const wt = 0.85;
    body.push(rbox(-20.85, lh, boxZ0, 20.85, lh + 0.9, boxZ1, 0.2));
    body.push(rbox(-20.85, lh, boxZ0, 20.85, caseTop, boxZ0 + wt, 0.18));
    body.push(rbox(-20.85, lh, boxZ1 - wt, 20.85, caseTop, boxZ1, 0.18));
    body.push(rbox(-20.85, lh, boxZ0, -20.85 + wt, caseTop, boxZ1, 0.18));
    body.push(rbox(20.85 - wt, lh, boxZ0, 20.85, caseTop, boxZ1, 0.18));
    body.push(rbox(-0.35, lh + 0.8, boxZ0 + wt, 0.35, caseTop - 0.6, boxZ1 - wt, 0.1));
  } else {
    body.push(rbox(-20.85, lh, boxZ0 + 0.1, 20.85, caseTop, boxZ1 - 0.1, 0.28));
  }

  const top = [rbox(-21, topY1 - 1.2, topZ0, 21, topY1, topZ1, 0.24)];

  const brass: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x0 = sx * 18.4;
      const z0 = (boxZ0 + boxZ1) / 2 + sz * 8.0;
      const x1 = x0 + sx * 1.15;
      const z1 = z0 + sz * 1.05;
      const xm = x0 + (x1 - x0) * 0.78;
      const zm = z0 + (z1 - z0) * 0.78;
      body.push(strut([x0, lh + 0.2, z0], [xm, 1.1, zm], 0.78, 0.48, 18));
      brass.push(strut([xm, 1.12, zm], [x1, 0.0, z1], 0.47, 0.38, 18));
    }
  }

  const metal: THREE.BufferGeometry[] = [rbox(-19.5, caseTop - 0.1, boxZ0 + 1.2, 19.5, caseTop + 0.2, boxZ1 - 1.2, 0.1)];
  if (lifted) {
    for (const sx of [-18.8, 18.8]) {
      metal.push(strut([sx, caseTop - 2.2, boxZ0 + 7.5], [sx, topY1 - 1.15, topZ0 + 7.5], 0.24, 0.22, 12));
      metal.push(strut([sx, caseTop - 2.2, boxZ0 + 13.5], [sx, topY1 - 1.15, topZ0 + 13.5], 0.22, 0.20, 12));
    }
  }

  return [
    makePart(top, c.top, 'walnut', true),
    makePart(body, c.body, 'walnut', true),
    makePart(metal, c.metal, 'darkMetal', false),
    makePart(brass, c.brass, 'brass', false),
  ];
}

function buildWallTv(): FurniturePartDef[] {
  const c = FURNITURE_CATALOG['tv-stand'].colors;
  // W=57.1 (-28.55..28.55), D=3.4 (-1.7..1.7, back against wall at z=-1.7, screen at +1.7), Y=27.65..60.35
  const hw = 28.55;
  const y0 = 27.65;
  const y1 = 60.35;
  const zFront = 1.7;
  const zBack = -1.7;

  const bezel = [
    // Ultra-thin OLED panel enclosure + slim front bezel frame + lower rear electronics module
    rbox(-hw, y0, zFront - 0.4, hw, y1, zFront, 0.12),
    rbox(-hw * 0.68, y0 + 1.4, zFront - 1.45, hw * 0.68, 46.2, zFront - 0.35, 0.3),
    rbox(-3.2, y0 - 0.04, zFront - 0.25, 3.2, y0 + 0.25, zFront + 0.02, 0.06),
  ];
  const screen = [rbox(-hw + 0.38, y0 + 0.48, zFront - 0.05, hw - 0.38, y1 - 0.36, zFront + 0.03, 0.04)];
  const metal = [
    rbox(-9.5, 40.0, zBack, 9.5, 41.4, zBack + 0.35, 0.08),
    rbox(-9.5, 46.6, zBack, 9.5, 48.0, zBack + 0.35, 0.08),
    rbox(-7.0, 38.8, zFront - 1.75, -5.8, 49.2, zFront - 1.35, 0.08),
    rbox(5.8, 38.8, zFront - 1.75, 7.0, 49.2, zFront - 1.35, 0.08),
    strut([0, 46.6, zBack + 0.25], [-3.4, 45.2, zBack + 1.1], 0.34, 0.32, 12),
    strut([-3.4, 45.2, zBack + 1.1], [0, 44.0, zFront - 1.55], 0.32, 0.3, 12),
    strut([0, 41.4, zBack + 0.25], [3.4, 42.8, zBack + 1.1], 0.34, 0.32, 12),
    strut([3.4, 42.8, zBack + 1.1], [0, 44.0, zFront - 1.55], 0.32, 0.3, 12),
  ];

  return [
    makePart(bezel, c.bezel, 'bezel', true),
    makePart(screen, c.screen, 'screen', false),
    makePart(metal, c.metal, 'darkMetal', false),
  ];
}

function buildTierShelf(): FurniturePartDef[] {
  const c = FURNITURE_CATALOG['tier-shelf'].colors;
  // W=16 (-8..8), D=12 (-6..6), H=28
  const posts: THREE.BufferGeometry[] = [];
  for (const sx of [-7.35, 7.35]) {
    for (const sz of [-5.35, 5.35]) {
      posts.push(cylY(sx, sz, 0, 27.5, 0.4, 0.48, 18));
      const finial = new THREE.SphereGeometry(0.48, 14, 12);
      finial.translate(sx, 27.52, sz);
      posts.push(finial);
    }
  }
  const shelves: THREE.BufferGeometry[] = [];
  for (const sy of [3.0, 14.5, 27.4]) {
    shelves.push(rbox(-8, sy - 0.65, -6, 8, sy, 6, 0.18));
    shelves.push(rbox(-7.3, sy - 1.25, -5.7, 7.3, sy - 0.6, -5.25, 0.06));
    shelves.push(rbox(-7.3, sy - 1.25, 5.25, 7.3, sy - 0.6, 5.7, 0.06));
    shelves.push(rbox(-7.7, sy - 1.25, -5.3, -7.25, sy - 0.6, 5.3, 0.06));
    shelves.push(rbox(7.25, sy - 1.25, -5.3, 7.7, sy - 0.6, 5.3, 0.06));
  }
  return [
    makePart(shelves, c.wood, 'walnut', true),
    makePart(posts, c.posts, 'walnut', false),
  ];
}

function buildTorchiere(): FurniturePartDef[] {
  const c = FURNITURE_CATALOG['torchiere-lamp'].colors;
  const metal = [
    cylY(0, 0, 0, 0.85, 5.5, 5.35, 36),
    cylY(0, 0, 0.8, 1.9, 3.4, 0.78, 32),
    cylY(0, 0, 1.8, 64.2, 0.44, 0.44, 22),
    cylY(0, 0, 41.5, 42.7, 0.68, 0.68, 22),
    cylY(0, 0, 63.6, 64.25, 2.6, 2.3, 32),
  ];
  const bowlPts = [
    new THREE.Vector2(2.3, 64.0),
    new THREE.Vector2(5.4, 66.8),
    new THREE.Vector2(7.5, 69.85),
    new THREE.Vector2(7.2, 70.0),
    new THREE.Vector2(5.1, 67.0),
    new THREE.Vector2(2.0, 64.3),
  ];
  const shade = [new THREE.LatheGeometry(bowlPts, 40)];
  const bulb = new THREE.SphereGeometry(1.5, 18, 14);
  bulb.scale(1, 0.75, 1);
  bulb.translate(0, 65.8, 0);

  return [
    makePart(metal, c.metal, 'chrome', false),
    makePart(shade, c.shade, 'shade', true),
    makePart([bulb], c.bulb, 'bulb', false),
  ];
}

function buildStandingDesk(): FurniturePartDef[] {
  const c = FURNITURE_CATALOG['standing-desk'].colors;
  // W=55 (-27.5..27.5), D=28 (-14..14, front at +14, back at -14), desk top at y=29, monitors to y=49
  const H = 29.0;
  const t = 1.1;
  const top = [rbox(-27.5, H - t, -14, 27.5, H, 14, 0.25)];

  const frame: THREE.BufferGeometry[] = [];
  for (const sx of [-22.1, 22.1]) {
    frame.push(rbox(sx - 1.35, 0.2, -12, sx + 1.35, 1.15, 12, 0.35));
    frame.push(cylY(sx, -10.4, 0, 0.25, 0.85, 0.85, 18));
    frame.push(cylY(sx, 10.4, 0, 0.25, 0.85, 0.85, 18));
    frame.push(rbox(sx - 1.05, 1.0, -0.85, sx + 1.05, 15.8, 0.85, 0.16));
    frame.push(rbox(sx - 1.2, 14.5, -1.0, sx + 1.2, H - t + 0.05, 1.0, 0.18));
    frame.push(rbox(sx - 1.2, H - t - 1.35, -11.5, sx + 1.2, H - t + 0.05, 11.5, 0.15));
  }
  // Crossbeam, cable tray, controller handset, and dual monitor arm post
  frame.push(rbox(-22.1, H - t - 1.75, -1.2, 22.1, H - t + 0.05, 1.2, 0.1));
  frame.push(rbox(-13, H - t - 3.1, -11.8, 13, H - t - 0.4, -7.6, 0.2));
  frame.push(rbox(17.5, H - t - 0.65, 11.2, 21.2, H - t + 0.02, 13.7, 0.12));
  frame.push(rbox(-2.2, H - t - 1.4, -14, 2.2, H + 0.8, -11.6, 0.2));
  frame.push(cylY(0, -12.7, H, H + 11.5, 0.68, 0.68, 22));

  // Desk mat + keyboard + mouse
  const matGeo = [rbox(-14, H, -0.5, 14, H + 0.12, 11.2, 0.05)];
  const keycaps = [rbox(-7.5, H + 0.42, 3.8, 4.1, H + 0.56, 8.1, 0.06)];
  const bezels: THREE.BufferGeometry[] = [
    rbox(-7.8, H + 0.1, 3.5, 4.4, H + 0.46, 8.4, 0.12),
    cushion(7.2, H + 0.1, 4.4, 9.6, H + 0.95, 8.2, 0.75, 0.22),
  ];
  const screens: THREE.BufferGeometry[] = [];

  for (const m of [
    { dx: -13.2, w: 23.5, h: 13.8, yaw: 0.11 },
    { dx: 13.2, w: 26.5, h: 15.2, yaw: -0.11 },
  ]) {
    const mz = -7.8;
    const yBot = 49.0 - m.h;
    const yMid = yBot + m.h * 0.48;
    frame.push(
      tubePath(
        [
          [0, yMid - 1.1, -12.7],
          [m.dx * 0.55, yMid, -11.0],
          [m.dx, yMid, mz - 0.9],
        ],
        0.4,
        12,
      ),
    );
    const housing = rbox(-m.w / 2, -m.h / 2, -0.4, m.w / 2, m.h / 2, 0.32, 0.18);
    housing.rotateY(m.yaw);
    housing.translate(m.dx, yBot + m.h / 2, mz);
    bezels.push(housing);

    const lcd = rbox(-m.w / 2 + 0.3, -m.h / 2 + 0.42, 0.28, m.w / 2 - 0.3, m.h / 2 - 0.28, 0.36, 0.03);
    lcd.rotateY(m.yaw);
    lcd.translate(m.dx, yBot + m.h / 2, mz);
    screens.push(lcd);
  }

  return [
    makePart(top, c.top, 'walnut', true),
    makePart(frame, c.frame, 'darkMetal', false),
    makePart(matGeo, c.mat, 'leather', false),
    makePart(bezels, c.bezel, 'bezel', true),
    makePart(keycaps, c.keycaps, 'plastic', false),
    makePart(screens, c.screens, 'screen', false),
  ];
}

function buildOfficeChair(): FurniturePartDef[] {
  const c = FURNITURE_CATALOG['office-chair'].colors;
  const SH = 18.0;
  const H = 41.0;
  const baseR = 11.4;

  const frame: THREE.BufferGeometry[] = [cylY(0, 0, 2.2, 4.4, 1.45, 1.65, 22)];
  for (let i = 0; i < 5; i++) {
    const a = ((90 + 72 * i) * Math.PI) / 180;
    const x = baseR * Math.cos(a);
    const z = -baseR * Math.sin(a);
    frame.push(
      tubePath(
        [
          [0, 3.4, 0],
          [x * 0.55, 3.05, z * 0.55],
          [x, 2.05, z],
        ],
        0.58,
        12,
      ),
    );
    const wheel = new THREE.CylinderGeometry(1.0, 1.0, 1.35, 18);
    wheel.rotateZ(Math.PI / 2);
    wheel.rotateY(a);
    wheel.translate(x, 1.0, z);
    frame.push(wheel);
    frame.push(rbox(x - 0.85, 1.15, z - 0.85, x + 0.85, 2.2, z + 0.85, 0.35));
  }

  const metal = [
    cylY(0, 0, 3.8, SH - 2.4, 1.05, 1.05, 22),
    strut([3.2, SH - 2.6, 0.5], [7.2, SH - 2.3, 1.2], 0.2, 0.2, 10),
  ];
  frame.push(rbox(-3.6, SH - 3.8, -3.6, 3.6, SH - 1.5, 3.0, 0.6));

  // Contoured waterfall seat rim + pellicle mesh
  const seatRim = new THREE.TorusGeometry(8.8, 0.9, 14, 36);
  seatRim.rotateX(Math.PI / 2);
  seatRim.scale(1.08, 0.8, 0.98);
  seatRim.translate(0, SH - 0.65, 0.8);
  frame.push(seatRim);

  const mesh: THREE.BufferGeometry[] = [cushion(-8.8, SH - 1.05, -7.8, 8.8, SH - 0.2, 9.2, 2.8, 0.15)];

  // Reclined figure-8 Aeron backrest + PostureFit Y-lumbar
  const bh = H - SH - 0.4;
  const backRing = new THREE.TorusGeometry(9.2, 0.82, 14, 38);
  backRing.scale(0.96, (bh / 2) / 9.2, 0.65);
  backRing.translate(0, bh / 2, 0);

  const backMesh = rbox(-8.0, 1.2, -0.22, 8.0, bh - 1.2, 0.22, 2.8);
  const lumbar = [
    rbox(-2.4, bh * 0.24, -1.0, 2.4, bh * 0.44, -0.3, 0.5),
    strut([0, 0.6, -0.75], [0, bh * 0.34, -0.75], 0.52, 0.48, 12),
    strut([-8.2, bh * 0.46, -0.5], [0, bh * 0.34, -0.75], 0.42, 0.42, 12),
    strut([8.2, bh * 0.46, -0.5], [0, bh * 0.34, -0.75], 0.42, 0.42, 12),
  ];

  const tiltBack = (g: THREE.BufferGeometry) => {
    g.rotateX(-0.2);
    g.translate(0, SH + 0.2, -7.6);
    return g;
  };
  frame.push(tiltBack(backRing));
  lumbar.forEach((g) => frame.push(tiltBack(g)));
  mesh.push(tiltBack(backMesh));
  frame.push(strut([0, SH - 2.4, -5.2], [0, SH + 1.4, -7.6], 0.92, 0.85, 14));

  // Sweeping side arms + soft-touch arm pads
  for (const sx of [-1, 1]) {
    const ax = sx * 11.95;
    frame.push(
      tubePath(
        [
          [sx * 8.6, SH - 1.8, -3.5],
          [ax, SH + 2.8, -3.2],
          [ax, SH + 7.6, -1.4],
        ],
        0.56,
        12,
      ),
    );
    frame.push(rbox(ax - 1.65, SH + 7.35, -3.8, ax + 1.65, SH + 8.55, 5.2, 0.55));
  }

  return [
    makePart(frame, c.frame, 'plastic', true),
    makePart(mesh, c.mesh, 'mesh', false),
    makePart(metal, c.metal, 'chrome', false),
  ];
}

function buildCounterStool(): FurniturePartDef[] {
  const c = FURNITURE_CATALOG['counter-stool'].colors;
  const SH = 25.0;
  // Curved molded shell seat + smoothly swept low wrap-around backrest
  const shell: THREE.BufferGeometry[] = [cushion(-8.5, SH - 1.35, -8.5, 8.5, SH + 0.1, 8.5, 3.8, 0.12)];
  const backArcPts: Array<[number, number, number]> = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const ang = Math.PI + (t - 0.5) * Math.PI * 1.18;
    const rx = 8.1 * Math.sin(ang - Math.PI);
    const rz = -8.1 * Math.cos(ang - Math.PI);
    const lift = Math.pow(Math.cos((t - 0.5) * Math.PI), 0.75);
    backArcPts.push([rx, SH + 0.3 + 6.9 * lift, rz]);
  }
  // Build smooth curved backrest ribbon from vertical strips along the arc
  for (let i = 0; i < backArcPts.length - 1; i++) {
    const [x0, yTop0, z0] = backArcPts[i];
    const [x1, yTop1, z1] = backArcPts[i + 1];
    const xm = (x0 + x1) / 2;
    const zm = (z0 + z1) / 2;
    const ym = (yTop0 + yTop1) / 2;
    const segH = Math.max(0.9, ym - (SH - 0.35));
    const segLen = Math.hypot(x1 - x0, z1 - z0) + 0.35;
    const seg = rbox(-segLen / 2, -segH / 2, -0.42, segLen / 2, segH / 2, 0.42, 0.35);
    seg.rotateY(-Math.atan2(z1 - z0, x1 - x0));
    seg.translate(xm, SH - 0.35 + segH / 2, zm);
    shell.push(seg);
  }

  const legs: THREE.BufferGeometry[] = [];
  const metal: THREE.BufferGeometry[] = [rbox(-3.6, SH - 1.8, -3.6, 3.6, SH - 1.25, 3.6, 0.4)];
  const ringPts: Array<[number, number, number]> = [];
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    const p0: [number, number, number] = [sx * 5.0, SH - 1.3, sz * 5.0];
    const p1: [number, number, number] = [sx * 8.2, 0.42, sz * 8.2];
    legs.push(strut(p0, p1, 0.68, 0.46, 18));
    metal.push(cylY(p1[0], p1[2], 0, 0.44, 0.48, 0.48, 16));
    const t = (8.0 - p0[1]) / (p1[1] - p0[1]);
    ringPts.push([p0[0] + (p1[0] - p0[0]) * t, 8.0, p0[2] + (p1[2] - p0[2]) * t]);
  }
  metal.push(tubePath(ringPts, 0.3, 12, true));

  return [
    makePart(shell, c.shell, 'plastic', true),
    makePart(legs, c.wood, 'oak', false),
    makePart(metal, c.metal, 'darkMetal', false),
  ];
}

function buildQueenBed(): FurniturePartDef[] {
  const c = FURNITURE_CATALOG['queen-bed'].colors;
  // W=61.6 (-30.8..30.8), L=81 (-40.5..40.5; head at z=-40.5, foot at z=+40.5), top height <= 29.0"
  const legH = 2.6;
  const fh = 14.0;
  const top = 24.0;

  const legs: THREE.BufferGeometry[] = [];
  for (const lx of [-26.8, 26.8]) {
    for (const lz of [-36.5, 0, 36.5]) {
      legs.push(rbox(lx - 1.4, 0, lz - 1.4, lx + 1.4, legH + 0.3, lz + 1.4, 0.35));
    }
  }

  // Upholstered low platform frame
  const frame = [rbox(-30.5, legH, -40.5, 30.5, fh, 40.5, 1.05)];

  // Lofty linen duvet + folded top sheet collar + mattress
  const bedding = [
    rbox(-30.2, fh - 1.6, -40.0, 30.2, top - 0.4, 40.0, 1.8),
    cushion(-30.1, fh + 1.8, -24.5, 30.1, top + 0.15, 40.0, 2.1, 0.55),
    cushion(-30.35, top - 2.0, -25.8, 30.35, top + 0.55, -18.2, 0.95, 0.25),
    rbox(-29.8, fh - 1.0, -40.0, 29.8, top - 0.55, -24.5, 1.2),
  ];

  // Four layered pillows: two flat sleeping pillows + two reclined sham pillows (capped <= 29.0")
  const pillows: THREE.BufferGeometry[] = [];
  for (const px of [-14.2, 14.2]) {
    pillows.push(cushion(px - 12.6, top - 0.7, -38.4, px + 12.6, top + 2.5, -23.8, 1.6, 0.55));
    const sham = cushion(px - 11.8, 0, -2.4, px + 11.8, 8.8, 2.4, 1.5, 0.5);
    sham.rotateX(-0.98);
    sham.translate(0, top + 0.2, -31.2);
    pillows.push(sham);
  }

  // Draped sage knit throw across the foot of the bed
  const throwBlanket = [
    cushion(-30.8, top - 0.5, 13.5, 30.8, top + 0.65, 35.5, 0.55, 0.2),
    rbox(-30.8, fh + 1.8, 13.7, -29.6, top + 0.5, 35.3, 0.48),
    rbox(29.6, fh + 1.8, 13.7, 30.8, top + 0.5, 35.3, 0.48),
  ];

  return [
    makePart(frame, c.frame, 'linen', true),
    makePart(legs, c.legs, 'walnut', false),
    makePart(bedding, c.bedding, 'linen', true),
    makePart(pillows, c.pillows, 'fabric', false),
    makePart(throwBlanket, c.throw, 'knit', false),
  ];
}

function buildNightstand(): FurniturePartDef[] {
  const c = FURNITURE_CATALOG.nightstand.colors;
  // W=19.7 (-9.85..9.85), D=15.7 (-7.85..7.85, front at +7.85), H=24
  const hw = 9.85;
  const hd = 7.85;
  const lh = 4.8;
  const wt = 0.72;
  const cubbyLo = 16.4;

  const wood: THREE.BufferGeometry[] = [
    // Top, bottom, back, left/right side walls, and middle shelf
    rbox(-hw, 24 - wt, -hd, hw, 24, hd, 0.14),
    rbox(-hw, lh, -hd, hw, lh + wt, hd, 0.14),
    rbox(-hw, lh, -hd, hw, 24, -hd + wt, 0.12),
    rbox(-hw, lh, -hd, -hw + wt, 24, hd, 0.14),
    rbox(hw - wt, lh, -hd, hw, 24, hd, 0.14),
    rbox(-hw + wt, cubbyLo - wt, -hd + wt, hw - wt, cubbyLo, hd - 0.15, 0.08),
  ];

  // Two inset walnut drawers + brass pulls
  const drLo = lh + wt;
  const drHi = cubbyLo - wt;
  const gap = 0.16;
  const dh = (drHi - drLo - 3 * gap) / 2;
  const pulls: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 2; i++) {
    const y0 = drLo + gap + i * (dh + gap);
    const y1 = y0 + dh;
    wood.push(rbox(-hw + wt + gap, y0, hd - 0.75, hw - wt - gap, y1, hd - 0.06, 0.1));
    const ym = (y0 + y1) / 2;
    pulls.push(
      tubePath(
        [
          [-1.5, ym, hd - 0.1],
          [-1.5, ym, hd + 0.42],
          [1.5, ym, hd + 0.42],
          [1.5, ym, hd - 0.1],
        ],
        0.14,
        10,
      ),
    );
  }

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x0 = sx * (hw - 1.8);
      const z0 = sz * (hd - 1.8);
      wood.push(strut([x0, lh + 0.2, z0], [x0 + sx * 0.6, 0, z0 + sz * 0.5], 0.62, 0.36, 16));
    }
  }

  return [
    makePart(wood, c.wood, 'walnut', true),
    makePart(pulls, c.pulls, 'brass', false),
  ];
}

function buildTripodLamp(): FurniturePartDef[] {
  const c = FURNITURE_CATALOG['tripod-lamp'].colors;
  const H = 60.0;
  const hd = 11.0;
  const rd = 8.0;
  const sp = 9.0;
  const apex = H - hd * 0.78;

  const legs: THREE.BufferGeometry[] = [];
  for (const deg of [90, 210, 330]) {
    const rad = (deg * Math.PI) / 180;
    const bx = sp * Math.cos(rad);
    const bz = -sp * Math.sin(rad);
    legs.push(strut([bx, 0, bz], [0, apex, 0], 0.34, 0.42, 16));
  }

  const brass: THREE.BufferGeometry[] = [
    cylY(0, 0, apex - 0.6, apex + 0.8, 0.84, 0.74, 22),
    cylY(0, 0, apex + 0.75, H - 0.8, 0.26, 0.26, 18),
  ];
  for (const deg of [0, 120, 240]) {
    const rad = (deg * Math.PI) / 180;
    brass.push(strut([0, H - 0.9, 0], [(rd - 0.2) * Math.cos(rad), H - 0.9, (rd - 0.2) * Math.sin(rad)], 0.08, 0.08, 8));
  }

  const drumPts = [
    new THREE.Vector2(rd, H - hd),
    new THREE.Vector2(rd, H),
    new THREE.Vector2(rd - 0.24, H),
    new THREE.Vector2(rd - 0.24, H - hd),
  ];
  const shade = [new THREE.LatheGeometry(drumPts, 40)];
  const bulb = new THREE.SphereGeometry(1.45, 18, 14);
  bulb.scale(1, 1.2, 1);
  bulb.translate(0, H - hd * 0.52, 0);

  return [
    makePart(legs, c.legs, 'darkMetal', false),
    makePart(brass, c.brass, 'brass', false),
    makePart(shade, c.shade, 'shade', true),
    makePart([bulb], c.bulb, 'bulb', false),
  ];
}

function buildCoatRack(): FurniturePartDef[] {
  const c = FURNITURE_CATALOG['coat-rack'].colors;
  const wood: THREE.BufferGeometry[] = [
    rbox(-7, 0, -7, 7, 1.4, 7, 0.55),
    cylY(0, 0, 1.2, 67.1, 0.98, 0.72, 24),
  ];
  const finial = new THREE.SphereGeometry(0.84, 18, 14);
  finial.translate(0, 67.2, 0);
  wood.push(finial);

  const metal = [
    cylY(0, 0, 1.35, 1.9, 1.85, 1.35, 24),
    cylY(0, 0, 34.0, 34.55, 0.92, 0.92, 22),
  ];

  const hooks: ReadonlyArray<readonly [number, number]> = [
    [40, 0],
    [40, 180],
    [49, 90],
    [49, 270],
    [57, 45],
    [57, 225],
    [63.5, 135],
    [63.5, 315],
  ];
  for (const [hy, deg] of hooks) {
    const rad = (deg * Math.PI) / 180;
    const tip: [number, number, number] = [Math.cos(rad) * 4.95, hy + 2.9, -Math.sin(rad) * 4.95];
    wood.push(strut([0, hy, 0], tip, 0.44, 0.3, 14));
    const ball = new THREE.SphereGeometry(0.54, 14, 12);
    ball.translate(tip[0], tip[1], tip[2]);
    wood.push(ball);
  }

  return [
    makePart(wood, c.wood, 'walnut', true),
    makePart(metal, c.metal, 'darkMetal', false),
  ];
}

function buildShoeCabinet(): FurniturePartDef[] {
  const c = FURNITURE_CATALOG['shoe-cabinet'].colors;
  // W=31.5 (-15.75..15.75), D=9.5 (-4.75..4.75, front at +4.75), H=47
  const hw = 15.75;
  const hd = 4.75;
  const lh = 4.2;
  const t = 0.75;

  const wood: THREE.BufferGeometry[] = [
    rbox(-hw, lh, -hd, hw, 46.25, hd - 0.65, 0.16),
    rbox(-hw - 0.05, 46.2, -hd, hw + 0.05, 47.0, hd, 0.14),
  ];
  const cane: THREE.BufferGeometry[] = [];
  const metal: THREE.BufferGeometry[] = [];

  const gap = 0.22;
  const dh = (46.2 - lh - 2 * t - 4 * gap) / 3;
  const fw = 1.55;
  for (let i = 0; i < 3; i++) {
    const y0 = lh + t + gap + i * (dh + gap);
    const y1 = y0 + dh;
    // 4 walnut rails framing the recessed woven rattan cane insert
    wood.push(rbox(-hw + t + gap, y0, hd - 0.68, -hw + t + gap + fw, y1, hd - 0.06, 0.08));
    wood.push(rbox(hw - t - gap - fw, y0, hd - 0.68, hw - t - gap, y1, hd - 0.06, 0.08));
    wood.push(rbox(-hw + t + gap, y0, hd - 0.68, hw - t - gap, y0 + fw * 0.9, hd - 0.06, 0.08));
    wood.push(rbox(-hw + t + gap, y1 - fw * 0.9, hd - 0.68, hw - t - gap, y1, hd - 0.06, 0.08));
    cane.push(rbox(-hw + t + gap + fw - 0.1, y0 + fw * 0.85, hd - 0.45, hw - t - gap - fw + 0.1, y1 - fw * 0.85, hd - 0.22, 0.04));
    metal.push(rbox(-2.2, y1 - 0.4, hd - 0.2, 2.2, y1 - 0.05, hd + 0.18, 0.05));
  }

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x0 = sx * (hw - 1.2);
      const z0 = sz * (hd - 1.2);
      metal.push(strut([x0, lh + 0.2, z0], [x0 + sx * 0.3, 0, z0 + sz * 0.2], 0.44, 0.28, 14));
    }
    metal.push(strut([sx * (hw - 1.2), lh * 0.72, -hd + 1.2], [sx * (hw - 1.2), lh * 0.72, hd - 1.2], 0.2, 0.2, 10));
  }

  return [
    makePart(wood, c.wood, 'walnut', true),
    makePart(cane, c.cane, 'rattan', false),
    makePart(metal, c.metal, 'darkMetal', false),
  ];
}

function buildArchedMirror(): FurniturePartDef[] {
  const c = FURNITURE_CATALOG['arched-mirror'].colors;
  // W=22 (-11..11), H=65, T=1.2, leaned 5 deg backward (bottom forward at +Z, top leaning back toward -Z)
  const W = 22;
  const H = 65;
  const r = W / 2;
  const b = 0.75;

  const makeArchShape = (hw: number, hh: number): THREE.Shape => {
    const s = new THREE.Shape();
    s.moveTo(-hw, 0);
    s.lineTo(hw, 0);
    s.lineTo(hw, hh - hw);
    s.absarc(0, hh - hw, hw, 0, Math.PI, false);
    s.lineTo(-hw, 0);
    return s;
  };

  const rimShape = makeArchShape(r, H);
  const holePath = new THREE.Path();
  const ir = r - b;
  const ih = H - b;
  holePath.moveTo(-ir, b);
  holePath.lineTo(ir, b);
  holePath.lineTo(ir, ih - ir);
  holePath.absarc(0, ih - ir, ir, 0, Math.PI, false);
  holePath.lineTo(-ir, b);
  rimShape.holes.push(holePath);

  const rim = new THREE.ExtrudeGeometry(rimShape, { depth: 1.15, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, curveSegments: 28 });
  const glassShape = makeArchShape(ir + 0.04, ih);
  const glass = new THREE.ExtrudeGeometry(glassShape, { depth: 0.22, bevelEnabled: false, curveSegments: 28 });
  glass.translate(0, b * 0.5, 0.68);
  const back = new THREE.ExtrudeGeometry(makeArchShape(r - 0.15, H - 0.15), { depth: 0.45, bevelEnabled: false, curveSegments: 24 });
  back.translate(0, 0.08, 0.15);

  const leanRad = (-5 * Math.PI) / 180;
  for (const g of [rim, glass, back]) {
    g.rotateX(leanRad);
    g.translate(0, 0.12, 2.3);
  }

  return [
    makePart([rim], c.frame, 'darkMetal', true),
    makePart([glass], c.glass, 'mirror', false),
    makePart([back], c.backing, 'walnut', false),
  ];
}

function buildHallCabinet(): FurniturePartDef[] {
  const c = FURNITURE_CATALOG['hall-cabinet'].colors;
  // W=31.5 (-15.75..15.75), D=15.7 (-7.85..7.85), H=31.5, rounded vertical corners r=3
  const hw = 15.75;
  const hd = 7.85;
  const r = 3.0;

  const makeRoundedRect = (w2: number, d2: number, rad: number): THREE.Shape => {
    const s = new THREE.Shape();
    s.moveTo(-w2 + rad, -d2);
    s.lineTo(w2 - rad, -d2);
    s.quadraticCurveTo(w2, -d2, w2, -d2 + rad);
    s.lineTo(w2, d2 - rad);
    s.quadraticCurveTo(w2, d2, w2 - rad, d2);
    s.lineTo(-w2 + rad, d2);
    s.quadraticCurveTo(-w2, d2, -w2, d2 - rad);
    s.lineTo(-w2, -d2 + rad);
    s.quadraticCurveTo(-w2, -d2, -w2 + rad, -d2);
    return s;
  };

  const extrudeUp = (shape: THREE.Shape, y0: number, y1: number, bevel = 0) => {
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: y1 - y0,
      bevelEnabled: bevel > 0,
      bevelSize: bevel,
      bevelThickness: bevel,
      curveSegments: 20,
    });
    g.rotateX(-Math.PI / 2);
    g.translate(0, y0, 0);
    return g;
  };

  const plinth = [extrudeUp(makeRoundedRect(hw - 0.9, hd - 0.9, r - 0.6), 0, 2.3)];
  // Split left & right doors along x=0 so a genuine center shadow gap reads in 3D
  const body = [
    extrudeUp(makeRoundedRect(hw, hd - 0.35, r), 2.2, 30.65),
    rbox(-hw + r * 0.7, 3.0, hd - 0.4, -0.1, 30.3, hd, 0.12),
    rbox(0.1, 3.0, hd - 0.4, hw - r * 0.7, 30.3, hd, 0.12),
    extrudeUp(makeRoundedRect(hw + 0.08, hd + 0.05, r), 30.65, 31.5, 0.08),
  ];

  const pulls: THREE.BufferGeometry[] = [];
  for (const px of [-1.45, 1.45]) {
    pulls.push(cylY(px, hd + 0.52, 15.8, 24.0, 0.22, 0.22, 16));
    pulls.push(strut([px, 16.6, hd], [px, 16.6, hd + 0.52], 0.15, 0.15, 12));
    pulls.push(strut([px, 23.2, hd], [px, 23.2, hd + 0.52], 0.15, 0.15, 12));
  }

  return [
    makePart(body, c.wood, 'walnut', true),
    makePart(plinth, c.base, 'walnut', false),
    makePart(pulls, c.pulls, 'brass', false),
  ];
}

function buildRoadBike(): FurniturePartDef[] {
  const c = FURNITURE_CATALOG['bike-black'].colors;
  // W=66.8 (-33.4..33.4), D=18.0 (-8.98..8.98; wall plate at z=-8.98, outer handlebar at z=+8.52), Y=30..67.5
  const lift = 30.0;
  const r = 13.6;
  const tire = 1.2;
  const zBike = 0.25; // bike centerline relative to rack depth
  const R0: [number, number, number] = [-19.8, lift + r, zBike];
  const F0: [number, number, number] = [19.8, lift + r, zBike];
  const bb: [number, number, number] = [R0[0] + 16.5, R0[1] - 2.8, zBike];
  const stTop: [number, number, number] = [
    bb[0] - 21.0 * Math.cos((73.5 * Math.PI) / 180),
    bb[1] + 21.0 * Math.sin((73.5 * Math.PI) / 180),
    zBike,
  ];
  const htTop: [number, number, number] = [bb[0] + 15.2, bb[1] + 21.8, zBike];
  const htBot: [number, number, number] = [
    htTop[0] + 5.5 * Math.cos((72 * Math.PI) / 180),
    htTop[1] - 5.5 * Math.sin((72 * Math.PI) / 180),
    zBike,
  ];
  const saddle: [number, number, number] = [stTop[0] - 2.5, lift + 37.5, zBike];
  const bar: [number, number, number] = [htTop[0] + 3.8, htTop[1] + 1.2, zBike];

  const frame: THREE.BufferGeometry[] = [
    strut(stTop, htTop, 0.58, 0.66, 16),
    strut(bb, htBot, 0.78, 0.85, 16),
    strut(bb, stTop, 0.64, 0.56, 16),
    strut(htBot, htTop, 0.74, 0.74, 16),
  ];
  for (const sz of [-1, 1]) {
    frame.push(strut([htBot[0], htBot[1] - 0.3, zBike + sz * 0.85], [F0[0], F0[1], zBike + sz * 1.45], 0.5, 0.32, 14));
    frame.push(strut([bb[0], bb[1], zBike + sz * 0.7], [R0[0], R0[1], zBike + sz * 1.65], 0.44, 0.3, 14));
    frame.push(strut([stTop[0] - 0.3, stTop[1] - 1.4, zBike], [R0[0], R0[1], zBike + sz * 1.65], 0.34, 0.26, 14));
  }

  const tires: THREE.BufferGeometry[] = [];
  const kit: THREE.BufferGeometry[] = [];
  const metal: THREE.BufferGeometry[] = [];

  for (let idx = 0; idx < 2; idx++) {
    const wc = idx === 0 ? R0 : F0;
    const tGeo = new THREE.TorusGeometry(r - tire / 2, tire / 2, 16, 56);
    tGeo.translate(wc[0], wc[1], wc[2]);
    tires.push(tGeo);

    const rimGeo = new THREE.TorusGeometry(r - tire - 0.5, 0.55, 14, 48);
    rimGeo.scale(1, 1, 0.42);
    rimGeo.translate(wc[0], wc[1], wc[2]);
    kit.push(rimGeo);

    metal.push(strut([wc[0], wc[1], wc[2] - 1.9], [wc[0], wc[1], wc[2] + 1.9], 0.46, 0.46, 14));
    const rotor = new THREE.CylinderGeometry(2.7, 2.7, 0.1, 24);
    rotor.rotateX(Math.PI / 2);
    rotor.translate(wc[0], wc[1], wc[2] + 1.35);
    metal.push(rotor);

    for (let s = 0; s < 12; s++) {
      const ang = ((s * 30 + idx * 15) * Math.PI) / 180;
      metal.push(
        strut(
          [wc[0], wc[1], wc[2] + (s % 2 === 0 ? 1.1 : -1.1)],
          [wc[0] + (r - tire - 0.85) * Math.cos(ang), wc[1] + (r - tire - 0.85) * Math.sin(ang), wc[2]],
          0.075,
          0.075,
          8,
        ),
      );
    }
  }

  // Seatpost, sculpted saddle, stem, drop bars, brake levers, and crankset
  const bw = 8.25;
  kit.push(strut(stTop, [saddle[0] + 2.2, saddle[1] - 0.5, zBike], 0.44, 0.44, 14));
  kit.push(cushion(saddle[0] - 5.4, saddle[1] - 0.75, zBike - 2.6, saddle[0] - 0.4, saddle[1], zBike + 2.6, 0.4, 0.15));
  kit.push(rbox(saddle[0] - 0.6, saddle[1] - 0.6, zBike - 0.9, saddle[0] + 4.8, saddle[1] - 0.05, zBike + 0.9, 0.35));
  kit.push(strut(htTop, bar, 0.48, 0.48, 14));
  kit.push(strut([bar[0], bar[1], zBike - bw], [bar[0], bar[1], zBike + bw], 0.44, 0.44, 14));

  for (const sz of [-1, 1]) {
    const zb = zBike + sz * bw;
    kit.push(
      tubePath(
        [
          [bar[0], bar[1], zb],
          [bar[0] + 3.5, bar[1] - 1.9, zb],
          [bar[0] + 1.6, bar[1] - 4.9, zb],
          [bar[0] - 1.0, bar[1] - 4.9, zb],
        ],
        0.42,
        12,
      ),
    );
    kit.push(rbox(bar[0] + 2.4, bar[1] - 2.2, zb - 0.45, bar[0] + 4.2, bar[1] - 0.4, zb + 0.45, 0.28));
    metal.push(strut([bar[0] + 3.9, bar[1] - 2.1, zb], [bar[0] + 3.5, bar[1] - 4.3, zb], 0.11, 0.11, 8));
  }

  const chainring = new THREE.CylinderGeometry(3.85, 3.85, 0.24, 32);
  chainring.rotateX(Math.PI / 2);
  chainring.translate(bb[0], bb[1], zBike - 2.1);
  kit.push(chainring);
  for (const [sz, deg] of [
    [-1, 25],
    [1, 205],
  ] as const) {
    const rad = (deg * Math.PI) / 180;
    const pe: [number, number, number] = [bb[0] + 6.4 * Math.cos(rad), bb[1] + 6.4 * Math.sin(rad), zBike + sz * 2.4];
    kit.push(strut([bb[0], bb[1], zBike + sz * 1.9], pe, 0.34, 0.3, 12));
    kit.push(rbox(pe[0] - 1.2, pe[1] - 0.26, pe[2] + (sz < 0 ? -2.0 : 0.1), pe[0] + 1.2, pe[1] + 0.26, pe[2] + (sz < 0 ? -0.1 : 2.0), 0.12));
  }

  // Sculpted walnut wall rack reaching z = -8.98 (against wall)
  const mx = (stTop[0] + htTop[0]) / 2;
  const ry = (stTop[1] + htTop[1]) / 2 - 0.6;
  const rack = [
    rbox(mx - 5.2, ry - 2.6, -8.98, mx + 5.2, ry + 0.1, zBike + 2.2, 0.32),
    rbox(mx - 5.2, ry - 2.6, zBike + 1.4, mx + 5.2, ry + 1.35, zBike + 2.4, 0.28),
    rbox(mx - 6.0, ry - 7.8, -8.98, mx + 6.0, ry + 2.2, -8.1, 0.25),
  ];

  return [
    makePart(frame, c.frame, 'paint', true),
    makePart(tires, c.tires, 'rubber', false),
    makePart(kit, c.kit, 'darkMetal', false),
    makePart(metal, c.metal, 'chrome', false),
    makePart(rack, c.rack, 'walnut', true),
  ];
}

function buildRug(): FurniturePartDef[] {
  const c = FURNITURE_CATALOG['rug-6x9'].colors;
  // W=108 (-54..54), D=72 (-36..36), H=0.38
  const b = 1.4;
  const field = [rbox(-54 + b, 0.02, -36 + b, 54 - b, 0.38, 36 - b, 0.14)];
  const border = [
    rbox(-54, 0, -36, 54, 0.36, -36 + b, 0.14),
    rbox(-54, 0, 36 - b, 54, 0.36, 36, 0.14),
    rbox(-54, 0, -36 + b, -54 + b, 0.36, 36 - b, 0.14),
    rbox(54 - b, 0, -36 + b, 54, 0.36, 36 - b, 0.14),
  ];
  return [
    makePart(field, c.main, 'rug', true),
    makePart(border, c.border, 'rug', false),
  ];
}

function buildPlanterParts(potDia: number, potH: number, saucerDia: number): { pot: THREE.BufferGeometry[]; soil: THREE.BufferGeometry[] } {
  const rp = potDia / 2;
  const rs = saucerDia / 2;
  const wall = 0.5;
  const potPts = [
    new THREE.Vector2(0.01, 0.32),
    new THREE.Vector2(rp * 0.88, 0.32),
    new THREE.Vector2(rp, potH),
    new THREE.Vector2(rp + 0.14, potH + 0.25),
    new THREE.Vector2(rp - wall, potH + 0.25),
    new THREE.Vector2(rp - wall, potH - 1.2),
    new THREE.Vector2(0.01, potH - 1.2),
  ];
  const saucerPts = [
    new THREE.Vector2(0.01, 0),
    new THREE.Vector2(rs * 0.93, 0),
    new THREE.Vector2(rs, 1.05),
    new THREE.Vector2(rs - 0.34, 1.05),
    new THREE.Vector2(rs - 0.38, 0.32),
    new THREE.Vector2(0.01, 0.32),
  ];
  return {
    pot: [new THREE.LatheGeometry(potPts, 36), new THREE.LatheGeometry(saucerPts, 36)],
    soil: [cylY(0, 0, potH - 1.35, potH - 0.85, rp - wall - 0.04, rp - wall - 0.02, 28)],
  };
}

function makeMonsteraLeafShape(len: number, w: number, splits: number): THREE.Shape {
  const hw = w / 2;
  const steps = 22;
  const right: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const u = (len * i) / steps;
    const profile =
      u < 0.38 * len
        ? Math.sin((Math.PI / 2) * Math.pow(u / (0.38 * len), 0.72))
        : Math.cos((Math.PI / 2) * Math.pow((u - 0.38 * len) / (0.62 * len), 1.15));
    right.push([Math.max(0.06, hw * profile), u]);
  }
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  for (const [x, y] of right) s.lineTo(x, y);
  for (let i = right.length - 1; i >= 0; i--) s.lineTo(-right[i][0], right[i][1]);
  s.closePath();

  // Add characteristic Monstera fenestration holes
  for (let si = 0; si < splits; si++) {
    const vAt = len * (0.3 + 0.22 * si);
    for (const side of [-1, 1]) {
      const hole = new THREE.Path();
      const cx = side * hw * 0.52;
      const rx = hw * 0.28;
      const ry = 0.26;
      hole.absellipse(cx, vAt, rx, ry, 0, Math.PI * 2, false, side * 0.35);
      s.holes.push(hole);
    }
  }
  return s;
}

function buildMonstera(): FurniturePartDef[] {
  const c = FURNITURE_CATALOG['plant-monstera'].colors;
  const { pot, soil } = buildPlanterParts(10, 10, 11);
  const foliage: THREE.BufferGeometry[] = [];

  const leaves = [
    { dir: 0, tilt: 26, stem: 15.5, len: 12.0, w: 10.0, splits: 2 },
    { dir: 65, tilt: 34, stem: 13.0, len: 11.5, w: 9.6, splits: 2 },
    { dir: 135, tilt: 21, stem: 17.5, len: 12.6, w: 10.6, splits: 3 },
    { dir: 205, tilt: 38, stem: 11.0, len: 10.6, w: 8.8, splits: 1 },
    { dir: 265, tilt: 30, stem: 14.5, len: 11.8, w: 9.8, splits: 2 },
    { dir: 320, tilt: 14, stem: 19.0, len: 11.2, w: 9.2, splits: 2 },
    { dir: 102, tilt: 15, stem: 16.5, len: 10.5, w: 8.6, splits: 1 },
  ];

  for (const lf of leaves) {
    const phi = (lf.dir * Math.PI) / 180;
    const al = (lf.tilt * Math.PI) / 180;
    const ux = Math.cos(phi);
    const uz = -Math.sin(phi);
    const p0: [number, number, number] = [1.2 * ux, 9.1, 1.2 * uz];
    const pm: [number, number, number] = [
      p0[0] + lf.stem * 0.55 * Math.sin(al * 0.72) * ux,
      p0[1] + lf.stem * 0.55 * Math.cos(al * 0.72),
      p0[2] + lf.stem * 0.55 * Math.sin(al * 0.72) * uz,
    ];
    const p1: [number, number, number] = [
      p0[0] + lf.stem * Math.sin(al) * ux,
      p0[1] + lf.stem * Math.cos(al),
      p0[2] + lf.stem * Math.sin(al) * uz,
    ];
    foliage.push(tubePath([p0, pm, p1], 0.23, 10));

    const shape = makeMonsteraLeafShape(lf.len, lf.w, lf.splits);
    const blade = new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, curveSegments: 10 });
    blade.translate(0, 0, -0.07);

    const droop = al + 0.34;
    const yAxis = new THREE.Vector3(Math.sin(droop) * ux, Math.cos(droop), Math.sin(droop) * uz).normalize();
    const xAxis = new THREE.Vector3(-uz, 0, ux).normalize();
    const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();
    const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
    basis.setPosition(p1[0], p1[1], p1[2]);
    blade.applyMatrix4(basis);
    foliage.push(blade);
  }

  return [
    makePart(pot, c.pot, 'ceramic', true),
    makePart(soil, c.soil, 'soil', false),
    makePart(foliage, c.leaf, 'plant', false),
  ];
}

function buildZzPlant(): FurniturePartDef[] {
  const c = FURNITURE_CATALOG['plant-zz'].colors;
  const { pot, soil } = buildPlanterParts(8, 7, 9);
  const foliage: THREE.BufferGeometry[] = [];

  // Reusable glossy oval ZZ leaflet
  const leafletShape = new THREE.Shape();
  const lu = 2.65;
  const lw = 0.72;
  leafletShape.moveTo(0, 0);
  for (let i = 1; i <= 14; i++) {
    const u = (lu * i) / 14;
    leafletShape.lineTo(lw * Math.sin(Math.PI * Math.pow(u / lu, 0.85)), u);
  }
  for (let i = 14; i >= 1; i--) {
    const u = (lu * i) / 14;
    leafletShape.lineTo(-lw * Math.sin(Math.PI * Math.pow(u / lu, 0.85)), u);
  }
  leafletShape.closePath();
  const leafletProto = new THREE.ExtrudeGeometry(leafletShape, { depth: 0.1, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, curveSegments: 8 });
  leafletProto.translate(0, 0, -0.05);

  const stems: ReadonlyArray<readonly [number, number, number]> = [
    [0, 10, 19.5],
    [48, 22, 17.5],
    [96, 13, 18.8],
    [144, 25, 16.8],
    [190, 8, 20.0],
    [235, 20, 17.8],
    [280, 15, 18.5],
    [324, 24, 16.5],
  ];

  for (const [deg, tiltDeg, len] of stems) {
    const phi = (deg * Math.PI) / 180;
    const al = (tiltDeg * Math.PI) / 180;
    const ux = Math.cos(phi);
    const uz = -Math.sin(phi);
    const p0 = new THREE.Vector3(1.1 * ux, 5.9, 1.1 * uz);

    const pts: Array<[number, number, number]> = [];
    for (const frac of [0, 0.35, 0.7, 1.0]) {
      const cur = al * (0.55 + 0.65 * frac);
      pts.push([
        p0.x + len * frac * Math.sin(cur) * ux,
        p0.y + len * frac * Math.cos(cur),
        p0.z + len * frac * Math.sin(cur) * uz,
      ]);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      foliage.push(strut(pts[i], pts[i + 1], 0.34 * (1 - 0.55 * (i / 3)), 0.34 * (1 - 0.55 * ((i + 1) / 3)), 10));
    }

    const tVec = new THREE.Vector3(-uz, 0, ux).normalize();
    for (let k = 0; k < 6; k++) {
      const frac = 0.24 + 0.135 * k;
      const cur = al * (0.55 + 0.65 * frac);
      const sAxis = new THREE.Vector3(Math.sin(cur) * ux, Math.cos(cur), Math.sin(cur) * uz).normalize();
      const pos = p0.clone().addScaledVector(sAxis, len * frac);
      const scaleK = 1 - 0.26 * Math.abs(frac - 0.55);

      for (const side of [-1, 1]) {
        const outNormal = new THREE.Vector3().crossVectors(tVec, sAxis);
        const lDir = new THREE.Vector3()
          .addScaledVector(tVec, 0.72 * side)
          .addScaledVector(sAxis, 0.52)
          .addScaledVector(outNormal, 0.22)
          .normalize();
        const wDir = new THREE.Vector3().crossVectors(lDir, sAxis).normalize();
        const nDir = new THREE.Vector3().crossVectors(wDir, lDir).normalize();
        const m = new THREE.Matrix4().makeBasis(
          wDir.multiplyScalar(scaleK),
          lDir.multiplyScalar(scaleK),
          nDir,
        );
        m.setPosition(pos.x + side * 0.08 * tVec.x, pos.y, pos.z + side * 0.08 * tVec.z);
        const lf = leafletProto.clone();
        lf.applyMatrix4(m);
        foliage.push(lf);
      }
    }
  }
  leafletProto.dispose();

  return [
    makePart(pot, c.pot, 'terracotta', true),
    makePart(soil, c.soil, 'soil', false),
    makePart(foliage, c.leaf, 'plant', false),
  ];
}

export function getFurnitureParts(key: string): FurniturePartDef[] {
  const cached = PART_CACHE.get(key);
  if (cached) return cached;

  let parts: FurniturePartDef[];
  switch (key) {
    case 'sectional':
      parts = buildSectional();
      break;
    case 'coffee-table':
      parts = buildCoffeeTable(false);
      break;
    case 'coffee-table-open':
      parts = buildCoffeeTable(true);
      break;
    case 'tv-stand':
      parts = buildWallTv();
      break;
    case 'tier-shelf':
      parts = buildTierShelf();
      break;
    case 'torchiere-lamp':
      parts = buildTorchiere();
      break;
    case 'standing-desk':
      parts = buildStandingDesk();
      break;
    case 'office-chair':
      parts = buildOfficeChair();
      break;
    case 'counter-stool':
      parts = buildCounterStool();
      break;
    case 'queen-bed':
      parts = buildQueenBed();
      break;
    case 'nightstand':
      parts = buildNightstand();
      break;
    case 'tripod-lamp':
      parts = buildTripodLamp();
      break;
    case 'coat-rack':
      parts = buildCoatRack();
      break;
    case 'shoe-cabinet':
      parts = buildShoeCabinet();
      break;
    case 'arched-mirror':
      parts = buildArchedMirror();
      break;
    case 'hall-cabinet':
      parts = buildHallCabinet();
      break;
    case 'bike-black':
      parts = buildRoadBike();
      break;
    case 'rug-6x9':
      parts = buildRug();
      break;
    case 'plant-monstera':
      parts = buildMonstera();
      break;
    case 'plant-zz':
      parts = buildZzPlant();
      break;
    default:
      parts = [];
  }

  PART_CACHE.set(key, parts);
  return parts;
}

let softShadowTex: THREE.CanvasTexture | null = null;
export function getSoftContactShadowTexture(): THREE.CanvasTexture | null {
  if (softShadowTex) return softShadowTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  g.addColorStop(0, 'rgba(18, 22, 24, 0.34)');
  g.addColorStop(0.55, 'rgba(18, 22, 24, 0.16)');
  g.addColorStop(1, 'rgba(18, 22, 24, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  softShadowTex = new THREE.CanvasTexture(c);
  softShadowTex.needsUpdate = true;
  return softShadowTex;
}

/** Render crisp 3/4-view 3D thumbnails for every visible catalog entry. */
export async function renderFurnitureThumbnails(keys: ReadonlyArray<string>): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (keys.length === 0 || typeof window === 'undefined') return out;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    return out;
  }

  const S = 128;
  renderer.setPixelRatio(1);
  renderer.setSize(S, S, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envTarget.texture;
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight(0xfffaf2, 0x8f897e, 0.45));
  const keyLight = new THREE.DirectionalLight(0xfff4e4, 1.45);
  keyLight.position.set(-70, 170, 130);
  scene.add(keyLight);

  const cam = new THREE.PerspectiveCamera(28, 1, 1, 4000);
  const viewDir = new THREE.Vector3(0.75, 0.62, 1.25).normalize();
  const box = new THREE.Box3();
  const sph = new THREE.Sphere();

  try {
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const grp = new THREE.Group();
      const mats: THREE.Material[] = [];
      try {
        for (const p of getFurnitureParts(k)) {
          const m = createRoleMaterial(p.color, p.role);
          mats.push(m);
          grp.add(new THREE.Mesh(p.geometry, m));
        }
        scene.add(grp);
        box.setFromObject(grp).getBoundingSphere(sph);
        const dist = (sph.radius / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2))) * 1.06;
        cam.position.copy(sph.center).addScaledVector(viewDir, dist);
        cam.lookAt(sph.center);
        cam.near = Math.max(0.5, dist / 20);
        cam.far = dist * 4;
        cam.updateProjectionMatrix();
        renderer.render(scene, cam);
        out[k] = renderer.domElement.toDataURL('image/png');
      } finally {
        scene.remove(grp);
        mats.forEach((m) => m.dispose());
      }
      if ((i + 1) % 3 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
  } finally {
    envTarget.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
  return out;
}
