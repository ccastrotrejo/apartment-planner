import { FURNITURE_CATALOG } from '../furniture/catalog';
import {
  convexPolysOverlap,
  minPolygonGap,
  pointInConvexPoly,
  polyAABB,
  rectToPoly,
  transformHitCorners,
} from '../geometry/plan2d';
import type {
  Clearances,
  Compass,
  EvaluatedItem,
  FurnitureSpec,
  HitRect,
  ItemMessage,
  PlacedItem,
  SolvedPlan,
} from '../types';
import { fmtInch, niceName } from '../utils/units';

const OBSTACLE_LABELS: Record<'wall' | 'window' | 'glass', string> = {
  wall: 'Runs into a wall',
  window: 'Runs into a window wall',
  glass: 'Runs into the window glass',
};

export function shapeRectsForSpec(spec: FurnitureSpec): ReadonlyArray<HitRect> {
  return spec.hits ?? [spec.hit];
}

export function sizeRectForSpec(spec: FurnitureSpec): HitRect {
  const [w, d] = spec.size;
  return [-w / 2, w / 2, -d / 2, d / 2];
}

export interface LayoutStatusSummary {
  readonly evaluated: EvaluatedItem[];
  readonly badCount: number;
  readonly warnCount: number;
  readonly statusKind: 'ok' | 'warn' | 'bad';
  readonly statusText: string;
}

export function evaluateLayout(plan: SolvedPlan, rawItems: ReadonlyArray<PlacedItem>): LayoutStatusSummary {
  const evaluated: EvaluatedItem[] = rawItems
    .filter((it) => Boolean(FURNITURE_CATALOG[it.k]))
    .map((it) => {
      const spec = FURNITURE_CATALOG[it.k];
      const hits = shapeRectsForSpec(spec).map((r) => transformHitCorners(it.x, it.z, it.r, r));
      return {
        ...it,
        y: spec.flat ? 0.04 : 0,
        on: null,
        bad: false,
        warn: false,
        msgs: [],
        hits,
      };
    });

  // Resolve stackable items if any
  for (let i = 0; i < evaluated.length; i++) {
    const it = evaluated[i];
    const spec = FURNITURE_CATALOG[it.k];
    if (!spec.stack?.length) continue;
    const hit0 = it.hits[0];
    const cx = hit0.reduce((acc, p) => acc + p[0], 0) / hit0.length;
    const cz = hit0.reduce((acc, p) => acc + p[1], 0) / hit0.length;
    const sup = evaluated.find(
      (o) => o.id !== it.id && spec.stack!.includes(o.k) && pointInConvexPoly([cx, cz], o.hits[0]),
    );
    if (sup) {
      const supSpec = FURNITURE_CATALOG[sup.k];
      (it as { on: number | null; y: number }).on = sup.id;
      (it as { y: number }).y = supSpec.deck ?? supSpec.size[2];
    }
  }

  const pushMsg = (it: { msgs: ItemMessage[] }, text: string, level: 'bad' | 'warn') => {
    if (!it.msgs.some((m) => m.text === text)) {
      it.msgs.push({ text, level });
    }
  };

  // Obstacles & door swings
  for (const it of evaluated) {
    const spec = FURNITURE_CATALOG[it.k];
    for (const obs of plan.obstacles) {
      const targetRect = spec.seat && obs.low ? obs.low : obs.r;
      const obsPoly = rectToPoly(targetRect);
      if (it.hits.some((h) => convexPolysOverlap(h, obsPoly, 0.4))) {
        const msg =
          obs.kind === 'fixture'
            ? `Overlaps the ${niceName(obs.name ?? 'fixture')}`
            : OBSTACLE_LABELS[obs.kind];
        pushMsg(it, msg, 'bad');
        (it as { bad: boolean }).bad = true;
      }
    }
    if (!spec.flat && it.on === null) {
      for (const door of plan.doors) {
        if (it.hits.some((h) => convexPolysOverlap(h, door.poly, 0.4))) {
          pushMsg(it, `In the swing of the ${niceName(door.name)} door`, 'warn');
          (it as { warn: boolean }).warn = true;
        }
      }
    }
  }

  // Piece-to-piece overlaps
  for (let i = 0; i < evaluated.length; i++) {
    for (let j = i + 1; j < evaluated.length; j++) {
      const a = evaluated[i];
      const b = evaluated[j];
      const da = FURNITURE_CATALOG[a.k];
      const db = FURNITURE_CATALOG[b.k];
      if (da.flat || db.flat || a.on !== null || b.on !== null) continue;
      if ((da.seat && db.tuck) || (db.seat && da.tuck)) continue;
      const aTop = a.y + da.size[2];
      const bTop = b.y + db.size[2];
      const aBot = a.y + (da.minY ?? 0);
      const bBot = b.y + (db.minY ?? 0);
      if (aTop <= bBot || bTop <= aBot) continue;

      if (a.hits.some((p) => b.hits.some((q) => convexPolysOverlap(p, q, 0.4)))) {
        pushMsg(a, `Overlaps the ${db.name.toLowerCase()}`, 'bad');
        pushMsg(b, `Overlaps the ${da.name.toLowerCase()}`, 'bad');
        (a as { bad: boolean }).bad = true;
        (b as { bad: boolean }).bad = true;
      }
    }
  }

  // Wall-hung bike to queen bed clearance warning (< 24")
  let clearanceWarning: string | null = null;
  const bikes = evaluated.filter((it) => it.k === 'bike-black');
  const beds = evaluated.filter((it) => it.k === 'queen-bed');
  for (const bike of bikes) {
    for (const bed of beds) {
      const gap = minPolygonGap(bike.hits[0], bed.hits[0]);
      if (gap === null || gap >= 24) continue;
      const message = `Only ${fmtInch(gap)} between the bike and bed`;
      pushMsg(bike, message, 'warn');
      (bike as { warn: boolean }).warn = true;
      clearanceWarning = message;
    }
  }

  let badCount = 0;
  let warnCount = 0;
  for (const it of evaluated) {
    if (it.bad) badCount++;
    else if (it.warn) warnCount++;
  }

  const statusKind: 'ok' | 'warn' | 'bad' = badCount > 0 ? 'bad' : warnCount > 0 ? 'warn' : 'ok';
  const statusText =
    badCount > 0
      ? `${badCount} piece${badCount > 1 ? 's' : ''} overlapping`
      : warnCount > 0
        ? clearanceWarning && warnCount === 1
          ? clearanceWarning
          : `${warnCount} placement warnings`
        : 'No conflicts';

  return { evaluated, badCount, warnCount, statusKind, statusText };
}

