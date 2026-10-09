// Létající 3D terče (ve stylu boxovacích fitness her): tmavý zkosený disk složený z výsečí,
// spáry mezi výsečemi svítí barvou ruky, uprostřed ikona. Při zásahu se výseče rozletí.
// Směr hooku/zvedáku ukazuje bílé 3D „křídlo“. Finále = velký zlatý terč.
// Bariéry: energetické štíty („Měsíc“).
import * as THREE from 'three';
import { COL, GEO } from './config.js';
import { drawHexIcon } from './hands.js';

const R = GEO.targetR;
const SEG = 6;
const DEPTH = 0.05;
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _e = new THREE.Euler();

function faceTexture(color, gold) {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const bg = g.createRadialGradient(S / 2, S * 0.42, 0, S / 2, S / 2, S / 2);
  bg.addColorStop(0, gold ? '#3a2a08' : '#1d2a44');
  bg.addColorStop(0.75, gold ? '#1c1404' : '#0b1222');
  bg.addColorStop(1, '#04070d');
  g.fillStyle = bg;
  g.fillRect(0, 0, S, S);
  // jemné soustředné drážky
  g.strokeStyle = 'rgba(255,255,255,0.06)';
  g.lineWidth = 3;
  for (let r = 60; r < S / 2; r += 26) {
    g.beginPath();
    g.arc(S / 2, S / 2, r, 0, Math.PI * 2);
    g.stroke();
  }
  // svítící vnitřní obrys
  g.save();
  g.shadowColor = color;
  g.shadowBlur = 30;
  g.strokeStyle = color;
  g.lineWidth = 10;
  g.beginPath();
  g.arc(S / 2, S / 2, S * 0.43, 0, Math.PI * 2);
  g.stroke();
  g.restore();
  drawHexIcon(g, S / 2, S / 2, S * 0.22, color);
  g.globalAlpha = 0.5;
  drawHexIcon(g, S / 2, S / 2, S * 0.12, '#ffffff', false);
  g.globalAlpha = 1;
  // odlesk nahoře
  const hl = g.createLinearGradient(0, 0, 0, S * 0.5);
  hl.addColorStop(0, 'rgba(255,255,255,0.10)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hl;
  g.beginPath();
  g.ellipse(S / 2, S * 0.28, S * 0.36, S * 0.18, 0, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  // UV víček = souřadnice v metrech → přepočet na 0..1
  t.repeat.set(1 / (2 * R), 1 / (2 * R));
  t.offset.set(0.5, 0.5);
  return t;
}

function glowTexture() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.3, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// výseč k disku: postavená přímo na svém místě (UV čela = souvislý obraz přes celý disk),
// geometrie posunutá tak, aby se kus po zásahu točil kolem vlastního těžiště
function wedgeGeometry(k) {
  const half = Math.PI / SEG;
  const a = (k / SEG) * Math.PI * 2;
  const gap = 0.0045;
  const ri = 0.016;
  const ro = R - 0.008;
  const s = new THREE.Shape();
  const a0 = a - half + gap / ro, a1 = a + half - gap / ro;
  const b0 = a - half + gap / ri, b1 = a + half - gap / ri;
  s.moveTo(Math.cos(b0) * ri, Math.sin(b0) * ri);
  s.lineTo(Math.cos(a0) * ro, Math.sin(a0) * ro);
  s.absarc(0, 0, ro, a0, a1, false);
  s.lineTo(Math.cos(b1) * ri, Math.sin(b1) * ri);
  s.absarc(0, 0, ri, b1, b0, true);
  const g = new THREE.ExtrudeGeometry(s, { depth: DEPTH - 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.007, bevelSegments: 3, curveSegments: 10 });
  const c = new THREE.Vector3(Math.cos(a) * R * 0.6, Math.sin(a) * R * 0.6, 0);
  g.translate(-c.x, -c.y, -(DEPTH - 0.012) / 2);
  g.computeVertexNormals();
  return { g, c };
}

function wingGeometry() {
  const s = new THREE.Shape();
  s.absarc(0, 0, 0.11, -Math.PI * 0.42, Math.PI * 0.42, false);
  s.absarc(0.045, 0, 0.085, Math.PI * 0.45, -Math.PI * 0.45, true);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 16 });
  g.translate(0, 0, -0.006);
  return g;
}

