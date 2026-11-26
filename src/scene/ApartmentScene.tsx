import React, { useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import { EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';

import { FURNITURE_CATALOG } from '../furniture/catalog';
import { transformHitCorners } from '../geometry/plan2d';
import { sizeRectForSpec } from '../layout/collision';
import { buildApartmentGeometrySet, type FixtureBucketKey } from './apartmentGeometries';
import { getFurnitureParts, getPartPlanEdges, getSoftContactShadowTexture } from './furnitureGeometries';
import { createApartmentMaterials, createRoleMaterial } from './materials';
import type { OverlayDomRefs } from './overlayRefs';
import type { Clearances, Compass, EvaluatedItem, SolvedPlan } from '../types';
import { fmtFtIn } from '../utils/units';

export interface StageHandle {
  zoomBy: (factor: number) => void;
  fitView: () => void;
  getViewCenterFloorPoint: () => [number, number];
  dropAtClientPoint: (clientX: number, clientY: number) => [number, number] | null;
}

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
}

const FLOOR_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function EnvironmentAndLighting({
  plan,
  view,
  darkTheme,
  shadowTrigger,
}: {
  plan: SolvedPlan;
  view: '3d' | 'plan';
  darkTheme: boolean;
  shadowTrigger: unknown;
}) {
  const { gl, scene, invalidate } = useThree();
  const [x0, z0, x1, z1] = plan.bounds;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const radius = Math.hypot(x1 - x0, z1 - z0) / 2 + 28;

  useEffect(() => {
    // Freeze per-frame shadow-map regeneration: sun is static, so orbiting needs 0 shadow passes!
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    const pmrem = new THREE.PMREMGenerator(gl);
    const target = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = target.texture;
    pmrem.dispose();
    invalidate();
    return () => {
      scene.environment = null;
      target.dispose();
    };
  }, [gl, scene, invalidate]);

  // Refresh static shadow map only when geometry, furniture positions, or wall cuts change
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (view === '3d') {
        gl.shadowMap.needsUpdate = true;
      }
      invalidate();
    });
    return () => cancelAnimationFrame(id);
  }, [gl, view, shadowTrigger, invalidate]);

  useEffect(() => {
    scene.background = new THREE.Color(darkTheme ? '#161e21' : '#dfe4e2');
    invalidate();
  }, [scene, darkTheme, invalidate]);

  // Restore renderer toneMapping when switching to 2D Plan view (where EffectComposer unmounts)
  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = view === 'plan' ? 0.94 : 0.9;
    invalidate();
  }, [gl, view, invalidate]);

  const sunTarget = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(cx, 0, cz);
    return o;
  }, [cx, cz]);

  return (
    <>
      <primitive object={sunTarget} />
      <hemisphereLight args={[0xfffaf2, 0x8a8377, view === 'plan' ? 0.72 : 0.42]} />
      {/* Warm natural sun casting crisp grounded soft shadows */}
      <directionalLight
        position={[cx - 165, 410, cz - 235]}
        target={sunTarget}
        intensity={view === 'plan' ? 0.52 : 1.32}
        color={0xfff2df}
        castShadow={view === '3d'}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0003}
        shadow-normalBias={0.35}
        shadow-radius={3}
        shadow-camera-left={-radius}
        shadow-camera-right={radius}
        shadow-camera-top={radius}
        shadow-camera-bottom={-radius}
        shadow-camera-near={60}
        shadow-camera-far={1050}
      />
      {/* Cool north-west window sky fill for natural architectural contrast */}
      {view === '3d' && (
        <directionalLight
          position={[cx - 240, 140, cz - 310]}
          target={sunTarget}
          intensity={0.42}
          color={0xdceeff}
        />
      )}
    </>
  );
}

