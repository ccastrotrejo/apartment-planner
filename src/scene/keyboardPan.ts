/** Keyboard camera panning: WASD always, arrow keys unless they are nudging a selected piece. */

const KEY_DIRS: Readonly<Record<string, readonly [number, number]>> = {
  w: [0, 1],
  s: [0, -1],
  a: [-1, 0],
  d: [1, 0],
  arrowup: [0, 1],
  arrowdown: [0, -1],
  arrowleft: [-1, 0],
  arrowright: [1, 0],
};

/** Normalized key name if `key` pans the camera in the current state, otherwise null. */
export function panKeyFor(key: string, arrowsNudgePiece: boolean): string | null {
  const k = key.toLowerCase();
  if (!(k in KEY_DIRS)) return null;
  if (arrowsNudgePiece && k.startsWith('arrow')) return null;
  return k;
}

/** Screen-relative [right, forward] intent for the held keys, normalized so diagonals aren't faster. */
export function panIntent(held: ReadonlySet<string>): [number, number] {
  let right = 0;
  let forward = 0;
  for (const k of held) {
    const d = KEY_DIRS[k];
    if (!d) continue;
    right += d[0];
    forward += d[1];
  }
  right = Math.sign(right);
  forward = Math.sign(forward);
  const len = Math.hypot(right, forward);
  return len > 0 ? [right / len, forward / len] : [0, 0];
}

/** True when keyboard focus is somewhere typing should win (inputs, selects, editable text). */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  return !!el.closest('input, textarea, select, [contenteditable="true"], dialog');
}
