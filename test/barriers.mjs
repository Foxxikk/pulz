// Pohled hráče na spirálu půlkruhů a na zdi
import { chromium } from 'playwright';
const OUT = '/tmp/claude-0/-home-claude-pulz/bc7fd394-8c22-5c33-960d-95a1a7172d61/scratchpad/shots';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('ERR', String(e)));
await page.goto('http://127.0.0.1:8123/index.html');
await page.waitForFunction(() => window.__app, null, { timeout: 30000 });
await page.waitForTimeout(1500);
const shot = async (name, pick) => {
  const info = await page.evaluate(async (pick) => {
    const a = window.__app; a.renderer.setAnimationLoop(null); a.hideAll();
    const { buildChart } = await import('/src/chart.js');
    const { TRACKS } = await import('/src/config.js');
    const tr = TRACKS.find((t) => t.id === 'mesto');
    const spb = 60 / tr.bpm;
    const chart = buildChart(tr, 'mid', spb);
    a.calibData = { headH: 1.62, cx: 0, cz: 0, reach: 0.6, hitDist: 0.5 };
    a.game.start(chart, tr, 'mid', a.calibData);
    const b = chart.events.find((e) => e.kind === 'b' && e.type.startsWith(pick));
    const t0 = b.t - (pick === 'arc' ? 0.15 : 0.4);
    a.hands.begin(); a.hands.end(t0, 0.016, a.head);
    for (let t = Math.max(0, t0 - 2.5); t <= t0; t += 0.05) a.game.update(t, 0.05, a.hands, { x: 0, y: 1.62, z: 0 });
    a.env.playing = true; a.env.beat = 0.8; for (let k = 0; k < 30; k++) a.env.update(0.05);
    a.targets.update(0.016, 0.8);
    a.camera.position.set(0, 1.62, 0); a.camera.rotation.set(-0.05, 0, 0, 'YXZ'); a.camera.fov = 90; a.camera.updateProjectionMatrix();
    a.renderer.render(a.scene, a.camera);
    return chart.events.filter((e) => e.kind === 'b' && Math.abs(e.t - b.t) < 3).map((e) => e.type).join(',');
  }, pick);
  await page.screenshot({ path: OUT + '/' + name + '.png' });
  console.log(name, info);
};
await shot('spiral', 'arc');
await shot('wall', 'wall');
await browser.close();