const ApartmentArchitecture = React.memo(function ApartmentArchitecture({
  plan,
  view,
  fullWalls,
  seeThrough,
  darkTheme,
}: {
  plan: SolvedPlan;
  view: '3d' | 'plan';
  fullWalls: boolean;
  seeThrough: boolean;
  darkTheme: boolean;
}) {
  const geoSet = useMemo(() => buildApartmentGeometrySet(plan), [plan]);
  const mats = useMemo(() => createApartmentMaterials(), []);

  const planEdgeGeoCache = useMemo(() => {
    const out: Array<{ key: FixtureBucketKey; edges: THREE.EdgesGeometry; upper: boolean }> = [];
    for (const [k, g] of Object.entries(geoSet.fixtures) as Array<[FixtureBucketKey, THREE.BufferGeometry]>) {
      if (k.includes('backing') || k.includes('bulb') || k === 'showerGlass') continue;
      out.push({ key: k, edges: new THREE.EdgesGeometry(g, 32), upper: k.startsWith('upper_') });
    }
    return out;
  }, [geoSet]);

  const fixtureEdgeMat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: 0x1d2729,
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
      }),
    [],
  );

  // Sync wall, baseboard, door, and tile skin transparency & plan colors
  useEffect(() => {
    const planWallColor = darkTheme ? '#74848a' : '#2a3336';
    mats.wall.color.set(view === 'plan' ? planWallColor : '#f2efe9');
    const wallGhost = seeThrough;
    const ghostOpacity = view === 'plan' ? 0.42 : 0.11;

    for (const m of [mats.wall, mats.doorFrame, mats.doorLeaf]) {
      m.transparent = wallGhost;
      m.opacity = wallGhost ? ghostOpacity : 1;
      m.depthWrite = !wallGhost;
      m.needsUpdate = true;
    }

    mats.baseboard.transparent = wallGhost;
    mats.baseboard.opacity = wallGhost ? (view === 'plan' ? 0.25 : 0.12) : 1;
    mats.baseboard.depthWrite = !wallGhost;
    mats.baseboard.needsUpdate = true;

    mats.wallTile.transparent = wallGhost;
    mats.wallTile.opacity = wallGhost ? 0.12 : 1;
    mats.wallTile.depthWrite = !wallGhost;
    mats.wallTile.needsUpdate = true;

    fixtureEdgeMat.color.set(darkTheme ? '#e3eaeb' : '#1d2729');
    fixtureEdgeMat.opacity = view === 'plan' ? 0.48 : 0.05;
  }, [mats, fixtureEdgeMat, view, seeThrough, darkTheme]);

  // Door swing arcs & sliding closet dashed lines on the floor
  const { doorSwingLines, sliderLines } = useMemo(() => {
    const swingMat = new THREE.LineBasicMaterial({ color: 0x677479, transparent: true, opacity: 0.72 });
    const dashMat = new THREE.LineDashedMaterial({ color: 0x677479, dashSize: 4, gapSize: 3 });

    const swings = plan.doors.map((d) => {
      const [hx, hz] = d.hinge;
      const a0 = Math.atan2(d.closed[1] - hz, d.closed[0] - hx);
      const a1 = Math.atan2(d.open[1] - hz, d.open[0] - hx);
      let da = a1 - a0;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      const pts: THREE.Vector3[] = [
        new THREE.Vector3(d.open[0], 0.22, d.open[1]),
        new THREE.Vector3(hx, 0.22, hz),
      ];
      for (let i = 0; i <= 32; i++) {
        const a = a0 + (da * i) / 32;
        pts.push(new THREE.Vector3(hx + d.r * Math.cos(a), 0.22, hz + d.r * Math.sin(a)));
      }
      return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), swingMat);
    });

    const sliders = plan.sliders.map((p) => {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(p.map(([x, z]) => new THREE.Vector3(x, 0.22, z))),
        dashMat,
      );
      line.computeLineDistances();
      return line;
    });

    return { doorSwingLines: swings, sliderLines: sliders };
  }, [plan]);

  const showUppers = fullWalls && view !== 'plan';
  const matForBucket = (k: FixtureBucketKey): THREE.Material => {
    const base = k.startsWith('upper_') ? k.slice(6) : k;
    switch (base) {
      case 'cabWood':
        return mats.cabWood;
      case 'cabWhite':
        return mats.cabWhite;
      case 'countertop':
        return mats.countertop;
      case 'backsplash':
        return mats.backsplash;
      case 'ceramic':
        return mats.ceramic;
      case 'appliance':
        return mats.appliance;
      case 'cooktop':
        return mats.cooktop;
      case 'fixtureDark':
        return mats.fixtureDark;
      case 'fixtureMetal':
        return mats.fixtureMetal;
      case 'backing':
        return mats.backing;
      case 'mirror':
        return mats.mirror;
      case 'bulb':
        return mats.bulb;
      case 'showerGlass':
        return mats.showerGlass;
      default:
        return mats.cabWhite;
    }
  };

  return (
    <group>
      {/* Floors & concrete plinth */}
      <mesh geometry={geoSet.floorWood} material={mats.floorWood} receiveShadow />
      <mesh geometry={geoSet.floorTile} material={mats.floorTile} receiveShadow />
      {view === '3d' && <mesh geometry={geoSet.slabPlinth} material={mats.slabPlinth} receiveShadow />}

      {/* Walls, window sills, baseboards, door casings & leaves */}
      <mesh
        geometry={fullWalls ? geoSet.wallFull : geoSet.wallLow}
        material={mats.wall}
        receiveShadow
        castShadow={!seeThrough && view === '3d'}
      />
      <mesh geometry={geoSet.sillCaps} material={mats.sill} receiveShadow />
      {view !== 'plan' && <mesh geometry={geoSet.baseboard} material={mats.baseboard} receiveShadow />}
      {view !== 'plan' && !seeThrough && (
        <>
          <mesh
            geometry={fullWalls ? geoSet.doorFramesFull : geoSet.doorFramesLow}
            material={mats.doorFrame}
            receiveShadow
          />
          <mesh
            geometry={fullWalls ? geoSet.doorLeavesFull : geoSet.doorLeavesLow}
            material={mats.doorLeaf}
            receiveShadow
            castShadow
          />
          <mesh geometry={geoSet.doorHardware} material={mats.fixtureMetal} castShadow />
        </>
      )}

      {/* Bathroom wall tile */}
      {view !== 'plan' && <mesh geometry={geoSet.wallTileLow} material={mats.wallTile} receiveShadow />}
      {showUppers && <mesh geometry={geoSet.wallTileUpper} material={mats.wallTile} receiveShadow />}

      {/* Windows: mullions & double-glazed panes */}
      <mesh
        geometry={fullWalls ? geoSet.windows.frameFull : geoSet.windows.frameLow}
        material={mats.mullion}
        castShadow={view === '3d'}
        receiveShadow
      />
      <mesh geometry={fullWalls ? geoSet.windows.glassFull : geoSet.windows.glassLow} material={mats.glass} />

      {/* Built-in kitchen, bath, and laundry fixtures */}
      {(Object.entries(geoSet.fixtures) as Array<[FixtureBucketKey, THREE.BufferGeometry]>).map(([k, g]) => {
        const isUpper = k.startsWith('upper_');
        if (isUpper && !showUppers) return null;
        if (k === 'showerGlass' && !showUppers) return null;
        const casts = !k.includes('bulb') && k !== 'showerGlass' && view === '3d';
        return (
          <mesh
            key={k}
            geometry={g}
            material={matForBucket(k)}
            castShadow={casts}
            receiveShadow={k !== 'showerGlass'}
          />
        );
      })}

      {/* Crisp architectural outlines (prominent in 2D Plan, subtle on casework in 3D) */}
      {planEdgeGeoCache.map(({ key, edges, upper }) => {
        if (upper && !showUppers) return null;
        return <lineSegments key={`edge-${key}`} geometry={edges} material={fixtureEdgeMat} />;
      })}

      {/* Door swing indicators & closet tracks */}
      {doorSwingLines.map((line, i) => (
        <primitive key={`swing-${i}`} object={line} />
      ))}
      {sliderLines.map((line, i) => (
        <primitive key={`slider-${i}`} object={line} />
      ))}
    </group>
  );
});

