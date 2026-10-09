// Nahrávání po částech: nahrát část → uložit → zkusit jen ji → nahrát další → sloučit
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://127.0.0.1:8123/index.html');
await page.waitForFunction(() => window.__app, null, { timeout: 30000 });
console.log(await page.evaluate(async () => {
  const THREE = await import('three');
  const { Bot } = await import('/src/bot.js');
  const { loadChoreo } = await import('/src/choreo.js');
  const app = window.__app;
  app.renderer.setAnimationLoop(null);
  localStorage.removeItem('pulz.choreo');
  const wait = async () => { for (let k = 0; k < 400 && app.musicProgress < 1; k++) await new Promise((r) => setTimeout(r, 50)); };
  const H = app.hands;
  const guard = (s) => new THREE.Vector3(s === 'L' ? -0.16 : 0.16, 1.38, -0.22);
  // syntetické údery na každou dobu v intervalu [a, b)
  const record = (a, b) => {
    const spb = app.recSpb, dt = 1 / 72;
    for (let t = a; t < b; t += dt) {
      for (const s of ['L', 'R']) {
        const h = H.get(s); const prev = h.fist.clone();
        const beat = Math.floor(t / spb), k = t - beat * spb;
        const mine = (beat % 2 === 0) === (s === 'L');
        const e = mine && k < 0.15 ? Math.sin((k / 0.15) * Math.PI / 2) : mine && k < 0.25 ? 1 : mine && k < 0.45 ? 1 - (k - 0.25) / 0.2 : 0;
        h.fist.copy(guard(s)).add(new THREE.Vector3(0, 0.05 * e, -0.42 * e));
        h.vel.subVectors(h.fist, prev).divideScalar(dt); h.speed = h.vel.length(); h.valid = true; h.extrap = false;
      }
      app.recorder.update(t, H, { x: 0, y: 1.62, z: 0, clone() { return new THREE.Vector3(0, 1.62, 0); } }, new THREE.Quaternion(), dt);
      app.game.t = t;
    }
  };
  const out = {};
  // 1) nahrát část 0–20 s a uložit (jako z pauzy)
  app.settings.mode = 'record'; app.settings.track = 'mesto'; app.ensureAudio(); app.screen = 'menu'; app.startFlow(); await wait(); app.beginPlay();
  record(0, 20); app.game.t = 20; app.finish(false);
  let r = app.lastResult;
  out.part1 = { rec: r.recorded, range: r.recRange && [+r.recRange.t0.toFixed(1), +r.recRange.t1.toFixed(1)], saved: loadChoreo(app.currentTrack || r.recTrack).events.length };
  // 2) zkusit jen tuto část – bot
  app.startTry(); await wait(); app.beginPlay();
  out.tryStart = { offset: app.run.offset, songAt: +(app.audio.song.pausedAt || 0).toFixed(1), events: app.game.events.length, dur: +app.game.duration.toFixed(1) };
  app.bot = new Bot(app, { jitter: 0.02, seed: 2 });
  const g = app.game; let t = app.run.offset;
  for (; t < 40 && app.screen === 'play'; t += 1 / 60) { app.hands.begin(); app.bot.update(t, 1 / 60); app.hands.end(t, 1 / 60, app.bot.head); g.update(t, 1 / 60, app.hands, app.bot.head); }
  r = app.lastResult;
  out.try = { endedAt: +t.toFixed(1), screen: app.screen, hits: r.hits, misses: r.misses, mode: r.mode };
  // 3) nahrát další část od konce
  app.lastResult.recEnd = 20;
  app.startRecPart(20); await wait(); app.beginPlay();
  out.more = { from: app.recorder.from, offset: app.run.offset };
  record(17.5, 35); app.game.t = 35; app.finish(false);
  r = app.lastResult;
  const all = loadChoreo(r.recTrack).events;
  out.part2 = { rec: r.recorded, range: r.recRange && [+r.recRange.t0.toFixed(1), +r.recRange.t1.toFixed(1)], total: r.recTotal, firstBeat: all[0].beat, lastBeat: all[all.length - 1].beat };
  return JSON.stringify(out, null, 1);
}));
console.log('errors', errors);
await browser.close();
