import React, { useEffect, useMemo, useRef } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';

import { FURNITURE_CATALOG } from '../furniture/catalog';
import { transformHitCorners } from '../geometry/plan2d';
import { sizeRectForSpec } from '../layout/collision';
import { getFurnitureParts, getPartPlanEdges, getSoftContactShadowTexture } from './furnitureGeometries';
import { createRoleMaterial } from './materials';
import type { Clearances, EvaluatedItem } from '../types';

export const FurnitureItemMesh = React.memo(function FurnitureItemMesh({
  item,
  view,
  darkTheme,
  registerGroup,
  onPiecePointerDown,
}: {
  item: EvaluatedItem;
  view: '3d' | 'plan';
  darkTheme: boolean;
  registerGroup: (id: number, node: THREE.Group | null) => void;
  onPiecePointerDown: (e: ThreeEvent<PointerEvent>, item: EvaluatedItem) => void;
}) {
  const spec = FURNITURE_CATALOG[item.k];
  const parts = useMemo(() => getFurnitureParts(item.k), [item.k]);
  const materials = useMemo(
    () => parts.map((p) => createRoleMaterial(p.color, p.role)),
    [parts],
  );

  useEffect(() => {
    const hex = item.bad ? 0x8a1a12 : item.warn ? 0x6b4300 : 0x000000;
    parts.forEach((p, idx) => {
      const m = materials[idx];
      if (p.role === 'bulb' || p.role === 'shade') {
        if (item.bad || item.warn) m.emissive.setHex(hex);
        else m.emissive.setHex(p.role === 'bulb' ? 0xffdfad : 0xffe8c2);
      } else {
        m.emissive.setHex(hex);
        m.emissiveIntensity = item.bad || item.warn ? 0.55 : 0;
      }
    });
  }, [item.bad, item.warn, materials, parts]);

  useEffect(() => {
    return () => {
      materials.forEach((m) => m.dispose());
    };
  }, [materials]);

  const edgeMat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: darkTheme ? 0xe3eaeb : 0x1d2729,
        transparent: true,
        opacity: view === 'plan' ? 0.52 : 0.0,
        depthWrite: false,
      }),
    [darkTheme, view],
  );

  const shadowTex = useMemo(() => getSoftContactShadowTexture(), []);
  const showContactShadow = view === '3d' && !spec.flat && !spec.minY && shadowTex !== null;
  const hitRects = spec.hits ?? [spec.hit];

  return (
    <group
      ref={(node) => registerGroup(item.id, node)}
      position={[item.x, item.y, item.z]}
      rotation={[0, (item.r * Math.PI) / 180, 0]}
      onPointerDown={(e) => onPiecePointerDown(e, item)}
    >
      {/* Grounded ambient-occlusion contact shadow pads beneath floor-standing furniture */}
      {showContactShadow &&
        hitRects.map(([ax0, ax1, az0, az1], idx) => (
          <mesh
            key={`ao-${idx}`}
            position={[(ax0 + ax1) / 2, 0.03, (az0 + az1) / 2]}
            rotation={[-Math.PI / 2, 0, 0]}
            renderOrder={1}
          >
            <planeGeometry args={[(ax1 - ax0) * 1.16, (az1 - az0) * 1.16]} />
            <meshBasicMaterial map={shadowTex} transparent depthWrite={false} opacity={0.78} />
          </mesh>
        ))}

      {/* Practical warm 2700K light pool emitted by floor lamps (moves live when dragged!) */}
      {view === '3d' && item.k === 'torchiere-lamp' && (
        <pointLight position={[0, 66, 0]} color={0xffe3b8} intensity={210} distance={115} decay={2} />
      )}
      {view === '3d' && item.k === 'tripod-lamp' && (
        <pointLight position={[0, 54, 0]} color={0xffdfad} intensity={190} distance={105} decay={2} />
      )}

      {parts.map((p, idx) => {
        const planEdges = view === 'plan' ? getPartPlanEdges(p) : null;
        return (
          <React.Fragment key={idx}>
            <mesh
              geometry={p.geometry}
              material={materials[idx]}
              castShadow={!spec.flat && view === '3d'}
              receiveShadow
            />
            {planEdges && <lineSegments geometry={planEdges} material={edgeMat} />}
          </React.Fragment>
        );
      })}
    </group>
  );
});

