// Automatický hráč: ukázka na PC a testy. Generuje klouby pěstí a polohu hlavy.
import * as THREE from 'three';
import { GEO, BAR, barOf } from './config.js';
import { fistJoints } from './hands.js';
import { rng, clamp } from './util.js';

const _p = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Vector3();

export class Bot {
  constructor(app, opts = {}) {
    this.app = app;
    this.jitter = opts.jitter ?? 0.025; // směrodatná odchylka načasování (s)
    this.missRate = opts.missRate ?? 0;
    this.R = rng(opts.seed ?? 7);
    this.joints = { L: new Float32Array(75), R: new Float32Array(75) };
    this.motion = { L: null, R: null };
    this.head = new THREE.Vector3();
    this.done = new Set();
    this.t = 0;
  }

  reset() {
    this.motion = { L: null, R: null };
    this.done.clear();
  }

  gauss() {
    const u = this.R() || 1e-6, v = this.R();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283 * v);
  }

  guard(side, c, out) {
    const s = side === 'L' ? -1 : 1;
    return out.set(c.cx + s * 0.16, c.headH - 0.27, c.cz - 0.2);
  }

  update(t, dt) {
    const app = this.app;
    const game = app.game;
    const c = game.calib;
    this.t = t;
    if (!c) return;
    // naplánovat pohyby
    for (const it of game.items) {
      if (it.kind !== 't' || it.state !== 'fly') continue;
      if (it.type === 'bomb') continue; // bombu nikdy
      // boss: série střídavých úderů po dobu visení
      if (it.type === 'boss' && t >= it.tHit - 0.17 && t < it.tHit + (it.e.hold || 2) - 0.2) {
        if (t >= (it.botNext || 0)) {
          const side = (it.botSide = it.botSide === 'L' ? 'R' : 'L');
          if (!this.motion[side] || t > this.motion[side].end - 0.15) {
            this.motion[side] = { it, start: t, contact: t + 0.17, end: t + 0.17 + 0.22, type: 'jab', side, hit: it.hit.clone().add(new THREE.Vector3(side === 'L' ? -0.12 : 0.12, 0, 0)) };
            it.botNext = t + 0.24;
          }
        }
        continue;
      }
      if (this.done.has(it.e.i)) continue;
      if (it.tHit - t > 0.32) continue;
      this.done.add(it.e.i);
      if (this.R() < this.missRate) continue;
      const side = it.side === 'B' ? 'R' : it.side;
      const dur = 0.17;
      const contact = it.tHit + this.gauss() * this.jitter;
      this.motion[side] = { it, start: contact - dur, contact, end: contact + 0.32, type: it.type === 'finale' ? 'jab' : it.type, side, hit: it.hit.clone() };
    }
    for (const side of ['L', 'R']) {
      const pos = this.guard(side, c, _p);
      _f.set(0, 0, -1);
      _u.set(0, 1, 0);
      const m = this.motion[side];
      if (m && t >= m.start && t <= m.end) {
        const g = GEO[m.type];
        const dir = _c.set(g.dir[0] * (m.type === 'hook' && side === 'L' ? -1 : 1), g.dir[1], g.dir[2]);
        // cíl = poloha terče v okamžiku kontaktu + průraz
        const target = _q.copy(m.hit);
        const u = (m.it.tHit - m.contact) / app.game.flight;
        if (u > 0) target.z -= GEO.spawnDist * GEO.finalFrac * u; // předčasný úder trefí terč dál
        else target.z += GEO.spawnDist * GEO.finalFrac * -u;
        const over = target.clone().addScaledVector(dir, 0.1);
        const guard = pos.clone();
        let p;
        if (t <= m.contact + 0.03) {
          const k = clamp((t - m.start) / (m.contact + 0.03 - m.start), 0, 1);
          const e = k * k; // zrychlení až do kontaktu
          // výchozí bod: hook zboku, zvedák zespodu
          let from = guard;
          if (m.type === 'hook') from = target.clone().addScaledVector(dir, -0.32).add(new THREE.Vector3(0, -0.04, 0.12));
          if (m.type === 'upper') from = target.clone().addScaledVector(dir, -0.3).add(new THREE.Vector3(0, 0, 0.1));
          const k0 = clamp(k * 3, 0, 1);
          const start = guard.clone().lerp(from, k0);
          p = start.lerp(over, e);
        } else {
          const k = clamp((t - m.contact - 0.03) / (m.end - m.contact - 0.03), 0, 1);
          p = over.clone().lerp(guard, k * k * (3 - 2 * k));
        }
        pos.copy(p);
        if (m.type === 'upper') {
          _f.set(0, 0.6, -0.8).normalize();
        } else if (m.type === 'hook') {
          _f.set(dir.x * 0.6, 0, -0.8).normalize();
          _u.set(-dir.x * 0.4, 1, 0).normalize();
        }
      } else if (m && t > m.end) this.motion[side] = null;
      // drobné „dýchání“ v gardě
      if (!m) pos.y += Math.sin(t * 3 + (side === 'L' ? 0 : 1.7)) * 0.01;
      fistJoints(side, pos, _f, _u, this.joints[side]);
      app.hands.setSynthetic(side, this.joints[side]);
    }
    // hlava: podřepy a úklony
    let hy = c.headH, hx = c.cx;
    for (const it of game.items) {
      if (it.kind !== 'b') continue;
      const r = Math.abs(it.tHit - t);
      if (r > 0.5) continue;
      const k = Math.cos((r / 0.5) * Math.PI * 0.5);
      // posun hlavy přes hranu bariéry (+ rezerva)
      const b = barOf(it.e);
      const nx = -Math.sin(b.ang), ny = Math.cos(b.ang);
      const need = (c.cx - it.hit.x) * nx + (c.headH - it.hit.y) * ny + 0.12;
      const tx = c.cx - nx * need * k, ty = c.headH - ny * need * k;
      if (Math.abs(nx) > 0.1) hx = nx > 0 ? Math.min(hx, tx) : Math.max(hx, tx);
      if (ny > 0.1) hy = Math.min(hy, ty);
    }
    this.head.set(hx, hy, c.cz);
  }
}
