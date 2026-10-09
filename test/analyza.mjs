// Záznam tréninku (bot s chybami) → stránka analýzy s namockovaným API
import { chromium } from 'playwright';
const OUT = '/tmp/claude-0/-home-claude-pulz/bc7fd394-8c22-5c33-960d-95a1a7172d61/scratchpad/shots';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://127.0.0.1:8123/index.html');
await page.waitForFunction(() => window.__app, null, { timeout: 30000 });
const recs = [];
for (const [track, diff, seed] of [['mesto', 'mid', 3], ['boure', 'hard', 5]]) {
  recs.push(await page.evaluate(async ([track, diff, seed]) => {
    const app = window.__app;
    app.renderer.setAnimationLoop(null);
    const { buildChart } = await import('/src/chart.js');
    const { TRACKS } = await import('/src/config.js');
    const { Bot } = await import('/src/bot.js');
    const tr = TRACKS.find((t) => t.id === track);
    app.calibData = { headH: 1.62, cx: 0, cz: 0, reach: 0.6, hitDist: 0.5 };
    const chart = buildChart(tr, diff, 60 / tr.bpm);
    app.game.start(chart, tr, diff, app.calibData);
    app.screen = 'play'; app.demo = true;
    app.bot = new Bot(app, { jitter: 0.05, missRate: 0.05, seed });
    let R = seed * 999; const rnd = () => ((R = (R * 16807) % 2147483647) / 2147483647);
    const drop = { L: 0, R: 0 };
    const dt = 1 / 72;
    for (let t = 0; t < 60; t += dt) {
      app.hands.begin(); app.bot.update(t, dt);
      for (const s of ['L', 'R']) { const h = app.hands.get(s); if (drop[s] > 0) { drop[s] -= dt; h.fresh = false; } else if (h.speed > 2 && rnd() < 0.03) { drop[s] = 0.05 + rnd() * 0.2; h.fresh = false; } }
      app.hands.end(t, dt, app.bot.head);
      app.game.update(t, dt, app.hands, app.bot.head);
    }
    const rec = app.game.rec; rec.fps = [72, 71, 72];
    return JSON.parse(JSON.stringify(rec));
  }, [track, diff, seed]));
}
console.log('rec items', recs.map((r) => r.items.length), 'example', JSON.stringify(recs[0].items.find((x) => x.r === 'miss') || {}), JSON.stringify(recs[0].items[3]));
await page.route('**/api/logs', (r) => r.request().headers()['x-pin'] === '4321' ? r.fulfill({ json: { logs: recs.map((x, i) => ({ url: `https://x.public.blob.vercel-storage.com/logs/${i}.json`, uploadedAt: '2026-10-09T1' + i })) } }) : r.fulfill({ status: 401, json: {} }));
await page.route('**/*.blob.vercel-storage.com/logs/*', (r) => { const i = +r.request().url().match(/(\d+)\.json/)[1]; r.fulfill({ json: recs[i], headers: { 'access-control-allow-origin': '*' } }); });
await page.goto('http://127.0.0.1:8123/analyza.html');
await page.fill('#pin', '4321');
await page.click('#pinForm button');
await page.waitForSelector('#sessions table', { timeout: 20000 });
await page.screenshot({ path: OUT + '/analyza.png', fullPage: true });
console.log(await page.$eval('#recs', (e) => e.innerText));
console.log('errors', errors);
await browser.close();
