import * as THREE from 'three';
import type { MaterialRole } from '../types';
import { getTextureBundle, type TextureKey } from './textures';

interface RoleConfig {
  readonly physical?: boolean;
  readonly roughness: number;
  readonly metalness?: number;
  readonly sheen?: number;
  readonly sheenRoughness?: number;
  readonly clearcoat?: number;
  readonly clearcoatRoughness?: number;
  readonly envMapIntensity?: number;
  readonly tex?: TextureKey;
  readonly emissive?: number;
  readonly emissiveIntensity?: number;
  readonly transmission?: number;
}

const ROLE_CONFIGS: Record<MaterialRole, RoleConfig> = {
  wood: { roughness: 0.52, tex: 'walnut', clearcoat: 0.12, clearcoatRoughness: 0.45, physical: true },
  walnut: { roughness: 0.48, tex: 'walnut', clearcoat: 0.16, clearcoatRoughness: 0.4, physical: true },
  oak: { roughness: 0.56, tex: 'walnut', clearcoat: 0.08, clearcoatRoughness: 0.5, physical: true },
  fabric: { physical: true, roughness: 0.92, sheen: 0.85, sheenRoughness: 0.8, tex: 'fabric' },
  velvet: { physical: true, roughness: 0.86, sheen: 1.0, sheenRoughness: 0.45, tex: 'fabric' },
  linen: { physical: true, roughness: 0.94, sheen: 0.65, sheenRoughness: 0.88, tex: 'fabric' },
  knit: { physical: true, roughness: 0.98, sheen: 0.75, sheenRoughness: 0.92, tex: 'rug' },
  leather: { physical: true, roughness: 0.42, clearcoat: 0.1, clearcoatRoughness: 0.6 },
  metal: { roughness: 0.28, metalness: 0.88, envMapIntensity: 1.05 },
  darkMetal: { roughness: 0.38, metalness: 0.72, envMapIntensity: 0.85 },
  chrome: { roughness: 0.1, metalness: 0.98, envMapIntensity: 1.25 },
  brass: { roughness: 0.24, metalness: 0.94, envMapIntensity: 1.15 },
  paint: { roughness: 0.46, metalness: 0.06 },
  screen: { physical: true, roughness: 0.08, metalness: 0.25, clearcoat: 0.85, clearcoatRoughness: 0.08, envMapIntensity: 1.1 },
  bezel: { roughness: 0.34, metalness: 0.45 },
  mirror: { roughness: 0.03, metalness: 0.98, envMapIntensity: 1.35 },
  ceramic: { physical: true, roughness: 0.15, clearcoat: 0.7, clearcoatRoughness: 0.12, envMapIntensity: 0.9 },
  terracotta: { roughness: 0.82, tex: 'plaster' },
  soil: { roughness: 0.98, tex: 'rug' },
  plant: { physical: true, roughness: 0.42, sheen: 0.35, sheenRoughness: 0.6, clearcoat: 0.18, clearcoatRoughness: 0.45 },
  plastic: { physical: true, roughness: 0.36, clearcoat: 0.15, clearcoatRoughness: 0.4 },
  rubber: { roughness: 0.9, metalness: 0.02 },
  rattan: { roughness: 0.76, tex: 'cane' },
  rug: { physical: true, roughness: 0.98, sheen: 0.7, sheenRoughness: 0.9, tex: 'rug' },
  shade: { physical: true, roughness: 0.78, sheen: 0.4, sheenRoughness: 0.8, emissive: 0xffe8c2, emissiveIntensity: 0.18, tex: 'fabric' },
  bulb: { roughness: 0.22, emissive: 0xffdfad, emissiveIntensity: 1.35 },
  mesh: { physical: true, roughness: 0.68, metalness: 0.12, sheen: 0.35, sheenRoughness: 0.7, tex: 'fabric' },
};

