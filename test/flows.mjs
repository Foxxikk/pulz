// Režimy, vytrvalost, bez chyby, choreografie, rozcvička, statistiky
import { chromium } from 'playwright';
const OUT = '/tmp/claude-0/-home-claude-pulz/bc7fd394-8c22-5c33-960d-95a1a7172d61/scratchpad/shots';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://127.0.0.1:8123/index.html');
await page.waitForFunction(() => window.__app, null, { timeout: 30000 });
await page.waitForTimeout(800);
await page.screenshot({ path: OUT + '/menu9.png' });

// simulace hry s botem (bez renderu) v daném režimu
const sim = (mode, opts = {}) => page.evaluate(async ([mode, opts]) => {
  const app = window.__app;
  app.renderer.setAnimationLoop(null);
  const { Bot } = await import('/src/bot.js');
  app.settings.mode = mode; app.settings.track = 'mesto'; app.settings.diff = 'mid';
  app.ensureAudio();
  app.screen = 'menu';
  app.startFlow();
  // počkat na hudbu a připravit hru
  for (let k = 0; k < 400 && app.musicProgress < 1; k++) await new Promise((r) => setTimeout(r, 50));
  app.beginPlay();
  app.bot = new Bot(app, { jitter: 0.02, missRate: opts.missRate || 0, seed: 5 });
  const g = app.game, dt = 1 / 60;
  let t = 0;
  for (; t < (opts.maxT || g.duration + 3) && app.screen === 'play'; t += dt) {
    app.hands.begin(); app.bot.update(t, dt); app.hands.end(t, dt, app.bot.head);
    g.update(t, dt, app.hands, app.bot.head); app.coach.update(g, t);
  }
  if (app.screen === 'play') app.finish(!!opts.forceDone);
  const r = app.lastResult;
  return { screen: app.screen, t: +t.toFixed(1), hits: r.hits, misses: r.misses, bars: r.barriersOk + '/' + r.barriersTotal, mode: r.mode, failed: r.failed, progress: r.progress && +r.progress.toFixed(2), endurance: r.endurance && { idx: r.endurance.idx, n: r.endurance.n, next: r.endurance.next }, endT: app.endT, tip: r.tip, finished: r.finished };
}, [mode, opts]);

console.log('perfect', JSON.stringify(await sim('perfect', { missRate: 0.15 })));
console.log('endurance1', JSON.stringify(await sim('endurance', { maxT: 15, forceDone: true })));
await page.evaluate(() => { const a = window.__app; a.panels.results.key = null; a.panels.results.refresh('x'); a.panels.results.mesh.visible = true; a.renderer.render(a.scene, a.camera); });
await page.screenshot({ path: OUT + '/endurance.png' });
console.log('endurance next', await page.evaluate(() => { const a = window.__app; a.enduranceNext(); return [a.screen, a.currentTrack.name, a.run.idx]; }));

// choreografie: uložená (údery + spirála + zeď) → hra
console.log('choreo', await page.evaluate(async () => {
  const { saveChoreo, loadChoreo, chartFromChoreo } = await import('/src/choreo.js');
  const { TRACKS } = await import('/src/config.js');
  const tr = TRACKS.find((t) => t.id === 'mesto');
  const ev = [];
  for (let b = 8; b < 56; b += 1) ev.push({ kind: 't', type: ['jab', 'hook', 'upper'][Math.floor(b / 8) % 3], hand: b % 2 ? 'R' : 'L', beat: b, px: b % 2 ? 0.2 : -0.2, py: -0.2 });
  for (let k = 0; k < 9; k++) ev.push({ kind: 'b', type: 'arc', ang: -Math.PI / 2 + k * Math.PI / 8, beat: 58 + k * 0.5 });
  ev.push({ kind: 'b', type: 'wallL', beat: 66 });
  saveChoreo(tr, { events: ev, created: Date.now() });
  const ch = chartFromChoreo(loadChoreo(tr), tr, 60 / tr.bpm, 170);
  return JSON.stringify({ targets: ch.targets, bars: ch.barriers });
}));
// hra s nahranou choreografií
console.log('play choreo', JSON.stringify(await sim('train', { maxT: 35 })));

// rozcvička
await page.evaluate(() => { const a = window.__app; a.screen = 'menu'; a.startWarmup(() => { window.__warmDone = true; a.showMenu(); }); for (let k = 0; k < 20; k++) a.updateWarm(0.5); a.renderer.render(a.scene, a.camera); });
await page.screenshot({ path: OUT + '/warmup.png' });
console.log('warm', await page.evaluate(() => { const a = window.__app; for (let k = 0; k < 200; k++) if (a.warm) a.updateWarm(0.5); return [!!window.__warmDone, a.screen]; }));

// statistiky s historií
await page.evaluate(() => {
  const now = Date.now(), D = 86400000;
  const h = [];
  for (let k = 0; k < 9; k++) h.push({ ts: now - (k % 4) * D - k * 1000, track: ['Pulz města', 'Bouře na řece', 'Imagine Dragons - Believer'][k % 3], diff: 'mid', mode: 'train', score: 40000 + k * 5000, acc: 0.9, kcal: 20 + k * 3, time: 180, hits: 150, misses: 10, combo: 60 + k * 10, grade: k > 6 ? 'S' : 'A', done: true, boss: k > 4 ? 1 : 0 });
  localStorage.setItem('pulz.history', JSON.stringify(h));
  localStorage.setItem('pulz.flags', JSON.stringify({ autocal: 1 }));
  const a = window.__app; a.showStats(); a.panels.stats.refresh('x'); a.renderer.render(a.scene, a.camera);
});
await page.screenshot({ path: OUT + '/stats.png' });
console.log('errors', errors);
await browser.close();