export function computeClearances(
  plan: SolvedPlan,
  items: ReadonlyArray<EvaluatedItem>,
  selectedId: number,
): Clearances {
  const target = items.find((it) => it.id === selectedId);
  if (!target) return {};
  const spec = FURNITURE_CATALOG[target.k];
  const ownRects = (spec.hits ?? [sizeRectForSpec(spec)]).map((r) =>
    polyAABB(transformHitCorners(target.x, target.z, target.r, r)),
  );

  const obs = plan.obstacles.map((o) => ({ x0: o.r[0], z0: o.r[1], x1: o.r[2], z1: o.r[3] }));
  if (!spec.flat) {
    for (const other of items) {
      if (other.id === target.id) continue;
      const oSpec = FURNITURE_CATALOG[other.k];
      if (oSpec.flat) continue;
      for (const r of oSpec.hits ?? [sizeRectForSpec(oSpec)]) {
        obs.push(polyAABB(transformHitCorners(other.x, other.z, other.r, r)));
      }
    }
  }

  const out: Clearances = {};
  const dirs: Compass[] = ['N', 'E', 'S', 'W'];
  for (const dir of dirs) {
    let best: { gap: number; mid: number; at: number } | null = null;
    for (const a of ownRects) {
      for (const o of obs) {
        let gap: number;
        let lo: number;
        let hi: number;
        let at: number;
        if (dir === 'E' || dir === 'W') {
          lo = Math.max(a.z0, o.z0);
          hi = Math.min(a.z1, o.z1);
          if (hi - lo < 0.5) continue;
          at = dir === 'E' ? a.x1 : a.x0;
          gap = dir === 'E' ? o.x0 - a.x1 : a.x0 - o.x1;
        } else {
          lo = Math.max(a.x0, o.x0);
          hi = Math.min(a.x1, o.x1);
          if (hi - lo < 0.5) continue;
          at = dir === 'S' ? a.z1 : a.z0;
          gap = dir === 'S' ? o.z0 - a.z1 : a.z0 - o.z1;
        }
        if (gap < -0.5) continue;
        const clamped = Math.max(0, gap);
        if (!best || clamped < best.gap) {
          best = { gap: clamped, mid: (lo + hi) / 2, at };
        }
      }
    }
    if (best && best.gap < 480) {
      out[dir] = best;
    }
  }
  return out;
}
