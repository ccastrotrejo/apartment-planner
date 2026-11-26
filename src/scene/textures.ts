import * as THREE from 'three';

export interface TextureBundle {
  readonly map?: THREE.CanvasTexture;
  readonly normalMap?: THREE.CanvasTexture;
  readonly bumpMap?: THREE.CanvasTexture;
  readonly roughnessMap?: THREE.CanvasTexture;
  readonly alphaMap?: THREE.CanvasTexture;
  readonly emissiveMap?: THREE.CanvasTexture;
  readonly normalScale?: number;
  readonly bumpScale?: number;
}

type Rng = () => number;

function mulberry32(seed: number): Rng {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D | null] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = c.getContext('2d');
  } catch {
    ctx = null;
  }
  return [c, ctx];
}

function wrapTex(
  c: HTMLCanvasElement,
  colorSpace: THREE.ColorSpace,
  clamp = false,
): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.wrapT = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.colorSpace = colorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/** Convert a seamless grayscale heightfield canvas into a tangent-space RGB normal map via 3x3 Sobel filter. */
function heightToNormalTex(heightCanvas: HTMLCanvasElement, strength = 2.2): THREE.CanvasTexture | undefined {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const hCtx = heightCanvas.getContext('2d');
  if (!hCtx) return undefined;
  const [nc, nCtx] = makeCanvas(w, h);
  if (!nCtx) return undefined;

  const src = hCtx.getImageData(0, 0, w, h).data;
  const outImg = nCtx.createImageData(w, h);
  const dst = outImg.data;
  const sample = (x: number, y: number): number => {
    const wx = ((x % w) + w) % w;
    const wy = ((y % h) + h) % h;
    return src[(wy * w + wx) * 4] / 255;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tl = sample(x - 1, y - 1);
      const t = sample(x, y - 1);
      const tr = sample(x + 1, y - 1);
      const l = sample(x - 1, y);
      const r = sample(x + 1, y);
      const bl = sample(x - 1, y + 1);
      const b = sample(x, y + 1);
      const br = sample(x + 1, y + 1);

      const dx = (tr + 2 * r + br - (tl + 2 * l + bl)) * strength;
      const dy = (bl + 2 * b + br - (tl + 2 * t + tr)) * strength;
      const invLen = 1 / Math.hypot(dx, dy, 1);

      const idx = (y * w + x) * 4;
      dst[idx] = Math.round((-dx * invLen * 0.5 + 0.5) * 255);
      dst[idx + 1] = Math.round((-dy * invLen * 0.5 + 0.5) * 255);
      dst[idx + 2] = Math.round((invLen * 0.5 + 0.5) * 255);
      dst[idx + 3] = 255;
    }
  }
  nCtx.putImageData(outImg, 0, 0);
  return wrapTex(nc, THREE.NoColorSpace);
}

function addNoise(ctx: CanvasRenderingContext2D, w: number, h: number, r: Rng, amp: number): void {
  const im = ctx.getImageData(0, 0, w, h);
  const d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amp;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(im, 0, 0);
}

const jit = (r: Rng, c: readonly [number, number, number], d: number): [number, number, number] => [
  Math.round(c[0] + (r() - 0.5) * 2 * d),
  Math.round(c[1] + (r() - 0.5) * 2 * d),
  Math.round(c[2] + (r() - 0.5) * 2 * d),
];

