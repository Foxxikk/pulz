// Ruce: klouby z WebXR (nebo od bota), bod úderu, rychlost, výpadky sledování, robotické rukavice, stopy
import * as THREE from 'three';
import { COL } from './config.js';
import { clamp } from './util.js';

export const JOINTS = [
  'wrist',
  'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip',
  'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip',
  'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip',
  'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip',
];
export const J = { WRIST: 0, INDEX_PROX: 6, INDEX_TIP: 9, MIDDLE_PROX: 11, PINKY_PROX: 21 };

// kosti (segmenty) rukavice: [od, do, poloměr]
const BONES = [
  [1, 2, 0.013], [2, 3, 0.011], [3, 4, 0.0095],
  [6, 7, 0.0105], [7, 8, 0.0095], [8, 9, 0.0085],
  [11, 12, 0.011], [12, 13, 0.01], [13, 14, 0.0088],
  [16, 17, 0.0103], [17, 18, 0.0093], [18, 19, 0.0083],
  [21, 22, 0.0092], [22, 23, 0.0085], [23, 24, 0.0078],
];
const KNUCKLES = [2, 3, 6, 7, 8, 11, 12, 13, 16, 17, 18, 21, 22, 23];

const LOST_EXTRAP = 0.15; // s – jak dlouho dopočítávat polohu po ztrátě sledování
const HIST = 12;

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _e = new THREE.Vector3(), _f = new THREE.Vector3(), _g = new THREE.Vector3();

