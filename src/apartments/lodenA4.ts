import {
  cleanRing,
  rectsToRegion,
  signedPolyArea,
} from '../geometry/plan2d';
import type {
  ApartmentSpec,
  Axis,
  Compass,
  Obstacle,
  PlacementTuple,
  Rect4,
  SolvedDoor,
  SolvedFixture,
  SolvedPlan,
  SolvedRoom,
  SolvedWindow,
  Vec2,
} from '../types';
import { ft } from '../utils/units';
import { FURNITURE_CATALOG } from '../furniture/catalog';

const BATH = ['core_W_in', 'bath_E_in', 'bath_N', 'bath_S'] as const;

export const LODEN_A4_SPEC: ApartmentSpec = {
  id: 'loden-a4',
  title: 'A4 Furniture Planner',
  subtitle: 'Residence A4 · Loden, Brooklyn (1 BD / 1 BA · 546 SF)',
  totalSf: 546,
  wallHeight: 90,
  sillHeight: 18,
  meas: {
    liv_w: {
      axis: 'x',
      a: 'W_in',
      b: 'part_W',
      inches: ft(10, 9),
      use: 'used',
      note: 'Living area width, west wall to bedroom partition (brochure 10′9″)',
    },
    liv_d: {
      axis: 'y',
      a: 'N_in',
      b: 'liv_S',
      inches: ft(15, 11),
      use: 'used',
      note: 'Living area depth, windows to south wall (brochure 15′11″)',
    },
    bed_w: {
      axis: 'x',
      a: 'bed_W',
      b: 'bed_E',
      inches: ft(9),
      use: 'used',
      note: 'Primary bedroom width, partition to east wall (brochure 9′0″)',
    },
    bed_d: {
      axis: 'y',
      a: 'cap_bot',
      b: 'bed_S',
      inches: ft(10),
      use: 'used',
      note: 'Primary bedroom depth, north piers to south wall (brochure 10′0″)',
    },
  },
  pxX: {
    wwin_out: 577, W_out: 584, wwin_in: 594, W_in: 606, pier_E: 614,
    kit_W_out: 687, kit_W_in: 709, counter: 776, block_E: 779, range_front: 781, fridge: 793,
    entry_L: 837, col_W: 892, entry_R: 942, core_W: 951, part_W: 962, core_W_in: 965,
    bed_W: 975, bwin_L: 1031, cl_E_in: 1034, cl_E_out: 1055, wd_E: 1068, bcl_W: 1095,
    bcl_W_in: 1110, tub_E: 1135, bath_E_in: 1153, tubchase_E: 1156, chase_E: 1174,
    bcl_E_in: 1192, bcl_E_out: 1213, bed_E: 1275, bwin_R: 1293, bedE_out: 1297, NE_out: 1314,
  },
  pxY: {
    N_out: 190, N_in: 207, cap_bot: 223, ne_bot: 245, col_bot: 307, pier_top: 309,
    pier_bot: 358, bed_S: 552, bed_S_out: 572, door_top: 614, door_bot: 702,
    bcl_door_bot: 711, alc_S: 718, liv_S: 737, alc_S_out: 740, wd_door_top: 741,
    liv_S_out: 758, wd_door_bot: 823, wd_S: 832, bath_N: 859, bath_door_top: 879,
    bath_door_bot: 966, range_top: 984, tub_N: 1048, range_bot: 1067, bath_E_bot: 1069,
    fridge_top: 1098, bath_S: 1136, cl_N: 1149, bath_S_out: 1157, cl_door_top: 1163,
    fridge_bot: 1181, cl_door_mid: 1213, cl_door_bot: 1263, S_in: 1268, S_out: 1289,
  },
  origin: { x: 'W_in', y: 'N_in' },
  walls: [
    ['col_W', 'bed_W', 'N_out', 'col_bot'],
    ['bed_W', 'bwin_L', 'N_out', 'cap_bot'],
    ['bwin_R', 'NE_out', 'N_out', 'ne_bot'],
    ['bed_E', 'bedE_out', 'N_in', 'bed_S_out'],
    ['part_W', 'bed_W', 'col_bot', 'door_top'],
    ['part_W', 'bed_W', 'door_bot', 'alc_S'],
    ['bcl_W', 'bedE_out', 'bed_S', 'bed_S_out'],
    ['bcl_W', 'bcl_W_in', 'bcl_door_bot', 'alc_S'],
    ['bcl_E_in', 'bcl_E_out', 'bed_S_out', 'alc_S_out'],
    ['core_W', 'bcl_E_out', 'alc_S', 'alc_S_out'],
    ['wd_E', 'chase_E', 'alc_S', 'bath_N'],
    ['core_W', 'core_W_in', 'alc_S', 'wd_door_top'],
    ['core_W', 'core_W_in', 'wd_door_bot', 'bath_door_top'],
    ['core_W', 'core_W_in', 'bath_door_bot', 'cl_door_top'],
    ['core_W', 'core_W_in', 'cl_door_bot', 'S_in'],
    ['core_W_in', 'wd_E', 'wd_S', 'bath_N'],
    ['bath_E_in', 'chase_E', 'bath_N', 'bath_E_bot'],
    ['tub_E', 'tubchase_E', 'tub_N', 'bath_S'],
    ['core_W_in', 'cl_E_in', 'bath_S', 'cl_N'],
    ['cl_E_in', 'tubchase_E', 'bath_S', 'bath_S_out'],
    ['cl_E_in', 'cl_E_out', 'bath_S_out', 'S_out'],
    ['entry_R', 'cl_E_out', 'S_in', 'S_out'],
    ['kit_W_out', 'entry_L', 'S_in', 'S_out'],
    ['kit_W_out', 'block_E', 'fridge_bot', 'S_in'],
    ['kit_W_out', 'kit_W_in', 'liv_S', 'S_in'],
    ['W_out', 'kit_W_in', 'liv_S', 'liv_S_out'],
    ['W_out', 'W_in', 'pier_bot', 'liv_S'],
    ['wwin_out', 'pier_E', 'pier_top', 'pier_bot'],
  ],
  windows: [
    { rect: ['wwin_out', 'col_W', 'N_out', 'N_in'], kind: 'sill', name: 'living, north' },
    { rect: ['wwin_out', 'wwin_in', 'N_in', 'pier_top'], kind: 'sill', name: 'living, west (corner)' },
    { rect: ['bwin_L', 'bwin_R', 'N_out', 'N_in'], kind: 'sill', name: 'bedroom, north' },
  ],
  entryOpening: ['entry_L', 'entry_R', 'S_in', 'S_out'],
  doors: [
    { name: 'entry', hinge: ['entry_R', 'S_in'], tip: ['entry_L', 'S_in'], swing: [0, -1] },
    { name: 'bedroom', hinge: ['bed_W', 'door_bot'], tip: ['bed_W', 'door_top'], swing: [1, 0] },
    { name: 'bath', hinge: ['core_W_in', 'bath_door_top'], tip: ['core_W_in', 'bath_door_bot'], swing: [1, 0] },
    { name: 'W/D', hinge: ['core_W', 'wd_door_bot'], tip: ['core_W', 'wd_door_top'], swing: [-1, 0] },
    { name: 'hall closet, north leaf', hinge: ['core_W', 'cl_door_top'], tip: ['core_W', 'cl_door_mid'], swing: [-1, 0] },
    { name: 'hall closet, south leaf', hinge: ['core_W', 'cl_door_bot'], tip: ['core_W', 'cl_door_mid'], swing: [-1, 0] },
  ],
  sliders: [
    { name: 'bedroom closet', x: ['bcl_W', 'bcl_W_in'], y: ['bed_S_out', 'bcl_door_bot'] },
  ],
  fixtures: [
    {
      name: 'counter',
      rect: ['kit_W_in', 'counter', 'liv_S', 'range_top'],
      h: 36,
      kind: 'cabinets',
      front: 'E',
      sink: [713, 772, 809, 898],
    },
    { name: 'range', rect: ['kit_W_in', 'range_front', 'range_top', 'range_bot'], h: 36, kind: 'range', front: 'E' },
    { name: 'counter', rect: ['kit_W_in', 'counter', 'range_bot', 'fridge_top'], h: 36, kind: 'cabinets', front: 'E' },
    { name: 'fridge', rect: ['kit_W_in', 'fridge', 'fridge_top', 'fridge_bot'], h: 70, kind: 'fridge', front: 'E' },
    { name: 'tub', rect: ['core_W_in', 'tub_E', 'tub_N', 'bath_S'], h: 20, kind: 'tub', front: 'N' },
    { name: 'vanity', rect: [1090, 1153, 974, 1048], frame: BATH, h: 34, kind: 'vanity', front: 'W' },
    { name: 'toilet tank', rect: [1133, 1153, 887, 937], frame: BATH, h: 29 },
    { name: 'toilet bowl', rect: [1078, 1133, 892, 933], frame: BATH, h: 15, shape: 'oval', kind: 'toilet' },
    {
      name: 'washer/dryer',
      rect: [985, 1048, 750, 813],
      frame: ['core_W_in', 'wd_E', 'alc_S_out', 'wd_S'],
      h: 76,
      kind: 'appliance',
    },
  ],
  rooms: [
    { name: 'PRIMARY BEDROOM', at: [1125, 385], size: ['bed_W', 'bed_E', 'cap_bot', 'bed_S'] },
    { name: 'KITCHEN', at: [865, 940], size: null },
    { name: 'LIVING AREA', at: [785, 450], size: ['W_in', 'part_W', 'N_in', 'liv_S'] },
    { name: 'BATH', at: [1065, 965], size: BATH },
    { name: 'CL', at: [1170, 643], size: ['bcl_W_in', 'bcl_E_in', 'bed_S_out', 'alc_S'] },
    { name: 'CL', at: [1012, 1208], size: ['core_W_in', 'cl_E_in', 'cl_N', 'S_in'] },
  ],
  wetFloors: [
    ['core_W', 'bath_E_in', 'bath_N', 'bath_S'],
    ['core_W', 'wd_E', 'alc_S_out', 'wd_S'],
  ],
  wetDoors: ['bath', 'W/D'],
  bathTile: ['core_W_in', 'bath_E_in', 'bath_N', 'bath_S'],
  example: [
    ['sectional', 32, 120, 90],
    ['rug-6x9', 62, 104, 90],
    ['coffee-table', 64.5, 104, -90],
    ['tv-stand', 127.2, 104, -90],
    ['standing-desk', 57.5, 11.7, 0],
    ['office-chair', 57.5, 30.4, 180],
    ['queen-bed', 201.2, 62.9, -90],
    ['nightstand', 233.85, 22.2, -90],
    ['nightstand', 233.85, 103.6, -90],
    ['gallery-prints', 241.0, 62.9, -90],
    ['bike-black', 142.8, 84, 90],
    ['shoe-cabinet', 67.5, 367.5, 90],
    ['coat-rack', 117, 236, 0],
    ['arched-mirror', 137.25, 137, 90],
    ['hall-cabinet', 121, 59, -90],
    ['tier-shelf', 104, 42.5, 0],
    ['counter-stool', 70.75, 200, 90],
    ['counter-stool', 70.75, 218, 90],
    ['torchiere-lamp', 11, 45, 0],
    ['tripod-lamp', 217.7, 9, 0],
    ['plant-monstera', 14, 6, 0],
    ['plant-zz', 93, 5, 0],
  ],
  guestMoves: {
    'coffee-table': [],
    'office-chair': [[57.5, 24, 180]],
  },
  ideas: [
    {
      name: 'Desk at the corner window',
      note: 'Standing desk turned to face the west window; the north window stays open for plants and the lamp.',
      moves: {
        'standing-desk': [[14.1, 28.7, 90]],
        'office-chair': [[38.9, 28.7, -90]],
        'torchiere-lamp': [[65, 9, 0]],
        'plant-monstera': [[37, 6, 0]],
      },
    },
    {
      name: 'Open lounge',
      note: 'The coffee table, rug, and side shelf are removed for the widest uninterrupted circulation and a clear center floor.',
      moves: {
        'coffee-table': [],
        'rug-6x9': [],
        'tier-shelf': [],
      },
    },
    {
      name: 'Guest ready',
      note: 'The coffee table is stored away so the sectional can be used as a bed, and the desk chair is tucked under the desk.',
      moves: {
        'coffee-table': [],
        'office-chair': [[57.5, 24, 180]],
      },
    },
  ],
  allowedLayoutExceptions: [
    {
      requiredPieces: [
        ['bike-black', 142.8, 84, 90],
        ['queen-bed', 201.2, 62.9, -90],
      ],
      allowedProblem: 'no 24" access to the left of queen bed',
    },
  ],
};

