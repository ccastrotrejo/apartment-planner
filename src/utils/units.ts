import type { PlacementTuple } from '../types';

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

export function encodeLayoutCode(items: ReadonlyArray<PlacementTuple>, prefix = 'A4'): string {
  const clean = items.map(([k, x, z, r]) => [k, Math.round(x * 100) / 100, Math.round(z * 100) / 100, normAngle(r)]);
  return `${prefix}:${btoa(JSON.stringify(clean))}`;
}

export function decodeLayoutCode(
  raw: string,
  isValidPiece: (key: string) => boolean,
): PlacementTuple[] | null {
  try {
    const body = raw.trim().replace(/^[A-Za-z0-9_-]+:/, '');
    const parsed: unknown = JSON.parse(atob(body));
    if (!Array.isArray(parsed)) return null;
    const out: PlacementTuple[] = [];
    for (const row of parsed) {
      if (!Array.isArray(row) || row.length < 4) return null;
      const [k, x, z, r] = row;
      if (typeof k !== 'string' || !isValidPiece(k)) return null;
      const nx = Number(x);
      const nz = Number(z);
      const nr = Number(r);
      if (!Number.isFinite(nx) || !Number.isFinite(nz) || !Number.isFinite(nr)) return null;
      out.push([k, nx, nz, normAngle(nr)]);
    }
    return out;
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
