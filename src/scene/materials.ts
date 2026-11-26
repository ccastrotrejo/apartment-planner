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
  readonly transparent?: boolean;
  readonly opacity?: number;
  readonly doubleSide?: boolean;
}

const ROLE_CONFIGS: Record<MaterialRole, RoleConfig> = {
  wood: { roughness: 0.5, tex: 'walnut', clearcoat: 0.14, clearcoatRoughness: 0.42, physical: true },
  walnut: { roughness: 0.46, tex: 'walnut', clearcoat: 0.18, clearcoatRoughness: 0.38, physical: true },
  oak: { roughness: 0.54, tex: 'walnut', clearcoat: 0.1, clearcoatRoughness: 0.48, physical: true },
  fabric: { physical: true, roughness: 0.92, sheen: 0.9, sheenRoughness: 0.78, tex: 'fabric' },
  velvet: { physical: true, roughness: 0.84, sheen: 1.0, sheenRoughness: 0.42, tex: 'fabric' },
  linen: { physical: true, roughness: 0.94, sheen: 0.7, sheenRoughness: 0.86, tex: 'fabric' },
  knit: { physical: true, roughness: 0.98, sheen: 0.8, sheenRoughness: 0.9, tex: 'rug' },
  leather: { physical: true, roughness: 0.4, clearcoat: 0.12, clearcoatRoughness: 0.55 },
  metal: { roughness: 0.26, metalness: 0.9, tex: 'stainless', envMapIntensity: 1.1 },
  darkMetal: { roughness: 0.36, metalness: 0.76, envMapIntensity: 0.9 },
  chrome: { roughness: 0.08, metalness: 0.98, envMapIntensity: 1.3 },
  brass: { roughness: 0.22, metalness: 0.95, envMapIntensity: 1.2 },
  paint: { roughness: 0.42, metalness: 0.08 },
  screen: { physical: true, roughness: 0.08, metalness: 0.25, clearcoat: 0.85, clearcoatRoughness: 0.08, envMapIntensity: 1.1 },
  tvArt: {
    physical: true,
    roughness: 0.18,
    clearcoat: 0.75,
    clearcoatRoughness: 0.12,
    tex: 'tvArt',
    emissive: 0xffffff,
    emissiveIntensity: 0.26,
    envMapIntensity: 0.85,
  },
  ideScreen: {
    physical: true,
    roughness: 0.14,
    clearcoat: 0.65,
    clearcoatRoughness: 0.12,
    tex: 'ideScreen',
    emissive: 0xffffff,
    emissiveIntensity: 0.48,
    envMapIntensity: 0.8,
  },
  bezel: { roughness: 0.32, metalness: 0.48 },
  mirror: { roughness: 0.025, metalness: 0.98, envMapIntensity: 1.4 },
  ceramic: { physical: true, roughness: 0.14, clearcoat: 0.76, clearcoatRoughness: 0.1, envMapIntensity: 0.95 },
  terracotta: { roughness: 0.82, tex: 'plaster' },
  soil: { roughness: 0.98, tex: 'rug' },
  plant: {
    physical: true,
    roughness: 0.38,
    sheen: 0.38,
    sheenRoughness: 0.58,
    clearcoat: 0.22,
    clearcoatRoughness: 0.42,
    tex: 'leaf',
  },
  plastic: { physical: true, roughness: 0.36, clearcoat: 0.15, clearcoatRoughness: 0.4 },
  rubber: { roughness: 0.9, metalness: 0.02 },
  tanwall: { roughness: 0.78, tex: 'fabric' },
  rattan: { roughness: 0.74, tex: 'cane' },
  rug: { physical: true, roughness: 0.98, sheen: 0.75, sheenRoughness: 0.9, tex: 'rug' },
  shade: {
    physical: true,
    roughness: 0.76,
    sheen: 0.42,
    sheenRoughness: 0.78,
    emissive: 0xffe4b8,
    emissiveIntensity: 0.28,
    tex: 'fabric',
  },
  bulb: { roughness: 0.2, emissive: 0xffdfad, emissiveIntensity: 1.6 },
  mesh: {
    physical: true,
    roughness: 0.62,
    metalness: 0.14,
    sheen: 0.35,
    sheenRoughness: 0.7,
    tex: 'pellicle',
    transparent: true,
    opacity: 0.86,
    doubleSide: true,
  },
};