function hexIconTexture(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#121826';
  g.fillRect(0, 0, 128, 128);
  drawHexIcon(g, 64, 64, 46, color);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ikona: šestiúhelník rozdělený na tři kosočtverce (vlastní znak hry)
export function drawHexIcon(g, cx, cy, r, color, glow = true) {
  g.save();
  if (glow) {
    g.shadowColor = color;
    g.shadowBlur = r * 0.5;
  }
  g.fillStyle = color;
  const gap = r * 0.09;
  for (let k = 0; k < 3; k++) {
    const a0 = -Math.PI / 2 + (k * 2 * Math.PI) / 3;
    const pts = [];
    for (let s = -1; s <= 1; s++) {
      const a = a0 + (s * Math.PI) / 3;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    // kosočtverec: střed, dva rohy, vrchol
    const mx = Math.cos(a0) * gap, my = Math.sin(a0) * gap;
    g.beginPath();
    g.moveTo(cx + mx * 1.4, cy + my * 1.4);
    g.lineTo(cx + pts[0][0] * 0.92 + mx, cy + pts[0][1] * 0.92 + my);
    g.lineTo(cx + pts[1][0] * 0.92 + mx, cy + pts[1][1] * 0.92 + my);
    g.lineTo(cx + pts[2][0] * 0.92 + mx, cy + pts[2][1] * 0.92 + my);
    g.closePath();
    g.fill();
  }
  g.restore();
}
export const iconTex = { L: null, R: null };
export function getIconTex(side) {
  if (!iconTex[side]) iconTex[side] = hexIconTexture(side === 'L' ? COL.Lcss : COL.Rcss);
  return iconTex[side];
}

class Glove {
  constructor(scene, side) {
    this.side = side;
    const color = side === 'L' ? COL.L : COL.R;
    this.group = new THREE.Group();
    scene.add(this.group);
    const armor = new THREE.MeshStandardMaterial({ color: 0x3b465c, roughness: 0.38, metalness: 0.45 });
    const plateMat = new THREE.MeshStandardMaterial({ color: 0x8a97b3, roughness: 0.3, metalness: 0.35 });
    this.glowMat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 8, 1);
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.segs = new THREE.InstancedMesh(cyl, armor, BONES.length);
    this.plates = new THREE.InstancedMesh(box, plateMat, BONES.length);
    this.strips = new THREE.InstancedMesh(box, this.glowMat, BONES.length);
    this.knuckles = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), armor, KNUCKLES.length);
    for (const im of [this.segs, this.plates, this.strips, this.knuckles]) {
      im.frustumCulled = false;
      this.group.add(im);
    }
    const cap = new THREE.CapsuleGeometry(0.5, 0.5, 6, 16);
    cap.rotateX(Math.PI / 2); // osa podél Z
    const capX = new THREE.CapsuleGeometry(0.5, 0.5, 4, 12);
    capX.rotateZ(Math.PI / 2); // osa podél X
    this.palm = new THREE.Mesh(cap, armor);
    this.palmTop = new THREE.Mesh(cap, plateMat);
    this.knucklePad = new THREE.Mesh(capX, plateMat);
    this.edgeL = new THREE.Mesh(box, this.glowMat);
    this.edgeR = new THREE.Mesh(box, this.glowMat);
    this.padGlow = new THREE.Mesh(box, this.glowMat);
    this.emblem = new THREE.Mesh(new THREE.CircleGeometry(1, 6), new THREE.MeshBasicMaterial({ map: getIconTex(side), toneMapped: false }));
    this.emblemRim = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.1, 6), this.glowMat);
    this.cuff = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.82, 1, 14, 1, false), armor);
    this.cuffRing = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 6, 24), this.glowMat);
    for (const o of [this.knucklePad, this.edgeL, this.edgeR, this.padGlow]) {
      o.frustumCulled = false;
      this.group.add(o);
    }
    for (const o of [this.palm, this.palmTop, this.emblem, this.emblemRim, this.cuff, this.cuffRing]) {
      o.frustumCulled = false;
      this.group.add(o);
    }
    this.group.visible = false;
    this.flash = 0;
    this.baseColor = new THREE.Color(color);
  }

  update(h, dt) {
    const vis = h.alpha > 0.02;
    this.group.visible = vis;
    if (!vis) return;
    const p = h.joints;
    const back = h.back;
    // články prstů
    for (let i = 0; i < BONES.length; i++) {
      const [ia, ib, r0] = BONES[i];
      _a.fromArray(p, ia * 3);
      _b.fromArray(p, ib * 3);
      _d.subVectors(_b, _a);
      const len = _d.length() || 0.001;
      _y.copy(_d).multiplyScalar(1 / len);
      // osa X kolmo na kost a „hřbet“
      _x.crossVectors(_y, back);
      if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0);
      _x.normalize();
      _z.crossVectors(_x, _y).normalize();
      _m.makeBasis(_x, _y, _z);
      _q.setFromRotationMatrix(_m);
      const r = r0 * 1.15;
      _c.addVectors(_a, _b).multiplyScalar(0.5);
      _s.set(r, len, r);
      _m.compose(_c, _q, _s);
      this.segs.setMatrixAt(i, _m);
      // pancéřová destička na hřbetu (lokální +Z ~ hřbet)
      _a.copy(_c).addScaledVector(_z, r * 0.75);
      _s.set(r * 2.05, len * 0.86, r * 0.75);
      _m.compose(_a, _q, _s);
      this.plates.setMatrixAt(i, _m);
      _a.addScaledVector(_z, r * 0.42);
      _s.set(r * 0.55, len * 0.62, r * 0.25);
      _m.compose(_a, _q, _s);
      this.strips.setMatrixAt(i, _m);
    }
    for (let i = 0; i < KNUCKLES.length; i++) {
      _a.fromArray(p, KNUCKLES[i] * 3);
      const r = (i < 2 ? 0.0135 : 0.0118) * 1.12;
      _s.set(r, r, r);
      _m.compose(_a, _q.identity(), _s);
      this.knuckles.setMatrixAt(i, _m);
    }
    this.segs.instanceMatrix.needsUpdate = true;
    this.plates.instanceMatrix.needsUpdate = true;
    this.strips.instanceMatrix.needsUpdate = true;
    this.knuckles.instanceMatrix.needsUpdate = true;

    // dlaň: od zápěstí ke kloubům prostředníku
    const W = _a.fromArray(p, 0);
    const M = _b.fromArray(p, J.MIDDLE_PROX * 3);
    const I = _e.fromArray(p, J.INDEX_PROX * 3);
    const P = _f.fromArray(p, J.PINKY_PROX * 3);
    const fwd = _d.subVectors(M, W);
    const plen = fwd.length() || 0.08;
    fwd.multiplyScalar(1 / plen);
    _x.crossVectors(back, fwd).normalize(); // do strany
    const yb = _y.crossVectors(fwd, _x).normalize(); // hřbet
    _m.makeBasis(_x, yb, fwd);
    _q.setFromRotationMatrix(_m);
    const width = I.distanceTo(P) * 1.15 + 0.014;
    _c.addVectors(W, M).multiplyScalar(0.5).addScaledVector(fwd, -0.004);
    this.palm.position.copy(_c);
    this.palm.quaternion.copy(_q);
    this.palm.scale.set(width, 0.036, (plen * 1.12) / 1.5);
    this.palmTop.position.copy(_c).addScaledVector(yb, 0.0135).addScaledVector(fwd, -0.004);
    this.palmTop.quaternion.copy(_q);
    this.palmTop.scale.set(width * 0.84, 0.014, (plen * 0.86) / 1.5);
    // svítící hrany po stranách hřbetu
    for (const [o, sg] of [[this.edgeL, -1], [this.edgeR, 1]]) {
      o.position.copy(_c).addScaledVector(_x, sg * width * 0.47).addScaledVector(yb, 0.01);
      o.quaternion.copy(_q);
      o.scale.set(0.0035, 0.004, plen * 0.62);
    }
    // chránič kloubů (jako boxerská rukavice)
    _e.addVectors(I, P).multiplyScalar(0.5);
    this.knucklePad.position.copy(_e).addScaledVector(yb, 0.008).addScaledVector(fwd, 0.002);
    this.knucklePad.quaternion.copy(_q);
    this.knucklePad.scale.set(width / 1.5 * 1.02, 0.026, 0.03);
    this.padGlow.position.copy(this.knucklePad.position).addScaledVector(yb, 0.0125);
    this.padGlow.quaternion.copy(_q);
    this.padGlow.scale.set(width * 0.6, 0.003, 0.005);
    // znak na hřbetu
    this.emblem.position.copy(_c).addScaledVector(yb, 0.0212).addScaledVector(fwd, -0.006);
    _s.copy(_x).negate();
    _m.makeBasis(_s, fwd, yb);
    this.emblem.quaternion.setFromRotationMatrix(_m);
    this.emblem.rotateZ(Math.PI / 6);
    this.emblem.scale.setScalar(0.019);
    this.emblemRim.position.copy(this.emblem.position).addScaledVector(yb, 0.0005);
    this.emblemRim.quaternion.copy(this.emblem.quaternion);
    this.emblemRim.scale.setScalar(0.019);
    // manžeta na zápěstí
    _m.makeBasis(_x, fwd, _g.copy(yb).negate());
    _q.setFromRotationMatrix(_m);
    this.cuff.position.copy(W).addScaledVector(fwd, -0.024);
    this.cuff.quaternion.copy(_q);
    this.cuff.scale.set(0.033, 0.045, 0.028);
    this.cuffRing.position.copy(W).addScaledVector(fwd, -0.005);
    _m.makeBasis(_x, yb, fwd);
    this.cuffRing.quaternion.setFromRotationMatrix(_m);
    this.cuffRing.scale.set(0.037, 0.031, 0.037);

    // záblesk při zásahu
    this.flash = Math.max(0, this.flash - dt * 4);
    this.glowMat.color.copy(this.baseColor).multiplyScalar(1 + this.flash * 1.5);
  }
}

