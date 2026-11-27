#!/usr/bin/env node
/**
 * Visual QA harness (see docs/VISUAL_BRIEF.md).
 *
 * Renders every composed showcase shot headless, saves canvas screenshots to qa/out/,
 * computes image-quality metrics, and diffs against qa/baseline/.
 *
 *   pnpm run dev                       # in another terminal
 *   pnpm run qa                        # capture + report
 *   pnpm run qa -- --update            # accept current renders as the new baseline
 *   pnpm run qa -- --url=http://host/  # target another server (e.g. the Pages build)
 */
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile, copyFile, access } from 'node:fs/promises';
import path from 'node:path';

// Keep in sync with showcaseShots() in src/scene/shots.ts.
const SHOTS = ['overview', 'living', 'bedroom', 'kitchen', 'bath', 'window-eye'];

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...rest] = a.replace(/^--/, '').split('=');
    return [k, rest.length ? rest.join('=') : true];
  }),
);
const baseUrl = String(args.url ?? 'http://127.0.0.1:8765/');
const preset = args.preset ? `&preset=${args.preset}` : '';
const outDir = path.resolve('qa/out');
const baseDir = path.resolve('qa/baseline');
const settleMs = Number(args.settle ?? 4500);

/** Floors from the brief; a failing metric is a regression worth a DELTA.md entry. */
const FLOORS = {
  maxCrushedBlackPct: 4.0, // pixels with luma < 0.03 (monitors/mullions are legitimately black)
  maxClippedWhitePct: 4.0, // pixels with all channels > 0.98
  minShadowChroma: 0.035, // mean (max-min) over shadow pixels: gray shadows read as dead light
  maxBaselineDiffPct: 2.0,
};

const exists = (p) => access(p).then(() => true, () => false);

async function analyze(page, pngBuf, baselineBuf) {
  return page.evaluate(
    async ({ cur, base }) => {
      const load = async (b64) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = new OffscreenCanvas(img.width, img.height);
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, img.width, img.height);
      };
      const a = await load(cur);
      const d = a.data;
      const n = d.length / 4;
      let crushed = 0;
      let clipped = 0;
      let lumaSum = 0;
      let shadowN = 0;
      let shadowChroma = 0;
      let shadowR = 0;
      let shadowB = 0;
      const hist = new Array(10).fill(0);
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i] / 255;
        const g = d[i + 1] / 255;
        const b = d[i + 2] / 255;
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        lumaSum += l;
        hist[Math.min(9, Math.floor(l * 10))]++;
        if (l < 0.03) crushed++;
        if (r > 0.98 && g > 0.98 && b > 0.98) clipped++;
        if (l > 0.06 && l < 0.32) {
          shadowN++;
          shadowChroma += Math.max(r, g, b) - Math.min(r, g, b);
          shadowR += r;
          shadowB += b;
        }
      }
      let diffPct = null;
      if (base) {
        const bd = (await load(base)).data;
        if (bd.length === d.length) {
          let diff = 0;
          for (let i = 0; i < d.length; i += 4) {
            const dd =
              Math.abs(d[i] - bd[i]) + Math.abs(d[i + 1] - bd[i + 1]) + Math.abs(d[i + 2] - bd[i + 2]);
            if (dd > 30) diff++;
          }
          diffPct = (diff / n) * 100;
        }
      }
      return {
        meanLuma: lumaSum / n,
        crushedBlackPct: (crushed / n) * 100,
        clippedWhitePct: (clipped / n) * 100,
        shadowPct: (shadowN / n) * 100,
        shadowChroma: shadowN ? shadowChroma / shadowN : 0,
        shadowWarmCool: shadowN ? (shadowR - shadowB) / shadowN : 0,
        lumaHistogram: hist.map((h) => +((h / n) * 100).toFixed(1)),
        diffPct,
      };
    },
    { cur: pngBuf.toString('base64'), base: baselineBuf?.toString('base64') ?? null },
  );
}

function check(m) {
  const fails = [];
  if (m.crushedBlackPct > FLOORS.maxCrushedBlackPct) fails.push('crushed blacks');
  if (m.clippedWhitePct > FLOORS.maxClippedWhitePct) fails.push('clipped whites');
  if (m.shadowPct > 2 && m.shadowChroma < FLOORS.minShadowChroma) fails.push('gray shadows');
  if (m.diffPct !== null && m.diffPct > FLOORS.maxBaselineDiffPct) fails.push('changed vs baseline');
  return fails;
}

async function main() {
  await mkdir(outDir, { recursive: true });
  await mkdir(baseDir, { recursive: true });
  const browser = await chromium.launch({
    channel: process.env.PW_CHANNEL ?? 'chrome',
    args: ['--enable-gpu', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  const rows = [];
  for (let i = 0; i < SHOTS.length; i++) {
    const name = `${i + 1}-${SHOTS[i]}`;
    const sep = baseUrl.includes('?') ? '&' : '?';
    await page.goto(`${baseUrl}${sep}shot=${i + 1}${preset}`);
    await page.locator('canvas').first().waitFor();
    await page.waitForTimeout(settleMs);
    const png = await page.locator('canvas').first().screenshot();
    const outPath = path.join(outDir, `${name}.png`);
    await writeFile(outPath, png);
    const basePath = path.join(baseDir, `${name}.png`);
    const baseline = (await exists(basePath)) ? await readFile(basePath) : null;
    const m = await analyze(page, png, args.update ? null : baseline);
    if (args.update) await copyFile(outPath, basePath);
    rows.push({ name, ...m, fails: check(m) });
  }
  const shots = await Promise.all(rows.map((r) => readFile(path.join(outDir, `${r.name}.png`))));
  const sheet = await page.evaluate(async (b64s) => {
    const imgs = await Promise.all(
      b64s.map(async (b) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b}`;
        await img.decode();
        return img;
      }),
    );
    const s = 0.45;
    const tw = Math.round(imgs[0].width * s);
    const th = Math.round(imgs[0].height * s);
    const c = document.createElement('canvas');
    c.width = tw * 3;
    c.height = th * Math.ceil(imgs.length / 3);
    const ctx = c.getContext('2d');
    imgs.forEach((img, k) => ctx.drawImage(img, (k % 3) * tw, Math.floor(k / 3) * th, tw, th));
    return c.toDataURL('image/jpeg', 0.88).split(',')[1];
  }, shots.map((b) => b.toString('base64')));
  await writeFile(path.join(outDir, 'contact-sheet.jpg'), Buffer.from(sheet, 'base64'));
  await browser.close();

  const fmt = (v) => (v === null ? '—' : v.toFixed(3));
  const md = [
    '# Visual QA report',
    '',
    `URL: ${baseUrl}  ·  ${new Date().toISOString()}`,
    '',
    '| Shot | Mean luma | Crushed % | Clipped % | Shadow % | Shadow chroma | Warm−cool | Δ baseline % | Flags |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${r.name} | ${fmt(r.meanLuma)} | ${fmt(r.crushedBlackPct)} | ${fmt(r.clippedWhitePct)} | ${fmt(r.shadowPct)} | ${fmt(r.shadowChroma)} | ${fmt(r.shadowWarmCool)} | ${fmt(r.diffPct)} | ${r.fails.join(', ') || 'ok'} |`,
    ),
    '',
    errors.length ? `## Page errors\n\n${errors.map((e) => `- ${e}`).join('\n')}` : 'No page errors.',
    '',
  ].join('\n');
  await writeFile(path.join(outDir, 'report.md'), md);
  await writeFile(path.join(outDir, 'report.json'), JSON.stringify({ rows, errors }, null, 2));
  console.log(md);
  if (errors.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
