import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  buildArchedMirror,
  buildCoatRack,
  buildGalleryPrints,
  buildHallCabinet,
  buildNightstand,
  buildQueenBed,
  buildRoadBike,
  buildShoeCabinet,
  buildTripodLamp,
} from './furnitureBedroomEntry';
import {
  buildCoffeeTable,
  buildOfficeChair,
  buildSectional,
  buildStandingDesk,
  buildTierShelf,
  buildTorchiere,
  buildWallTv,
} from './furnitureLivingOffice';
import { buildMonstera, buildRug, buildZzPlant } from './furniturePlants';
import type { FurniturePartDef } from './furniturePrimitives';
import { createRoleMaterial } from './materials';

export { getPartPlanEdges, type FurniturePartDef } from './furniturePrimitives';

const FURNITURE_BUILDERS: Readonly<Record<string, () => FurniturePartDef[]>> = {
  sectional: buildSectional,
  'coffee-table': () => buildCoffeeTable(false),
  'coffee-table-open': () => buildCoffeeTable(true),
  'tv-stand': buildWallTv,
  'tier-shelf': buildTierShelf,
  'torchiere-lamp': buildTorchiere,
  'standing-desk': buildStandingDesk,
  'office-chair': buildOfficeChair,
  'queen-bed': buildQueenBed,
  nightstand: buildNightstand,
  'tripod-lamp': buildTripodLamp,
  'coat-rack': buildCoatRack,
  'shoe-cabinet': buildShoeCabinet,
  'arched-mirror': buildArchedMirror,
  'hall-cabinet': buildHallCabinet,
  'bike-black': buildRoadBike,
  'gallery-prints': buildGalleryPrints,
  'rug-6x9': buildRug,
  'plant-monstera': buildMonstera,
  'plant-zz': buildZzPlant,
};

const PART_CACHE = new Map<string, FurniturePartDef[]>();

export function getFurnitureParts(key: string): FurniturePartDef[] {
  const cached = PART_CACHE.get(key);
  if (cached) return cached;
  const parts = FURNITURE_BUILDERS[key]?.() ?? [];
  PART_CACHE.set(key, parts);
  return parts;
}


let softShadowTex: THREE.CanvasTexture | null = null;
export function getSoftContactShadowTexture(): THREE.CanvasTexture | null {
  if (softShadowTex) return softShadowTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  g.addColorStop(0, 'rgba(18, 22, 24, 0.34)');
  g.addColorStop(0.55, 'rgba(18, 22, 24, 0.16)');
  g.addColorStop(1, 'rgba(18, 22, 24, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  softShadowTex = new THREE.CanvasTexture(c);
  softShadowTex.needsUpdate = true;
  return softShadowTex;
}

/** Render crisp 3/4-view 3D thumbnails for every visible catalog entry. */
export async function renderFurnitureThumbnails(keys: ReadonlyArray<string>): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (keys.length === 0 || typeof window === 'undefined') return out;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    return out;
  }

  const S = 128;
  renderer.setPixelRatio(1);
  renderer.setSize(S, S, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envTarget.texture;
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight(0xfffaf2, 0x8f897e, 0.45));
  const keyLight = new THREE.DirectionalLight(0xfff4e4, 1.45);
  keyLight.position.set(-70, 170, 130);
  scene.add(keyLight);

  const cam = new THREE.PerspectiveCamera(28, 1, 1, 4000);
  const viewDir = new THREE.Vector3(0.75, 0.62, 1.25).normalize();
  const box = new THREE.Box3();
  const sph = new THREE.Sphere();

  try {
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const grp = new THREE.Group();
      const mats: THREE.Material[] = [];
      try {
        for (const p of getFurnitureParts(k)) {
          const m = createRoleMaterial(p.color, p.role);
          mats.push(m);
          grp.add(new THREE.Mesh(p.geometry, m));
        }
        scene.add(grp);
        box.setFromObject(grp).getBoundingSphere(sph);
        const dist = (sph.radius / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2))) * 1.06;
        cam.position.copy(sph.center).addScaledVector(viewDir, dist);
        cam.lookAt(sph.center);
        cam.near = Math.max(0.5, dist / 20);
        cam.far = dist * 4;
        cam.updateProjectionMatrix();
        renderer.render(scene, cam);
        out[k] = renderer.domElement.toDataURL('image/png');
      } finally {
        scene.remove(grp);
        mats.forEach((m) => m.dispose());
      }
      if ((i + 1) % 3 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
  } finally {
    envTarget.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
  return out;
}
