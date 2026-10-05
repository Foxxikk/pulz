import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.goto('http://127.0.0.1:8123/index.html');
await page.waitForFunction(() => window.__app, null, { timeout: 30000 });
await page.evaluate(() => {
  const a = window.__app; window.__texts = {};
  const orig = a.fx.text.bind(a.fx);
  a.fx.text = (k, p, e, c) => { window.__texts[k || 'num'] = (window.__texts[k || 'num'] || 0) + 1; return orig(k, p, e, c); };
  window.__samples = [];
  const g = a.game; const ou = g.update.bind(g);
  g.update = (t, dt, hands, head) => {
    for (const it of g.items) if (it.kind === 't' && it.state === 'fly' && Math.abs(it.tHit - t) < 0.06) {
      const h = hands.get(it.side);
      window.__samples.push({ dt: +(t - it.tHit).toFixed(3), d: +h.fist.distanceTo(it.pos).toFixed(3), sp: +h.speed.toFixed(2), valid: h.valid, fz: +h.fist.z.toFixed(2), tz: +it.pos.z.toFixed(2), ty: +it.pos.y.toFixed(2), fy: +h.fist.y.toFixed(2) });
    }
    return ou(t, dt, hands, head);
  };
});
await page.click('#btn-demo');
await page.waitForFunction(() => window.__app.screen === 'play', null, { timeout: 120000 });
await page.waitForTimeout(12000);
console.log(await page.evaluate(() => JSON.stringify({ texts: window.__texts, log: window.__app.game.log.slice(0, 6), s: window.__samples.slice(0, 30), bot: window.__app.bot.motion.R && { start: window.__app.bot.motion.R.start, c: window.__app.bot.motion.R.contact } })));
await browser.close();