// ---------- bariéra: shader ----------
const barrierVS = `
varying vec2 vP;
void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const barrierFS = `
uniform vec3 uColor; uniform float uOp; uniform float uTime;
varying vec2 vP;
void main(){
  float r = length(vP);
  float stripes = smoothstep(0.35, 0.65, abs(fract((vP.x + vP.y) * 4.0 - uTime * 1.6) - 0.5) * 2.0);
  vec2 q = vP * 9.0;
  q.x += mod(floor(q.y), 2.0) * 0.5;
  vec2 f = abs(fract(q) - 0.5);
  float grid = smoothstep(0.42, 0.5, max(f.x, f.y));
  float edge = smoothstep(0.86, 1.0, r) + (1.0 - smoothstep(0.0, 0.06, vP.y));
  float scan = smoothstep(0.0, 0.04, abs(fract(r * 1.5 - uTime * 0.9) - 0.5) - 0.44);
  float a = 0.14 + stripes * 0.12 + grid * 0.16 + edge * 0.6 + scan * 0.25;
  gl_FragColor = vec4(uColor * (1.0 + edge * 0.8), clamp(a, 0.0, 1.0) * uOp);
}`;

export class TargetPool {
  constructor(scene) {
    this.scene = scene;
    this.wedgeGeos = Array.from({ length: SEG }, (_, k) => wedgeGeometry(k));
    this.wingGeo = wingGeometry();
    this.coreGeo = new THREE.CircleGeometry(R * 0.985, 48);
    this.glowTex = glowTexture();
    const mk = (hex, gold) => {
      const c = new THREE.Color(hex);
      const css = '#' + c.getHexString();
      return {
        face: new THREE.MeshStandardMaterial({ map: faceTexture(css, gold), metalness: 0.55, roughness: 0.28, envMapIntensity: 1.6, emissive: c.clone(), emissiveIntensity: 0.06 }),
        side: new THREE.MeshStandardMaterial({ color: gold ? 0x6a4a10 : 0x1a2233, metalness: 0.85, roughness: 0.2, emissive: c.clone(), emissiveIntensity: 0.55, envMapIntensity: 1.8 }),
        core: new THREE.MeshBasicMaterial({ color: c.clone().lerp(new THREE.Color(1, 1, 1), 0.25).multiplyScalar(1.6), toneMapped: false, side: THREE.DoubleSide }),
        glow: new THREE.SpriteMaterial({ map: this.glowTex, color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.4 }),
      };
    };
    this.mats = { L: mk(COL.L), R: mk(COL.R), B: mk(COL.gold, true) };
    this.wingMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.85, metalness: 0.1, roughness: 0.35 });
    this.pool = [];
    for (let i = 0; i < 26; i++) this.pool.push(this.make());
    // létající výseče po zásahu
    this.pieces = [];
    for (let i = 0; i < 60; i++) {
      const m = new THREE.Mesh(this.wedgeGeos[0].g, [this.mats.L.face, this.mats.L.side]);
      m.visible = false;
      scene.add(m);
      this.pieces.push({ m, v: new THREE.Vector3(), w: new THREE.Vector3(), t: 0, life: 0, s: 1, active: false });
    }
    this.pi = 0;
    this.barrierPool = [];
    for (let i = 0; i < 6; i++) this.barrierPool.push(this.makeBarrier());
    this.time = 0;
    this.beatPulse = 0;
  }

  make() {
    const g = new THREE.Group();
    const spin = new THREE.Group();
    g.add(spin);
    const wedges = [];
    for (let k = 0; k < SEG; k++) {
      const w = new THREE.Mesh(this.wedgeGeos[k].g, [this.mats.L.face, this.mats.L.side]);
      w.position.copy(this.wedgeGeos[k].c);
      w.userData.k = k;
      spin.add(w);
      wedges.push(w);
    }
    const core = new THREE.Mesh(this.coreGeo, this.mats.L.core);
    core.position.z = -0.006;
    spin.add(core);
    const glow = new THREE.Sprite(this.mats.L.glow.clone());
    glow.scale.setScalar(R * 3.4);
    glow.position.z = -0.03;
    glow.renderOrder = -1;
    g.add(glow);
    const wing = new THREE.Mesh(this.wingGeo, this.wingMat);
    g.add(wing);
    g.visible = false;
    this.scene.add(g);
    return { g, spin, wedges, core, glow, wing, busy: false, side: 'L', type: 'jab', wob: Math.random() * 6 };
  }

  get(side, type) {
    let o = this.pool.find((p) => !p.busy);
    if (!o) {
      o = this.make();
      this.pool.push(o);
    }
    o.busy = true;
    o.side = side;
    o.type = type;
    o.g.visible = true;
    const m = this.mats[side] || this.mats.L;
    for (const w of o.wedges) w.material = [m.face, m.side];
    o.core.material = m.core;
    o.glow.material.color.copy(m.glow.color);
    o.g.scale.setScalar(1);
    o.spin.rotation.set(0, 0, Math.random() * 6.28);
    o.wob = Math.random() * 6;
    o.base = type === 'finale' ? 2.1 : 1;
    if (type === 'hook') {
      o.wing.visible = true;
      const sgn = side === 'R' ? 1 : -1;
      o.wing.position.set(sgn * (R + 0.04), 0, 0);
      o.wing.rotation.set(0, 0, sgn > 0 ? 0 : Math.PI);
    } else if (type === 'upper') {
      o.wing.visible = true;
      o.wing.position.set(0, -(R + 0.04), 0);
      o.wing.rotation.set(0, 0, -Math.PI / 2);
    } else o.wing.visible = false;
    return o;
  }

  release(o) {
    o.busy = false;
    o.g.visible = false;
  }

  update(dt, beatPulse = 0) {
    this.time += dt;
    this.beatPulse = beatPulse;
    for (const k of ['L', 'R', 'B']) this.mats[k].side.emissiveIntensity = 0.45 + beatPulse * 0.5;
    // létající výseče
    for (const p of this.pieces) {
      if (!p.active) continue;
      p.t += dt;
      if (p.t >= p.life) {
        p.active = false;
        p.m.visible = false;
        continue;
      }
      p.v.y -= 6 * dt;
      p.v.multiplyScalar(1 - dt * 0.8);
      p.m.position.addScaledVector(p.v, dt);
      _e.set(p.w.x * dt, p.w.y * dt, p.w.z * dt);
      _q.setFromEuler(_e);
      p.m.quaternion.multiply(_q);
      const k = p.t / p.life;
      p.m.scale.setScalar(p.s * (k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3));
    }
  }

  // r = zbývající čas do úderu, pop = náběh 0..1
  animateTarget(o, r, pop, perfectWin, dt) {
    o.spin.rotation.z += dt * 0.7;
    // jemné kolébání během letu
    o.g.rotation.x = Math.sin(this.time * 2.3 + o.wob) * 0.12;
    o.g.rotation.y = Math.cos(this.time * 1.9 + o.wob) * 0.12;
    const near = Math.max(0, 1 - Math.max(0, r) / 1.0);
    const perfect = Math.abs(r) < perfectWin ? 1 : 0;
    o.glow.material.opacity = (0.25 + near * 0.35 + perfect * 0.3 + this.beatPulse * 0.15) * pop;
    o.glow.scale.setScalar(R * (3.0 + near * 0.8 + perfect * 0.8) * o.base);
    if (o.wing.visible) o.wing.position.multiplyScalar(1); // (křídlo drží vedle terče)
  }

  // rozpad terče na výseče
  shatter(o, dir, power) {
    o.g.updateMatrixWorld(true);
    for (const w of o.wedges) {
      const p = this.pieces[this.pi];
      this.pi = (this.pi + 1) % this.pieces.length;
      p.active = true;
      p.t = 0;
      p.life = 0.85 + Math.random() * 0.35;
      p.m.material = w.material;
      p.m.geometry = w.geometry;
      w.getWorldPosition(p.m.position);
      w.getWorldQuaternion(p.m.quaternion);
      p.s = o.g.scale.x;
      p.m.scale.setScalar(p.s);
      p.m.visible = true;
      // směr ven od středu disku
      _v.copy(w.position).normalize().applyQuaternion(p.m.quaternion);
      const sp = 1.6 + Math.random() * 1.6 + power * 1.5;
      p.v.copy(_v).multiplyScalar(sp).addScaledVector(dir, 2.2 + power * 1.5);
      p.v.y += 0.6 + Math.random() * 0.8;
      p.w.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 10);
    }
  }

  makeBarrier() {
    const g = new THREE.Group();
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xffa830) }, uOp: { value: 0 }, uTime: { value: 0 } },
      vertexShader: barrierVS,
      fragmentShader: barrierFS,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 64, 0, Math.PI), mat);
    g.add(disc);
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.95, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending });
    const arc = new THREE.Mesh(new THREE.TorusGeometry(1, 0.02, 8, 80, Math.PI), edgeMat);
    g.add(arc);
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 2.04, 12), edgeMat);
    line.rotation.z = Math.PI / 2;
    g.add(line);
    for (const x of [-1, 1]) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffc050, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.position.set(x, 0, 0);
      s.scale.setScalar(0.35);
      g.add(s);
    }
    g.visible = false;
    this.scene.add(g);
    return { g, mat, edgeMat, busy: false };
  }

  getBarrier(type) {
    let o = this.barrierPool.find((p) => !p.busy);
    if (!o) {
      o = this.makeBarrier();
      this.barrierPool.push(o);
    }
    o.busy = true;
    o.g.visible = true;
    o.g.scale.setScalar(0.9);
    if (type === 'duck') o.g.rotation.set(0, 0, 0);
    else if (type === 'leanL') o.g.rotation.set(0, 0, -Math.PI / 2);
    else o.g.rotation.set(0, 0, Math.PI / 2);
    this.barrierLook(o, 0, false);
    return o;
  }

  barrierLook(o, op, hit) {
    o.mat.uniforms.uOp.value = op;
    o.mat.uniforms.uTime.value = this.time;
    o.mat.uniforms.uColor.value.setHex(hit ? 0xff3030 : 0xffa830);
    o.edgeMat.color.setHex(hit ? 0xff6060 : 0xffe08a);
    o.edgeMat.opacity = 0.95 * op;
  }

  releaseBarrier(o) {
    o.busy = false;
    o.g.visible = false;
  }
}
