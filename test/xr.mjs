// Falešné WebXR: hlava + 25 kloubů na ruku. Testuje šťouchnutí do menu, kalibraci, start, pauzu na zápěstí, pokračování.
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
await page.goto('http://127.0.0.1:8123/index.html');
await page.waitForFunction(() => window.__app, null, { timeout: 30000 });
await page.evaluate(async () => {
  const app = window.__app;
  app.renderer.setAnimationLoop(null);
  const { JOINTS, fistJoints } = await import('/src/hands.js');
  const THREE = await import('three');
  window.__T = THREE;
  const mkHand = () => { const m = new Map(); JOINTS.forEach((n, i) => m.set(n, { i })); return m; };
  const F = (window.__fake = { head: new THREE.Vector3(0, 1.65, 0), joints: { L: new Float32Array(75), R: new Float32Array(75) }, tracked: { L: true, R: true } });
  const srcs = [{ handedness: 'left', hand: mkHand(), side: 'L' }, { handedness: 'right', hand: mkHand(), side: 'R' }];
  app.session = { get inputSources() { return srcs.filter((s) => F.tracked[s.side]); } };
  window.__frame = {
    getViewerPose: () => ({ transform: { position: F.head, orientation: { x: 0, y: 0, z: 0, w: 1 } } }),
    getJointPose: (j) => {
      const src = srcs.find((s) => s.hand === j.__owner) || null;
      return null;
    },
  };
  // klouby: vlastník přes uzávěru
  for (const s of srcs) for (const [n, j] of s.hand) j.__side = s.side;
  window.__frame.getJointPose = (j) => { const a = F.joints[j.__side]; return { transform: { position: { x: a[j.i * 3], y: a[j.i * 3 + 1], z: a[j.i * 3 + 2] } } }; };
  // výchozí poloha rukou: garda
  window.__setFist = (side, x, y, z, fwd = [0, 0, -1]) => fistJoints(side, new THREE.Vector3(x, y, z), new THREE.Vector3(...fwd), new THREE.Vector3(0, 1, 0), F.joints[side]);
  window.__setFist('L', -0.16, 1.38, -0.2);
  window.__setFist('R', 0.16, 1.38, -0.2);
  // vstup do „VR“
  app.ensureAudio();
  app.mode = 'vr';
  app.dom.overlay.classList.add('hidden');
  app.placeAt = 'menu';
  app.showMenu();
  window.__step = async (n = 1) => { for (let i = 0; i < n; i++) { app.loop(window.__frame); await new Promise((r) => setTimeout(r, 5)); } };
  await window.__step(3);
  window.__L = [];
  window.__prof = {};
  const wrapT = (obj, fn, name) => { const o = obj[fn].bind(obj); obj[fn] = (...a) => { const t = performance.now(); const r = o(...a); const d = performance.now() - t; if (d > 200) window.__prof[name] = (window.__prof[name] || []).concat([Math.round(d)]); return r; }; };
  { const o = app.renderer.render.bind(app.renderer); app.renderer.render = (...a) => { const n0 = app.renderer.info.programs.length; const tx0 = app.renderer.info.memory.textures; const t = performance.now(); const r = o(...a); const d = performance.now() - t; if (d > 1000) (window.__prof.R = window.__prof.R || []).push([Math.round(d), n0, app.renderer.info.programs.length, tx0, app.renderer.info.memory.textures, app.screen]); return r; }; } wrapT(app.game, 'update', 'game'); wrapT(app.hands, 'end', 'hands'); wrapT(app.fx, 'update', 'fx'); wrapT(app.env, 'update', 'env');
  for (const k of Object.keys(app.panels)) wrapT(app.panels[k], 'refresh', 'panel_' + k);
  wrapT(app.audio, 'schedule', 'sched'); wrapT(app.audio, 'songTime', 'songTime'); wrapT(app, 'beginPlay', 'beginPlay');
  for (const fn of ['startFlow', 'beginPlay', 'finish', 'showMenu', 'updateCalib']) { const o = app[fn].bind(app); let k = 0; app[fn] = (...a) => { if (fn !== 'updateCalib' || (k++ % 200 === 0)) window.__L.push(fn + '@' + Math.round(performance.now()) + ' scr=' + app.screen + ' mp=' + app.musicProgress + ' need=' + (app.calib && app.calib.need) + ' hold=' + (app.calib && app.calib.hold && app.calib.hold.toFixed(2))); return o(...a); }; }
});
// šťouchnout do tlačítka BOXOVAT pravým ukazováčkem
const poke = async (panelName, id) => { await page.waitForTimeout(500); return page.evaluate(async ({ panelName, id }) => {
  const app = window.__app, F = window.__fake, THREE = window.__T;
  const p = app.panels[panelName];
  p.refresh('force' + Math.random());
  const b = p.buttons.find((x) => x.id === id);
  const lx = ((b.x + b.w / 2) / p.wPx - 0.5) * p.wM, ly = (0.5 - (b.y + b.h / 2) / p.hPx) * p.hM;
  await window.__step(9); app.pokeCool = 0;
  const res = [];
  for (const dz of [0.06, 0.04, 0.02, 0.0, -0.015, 0.03, 0.06]) {
    const w = p.mesh.localToWorld(new THREE.Vector3(lx, ly, dz));
    // posunout celou ruku tak, aby špička ukazováčku byla v bodě w
    const a = F.joints.R; const ox = w.x - a[27], oy = w.y - a[28], oz = w.z - a[29];
    for (let i = 0; i < 25; i++) { a[i * 3] += ox; a[i * 3 + 1] += oy; a[i * 3 + 2] += oz; }
    await window.__step(1);
    const v = app.hands.R.tip.clone(); p.mesh.worldToLocal(v); const bb = p.hitLocal(v.x, v.y);
    res.push(app.screen + ' z=' + v.z.toFixed(3) + ' x=' + v.x.toFixed(2) + ' y=' + v.y.toFixed(2) + ' b=' + (bb && bb.id) + ' cool=' + app.pokeCool.toFixed(2) + ' valid=' + app.hands.R.valid + ' ex=' + app.hands.R.extrap);
  }
  window.__setFist('R', 0.16, 1.38, -0.2);
  await window.__step(2);
  return { screen: app.screen, res, hover: p.hover };
}, { panelName, id }); };
console.log('menu placed at', await page.evaluate(() => window.__app.panels.menu.mesh.position.toArray().map((v) => +v.toFixed(2))));
console.log('poke diff:hard', JSON.stringify(await poke('menu', 'diff:hard')), await page.evaluate(() => window.__app.settings.diff));
console.log('poke start', JSON.stringify(await poke('menu', 'start')));
// kalibrace: obě pěsti natažené
const cal = await page.evaluate(async () => {
  const app = window.__app;
  window.__setFist('L', -0.15, 1.42, -0.52);
  window.__setFist('R', 0.15, 1.42, -0.52);
  const t0 = performance.now();
  const durs = [];
  while (app.screen === 'calib' && performance.now() - t0 < 60000) { const a0 = performance.now(); await window.__step(1); durs.push(Math.round(performance.now() - a0)); }
  window.__durs = durs.slice(-5).concat([durs.length]);
  const a = app.audio, ts = a.ctx.getOutputTimestamp ? a.ctx.getOutputTimestamp() : null;
  return { screen: app.screen, calib: app.calibData, ms: Math.round(performance.now() - t0), ct: a.ctx.currentTime, startAt: a.song && a.song.startAt, raw: a.rawNow(), ts: ts && [ts.contextTime, ts.performanceTime, performance.now()], gt: app.game.t };
});
console.log('calib', JSON.stringify(cal));
console.log((await page.evaluate(() => window.__L)).join('\n'));
console.log('durs', await page.evaluate(() => window.__durs), JSON.stringify(await page.evaluate(() => window.__prof)));
// garda, hrát pár sekund, pak pauza na zápěstí
const pz = await page.evaluate(async () => {
  const app = window.__app, F = window.__fake, THREE = window.__T;
  window.__setFist('L', -0.16, 1.38, -0.2);
  window.__setFist('R', 0.16, 1.38, -0.2);
  await window.__step(20);
  const tBefore = app.game.t;
  // pravý ukazováček na tlačítko pauzy (dwell)
  const t0 = performance.now();
  let n = 0;
  while (app.screen === 'play' && performance.now() - t0 < 8000) {
    const pb = app.pauseBtn.position;
    const a = F.joints.R; const ox = pb.x - a[27], oy = pb.y - a[28], oz = pb.z - a[29];
    for (let i = 0; i < 25; i++) { a[i * 3] += ox; a[i * 3 + 1] += oy; a[i * 3 + 2] += oz; }
    await window.__step(1); n++;
  }
  return { screen: app.screen, tBefore: +tBefore.toFixed(2), frames: n, btnVisible: app.pauseBtn.visible };
});
console.log('wrist pause', JSON.stringify(pz));
console.log('poke resume', JSON.stringify(await poke('pause', 'resume')));
// ztráta sledování rukou
const lost = await page.evaluate(async () => {
  const app = window.__app, F = window.__fake;
  F.tracked.R = false;
  await window.__step(3);
  const a = { valid: app.hands.R.valid, extrap: app.hands.R.extrap };
  const t0 = performance.now(); while (performance.now() - t0 < 700) await window.__step(1);
  const b = { valid: app.hands.R.valid, alpha: +app.hands.R.alpha.toFixed(2), glove: app.hands.gloves.R.group.visible };
  F.tracked.R = true; await window.__step(3);
  return { early: a, later: b, back: app.hands.R.valid };
});
console.log('tracking loss', JSON.stringify(lost));
await page.evaluate(() => { const a = window.__app; a.renderer.render(a.scene, a.camera); });
console.log('errors', errors);
await browser.close();