export function buildIdeaItems(
  base: ReadonlyArray<PlacementTuple>,
  moves: Record<string, ReadonlyArray<readonly [number, number, number]>>,
): PlacementTuple[] {
  const out: PlacementTuple[] = [];
  const used: Record<string, number> = {};
  for (const [k, x, z, r] of base) {
    if (Object.prototype.hasOwnProperty.call(moves, k)) {
      const idx = used[k] ?? 0;
      used[k] = idx + 1;
      const replacements = moves[k];
      if (idx < replacements.length) {
        const [nx, nz, nr] = replacements[idx];
        out.push([k, nx, nz, nr]);
      }
    } else {
      out.push([k, x, z, r]);
    }
  }
  return out;
}

export function migrateLegacyLayoutItems(
  items: ReadonlyArray<PlacementTuple>,
  example: ReadonlyArray<PlacementTuple> = LODEN_A4_SPEC.example,
): PlacementTuple[] {
  const previous: Record<string, ReadonlyArray<readonly [number, number, number]>> = {
    'bike-black': [
      [48, 182, 180],
      [232.6, 62.9, -90],
    ],
    'tv-stand': [[121, 104, -90]],
  };
  const updated = new Map<string, readonly [number, number, number]>();
  for (const [k, x, z, r] of example) {
    updated.set(k, [x, z, r]);
  }
  const out: PlacementTuple[] = [];
  for (const [k, x, z, r] of items) {
    if (!FURNITURE_CATALOG[k]) continue;
    const prevList = previous[k];
    const match = prevList?.some(([px, pz, pr]) => px === x && pz === z && pr === r);
    if (match && updated.has(k)) {
      const [ux, uz, ur] = updated.get(k)!;
      out.push([k, ux, uz, ur]);
    } else {
      out.push([k, x, z, r]);
    }
  }
  return out;
}