export function SelectionAndDimensionLines({
  items,
  selectedId,
  clearances,
  darkTheme,
}: {
  items: ReadonlyArray<EvaluatedItem>;
  selectedId: number | null;
  clearances: Clearances;
  darkTheme: boolean;
}) {
  const { size, invalidate } = useThree();
  const groupRef = useRef<THREE.Group>(null);

  // Three shared shader materials, recolored/resized in place instead of recompiled on every drag tick.
  const lineMats = useMemo(
    () => ({
      selected: new LineMaterial({ linewidth: 2.8, depthTest: false }),
      bad: new LineMaterial({ linewidth: 2.8, depthTest: false }),
      dimension: new LineMaterial({ linewidth: 1.75, depthTest: false }),
    }),
    [],
  );
  useEffect(() => () => Object.values(lineMats).forEach((m) => m.dispose()), [lineMats]);

  useEffect(() => {
    const accent = darkTheme ? 0x4fb4c9 : 0x0d6a7f;
    lineMats.selected.color.setHex(accent);
    lineMats.dimension.color.setHex(accent);
    lineMats.bad.color.setHex(darkTheme ? 0xf0857b : 0xd2382c);
    invalidate();
  }, [lineMats, darkTheme, invalidate]);

  useEffect(() => {
    for (const m of Object.values(lineMats)) m.resolution.set(size.width || 1, size.height || 1);
    invalidate();
  }, [lineMats, size.width, size.height, invalidate]);

  useEffect(() => {
    const grp = groupRef.current;
    if (!grp) return;

    const geometries: LineSegmentsGeometry[] = [];

    const addFatSegments = (pairs: THREE.Vector3[], material: LineMaterial) => {
      if (pairs.length < 2) return;
      const g = new LineSegmentsGeometry();
      g.setPositions(pairs.flatMap((p) => [p.x, p.y, p.z]));
      const line = new LineSegments2(g, material);
      line.renderOrder = 10;
      grp.add(line);
      geometries.push(g);
    };

    for (const it of items) {
      if (!it.bad && it.id !== selectedId) continue;
      const spec = FURNITURE_CATALOG[it.k];
      const topY = it.y + spec.size[2] + 0.6;
      const pts = transformHitCorners(it.x, it.z, it.r, sizeRectForSpec(spec)).map(
        ([x, z]) => new THREE.Vector3(x, topY, z),
      );
      const pairs = pts.flatMap((p, i) => [p, pts[(i + 1) % pts.length]]);
      addFatSegments(pairs, it.id === selectedId ? lineMats.selected : lineMats.bad);
    }

    if (selectedId !== null) {
      const y = 1.2;
      for (const [dir, b] of Object.entries(clearances)) {
        if (!b || b.gap <= 0.5) continue;
        let p0: [number, number];
        let p1: [number, number];
        if (dir === 'E') {
          p0 = [b.at, b.mid];
          p1 = [b.at + b.gap, b.mid];
        } else if (dir === 'W') {
          p0 = [b.at, b.mid];
          p1 = [b.at - b.gap, b.mid];
        } else if (dir === 'S') {
          p0 = [b.mid, b.at];
          p1 = [b.mid, b.at + b.gap];
        } else {
          p0 = [b.mid, b.at];
          p1 = [b.mid, b.at - b.gap];
        }
        const horiz = dir === 'E' || dir === 'W';
        const tick = (p: [number, number]) =>
          horiz
            ? [new THREE.Vector3(p[0], y, p[1] - 3), new THREE.Vector3(p[0], y, p[1] + 3)]
            : [new THREE.Vector3(p[0] - 3, y, p[1]), new THREE.Vector3(p[0] + 3, y, p[1])];
        addFatSegments(
          [new THREE.Vector3(p0[0], y, p0[1]), new THREE.Vector3(p1[0], y, p1[1]), ...tick(p0), ...tick(p1)],
          lineMats.dimension,
        );
      }
    }

    return () => {
      grp.clear();
      geometries.forEach((g) => g.dispose());
    };
  }, [items, selectedId, clearances, lineMats]);

  return <group ref={groupRef} />;
}
