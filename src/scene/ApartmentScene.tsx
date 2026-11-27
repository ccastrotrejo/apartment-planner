import React, { useMemo, useRef } from 'react';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';

import { FURNITURE_CATALOG } from '../furniture/catalog';
import type { Clearances, EvaluatedItem, SolvedPlan } from '../types';
import { ApartmentArchitecture, EnvironmentAndLighting } from './ApartmentArchitecture';
import type { OverlayDomRefs } from './overlayRefs';
import { renderSettingsFromQuery } from './renderSettings';
import { prefersReducedMotion } from './motion';
import type { PhotoModeApi } from './PathTracedPhoto';

// three-gpu-pathtracer is ~200 kB; only fetch it when photo mode is first opened.
const PathTracedPhoto = React.lazy(() =>
  import('./PathTracedPhoto').then((m) => ({ default: m.PathTracedPhoto })),
);
import { FLOOR_PLANE, SceneController, type StageHandle } from './SceneController';
import { FurnitureItemMesh, SelectionAndDimensionLines } from './SceneFurniture';

export type { StageHandle } from './SceneController';

export interface ApartmentSceneProps {
  readonly plan: SolvedPlan;
  readonly items: ReadonlyArray<EvaluatedItem>;
  readonly selectedId: number | null;
  readonly clearances: Clearances;
  readonly view: '3d' | 'plan';
  readonly fullWalls: boolean;
  readonly seeThrough: boolean;
  readonly locked: boolean;
  readonly darkTheme: boolean;
  readonly compactClass: string;
  readonly tinyClass: string;
  readonly overlayRefs: React.MutableRefObject<OverlayDomRefs>;
  readonly stageRef: React.Ref<StageHandle>;
  readonly onSelect: (id: number | null) => void;
  readonly onMoveItem: (id: number, x: number, z: number, dragStartSnapshot?: boolean) => void;
  readonly onEndMoveItem: () => void;
  readonly onTransformItem: (id: number) => void;
  readonly onDropPieceAt: (pieceKey: string, x: number, z: number) => void;
  readonly onCanvasKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  readonly photoMode: boolean;
  readonly photoStatusRef: React.RefObject<HTMLElement | null>;
  readonly photoApiRef: React.MutableRefObject<PhotoModeApi | null>;
}