function solveAxis(spec: ApartmentSpec, axis: Axis): Record<string, number> {
  const P = axis === 'x' ? spec.pxX : spec.pxY;
  let pxSum = 0;
  let inSum = 0;
  for (const m of Object.values(spec.meas)) {
    if (m.axis === axis && m.use === 'used') {
      pxSum += Math.abs(P[m.b] - P[m.a]);
      inSum += m.inches;
    }
  }
  const scale = pxSum / inSum;
  const originKey = axis === 'x' ? spec.origin.x : spec.origin.y;
  const D: Record<string, number> = { [originKey]: 0 };
  const meas = Object.values(spec.meas).filter((m) => m.axis === axis && m.use === 'used');

  while (true) {
    let progress = false;
    for (const m of meas) {
      if (m.a in D && !(m.b in D)) {
        D[m.b] = D[m.a] + m.inches;
        progress = true;
      } else if (m.b in D && !(m.a in D)) {
        D[m.a] = D[m.b] - m.inches;
        progress = true;
      }
    }
    const pending = meas.flatMap((m) => [m.a, m.b]).filter((n) => !(n in D));
    if (pending.length === 0) break;
    if (!progress) {
      let bestN = pending[0];
      let bestRef = Object.keys(D)[0];
      let bestDist = Infinity;
      for (const n of pending) {
        for (const r of Object.keys(D)) {
          const dist = Math.abs(P[n] - P[r]);
          if (dist < bestDist) {
            bestDist = dist;
            bestN = n;
            bestRef = r;
          }
        }
      }
      D[bestN] = D[bestRef] + (P[bestN] - P[bestRef]) / scale;
    }
  }

  const anchors = Object.keys(D).sort((a, b) => P[a] - P[b]);
  for (const n of Object.keys(P)) {
    if (n in D) continue;
    const lo = anchors.filter((k) => P[k] <= P[n]);
    const hi = anchors.filter((k) => P[k] >= P[n]);
    if (lo.length > 0 && hi.length > 0 && P[hi[0]] !== P[lo[lo.length - 1]]) {
      const a = lo[lo.length - 1];
      const b = hi[0];
      D[n] = D[a] + ((P[n] - P[a]) / (P[b] - P[a])) * (D[b] - D[a]);
    } else if (lo.length > 0) {
      const a = lo[lo.length - 1];
      D[n] = D[a] + (P[n] - P[a]) / scale;
    } else {
      const b = hi[0];
      D[n] = D[b] - (P[b] - P[n]) / scale;
    }
  }
  return D;
}

