// Létající objekty: kovový terč se zkosením a odrazy okolí, svítící obruč, záře, časovací kruh a závorky,
// ukazatel směru úderu; energetické bariéry („Měsíc“) s animovaným shaderem.
import * as THREE from 'three';
import { COL, GEO } from './config.js';
import { drawHexIcon } from './hands.js';

const R = GEO.targetR;

// ---------- textury ----------
function faceTexture(color) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const bg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  bg.addColorStop(0, '#1c2740');
  bg.addColorStop(0.7, '#0c1220');
  bg.addColorStop(1, '#05080f');
  g.fillStyle = bg;
  g.fillRect(0, 0, S, S);
  // jemné soustředné drážky
  g.strokeStyle = 'rgba(255,255,255,0.05)';
  g.lineWidth = 2;
  for (let r = 30; r < S / 2; r += 14) {
    g.beginPath();
    g.arc(S / 2, S / 2, r, 0, Math.PI * 2);
    g.stroke();
  }
  // vnitřní svítící kroužek
  g.save();
  g.shadowColor = color;
  g.shadowBlur = 18;
  g.strokeStyle = color;
  g.lineWidth = 5;
  g.beginPath();
  g.arc(S / 2, S / 2, S * 0.4, 0, Math.PI * 2);
  g.stroke();
  g.restore();
  drawHexIcon(g, S / 2, S / 2, S * 0.27, color);
  // odlesk ikony (bílé jádro)
  g.globalAlpha = 0.35;
  drawHexIcon(g, S / 2, S / 2, S * 0.17, '#ffffff', false);
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function glowTexture() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.14)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// profil terče (rotační těleso) – zkosené hrany, mírně vypouklá čelní strana
function bodyGeometry() {
  const pts = [
    [0.0, -0.034],
    [R * 0.78, -0.034],
    [R * 0.95, -0.028],
    [R * 1.0, -0.016],
    [R * 1.0, 0.016],
    [R * 0.97, 0.028],
    [R * 0.88, 0.036],
    [R * 0.7, 0.04],
    [0.0, 0.042],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 48);
  g.rotateX(Math.PI / 2); // osa rotace = Z, čelo míří na hráče (+Z)
  return g;
}

