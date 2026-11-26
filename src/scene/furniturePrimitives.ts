import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
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

/** Softly crowned pillow/cushion geometry centered between (x0..x1, y0..y1, z0..z1). */
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
  if (role !== 'tvArt' && role !== 'ideScreen') {
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
