// Saves the store screenshots as PNG: store/images/<lang>/screenshot-1…5.png (1280 × 800).
//   node store/render.mjs            English
//   node store/render.mjs cs 3       Czech, screenshot 3 only
//   node store/render.mjs all        every store language (as in _locales: pt_BR, zh_TW, fil…)
// Needs Google Chrome and puppeteer-core; the copy installed for Subtitle Overlay's promo video is used.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('/Users/filip/subtitle-overlay/promo-video/');
const puppeteer = require('puppeteer-core');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [which = 'en', only] = process.argv.slice(2);
const langs = which === 'all' ? readdirSync(join(root, '_locales')).filter((d) => !d.startsWith('.')) : which.split(',');
const port = 8791;

// The pages load the extension's own files, so they're served from the project folder.
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  for (const lang of langs) {
    for (const n of [1, 2, 3, 4, 5].filter((n) => !only || String(n) === only)) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
      page.on('pageerror', (e) => console.error(lang, n, e.message));
      await page.goto(`http://127.0.0.1:${port}/store/src/shots.html?shot=${n}&lang=${lang}`);
      await page.waitForFunction('window.shotReady === true', { timeout: 90000 });
      // Screenshot 3: a real drag with the mouse, held down, so the page script draws its box.
      const plan = await page.evaluate(() => window.dragPlan || null);
      if (plan) {
        await page.mouse.move(...plan.from);
        await page.mouse.down();
        for (let i = 1; i <= 12; i++) await page.mouse.move(plan.from[0] + (plan.to[0] - plan.from[0]) * i / 12, plan.from[1] + (plan.to[1] - plan.from[1]) * i / 12);
        await new Promise((r) => setTimeout(r, 200));
      }
      const out = join(root, 'store', 'images', lang, `screenshot-${n}.png`);
      mkdirSync(dirname(out), { recursive: true });
      await page.screenshot({ path: out });
      console.log('saved', out);
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.kill();
}
