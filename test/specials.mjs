// Snímek nových terčů: dvojitý (spojení), bomba, zakřivený let, malá série, boss (po 3 úderech)
import { chromium } from 'playwright';
const OUT = '/tmp/claude-0/-home-claude-pulz/bc7fd394-8c22-5c33-960d-95a1a7172d61/scratchpad/shots';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('ERR', String(e)));
await page.goto('http://127.0.0.1:8123/index.html');
await page.waitForFunction(() => window.__app, null, { timeout: 30000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const a = window.__app; a.renderer.setAnimationLoop(null); a.hideAll();
  const ev = [
    { kind: 't', type: 'jab', hand: 'L', t: 3.0, beat: 6, pair: 0, sx: 0, sy: 0 },
    { kind: 't', type: 'jab', hand: 'R', t: 3.0, beat: 6, pair: 0, sx: 0, sy: 0 },
    { kind: 't', type: 'bomb', hand: 'L', t: 3.6, beat: 7, sx: 0, sy: 0 },
    { kind: 't', type: 'jab', hand: 'R', t: 4.1, beat: 8, curve: 1, sx: 0, sy: 0 },
    { kind: 't', type: 'jab', hand: 'L', t: 4.35, beat: 8.5, small: true, sx: 0, sy: 0.1 },
    { kind: 't', type: 'jab', hand: 'R', t: 4.55, beat: 9, small: true, sx: 0, sy: 0.1 },
  ].map((e, i) => ({ ...e, i }));
  a.calibData = { headH: 1.62, cx: 0, cz: 0, reach: 0.6, hitDist: 0.5 };
  a.game.start({ events: ev, duration: 10 }, { name: 'x', bpm: 120 }, 'mid', a.calibData);
  a.hands.begin(); a.hands.end(2.6, 0.016, a.head);
  for (let t = 1.0; t <= 2.65; t += 0.05) a.game.update(t, 0.05, a.hands, { x: 0, y: 1.62, z: 0 });
  a.targets.update(0.016, 0.3, 1);
  a.camera.position.set(0, 1.62, 0.1); a.camera.rotation.set(-0.12, 0, 0, 'YXZ'); a.camera.fov = 80; a.camera.updateProjectionMatrix();
  a.renderer.render(a.scene, a.camera);
});
await page.screenshot({ path: OUT + '/specials.png' });
await page.evaluate(() => {
  const a = window.__app;
  const ev = [{ kind: 't', type: 'boss', hand: 'B', t: 2.0, beat: 4, hold: 2.2, sx: 0, sy: 0, i: 0 }];
  a.game.start({ events: ev, duration: 10 }, { name: 'x', bpm: 120 }, 'mid', a.calibData);
  a.hands.begin(); a.hands.end(2.2, 0.016, a.head);
  for (let t = 0.2; t <= 2.2; t += 0.05) a.game.update(t, 0.05, a.hands, { x: 0, y: 1.62, z: 0 });
  const it = a.game.items[0];
  const THREE = a.camera.constructor.prototype; // jen kvůli Vector3 níže
  for (let k = 0; k < 3; k++) a.targets.chip(it.vis, it.pos.clone().set(0, 0, -1), 0.6);
  for (let k = 0; k < 6; k++) a.targets.update(1 / 60, 0.3, 2);
  a.camera.position.set(0, 1.62, 0.3);
  a.renderer.render(a.scene, a.camera);
});
await page.screenshot({ path: OUT + '/boss.png' });
await browser.close();
