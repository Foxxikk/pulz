// Efekty: jiskry/čáry (GPU částice, 1 draw call), rázové kruhy, úlomky s gravitací, plovoucí texty
import * as THREE from 'three';
import { WATER_Y } from './env.js';

const MAXP = 2400;

const sparkVS = `
attribute vec2 corner;
attribute vec3 p0;
attribute vec3 v0;
attribute vec4 col;
attribute vec4 prm; // birth, life, size, stretch
uniform float uTime;
uniform float uGrav;
varying vec4 vCol;
varying vec2 vUv;
void main(){
  float age = uTime - prm.x;
  float life = prm.y;
  if (age < 0.0 || age > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float k = 3.2; // odpor
  float e = (1.0 - exp(-k*age)) / k;
  vec3 pos = p0 + v0 * e + vec3(0.0, -uGrav * age*age*0.5, 0.0);
  vec3 vel = v0 * exp(-k*age) + vec3(0.0, -uGrav*age, 0.0);
  vec3 toCam = normalize(cameraPosition - pos);
  float vl = length(vel);
  vec3 ax = vl > 1e-4 ? vel / vl : vec3(0.0, 1.0, 0.0);
  vec3 sd = cross(ax, toCam);
  float sl = length(sd);
  if (sl < 1e-3) { ax = vec3(0.0, 1.0, 0.0); sd = cross(ax, toCam); sl = max(length(sd), 1e-3); }
  sd /= sl;
  float t = age / life;
  float size = prm.z * (1.0 - t*0.6);
  float len = size + prm.w * vl * 0.022;
  vec3 wp = pos + ax * corner.y * len + sd * corner.x * size;
  vec4 mv = modelViewMatrix * vec4(wp, 1.0);
  vUv = corner;
  vCol = col;
  vCol.a *= (1.0 - t) * (1.0 - t);
  gl_Position = projectionMatrix * mv;
}`;
const sparkFS = `
varying vec4 vCol;
varying vec2 vUv;
void main(){
  float d = length(vUv);
  float a = 1.0 - smoothstep(0.45, 1.0, d);
  gl_FragColor = vec4(vCol.rgb * (1.0 + (1.0-d)*0.35), vCol.a * a);
}`;

const ringVS = `varying vec2 vUv; void main(){ vUv = uv*2.0-1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const ringFS = `uniform vec3 uColor; uniform float uOp; uniform float uW; varying vec2 vUv;
void main(){ float d = length(vUv); float a = smoothstep(1.0-uW, 1.0-uW*0.4, d) * (1.0 - smoothstep(0.94, 1.0, d)); a += smoothstep(0.75, 1.0, d)*0.12*step(d,1.0); gl_FragColor = vec4(uColor*1.4, a*uOp); }`;

function textTexture(text, color, size = 96, w = 512, h = 128) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.font = `900 ${size}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = size * 0.12;
  g.strokeStyle = 'rgba(10,20,40,0.85)';
  g.strokeText(text, w / 2, h / 2);
  g.fillStyle = color;
  g.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return { tex: t, canvas: c, g };
}

export class FX {
  constructor(scene, density = 1) {
    this.scene = scene;
    this.time = 0;
    this.density = density;
    // --- jiskry ---
    const base = new THREE.InstancedBufferGeometry();
    base.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
    base.setAttribute('corner', new THREE.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2));
    base.setIndex([0, 1, 2, 0, 2, 3]);
    this.p0 = new Float32Array(MAXP * 3);
    this.v0 = new Float32Array(MAXP * 3);
    this.col = new Float32Array(MAXP * 4);
    this.prm = new Float32Array(MAXP * 4);
    for (let i = 0; i < MAXP; i++) this.prm[i * 4] = -100;
    const mk = (arr, n) => {
      const a = new THREE.InstancedBufferAttribute(arr, n);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    base.setAttribute('p0', mk(this.p0, 3));
    base.setAttribute('v0', mk(this.v0, 3));
    base.setAttribute('col', mk(this.col, 4));
    base.setAttribute('prm', mk(this.prm, 4));
    base.instanceCount = MAXP;
    this.sparkMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uGrav: { value: 2.2 } },
      vertexShader: sparkVS,
      fragmentShader: sparkFS,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.sparks = new THREE.Mesh(base, this.sparkMat);
    this.sparks.frustumCulled = false;
    this.sparks.renderOrder = 5;
    scene.add(this.sparks);
    this.pi = 0;
    this.dirtyLo = MAXP;
    this.dirtyHi = -1;

