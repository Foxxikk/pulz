// Skutečný běh: klik na Ukázka, hudba se připraví, hraje bot – kontrola času, zásahů, chyb
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
await page.goto('http://127.0.0.1:8123/index.html');
await page.waitForFunction(() => window.__app, null, { timeout: 30000 });
const t0 = Date.now();
await page.click('#btn-demo');
await page.waitForFunction(() => window.__app.screen === 'play', null, { timeout: 120000 });
console.log('prep+calib s', (Date.now() - t0) / 1000, 'ctx', await page.evaluate(() => window.__app.audio.ctx.state + ' sr ' + window.__app.audio.ctx.sampleRate));
for (let i = 0; i < 4; i++) {
  await page.waitForTimeout(5000);
  console.log(await page.evaluate(() => { const a = window.__app, g = a.game; return JSON.stringify({ t: +g.t.toFixed(2), ctxT: +a.audio.ctx.currentTime.toFixed(2), fps: a.fps, hits: g.hits, misses: g.misses, combo: g.combo, items: g.items.length, big: a.bigText }); }));
}
// pauza a pokračování
await page.keyboard.press('Space');
await page.waitForTimeout(800);
const tp = await page.evaluate(() => [window.__app.screen, window.__app.game.t]);
await page.waitForTimeout(1500);
const tp2 = await page.evaluate(() => window.__app.game.t);
await page.keyboard.press('Space');
await page.waitForTimeout(3000);
console.log('pause', tp, 'frozen', tp2 === tp[1], 'after', await page.evaluate(() => [window.__app.screen, +window.__app.game.t.toFixed(2)]));
await page.screenshot({ path: '/tmp/claude-0/-home-claude-pulz/bc7fd394-8c22-5c33-960d-95a1a7172d61/scratchpad/shots/live.png' });
// ukončit přes menu pauzy
await page.evaluate(() => { const a = window.__app; a.pause(); a.press(a.panels.pause, 'quit'); });
await page.waitForTimeout(500);
console.log('end', await page.evaluate(() => [window.__app.screen, JSON.stringify(window.__app.lastResult).slice(0, 200)]));
await page.screenshot({ path: '/tmp/claude-0/-home-claude-pulz/bc7fd394-8c22-5c33-960d-95a1a7172d61/scratchpad/shots/results.png' });
console.log('errors', errors);
await browser.close();
