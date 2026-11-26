import {
  Clipper,
  EndType,
  FillRule,
  JoinType,
  Path64,
  Paths64,
  Point64,
  PointInPolygonResult,
} from 'clipper2-js';
import * as THREE from 'three';
import type { HitRect, Rect4, Vec2 } from '../types';

const SCALE = 1000; // 0.001 inch integer precision for Clipper64

export interface PolygonWithHoles {
  readonly outer: Vec2[];
  readonly holes: Vec2[][];
}

export function toPath64(pts: ReadonlyArray<Vec2>): Path64 {
  const p = new Path64();
  for (const [x, z] of pts) {
    p.push(new Point64(Math.round(x * SCALE), Math.round(z * SCALE)));
  }
  return p;
}

export function fromPath64(path: Path64): Vec2[] {
  const raw = path.map((pt) => [pt.x / SCALE, pt.y / SCALE] as const);
  const out: Vec2[] = [];
  for (const [x, z] of raw) {
    const prev = out[out.length - 1];
    if (!prev || Math.hypot(x - prev[0], z - prev[1]) > 1e-3) {
      out.push([x, z]);
    }
  }
  while (out.length > 2) {
    const first = out[0];
    const last = out[out.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= 1e-3) {
      out.pop();
    } else {
      break;
    }
  }
  return out;
}

export function rectToPoly([x0, z0, x1, z1]: Rect4): Vec2[] {
  return [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ];
}

export function rectToPath64(r: Rect4): Path64 {
  return toPath64(rectToPoly(r));
}

export function rectsToPaths64(rects: ReadonlyArray<Rect4>): Paths64 {
  const out = new Paths64();
  for (const r of rects) {
    const p = rectToPath64(r);
    if (Clipper.area(p) < 0) p.reverse();
    out.push(p);
  }
  return out;
}

export function polysToPaths64(polys: ReadonlyArray<ReadonlyArray<Vec2>>): Paths64 {
  const out = new Paths64();
  for (const poly of polys) {
    const p = toPath64(poly);
    if (Clipper.area(p) < 0) p.reverse();
    out.push(p);
  }
  return out;
}

export function unionPaths(paths: Paths64): Paths64 {
  if (paths.length === 0) return new Paths64();
  return Clipper.Union(paths, undefined, FillRule.NonZero);
}

export function diffPaths(subject: Paths64, clip: Paths64): Paths64 {
  if (subject.length === 0) return new Paths64();
  if (clip.length === 0) return subject;
  return Clipper.Difference(subject, clip, FillRule.NonZero);
}

export function intersectPaths(subject: Paths64, clip: Paths64): Paths64 {
  if (subject.length === 0 || clip.length === 0) return new Paths64();
  return Clipper.Intersect(subject, clip, FillRule.NonZero);
}

export function inflatePaths(
  paths: Paths64,
  deltaInches: number,
  join: 'miter' | 'round' | 'square' = 'round',
): Paths64 {
  if (paths.length === 0) return new Paths64();
  const jt = join === 'miter' ? JoinType.Miter : join === 'square' ? JoinType.Square : JoinType.Round;
  return Clipper.InflatePaths(paths, deltaInches * SCALE, jt, EndType.Polygon, 3.0);
}

export function inflatePolyline(
  pts: ReadonlyArray<Vec2>,
  halfWidthInches: number,
  end: 'butt' | 'square' | 'round' = 'square',
): Paths64 {
  const p = new Paths64();
  p.push(toPath64(pts));
  const et = end === 'butt' ? EndType.Butt : end === 'round' ? EndType.Round : EndType.Square;
  return Clipper.InflatePaths(p, halfWidthInches * SCALE, JoinType.Miter, et, 2.5);
}

export function areaOfPaths(paths: Paths64): number {
  return Math.abs(Clipper.areaPaths(paths)) / (SCALE * SCALE);
}

export function areaOfPath(path: Path64): number {
  return Math.abs(Clipper.area(path)) / (SCALE * SCALE);
}

export function pathsToPolygonsWithHoles(paths: Paths64): PolygonWithHoles[] {
  if (paths.length === 0) return [];
  const cleaned = Clipper.Union(paths, undefined, FillRule.NonZero);
  if (cleaned.length === 0) return [];

  const shells = cleaned
    .filter((p) => p.length >= 3 && Clipper.area(p) > 0)
    .map((p) => ({
      path: p,
      area: Clipper.area(p),
      outer: fromPath64(p),
      holes: [] as Vec2[][],
    }));

  const holes = cleaned.filter((p) => p.length >= 3 && Clipper.area(p) < 0);
  for (const h of holes) {
    const sample = new Point64(h[0].x, h[0].y);
    let owner: (typeof shells)[number] | null = null;
    for (const s of shells) {
      if (Clipper.pointInPolygon(sample, s.path) !== PointInPolygonResult.IsOutside) {
        if (!owner || s.area < owner.area) {
          owner = s;
        }
      }
    }
    if (owner) {
      owner.holes.push(fromPath64(h));
    }
  }

  return shells.map(({ outer, holes: shHoles }) => ({ outer, holes: shHoles }));
}

