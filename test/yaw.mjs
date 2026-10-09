// Přílety ze stran: terče zepředu, z −25° a +25° v půlce letu
import { chromium } from 'playwright';
const OUT = '/tmp/claude-0/-home-claude-pulz/bc7fd394-8c22-5c33-960d-95a1a7172d61/scratchpad/shots';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('ERR', String(e)));
await page.goto('http://127.0.0.1:8123/index.html');
await page.waitForFunction(() => window.__app, null, { timeout: 30000 });
await page.waitForTimeout(1000);
await page.evaluate(() => {
  const a = window.__app; a.renderer.setAnimationLoop(null); a.hideAll();
  const y = 25 * Math.PI / 180;
  const ev = [
    { kind: 't', type: 'jab', hand: 'L', t: 3.0, beat: 6, yaw: y, sx: 0, sy: 0 },
    { kind: 't', type: 'jab', hand: 'R', t: 3.2, beat: 6.5, yaw: y, sx: 0, sy: 0 },
    { kind: 't', type: 'jab', hand: 'L', t: 3.4, beat: 7, yaw: 0, sx: 0, sy: 0 },
    { kind: 't', type: 'hook', hand: 'R', t: 3.6, beat: 7.5, yaw: -y, sx: 0, sy: 0 },
    { kind: 't', type: 'jab', hand: 'R', t: 3.8, beat: 8, yaw: -y, sx: 0, sy: 0 },
  ].map((e, i) => ({ ...e, i }));
  a.calibData = { headH: 1.62, cx: 0, cz: 0, reach: 0.6, hitDist: 0.5 };
  a.game.start({ events: ev, duration: 10 }, { name: 'x', bpm: 120 }, 'mid', a.calibData);
  a.hands.begin(); a.hands.end(2.75, 0.016, a.head);
  for (let t = 1.0; t <= 2.75; t += 0.05) a.game.update(t, 0.05, a.hands, { x: 0, y: 1.62, z: 0 });
  a.targets.update(0.016, 0.3, 1); a.fx.update(1.5, a.camera.position);
  a.camera.position.set(0, 1.62, 0.15); a.camera.rotation.set(-0.1, 0, 0, 'YXZ'); a.camera.fov = 100; a.camera.updateProjectionMatrix();
  a.renderer.render(a.scene, a.camera);
});
await page.screenshot({ path: OUT + '/yaw.png' });
await browser.close();
