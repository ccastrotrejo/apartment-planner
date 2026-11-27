import * as THREE from 'three';

/** A CC0 photoscanned PBR set in public/textures/<id>/ (diff.webp, nor_gl.webp, rough.webp). */
export interface PhotoscanSet {
  readonly id: string;
  /** Real-world edge length of one texture tile, in inches. */
  readonly sizeInches: number;
  /** Multiplier on the scanned roughness map. */
  readonly roughness: number;
  readonly normalScale: number;
}

export const PHOTOSCANS = {
  // Poly Haven "Laminate Floor 02" (CC0), 1.7 m tile — wide light-oak planks matching the walkthrough.
  oakFloor: { id: 'laminate_floor_02', sizeInches: 1700 / 25.4, roughness: 0.92, normalScale: 0.8 },
} as const satisfies Record<string, PhotoscanSet>;

const loader = new THREE.TextureLoader();

function load(url: string, colorSpace: THREE.ColorSpace, repeat: THREE.Vector2): Promise<THREE.Texture> {
  return loader.loadAsync(url).then((t) => {
    t.colorSpace = colorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.copy(repeat);
    t.anisotropy = 8;
    return t;
  });
}

/**
 * Stream a photoscan into an existing material. The geometry's UVs span `uvTileInches` per unit
 * (TEX_INCHES), so the scan is repeated to its true physical size. Keeps the procedural maps if
 * loading fails. Returns a disposer.
 */
export function applyPhotoscan(
  material: THREE.MeshStandardMaterial,
  set: PhotoscanSet,
  uvTileInches: readonly [number, number],
  onApplied: () => void,
): () => void {
  let cancelled = false;
  const loaded: THREE.Texture[] = [];
  const base = `${import.meta.env.BASE_URL}textures/${set.id}/`;
  const repeat = new THREE.Vector2(uvTileInches[0] / set.sizeInches, uvTileInches[1] / set.sizeInches);
  Promise.all([
    load(`${base}diff.webp`, THREE.SRGBColorSpace, repeat),
    load(`${base}nor_gl.webp`, THREE.NoColorSpace, repeat),
    load(`${base}rough.webp`, THREE.NoColorSpace, repeat),
  ])
    .then(([map, normalMap, roughnessMap]) => {
      loaded.push(map, normalMap, roughnessMap);
      if (cancelled) return;
      material.map = map;
      material.normalMap = normalMap;
      material.normalScale.set(set.normalScale, set.normalScale);
      material.roughnessMap = roughnessMap;
      material.roughness = set.roughness;
      material.color.set(0xffffff);
      material.needsUpdate = true;
      onApplied();
    })
    .catch(() => {
      // Offline or missing file: the procedural canvas texture stays in place.
    });
  return () => {
    cancelled = true;
    loaded.forEach((t) => t.dispose());
  };
}