export function createRoleMaterial(
  colorHex: string | number,
  role: MaterialRole,
  side: THREE.Side = THREE.FrontSide,
): THREE.MeshStandardMaterial {
  const cfg = ROLE_CONFIGS[role];
  const bundle = cfg.tex ? getTextureBundle(cfg.tex) : {};
  const isFullColorTex = role === 'tvArt' || role === 'ideScreen';
  const color = new THREE.Color(isFullColorTex ? 0xffffff : colorHex);

  const baseParams: THREE.MeshStandardMaterialParameters = {
    color,
    roughness: cfg.roughness,
    metalness: cfg.metalness ?? 0,
    envMapIntensity: cfg.envMapIntensity ?? ((cfg.metalness ?? 0) > 0.4 ? 1.0 : 0.44),
    side: cfg.doubleSide ? THREE.DoubleSide : side,
    transparent: cfg.transparent ?? false,
    opacity: cfg.opacity ?? 1,
    map: bundle.map ?? null,
    normalMap: bundle.normalMap ?? null,
    normalScale: bundle.normalMap
      ? new THREE.Vector2(bundle.normalScale ?? 0.5, bundle.normalScale ?? 0.5)
      : undefined,
    bumpMap: bundle.bumpMap ?? null,
    bumpScale: bundle.bumpScale ?? 0,
    roughnessMap: bundle.roughnessMap ?? null,
    alphaMap: bundle.alphaMap ?? null,
    emissiveMap: bundle.emissiveMap ?? null,
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
      normalMap: planks.normalMap ?? null,
      normalScale: new THREE.Vector2(planks.normalScale ?? 0.65, planks.normalScale ?? 0.65),
      roughnessMap: planks.roughnessMap ?? null,
      roughness: 0.56,
      clearcoat: 0.1,
      clearcoatRoughness: 0.5,
      envMapIntensity: 0.52,
    }),
    floorTile: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: tile.map ?? null,
      normalMap: tile.normalMap ?? null,
      normalScale: new THREE.Vector2(tile.normalScale ?? 0.55, tile.normalScale ?? 0.55),
      roughnessMap: tile.roughnessMap ?? null,
      roughness: 0.52,
      envMapIntensity: 0.46,
    }),
    slabPlinth: new THREE.MeshStandardMaterial({
      color: 0xc2beb6,
      roughness: 0.9,
      envMapIntensity: 0.25,
    }),
    wall: new THREE.MeshStandardMaterial({
      color: 0xf1eee7,
      normalMap: plaster.normalMap ?? null,
      normalScale: new THREE.Vector2(plaster.normalScale ?? 0.14, plaster.normalScale ?? 0.14),
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
      normalMap: wallTile.normalMap ?? null,
      normalScale: new THREE.Vector2(wallTile.normalScale ?? 0.5, wallTile.normalScale ?? 0.5),
      roughnessMap: wallTile.roughnessMap ?? null,
      roughness: 0.34,
      envMapIntensity: 0.58,
    }),
    cabWood: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: laminate.map ?? null,
      normalMap: laminate.normalMap ?? null,
      normalScale: new THREE.Vector2(laminate.normalScale ?? 0.4, laminate.normalScale ?? 0.4),
      roughness: 0.48,
      envMapIntensity: 0.48,
    }),
    cabWhite: new THREE.MeshPhysicalMaterial({
      color: 0xf7f6f2,
      roughness: 0.42,
      clearcoat: 0.16,
      clearcoatRoughness: 0.36,
      envMapIntensity: 0.5,
    }),
    countertop: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: quartz.map ?? null,
      roughness: 0.2,
      clearcoat: 0.62,
      clearcoatRoughness: 0.14,
      envMapIntensity: 0.76,
    }),
    backsplash: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: splash.map ?? null,
      normalMap: splash.normalMap ?? null,
      normalScale: new THREE.Vector2(splash.normalScale ?? 0.5, splash.normalScale ?? 0.5),
      roughnessMap: splash.roughnessMap ?? null,
      roughness: 0.24,
      envMapIntensity: 0.62,
    }),
    backing: new THREE.MeshStandardMaterial({
      color: 0xefece6,
      roughness: 0.9,
      envMapIntensity: 0.3,
    }),
    ceramic: new THREE.MeshPhysicalMaterial({
      color: 0xf9fafa,
      roughness: 0.11,
      clearcoat: 0.85,
      clearcoatRoughness: 0.08,
      envMapIntensity: 0.98,
    }),
    appliance: new THREE.MeshStandardMaterial({
      color: 0xbac0c5,
      normalMap: stainless.normalMap ?? null,
      normalScale: new THREE.Vector2(stainless.normalScale ?? 0.24, stainless.normalScale ?? 0.24),
      roughnessMap: stainless.roughnessMap ?? null,
      roughness: 0.26,
      metalness: 0.86,
      envMapIntensity: 1.08,
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