/**
 * Extrude 2D plan polygons (`x` east, `z` south) along `+Y` (up) from `y0` to `y1`,
 * generating planar top/bottom UVs and vertical-grain side UVs.
 */
export function extrudePlanPolygons(
  polys: ReadonlyArray<PolygonWithHoles>,
  y0: number,
  y1: number,
  uvScale: readonly [number, number] = [48, 48],
): THREE.BufferGeometry {
  const height = Math.max(0.01, y1 - y0);
  const geometries: THREE.BufferGeometry[] = [];

  for (const { outer, holes } of polys) {
    // Shape sits in XY; rotating -90 deg about X maps (x, shapeY, extrudeZ) -> (x, extrudeZ, -shapeY).
    // Enforce CCW outer contour and CW holes so THREE.ExtrudeGeometry triangulates with outward normals.
    const outerPts = outer.map(([x, z]) => new THREE.Vector2(x, -z));
    if (THREE.ShapeUtils.isClockWise(outerPts)) outerPts.reverse();
    const shape = new THREE.Shape(outerPts);
    for (const hole of holes) {
      const holePts = hole.map(([x, z]) => new THREE.Vector2(x, -z));
      if (!THREE.ShapeUtils.isClockWise(holePts)) holePts.reverse();
      shape.holes.push(new THREE.Path(holePts));
    }
    const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 12 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, y0, 0);
    g.computeVertexNormals();
    geometries.push(g);
  }

  if (geometries.length === 0) return new THREE.BufferGeometry();
  const merged = mergeBufferGeometries(geometries);
  geometries.forEach((g) => g.dispose());
  applyArchitecturalBoxUVs(merged, uvScale);
  return merged;
}

export function mergeBufferGeometries(geometries: ReadonlyArray<THREE.BufferGeometry>): THREE.BufferGeometry {
  const valid = geometries.filter((g) => g.getAttribute('position') && g.getAttribute('position').count > 0);
  if (valid.length === 0) return new THREE.BufferGeometry();

  // Convert all to non-indexed so attribute concatenation is exact and simple
  const nonIndexed = valid.map((g) => (g.index ? g.toNonIndexed() : g.clone()));
  let totalVerts = 0;
  for (const g of nonIndexed) {
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    totalVerts += g.getAttribute('position').count;
  }

  const pos = new Float32Array(totalVerts * 3);
  const norm = new Float32Array(totalVerts * 3);
  const uv = new Float32Array(totalVerts * 2);

  let offset = 0;
  for (const g of nonIndexed) {
    const pAttr = g.getAttribute('position');
    const nAttr = g.getAttribute('normal');
    const uvAttr = g.getAttribute('uv');
    const count = pAttr.count;
    for (let i = 0; i < count; i++) {
      const vi = offset + i;
      pos[vi * 3] = pAttr.getX(i);
      pos[vi * 3 + 1] = pAttr.getY(i);
      pos[vi * 3 + 2] = pAttr.getZ(i);
      norm[vi * 3] = nAttr.getX(i);
      norm[vi * 3 + 1] = nAttr.getY(i);
      norm[vi * 3 + 2] = nAttr.getZ(i);
      if (uvAttr) {
        uv[vi * 2] = uvAttr.getX(i);
        uv[vi * 2 + 1] = uvAttr.getY(i);
      }
    }
    offset += count;
    g.dispose();
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

export function applyArchitecturalBoxUVs(
  g: THREE.BufferGeometry,
  size: number | readonly [number, number] = 36,
): THREE.BufferGeometry {
  const [su, sv] = typeof size === 'number' ? [size, size] : size;
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  if (!p || !n) return g;

  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    const [u, v] =
      ay >= ax && ay >= az
        ? [p.getX(i), p.getZ(i)]
        : ax >= az
          ? [p.getZ(i), p.getY(i)]
          : [p.getX(i), p.getY(i)];
    uv[2 * i] = u / su;
    uv[2 * i + 1] = v / sv;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

export function transformHitCorners(x: number, z: number, rotDeg: number, rect: HitRect): Vec2[] {
  const [a0, a1, b0, b1] = rect;
  const rad = (rotDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const local: Vec2[] = [
    [a0, b0],
    [a1, b0],
    [a1, b1],
    [a0, b1],
  ];
  return local.map(([lx, lz]) => [x + lx * c + lz * s, z - lx * s + lz * c] as const);
}

export function signedPolyArea(pts: ReadonlyArray<Vec2>): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + 1) % pts.length];
    sum += x1 * z2 - x2 * z1;
  }
  return sum * 0.5;
}