class Trail {
  constructor(scene, side) {
    this.n = 18;
    this.pts = [];
    for (let i = 0; i < this.n; i++) this.pts.push(new THREE.Vector3());
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.n * 2 * 3);
    this.alpha = new Float32Array(this.n * 2);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    const idx = [];
    for (let i = 0; i < this.n - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(side === 'L' ? COL.L : COL.R) }, uOp: { value: 0 } },
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uColor; uniform float uOp; varying float vA; void main(){ gl_FragColor = vec4(uColor * 1.6 + vec3(0.25), vA * uOp); }',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.reset = true;
    this.op = 0;
  }
  update(h, camPos, dt) {
    if (!h.valid) {
      this.reset = true;
      this.op = Math.max(0, this.op - dt * 6);
      this.mat.uniforms.uOp.value = this.op;
      return;
    }
    if (this.reset) {
      for (const p of this.pts) p.copy(h.fist);
      this.reset = false;
    }
    for (let i = this.n - 1; i > 0; i--) this.pts[i].copy(this.pts[i - 1]);
    this.pts[0].copy(h.fist);
    const target = clamp((h.speed - 1.4) / 2.2, 0, 1);
    this.op += (target - this.op) * Math.min(1, dt * (target > this.op ? 20 : 6));
    this.mat.uniforms.uOp.value = this.op * h.alpha;
    for (let i = 0; i < this.n; i++) {
      const p = this.pts[i];
      const q = this.pts[Math.min(this.n - 1, i + 1)];
      const r = this.pts[Math.max(0, i - 1)];
      _d.subVectors(r, q);
      _a.subVectors(camPos, p);
      _b.crossVectors(_d, _a);
      if (_b.lengthSq() < 1e-9) _b.set(0, 1, 0);
      _b.normalize();
      const w = 0.018 * (1 - i / this.n);
      this.pos[i * 6] = p.x + _b.x * w;
      this.pos[i * 6 + 1] = p.y + _b.y * w;
      this.pos[i * 6 + 2] = p.z + _b.z * w;
      this.pos[i * 6 + 3] = p.x - _b.x * w;
      this.pos[i * 6 + 4] = p.y - _b.y * w;
      this.pos[i * 6 + 5] = p.z - _b.z * w;
      const a = Math.pow(1 - i / (this.n - 1), 1.6) * 0.85;
      this.alpha[i * 2] = a;
      this.alpha[i * 2 + 1] = a;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.alpha.needsUpdate = true;
  }
}

