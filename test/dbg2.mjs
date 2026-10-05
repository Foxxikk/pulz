import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('ERR', String(e)));
await page.goto('http://127.0.0.1:8123/index.html');
await page.waitForFunction(() => window.__app, null, { timeout: 30000 });
for (const variant of ['red', 'orig']) {
  const r = await page.evaluate((variant) => { window.__app.fx.time += 5;
    const app = window.__app;
    app.renderer.setAnimationLoop(null);
    app.hideAll();
    const fx = app.fx;
    const m = fx.sparkMat;
    if (!window.__origVS) { window.__origVS = m.vertexShader; window.__origFS = m.fragmentShader; }
    m.vertexShader = window.__origVS; m.fragmentShader = window.__origFS;
    if (variant === 'noreturn') m.vertexShader = m.vertexShader.replace('gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return;', '');
    if (variant === 'red') { m.vertexShader = m.vertexShader.replace('gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return;', ''); m.fragmentShader = 'void main(){ gl_FragColor = vec4(1.0,0.0,0.0,1.0); }'; }
    if (false) { m.fragmentShader = 'void main(){ gl_FragColor = vec4(1.0,0.0,0.0,1.0); }'; m.vertexShader = m.vertexShader.replace('mv.xy += dir * corner.y * len + perp * corner.x * size;', ({dirA:'mv.xy += (normalize(v0.xy + vec2(0.001)) * corner.y + vec2(0.0)) * 0.03 + corner*0.0;', dirB:'mv.xy += corner * (dl > 1e-4 ? 0.03 : 0.0);', dirC:'mv.xy += corner * clamp(dl*0.001, 0.0, 0.2);'})[variant]); }
    m.needsUpdate = true;
    const p = app.head.clone().set(0, 1.5, -0.6);
    fx.burst(p, { r: 1, g: 0.5, b: 0.1 }, { x: 0, y: 0, z: -1 }, 0.7, true, true);
    fx.update(0.03, app.camera.position);
    app.camera.position.set(0, 1.62, 0.3); app.camera.rotation.set(-0.1, 0, 0, 'YXZ');
    app.renderer.render(app.scene, app.camera);
    // spočítat červené/oranžové pixely
    const gl = app.renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let n = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i] > 200 && px[i + 2] < 90) n++;
    return n;
  }, variant);
  console.log(variant, r);
}
await browser.close();
