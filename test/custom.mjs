import { chromium } from 'playwright';
const MP3 = '/root/.claude/uploads/bc7fd394-8c22-5c33-960d-95a1a7172d61/fdb7d188-Imagine_Dragons_-_Believer_Official_Music_Video_-_320_Kbps.mp3';
const OUT = '/tmp/claude-0/-home-claude-pulz/bc7fd394-8c22-5c33-960d-95a1a7172d61/scratchpad/shots';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/404|TUNNEL/.test(m.text())) errors.push(m.text()); });
await page.goto('http://127.0.0.1:8123/index.html');
await page.waitForFunction(() => window.__app, null, { timeout: 30000 });
const t0 = Date.now();
await page.setInputFiles('#file-song', MP3);
await page.waitForFunction(() => window.__app.customTrack && !window.__app.songStatus, null, { timeout: 120000 });
console.log('analysis s', (Date.now() - t0) / 1000, await page.evaluate(() => { const t = window.__app.customTrack; return JSON.stringify({ name: t.name, bpm: t.bpm, dur: t.duration.toFixed(1), beats: t.an.beats.length, track: window.__app.settings.track, status: document.getElementById('custom-status').textContent }); }));
await page.waitForTimeout(1500);
await page.screenshot({ path: OUT + '/v3_menu.png' });
// simulace bota na vlastní skladbě
const r = await page.evaluate(async () => {
  const app = window.__app;
  app.renderer.setAnimationLoop(null);
  const { buildChartFromAnalysis } = await import('/src/chart.js');
  const tr = app.customTrack;
  app.calibData = { headH: 1.62, cx: 0, cz: 0, reach: 0.6, hitDist: 0.5 };
  const out = {};
  for (const d of ['easy', 'mid', 'hard']) {
    const chart = buildChartFromAnalysis(tr.an, tr.phrases, d, tr.seed);
    app.game.start(chart, tr, d, app.calibData); app.screen = 'play'; app.demo = true; app.bot.reset();
    const dt = 1 / 72;
    for (let t = 0; t < chart.duration + 2 && app.game.running; t += dt) { app.hands.begin(); app.bot.update(t, dt); app.hands.end(t, dt, app.bot.head); app.game.update(t, dt, app.hands, app.bot.head); }
    const g = app.game;
    out[d] = { targets: chart.targets, hits: g.hits, misses: g.misses, barriers: g.barriersOk + '/' + (g.barriersOk + g.barriersHit) };
    app.screen = 'menu';
  }
  return out;
});
console.log(JSON.stringify(r));
console.log('errors', errors);
await browser.close();