export class HandState {
  constructor(side) {
    this.side = side;
    this.joints = new Float32Array(75);
    this.tracked = false; // data z tohoto snímku
    this.valid = false; // použitelná poloha (i dopočítaná)
    this.extrap = false;
    this.lostFor = 99;
    this.fist = new THREE.Vector3();
    this.prevFist = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.speed = 0;
    this.tip = new THREE.Vector3();
    this.prevTip = new THREE.Vector3();
    this.back = new THREE.Vector3(0, 1, 0);
    this.fwd = new THREE.Vector3(0, 0, -1);
    this.wrist = new THREE.Vector3();
    this.hist = [];
    for (let i = 0; i < HIST; i++) this.hist.push({ t: -1, x: 0, y: 0, z: 0 });
    this.hi = 0;
    this.alpha = 0;
    this.fresh = false;
    this.lastSample = new THREE.Vector3(1e9, 0, 0);
  }
}

export class Hands {
  constructor(scene) {
    this.L = new HandState('L');
    this.R = new HandState('R');
    this.gloves = { L: new Glove(scene, 'L'), R: new Glove(scene, 'R') };
    this.trails = { L: new Trail(scene, 'L'), R: new Trail(scene, 'R') };
    this.controllersSeen = false;
    this.anyHandSeen = false;
  }

  get(side) {
    return side === 'L' ? this.L : this.R;
  }

  // začátek snímku: nic není sledováno, dokud to nepotvrdí zdroj
  begin() {
    this.L.fresh = false;
    this.R.fresh = false;
  }

  fromXR(frame, refSpace, session) {
    this.controllersSeen = false;
    for (const src of session.inputSources) {
      if (!src.hand) {
        if (src.gamepad) this.controllersSeen = true;
        continue;
      }
      const side = src.handedness === 'left' ? 'L' : src.handedness === 'right' ? 'R' : null;
      if (!side) continue;
      const h = this.get(side);
      let ok = true;
      for (let i = 0; i < 25; i++) {
        const js = src.hand.get(JOINTS[i]);
        const pose = js && frame.getJointPose(js, refSpace);
        if (!pose) {
          ok = false;
          break;
        }
        const p = pose.transform.position;
        h.joints[i * 3] = p.x;
        h.joints[i * 3 + 1] = p.y;
        h.joints[i * 3 + 2] = p.z;
      }
      if (ok) {
        h.fresh = true;
        this.anyHandSeen = true;
      }
    }
  }

  // syntetické klouby (bot, testy)
  setSynthetic(side, joints) {
    const h = this.get(side);
    h.joints.set(joints);
    h.fresh = true;
  }

  end(t, dt, camPos) {
    for (const h of [this.L, this.R]) this.process(h, t, dt);
    for (const side of ['L', 'R']) {
      const h = this.get(side);
      this.gloves[side].update(h, dt);
      this.trails[side].update(h, camPos, dt);
    }
  }