/** Exact Minkowski sum of a convex polygon with a disk of `radius` (positive-area simple polygon). */
export function expandConvexPoly(rawPts: ReadonlyArray<Vec2>, radius: number, arcSteps = 6): Vec2[] {
  if (rawPts.length < 3 || radius <= 0) return [...rawPts];
  const pts = signedPolyArea(rawPts) < 0 ? [...rawPts].reverse() : [...rawPts];
  const n = pts.length;
  // For positive signed area (x1*z2 - x2*z1 > 0), outward unit normal of edge (dx, dz) is (dz/L, -dx/L)
  const normals: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + 1) % n];
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz) || 1;
    normals.push([dz / len, -dx / len]);
  }

  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const [vx, vz] = pts[i];
    const nPrev = normals[(i + n - 1) % n];
    const nNext = normals[i];
    const a0 = Math.atan2(nPrev[1], nPrev[0]);
    let da = Math.atan2(nNext[1], nNext[0]) - a0;
    while (da < 0) da += Math.PI * 2;
    if (da > Math.PI * 1.999) da = 0;
    const steps = Math.max(1, Math.ceil((da / (Math.PI / 2)) * arcSteps));
    for (let s = 0; s <= steps; s++) {
      const a = a0 + (da * s) / steps;
      out.push([vx + radius * Math.cos(a), vz + radius * Math.sin(a)]);
    }
  }
  return out;
}

/** Exact stadium/capsule polygon of radius `radius` around segment `a -> b`. */
export function segmentCapsulePoly(a: Vec2, b: Vec2, radius: number, capSteps = 8): Vec2[] {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) {
    const pts: Vec2[] = [];
    for (let i = 0; i < capSteps * 2; i++) {
      const ang = (Math.PI * 2 * i) / (capSteps * 2);
      pts.push([a[0] + radius * Math.cos(ang), a[1] + radius * Math.sin(ang)]);
    }
    return pts;
  }
  const baseAng = Math.atan2(dz, dx);
  const out: Vec2[] = [];
  for (let i = 0; i <= capSteps; i++) {
    const ang = baseAng - Math.PI / 2 + (Math.PI * i) / capSteps;
    out.push([b[0] + radius * Math.cos(ang), b[1] + radius * Math.sin(ang)]);
  }
  for (let i = 0; i <= capSteps; i++) {
    const ang = baseAng + Math.PI / 2 + (Math.PI * i) / capSteps;
    out.push([a[0] + radius * Math.cos(ang), a[1] + radius * Math.sin(ang)]);
  }
  return out;
}

export function polyAABB(pts: ReadonlyArray<Vec2>): { x0: number; z0: number; x1: number; z1: number } {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const [x, z] of pts) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  return { x0, z0, x1, z1 };
}

/** Separating-axis test for convex polygons; true if overlap depth exceeds `eps`. */
export function convexPolysOverlap(P: ReadonlyArray<Vec2>, Q: ReadonlyArray<Vec2>, eps = 0.4): boolean {
  for (const poly of [P, Q]) {
    for (let i = 0; i < poly.length; i++) {
      const [x1, z1] = poly[i];
      const [x2, z2] = poly[(i + 1) % poly.length];
      let nx = z1 - z2;
      let nz = x2 - x1;
      const len = Math.hypot(nx, nz);
      if (len < 1e-9) continue;
      nx /= len;
      nz /= len;
      let pa = Infinity;
      let pb = -Infinity;
      let qa = Infinity;
      let qb = -Infinity;
      for (const [x, z] of P) {
        const v = x * nx + z * nz;
        if (v < pa) pa = v;
        if (v > pb) pb = v;
      }
      for (const [x, z] of Q) {
        const v = x * nx + z * nz;
        if (v < qa) qa = v;
        if (v > qb) qb = v;
      }
      if (Math.min(pb, qb) - Math.max(pa, qa) <= eps) return false;
    }
  }
  return true;
}

export function pointInConvexPoly([x, z]: Vec2, poly: ReadonlyArray<Vec2>): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i];
    const [x2, z2] = poly[(i + 1) % poly.length];
    const c = (x2 - x1) * (z - z1) - (z2 - z1) * (x - x1);
    if (Math.abs(c) < 1e-9) continue;
    const s = Math.sign(c);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

export function minPolygonGap(a: ReadonlyArray<Vec2>, b: ReadonlyArray<Vec2>): number | null {
  if (convexPolysOverlap(a, b, 0)) return null;
  const distToSegment = (p: Vec2, q: Vec2, r: Vec2): number => {
    const dx = r[0] - q[0];
    const dz = r[1] - q[1];
    const denom = dx * dx + dz * dz;
    const t = denom > 1e-9 ? Math.max(0, Math.min(1, ((p[0] - q[0]) * dx + (p[1] - q[1]) * dz) / denom)) : 0;
    return Math.hypot(p[0] - q[0] - t * dx, p[1] - q[1] - t * dz);
  };
  let gap = Infinity;
  for (const [pts, edges] of [
    [a, b],
    [b, a],
  ] as const) {
    for (const pt of pts) {
      for (let i = 0; i < edges.length; i++) {
        gap = Math.min(gap, distToSegment(pt, edges[i], edges[(i + 1) % edges.length]));
      }
    }
  }
  return gap;
}