function measuredBetween(spec: ApartmentSpec, axis: Axis, a: string, b: string): boolean {
  const adj = new Map<string, Set<string>>();
  for (const m of Object.values(spec.meas)) {
    if (m.axis === axis && m.use === 'used') {
      if (!adj.has(m.a)) adj.set(m.a, new Set());
      if (!adj.has(m.b)) adj.set(m.b, new Set());
      adj.get(m.a)!.add(m.b);
      adj.get(m.b)!.add(m.a);
    }
  }
  const seen = new Set<string>([a]);
  const stack = [a];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const nxt of adj.get(cur) ?? []) {
      if (!seen.has(nxt)) {
        seen.add(nxt);
        stack.push(nxt);
      }
    }
  }
  return seen.has(b);
}

function overhangTrim([x0, z0, x1, z1]: Rect4, face: Compass, inches: number): Rect4 {
  switch (face) {
    case 'E':
      return [x0, z0, x1 - inches, z1];
    case 'W':
      return [x0 + inches, z0, x1, z1];
    case 'S':
      return [x0, z0, x1, z1 - inches];
    case 'N':
      return [x0, z0 + inches, x1, z1];
  }
}

export function solveApartmentPlan(spec: ApartmentSpec = LODEN_A4_SPEC): SolvedPlan {
  const X = solveAxis(spec, 'x');
  const Y = solveAxis(spec, 'y');

  const resolveRect = (
    r: readonly [string | number, string | number, string | number, string | number],
    frame?: readonly [string, string, string, string],
  ): Rect4 => {
    let x0: number;
    let x1: number;
    let z0: number;
    let z1: number;
    if (!frame) {
      x0 = X[r[0] as string];
      x1 = X[r[1] as string];
      z0 = Y[r[2] as string];
      z1 = Y[r[3] as string];
    } else {
      const [fx0, fx1, fy0, fy1] = frame;
      const mx = (p: number) =>
        X[fx0] + ((X[fx1] - X[fx0]) * (p - spec.pxX[fx0])) / (spec.pxX[fx1] - spec.pxX[fx0]);
      const my = (p: number) =>
        Y[fy0] + ((Y[fy1] - Y[fy0]) * (p - spec.pxY[fy0])) / (spec.pxY[fy1] - spec.pxY[fy0]);
      x0 = mx(Number(r[0]));
      x1 = mx(Number(r[1]));
      z0 = my(Number(r[2]));
      z1 = my(Number(r[3]));
    }
    return [
      Math.min(x0, x1),
      Math.min(z0, z1),
      Math.max(x0, x1),
      Math.max(z0, z1),
    ];
  };

  const walls: Rect4[] = spec.walls.map((w) => resolveRect(w));
  const windows: SolvedWindow[] = spec.windows.map((w) => ({
    name: w.name,
    kind: w.kind,
    r: resolveRect(w.rect),
  }));
  const entryBounds = resolveRect(spec.entryOpening);

  // Outer apartment footprint = largest exterior ring of union(walls + windows + entryOpening)
  const shellRegion = rectsToRegion([...walls, ...windows.map((w) => w.r), entryBounds]);
  let footprint: Vec2[] = [];
  let bestArea = -Infinity;
  for (const poly of shellRegion) {
    if (poly.length === 0) continue;
    const outer = cleanRing(poly[0]);
    const a = Math.abs(signedPolyArea(outer));
    if (a > bestArea) {
      bestArea = a;
      footprint = outer;
    }
  }
  let bx0 = Infinity;
  let bz0 = Infinity;
  let bx1 = -Infinity;
  let bz1 = -Infinity;
  for (const [x, z] of footprint) {
    bx0 = Math.min(bx0, x);
    bz0 = Math.min(bz0, z);
    bx1 = Math.max(bx1, x);
    bz1 = Math.max(bz1, z);
  }
  const bounds: Rect4 = [
    Math.round(bx0 * 10) / 10,
    Math.round(bz0 * 10) / 10,
    Math.round(bx1 * 10) / 10,
    Math.round(bz1 * 10) / 10,
  ];

  const fixtures: SolvedFixture[] = spec.fixtures.map((def) => {
    const b = resolveRect(def.rect, def.frame);
    const sinkBounds = def.sink
      ? resolveRect(def.sink, def.rect as readonly [string, string, string, string])
      : undefined;
    return { def, bounds: b, sinkBounds };
  });

  const doors: SolvedDoor[] = spec.doors.map((d) => {
    const hx = X[d.hinge[0]];
    const hz = Y[d.hinge[1]];
    const tx = X[d.tip[0]];
    const tz = Y[d.tip[1]];
    const r = Math.hypot(tx - hx, tz - hz);
    const ox = hx + r * d.swing[0];
    const oz = hz + r * d.swing[1];
    const a0 = Math.atan2(tz - hz, tx - hx);
    const a1 = Math.atan2(oz - hz, ox - hx);
    let da = a1 - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    const poly: Vec2[] = [[hx, hz]];
    for (let i = 0; i <= 14; i++) {
      const a = a0 + (da * i) / 14;
      poly.push([hx + r * Math.cos(a), hz + r * Math.sin(a)]);
    }
    return {
      name: d.name,
      hinge: [hx, hz],
      closed: [tx, tz],
      open: [ox, oz],
      r,
      poly,
    };
  });

  const sliders: Vec2[][] = spec.sliders.map((s) => {
    const xa = X[s.x[0]];
    const xb = X[s.x[1]];
    const za = Y[s.y[0]];
    const zb = Y[s.y[1]];
    if (Math.abs(xb - xa) < Math.abs(zb - za)) {
      const xm = (xa + xb) / 2;
      return [
        [xm, za],
        [xm, zb],
      ];
    }
    const zm = (za + zb) / 2;
    return [
      [xa, zm],
      [xb, zm],
    ];
  });

  const obstacles: Obstacle[] = [
    ...walls.map((r): Obstacle => ({ kind: 'wall', r })),
    ...windows.map((w): Obstacle => ({ kind: w.kind === 'sill' ? 'window' : 'glass', r: w.r })),
    ...fixtures.map((f): Obstacle => ({
      kind: 'fixture',
      name: f.def.name,
      r: f.bounds,
      low: f.def.overhang ? overhangTrim(f.bounds, f.def.overhang.face, f.def.overhang.inches) : undefined,
    })),
  ];

  // Interpolate room label positions from brochure px
  const kx = Object.keys(X).sort((a, b) => spec.pxX[a] - spec.pxX[b]);
  const ky = Object.keys(Y).sort((a, b) => spec.pxY[a] - spec.pxY[b]);
  const interp = (px: number, keys: string[], pxMap: Record<string, number>, valMap: Record<string, number>) => {
    if (px <= pxMap[keys[0]]) return valMap[keys[0]];
    const last = keys[keys.length - 1];
    if (px >= pxMap[last]) return valMap[last];
    for (let i = 0; i < keys.length - 1; i++) {
      const k0 = keys[i];
      const k1 = keys[i + 1];
      if (px >= pxMap[k0] && px <= pxMap[k1]) {
        const t = pxMap[k1] === pxMap[k0] ? 0 : (px - pxMap[k0]) / (pxMap[k1] - pxMap[k0]);
        return valMap[k0] + t * (valMap[k1] - valMap[k0]);
      }
    }
    return valMap[last];
  };

  const rooms: SolvedRoom[] = spec.rooms
    .filter((r) => r.name !== 'CL')
    .map((r) => {
      const rx = interp(r.at[0], kx, spec.pxX, X);
      const rz = interp(r.at[1], ky, spec.pxY, Y);
      let size: readonly [number, number] | null = null;
      let measured = false;
      if (r.size) {
        const [x0n, x1n, y0n, y1n] = r.size;
        size = [Math.round((X[x1n] - X[x0n]) * 10) / 10, Math.round((Y[y1n] - Y[y0n]) * 10) / 10];
        measured = measuredBetween(spec, 'x', x0n, x1n) && measuredBetween(spec, 'y', y0n, y1n);
      }
      const label = r.name.charAt(0).toUpperCase() + r.name.slice(1).toLowerCase();
      return {
        name: label,
        at: [Math.round(rx * 10) / 10, Math.round(rz * 10) / 10],
        size,
        measured,
      };
    });

  const mainLayout = [...spec.example];
  const guestLayout = buildIdeaItems(spec.example, spec.guestMoves);
  const ideas = spec.ideas.map((i) => ({
    name: i.name,
    note: i.note,
    items: buildIdeaItems(spec.example, i.moves),
  }));

  return {
    spec,
    X,
    Y,
    bounds,
    footprint,
    walls,
    windows,
    entryBounds,
    doors,
    sliders,
    fixtures,
    obstacles,
    rooms,
    mainLayout,
    guestLayout,
    ideas,
  };
}