    // --- rázové kruhy ---
    this.rings = [];
    const rg = new THREE.PlaneGeometry(2, 2);
    for (let i = 0; i < 16; i++) {
      const m = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color() }, uOp: { value: 0 }, uW: { value: 0.12 } },
        vertexShader: ringVS,
        fragmentShader: ringFS,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(rg, m);
      mesh.visible = false;
      mesh.renderOrder = 4;
      scene.add(mesh);
      this.rings.push({ mesh, m, t: 0, life: 0, r0: 0, r1: 0, active: false });
    }

    // --- úlomky ---
    this.NDEB = 220;
    const shardGeo = new THREE.TetrahedronGeometry(1, 0);
    this.debris = new THREE.InstancedMesh(shardGeo, new THREE.MeshStandardMaterial({ color: 0x1c2436, roughness: 0.2, metalness: 0.9, envMapIntensity: 1.4 }), this.NDEB);
    this.debris.frustumCulled = false;
    // zářící střepy (barva ruky)
    this.glowDebris = new THREE.InstancedMesh(shardGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), this.NDEB);
    this.glowDebris.frustumCulled = false;
    this.glowDebris.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.NDEB * 3).fill(1), 3);
    scene.add(this.glowDebris);
    this.deb = [];
    for (let i = 0; i < this.NDEB; i++) {
      this.deb.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: 0, alive: false, glow: false });
    }
    this.di = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.NDEB; i++) {
      this.debris.setMatrixAt(i, this._zero);
      this.glowDebris.setMatrixAt(i, this._zero);
    }
    scene.add(this.debris);

    // --- plovoucí texty ---
    this.labels = {};
    const defs = {
      perfect: ['PERFEKTNÍ', '#ffd54a'],
      great: ['SKVĚLÉ', '#7ff0ff'],
      good: ['DOBRÉ', '#d6e6ff'],
      weak: ['SILNĚJI!', '#ffffff'],
      wrong: ['DRUHOU RUKOU', '#ff6b6b'],
      dodge: ['ÚHYB', '#ffd36a'],
      ouch: ['AU!', '#ff5a5a'],
      dir: ['JINÝ SMĚR', '#ffb0b0'],
      close: ['TĚSNĚ VEDLE', '#ffd0a0'],
    };
    for (const [k, [txt, c]] of Object.entries(defs)) this.labels[k] = textTexture(txt, c).tex;
    this.texts = [];
    for (let i = 0; i < 12; i++) {
      const tt = textTexture('', '#fff', 80, 512, 128);
      const mat = new THREE.MeshBasicMaterial({ map: tt.tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.06), mat);
      mesh.visible = false;
      mesh.renderOrder = 20;
      scene.add(mesh);
      this.texts.push({ mesh, mat, own: tt, t: 0, life: 0, active: false, vy: 0 });
    }
    this.ti = 0;
    this.splashOn = true;
    this._v = new THREE.Vector3();
    this.camPos = new THREE.Vector3();
  }

  // jedna částice
  emit(px, py, pz, vx, vy, vz, r, g, b, a, life, size, stretch) {
    const i = this.pi;
    this.pi = (this.pi + 1) % MAXP;
    this.p0[i * 3] = px;
    this.p0[i * 3 + 1] = py;
    this.p0[i * 3 + 2] = pz;
    this.v0[i * 3] = vx;
    this.v0[i * 3 + 1] = vy;
    this.v0[i * 3 + 2] = vz;
    this.col[i * 4] = r;
    this.col[i * 4 + 1] = g;
    this.col[i * 4 + 2] = b;
    this.col[i * 4 + 3] = a;
    this.prm[i * 4] = this.time;
    this.prm[i * 4 + 1] = life;
    this.prm[i * 4 + 2] = size;
    this.prm[i * 4 + 3] = stretch;
    if (i < this.dirtyLo) this.dirtyLo = i;
    if (i > this.dirtyHi) this.dirtyHi = i;
  }

  // výbuch terče: color = THREE.Color, dir = směr úderu, power 0..1, perfect
  burst(pos, color, dir, power, perfect, big) {
    const d = this.density;
    const n = Math.round((34 + power * 30 + (big ? 16 : 0)) * d);
    const gold = perfect;
    for (let i = 0; i < n; i++) {
      // náhodný směr, zaujatý směrem úderu
      let x = Math.random() * 2 - 1, y = Math.random() * 2 - 1, z = Math.random() * 2 - 1;
      const l = Math.hypot(x, y, z) || 1;
      x /= l; y /= l; z /= l;
      const sp = 1.8 + Math.random() * 3.8 * (0.6 + power);
      const bias = 2.2 + power * 2;
      let r, g, b;
      if (gold && Math.random() < 0.75) {
        r = 1.0; g = 0.78 + Math.random() * 0.15; b = 0.18;
      } else if (Math.random() < 0.35) {
        r = 1; g = 0.86; b = 0.35;
      } else {
        r = color.r; g = color.g; b = color.b;
      }
      this.emit(pos.x, pos.y, pos.z, x * sp + dir.x * bias, y * sp + dir.y * bias + 0.6, z * sp + dir.z * bias, r, g, b, 1, 0.4 + Math.random() * 0.4, 0.006 + Math.random() * 0.006, 2.0);
    }
    // rychlostní čáry ve směru úderu
    const nl = Math.round(14 * d);
    for (let i = 0; i < nl; i++) {
      const s = 7 + Math.random() * 7;
      const jx = (Math.random() - 0.5) * 0.9, jy = (Math.random() - 0.5) * 0.9, jz = (Math.random() - 0.5) * 0.9;
      this.emit(pos.x, pos.y, pos.z, (dir.x + jx) * s, (dir.y + jy) * s, (dir.z + jz) * s, color.r * 0.6 + 0.4, color.g * 0.6 + 0.4, color.b * 0.6 + 0.4, 0.75, 0.2, 0.0035, 3.4);
    }
    // záblesk
    this.emit(pos.x, pos.y, pos.z, 0, 0, 0, 1, 1, 0.95, 0.9, 0.08, 0.07 + power * 0.03, 0);
    this.emit(pos.x, pos.y, pos.z, 0, 0, 0, color.r, color.g, color.b, 0.55, 0.16, 0.12, 0);
    // kruhy
    this.ring(pos, gold ? new THREE.Color(1, 0.8, 0.3) : color, 0.05, 0.26 + power * 0.1, 0.3, 0.16);
    this.ring(pos, new THREE.Color(1, 1, 1), 0.04, 0.18 + power * 0.06, 0.2, 0.1);
    if (big) this.ring(pos, color, 0.08, 0.42, 0.4, 0.07);
    // úlomky
    const nd = Math.round((10 + power * 8 + (big ? 5 : 0)) * Math.min(1, d + 0.3));
    for (let i = 0; i < nd; i++) {
      const idx = this.di;
      const o = this.deb[idx];
      this.di = (this.di + 1) % this.NDEB;
      o.alive = true;
      o.glow = Math.random() < 0.4;
      if (o.glow) {
        const k = 1.3 + Math.random() * 0.5;
        this.glowDebris.instanceColor.setXYZ(idx, Math.min(1, color.r * k + 0.1), Math.min(1, color.g * k + 0.1), Math.min(1, color.b * k + 0.1));
        this.glowDebris.instanceColor.needsUpdate = true;
        this.debris.setMatrixAt(idx, this._zero);
      } else this.glowDebris.setMatrixAt(idx, this._zero);
      o.p.copy(pos);
      o.p.x += (Math.random() - 0.5) * 0.12;
      o.p.y += (Math.random() - 0.5) * 0.12;
      const sp = 1.2 + Math.random() * 2.5;
      o.v.set((Math.random() - 0.5) * sp + dir.x * 1.8, Math.random() * 2.2 + 0.4 + dir.y * 1.5, (Math.random() - 0.5) * sp + dir.z * 1.8);
      o.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      o.w.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
      o.s = 0.014 + Math.random() * 0.022;
    }
  }

  ring(pos, color, r0, r1, life, w) {
    const o = this.rings.find((x) => !x.active) || this.rings[0];
    o.active = true;
    o.t = 0;
    o.life = life;
    o.r0 = r0;
    o.r1 = r1;
    o.mesh.visible = true;
    o.mesh.position.copy(pos);
    o.m.uniforms.uColor.value.copy(color);
    o.m.uniforms.uW.value = w;
  }

  splash(pos, n = 10) {
    for (let i = 0; i < n * this.density; i++) {
      const a = Math.random() * 6.283;
      const s = 0.6 + Math.random() * 1.2;
      this.emit(pos.x, WATER_Y + 0.02, pos.z, Math.cos(a) * s, 1.2 + Math.random() * 1.8, Math.sin(a) * s, 0.85, 0.97, 1, 0.8, 0.5 + Math.random() * 0.3, 0.012, 0.6);
    }
  }

  fireworks(pos, colors) {
    for (let k = 0; k < 3; k++) {
      const c = colors[k % colors.length];
      const cx = pos.x + (Math.random() - 0.5) * 6, cy = pos.y + Math.random() * 3, cz = pos.z + (Math.random() - 0.5) * 4;
      const n = Math.round(70 * this.density);
      for (let i = 0; i < n; i++) {
        let x = Math.random() * 2 - 1, y = Math.random() * 2 - 1, z = Math.random() * 2 - 1;
        const l = Math.hypot(x, y, z) || 1;
        const s = 9 + Math.random() * 2;
        this.emit(cx, cy, cz, (x / l) * s, (y / l) * s, (z / l) * s, c.r, c.g, c.b, 1, 1.1 + Math.random() * 0.5, 0.06, 1.2);
      }
    }
  }

  text(kind, pos, extra, color) {
    const o = this.texts[this.ti];
    this.ti = (this.ti + 1) % this.texts.length;
    o.active = true;
    o.t = 0;
    o.life = 0.75;
    o.vy = 0.35;
    if (extra != null) {
      const g = o.own.g, c = o.own.canvas;
      g.clearRect(0, 0, c.width, c.height);
      g.font = `900 80px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 10;
      g.strokeStyle = 'rgba(10,20,40,0.85)';
      g.strokeText(extra, c.width / 2, c.height / 2);
      g.fillStyle = color || '#fff';
      g.fillText(extra, c.width / 2, c.height / 2);
      o.own.tex.needsUpdate = true;
      o.mat.map = o.own.tex;
    } else {
      o.mat.map = this.labels[kind];
    }
    o.mat.needsUpdate = true;
    o.mesh.visible = true;
    o.mesh.position.copy(pos);
    o.mesh.scale.setScalar(0.6);
    o.mesh.lookAt(this.camPos);
  }

  clearTexts() {
    for (const o of this.texts) {
      o.active = false;
      o.mesh.visible = false;
    }
  }

  update(dt, camPos) {
    this.time += dt;
    this.camPos.copy(camPos);
    this.sparkMat.uniforms.uTime.value = this.time;
    if (this.dirtyHi >= 0) {
      const g = this.sparks.geometry;
      for (const name of ['p0', 'v0', 'col', 'prm']) {
        const a = g.attributes[name];
        a.clearUpdateRanges();
        a.addUpdateRange(this.dirtyLo * a.itemSize, (this.dirtyHi - this.dirtyLo + 1) * a.itemSize);
        a.needsUpdate = true;
      }
      this.dirtyLo = MAXP;
      this.dirtyHi = -1;
    }
    for (const o of this.rings) {
      if (!o.active) continue;
      o.t += dt;
      const k = o.t / o.life;
      if (k >= 1) {
        o.active = false;
        o.mesh.visible = false;
        continue;
      }
      const e = 1 - Math.pow(1 - k, 3);
      o.mesh.scale.setScalar(o.r0 + (o.r1 - o.r0) * e);
      o.mesh.lookAt(camPos);
      o.m.uniforms.uOp.value = (1 - k) * 0.9;
    }
    // úlomky
    const m = this._m, q = this._q, s = this._s;
    for (let i = 0; i < this.NDEB; i++) {
      const o = this.deb[i];
      if (!o.alive) continue;
      o.v.y -= 9.8 * dt;
      o.v.multiplyScalar(1 - dt * 0.4);
      o.p.addScaledVector(o.v, dt);
      o.r.x += o.w.x * dt;
      o.r.y += o.w.y * dt;
      o.r.z += o.w.z * dt;
      if (o.p.y < WATER_Y) {
        o.alive = false;
        this.debris.setMatrixAt(i, this._zero);
        this.glowDebris.setMatrixAt(i, this._zero);
        if (this.splashOn && Math.random() < 0.5) this.splash(o.p, 4);
        continue;
      }
      q.setFromEuler(o.r);
      s.set(o.s, o.s * 0.28, o.s * 1.7);
      m.compose(o.p, q, s);
      (o.glow ? this.glowDebris : this.debris).setMatrixAt(i, m);
    }
    this.debris.instanceMatrix.needsUpdate = true;
    this.glowDebris.instanceMatrix.needsUpdate = true;
    for (const o of this.texts) {
      if (!o.active) continue;
      o.t += dt;
      const k = o.t / o.life;
      if (k >= 1) {
        o.active = false;
        o.mesh.visible = false;
        continue;
      }
      o.mesh.position.y += o.vy * dt;
      o.vy *= 1 - dt * 3;
      const sc = k < 0.15 ? 0.6 + (k / 0.15) * 0.5 : 1.1 - (k - 0.15) * 0.15;
      o.mesh.scale.setScalar(sc);
      o.mat.opacity = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      o.mesh.lookAt(camPos);
    }
  }
}