export function ApartmentScene(props: ApartmentSceneProps) {
  const {
    plan,
    items,
    selectedId,
    clearances,
    view,
    fullWalls,
    seeThrough,
    locked,
    darkTheme,
    compactClass,
    tinyClass,
    overlayRefs,
    stageRef,
    onSelect,
    onMoveItem,
    onEndMoveItem,
    onTransformItem,
    onDropPieceAt,
    onCanvasKeyDown,
    photoMode,
    photoStatusRef,
    photoApiRef,
  } = props;
  const tracing = photoMode && view === '3d';

  const settings = useMemo(() => renderSettingsFromQuery(window.location.search), []);
  const highQuality = settings.preset === 'high';
  const toneMapMode = {
    neutral: ToneMappingMode.NEUTRAL,
    agx: ToneMappingMode.AGX,
    aces: ToneMappingMode.ACES_FILMIC,
  }[settings.toneMap];

  const itemGroupsRef = useRef<Map<number, THREE.Group>>(new Map());
  // Pieces that appear after the first paint (dropped in, layout switch) get a short settle;
  // pieces present on page load don't animate.
  const seenIdsRef = useRef<Set<number>>(new Set());
  const stageStartRef = useRef(performance.now());
  const reducedMotion = useMemo(() => prefersReducedMotion(), []);
  const registerGroup = React.useCallback(
    (id: number, node: THREE.Group | null) => {
      if (!node) {
        itemGroupsRef.current.delete(id);
        return;
      }
      itemGroupsRef.current.set(id, node);
      if (seenIdsRef.current.has(id)) return;
      seenIdsRef.current.add(id);
      if (!reducedMotion && performance.now() - stageStartRef.current > 1500) {
        node.userData.spawnAt = performance.now();
      }
    },
    [reducedMotion],
  );

  const dragStateRef = useRef<{
    id: number;
    offX: number;
    offZ: number;
    pointerId: number;
    moved: boolean;
    lastX: number;
    lastZ: number;
    raf: number;
  } | null>(null);

  const shadowTrigger = useMemo(
    () => ({ items, fullWalls, seeThrough }),
    [items, fullWalls, seeThrough],
  );

  const handlePiecePointerDown = (e: ThreeEvent<PointerEvent>, item: EvaluatedItem) => {
    if (e.nativeEvent.pointerType === 'mouse' && e.nativeEvent.button !== 0) return;
    if (dragStateRef.current) return;
    e.stopPropagation();

    if (selectedId !== item.id) {
      onSelect(item.id);
    }
    if (locked) return;

    const hit = new THREE.Vector3();
    const hasFloorHit = e.ray.intersectPlane(FLOOR_PLANE, hit);
    const fx = hasFloorHit ? hit.x : item.x;
    const fz = hasFloorHit ? hit.z : item.z;

    dragStateRef.current = {
      id: item.id,
      offX: fx - item.x,
      offZ: fz - item.z,
      pointerId: e.pointerId,
      moved: false,
      lastX: item.x,
      lastZ: item.z,
      raf: 0,
    };

    const dom = e.nativeEvent.target as HTMLElement | null;
    if (dom?.setPointerCapture) {
      try {
        dom.setPointerCapture(e.pointerId);
      } catch {
        // ignore synthetic events
      }
    }
  };

  return (
    <div
      style={{ width: '100%', height: '100%', outline: 'none' }}
      tabIndex={0}
      role="application"
      aria-label="Apartment 3D and plan stage. Press Enter to cycle furniture selection. When unlocked, use arrow keys to nudge."
      onKeyDown={onCanvasKeyDown}
      onDragOver={(e) => {
        if (locked) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(e) => {
        if (locked) return;
        e.preventDefault();
        const pieceKey = e.dataTransfer.getData('text/plain');
        if (!pieceKey || !FURNITURE_CATALOG[pieceKey]) return;
        const handle = (stageRef as React.RefObject<StageHandle | null>)?.current;
        const pt = handle?.dropAtClientPoint(e.clientX, e.clientY);
        if (pt) onDropPieceAt(pieceKey, pt[0], pt[1]);
      }}
    >
      <Canvas
        frameloop="demand"
        shadows
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 0.9,
        }}
        onPointerMissed={(e) => {
          if (e.button === 0 && selectedId !== null) {
            onSelect(null);
          }
        }}
      >
        <EnvironmentAndLighting
          plan={plan}
          view={view}
          darkTheme={darkTheme}
          shadowTrigger={shadowTrigger}
          settings={settings}
        />
        <ApartmentArchitecture
          plan={plan}
          view={view}
          fullWalls={fullWalls}
          seeThrough={seeThrough}
          darkTheme={darkTheme}
        />

        <group>
          {items.map((it) => (
            <FurnitureItemMesh
              key={it.id}
              item={it}
              view={view}
              darkTheme={darkTheme}
              registerGroup={registerGroup}
              onPiecePointerDown={handlePiecePointerDown}
            />
          ))}
        </group>

        <SelectionAndDimensionLines
          items={items}
          selectedId={selectedId}
          clearances={clearances}
          darkTheme={darkTheme}
        />

        <SceneController
          plan={plan}
          items={items}
          selectedId={selectedId}
          clearances={clearances}
          view={view}
          locked={locked}
          compactClass={compactClass}
          tinyClass={tinyClass}
          overlayRefs={overlayRefs}
          itemGroupsRef={itemGroupsRef}
          stageRef={stageRef}
          dragStateRef={dragStateRef}
          onMoveItem={onMoveItem}
          onEndMoveItem={onEndMoveItem}
          onTransformItem={onTransformItem}
        />

        {view === '3d' && !tracing && highQuality && (
          <EffectComposer enableNormalPass={false} multisampling={0}>
            <N8AO
              aoRadius={14}
              distanceFalloff={0.85}
              intensity={2.1}
              color="#2a1d12"
              quality="medium"
              halfRes
            />
            <Bloom mipmapBlur luminanceThreshold={1.05} luminanceSmoothing={0.1} intensity={0.55} radius={0.62} />
            <ToneMapping mode={toneMapMode} />
            <Vignette offset={0.32} darkness={0.38} />
            <SMAA />
          </EffectComposer>
        )}
        {view === '3d' && !tracing && !highQuality && (
          <EffectComposer enableNormalPass={false} multisampling={0}>
            <ToneMapping mode={toneMapMode} />
          </EffectComposer>
        )}
        {tracing && (
          <React.Suspense fallback={null}>
            <PathTracedPhoto statusRef={photoStatusRef} apiRef={photoApiRef} />
          </React.Suspense>
        )}
      </Canvas>
    </div>
  );
}
