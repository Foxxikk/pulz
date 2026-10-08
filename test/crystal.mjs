import { chromium } from 'playwright';
const OUT = '/tmp/claude-0/-home-claude-pulz/bc7fd394-8c22-5c33-960d-95a1a7172d61/scratchpad/shots';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('ERR', String(e)));
await page.goto('http://127.0.0.1:8123/index.html');
await page.waitForFunction(() => window.__app, null, { timeout: 30000 });
await page.evaluate(() => {
  const a = window.__app; a.renderer.setAnimationLoop(null); a.hideAll();
  const items = [['L','jab',-0.25,1.5,-0.9],['R','hook',0.25,1.5,-0.9],['L','upper',-0.6,1.35,-1.6],['R','jab',0.7,1.6,-2.5]];
  for (const [s,t,x,y,z] of items) { const o = a.targets.get(s,t); o.g.position.set(x,y,z); for (let k=0;k<10;k++) a.targets.animateTarget(o, 0.5, 1, 0.06, 0.03); }
  a.targets.update(0.1);
  a.camera.position.set(0,1.62,0); a.camera.rotation.set(-0.1,0,0,'YXZ'); a.camera.fov = 80; a.camera.updateProjectionMatrix();
  a.renderer.render(a.scene, a.camera);
});
await page.screenshot({ path: OUT + '/crystals.png' });
await browser.close();