  process(h, t, dt) {
    h.prevFist.copy(h.fist);
    h.prevTip.copy(h.tip);
    const p = h.joints;
    if (h.fresh) {
      const wasValid = h.valid;
      // bod úderu: klouby ukazováčku a prostředníku, 2 cm ve směru prstů
      _a.fromArray(p, J.INDEX_PROX * 3);
      _b.fromArray(p, J.MIDDLE_PROX * 3);
      _c.fromArray(p, 0);
      h.wrist.copy(_c);
      h.fwd.addVectors(_a, _b).multiplyScalar(0.5).sub(_c).normalize();
      // hřbet ruky
      _d.fromArray(p, J.PINKY_PROX * 3).sub(_c);
      _a.sub(_c);
      if (h.side === 'R') h.back.crossVectors(_d, _a);
      else h.back.crossVectors(_a, _d);
      if (h.back.lengthSq() < 1e-8) h.back.set(0, 1, 0);
      h.back.normalize();
      _a.fromArray(p, J.INDEX_PROX * 3);
      h.fist.addVectors(_a, _b).multiplyScalar(0.5).addScaledVector(h.fwd, 0.02);
      h.tip.fromArray(p, J.INDEX_TIP * 3);
      if (h.hist[h.hi].t > t) for (const s of h.hist) s.t = -1; // čas šel zpět (nový trénink)
      if (!wasValid) {
        h.prevFist.copy(h.fist);
        h.prevTip.copy(h.tip);
        for (const s of h.hist) s.t = -1;
      }
      h.valid = true;
      h.extrap = false;
      h.lostFor = 0;
      // historie jen při nové poloze (sledování může běžet pomaleji než vykreslování)
      if (h.fist.distanceToSquared(h.lastSample) > 1e-10) {
        h.lastSample.copy(h.fist);
        h.hi = (h.hi + 1) % HIST;
        const s = h.hist[h.hi];
        s.t = t;
        s.x = h.fist.x;
        s.y = h.fist.y;
        s.z = h.fist.z;
      }
      // rychlost z okna ~50 ms
      const cur = h.hist[h.hi];
      let ref = null;
      for (let k = 1; k < HIST; k++) {
        const s = h.hist[(h.hi - k + HIST) % HIST];
        if (s.t < 0) break;
        ref = s;
        if (cur.t - s.t >= 0.045) break;
      }
      if (ref && cur.t - ref.t > 0.004) {
        const inv = 1 / (cur.t - ref.t);
        h.vel.set((cur.x - ref.x) * inv, (cur.y - ref.y) * inv, (cur.z - ref.z) * inv);
      } else if (!ref) h.vel.set(0, 0, 0);
      h.speed = h.vel.length();
      h.alpha = Math.min(1, h.alpha + dt * 8);
    } else {
      h.lostFor += dt;
      if (h.valid && h.lostFor < LOST_EXTRAP) {
        // dopočítat polohu z poslední rychlosti (rychlé údery Quest často ztratí)
        h.extrap = true;
        _a.copy(h.vel).multiplyScalar(dt);
        h.fist.add(_a);
        h.tip.add(_a);
        for (let i = 0; i < 25; i++) {
          p[i * 3] += _a.x;
          p[i * 3 + 1] += _a.y;
          p[i * 3 + 2] += _a.z;
        }
        h.vel.multiplyScalar(Math.pow(0.82, dt * 60));
        h.speed = h.vel.length();
      } else {
        h.valid = false;
        h.extrap = false;
        h.speed = 0;
        h.vel.set(0, 0, 0);
      }
      if (h.lostFor > 0.4) h.alpha = Math.max(0, h.alpha - dt * 5);
    }
  }
}

// Šablona pěsti (pravá ruka; lokálně: -Z dopředu ke kloubům, +Y hřbet, +X doprava; malíček +X)
const FIST_R = [
  [0, 0, 0],
  [-0.026, -0.012, -0.012], [-0.044, -0.022, -0.04], [-0.036, -0.036, -0.064], [-0.016, -0.04, -0.078],
  [-0.019, 0, -0.022], [-0.03, 0, -0.09], [-0.028, -0.035, -0.103], [-0.026, -0.047, -0.083], [-0.024, -0.04, -0.07],
  [-0.004, 0.002, -0.022], [-0.008, 0.002, -0.094], [-0.007, -0.035, -0.107], [-0.006, -0.048, -0.086], [-0.005, -0.041, -0.072],
  [0.01, 0, -0.021], [0.013, 0, -0.088], [0.014, -0.033, -0.1], [0.013, -0.045, -0.081], [0.012, -0.039, -0.068],
  [0.022, -0.003, -0.019], [0.031, -0.005, -0.077], [0.032, -0.033, -0.088], [0.03, -0.043, -0.073], [0.028, -0.038, -0.062],
];

// Vytvoří světové klouby pěsti: pozice bodu úderu `fistPos`, směr dopředu `fwd`, hřbet `up`
export function fistJoints(side, fistPos, fwd, up, out) {
  const f = _z.copy(fwd).normalize();
  const u = _y.copy(up);
  u.addScaledVector(f, -u.dot(f)).normalize();
  const r = _x.crossVectors(f, u).normalize(); // vpravo (pro -Z dopředu a +Y nahoru: f×u = +X)
  const mir = side === 'L' ? -1 : 1;
  // bod úderu v šabloně ≈ (−0.019, 0.001, −0.112)
  const ox = -0.019 * mir, oy = 0.001, oz = -0.112;
  for (let i = 0; i < 25; i++) {
    const [x0, y0, z0] = FIST_R[i];
    const x = x0 * mir - ox, y = y0 - oy, z = z0 - oz;
    // lokální: +X = r, +Y = u, -Z = f
    out[i * 3] = fistPos.x + r.x * x + u.x * y - f.x * z;
    out[i * 3 + 1] = fistPos.y + r.y * x + u.y * y - f.y * z;
    out[i * 3 + 2] = fistPos.z + r.z * x + u.z * y - f.z * z;
  }
  return out;
}
