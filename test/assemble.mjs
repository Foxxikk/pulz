// Skládání terče při příletu: r = 1,6 / 1,0 / 0,7 / 0,3 s před úderem
import { chromium } from 'playwright';
const OUT = '/tmp/claude-0/-home-claude-pulz/bc7fd394-8c22-5c33-960d-95a1a7172d61/scratchpad/shots';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 520 } });
page.on('pageerror', (e) => console.log('ERR', String(e)));
await page.goto('http://127.0.0.1:8123/index.html');
await page.waitForFunction(() => window.__app, null, { timeout: 30000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const a = window.__app; a.renderer.setAnimationLoop(null); a.hideAll();
  const rs = [1.6, 1.0, 0.7, 0.3, 0.0];
  rs.forEach((r, i) => { const o = a.targets.get(i % 2 ? 'R' : 'L', 'jab'); o.g.position.set(-1.1 + i * 0.55, 1.55, -1.3); a.targets.animateTarget(o, r, 1, 0.06, 0.016); });
  a.targets.update(0.016, 0.3, 1);
  a.camera.position.set(0, 1.58, 0); a.camera.lookAt(0, 1.55, -1.3); a.camera.fov = 60; a.camera.updateProjectionMatrix();
  a.renderer.render(a.scene, a.camera);
});
await page.screenshot({ path: OUT + '/assemble.png' });
await browser.close();
