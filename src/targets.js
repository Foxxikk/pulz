// Létající 3D terče (ve stylu boxovacích fitness her): tmavý zkosený disk složený z výsečí,
// spáry mezi výsečemi svítí barvou ruky, uprostřed ikona. Při zásahu se výseče rozletí.
// Směr hooku/zvedáku ukazuje bílé 3D „křídlo“. Finále = velký zlatý terč.
// Bariéry: energetické štíty („Měsíc“).
import * as THREE from 'three';
import { COL, GEO } from './config.js';
import { drawHexIcon } from './hands.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const R = GEO.targetR;
const SEG = 6;
const DEPTH = 0.046;
const DOME = 0.042; // výška vypouklého čela
const TILT = 0.72; // natočení hooku/zvedáku proti pěsti (rad)
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _e = new THREE.Euler();

function faceTexture(color, gold) {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const col = new THREE.Color(color);
  const css = (k, a = 1) => `rgba(${Math.round(Math.min(1, col.r * k) * 255)},${Math.round(Math.min(1, col.g * k) * 255)},${Math.round(Math.min(1, col.b * k) * 255)},${a})`;
  // barevné tělo: tmavší střed → sytá barva → světlejší okraj
  const bg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  bg.addColorStop(0, css(0.35));
  bg.addColorStop(0.42, css(0.62));
  bg.addColorStop(0.78, css(0.95));
  bg.addColorStop(0.86, css(0.28));
  bg.addColorStop(0.9, css(1.15));
  bg.addColorStop(1, css(0.5));
  g.fillStyle = bg;
  g.fillRect(0, 0, S, S);
  // jemné soustředné drážky
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.lineWidth = 2;
  for (let r = 70; r < S * 0.4; r += 22) {
    g.beginPath();
    g.arc(S / 2, S / 2, r, 0, Math.PI * 2);
    g.stroke();
  }
  // tmavý terčík pod ikonou
  g.fillStyle = gold ? 'rgba(40,24,0,0.55)' : 'rgba(5,10,24,0.55)';
  g.beginPath();
  g.arc(S / 2, S / 2, S * 0.27, 0, Math.PI * 2);
  g.fill();
  const lite = col.clone().lerp(new THREE.Color(1, 1, 1), 0.55);
  drawHexIcon(g, S / 2, S / 2, S * 0.17, '#' + lite.getHexString());
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  // UV čela = souřadnice v metrech → přepočet na 0..1
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

// výseč k disku: plášť (vytažený tvar se zkosením) + vypouklé čelo (kopule s hladkými normálami).
// Postavená přímo na svém místě (UV čela = souvislý obraz přes celý disk),
// geometrie posunutá tak, aby se kus po zásahu točil kolem vlastního těžiště.
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
  const d = DEPTH - 0.012;
  const slab = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.007, bevelSegments: 3, curveSegments: 10 });
  slab.translate(0, 0, -d / 2);
  slab.computeVertexNormals();
  slab.clearGroups();
  // kopule: polární mřížka nad čelem pláště
  const zf = d / 2 + 0.006;
  const NR = 7, NA = 10;
  const pos = [], nor = [], uv = [], idx = [];
  const rIn = ri + 0.007, rOut = ro + 0.004;
  for (let i = 0; i <= NR; i++) {
    const r = rIn + (rOut - rIn) * (i / NR);
    const ga = gap / Math.max(r, 0.02);
    for (let j = 0; j <= NA; j++) {
      const th = a - half + ga + (2 * half - 2 * ga) * (j / NA);
      const x = Math.cos(th) * r, y = Math.sin(th) * r;
      const q = r / (R + 0.004);
      const z = zf + DOME * (1 - q * q) - 0.001;
      pos.push(x, y, z);
      const nx = (2 * DOME * x) / ((R + 0.004) * (R + 0.004)), ny = (2 * DOME * y) / ((R + 0.004) * (R + 0.004));
      const l = Math.hypot(nx, ny, 1);
      nor.push(nx / l, ny / l, 1 / l);
      uv.push(x, y);
    }
  }
  for (let i = 0; i < NR; i++)
    for (let j = 0; j < NA; j++) {
      const p0 = i * (NA + 1) + j, p1 = p0 + 1, p2 = p0 + NA + 1, p3 = p2 + 1;
      idx.push(p0, p3, p1, p0, p2, p3);
    }
  // boční „stěna“ kopule u spár (aby výseč byla uzavřené těleso i při rozletu)
  const cap = new THREE.BufferGeometry();
  cap.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  cap.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  cap.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  cap.setIndex(idx);
  const capN = cap.toNonIndexed();
  const g = mergeGeometries([capN, slab], true);
  const c = new THREE.Vector3(Math.cos(a) * R * 0.6, Math.sin(a) * R * 0.6, 0);
  g.translate(-c.x, -c.y, 0);
  g.computeBoundingSphere();
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
        // lakované vypouklé čelo: odlesky z okolí běhají po kopuli
        face: new THREE.MeshPhysicalMaterial({ map: faceTexture(css, gold), metalness: 0.15, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.5, emissive: c.clone(), emissiveIntensity: 0.14 }),
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
    const orient = new THREE.Group(); // natočení čela proti přicházející pěsti
    g.add(orient);
    const spin = new THREE.Group();
    orient.add(spin);
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
    orient.add(glow);
    const wing = new THREE.Mesh(this.wingGeo, this.wingMat);
    wing.scale.setScalar(0.8);
    g.add(wing);
    g.visible = false;
    this.scene.add(g);
    return { g, orient, spin, wedges, core, glow, wing, busy: false, side: 'L', type: 'jab', wob: Math.random() * 6 };
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
    // čelo terče míří proti směru úderu (hook ze strany, zvedák zespodu), napůl k hráči, ať je čitelné
    const gd = GEO[type] || GEO.jab;
    const dx = gd.dir[0] * (type === 'hook' && side === 'L' ? -1 : 1);
    _v.set(-dx, -gd.dir[1], 0);
    if (_v.lengthSq() > 0) {
      _v.normalize().multiplyScalar(Math.sin(TILT));
      _v.z = Math.cos(TILT);
      o.orient.quaternion.setFromUnitVectors(_w.set(0, 0, 1), _v);
    } else o.orient.quaternion.identity();
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
