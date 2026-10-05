import { chromium } from 'playwright';
const OUT = '/tmp/claude-0/-home-claude/bc7fd394-8c22-5c33-960d-95a1a7172d61/scratchpad/shots';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('ERR', String(e)));
await page.goto('http://127.0.0.1:8123/index.html');
await page.waitForFunction(() => window.__app, null, { timeout: 30000 });
for (const [i, T] of [[0, 0.03], [1, 0.12], [2, 0.3]]) {
  await page.evaluate(({ T, first }) => {
    const app = window.__app;
    app.renderer.setAnimationLoop(null);
    app.hideAll();
    const THREE = app.camera.constructor; // nepotřebné
    if (first) {
      const p = app.head.clone().set(0.1, 1.4, -0.55);
      const c = { r: 1, g: 0.54, b: 0.14 };
      app.fx.burst(p, c, { x: 0, y: 0.1, z: -1 }, 0.7, true, true);
      app.fx.text('perfect', p.clone().set(0.1, 1.64, -0.55));
      window.__bt = 0;
    }
    while (window.__bt < T) { app.fx.update(1 / 72, app.camera.position); window.__bt += 1 / 72; }
    app.camera.position.set(0, 1.62, 0);
    app.camera.rotation.set(-0.15, 0, 0, 'YXZ');
    app.camera.fov = 95; app.camera.updateProjectionMatrix();
    app.renderer.render(app.scene, app.camera);
  }, { T, first: i === 0 });
  await page.screenshot({ path: `${OUT}/burst_${T}.png` });
}
await browser.close();