const FurnitureItemMesh = React.memo(function FurnitureItemMesh({
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
  const showContactShadow = view === '3d' && !spec.flat && !spec.minY && item.on === null && shadowTex !== null;
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

function SelectionAndDimensionLines({
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
  const { size } = useThree();
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    const grp = groupRef.current;
    if (!grp) return;

    const accentHex = darkTheme ? 0x4fb4c9 : 0x0d6a7f;
    const badHex = darkTheme ? 0xf0857b : 0xd2382c;
    const disposables: Array<{ dispose: () => void }> = [];

    const addFatSegments = (pairs: THREE.Vector3[], color: number, pxWidth: number) => {
      if (pairs.length < 2) return;
      const g = new LineSegmentsGeometry();
      g.setPositions(pairs.flatMap((p) => [p.x, p.y, p.z]));
      const m = new LineMaterial({
        color,
        linewidth: pxWidth,
        depthTest: false,
      });
      m.resolution.set(size.width || 1, size.height || 1);
      const line = new LineSegments2(g, m);
      line.renderOrder = 10;
      grp.add(line);
      disposables.push(g, m);
    };

    for (const it of items) {
      if (!it.bad && it.id !== selectedId) continue;
      const spec = FURNITURE_CATALOG[it.k];
      const topY = it.y + spec.size[2] + 0.6;
      const pts = transformHitCorners(it.x, it.z, it.r, sizeRectForSpec(spec)).map(
        ([x, z]) => new THREE.Vector3(x, topY, z),
      );
      const pairs = pts.flatMap((p, i) => [p, pts[(i + 1) % pts.length]]);
      addFatSegments(pairs, it.id === selectedId ? accentHex : badHex, 2.8);
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
          accentHex,
          1.75,
        );
      }
    }

    return () => {
      grp.clear();
      disposables.forEach((d) => d.dispose());
    };
  }, [items, selectedId, clearances, darkTheme, size.width, size.height]);

  return <group ref={groupRef} />;
}

