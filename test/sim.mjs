// Simulace celé trati bez renderu: bot hraje, měří se uznané zásahy a falešné zásahy
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://127.0.0.1:8123/index.html');
await page.waitForFunction(() => window.__app, null, { timeout: 30000 });
const cases = JSON.parse(process.argv[2] || '[]');
const out = [];
for (const c of cases) {
  const r = await page.evaluate(async (c) => {
    const app = window.__app;
    app.renderer.setAnimationLoop(null);
    const { buildChart } = await import('/src/chart.js');
    const { TRACKS } = await import('/src/config.js');
    const { Bot } = await import('/src/bot.js');
    const track = TRACKS.find((t) => t.id === c.track);
    app.settings.diff = c.diff; app.settings.track = c.track; app.settings.power = c.power || 'norm';
    app.calibData = { headH: 1.62, cx: 0, cz: 0, reach: 0.6, hitDist: 0.5 };
    const chart = buildChart(track, c.diff, 60 / track.bpm);
    app.game.start(chart, track, c.diff, app.calibData);
    app.screen = 'play'; app.demo = true;
    app.bot = new Bot(app, { jitter: c.jitter ?? 0.02, missRate: c.missRate ?? 0, seed: c.seed ?? 3 });
    const dt = 1 / (c.fps || 72);
    let drop = { L: 0, R: 0 };
    let R = 12345; const rnd = () => ((R = (R * 16807) % 2147483647) / 2147483647);
    for (let t = 0; t < chart.duration + 3; t += dt) {
      app.hands.begin();
      if (c.idle) {
        // ruce v klidu v gardě (test falešných zásahů)
        app.bot.update(t, dt);
        app.bot.motion = { L: null, R: null };
        app.bot.done = new Set(app.game.items.map(i => i.e.i));
      } else app.bot.update(t, dt);
      // výpadky sledování při rychlém pohybu
      if (c.dropout) for (const s of ['L', 'R']) {
        const h = app.hands.get(s);
        if (drop[s] > 0) { drop[s] -= dt; h.fresh = false; }
        else if (h.speed > 2 && rnd() < c.dropout) { drop[s] = 0.04 + rnd() * 0.08; h.fresh = false; }
      }
      app.hands.end(t, dt, app.bot.head);
      app.game.update(t, dt, app.hands, app.bot.head);
      app.fx.update(dt, app.bot.head);
      if (app.screen !== 'play') break;
    }
    const res = app.lastResult || app.game.result();
    const log = app.game.log;
    const weak = 0;
    const errs = log.filter(l => l.err != null).map(l => l.err);
    const meanErr = errs.reduce((a, b) => a + b, 0) / (errs.length || 1);
    return { case: c, targets: chart.targets, hits: res.hits, misses: res.misses, acc: +(res.hitAcc ?? res.acc).toFixed(3), barriers: `${res.barriersOk}/${res.barriersTotal}`, grade: res.grade, score: res.score, maxCombo: res.maxCombo, perfect: +res.perfectRate.toFixed(2), kcal: +res.kcal.toFixed(1), speed: +res.avgSpeed.toFixed(2), meanErrMs: Math.round(meanErr * 1000), dirBad: log.filter(l => l.dirOk === false).length, screen: app.screen };
  }, c);
  out.push(r);
  console.log(JSON.stringify(r));
}
if (errors.length) console.log('ERRORS', errors.slice(0, 10));
await browser.close();
