// Automatická kalibrace: bot boxuje do 12 zkušebních terčů (pomalejší švih) → nastavení se upraví
import { chromium } from 'playwright';
const OUT = '/tmp/claude-0/-home-claude-pulz/bc7fd394-8c22-5c33-960d-95a1a7172d61/scratchpad/shots';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://127.0.0.1:8123/index.html');
await page.waitForFunction(() => window.__app, null, { timeout: 30000 });
const r = await page.evaluate(async () => {
  const app = window.__app;
  app.renderer.setAnimationLoop(null);
  const { Bot } = await import('/src/bot.js');
  app.settings.sens = { jab: 1, hook: 1, upper: 1 }; app.settings.zone = 1;
  app.showSettings();
  app.toggleAutoCal();
  app.bot = new Bot(app, { jitter: 0.0, seed: 4 });
  app.demo = true;
  const g = app.game;
  const dt = 1 / 72;
  let t = 0;
  for (; t < 60 && g.practiceMode; t += dt) {
    // bot dostane „čas úderu“ 0,35 s po objevení terče
    for (const it of g.items) if (it.practice && it.tHit > t + 50) { it.tHit = t + 0.35; it.e.i = 1000 + g.practiceIdx; }
    app.hands.begin(); app.bot.update(t, dt); app.hands.end(t, dt, app.bot.head);
    g.updatePractice(t, dt, app.hands, app.bot.head);
  }
  return { t: +t.toFixed(1), msg: app.calMsg, sens: app.settings.sens, zone: app.settings.zone, practice: g.practiceMode };
});
console.log(JSON.stringify(r));
await page.evaluate(() => { const a = window.__app; a.panels.settings.key = null; a.panels.settings.refresh('x'); a.renderer.render(a.scene, a.camera); });
await page.waitForTimeout(500);
await page.screenshot({ path: OUT + '/autocal.png' });
console.log('errors', errors);
await browser.close();
