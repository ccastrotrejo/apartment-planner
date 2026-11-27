import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applyArchitecturalBoxUVs, mergeBufferGeometries } from '../geometry/plan2d';
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

export function rbox(
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

/**
 * Grid coordinates for one cushion axis: `k` cosine-spaced segments inside each rounded band of
 * width `rad`, plus uniform segments across the flat span, so edges round smoothly and the face
 * has enough vertices to carry a visible crown.
 */
function cushionAxis(half: number, rad: number, k: number): number[] {
  const inner = Math.max(1, Math.min(20, Math.round((2 * (half - rad)) / 2)));
  const out: number[] = [];
  for (let j = 0; j < k; j++) out.push(-half + rad * (1 - Math.cos((Math.PI / 2) * (j / k))));
  for (let j = 0; j <= inner; j++) out.push(-half + rad + (2 * (half - rad) * j) / inner);
  for (let j = k - 1; j >= 0; j--) out.push(half - rad * (1 - Math.cos((Math.PI / 2) * (j / k))));
  return out;
}

/**
 * Upholstered cushion/pillow centered between (x0..x1, y0..y1, z0..z1): rounded edges of radius `r`,
 * a stuffed crown of height `crown` on top, gently bowed sides, and a faint seeded sag so repeated
 * cushions don't read as clones.
 */
export function cushion(
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  r = 1.4,
  crown = 0.4,
): THREE.BufferGeometry {
  const w = Math.max(0.05, Math.abs(x1 - x0));
  const h = Math.max(0.05, Math.abs(y1 - y0));
  const d = Math.max(0.05, Math.abs(z1 - z0));
  const rad = Math.max(0.01, Math.min(r, w * 0.46, h * 0.46, d * 0.46));
  const K = 3;
  const ax = cushionAxis(w / 2, rad, K);
  const ay = cushionAxis(h / 2, rad, K);
  const az = cushionAxis(d / 2, rad, K);
  const box = new THREE.BoxGeometry(w, h, d, ax.length - 1, ay.length - 1, az.length - 1);
  box.deleteAttribute('normal');
  box.deleteAttribute('uv');

  const remap = (v: number, len: number, axis: number[]) =>
    axis[Math.round(((v + len / 2) / len) * (axis.length - 1))];
  const hx = w / 2 - rad;
  const hy = h / 2 - rad;
  const hz = d / 2 - rad;
  const bow = crown * 0.35;
  const seed = Math.sin(w * 12.9898 + h * 78.233 + d * 37.719) * 43758.5453;
  const phase = (seed - Math.floor(seed)) * Math.PI * 2;
  const pos = box.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    let x = remap(pos.getX(i), w, ax);
    let y = remap(pos.getY(i), h, ay);
    let z = remap(pos.getZ(i), d, az);
    // Project the grid onto a rounded box.
    const ix = Math.min(hx, Math.max(-hx, x));
    const iy = Math.min(hy, Math.max(-hy, y));
    const iz = Math.min(hz, Math.max(-hz, z));
    const dx = x - ix;
    const dy = y - iy;
    const dz = z - iz;
    const len = Math.hypot(dx, dy, dz);
    if (len > 1e-6) {
      x = ix + (dx / len) * rad;
      y = iy + (dy / len) * rad;
      z = iz + (dz / len) * rad;
    }
    const nx = x / (w / 2);
    const ny = y / (h / 2);
    const nz = z / (d / 2);
    const plan = Math.max(0, (1 - nx * nx) * (1 - nz * nz));
    if (ny > 0) {
      const sag = 0.12 * Math.sin(nx * 2.3 + phase) * Math.sin(nz * 1.7 + phase * 0.7);
      y += crown * ny * ny * (Math.sqrt(plan) + sag * plan);
    }
    const side = Math.max(0, 1 - ny * ny);
    x += Math.sign(x) * bow * side * Math.max(0, 1 - nz * nz) * Math.abs(nx);
    z += Math.sign(z) * bow * side * Math.max(0, 1 - nx * nx) * Math.abs(nz);
    pos.setXYZ(i, x, y, z);
  }
  const g = mergeVertices(box, 1e-4);
  box.dispose();
  g.computeVertexNormals();
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

/** Approximate top-surface height of a `cushion()` with the same bounds at plan point (x, z). */
export function cushionTopY(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  top: number,
  crown: number,
  x: number,
  z: number,
): number {
  const nx = (2 * x - x0 - x1) / Math.abs(x1 - x0);
  const nz = (2 * z - z0 - z1) / Math.abs(z1 - z0);
  return top + crown * Math.sqrt(Math.max(0, (1 - nx * nx) * (1 - nz * nz)));
}

export function cylY(
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

export function strut(
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

export function tubePath(
  pts: ReadonlyArray<readonly [number, number, number]>,
  radius: number,
  segs = 14,
  closed = false,
): THREE.BufferGeometry {
  const v = pts.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const curve = new THREE.CatmullRomCurve3(v, closed, 'catmullrom', 0.15);
  return new THREE.TubeGeometry(curve, Math.max(12, pts.length * 6), radius, segs, closed);
}

export function makePart(
  geos: THREE.BufferGeometry[],
  color: string,
  role: MaterialRole,
  withPlanEdges = true,
): FurniturePartDef {
  const merged = mergeBufferGeometries(geos);
  geos.forEach((g) => g.dispose());
  if (role !== 'tvArt' && role !== 'printArt' && role !== 'ideScreen') {
    const uvSize =
      role === 'wood' || role === 'walnut' || role === 'oak'
        ? TEX_INCHES.walnut
        : role === 'rattan'
          ? TEX_INCHES.cane
          : role === 'rug' || role === 'knit'
            ? TEX_INCHES.rug
            : role === 'mesh'
              ? TEX_INCHES.pellicle
              : role === 'plant'
                ? TEX_INCHES.leaf
                : TEX_INCHES.fabric;
    applyArchitecturalBoxUVs(merged, uvSize);
  }
  return { geometry: merged, withPlanEdges, color, role };
}