function wingShape() {
  const s = new THREE.Shape();
  s.absarc(0, 0, 0.11, -Math.PI * 0.42, Math.PI * 0.42, false);
  s.absarc(0.045, 0, 0.085, Math.PI * 0.45, -Math.PI * 0.45, true);
  return new THREE.ShapeGeometry(s, 20);
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
  // šikmé výstražné pruhy, které se posouvají
  float stripes = smoothstep(0.35, 0.65, abs(fract((vP.x + vP.y) * 4.0 - uTime * 1.6) - 0.5) * 2.0);
  // šestiúhelníková mřížka (energetický štít)
  vec2 q = vP * 9.0;
  q.x += mod(floor(q.y), 2.0) * 0.5;
  vec2 f = abs(fract(q) - 0.5);
  float grid = smoothstep(0.42, 0.5, max(f.x, f.y));
  float edge = smoothstep(0.86, 1.0, r) + smoothstep(0.06, 0.0, vP.y);
  float scan = smoothstep(0.0, 0.04, abs(fract(r * 1.5 - uTime * 0.9) - 0.5) - 0.44);
  float a = 0.14 + stripes * 0.12 + grid * 0.16 + edge * 0.6 + scan * 0.25;
  gl_FragColor = vec4(uColor * (1.0 + edge * 0.8), clamp(a, 0.0, 1.0) * uOp);
}`;

export class TargetPool {
  constructor(scene) {
    this.scene = scene;
    this.bodyGeo = bodyGeometry();
    this.bodyMat = new THREE.MeshStandardMaterial({ color: 0x141a28, roughness: 0.18, metalness: 0.9, envMapIntensity: 1.3 });
    this.rimGeo = new THREE.TorusGeometry(R * 1.005, 0.0075, 10, 64);
    this.innerGeo = new THREE.TorusGeometry(R * 0.86, 0.004, 6, 64);
    this.rimMat = {
      L: new THREE.MeshBasicMaterial({ color: new THREE.Color(COL.L).multiplyScalar(1.4), toneMapped: false }),
      R: new THREE.MeshBasicMaterial({ color: new THREE.Color(COL.R).multiplyScalar(1.4), toneMapped: false }),
    };
    this.faceGeo = new THREE.CircleGeometry(R * 0.7, 48);
    this.faceMat = {
      L: new THREE.MeshBasicMaterial({ map: faceTexture(COL.Lcss), toneMapped: false }),
      R: new THREE.MeshBasicMaterial({ map: faceTexture(COL.Rcss), toneMapped: false }),
    };
    this.glowTex = glowTexture();
    this.bracketGeo = new THREE.TorusGeometry(1, 0.06, 4, 24, Math.PI * 0.42);
    this.ringGeo = new THREE.RingGeometry(0.93, 1, 64);
    this.wingGeo = wingShape();
    this.pool = [];
    for (let i = 0; i < 28; i++) this.pool.push(this.make());
    this.barrierPool = [];
    for (let i = 0; i < 6; i++) this.barrierPool.push(this.makeBarrier());
    this.time = 0;
  }

  make() {
    const g = new THREE.Group();
    const spin = new THREE.Group();
    g.add(spin);
    const body = new THREE.Mesh(this.bodyGeo, this.bodyMat);
    const rim = new THREE.Mesh(this.rimGeo, this.rimMat.L);
    rim.position.z = 0.03;
    const inner = new THREE.Mesh(this.innerGeo, this.rimMat.L);
    inner.position.z = 0.0405;
    const face = new THREE.Mesh(this.faceGeo, this.faceMat.L);
    face.position.z = 0.0425;
    spin.add(body, rim, inner, face);
    // záře za terčem
    const haloMat = new THREE.SpriteMaterial({ map: this.glowTex, color: COL.L, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 });
    const halo = new THREE.Sprite(haloMat);
    halo.scale.setScalar(0.62);
    halo.renderOrder = 3;
    g.add(halo);
    // závorky „( )“ a časovací kruh
    const brMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const brackets = new THREE.Group();
    for (const a of [Math.PI * 0.79, -Math.PI * 0.21]) {
      const b = new THREE.Mesh(this.bracketGeo, brMat);
      b.rotation.z = a;
      brackets.add(b);
    }
    g.add(brackets);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    const ring = new THREE.Mesh(this.ringGeo, ringMat);
    ring.position.z = 0.01;
    g.add(ring);
    const wingMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
    const wing = new THREE.Mesh(this.wingGeo, wingMat);
    g.add(wing);
    const wingGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 }));
    wingGlow.scale.setScalar(0.22);
    wing.add(wingGlow);
    wingGlow.position.set(0.06, 0, 0.01);
    g.visible = false;
    this.scene.add(g);
    return { g, spin, rim, inner, face, halo, haloMat, brackets, brMat, ring, ringMat, wing, wingMat, wingGlow, busy: false };
  }

  get(side, type) {
    let o = this.pool.find((p) => !p.busy);
    if (!o) {
      o = this.make();
      this.pool.push(o);
    }
    o.busy = true;
    o.g.visible = true;
    o.rim.material = this.rimMat[side];
    o.inner.material = this.rimMat[side];
    o.face.material = this.faceMat[side];
    o.haloMat.color.setHex(side === 'L' ? COL.L : COL.R);
    o.wingGlow.material.color.setHex(side === 'L' ? COL.L : COL.R);
    o.g.scale.setScalar(1);
    o.spin.rotation.set(0, 0, Math.random() * 6.28);
    o.brackets.visible = true;
    if (type === 'hook') {
      o.wing.visible = true;
      const sgn = side === 'R' ? 1 : -1;
      o.wing.position.set(sgn * (R + 0.035), 0, 0.01);
      o.wing.rotation.set(0, 0, sgn > 0 ? 0 : Math.PI);
    } else if (type === 'upper') {
      o.wing.visible = true;
      o.wing.position.set(0, -(R + 0.035), 0.01);
      o.wing.rotation.set(0, 0, -Math.PI / 2);
    } else o.wing.visible = false;
    return o;
  }

  release(o) {
    o.busy = false;
    o.g.visible = false;
  }

  // vzhled terče během letu: r = zbývající čas do úderu, pop = náběh 0..1
  animateTarget(o, r, pop, perfectWin, dt) {
    const t = this.time;
    o.spin.rotation.z += dt * 0.8;
    o.face.rotation.z -= dt * 1.6;
    // záře sílí, jak se terč blíží
    const near = Math.max(0, 1 - Math.max(0, r) / 1.4);
    o.haloMat.opacity = (0.28 + near * 0.5 + Math.sin(t * 10) * 0.05) * pop;
    o.halo.scale.setScalar(0.45 + near * 0.3);
    // závorky se svírají a otáčejí
    const sc = R + 0.045 + Math.max(0, Math.min(r, 1.2)) * 0.3;
    o.brackets.scale.setScalar(sc);
    o.brackets.rotation.z = Math.max(0, Math.min(r, 2)) * 1.4;
    o.brMat.opacity = Math.max(0.15, Math.min(1, 1.25 - r * 0.6)) * pop;
    // časovací kruh: od velkého k obrysu terče přesně na dobu
    const k = Math.max(0, Math.min(1, r / 0.9));
    o.ring.scale.setScalar(R * 1.08 + k * 0.32);
    o.ringMat.opacity = (1 - k) * 0.85 * pop;
    const gold = Math.abs(r) < perfectWin;
    o.brMat.color.setHex(gold ? COL.gold : 0xffffff);
    o.ringMat.color.setHex(gold ? COL.gold : 0xffffff);
    o.wingMat.opacity = 0.95 * pop;
  }

  update(dt) {
    this.time += dt;
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
    // zářící konce hrany
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
