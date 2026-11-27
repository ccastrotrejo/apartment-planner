import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { WebGLPathTracer } from 'three-gpu-pathtracer';

export const PHOTO_MAX_SAMPLES = 192;

export interface PhotoModeApi {
  /** Encode the current converged frame as a PNG data URL. */
  capture: () => string | null;
}

/**
 * Progressive path-traced still of the current camera (three-gpu-pathtracer). Mounted only in
 * photo mode; it takes over rendering at priority 1 while the post-processing composer is unmounted.
 */
export function PathTracedPhoto({
  statusRef,
  apiRef,
}: {
  statusRef: React.RefObject<HTMLElement | null>;
  apiRef: React.MutableRefObject<PhotoModeApi | null>;
}) {
  const { gl, scene, camera, invalidate } = useThree();
  const tracerRef = useRef<WebGLPathTracer | null>(null);
  const lastCamMatrix = useRef(new THREE.Matrix4());

  useEffect(() => {
    const prevToneMapping = gl.toneMapping;
    const prevEnvironment = scene.environment;
    gl.toneMapping = THREE.NeutralToneMapping;
    scene.environment = (scene.userData as { equirectEnv?: THREE.Texture }).equirectEnv ?? null;
    const tracer = new WebGLPathTracer(gl);
    tracer.tiles.set(2, 2);
    tracer.minSamples = 1;
    tracer.renderDelay = 0;
    tracer.fadeDuration = 250;
    tracer.filterGlossyFactor = 0.5;
    // three-gpu-pathtracer 0.0.24 renders clearcoated materials black; trace without clearcoat.
    const clearcoats = new Map<THREE.MeshPhysicalMaterial, number>();
    scene.traverse((o) => {
      const mats = (o as THREE.Mesh).material;
      for (const m of Array.isArray(mats) ? mats : mats ? [mats] : []) {
        if (m instanceof THREE.MeshPhysicalMaterial && m.clearcoat > 0 && !clearcoats.has(m)) {
          clearcoats.set(m, m.clearcoat);
          m.clearcoat = 0;
        }
      }
    });
    tracer.setScene(scene, camera);
    tracerRef.current = tracer;
    lastCamMatrix.current.copy(camera.matrixWorld);
    apiRef.current = {
      capture: () => {
        if (!tracerRef.current) return null;
        tracerRef.current.renderSample();
        return gl.domElement.toDataURL('image/png');
      },
    };
    invalidate();
    return () => {
      apiRef.current = null;
      tracer.dispose();
      tracerRef.current = null;
      gl.toneMapping = prevToneMapping;
      scene.environment = prevEnvironment;
      clearcoats.forEach((v, m) => {
        m.clearcoat = v;
      });
      if (statusRef.current) statusRef.current.textContent = '';
      invalidate();
    };
  }, [gl, scene, camera, invalidate, apiRef, statusRef]);

  useFrame(() => {
    const tracer = tracerRef.current;
    if (!tracer) return;
    if (!lastCamMatrix.current.equals(camera.matrixWorld)) {
      lastCamMatrix.current.copy(camera.matrixWorld);
      tracer.updateCamera();
    }
    tracer.renderSample();
    const samples = Math.floor(tracer.samples);
    if (statusRef.current) {
      statusRef.current.textContent =
        samples >= PHOTO_MAX_SAMPLES ? 'Photo ready' : `Path tracing · ${samples} / ${PHOTO_MAX_SAMPLES} samples`;
    }
    if (samples < PHOTO_MAX_SAMPLES) invalidate();
  }, 1);

  return null;
}
