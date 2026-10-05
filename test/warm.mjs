import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('console', (m) => console.log('C', m.type(), m.text().slice(0, 200)));
await page.goto('http://127.0.0.1:8123/index.html');
await page.waitForFunction(() => window.__app, null, { timeout: 30000 });
console.log(await page.evaluate(() => { const a = window.__app; const m0 = a.renderer.info.memory.textures; const t = performance.now(); a.warmup(); return [m0, a.renderer.info.memory.textures, Math.round(performance.now() - t)]; }));
await browser.close();
