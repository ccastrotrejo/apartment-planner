import { chromium } from '@playwright/test';
const shots = {
  sofa: '95,60,150,30,15,115',
  bed: '150,62,100,205,18,62',
  shelf: '110,48,120,145,15,90',
  entry: '20,70,330,70,20,360',
};
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
for (const [k, cam] of Object.entries(shots)) {
  await p.goto(`http://127.0.0.1:8765/?cam=${cam}`); await p.waitForTimeout(4000);
  await p.locator('canvas').first().screenshot({ path: `/tmp/qa/close_${k}.png` });
}
await b.close();
