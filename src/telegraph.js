// Náznak příletu: dopředu ukáže, ze kterého úhlu přiletí další terče a překážky.
//  1) „portál“ – v dálce, přesně kde se objekt objeví, se ~1 s předem rozsvítí záře
//  2) „dráha“ – světelný pruh po hladině ve směru příletu, šipky tečou k hráči
//  3) „kompas“ – svítící výseč na okraji plošiny pod nohama (vidíš ji i periferně)
import * as THREE from 'three';
import { COL } from './config.js';
import { WATER_Y } from './env.js';

const LEAD = 1.1; // s předem před objevením
const NB = 6; // max. současných drah (podle úhlu)
const NP = 18; // max. portálů
const _v = new THREE.Vector3();
const C_L = new THREE.Color(COL.L), C_R = new THREE.Color(COL.R), C_B = new THREE.Color(0xffa040), C_G = new THREE.Color(COL.gold);
const smooth = (a, b, x) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

// portál: zářivý kruh s měkkým jádrem (čitelný i proti světlé obloze)
function glowTex() {
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,0.75)');
  gr.addColorStop(0.3, 'rgba(255,255,255,0.18)');
  gr.addColorStop(0.62, 'rgba(255,255,255,0.35)');
  gr.addColorStop(0.72, 'rgba(255,255,255,1)');
  gr.addColorStop(0.8, 'rgba(255,255,255,0.3)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// pruh se šipkami (špička směrem k hráči = dolů v textuře), opakuje se po délce
function laneTex() {
  const W = 64, H = 128, c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, W, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.28)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 9;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(10, 40);
  g.lineTo(32, 84);
  g.lineTo(54, 40);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class Telegraph {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'telegraph';
    scene.add(this.group);
    this.flow = 0;
    const gt = glowTex();
    // portály
    this.portals = [];
    for (let i = 0; i < NP; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, transparent: true, depthWrite: false, opacity: 0, toneMapped: false }));
      sp.visible = false;
      sp.renderOrder = 2;
      this.group.add(sp);
      this.portals.push(sp);
    }
    // dráhy po hladině: od okraje plošiny do dálky, šipky tečou k hráči
    this.laneMap = laneTex();
    const R0 = 0.95, R1 = 15;
    const lg = new THREE.PlaneGeometry(0.42, R1 - R0, 1, 1);
    lg.rotateX(-Math.PI / 2);
    lg.translate(0, 0, -(R0 + R1) / 2);
    // na konci pruh slábne (vertex color podle vzdálenosti)
    const pos = lg.attributes.position, col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const d = -pos.getZ(i), f = d < 2 ? 1 : Math.max(0, 1 - (d - 2) / (R1 - 2)) * 0.9;
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = f;
    }
    lg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // kompas: výseč na okraji plošiny
    const ag = new THREE.RingGeometry(0.69, 0.82, 16, 1, Math.PI / 2 - 0.16, 0.32);
    ag.rotateX(-Math.PI / 2);
    this.lanes = [];
    for (let i = 0; i < NB; i++) {
      const map = this.laneMap.clone();
      map.repeat.set(1, (R1 - R0) / 0.9);
      const m = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ map, vertexColors: true, transparent: true, depthWrite: false, opacity: 0, toneMapped: false, side: THREE.DoubleSide }));
      const arc = new THREE.Mesh(ag, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, toneMapped: false }));
      const g = new THREE.Group();
      m.position.y = WATER_Y + 0.025;
      arc.position.y = 0.006;
      g.add(m, arc);
      g.visible = false;
      this.group.add(g);
      this.lanes.push({ g, m, arc, a: 0, yaw: 0, key: null });
    }
    this.debug = { lanes: 0, portals: 0, yaws: [] };
  }

  hide() {
    for (const p of this.portals) p.visible = false;
    for (const l of this.lanes) {
      l.g.visible = false;
      l.a = 0;
      l.key = null;
    }
    this.debug = { lanes: 0, portals: 0, yaws: [] };
  }

  // level: 'full' | 'light' | 'off'
  update(game, t, dt, level) {
    if (!game || !game.running || game.practiceMode || level === 'off' || !game.calib) return this.hide();
    const fl = game.flight, ev = game.events, c = game.calib;
    this.flow = (this.flow + dt * 1.6) % 1;
    // seber blízké budoucí události
    const want = new Map(); // klíč úhlu → {yaw, a, col}
    let np = 0;
    const i0 = Math.max(0, game.next - 40);
    for (let i = i0; i < ev.length; i++) {
      const e = ev[i], ts = e.t - fl;
      if (ts > t + LEAD) break;
      if (e.t - fl * 0.45 < t) continue; // už je blízko, vidíš ho sám
      if (e.i < 0) continue;
      // síla: náběh před objevením, po objevení postupně zhasne
      const a = smooth(ts - LEAD, ts - 0.1, t) * (1 - smooth(ts + fl * 0.15, e.t - fl * 0.45, t));
      if (a <= 0.01) continue;
      const colr = e.kind === 'b' ? C_B : e.type === 'bomb' || e.type === 'boss' ? C_G : e.hand === 'L' ? C_L : e.hand === 'R' ? C_R : C_G;
      // portál v místě objevení (jen před tím, než se objekt objeví; pak doznívá)
      if (np < NP && t < ts + 0.25) {
        const sp = this.portals[np++];
        game.spawnPoint(e, sp.position);
        const pre = smooth(ts - LEAD, ts, t), post = t > ts ? 1 - (t - ts) / 0.25 : 1;
        const s = (e.kind === 'b' ? 5.5 : 4.5) * (0.35 + 0.65 * pre) * (1 + (t > ts ? (t - ts) * 2 : 0));
        sp.scale.set(s, s, 1);
        sp.material.color.copy(colr);
        sp.material.opacity = Math.min(1, pre * post) * 1.0 * (0.85 + 0.15 * Math.sin(t * 18));
        sp.visible = true;
      }
      if (level !== 'full' || e.kind === 'b') continue;
      const yaw = e.yaw || 0, key = Math.round((yaw * 57.3) / 5);
      const w = want.get(key);
      if (!w || a > w.a) want.set(key, { yaw, a: Math.max(a, w ? w.a : 0), col: colr, both: w && !w.col.equals(colr) });
      else if (w && !w.col.equals(colr)) w.both = true;
    }
    for (let i = np; i < NP; i++) this.portals[i].visible = false;
    // přiřaď dráhy (stejný úhel = stejná dráha, plynulé rozsvícení/zhasnutí)
    for (const l of this.lanes) {
      const w = l.key != null ? want.get(l.key) : null;
      l.target = w ? w.a : 0;
      if (w) {
        l.col = w.both ? C_G : w.col;
        want.delete(l.key);
      }
    }
    for (const [key, w] of want) {
      const l = this.lanes.find((x) => x.a < 0.02 && x.target === 0);
      if (!l) break;
      l.key = key;
      l.yaw = w.yaw;
      l.a = 0;
      l.target = w.a;
      l.col = w.both ? C_G : w.col;
    }
    let nl = 0;
    const yaws = [];
    for (const l of this.lanes) {
      l.a += (l.target - l.a) * Math.min(1, dt * 10);
      if (l.target === 0 && l.a < 0.02) {
        l.a = 0;
        l.key = null;
        l.g.visible = false;
        continue;
      }
      nl++;
      yaws.push(Math.round(l.yaw * 57.3));
      l.g.visible = true;
      l.g.position.set(c.cx, 0, c.cz);
      l.g.rotation.y = l.yaw;
      // boční přílet svítí víc (rovně je to zřejmé)
      const side = Math.min(1, Math.abs(l.yaw) / 0.26);
      l.m.material.color.copy(l.col);
      l.m.material.opacity = l.a * (0.55 + 0.4 * side);
      l.m.material.map.offset.y = this.flow;
      l.arc.material.color.copy(l.col);
      l.arc.material.opacity = l.a * (0.55 + 0.45 * side);
    }
    this.debug = { lanes: nl, portals: np, yaws };
  }
}