function SceneController({
  plan,
  items,
  selectedId,
  clearances,
  view,
  compactClass,
  tinyClass,
  overlayRefs,
  itemGroupsRef,
  stageRef,
  dragStateRef,
  onMoveItem,
  onEndMoveItem,
  onTransformItem,
}: {
  plan: SolvedPlan;
  items: ReadonlyArray<EvaluatedItem>;
  selectedId: number | null;
  clearances: Clearances;
  view: '3d' | 'plan';
  compactClass: string;
  tinyClass: string;
  overlayRefs: React.MutableRefObject<OverlayDomRefs>;
  itemGroupsRef: React.MutableRefObject<Map<number, THREE.Group>>;
  stageRef: React.Ref<StageHandle>;
  dragStateRef: React.MutableRefObject<{
    id: number;
    offX: number;
    offZ: number;
    pointerId: number;
    moved: boolean;
    lastX: number;
    lastZ: number;
    raf: number;
  } | null>;
  onMoveItem: (id: number, x: number, z: number, dragStartSnapshot?: boolean) => void;
  onEndMoveItem: () => void;
  onTransformItem: (id: number) => void;
}) {
  const { gl, size, invalidate } = useThree();
  const perspCamRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orthoCamRef = useRef<THREE.OrthographicCamera | null>(null);
  const controls3dRef = useRef<React.ComponentRef<typeof OrbitControls> | null>(null);
  const controlsPlanRef = useRef<React.ComponentRef<typeof OrbitControls> | null>(null);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const lastTapRef = useRef<{ id: number; time: number } | null>(null);
  const initializedRef = useRef(false);

  const [x0, z0, x1, z1] = plan.bounds;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const aspect = (size.width || 1) / (size.height || 1);
  const spanX = (x1 - x0) * 1.08;
  const spanZ = (z1 - z0) * 1.12;
  const initHalfH = Math.max(spanZ / 2, spanX / 2 / aspect);
  const initDist = (Math.max(spanX, spanZ * aspect) / aspect) * 1.22 + 115;

  // Keep camera frustums matched to viewport size without resetting user zoom
  useEffect(() => {
    if (perspCamRef.current) {
      perspCamRef.current.aspect = aspect;
      perspCamRef.current.updateProjectionMatrix();
    }
    if (orthoCamRef.current) {
      const halfH = initializedRef.current
        ? (orthoCamRef.current.top - orthoCamRef.current.bottom) / 2
        : initHalfH;
      orthoCamRef.current.left = -halfH * aspect;
      orthoCamRef.current.right = halfH * aspect;
      orthoCamRef.current.top = halfH;
      orthoCamRef.current.bottom = -halfH;
      orthoCamRef.current.updateProjectionMatrix();
      initializedRef.current = true;
    }
    invalidate();
  }, [aspect, initHalfH, invalidate]);

  useEffect(() => {
    invalidate();
  }, [view, items, selectedId, clearances, invalidate]);

  const activeCamera = () => (view === 'plan' ? orthoCamRef.current : perspCamRef.current);
  const activeControls = () => (view === 'plan' ? controlsPlanRef.current : controls3dRef.current);

  const clientToFloor = (clientX: number, clientY: number): [number, number] | null => {
    const cam = activeCamera();
    if (!cam) return null;
    const rect = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, cam);
    const hit = new THREE.Vector3();
    return raycaster.ray.intersectPlane(FLOOR_PLANE, hit) ? [hit.x, hit.z] : null;
  };

  const fitView = () => {
    if (orthoCamRef.current && controlsPlanRef.current) {
      orthoCamRef.current.left = -initHalfH * aspect;
      orthoCamRef.current.right = initHalfH * aspect;
      orthoCamRef.current.top = initHalfH;
      orthoCamRef.current.bottom = -initHalfH;
      orthoCamRef.current.zoom = 1;
      orthoCamRef.current.position.set(cx, 1500, cz);
      orthoCamRef.current.lookAt(cx, 0, cz);
      orthoCamRef.current.updateProjectionMatrix();
      controlsPlanRef.current.target.set(cx, 0, cz);
      controlsPlanRef.current.update();
    }
    if (perspCamRef.current && controls3dRef.current) {
      perspCamRef.current.position.set(cx + initDist * 0.25, initDist * 0.76, cz + initDist * 0.72);
      controls3dRef.current.target.set(cx, 0, cz);
      controls3dRef.current.update();
    }
    invalidate();
  };

  useImperativeHandle(stageRef, () => ({
    zoomBy: (factor: number) => {
      if (view === 'plan' && orthoCamRef.current) {
        orthoCamRef.current.zoom = Math.min(12, Math.max(0.4, orthoCamRef.current.zoom * factor));
        orthoCamRef.current.updateProjectionMatrix();
      } else if (perspCamRef.current && controls3dRef.current) {
        perspCamRef.current.position
          .sub(controls3dRef.current.target)
          .multiplyScalar(1 / factor)
          .add(controls3dRef.current.target);
        controls3dRef.current.update();
      }
      invalidate();
    },
    fitView,
    getViewCenterFloorPoint: () => {
      const rect = gl.domElement.getBoundingClientRect();
      const pt = clientToFloor(rect.left + rect.width / 2, rect.top + rect.height / 2);
      if (!pt || pt[0] < x0 || pt[0] > x1 || pt[1] < z0 || pt[1] > z1) {
        const fallback = plan.rooms[2] ?? plan.rooms[0];
        return fallback ? [fallback.at[0], fallback.at[1]] : [cx, cz];
      }
      return pt;
    },
    dropAtClientPoint: clientToFloor,
  }));

  // Direct 120Hz Three.js ref dragging + rAF-coalesced state sync (zero React render storm)
  useEffect(() => {
    const dom = gl.domElement;
    const onMove = (e: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      const pt = clientToFloor(e.clientX, e.clientY);
      if (!pt) return;
      const nx = Math.round(pt[0] - drag.offX);
      const nz = Math.round(pt[1] - drag.offZ);
      if (nx === drag.lastX && nz === drag.lastZ) return;

      const firstMove = !drag.moved;
      drag.moved = true;
      drag.lastX = nx;
      drag.lastZ = nz;

      // Move 3D mesh immediately on this pointer tick
      const grp = itemGroupsRef.current.get(drag.id);
      if (grp) {
        grp.position.x = nx;
        grp.position.z = nz;
      }
      invalidate();

      if (firstMove) {
        onMoveItem(drag.id, nx, nz, true);
      } else if (!drag.raf) {
        drag.raf = requestAnimationFrame(() => {
          const cur = dragStateRef.current;
          if (!cur) return;
          cur.raf = 0;
          onMoveItem(cur.id, cur.lastX, cur.lastZ, false);
        });
      }
    };

    const onUp = (e: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      if (drag.raf) {
        cancelAnimationFrame(drag.raf);
        drag.raf = 0;
      }
      if (drag.moved) {
        onMoveItem(drag.id, drag.lastX, drag.lastZ, false);
        onEndMoveItem();
        lastTapRef.current = null;
      } else {
        const now = performance.now();
        if (lastTapRef.current && lastTapRef.current.id === drag.id && now - lastTapRef.current.time < 380) {
          lastTapRef.current = null;
          onTransformItem(drag.id);
        } else {
          lastTapRef.current = { id: drag.id, time: now };
        }
      }
      try {
        dom.releasePointerCapture(drag.pointerId);
      } catch {
        // already released
      }
      dragStateRef.current = null;
      const ctl = activeControls();
      if (ctl) ctl.enabled = true;
      invalidate();
    };

    dom.addEventListener('pointermove', onMove);
    dom.addEventListener('pointerup', onUp);
    dom.addEventListener('pointercancel', onUp);
    return () => {
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerup', onUp);
      dom.removeEventListener('pointercancel', onUp);
    };
  });

  // Direct DOM ref updates via GPU translate3d: ZERO React state updates during orbit/pan/zoom!
  const scratchV = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const cam = activeCamera();
    const refs = overlayRefs.current;
    if (!cam) return;
    const W = size.width || 1;
    const H = size.height || 1;

    const toScreen = (x: number, y: number, z: number): [number, number, boolean] => {
      scratchV.set(x, y, z).project(cam);
      return [((scratchV.x + 1) / 2) * W, ((1 - scratchV.y) / 2) * H, scratchV.z < 1];
    };

    if (refs.container && orthoCamRef.current) {
      const ppi = H / ((orthoCamRef.current.top - orthoCamRef.current.bottom) / orthoCamRef.current.zoom);
      refs.container.classList.toggle(compactClass, ppi < 1.6);
      refs.container.classList.toggle(tinyClass, ppi < 1.0);
    }

    // Room labels (2D Plan view only)
    for (let i = 0; i < plan.rooms.length; i++) {
      const el = refs.rooms[i];
      if (!el) continue;
      if (view !== 'plan') {
        el.hidden = true;
        continue;
      }
      const r = plan.rooms[i];
      const [sx, sy, ok] = toScreen(r.at[0], 0, r.at[1]);
      el.hidden = !ok;
      if (ok) {
        el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%)`;
      }
    }

    const sel = selectedId !== null ? items.find((i) => i.id === selectedId) : undefined;
    const dirs: Compass[] = ['N', 'E', 'S', 'W'];

    for (const dir of dirs) {
      const el = refs.dims[dir];
      if (!el) continue;
      const b = sel ? clearances[dir] : undefined;
      if (!sel || !b) {
        el.hidden = true;
        continue;
      }
      let mx = 0;
      let mz = 0;
      if (dir === 'E') {
        mx = b.at + b.gap / 2;
        mz = b.mid;
      } else if (dir === 'W') {
        mx = b.at - b.gap / 2;
        mz = b.mid;
      } else if (dir === 'S') {
        mx = b.mid;
        mz = b.at + b.gap / 2;
      } else {
        mx = b.mid;
        mz = b.at - b.gap / 2;
      }
      const [dx, dy, dok] = toScreen(mx, 1.2, mz);
      el.hidden = !dok;
      if (dok) {
        el.textContent = fmtFtIn(b.gap);
        el.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0) translate(-50%, -50%)`;
      }
    }

    // Floating 3D piece name tag
    if (refs.tag) {
      if (!sel || view !== '3d') {
        refs.tag.hidden = true;
      } else {
        const spec = FURNITURE_CATALOG[sel.k];
        const liveGrp = itemGroupsRef.current.get(sel.id);
        const px = liveGrp ? liveGrp.position.x : sel.x;
        const pz = liveGrp ? liveGrp.position.z : sel.z;
        const [tx, ty, tok] = toScreen(px, sel.y + spec.size[2] + 2, pz);
        refs.tag.hidden = !tok;
        if (tok) {
          refs.tag.textContent = spec.name;
          refs.tag.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) translate(-50%, -100%)`;
        }
      }
    }

    // Auto-dodge selection card directly on dataset.pos without triggering React re-renders
    if (sel && refs.card && refs.stageBox) {
      const spec = FURNITURE_CATALOG[sel.k];
      let bx0 = Infinity;
      let by0 = Infinity;
      let bx1 = -Infinity;
      let by1 = -Infinity;
      const topY = sel.y + spec.size[2];
      for (const [cxp, czp] of transformHitCorners(sel.x, sel.z, sel.r, sizeRectForSpec(spec))) {
        for (const cyp of [sel.y, topY]) {
          const [sx, sy] = toScreen(cxp, cyp, czp);
          bx0 = Math.min(bx0, sx);
          bx1 = Math.max(bx1, sx);
          by0 = Math.min(by0, sy);
          by1 = Math.max(by1, sy);
        }
      }
      const piece: [number, number, number, number] = [bx0 - 10, by0 - 10, bx1 + 10, by1 + 10];
      const cw = refs.card.offsetWidth || 340;
      const ch = refs.card.offsetHeight || 220;
      const narrow = window.innerWidth <= 899;
      const spots: Record<string, [number, number, number, number]> = narrow
        ? { b: [8, H - 8 - ch, W - 8, H - 8], t: [8, 8, W - 54, 8 + ch] }
        : {
            br: [W - 12 - cw, H - 12 - ch, W - 12, H - 12],
            bl: [12, H - 12 - ch, 12 + cw, H - 12],
            tl: [12, 12, 12 + cw, 12 + ch],
          };
      const over = (r: [number, number, number, number]) =>
        Math.max(0, Math.min(r[2], piece[2]) - Math.max(r[0], piece[0])) *
        Math.max(0, Math.min(r[3], piece[3]) - Math.max(r[1], piece[1]));
      const keys = Object.keys(spots);
      const cur = refs.card.dataset.pos && spots[refs.card.dataset.pos] ? refs.card.dataset.pos : keys[0];
      if (over(spots[cur]) > 0) {
        let best = cur;
        for (const k of keys) {
          if (over(spots[k]) < over(spots[best])) best = k;
        }
        if (best !== refs.card.dataset.pos) refs.card.dataset.pos = best;
      }
    }
  });

  const targetCenter: [number, number, number] = [cx, 0, cz];

  return (
    <>
      <PerspectiveCamera
        ref={perspCamRef}
        makeDefault={view === '3d'}
        fov={38}
        near={2}
        far={6000}
        position={[cx + initDist * 0.25, initDist * 0.76, cz + initDist * 0.72]}
      />
      <OrthographicCamera
        ref={orthoCamRef}
        makeDefault={view === 'plan'}
        near={1}
        far={4000}
        position={[cx, 1500, cz]}
        up={[0, 0, -1]}
      />
      <OrbitControls
        ref={controls3dRef}
        camera={perspCamRef.current ?? undefined}
        enabled={view === '3d'}
        enableDamping={false}
        rotateSpeed={0.95}
        panSpeed={1.0}
        zoomSpeed={1.15}
        target={targetCenter}
        maxPolarAngle={1.44}
        minDistance={55}
        maxDistance={2200}
        onChange={() => invalidate()}
        mouseButtons={{
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        }}
      />
      <OrbitControls
        ref={controlsPlanRef}
        camera={orthoCamRef.current ?? undefined}
        enabled={view === 'plan'}
        enableRotate={false}
        enableDamping={false}
        screenSpacePanning
        panSpeed={1.0}
        zoomSpeed={1.15}
        target={targetCenter}
        onChange={() => invalidate()}
        mouseButtons={{
          LEFT: THREE.MOUSE.PAN,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        }}
      />
    </>
  );
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
  } = props;

  const itemGroupsRef = useRef<Map<number, THREE.Group>>(new Map());
  const registerGroup = React.useCallback((id: number, node: THREE.Group | null) => {
    if (node) itemGroupsRef.current.set(id, node);
    else itemGroupsRef.current.delete(id);
  }, []);

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

        {view === '3d' && (
          <EffectComposer enableNormalPass={false} multisampling={0}>
            <N8AO
              aoRadius={12}
              distanceFalloff={0.9}
              intensity={1.5}
              quality="medium"
              halfRes
            />
            <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          </EffectComposer>
        )}
      </Canvas>
    </div>
  );
}
