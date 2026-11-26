import { describe, expect, it } from 'vitest';
import {
  buildIdeaItems,
  LODEN_A4_SPEC,
  migrateLegacyLayoutItems,
  solveApartmentPlan,
} from '../apartments/lodenA4';
import { FURNITURE_CATALOG } from '../furniture/catalog';
import { computeClearances, evaluateLayout } from '../layout/collision';
import { pieceWorldPolys, unexpectedLayoutProblems, WalkCheck } from '../layout/walkCheck';
import { buildApartmentGeometrySet } from '../scene/apartmentGeometries';
import { getFurnitureParts } from '../scene/furnitureGeometries';
import { decodeLayoutCode, encodeLayoutCode, ft } from '../utils/units';
import type { PlacementTuple } from '../types';

describe('Residence A4 floor-plan solver & circulation', () => {
  const plan = solveApartmentPlan(LODEN_A4_SPEC);
  const checker = new WalkCheck(plan);

  it('matches exact brochure dimensions for living room and primary bedroom', () => {
    expect(plan.X.part_W - plan.X.W_in).toBeCloseTo(ft(10, 9), 3);
    expect(plan.Y.liv_S - plan.Y.N_in).toBeCloseTo(ft(15, 11), 3);
    expect(plan.X.bed_E - plan.X.bed_W).toBeCloseTo(ft(9), 3);
    expect(plan.Y.bed_S - plan.Y.cap_bot).toBeCloseTo(ft(10), 3);
  });

  it('validates Standard, With guest, and all published Layout ideas with only the expected bike warning', () => {
    const assertOnlyExpectedBikeWarning = (items: ReadonlyArray<PlacementTuple>) => {
      expect(checker.problems(items)).toContain('no 24" access to the left of queen bed');
      expect(unexpectedLayoutProblems(checker, items)).toEqual([]);
    };

    assertOnlyExpectedBikeWarning(plan.mainLayout);
    assertOnlyExpectedBikeWarning(plan.guestLayout);
    for (const idea of plan.ideas) {
      assertOnlyExpectedBikeWarning(idea.items);
    }
  });

  it('rejects layouts that block bedroom circulation at the foot of the bed', () => {
    const bad = buildIdeaItems(LODEN_A4_SPEC.example, {
      'tv-stand': [[141.7, 60, 90]],
    });
    expect(unexpectedLayoutProblems(checker, bad).length).toBeGreaterThan(0);
  });

  it('migrates legacy placements and strips obsolete pieces without touching custom items', () => {
    const legacy: PlacementTuple[] = [
      ['bike-red-wall', 116.25, 310, -90],
      ['tv-stand', 121, 104, -90],
      ['bike-black', 232.6, 62.9, -90],
      ['nightstand', 233.85, 22.2, -90],
      ['bike-black', 200, 100, 180],
    ];
    expect(migrateLegacyLayoutItems(legacy)).toEqual([
      ['tv-stand', 127.2, 104, -90],
      ['bike-black', 142.8, 84, 90],
      ['nightstand', 233.85, 22.2, -90],
      ['bike-black', 200, 100, 180],
    ]);
  });

  it('mounts the road bike flush against the bedroom partition above bed height', () => {
    const bikeSpec = FURNITURE_CATALOG['bike-black'];
    const bedSpec = FURNITURE_CATALOG['queen-bed'];
    expect(bikeSpec.minY).toBeGreaterThan(bedSpec.size[2]);

    const bikePlacement = LODEN_A4_SPEC.example.find(([k]) => k === 'bike-black')!;
    const polys = pieceWorldPolys(...bikePlacement);
    for (const poly of polys) {
      const minX = Math.min(...poly.map(([x]) => x));
      const minZ = Math.min(...poly.map(([, z]) => z));
      const maxZ = Math.max(...poly.map(([, z]) => z));
      expect(Math.abs(minX - plan.X.bed_W)).toBeLessThanOrEqual(0.2);
      expect(minZ).toBeGreaterThanOrEqual(plan.Y.col_bot);
      expect(maxZ).toBeLessThanOrEqual(plan.Y.door_top);
    }
  });
});

function hasAnyNaN(arr: ArrayLike<number>): boolean {
  for (let i = 0; i < arr.length; i++) {
    if (Number.isNaN(arr[i])) return true;
  }
  return false;
}

describe('3D apartment & furniture geometry integrity', () => {
  const plan = solveApartmentPlan(LODEN_A4_SPEC);

  it('builds non-empty, NaN-free apartment shell and built-in fixture geometries within bounds', () => {
    const geoSet = buildApartmentGeometrySet(plan);
    const [bx0, bz0, bx1, bz1] = plan.bounds;

    for (const key of ['floorWood', 'floorTile', 'slabPlinth', 'wallFull', 'wallLow', 'baseboard'] as const) {
      const g = geoSet[key];
      const pos = g.getAttribute('position');
      expect(pos.count).toBeGreaterThan(0);
      expect(hasAnyNaN(pos.array)).toBe(false);
      g.computeBoundingBox();
      expect(g.boundingBox!.min.x).toBeGreaterThanOrEqual(bx0 - 1);
      expect(g.boundingBox!.max.x).toBeLessThanOrEqual(bx1 + 1);
      expect(g.boundingBox!.min.z).toBeGreaterThanOrEqual(bz0 - 1);
      expect(g.boundingBox!.max.z).toBeLessThanOrEqual(bz1 + 1);
    }
    expect(Object.keys(geoSet.fixtures).length).toBeGreaterThanOrEqual(12);
  });

  it('builds valid multi-material meshes for every catalog piece', () => {
    for (const key of Object.keys(FURNITURE_CATALOG)) {
      const parts = getFurnitureParts(key);
      expect(parts.length).toBeGreaterThan(0);
      for (const part of parts) {
        const pos = part.geometry.getAttribute('position');
        expect(pos.count).toBeGreaterThan(0);
        expect(hasAnyNaN(pos.array)).toBe(false);
      }
    }
  });

  it('evaluates live collisions, clearances, and portable layout codes accurately', () => {
    const placed = plan.mainLayout.map(([k, x, z, r], idx) => ({ id: idx + 1, k, x, z, r }));
    const summary = evaluateLayout(plan, placed);
    expect(summary.badCount).toBe(0);
    expect(summary.warnCount).toBe(1);
    expect(summary.statusText).toMatch(/between the bike and bed/);

    const sofa = summary.evaluated.find((i) => i.k === 'sectional')!;
    const clearances = computeClearances(plan, summary.evaluated, sofa.id);
    expect(clearances.E).toBeDefined();

    const encoded = encodeLayoutCode(plan.mainLayout);
    expect(encoded.startsWith('A4:')).toBe(true);
    const decoded = decodeLayoutCode(encoded, (k) => Boolean(FURNITURE_CATALOG[k]));
    expect(decoded).toEqual(plan.mainLayout);
  });
});
