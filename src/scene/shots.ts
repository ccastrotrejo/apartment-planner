import type { SolvedPlan } from '../types';

export type Vec3 = readonly [number, number, number];

export interface CameraShot {
  readonly name: string;
  readonly position: Vec3;
  readonly target: Vec3;
}

/**
 * Composed showcase viewpoints (inches, plan coordinates). Each frames a lit subject against
 * a darker foreground, following docs/VISUAL_BRIEF.md. Used by `?shot=N` and the visual QA harness.
 */
export function showcaseShots(plan: SolvedPlan): CameraShot[] {
  const [x0, z0, x1, z1] = plan.bounds;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  return [
    { name: 'overview', position: [cx - 330, 430, cz + 380], target: [cx, 0, cz] },
    { name: 'living', position: [175, 165, 215], target: [55, 18, 70] },
    { name: 'bedroom', position: [95, 160, 205], target: [195, 18, 62] },
    { name: 'kitchen', position: [225, 165, 340], target: [80, 28, 262] },
    { name: 'bath', position: [95, 150, 370], target: [172, 18, 282] },
    { name: 'window-eye', position: [128, 62, 175], target: [45, 42, 0] },
  ];
}

/** Resolve `?shot=N` (1-based) or `?cam=px,py,pz,tx,ty,tz` from a query string. */
export function shotFromQuery(search: string, plan: SolvedPlan): CameraShot | null {
  const params = new URLSearchParams(search);
  const cam = params.get('cam');
  if (cam) {
    const n = cam.split(',').map(Number);
    if (n.length === 6 && n.every(Number.isFinite)) {
      return { name: 'custom', position: [n[0], n[1], n[2]], target: [n[3], n[4], n[5]] };
    }
  }
  const shot = Number(params.get('shot'));
  if (!Number.isInteger(shot) || shot < 1) return null;
  return showcaseShots(plan)[shot - 1] ?? null;
}