export function createRoleMaterial(
  colorHex: string | number,
  role: MaterialRole,
  side: THREE.Side = THREE.FrontSide,
): THREE.MeshStandardMaterial {
  const cfg = ROLE_CONFIGS[role];
  const bundle = cfg.tex ? getTextureBundle(cfg.tex) : {};
  const color = new THREE.Color(colorHex);

  const baseParams: THREE.MeshStandardMaterialParameters = {
    color,
    roughness: cfg.roughness,
    metalness: cfg.metalness ?? 0,
    envMapIntensity: cfg.envMapIntensity ?? ((cfg.metalness ?? 0) > 0.4 ? 1.0 : 0.42),
    side,
    map: bundle.map ?? null,
    bumpMap: bundle.bumpMap ?? null,
    bumpScale: bundle.bumpScale ?? 0,
    roughnessMap: bundle.roughnessMap ?? null,
  };

  if (cfg.emissive !== undefined) {
    baseParams.emissive = new THREE.Color(cfg.emissive);
    baseParams.emissiveIntensity = cfg.emissiveIntensity ?? 1;
  }

  if (cfg.physical) {
    const physParams: THREE.MeshPhysicalMaterialParameters = {
      ...baseParams,
      sheen: cfg.sheen ?? 0,
      sheenRoughness: cfg.sheenRoughness ?? 0.8,
      sheenColor: cfg.sheen ? color.clone().lerp(new THREE.Color(0xffffff), 0.35) : undefined,
      clearcoat: cfg.clearcoat ?? 0,
      clearcoatRoughness: cfg.clearcoatRoughness ?? 0.3,
    };
    return new THREE.MeshPhysicalMaterial(physParams);
  }

  return new THREE.MeshStandardMaterial(baseParams);
}

export interface ApartmentMaterials {
  readonly floorWood: THREE.MeshStandardMaterial;
  readonly floorTile: THREE.MeshStandardMaterial;
  readonly slabPlinth: THREE.MeshStandardMaterial;
  readonly wall: THREE.MeshStandardMaterial;
  readonly baseboard: THREE.MeshStandardMaterial;
  readonly doorFrame: THREE.MeshStandardMaterial;
  readonly doorLeaf: THREE.MeshStandardMaterial;
  readonly sill: THREE.MeshPhysicalMaterial;
  readonly mullion: THREE.MeshStandardMaterial;
  readonly glass: THREE.MeshPhysicalMaterial;
  readonly showerGlass: THREE.MeshPhysicalMaterial;
  readonly wallTile: THREE.MeshStandardMaterial;
  readonly cabWood: THREE.MeshStandardMaterial;
  readonly cabWhite: THREE.MeshPhysicalMaterial;
  readonly countertop: THREE.MeshPhysicalMaterial;
  readonly backsplash: THREE.MeshStandardMaterial;
  readonly backing: THREE.MeshStandardMaterial;
  readonly ceramic: THREE.MeshPhysicalMaterial;
  readonly appliance: THREE.MeshStandardMaterial;
  readonly cooktop: THREE.MeshStandardMaterial;
  readonly fixtureDark: THREE.MeshStandardMaterial;
  readonly fixtureMetal: THREE.MeshStandardMaterial;
  readonly mirror: THREE.MeshStandardMaterial;
  readonly bulb: THREE.MeshStandardMaterial;
}

