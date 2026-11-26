import * as THREE from 'three';
import { FURNITURE_CATALOG } from '../furniture/catalog';
import { rbox, cylY, strut, tubePath, makePart, type FurniturePartDef } from './furniturePrimitives';

export function buildRug(): FurniturePartDef[] {
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

export function buildMonstera(): FurniturePartDef[] {
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

export function buildZzPlant(): FurniturePartDef[] {
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
