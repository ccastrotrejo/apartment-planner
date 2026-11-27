import React, { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { SoftShadows } from '@react-three/drei';

import {
  buildApartmentGeometrySet,
  disposeApartmentGeometrySet,
  type FixtureBucketKey,
} from './apartmentGeometries';
import { createApartmentMaterials } from './materials';
import { applyPhotoscan, PHOTOSCANS } from './photoscanTextures';
import { TEX_INCHES } from './textures';
import type { SolvedPlan } from '../types';
import { hdriUrl, type RenderSettings } from './renderSettings';

export function EnvironmentAndLighting({
  plan,
  view,
  darkTheme,
  shadowTrigger,
  settings,
}: {
  plan: SolvedPlan;
  view: '3d' | 'plan';
  darkTheme: boolean;
  shadowTrigger: unknown;
  settings: RenderSettings;
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
    // Neutral procedural room IBL first, then swap in the CC0 HDRI once it has streamed in.
    const pmrem = new THREE.PMREMGenerator(gl);
    let target = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = target.texture;
    scene.environmentIntensity = 1;
    invalidate();
    let disposed = false;
    new HDRLoader().load(
      hdriUrl(settings.hdri),
      (hdr) => {
        if (disposed) {
          hdr.dispose();
          pmrem.dispose();
          return;
        }
        hdr.mapping = THREE.EquirectangularReflectionMapping;
        const next = pmrem.fromEquirectangular(hdr);
        // The path tracer samples the raw equirect HDR (it can't read PMREM cube UVs).
        (scene.userData as { equirectEnv?: THREE.Texture }).equirectEnv = hdr;
        pmrem.dispose();
        target.dispose();
        target = next;
        scene.environment = next.texture;
        scene.environmentIntensity = 0.85;
        invalidate();
      },
      undefined,
      () => {
        // Keep the procedural RoomEnvironment if the HDRI can't be fetched (offline, file://).
        pmrem.dispose();
      },
    );
    return () => {
      disposed = true;
      scene.environment = null;
      target.dispose();
      const ud = scene.userData as { equirectEnv?: THREE.Texture };
      ud.equirectEnv?.dispose();
      ud.equirectEnv = undefined;
    };
  }, [gl, scene, invalidate, settings.hdri]);

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
      {/* PCSS contact-hardening shadows: sharp at the foot of a piece, soft further away */}
      {view === '3d' && settings.preset === 'high' && <SoftShadows size={18} samples={12} focus={0.4} />}
      <hemisphereLight args={[0xfff6ea, 0x9a8a74, view === 'plan' ? 0.72 : 0.26]} />
      {/* Warm natural sun casting crisp grounded soft shadows */}
      <directionalLight
        position={[cx - 165, 410, cz - 235]}
        target={sunTarget}
        intensity={view === 'plan' ? 0.52 : 2.1}
        color={0xffe9cf}
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
      {/* Cool north-west window sky fill + warm interior kitchen/bath practical lights */}
      {view === '3d' && (
        <>
          <directionalLight
            position={[cx - 240, 140, cz - 310]}
            target={sunTarget}
            intensity={0.34}
            color={0xcfe3ff}
          />
          {/* Kitchen under-cabinet LED task pools */}
          <pointLight position={[48, 51, 224]} color={0xffe2b4} intensity={160} distance={78} decay={2} />
          <pointLight position={[48, 51, 304]} color={0xffe2b4} intensity={140} distance={74} decay={2} />
          {/* Bathroom vanity sconce pool */}
          <pointLight position={[184, 73, 286]} color={0xffebd0} intensity={150} distance={68} decay={2} />
          {/* Subtle architectural drop-shadow receiver beneath slab plinth */}
          <mesh position={[cx, -3.22, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[900, 900]} />
            <shadowMaterial transparent opacity={darkTheme ? 0.26 : 0.13} />
          </mesh>
        </>
      )}
    </>
  );
}

export const ApartmentArchitecture = React.memo(function ApartmentArchitecture({
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
  const invalidate = useThree((st) => st.invalidate);

  // Swap the procedural oak for a CC0 photoscan once it has streamed in.
  useEffect(
    () => applyPhotoscan(mats.floorWood, PHOTOSCANS.oakFloor, TEX_INCHES.planks, invalidate),
    [mats, invalidate],
  );

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

  // Free GPU buffers and compiled programs when the plan changes or the scene unmounts.
  useEffect(() => () => disposeApartmentGeometrySet(geoSet), [geoSet]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  useEffect(() => () => planEdgeGeoCache.forEach(({ edges }) => edges.dispose()), [planEdgeGeoCache]);
  useEffect(() => () => fixtureEdgeMat.dispose(), [fixtureEdgeMat]);
  useEffect(
    () => () => {
      const lineMats = new Set<THREE.Material>();
      for (const line of [...doorSwingLines, ...sliderLines]) {
        line.geometry.dispose();
        lineMats.add(line.material as THREE.Material);
      }
      lineMats.forEach((m) => m.dispose());
    },
    [doorSwingLines, sliderLines],
  );

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
        castShadow={view === '3d'}
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
          {fullWalls && (
            <>
              <mesh geometry={geoSet.closetWood} material={mats.cabWood} receiveShadow castShadow />
              <mesh geometry={geoSet.closetFabric} material={mats.cabWhite} receiveShadow castShadow />
              <mesh geometry={geoSet.closetDark} material={mats.fixtureDark} receiveShadow castShadow />
              <mesh geometry={geoSet.closetMetal} material={mats.fixtureMetal} castShadow />
            </>
          )}
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
