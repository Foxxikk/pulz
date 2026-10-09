// Snímky nových terčů: v letu, finále a rozpad po zásahu
import { chromium } from 'playwright';
const OUT = '/tmp/claude-0/-home-claude-pulz/bc7fd394-8c22-5c33-960d-95a1a7172d61/scratchpad/shots';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('ERR', String(e)));
await page.goto('http://127.0.0.1:8123/index.html');
await page.waitForFunction(() => window.__app, null, { timeout: 30000 });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const a = window.__app; a.renderer.setAnimationLoop(null); a.hideAll();
  const items = [['L','jab',-0.25,1.5,-0.8],['R','hook',0.25,1.5,-0.8],['L','upper',-0.6,1.35,-1.5],['B','finale',0.6,1.7,-2.2]];
  window.__objs = [];
  for (const [s,t,x,y,z] of items) { const o = a.targets.get(s,t); o.g.position.set(x,y,z); o.g.scale.setScalar(o.base); for (let k=0;k<10;k++) a.targets.animateTarget(o, 0.5, 1, 0.06, 0.03); window.__objs.push(o); }
  a.targets.update(0.1);
  a.camera.position.set(0,1.62,0); a.camera.rotation.set(-0.1,0,0,'YXZ'); a.camera.fov = 80; a.camera.updateProjectionMatrix();
  a.renderer.render(a.scene, a.camera);
});
await page.screenshot({ path: OUT + '/discs.png' });
await page.evaluate(async () => {
  const a = window.__app; const THREE = await import('three');
  const o = window.__objs[0]; const d = new THREE.Vector3(0.1, 0.1, -1).normalize();
  a.fx.burst(o.g.position, new THREE.Color(0x3fb6ff), d, 0.7, true, false);
  a.targets.shatter(o, d, 0.7); a.targets.release(o);
  for (let k = 0; k < 4; k++) { a.targets.update(1/60); a.fx.update(1/60, a.camera.position); }
  a.renderer.render(a.scene, a.camera);
});
await page.screenshot({ path: OUT + '/shatter1.png' });
await page.evaluate(() => { const a = window.__app; for (let k = 0; k < 14; k++) { a.targets.update(1/60); a.fx.update(1/60, a.camera.position); } a.renderer.render(a.scene, a.camera); });
await page.screenshot({ path: OUT + '/shatter2.png' });
await page.evaluate(() => {
  const a = window.__app; for (const o of window.__objs) a.targets.release(o);
  window.__objs = [];
  const items = [['L','jab',-0.36,1.55,-0.75],['R','hook',0.0,1.55,-0.75],['L','upper',0.36,1.55,-0.75],['B','finale',0.0,1.85,-1.6]];
  for (const [s,t,x,y,z] of items) { const o = a.targets.get(s,t); o.g.position.set(x,y,z); o.g.scale.setScalar(o.base); a.targets.animateTarget(o, 0.5, 1, 0.06, 0.03); window.__objs.push(o); }
  a.targets.update(0.1);
  a.camera.position.set(0.15,1.58,0); a.camera.lookAt(0, 1.6, -0.9); a.camera.fov = 60; a.camera.updateProjectionMatrix();
  a.renderer.render(a.scene, a.camera);
});
await page.screenshot({ path: OUT + '/discs-close.png' });
await browser.close();
