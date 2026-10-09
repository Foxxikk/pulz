// Editor choreografie: boxerské údery se zapíšou, jiné pohyby ne; úhyby → překážky
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://127.0.0.1:8123/index.html');
await page.waitForFunction(() => window.__app, null, { timeout: 30000 });
console.log(await page.evaluate(async () => {
  const THREE = await import('three');
  const { Recorder, beatMap } = await import('/src/choreo.js');
  const spb = 0.5;
  const calib = { headH: 1.62, cx: 0, cz: 0, hitDist: 0.5 };
  const mkH = (side) => ({ side, valid: true, extrap: false, speed: 0, vel: new THREE.Vector3(), pkVel: new THREE.Vector3(), fist: new THREE.Vector3(side === 'L' ? -0.16 : 0.16, 1.38, -0.22), prev: new THREE.Vector3() });
  const out = {};
  const run = (name, script) => {
    const rec = new Recorder(calib, beatMap({}, spb));
    const H = { L: mkH('L'), R: mkH('R'), get(s) { return this[s]; } };
    const head = new THREE.Vector3(0, 1.62, 0), q = new THREE.Quaternion();
    const dt = 1 / 72;
    for (let t = 0; t < 6; t += dt) {
      for (const s of ['L', 'R']) H[s].prev.copy(H[s].fist);
      script(t, H, head, q);
      for (const s of ['L', 'R']) { H[s].vel.subVectors(H[s].fist, H[s].prev).divideScalar(dt); H[s].speed = H[s].vel.length(); }
      rec.update(t, H, head, q, dt);
    }
    out[name] = rec.events.map((e) => e.kind === 't' ? e.hand + ':' + e.type : e.type + (e.ang != null ? '@' + Math.round(e.ang * 57.3) : '')).join(' ');
  };
  const guard = (s) => new THREE.Vector3(s === 'L' ? -0.16 : 0.16, 1.38, -0.22);
  // úder: 0,15 s ven po dráze, 0,25 s zpět; cíl relativně ke gardě
  const punch = (H, s, t, t0, d) => {
    const k = t - t0, g = guard(s);
    if (k < 0 || k > 0.5) return;
    const e = k < 0.15 ? Math.sin((k / 0.15) * Math.PI / 2) : k < 0.25 ? 1 : Math.max(0, 1 - (k - 0.25) / 0.25);
    H[s].fist.copy(g).addScaledVector(d, e);
  };
  run('direkty', (t, H) => { for (let i = 0; i < 6; i++) punch(H, i % 2 ? 'R' : 'L', t, 0.5 + i * 0.8, new THREE.Vector3(0, 0.05, -0.42)); });
  run('hooky+zvedaky', (t, H) => {
    punch(H, 'L', t, 0.5, new THREE.Vector3(0.36, 0.08, -0.18)); punch(H, 'R', t, 1.3, new THREE.Vector3(-0.36, 0.08, -0.18));
    punch(H, 'L', t, 2.1, new THREE.Vector3(0.05, 0.36, -0.15)); punch(H, 'R', t, 2.9, new THREE.Vector3(-0.05, 0.36, -0.15));
  });
  run('neboxerske', (t, H) => {
    // mávnutí do strany ven, spuštění rukou dolů, stažení k tělu, rychlé třesení na místě
    punch(H, 'L', t, 0.5, new THREE.Vector3(-0.4, 0, 0.05));
    punch(H, 'R', t, 1.3, new THREE.Vector3(0, -0.45, 0.1));
    punch(H, 'L', t, 2.1, new THREE.Vector3(0, 0, 0.18));
    if (t > 3 && t < 4) H.R.fist.copy(guard('R')).add(new THREE.Vector3(Math.sin(t * 40) * 0.05, 0, 0));
  });
  const roll = (q, r) => q.setFromEuler(new THREE.Euler(0, 0, r, 'YXZ'));
  run('podrep', (t, H, head) => { head.y = 1.62 - (t > 1 && t < 1.8 ? 0.25 : 0); });
  run('uklon', (t, H, head, q) => { const on = t > 1 && t < 1.8; head.x = on ? -0.22 : 0; head.y = on ? 1.57 : 1.62; roll(q, on ? 0.35 : 0); });
  run('ukrok', (t, H, head, q) => { head.x = t > 1 && t < 2 ? 0.32 : 0; roll(q, 0); });
  run('spirala', (t, H, head, q) => { if (t > 1 && t < 4) { const a = -Math.PI / 2 + ((t - 1) / 3) * Math.PI; head.x = 0.22 * Math.sin(a); head.y = 1.62 - 0.22 * Math.cos(a); roll(q, -a * 0.3); } else { head.set(0, 1.62, 0); roll(q, 0); } });
  return JSON.stringify(out, null, 1);
}));
console.log('errors', errors);
await browser.close();