export function createApartmentMaterials(): ApartmentMaterials {
  const planks = getTextureBundle('planks');
  const tile = getTextureBundle('tile');
  const wallTile = getTextureBundle('walltile');
  const splash = getTextureBundle('backsplash');
  const quartz = getTextureBundle('quartz');
  const laminate = getTextureBundle('laminate');
  const stainless = getTextureBundle('stainless');
  const plaster = getTextureBundle('plaster');

  return {
    floorWood: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: planks.map ?? null,
      bumpMap: planks.bumpMap ?? null,
      bumpScale: planks.bumpScale ?? 0.14,
      roughnessMap: planks.roughnessMap ?? null,
      roughness: 0.58,
      clearcoat: 0.08,
      clearcoatRoughness: 0.55,
      envMapIntensity: 0.48,
    }),
    floorTile: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: tile.map ?? null,
      bumpMap: tile.bumpMap ?? null,
      bumpScale: tile.bumpScale ?? 0.12,
      roughnessMap: tile.roughnessMap ?? null,
      roughness: 0.54,
      envMapIntensity: 0.42,
    }),
    slabPlinth: new THREE.MeshStandardMaterial({
      color: 0xc8c5be,
      roughness: 0.88,
      envMapIntensity: 0.25,
    }),
    wall: new THREE.MeshStandardMaterial({
      color: 0xf2efe9,
      bumpMap: plaster.bumpMap ?? null,
      bumpScale: plaster.bumpScale ?? 0.02,
      roughness: 0.86,
      envMapIntensity: 0.34,
    }),
    baseboard: new THREE.MeshStandardMaterial({
      color: 0xf7f6f2,
      roughness: 0.52,
      envMapIntensity: 0.38,
    }),
    doorFrame: new THREE.MeshStandardMaterial({
      color: 0xf5f4f0,
      roughness: 0.48,
      envMapIntensity: 0.38,
    }),
    doorLeaf: new THREE.MeshStandardMaterial({
      color: 0xefede8,
      roughness: 0.52,
      envMapIntensity: 0.38,
    }),
    sill: new THREE.MeshPhysicalMaterial({
      color: 0xf5f4f0,
      map: quartz.map ?? null,
      roughness: 0.32,
      clearcoat: 0.25,
      clearcoatRoughness: 0.3,
      envMapIntensity: 0.55,
    }),
    mullion: new THREE.MeshStandardMaterial({
      color: 0x1c1e21,
      roughness: 0.44,
      metalness: 0.55,
      envMapIntensity: 0.85,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xaad0e2,
      transparent: true,
      opacity: 0.28,
      roughness: 0.06,
      metalness: 0.08,
      reflectivity: 0.9,
      envMapIntensity: 1.25,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    showerGlass: new THREE.MeshPhysicalMaterial({
      color: 0xd8ecef,
      transparent: true,
      opacity: 0.24,
      roughness: 0.05,
      metalness: 0.05,
      clearcoat: 0.9,
      envMapIntensity: 1.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    wallTile: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: wallTile.map ?? null,
      bumpMap: wallTile.bumpMap ?? null,
      bumpScale: wallTile.bumpScale ?? 0.1,
      roughnessMap: wallTile.roughnessMap ?? null,
      roughness: 0.36,
      envMapIntensity: 0.55,
    }),
    cabWood: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: laminate.map ?? null,
      bumpMap: laminate.bumpMap ?? null,
      bumpScale: laminate.bumpScale ?? 0.08,
      roughness: 0.5,
      envMapIntensity: 0.45,
    }),
    cabWhite: new THREE.MeshPhysicalMaterial({
      color: 0xf7f6f2,
      roughness: 0.42,
      clearcoat: 0.15,
      clearcoatRoughness: 0.38,
      envMapIntensity: 0.5,
    }),
    countertop: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: quartz.map ?? null,
      roughness: 0.22,
      clearcoat: 0.55,
      clearcoatRoughness: 0.16,
      envMapIntensity: 0.72,
    }),
    backsplash: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: splash.map ?? null,
      bumpMap: splash.bumpMap ?? null,
      bumpScale: splash.bumpScale ?? 0.1,
      roughnessMap: splash.roughnessMap ?? null,
      roughness: 0.26,
      envMapIntensity: 0.6,
    }),
    backing: new THREE.MeshStandardMaterial({
      color: 0xefece6,
      roughness: 0.9,
      envMapIntensity: 0.3,
    }),
    ceramic: new THREE.MeshPhysicalMaterial({
      color: 0xf9fafa,
      roughness: 0.12,
      clearcoat: 0.82,
      clearcoatRoughness: 0.09,
      envMapIntensity: 0.95,
    }),
    appliance: new THREE.MeshStandardMaterial({
      color: 0xb6bcc1,
      bumpMap: stainless.bumpMap ?? null,
      bumpScale: stainless.bumpScale ?? 0.025,
      roughnessMap: stainless.roughnessMap ?? null,
      roughness: 0.28,
      metalness: 0.84,
      envMapIntensity: 1.05,
    }),
    cooktop: new THREE.MeshStandardMaterial({
      color: 0x26292c,
      roughness: 0.18,
      metalness: 0.18,
      envMapIntensity: 0.8,
    }),
    fixtureDark: new THREE.MeshStandardMaterial({
      color: 0x222529,
      roughness: 0.26,
      metalness: 0.24,
      envMapIntensity: 0.7,
    }),
    fixtureMetal: new THREE.MeshStandardMaterial({
      color: 0xd4dade,
      roughness: 0.18,
      metalness: 0.9,
      envMapIntensity: 1.15,
    }),
    mirror: new THREE.MeshStandardMaterial({
      color: 0xdbe5e9,
      roughness: 0.04,
      metalness: 0.94,
      envMapIntensity: 1.25,
    }),
    bulb: new THREE.MeshStandardMaterial({
      color: 0xfff8ec,
      roughness: 0.25,
      emissive: new THREE.Color(0xffebd0),
      emissiveIntensity: 1.35,
    }),
  };
}
