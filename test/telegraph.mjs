// Náznak příletu: záře v místě objevení + dráhy po hladině ve směru příletu
import { chromium } from 'playwright';
const OUT = '/tmp/claude-0/-home-claude-pulz/bc7fd394-8c22-5c33-960d-95a1a7172d61/scratchpad/shots';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://127.0.0.1:8123/index.html');
await page.waitForFunction(() => window.__app, null, { timeout: 30000 });
await page.waitForTimeout(1000);
const out = await page.evaluate(() => {
  const a = window.__app; a.renderer.setAnimationLoop(null); a.hideAll();
  a.screen = 'play';
  const y = 25 * Math.PI / 180;
  const ev = [
    { kind: 't', type: 'jab', hand: 'L', t: 3.0, yaw: 0, sx: 0, sy: 0 },
    { kind: 't', type: 'jab', hand: 'R', t: 4.6, yaw: y, sx: 0, sy: 0 },
    { kind: 't', type: 'jab', hand: 'L', t: 4.8, yaw: y, sx: 0, sy: 0 },
    { kind: 'b', type: 'arc', ang: 0, t: 5.0 },
    { kind: 't', type: 'hook', hand: 'R', t: 5.2, yaw: -y, sx: 0, sy: 0 },
  ].map((e, i) => ({ ...e, i }));
  a.calibData = { headH: 1.62, cx: 0, cz: 0, reach: 0.6, hitDist: 0.5 };
  a.game.start({ events: ev, duration: 10 }, { name: 'x', bpm: 120 }, 'mid', a.calibData);
  const fl = a.game.flight;
  a.hands.begin(); a.hands.end(1, 0.016, a.head);
  const res = {};
  let t = 0;
  const step = (to) => { for (; t <= to; t += 0.02) { a.game.update(t, 0.02, a.hands, { x: 0, y: 1.62, z: 0 }); a.telegraph.update(a.game, t, 0.02, 'full'); } };
  // těsně před objevením terčů z +25°: portál musí sedět s místem objevení
  step(4.6 - fl - 0.3);
  res.before = { ...a.telegraph.debug };
  const sp = a.game.spawnPoint(a.game.events[1], new (a.camera.position.constructor)());
  step(4.6 - fl - 0.12);
  a.targets.update(0.016, 0.3, 1); a.fx.update(0.016, a.camera.position);
  a.camera.position.set(0, 1.62, 0.15); a.camera.rotation.set(-0.12, 0, 0, 'YXZ'); a.camera.fov = 100; a.camera.updateProjectionMatrix();
  a.renderer.render(a.scene, a.camera);
  step(4.6 - fl + 0.01);
  const it = a.game.items.find((x) => x.e.i === 1);
  res.spawnErr = it ? +it.pos.distanceTo(sp).toFixed(3) : 'nospawn';
  step(9);
  res.after = { ...a.telegraph.debug };
  return res;
});
await page.screenshot({ path: OUT + '/telegraph.png' });
console.log(JSON.stringify(out));
console.log('errors', errors);
await browser.close();
