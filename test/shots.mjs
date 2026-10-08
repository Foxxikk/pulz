// Snímky: menu (PC), hra v různých okamžicích (kamera bota), pohled z očí (jako ve VR)
import { chromium } from 'playwright';
const OUT = process.argv[2] || '/tmp/claude-0/-home-claude-pulz/bc7fd394-8c22-5c33-960d-95a1a7172d61/scratchpad/shots';
const times = JSON.parse(process.argv[3] || '[20.0, 20.12, 31.5, 47.0, 52.3]');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
await page.goto('http://127.0.0.1:8123/index.html');
await page.waitForFunction(() => window.__app, null, { timeout: 30000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: OUT + '/menu.png' });
await page.evaluate(async () => {
  const app = window.__app;
  app.renderer.setAnimationLoop(null);
  const { buildChart } = await import('/src/chart.js');
  const { TRACKS } = await import('/src/config.js');
  const track = TRACKS.find((t) => t.id === 'mesto');
  app.settings.diff = 'mid';
  app.calibData = { headH: 1.62, cx: 0, cz: 0, reach: 0.6, hitDist: 0.5 };
  const chart = buildChart(track, 'mid', 60 / track.bpm);
  app.hideAll();
  app.game.start(chart, track, 'mid', app.calibData);
  app.screen = 'play'; app.demo = true; app.spb = 60 / track.bpm;
  app.setupHud();
  window.__simT = 0;
});
for (const T of times) {
  for (const view of ['demo', 'eyes']) {
    if (view === 'eyes' && T !== times[1] && T !== times[3]) continue;
    await page.evaluate(({ T, view }) => {
      const app = window.__app;
      const dt = 1 / 72;
      while (window.__simT < T) {
        const t = window.__simT;
        app.hands.begin();
        app.bot.update(t, dt);
        app.hands.end(t, dt, app.bot.head);
        app.game.update(t, dt, app.hands, app.bot.head);
        app.fx.update(dt, app.bot.head);
        app.env.update(dt);
        window.__simT += dt;
      }
      const g = app.game;
      app.panels.info.refresh('x' + Math.random());
      app.panels.combo.refresh('c' + g.combo + Math.random());
      app.head.copy(app.bot.head);
      if (view === 'demo') {
        app.camera.position.copy(app.bot.head).add({ x: 0, y: 0.1, z: 0.45 });
        app.camera.rotation.set(-0.2, 0, 0, 'YXZ');
        app.camera.fov = 72;
      } else {
        app.camera.position.copy(app.bot.head);
        app.camera.rotation.set(-0.18, 0, 0, 'YXZ');
        app.camera.fov = 95; // přibližně zorné pole Questu
      }
      app.camera.updateProjectionMatrix();
      app.renderer.render(app.scene, app.camera);
    }, { T, view });
    await page.screenshot({ path: `${OUT}/play_${T}_${view}.png` });
  }
}
console.log('combo', await page.evaluate(() => window.__app.game.combo), 'errors', errors);
await browser.close();
