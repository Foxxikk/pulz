// Létající 3D terče (ve stylu boxovacích fitness her): tmavý zkosený disk složený z výsečí,
// spáry mezi výsečemi svítí barvou ruky, uprostřed ikona. Při zásahu se výseče rozletí.
// Směr hooku/zvedáku ukazuje bílé 3D „křídlo“. Finále = velký zlatý terč.
// Bariéry: energetické štíty („Měsíc“).
import * as THREE from 'three';
import { COL, GEO, BAR } from './config.js';
import { drawHexIcon } from './hands.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const R = GEO.targetR;
const SEG = 6;
const DEPTH = 0.056;
const DOME = 0.055; // výška vypouklého čela
const TILT = 0.72; // natočení hooku/zvedáku proti pěsti (rad)
const _goldC = new THREE.Color(0xffc23a), _whiteC = new THREE.Color(1, 1, 1);
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

const wallVS = `
varying vec2 vP;
void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
// zeď: sklo s šestiúhelníkovou mřížkou, výstražné pruhy u hrany, skenovací linky
const wallFS = `
uniform vec3 uColor; uniform float uOp; uniform float uTime;
varying vec2 vP;
void main(){
  float y = vP.y + 1.15;          // 0 = hrana u hráče, 2.3 = vnější
  vec2 q = vP * vec2(7.0, 8.0);
  q.x += mod(floor(q.y), 2.0) * 0.5;
  vec2 f = abs(fract(q) - 0.5);
  float hex = smoothstep(0.40, 0.48, max(f.x * 1.15, f.y));
  float stripes = step(0.5, fract((vP.x - vP.y) * 3.0 + uTime * 0.8)) * (1.0 - smoothstep(0.0, 0.28, y));
  float scan = smoothstep(0.03, 0.0, abs(fract(y * 0.6 - uTime * 0.7) - 0.5));
  float edgeGlow = 1.0 - smoothstep(0.0, 0.18, y);
  float a = 0.18 + hex * 0.22 + stripes * 0.45 + scan * 0.25 + edgeGlow * 0.35;
  vec3 c = mix(uColor, vec3(1.0, 0.85, 0.3), stripes * 0.8);
  gl_FragColor = vec4(c * (0.8 + edgeGlow * 0.8), clamp(a, 0.0, 0.9) * uOp);
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
    this.sideBase = { L: this.mats.L.side.emissive.clone(), R: this.mats.R.side.emissive.clone() };
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
    const core = new THREE.Mesh(this.coreGeo, this.mats.L.core.clone()); // vlastní materiál – jádro se „nabíjí“
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
    o.core.material.color.copy(m.core.color);
    o.coreBase = m.core.color;
    o.glow.material.color.copy(m.glow.color);
    o.g.scale.setScalar(1);
    o.spin.rotation.set(0, 0, Math.random() * 6.28);
    o.wob = Math.random() * 6;
    o.base = type === 'finale' ? 1.7 : type === 'boss' ? 2.3 : 1;
    for (const w of o.wedges) w.visible = true;
    o.chipped = 0;
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

  // ---------- bomba (netrefit!) ----------
  makeBomb() {
    const g = new THREE.Group();
    if (!this.bombMats) {
      this.bombMats = {
        body: new THREE.MeshStandardMaterial({ color: 0x1a0507, metalness: 0.8, roughness: 0.25, emissive: 0xff1030, emissiveIntensity: 0.25 }),
        spike: new THREE.MeshStandardMaterial({ color: 0x2a0a0c, metalness: 0.7, roughness: 0.3, emissive: 0xff2040, emissiveIntensity: 0.9 }),
      };
      this.bombBody = new THREE.IcosahedronGeometry(R * 0.72, 1);
      this.bombSpike = new THREE.ConeGeometry(R * 0.13, R * 0.55, 8);
      this.bombSpike.translate(0, R * 0.72 + R * 0.2, 0);
    }
    const body = new THREE.Mesh(this.bombBody, this.bombMats.body);
    g.add(body);
    const ico = new THREE.IcosahedronGeometry(1, 0).attributes.position;
    const seen = new Set();
    for (let i = 0; i < ico.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(ico, i).normalize();
      const key = v.toArray().map((x) => x.toFixed(2)).join();
      if (seen.has(key)) continue;
      seen.add(key);
      const sp = new THREE.Mesh(this.bombSpike, this.bombMats.spike);
      sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
      g.add(sp);
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xff2040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 }));
    glow.scale.setScalar(R * 3.2);
    g.add(glow);
    g.visible = false;
    this.scene.add(g);
    return { g, glow, busy: false, bomb: true, base: 1, wob: Math.random() * 6 };
  }
  getBomb() {
    this.bombs = this.bombs || [];
    let o = this.bombs.find((b) => !b.busy);
    if (!o) {
      o = this.makeBomb();
      this.bombs.push(o);
    }
    o.busy = true;
    o.g.visible = true;
    o.g.scale.setScalar(1);
    return o;
  }
  animateBomb(o, r, dt) {
    o.g.rotation.x += dt * 1.3;
    o.g.rotation.y += dt * 1.9;
    // varovné blikání, rychlejší při přiblížení
    const f = 3 + Math.max(0, 2 - Math.max(0, r)) * 5;
    const bl = 0.5 + 0.5 * Math.sin(this.time * f * 6.28);
    o.glow.material.opacity = 0.35 + bl * 0.5;
    this.bombMats.spike.emissiveIntensity = 0.6 + bl * 0.8;
  }

  // ---------- světelné spojení dvojitého terče ----------
  getLink() {
    this.links = this.links || [];
    let o = this.links.find((l) => !l.busy);
    if (!o) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      this.scene.add(m);
      o = { m, busy: false };
      this.links.push(o);
    }
    o.busy = true;
    o.m.visible = true;
    return o;
  }
  placeLink(o, a, b, op) {
    o.m.position.addVectors(a, b).multiplyScalar(0.5);
    _v.subVectors(b, a);
    const len = _v.length();
    o.m.scale.set(1 + this.beatPulse, Math.max(0.01, len - R * 1.6), 1 + this.beatPulse);
    o.m.quaternion.setFromUnitVectors(_w.set(0, 1, 0), _v.normalize());
    o.m.material.opacity = op * (0.45 + this.beatPulse * 0.4);
  }
  releaseLink(o) {
    o.busy = false;
    o.m.visible = false;
  }

  // boss: odštípnout jeden díl (každý úder)
  chip(o, dir, power) {
    const w = o.wedges.find((x) => x.visible);
    if (!w) return 0;
    o.g.updateMatrixWorld(true);
    const p = this.pieces[this.pi];
    this.pi = (this.pi + 1) % this.pieces.length;
    p.active = true;
    p.t = 0;
    p.life = 1.1;
    p.m.material = w.material;
    p.m.geometry = w.geometry;
    w.getWorldPosition(p.m.position);
    w.getWorldQuaternion(p.m.quaternion);
    p.s = o.g.scale.x;
    p.m.scale.setScalar(p.s);
    p.m.visible = true;
    _v.copy(w.position).normalize().applyQuaternion(p.m.quaternion);
    p.v.copy(_v).multiplyScalar(2.5 + power * 2).addScaledVector(dir, 2 + power * 2);
    p.v.y += 1;
    p.w.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 8);
    w.visible = false;
    o.chipped++;
    return o.wedges.filter((x) => x.visible).length;
  }

  // nižší kvalita: bez laku na čele terčů (levnější shader)
  setQuality(q) {
    for (const k of ['L', 'R', 'B']) {
      const f = this.mats[k].face;
      const cc = q >= 2 ? 0 : 1;
      if (f.clearcoat !== cc) {
        f.clearcoat = cc;
        f.needsUpdate = true;
      }
    }
  }

  release(o) {
    o.busy = false;
    o.g.visible = false;
  }

  update(dt, beatPulse = 0, mult = 1) {
    this.time += dt;
    this.beatPulse = beatPulse;
    // obruba terčů: pulz do rytmu, s násobičem combo přechází do zlata
    const gold = Math.max(0, (mult - 1) / 3);
    for (const k of ['L', 'R']) {
      const sm = this.mats[k].side;
      sm.emissive.copy(this.sideBase[k]).lerp(_goldC, gold * 0.75);
      sm.emissiveIntensity = 0.45 + beatPulse * 0.5 + gold * 0.5;
    }
    this.mats.B.side.emissiveIntensity = 0.6 + beatPulse * 0.6;
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
  // r = zbývající čas do úderu, pop = náběh 0..1
  animateTarget(o, r, pop, perfectWin, dt) {
    // skládání: zdálky letí terč rozložený na dílky a roztočený, ~0,45 s před úderem dílky zacvaknou
    const sp = Math.min(1, Math.max(0, (r - 0.45) / 0.9));
    const e = sp * sp * (3 - 2 * sp);
    for (let k = 0; k < o.wedges.length; k++) {
      const w = o.wedges[k];
      const c = this.wedgeGeos[k].c;
      w.position.set(c.x * (1 + e * 1.1), c.y * (1 + e * 1.1), (k % 2 ? 0.05 : -0.05) * e);
      w.rotation.set(0, 0, e * (k % 2 ? 0.7 : -0.7));
    }
    o.spin.rotation.z += dt * (0.6 + e * 6);
    o.core.scale.setScalar(1 - e * 0.62);
    // jemné kolébání během letu
    o.g.rotation.x = Math.sin(this.time * 2.3 + o.wob) * 0.12;
    o.g.rotation.y = Math.cos(this.time * 1.9 + o.wob) * 0.12;
    const near = Math.max(0, 1 - Math.max(0, r) / 1.0);
    const perfect = Math.abs(r) < perfectWin ? 1 : 0;
    // jádro se nabíjí a v perfektní chvíli zbělá
    if (o.type === 'boss') {
      // boss: pulzující zlaté srdce, s každým odštípnutým dílem menší
      o.core.material.color.copy(o.coreBase).multiplyScalar(0.55 + this.beatPulse * 0.6);
      o.core.scale.setScalar(0.42 * (1 - o.chipped * 0.06) * (1 + this.beatPulse * 0.12));
    } else {
      const ch = 0.35 + near * near * 1.6 + perfect * 0.8;
      o.core.material.color.copy(o.coreBase).multiplyScalar(ch).lerp(_whiteC, perfect * 0.45);
    }
    // pulz do rytmu
    o.orient.scale.setScalar(1 + this.beatPulse * 0.07 * (1 - e));
    o.glow.material.opacity = (0.25 + near * 0.35 + perfect * 0.3 + this.beatPulse * 0.15) * pop;
    o.glow.scale.setScalar(R * (3.0 + near * 0.8 + perfect * 0.8) * o.base);
    if (o.wing.visible) o.wing.scale.setScalar(0.8 * (1 + this.beatPulse * 0.18));
  }

  // rozpad terče na výseče
  shatter(o, dir, power) {
    o.g.updateMatrixWorld(true);
    for (const w of o.wedges) {
      if (!w.visible) continue;
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
    // půlkruh: energetický štít + silná 3D obruba se zářícími konci
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
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0x3a2200, emissive: 0xffb040, emissiveIntensity: 2.2, metalness: 0.6, roughness: 0.25, transparent: true, opacity: 1 });
    const arc = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 10, 96, Math.PI), edgeMat);
    g.add(arc);
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.08, 14), edgeMat);
    line.rotation.z = Math.PI / 2;
    g.add(line);
    const glows = [];
    for (const x of [-1, 1, 0]) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffc050, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      sp.position.set(x, x === 0 ? 1 : 0, 0);
      sp.scale.setScalar(x === 0 ? 0.3 : 0.45);
      g.add(sp);
      glows.push(sp);
    }
    // zeď: pevný panel s rámem (zobrazí se jen u typu wall*)
    const wall = new THREE.Group();
    const wallMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xff3d6e) }, uOp: { value: 0 }, uTime: { value: 0 } },
      vertexShader: wallVS,
      fragmentShader: wallFS,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const WH = 2.3; // jak daleko do strany zeď sahá
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(3.0, WH, 1, 1), wallMat);
    panel.position.y = WH / 2;
    wall.add(panel);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x2a0610, emissive: 0xff3d6e, emissiveIntensity: 2, metalness: 0.7, roughness: 0.3, transparent: true });
    const beam = (w, h, x, y) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), frameMat);
      m.position.set(x, y, 0);
      wall.add(m);
    };
    beam(3.0, 0.08, 0, 0); // hrana u hráče (nejdůležitější)
    beam(3.0, 0.05, 0, WH);
    beam(0.05, WH, -1.5, WH / 2);
    beam(0.05, WH, 1.5, WH / 2);
    const wallGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xff4070, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    wallGlow.scale.set(3.4, 0.5, 1);
    wall.add(wallGlow);
    g.add(wall);
    g.visible = false;
    this.scene.add(g);
    return { g, mat, edgeMat, disc, arc, line, glows, wall, wallMat, frameMat, busy: false, kind: 'arc' };
  }

  getBarrier(type, ang) {
    let o = this.barrierPool.find((p) => !p.busy);
    if (!o) {
      o = this.makeBarrier();
      this.barrierPool.push(o);
    }
    o.busy = true;
    o.g.visible = true;
    const b = BAR[type] || BAR.duck;
    if (ang == null) ang = b.ang;
    o.kind = b.kind;
    const isWall = b.kind === 'wall';
    o.disc.visible = o.arc.visible = o.line.visible = !isWall;
    for (const sp of o.glows) sp.visible = !isWall;
    o.wall.visible = isWall;
    o.g.scale.setScalar(isWall ? 1 : 0.9);
    o.g.rotation.set(0, 0, ang);
    this.barrierLook(o, 0, false);
    return o;
  }

  barrierLook(o, op, hit) {
    if (o.kind === 'wall') {
      o.wallMat.uniforms.uOp.value = op;
      o.wallMat.uniforms.uTime.value = this.time;
      o.wallMat.uniforms.uColor.value.setHex(hit ? 0xff2020 : 0xff3d6e);
      o.frameMat.opacity = op;
      o.frameMat.emissiveIntensity = 1.6 + this.beatPulse * 1.5;
      return;
    }
    o.mat.uniforms.uOp.value = op;
    o.mat.uniforms.uTime.value = this.time;
    o.mat.uniforms.uColor.value.setHex(hit ? 0xff3030 : 0xffa830);
    o.edgeMat.emissive.setHex(hit ? 0xff4040 : 0xffb040);
    o.edgeMat.emissiveIntensity = 1.8 + this.beatPulse * 1.6;
    o.edgeMat.opacity = op;
    for (const sp of o.glows) sp.material.opacity = op * (0.7 + this.beatPulse * 0.3);
  }

  releaseBarrier(o) {
    o.busy = false;
    o.g.visible = false;
  }
}
