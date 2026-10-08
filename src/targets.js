// Létající objekty ve 3D: fasetované energetické krystaly (převalují se, uvnitř svítí, odráží okolí).
// Směr úderu ukazuje 3D šipka (hook ze strany, zvedák zespodu). Žádné kruhy ani závorky.
// Bariéry: energetické štíty („Měsíc“) s animovaným shaderem.
import * as THREE from 'three';
import { COL, GEO } from './config.js';

const R = GEO.targetR;
const _q = new THREE.Quaternion();

// krystal: ikosaedr s mírně nepravidelnými vrcholy (vypadá jako broušený kámen)
function crystalGeometry(r, seed) {
  const g = new THREE.IcosahedronGeometry(r * 1.05, 0);
  const pos = g.attributes.position;
  const map = new Map();
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < pos.count; i++) {
    const key = pos.getX(i).toFixed(4) + ',' + pos.getY(i).toFixed(4) + ',' + pos.getZ(i).toFixed(4);
    if (!map.has(key)) map.set(key, 0.9 + rnd() * 0.22);
    const k = map.get(key);
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 1.06, pos.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

function chevronGeometry() {
  // 3D šipka (extrudovaný tvar „>“)
  const s = new THREE.Shape();
  s.moveTo(-0.03, 0.05);
  s.lineTo(0.035, 0);
  s.lineTo(-0.03, -0.05);
  s.lineTo(-0.012, 0);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.018, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2 });
  g.translate(0, 0, -0.009);
  return g;
}

function glowTexture() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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
    this.geos = [0, 1, 2, 3].map((i) => crystalGeometry(R, 1234 + i * 777));
    this.edgeGeos = this.geos.map((g) => new THREE.EdgesGeometry(g, 8));
    this.coreGeo = new THREE.IcosahedronGeometry(R * 0.55, 1);
    this.chevGeo = chevronGeometry();
    this.glowTex = glowTexture();
    const mk = (hex) => {
      const c = new THREE.Color(hex);
      return {
        shell: new THREE.MeshStandardMaterial({
          color: c.clone().multiplyScalar(0.35),
          emissive: c.clone(),
          emissiveIntensity: 0.18,
          metalness: 0.65,
          roughness: 0.06,
          flatShading: true,
          transparent: true,
          opacity: 0.86,
          envMapIntensity: 2.6,
        }),
        edge: new THREE.LineBasicMaterial({ color: c.clone().lerp(new THREE.Color(1, 1, 1), 0.55), transparent: true, opacity: 0.85, toneMapped: false }),
        core: new THREE.MeshBasicMaterial({ color: c.clone().lerp(new THREE.Color(1, 1, 1), 0.35), toneMapped: false }),
        glow: new THREE.SpriteMaterial({ map: this.glowTex, color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 }),
      };
    };
    this.mats = { L: mk(COL.L), R: mk(COL.R) };
    this.chevMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.7, metalness: 0.2, roughness: 0.3 });
    this.pool = [];
    for (let i = 0; i < 28; i++) this.pool.push(this.make(i));
    this.barrierPool = [];
    for (let i = 0; i < 6; i++) this.barrierPool.push(this.makeBarrier());
    this.time = 0;
  }

  make(i) {
    const g = new THREE.Group();
    const spin = new THREE.Group();
    g.add(spin);
    const core = new THREE.Mesh(this.coreGeo, this.mats.L.core);
    const shell = new THREE.Mesh(this.geos[i % 4], this.mats.L.shell);
    shell.renderOrder = 2;
    const edges = new THREE.LineSegments(this.edgeGeos[i % 4], this.mats.L.edge);
    edges.renderOrder = 3;
    spin.add(core, shell, edges);
    // malá vnitřní záře (svítí skrz krystal)
    const glow = new THREE.Sprite(this.mats.L.glow.clone());
    glow.scale.setScalar(R * 3.2);
    glow.renderOrder = 3;
    g.add(glow);
    // 3D šipka směru
    const dir = new THREE.Group();
    const c1 = new THREE.Mesh(this.chevGeo, this.chevMat);
    const c2 = new THREE.Mesh(this.chevGeo, this.chevMat);
    c2.position.x = -0.045;
    c2.scale.setScalar(0.8);
    dir.add(c1, c2);
    g.add(dir);
    g.visible = false;
    this.scene.add(g);
    const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    return { g, spin, core, shell, edges, glow, dir, axis, spd: 2 + Math.random() * 2.5, busy: false, side: 'L', type: 'jab' };
  }

  get(side, type) {
    let o = this.pool.find((p) => !p.busy);
    if (!o) {
      o = this.make(this.pool.length);
      this.pool.push(o);
    }
    o.busy = true;
    o.side = side;
    o.type = type;
    o.g.visible = true;
    const m = this.mats[side];
    o.shell.material = m.shell;
    o.edges.material = m.edge;
    o.core.material = m.core;
    o.glow.material.color.copy(m.glow.color);
    o.g.scale.setScalar(1);
    o.spin.quaternion.random();
    o.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    o.spd = 2 + Math.random() * 2.5;
    // šipka: hook = ze strany (míří dovnitř), zvedák = zespodu (míří nahoru)
    if (type === 'hook') {
      o.dir.visible = true;
      const sgn = side === 'R' ? 1 : -1;
      o.dir.position.set(sgn * (R + 0.07), 0, 0);
      o.dir.rotation.set(0, 0, sgn > 0 ? Math.PI : 0);
    } else if (type === 'upper') {
      o.dir.visible = true;
      o.dir.position.set(0, -(R + 0.07), 0);
      o.dir.rotation.set(0, 0, Math.PI / 2);
    } else o.dir.visible = false;
    return o;
  }

  release(o) {
    o.busy = false;
    o.g.visible = false;
  }

  update(dt) {
    this.time += dt;
    // společné „dýchání“ materiálů
    const p = 0.5 + 0.5 * Math.sin(this.time * 6);
    for (const k of ['L', 'R']) this.mats[k].shell.emissiveIntensity = 0.14 + p * 0.1;
  }

  // r = zbývající čas do úderu, pop = náběh 0..1
  animateTarget(o, r, pop, perfectWin, dt) {
    // převalování krystalu
    _q.setFromAxisAngle(o.axis, o.spd * dt);
    o.spin.quaternion.premultiply(_q);
    // jádro pulzuje a sílí, jak se krystal blíží
    const near = Math.max(0, 1 - Math.max(0, r) / 1.2);
    const beat = Math.abs(r) < perfectWin ? 1 : 0;
    o.core.scale.setScalar(0.85 + near * 0.35 + beat * 0.15 + Math.sin(this.time * 14) * 0.03);
    o.glow.material.opacity = 0.35 + near * 0.4;
    o.glow.scale.setScalar(R * (2.6 + near * 1.4 + beat * 0.8));
    // šipka se jemně „pumpuje“ ve směru úderu
    if (o.dir.visible) {
      const k = (this.time * 3) % 1;
      o.dir.children[0].position.x = 0.012 * Math.sin(k * Math.PI * 2);
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
