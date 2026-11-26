import React, { useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';

import { FURNITURE_CATALOG } from '../furniture/catalog';
import { transformHitCorners } from '../geometry/plan2d';
import { sizeRectForSpec } from '../layout/collision';
import type { OverlayDomRefs } from './overlayRefs';
import type { Clearances, Compass, EvaluatedItem, SolvedPlan } from '../types';
import { fmtFtIn } from '../utils/units';

export interface StageHandle {
  zoomBy: (factor: number) => void;
  fitView: () => void;
  getViewCenterFloorPoint: () => [number, number];
  dropAtClientPoint: (clientX: number, clientY: number) => [number, number] | null;
}

export const FLOOR_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

export function SceneController({
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
