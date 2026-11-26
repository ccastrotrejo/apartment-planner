import type { PlacementTuple, SavedLayout } from '../types';

const MAX_LAYOUT_ITEMS = 200;
const MAX_LAYOUT_CODE_LENGTH = 32_768;
const MAX_SAVED_LAYOUTS = 100;
const MAX_COORD_ABS = 5_000;

export function ft(feet: number, inches = 0): number {
  return 12 * feet + inches;
}

export function fmtFtIn(inches: number): string {
  const rounded = Math.round(inches);
  const f = Math.floor(rounded / 12);
  const rem = rounded - 12 * f;
  if (f === 0) return `${rem}″`;
  if (rem === 0) return `${f}′`;
  return `${f}′ ${rem}″`;
}

export function fmtInch(v: number): string {
  return (Math.round(v * 2) / 2).toString().replace('.5', '½') + '″';
}

const DIRS = ['south', 'southeast', 'east', 'northeast', 'north', 'northwest', 'west', 'southwest'] as const;

export function facingLabel(deg: number): string {
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return DIRS[idx];
}

export function normAngle(deg: number): number {
  let a = ((deg % 360) + 360) % 360;
  if (a > 180) a -= 360;
  return Math.round(a * 10) / 10;
}

export function niceName(raw: string): string {
  return raw.replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function sanitizePlacementTuples(
  raw: unknown,
  isValidPiece: (key: string) => boolean,
  strict = false,
): PlacementTuple[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_LAYOUT_ITEMS) return null;
  const out: PlacementTuple[] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 4) {
      if (strict) return null;
      continue;
    }
    const [k, x, z, r] = row;
    if (typeof k !== 'string' || !isValidPiece(k)) {
      if (strict) return null;
      continue;
    }
    const nx = Number(x);
    const nz = Number(z);
    const nr = Number(r);
    if (
      !Number.isFinite(nx) ||
      !Number.isFinite(nz) ||
      !Number.isFinite(nr) ||
      Math.abs(nx) > MAX_COORD_ABS ||
      Math.abs(nz) > MAX_COORD_ABS
    ) {
      if (strict) return null;
      continue;
    }
    out.push([k, nx, nz, normAngle(nr)]);
  }
  return out;
}

export function sanitizeSavedLayouts(
  raw: unknown,
  isValidPiece: (key: string) => boolean,
): SavedLayout[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const entries = Object.entries(raw as Record<string, unknown>).slice(0, MAX_SAVED_LAYOUTS);
  const out: SavedLayout[] = [];
  for (const [id, val] of entries) {
    if (!id || !val || typeof val !== 'object' || Array.isArray(val)) continue;
    const rec = val as Record<string, unknown>;
    const name = typeof rec.name === 'string' && rec.name.trim() ? rec.name.trim().slice(0, 60) : 'Untitled';
    const at = typeof rec.at === 'number' && Number.isFinite(rec.at) ? rec.at : 0;
    const items = sanitizePlacementTuples(rec.items, isValidPiece, false);
    if (!items) continue;
    out.push({ id, name, at, items });
  }
  return out.sort((a, b) => b.at - a.at);
}

export function encodeLayoutCode(items: ReadonlyArray<PlacementTuple>, prefix = 'A4'): string {
  const clean = items
    .slice(0, MAX_LAYOUT_ITEMS)
    .map(([k, x, z, r]) => [k, Math.round(x * 100) / 100, Math.round(z * 100) / 100, normAngle(r)]);
  return `${prefix}:${btoa(JSON.stringify(clean))}`;
}

export function decodeLayoutCode(
  raw: string,
  isValidPiece: (key: string) => boolean,
): PlacementTuple[] | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_LAYOUT_CODE_LENGTH) return null;
  try {
    const body = trimmed.replace(/^[A-Za-z0-9_-]+:/, '');
    const parsed: unknown = JSON.parse(atob(body));
    return sanitizePlacementTuples(parsed, isValidPiece, true);
  } catch {
    return null;
  }
}

export function sameLayoutItems(
  a: ReadonlyArray<PlacementTuple> | null | undefined,
  b: ReadonlyArray<PlacementTuple> | null | undefined,
): boolean {
  if (!a || !b || a.length !== b.length) return false;
  const key = (list: ReadonlyArray<PlacementTuple>) =>
    list
      .map(([k, x, z, r]) => `${k}:${Math.round(x * 10)}:${Math.round(z * 10)}:${normAngle(r)}`)
      .sort()
      .join('|');
  return key(a) === key(b);
}
