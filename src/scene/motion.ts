/** Motion helpers for the 3D stage. Durations/easings follow the product-UI rules in docs/VISUAL_BRIEF.md. */

/** Solve a CSS cubic-bezier(x1, y1, x2, y2) timing function for t ∈ [0, 1]. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s;
  const sampleY = (s: number) => ((ay * s + by) * s + cy) * s;
  const slopeX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let s = t;
    for (let i = 0; i < 6; i++) {
      const err = sampleX(s) - t;
      const d = slopeX(s);
      if (Math.abs(err) < 1e-5 || Math.abs(d) < 1e-6) break;
      s -= err / d;
    }
    return sampleY(Math.min(1, Math.max(0, s)));
  };
}

/** Strong ease-out for things responding to the user (enters, settles). */
export const easeOutUi = cubicBezier(0.32, 0.72, 0, 1);
/** Ease-in-out for on-screen movement (camera travel). */
export const easeInOutUi = cubicBezier(0.65, 0, 0.35, 1);

export const MOTION_MS = {
  cameraZoom: 280,
  cameraFit: 380,
  pieceSettle: 240,
} as const;

/** Frame-rate independent critically-damped approach toward `target` (interruptible, keeps no velocity). */
export function damp(current: number, target: number, lambda: number, dtSeconds: number): number {
  return target + (current - target) * Math.exp(-lambda * dtSeconds);
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
