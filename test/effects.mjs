// Řízené snímky efektů: zásah (rázová vlna, hvězda, rozlet), ekvalizér na plošině
import { chromium } from 'playwright';
const OUT = '/tmp/claude-0/-home-claude-pulz/bc7fd394-8c22-5c33-960d-95a1a7172d61/scratchpad/shots';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('ERR', String(e)));
await page.goto('http://127.0.0.1:8123/index.html');
await page.waitForFunction(() => window.__app, null, { timeout: 30000 });
await page.waitForTimeout(1500);
await page.evaluate(async () => {
  const a = window.__app; a.renderer.setAnimationLoop(null); a.hideAll();
  const THREE = await import('three');
  window.__T = THREE;
  const o = a.targets.get('R', 'hook'); o.g.position.set(0.15, 1.45, -0.6); o.g.updateMatrixWorld(true);
  const q = new THREE.Quaternion(); o.orient.getWorldQuaternion(q);
  const d = new THREE.Vector3(-1, 0.1, -0.2).normalize();
  a.fx.burst(o.g.position, new THREE.Color(0xff8c26), d, 0.8, true, true, q);
  a.targets.shatter(o, d, 0.8); a.targets.release(o);
  a.env.kick(Math.atan2(0.15, 0.6), new THREE.Color(0xff8c26), 1);
  a.env.beat = 1;
  for (let k = 0; k < 4; k++) { a.targets.update(1/60); a.fx.update(1/60, a.camera.position); a.env.update(1/60); }
  a.camera.position.set(0, 1.62, 0.05); a.camera.rotation.set(-0.25, 0, 0, 'YXZ'); a.camera.fov = 90; a.camera.updateProjectionMatrix();
  a.renderer.render(a.scene, a.camera);
});
await page.screenshot({ path: OUT + '/fx1.png' });
await page.evaluate(() => { const a = window.__app; for (let k = 0; k < 10; k++) { a.env.beat = Math.max(0, 1 - k * 0.1); a.targets.update(1/60); a.fx.update(1/60, a.camera.position); a.env.update(1/60); } a.renderer.render(a.scene, a.camera); });
await page.screenshot({ path: OUT + '/fx2.png' });
// pohled na plošinu zvenku
await page.evaluate(() => { const a = window.__app; const T = window.__T; a.env.kick(0.8, new T.Color(0x3d8fff), 1); for (let k = 0; k < 12; k++) { a.env.beat = k < 3 ? 1 : 0.4; a.env.update(1/60); } a.camera.position.set(1.4, 1.5, 1.6); a.camera.lookAt(0, 0.1, 0); a.camera.fov = 60; a.camera.updateProjectionMatrix(); a.renderer.render(a.scene, a.camera); });
await page.screenshot({ path: OUT + '/fx3.png' });
await browser.close();