const rgb = (c: readonly [number, number, number], a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

export type TextureKey =
  | 'planks'
  | 'tile'
  | 'walltile'
  | 'backsplash'
  | 'quartz'
  | 'laminate'
  | 'walnut'
  | 'stainless'
  | 'fabric'
  | 'rug'
  | 'cane'
  | 'pellicle'
  | 'leaf'
  | 'tvArt'
  | 'ideScreen'
  | 'plaster';

export const TEX_INCHES: Record<TextureKey, readonly [number, number]> = {
  planks: [52.5, 105],
  tile: [48, 48],
  walltile: [48, 48],
  backsplash: [30, 30],
  quartz: [64, 64],
  laminate: [26, 52],
  walnut: [24, 38],
  stainless: [24, 24],
  fabric: [10, 10],
  rug: [14, 14],
  cane: [4.5, 4.5],
  pellicle: [3.5, 3.5],
  leaf: [10, 10],
  tvArt: [1, 1],
  ideScreen: [1, 1],
  plaster: [36, 36],
};

const CACHE = new Map<TextureKey, TextureBundle>();

function drawOakPlank(
  cCtx: CanvasRenderingContext2D,
  bCtx: CanvasRenderingContext2D,
  rCtx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: Rng,
): void {
  // Natural grey-washed European oak tones with grounded contrast against pale rugs & walls
  const palette: ReadonlyArray<readonly [number, number, number]> = [
    [148, 134, 117],
    [142, 129, 114],
    [154, 139, 121],
    [138, 126, 112],
    [151, 137, 120],
    [145, 131, 115],
  ];
  const base = jit(r, palette[Math.floor(r() * palette.length)], 4);

  cCtx.save();
  bCtx.save();
  rCtx.save();
  cCtx.beginPath();
  cCtx.rect(x, y, w, h);
  cCtx.clip();
  bCtx.beginPath();
  bCtx.rect(x, y, w, h);
  bCtx.clip();
  rCtx.beginPath();
  rCtx.rect(x, y, w, h);
  rCtx.clip();

  cCtx.fillStyle = rgb(base);
  cCtx.fillRect(x, y, w, h);

  // Subtle plank-to-plank satin sheen variation
  const roughVal = Math.round(132 + (r() - 0.5) * 26);
  rCtx.fillStyle = `rgb(${roughVal},${roughVal},${roughVal})`;
  rCtx.fillRect(x, y, w, h);

  bCtx.fillStyle = 'rgb(148,148,148)';
  bCtx.fillRect(x, y, w, h);

  // Soft sapwood/heartwood streaks
  for (let i = 0; i < 6; i++) {
    const sx = x + r() * w;
    const sw = 8 + r() * w * 0.35;
    cCtx.fillStyle = r() < 0.5 ? `rgba(255,250,242,${0.03 + r() * 0.04})` : `rgba(92,74,56,${0.03 + r() * 0.04})`;
    cCtx.fillRect(sx - sw / 2, y, sw, h);
  }

  // Fine straight oak pores in both albedo and bump
  for (let i = 0; i < 38; i++) {
    const gx = x + r() * w;
    const amp = 0.35 + r() * 1.25;
    const ph = r() * 6.28;
    const fr = 65 + r() * 130;
    const lw = 0.45 + r() * 1.0;
    cCtx.strokeStyle = `rgba(96,78,60,${0.05 + r() * 0.11})`;
    cCtx.lineWidth = lw;
    bCtx.strokeStyle = `rgba(105,105,105,${0.18 + r() * 0.22})`;
    bCtx.lineWidth = lw;
    cCtx.beginPath();
    bCtx.beginPath();
    for (let yy = 0; yy <= h; yy += 12) {
      const px = gx + Math.sin(yy / fr + ph) * amp;
      if (yy === 0) {
        cCtx.moveTo(px, y);
        bCtx.moveTo(px, y);
      } else {
        cCtx.lineTo(px, y + yy);
        bCtx.lineTo(px, y + yy);
      }
    }
    cCtx.stroke();
    bCtx.stroke();
  }

  // Soft cathedral arches
  const cats = 1 + Math.floor(r() * 2);
  for (let c = 0; c < cats; c++) {
    const cx = x + w * (0.25 + r() * 0.5);
    const ay = y + r() * h;
    const len = h * (0.16 + r() * 0.24);
    const dir = r() < 0.5 ? 1 : -1;
    for (let k = 1; k <= 6; k++) {
      const hw = w * 0.052 * k;
      const ll = len * (0.35 + k * 0.1);
      cCtx.strokeStyle = `rgba(94,75,56,${0.05 + r() * 0.08})`;
      cCtx.lineWidth = 0.7 + r() * 0.8;
      cCtx.beginPath();
      for (let t = -1; t <= 1.001; t += 0.1) {
        const px = cx + t * hw;
        const py = ay + dir * (1 - t * t) * ll * -1 + dir * ll;
        if (t === -1) cCtx.moveTo(px, py);
        else cCtx.lineTo(px, py);
      }
      cCtx.stroke();
    }
  }

  // Occasional small pin knots
  if (r() < 0.32) {
    const kx = x + w * (0.18 + r() * 0.64);
    const ky = y + r() * h;
    const kr = 2.2 + r() * 3.8;
    cCtx.fillStyle = `rgba(84,64,48,${0.38 + r() * 0.22})`;
    cCtx.beginPath();
    cCtx.ellipse(kx, ky, kr * 0.65, kr * 1.35, 0, 0, Math.PI * 2);
    cCtx.fill();
  }

  // Plank end micro-bevel seam (albedo + recessed bump + matte joint roughness)
  cCtx.fillStyle = 'rgba(72,58,45,0.42)';
  cCtx.fillRect(x, y, w, 2);
  cCtx.fillStyle = 'rgba(255,252,246,0.16)';
  cCtx.fillRect(x, y + 2, w, 1);

  bCtx.fillStyle = 'rgb(42,42,42)';
  bCtx.fillRect(x, y, w, 2.2);
  rCtx.fillStyle = 'rgb(225,225,225)';
  rCtx.fillRect(x, y, w, 2.5);

  cCtx.restore();
  bCtx.restore();
  rCtx.restore();
}

export function getTextureBundle(key: TextureKey): TextureBundle {
  const existing = CACHE.get(key);
  if (existing) return existing;

  const r = mulberry32(key.split('').reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 17));
  let bundle: TextureBundle = {};

  if (key === 'planks') {
    const W = 1024;
    const H = 2048;
    const [cc, cCtx] = makeCanvas(W, H);
    const [bc, bCtx] = makeCanvas(W, H);
    const [rc, rCtx] = makeCanvas(W, H);
    if (cCtx && bCtx && rCtx) {
      const cols = 7;
      const cw = W / cols;
      for (let c = 0; c < cols; c++) {
        let y = r() * H;
        const end = y + H;
        while (y < end) {
          const len = Math.min(H * (0.45 + r() * 0.26), end - y);
          for (const off of [0, -H]) {
            drawOakPlank(cCtx, bCtx, rCtx, c * cw, y + off, cw, len, r);
          }
          y += len;
        }
        cCtx.fillStyle = 'rgba(68,54,42,0.42)';
        cCtx.fillRect(c * cw, 0, 1.8, H);
        cCtx.fillStyle = 'rgba(255,252,246,0.15)';
        cCtx.fillRect(c * cw + 1.8, 0, 1, H);

        bCtx.fillStyle = 'rgb(38,38,38)';
        bCtx.fillRect(c * cw, 0, 2.2, H);
        rCtx.fillStyle = 'rgb(225,225,225)';
        rCtx.fillRect(c * cw, 0, 2.5, H);
      }
      addNoise(cCtx, W, H, r, 6);
      bundle = {
        map: wrapTex(cc, THREE.SRGBColorSpace),
        normalMap: heightToNormalTex(bc, 2.6),
        roughnessMap: wrapTex(rc, THREE.NoColorSpace),
        normalScale: 0.65,
      };
    }
  } else if (key === 'tile' || key === 'walltile' || key === 'backsplash') {
    const W = 1024;
    const H = 1024;
    const [cc, cCtx] = makeCanvas(W, H);
    const [bc, bCtx] = makeCanvas(W, H);
    const [rc, rCtx] = makeCanvas(W, H);
    if (cCtx && bCtx && rCtx) {
      const isFloor = key === 'tile';
      const isSplash = key === 'backsplash';
      const groutRgb = isFloor ? 'rgb(154,150,144)' : isSplash ? 'rgb(218,216,212)' : 'rgb(214,212,208)';
      const tileBase: [number, number, number] = isFloor
        ? [136, 133, 127]
        : isSplash
          ? [242, 241, 238]
          : [222, 220, 215];

      cCtx.fillStyle = groutRgb;
      cCtx.fillRect(0, 0, W, H);
      bCtx.fillStyle = 'rgb(48,48,48)';
      bCtx.fillRect(0, 0, W, H);
      rCtx.fillStyle = 'rgb(235,235,235)';
      rCtx.fillRect(0, 0, W, H);

      const cols = isSplash ? 3 : 2;
      const rows = isSplash ? 6 : 4;
      const tw = W / cols;
      const th = H / rows;
      const gr = isSplash ? 2.2 : 2.5;

      for (let row = 0; row < rows; row++) {
        for (let col = -1; col < cols + 1; col++) {
          const stagger = isSplash ? (row % 2) * (tw * 0.5) : (row % 2) * (tw * 0.5);
          const x = col * tw + stagger;
          const y = row * th;
          const v = jit(r, tileBase, isFloor ? 4 : 2.5);

          cCtx.save();
          cCtx.beginPath();
          cCtx.rect(x + gr, y + gr, tw - 2 * gr, th - 2 * gr);
          cCtx.clip();
          cCtx.fillStyle = rgb(v);
          cCtx.fillRect(x, y, tw, th);

          // Mineral / glaze clouding
          const clouds = isFloor ? 22 : 10;
          for (let k = 0; k < clouds; k++) {
            const cx = x + r() * tw;
            const cy = y + r() * th;
            const rad = 28 + r() * 110;
            const g = cCtx.createRadialGradient(cx, cy, 0, cx, cy, rad);
            const shade = r() < 0.5 ? '255,253,250' : '92,88,82';
            g.addColorStop(0, `rgba(${shade},${isFloor ? 0.06 : 0.035})`);
            g.addColorStop(1, `rgba(${shade},0)`);
            cCtx.fillStyle = g;
            cCtx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
          }
          cCtx.restore();

          bCtx.fillStyle = 'rgb(176,176,176)';
          bCtx.fillRect(x + gr, y + gr, tw - 2 * gr, th - 2 * gr);
          const tileRough = isFloor ? 128 + Math.round((r() - 0.5) * 18) : 78 + Math.round((r() - 0.5) * 14);
          rCtx.fillStyle = `rgb(${tileRough},${tileRough},${tileRough})`;
          rCtx.fillRect(x + gr, y + gr, tw - 2 * gr, th - 2 * gr);
        }
      }
      addNoise(cCtx, W, H, r, isFloor ? 6 : 3);
      bundle = {
        map: wrapTex(cc, THREE.SRGBColorSpace),
        normalMap: heightToNormalTex(bc, 2.4),
        roughnessMap: wrapTex(rc, THREE.NoColorSpace),
        normalScale: 0.55,
      };
    }
  } else if (key === 'quartz') {
    const W = 512;
    const H = 512;
    const [cc, cCtx] = makeCanvas(W, H);
    if (cCtx) {
      cCtx.fillStyle = 'rgb(245,244,240)';
      cCtx.fillRect(0, 0, W, H);
      // Soft Calacatta warm-taupe veins
      for (let v = 0; v < 9; v++) {
        let vx = r() * W;
        let vy = r() * H;
        cCtx.strokeStyle = `rgba(182,176,168,${0.12 + r() * 0.14})`;
        cCtx.lineWidth = 0.8 + r() * 2.4;
        cCtx.beginPath();
        cCtx.moveTo(vx, vy);
        for (let s = 0; s < 14; s++) {
          vx += 18 + (r() - 0.35) * 28;
          vy += 12 + (r() - 0.45) * 24;
          cCtx.lineTo(vx, vy);
        }
        cCtx.stroke();
      }
      addNoise(cCtx, W, H, r, 3);
      bundle = { map: wrapTex(cc, THREE.SRGBColorSpace) };
    }
  } else if (key === 'laminate' || key === 'walnut') {
    const W = 512;
    const H = 1024;
    const [cc, cCtx] = makeCanvas(W, H);
    const [bc, bCtx] = makeCanvas(W, H);
    if (cCtx && bCtx) {
      const isLam = key === 'laminate';
      // laminate is full-color greige rift-oak; walnut is neutral light-tinted so material color tints each wood piece
      cCtx.fillStyle = isLam ? 'rgb(184,171,155)' : 'rgb(238,234,228)';
      cCtx.fillRect(0, 0, W, H);
      bCtx.fillStyle = 'rgb(140,140,140)';
      bCtx.fillRect(0, 0, W, H);

      for (let i = 0; i < 12; i++) {
        const sx = r() * W;
        const sw = 12 + r() * 58;
        cCtx.fillStyle = r() < 0.5 ? 'rgba(255,250,244,0.045)' : 'rgba(55,40,28,0.05)';
        cCtx.fillRect(sx, 0, sw, H);
      }
      const strokes = isLam ? 200 : 140;
      for (let i = 0; i < strokes; i++) {
        const gx = r() * W;
        const amp = isLam ? 0.5 + r() * 0.9 : 1.0 + r() * 2.2;
        const ph = r() * 6.28;
        const lw = 0.45 + r() * 1.1;
        cCtx.strokeStyle = `rgba(60,44,30,${(isLam ? 0.04 : 0.07) + r() * 0.08})`;
        cCtx.lineWidth = lw;
        bCtx.strokeStyle = `rgba(98,98,98,${0.16 + r() * 0.2})`;
        bCtx.lineWidth = lw;
        cCtx.beginPath();
        bCtx.beginPath();
        for (let y = 0; y <= H; y += 14) {
          const px = gx + Math.sin(y / 52 + ph) * amp;
          if (y === 0) {
            cCtx.moveTo(px, 0);
            bCtx.moveTo(px, 0);
          } else {
            cCtx.lineTo(px, y);
            bCtx.lineTo(px, y);
          }
        }
        cCtx.stroke();
        bCtx.stroke();
      }
      addNoise(cCtx, W, H, r, 5);
      bundle = {
        map: wrapTex(cc, THREE.SRGBColorSpace),
        normalMap: heightToNormalTex(bc, 1.9),
        normalScale: 0.42,
      };
    }
  } else if (key === 'stainless') {
    const W = 256;
    const H = 256;
    const [bc, bCtx] = makeCanvas(W, H);
    const [rc, rCtx] = makeCanvas(W, H);
    if (bCtx && rCtx) {
      bCtx.fillStyle = 'rgb(128,128,128)';
      bCtx.fillRect(0, 0, W, H);
      rCtx.fillStyle = 'rgb(76,76,76)';
      rCtx.fillRect(0, 0, W, H);
      for (let i = 0; i < 280; i++) {
        const y = r() * H;
        bCtx.strokeStyle = r() < 0.5 ? 'rgba(165,165,165,0.22)' : 'rgba(92,92,92,0.22)';
        bCtx.lineWidth = 0.6 + r() * 0.8;
        bCtx.beginPath();
        bCtx.moveTo(0, y);
        bCtx.lineTo(W, y);
        bCtx.stroke();

        const rv = 62 + Math.round(r() * 34);
        rCtx.strokeStyle = `rgba(${rv},${rv},${rv},0.25)`;
        rCtx.beginPath();
        rCtx.moveTo(0, y);
        rCtx.lineTo(W, y);
        rCtx.stroke();
      }
      bundle = {
        normalMap: heightToNormalTex(bc, 1.4),
        roughnessMap: wrapTex(rc, THREE.NoColorSpace),
        normalScale: 0.24,
      };
    }
  } else if (key === 'fabric') {
    const W = 256;
    const H = 256;
    const [cc, cCtx] = makeCanvas(W, H);
    const [bc, bCtx] = makeCanvas(W, H);
    if (cCtx && bCtx) {
      cCtx.fillStyle = 'rgb(244,243,240)';
      cCtx.fillRect(0, 0, W, H);
      bCtx.fillStyle = 'rgb(120,120,120)';
      bCtx.fillRect(0, 0, W, H);

      const step = 4;
      for (let y = 0; y < H; y += step) {
        for (let x = 0; x < W; x += step) {
          const warp = ((x / step + y / step) % 2) === 0;
          const slub = Math.sin(x * 0.13) * Math.cos(y * 0.17) * 8;
          const v = Math.round(236 + slub + (r() - 0.5) * 14);
          cCtx.fillStyle = `rgb(${v},${v},${v - 2})`;
          cCtx.fillRect(x, y, step, step);

          const bv = Math.round((warp ? 174 : 92) + slub * 1.5 + (r() - 0.5) * 24);
          bCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
          bCtx.fillRect(x, y, step - (warp ? 0 : 1), step - (warp ? 1 : 0));
        }
      }
      bundle = {
        map: wrapTex(cc, THREE.SRGBColorSpace),
        normalMap: heightToNormalTex(bc, 2.2),
        normalScale: 0.48,
      };
    }
  } else if (key === 'rug') {
    const W = 256;
    const H = 256;
    const [cc, cCtx] = makeCanvas(W, H);
    const [bc, bCtx] = makeCanvas(W, H);
    if (cCtx && bCtx) {
      cCtx.fillStyle = 'rgb(236,233,227)';
      cCtx.fillRect(0, 0, W, H);
      bCtx.fillStyle = 'rgb(100,100,100)';
      bCtx.fillRect(0, 0, W, H);

      const rowH = 6;
      const knotW = 5;
      for (let y = 0; y < H; y += rowH) {
        const rowTone = (y / rowH) % 2 === 0 ? 6 : -6;
        for (let x = 0; x < W; x += knotW) {
          const fleck = r() < 0.14 ? -22 : 0;
          const v = Math.max(175, Math.min(252, Math.round(234 + rowTone + fleck + (r() - 0.5) * 14)));
          cCtx.fillStyle = `rgb(${v},${v - 2},${v - 5})`;
          cCtx.fillRect(x, y, knotW - 0.6, rowH - 0.8);

          const bh = Math.round(168 + rowTone * 2 + (r() - 0.5) * 32);
          bCtx.fillStyle = `rgb(${bh},${bh},${bh})`;
          bCtx.beginPath();
          bCtx.ellipse(x + knotW / 2, y + rowH / 2, knotW * 0.46, rowH * 0.42, 0, 0, Math.PI * 2);
          bCtx.fill();
        }
      }
      bundle = {
        map: wrapTex(cc, THREE.SRGBColorSpace),
        normalMap: heightToNormalTex(bc, 2.8),
        normalScale: 0.72,
      };
    }
  } else if (key === 'cane') {
    const W = 256;
    const H = 256;
    const [cc, cCtx] = makeCanvas(W, H);
    const [bc, bCtx] = makeCanvas(W, H);
    if (cCtx && bCtx) {
      cCtx.fillStyle = 'rgb(64,46,32)';
      cCtx.fillRect(0, 0, W, H);
      bCtx.fillStyle = 'rgb(22,22,22)';
      bCtx.fillRect(0, 0, W, H);

      const step = 32;
      const drawStrand = (x0: number, y0: number, x1: number, y1: number, w: number, bright: number) => {
        cCtx.strokeStyle = `rgb(${Math.round(238 * bright)},${Math.round(218 * bright)},${Math.round(182 * bright)})`;
        cCtx.lineWidth = w;
        cCtx.beginPath();
        cCtx.moveTo(x0, y0);
        cCtx.lineTo(x1, y1);
        cCtx.stroke();

        bCtx.strokeStyle = `rgb(${Math.round(220 * bright)},${Math.round(220 * bright)},${Math.round(220 * bright)})`;
        bCtx.lineWidth = w;
        bCtx.beginPath();
        bCtx.moveTo(x0, y0);
        bCtx.lineTo(x1, y1);
        bCtx.stroke();
      };

      for (let i = -W; i < W * 2; i += step) {
        drawStrand(i, 0, i + H, H, 5.2, 0.92);
        drawStrand(i, H, i + H, 0, 5.2, 0.95);
      }
      for (let y = step / 2; y < H; y += step) {
        drawStrand(0, y, W, y, 6.0, 1.0);
      }
      for (let x = step / 2; x < W; x += step) {
        drawStrand(x, 0, x, H, 6.0, 0.97);
      }
      addNoise(cCtx, W, H, r, 6);
      bundle = {
        map: wrapTex(cc, THREE.SRGBColorSpace),
        normalMap: heightToNormalTex(bc, 3.0),
        normalScale: 0.78,
      };
    }
  } else if (key === 'pellicle') {
    const W = 128;
    const H = 128;
    const [ac, aCtx] = makeCanvas(W, H);
    const [bc, bCtx] = makeCanvas(W, H);
    if (aCtx && bCtx) {
      aCtx.fillStyle = 'rgb(140,140,140)';
      aCtx.fillRect(0, 0, W, H);
      bCtx.fillStyle = 'rgb(60,60,60)';
      bCtx.fillRect(0, 0, W, H);

      const step = 8;
      for (let y = 0; y < H; y += step) {
        aCtx.fillStyle = 'rgb(245,245,245)';
        aCtx.fillRect(0, y, W, 3.2);
        bCtx.fillStyle = 'rgb(210,210,210)';
        bCtx.fillRect(0, y, W, 3.2);
      }
      for (let x = 0; x < W; x += step) {
        aCtx.fillStyle = 'rgb(235,235,235)';
        aCtx.fillRect(x, 0, 2.8, H);
        bCtx.fillStyle = 'rgb(195,195,195)';
        bCtx.fillRect(x, 0, 2.8, H);
      }
      bundle = {
        alphaMap: wrapTex(ac, THREE.NoColorSpace),
        normalMap: heightToNormalTex(bc, 2.4),
        normalScale: 0.55,
      };
    }
  } else if (key === 'leaf') {
    const W = 256;
    const H = 256;
    const [cc, cCtx] = makeCanvas(W, H);
    const [bc, bCtx] = makeCanvas(W, H);
    if (cCtx && bCtx) {
      cCtx.fillStyle = 'rgb(228,236,222)';
      cCtx.fillRect(0, 0, W, H);
      bCtx.fillStyle = 'rgb(128,128,128)';
      bCtx.fillRect(0, 0, W, H);

      for (let y = 0; y < H; y += 22) {
        for (const [ctx, style, width] of [
          [cCtx, 'rgba(248,255,240,0.28)', 1.6],
          [bCtx, 'rgb(185,185,185)', 2.2],
        ] as const) {
          ctx.strokeStyle = style;
          ctx.lineWidth = width;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.quadraticCurveTo(W * 0.5, y - 10, W, y);
          ctx.stroke();
        }
      }
      addNoise(cCtx, W, H, r, 6);
      bundle = {
        map: wrapTex(cc, THREE.SRGBColorSpace),
        normalMap: heightToNormalTex(bc, 1.8),
        normalScale: 0.35,
      };
    }
  } else if (key === 'tvArt') {
    const W = 1024;
    const H = 576;
    const [cc, cCtx] = makeCanvas(W, H);
    if (cCtx) {
      cCtx.fillStyle = '#ede8de';
      cCtx.fillRect(0, 0, W, H);
      const mx = 68;
      const my = 52;
      const aw = W - 2 * mx;
      const ah = H - 2 * my;
      cCtx.fillStyle = '#cfc8ba';
      cCtx.fillRect(mx - 3, my - 3, aw + 6, ah + 6);

      cCtx.save();
      cCtx.beginPath();
      cCtx.rect(mx, my, aw, ah);
      cCtx.clip();

      const sky = cCtx.createLinearGradient(0, my, 0, my + ah);
      sky.addColorStop(0, '#e3d9c8');
      sky.addColorStop(0.58, '#d8c5ae');
      sky.addColorStop(1, '#c6b199');
      cCtx.fillStyle = sky;
      cCtx.fillRect(mx, my, aw, ah);

      cCtx.fillStyle = '#f2e5cf';
      cCtx.beginPath();
      cCtx.arc(mx + aw * 0.68, my + ah * 0.36, ah * 0.17, 0, Math.PI * 2);
      cCtx.fill();

      cCtx.fillStyle = '#7e8c7d';
      cCtx.beginPath();
      cCtx.moveTo(mx, my + ah * 0.66);
      cCtx.bezierCurveTo(mx + aw * 0.32, my + ah * 0.5, mx + aw * 0.62, my + ah * 0.72, mx + aw, my + ah * 0.58);
      cCtx.lineTo(mx + aw, my + ah);
      cCtx.lineTo(mx, my + ah);
      cCtx.closePath();
      cCtx.fill();

      cCtx.fillStyle = '#b46d49';
      cCtx.beginPath();
      cCtx.moveTo(mx, my + ah * 0.78);
      cCtx.bezierCurveTo(mx + aw * 0.28, my + ah * 0.68, mx + aw * 0.58, my + ah * 0.84, mx + aw, my + ah * 0.72);
      cCtx.lineTo(mx + aw, my + ah);
      cCtx.lineTo(mx, my + ah);
      cCtx.closePath();
      cCtx.fill();

      cCtx.fillStyle = '#36413c';
      cCtx.fillRect(mx + aw * 0.14, my + ah * 0.44, aw * 0.12, ah * 0.38);
      cCtx.restore();

      addNoise(cCtx, W, H, r, 5);
      const tex = wrapTex(cc, THREE.SRGBColorSpace, true);
      bundle = { map: tex, emissiveMap: tex };
    }
  } else if (key === 'ideScreen') {
    const W = 512;
    const H = 288;
    const [cc, cCtx] = makeCanvas(W, H);
    if (cCtx) {
      cCtx.fillStyle = '#13171d';
      cCtx.fillRect(0, 0, W, H);
      cCtx.fillStyle = '#1b2129';
      cCtx.fillRect(0, 0, W, 18);
      for (const [dx, col] of [
        [12, '#e06c75'],
        [24, '#e5c07b'],
        [36, '#98c379'],
      ] as const) {
        cCtx.fillStyle = col;
        cCtx.beginPath();
        cCtx.arc(dx, 9, 3.2, 0, Math.PI * 2);
        cCtx.fill();
      }
      cCtx.fillStyle = '#171c23';
      cCtx.fillRect(0, 18, 92, H - 18);
      for (let y = 30; y < H - 20; y += 13) {
        if (y === 69) {
          cCtx.fillStyle = '#263342';
          cCtx.fillRect(4, y - 4, 84, 10);
        }
        cCtx.fillStyle = y === 69 ? '#7fd1e6' : '#5e6b78';
        cCtx.fillRect(12 + (y % 3) * 6, y, 36 + ((y * 7) % 30), 3.5);
      }
      const colors = ['#61afef', '#c678dd', '#98c379', '#e5c07b', '#abb2bf', '#56b6c2'];
      for (let row = 0; row < 17; row++) {
        const y = 30 + row * 13;
        const indent = [0, 14, 28, 28, 14, 0, 14, 28][row % 8];
        let x = 108 + indent;
        const segs = 2 + (row % 3);
        for (let s = 0; s < segs; s++) {
          const w = 18 + ((row * 17 + s * 29) % 48);
          if (x + w > 316) break;
          cCtx.fillStyle = colors[(row + s) % colors.length];
          cCtx.fillRect(x, y, w, 4);
          x += w + 7;
        }
      }
      cCtx.fillStyle = '#1d242d';
      cCtx.fillRect(328, 28, 172, H - 42);
      cCtx.fillStyle = '#d7cfc2';
      cCtx.beginPath();
      cCtx.moveTo(414, 72);
      cCtx.lineTo(476, 104);
      cCtx.lineTo(414, 142);
      cCtx.lineTo(352, 108);
      cCtx.closePath();
      cCtx.fill();
      cCtx.strokeStyle = '#4fb4c9';
      cCtx.lineWidth = 2;
      cCtx.stroke();

      const tex = wrapTex(cc, THREE.SRGBColorSpace, true);
      bundle = { map: tex, emissiveMap: tex };
    }
  } else if (key === 'plaster') {
    const W = 256;
    const H = 256;
    const [bc, bCtx] = makeCanvas(W, H);
    if (bCtx) {
      bCtx.fillStyle = 'rgb(128,128,128)';
      bCtx.fillRect(0, 0, W, H);
      addNoise(bCtx, W, H, r, 14);
      bundle = {
        normalMap: heightToNormalTex(bc, 0.8),
        normalScale: 0.14,
      };
    }
  }

  CACHE.set(key, bundle);
  return bundle;
}
