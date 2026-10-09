// Editor choreografie: záznam vlastních úderů na skladbu, zarovnání na doby, uložení a přehrání jako trénink.
import * as THREE from 'three';
import { GEO } from './config.js';
import { store } from './util.js';
import { addFinale } from './chart.js';

const KEY = 'pulz.choreo';

export function trackKey(track) {
  return track.custom ? 'custom:' + track.name : track.id;
}
export function loadChoreo(track) {
  const all = store.get(KEY, {});
  return all[trackKey(track)] || null;
}
export function saveChoreo(track, data) {
  const all = store.get(KEY, {});
  all[trackKey(track)] = data;
  store.set(KEY, all);
}

// převod času na dobu a zpět (vestavěné: pevné tempo, vlastní: zjištěné doby)
export function beatMap(track, spb) {
  if (track.custom && track.an && track.an.beats.length > 4) {
    const B = track.an.beats;
    const timeOf = (b) => {
      const i = Math.floor(b);
      if (i < 0) return B[0] + b * (B[1] - B[0]);
      if (i >= B.length - 1) return B[B.length - 1] + (b - B.length + 1) * (B[B.length - 1] - B[B.length - 2]);
      return B[i] + (b - i) * (B[i + 1] - B[i]);
    };
    const beatOf = (t) => {
      let lo = 0, hi = B.length - 1;
      if (t <= B[0]) return (t - B[0]) / (B[1] - B[0]);
      if (t >= B[hi]) return hi + (t - B[hi]) / (B[hi] - B[hi - 1]);
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (B[m] <= t) lo = m;
        else hi = m;
      }
      return lo + (t - B[lo]) / (B[lo + 1] - B[lo]);
    };
    return { timeOf, beatOf };
  }
  return { timeOf: (b) => b * spb, beatOf: (t) => t / spb };
}

// záznam: detekce úderů a úhybů během hraní skladby
// Údery: jen boxerské – pěst vyrazí z gardy pryč od hlavy (≥ 20 cm), švih ≥ 2,2 m/s, druh podle natočení hráče.
// Úhyby: odchylka hlavy od neutrální polohy → půlkruh natočený podle směru (oblouk hlavou = spirála),
//        posun celého těla bez naklonění hlavy → zeď.
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Euler();
const STEP = Math.PI / 8;

export class Recorder {
  constructor(calib, map, from = 0) {
    this.from = from; // zapisovat až od tohoto času (nahrávání další části)
    this.devT = 0;
    this.calib = calib;
    this.map = map;
    this.events = [];
    this.last = { L: -9, R: -9 };
    this.arm = { L: false, R: false };
    this.pk = { L: 0, R: 0 };
    this.p0 = { L: new THREE.Vector3(), R: new THREE.Vector3() };
    this.base = null; // neutrální poloha hlavy (průběžně se doladí)
    this.dodge = null; // probíhající úhyb
  }

  // vrací zaznamenanou událost (pro efekt) nebo null
  update(t, hands, head, headQ, dt = 1 / 72) {
    let out = null;
    const live = t >= this.from;
    // směr pohledu (jen vodorovně) a vpravo
    _e.setFromQuaternion(headQ || new THREE.Quaternion(), 'YXZ');
    const yaw = _e.y, roll = _e.z;
    _f.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    _r.set(Math.cos(yaw), 0, -Math.sin(yaw));
    for (const side of ['L', 'R']) {
      const h = hands.get(side);
      if (!h.valid || h.extrap) {
        this.arm[side] = false;
        continue;
      }
      const s = h.speed;
      if (!this.arm[side]) {
        // znovu připravit až v klidu (ruka v gardě)
        if (s < 0.8) {
          this.arm[side] = true;
          this.pk[side] = 0;
          this.p0[side].copy(h.fist);
        }
        continue;
      }
      if (s < 0.8) this.p0[side].copy(h.fist); // garda se může posouvat
      this.pk[side] = Math.max(this.pk[side], s);
      const pk = this.pk[side];
      if (pk >= 2.2 && s < pk * 0.8 && t - this.last[side] > 0.3) {
        _d.subVectors(h.fist, this.p0[side]);
        const len = _d.length();
        this.arm[side] = false;
        // úder musí začít z gardy (pěst před obličejem, ne u boku) a urazit aspoň 20 cm
        const g0 = this.p0[side];
        const fromGuard = g0.y > head.y - 0.55 && g0.distanceTo(head) < 0.6;
        if (len < 0.2 || !fromGuard) continue; // nebyl to úder (mávnutí, posun, ruce dole)
        const fw = _d.dot(_f), lat = _d.dot(_r), up = _d.y;
        const inward = side === 'L' ? lat : -lat;
        const hor = Math.hypot(_d.x, _d.z);
        const ext = h.fist.distanceTo(head) - g0.distanceTo(head); // o kolik se pěst vzdálila od hlavy
        let type = null, yawP = yaw;
        if (up > 0.16 && up > hor * 0.9) type = 'upper';
        else if (ext >= 0.12 && fw > 0.08) {
          // přímý úder (i do strany): směr = kam pěst vyrazila
          type = 'jab';
          yawP = Math.atan2(-_d.x, -_d.z);
        } else if (inward > 0.14 && inward > Math.abs(up)) type = 'hook';
        if (!type) continue;
        // úhel příletu (vůči výchozímu směru), max ±35°, po 5°
        const R5 = Math.PI / 36;
        yawP = Math.max(-7 * R5, Math.min(7 * R5, Math.round(yawP / R5) * R5));
        const c = this.calib;
        const b = Math.round(this.map.beatOf(t) * 2) / 2;
        this.last[side] = t;
        if (live && !this.events.some((e) => e.kind === 't' && e.hand === side && e.beat === b)) {
          // místo zásahu v soustavě příletu
          _d.set(h.fist.x - c.cx, 0, h.fist.z - c.cz);
          const cy = Math.cos(-yawP), sy = Math.sin(-yawP);
          const lx = _d.x * cy + _d.z * sy;
          const e = { kind: 't', type, hand: side, beat: b, yaw: +yawP.toFixed(4), px: +Math.max(-0.45, Math.min(0.45, lx)).toFixed(3), py: +Math.max(-0.6, Math.min(0.2, h.fist.y - c.headH)).toFixed(3) };
          this.events.push(e);
          out = e;
        }
      }
    }
    // ---- úhyby ----
    if (!this.base) this.base = head.clone();
    const dx = (head.x - this.base.x) * _r.x + (head.z - this.base.z) * _r.z; // vpravo +
    const dy = head.y - this.base.y;
    const dev = Math.hypot(dx, dy);
    if (dev < 0.07 && !this.dodge) {
      // neutrál se pomalu přizpůsobí (hráč se může posunout)
      this.base.lerp(head, Math.min(1, dt * 0.6));
    }
    const rollDeg = Math.abs(roll) * 57.3;
    const b = Math.round(this.map.beatOf(t) * 2) / 2;
    // úhyb se počítá až při velké odchylce, která chvíli trvá (ne pohupování při úderech)
    this.devT = dev >= 0.22 ? this.devT + dt : 0;
    if (live && dev >= 0.22 && this.devT >= 0.12) {
      // směr úhybu → natočení půlkruhu (překážka je na opačné straně, než kam ses pohnul)
      let ang = Math.atan2(dx, -dy);
      ang = Math.round(ang / STEP) * STEP;
      ang = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, ang));
      // posun do strany bez naklonění hlavy a bez podřepu = úkrok → zeď
      const step = Math.abs(dx) > 0.3 && dy > -0.1 && rollDeg < 8;
      const d = this.dodge;
      const changed = !d || (step ? d.kind !== 'wall' : Math.abs(ang - d.ang) >= STEP - 1e-6);
      if (changed && (!d || b - d.beat >= 0.5)) {
        let e;
        if (step) e = { kind: 'b', type: dx > 0 ? 'wallL' : 'wallR', beat: b };
        else e = { kind: 'b', type: 'arc', ang: +ang.toFixed(4), beat: b };
        if (!this.events.some((x) => x.kind === 'b' && Math.abs(x.beat - b) < 0.25)) {
          this.events.push(e);
          out = out || e;
        }
        this.dodge = { kind: step ? 'wall' : 'arc', ang, beat: b };
      }
    } else if (dev < 0.1) this.dodge = null; // návrat do neutrálu → další úhyb je nová překážka
    return out;
  }
}

// sloučit nově nahranou část do uložené choreografie (v rozsahu [b0, b1] doby nahradí)
export function mergeChoreo(old, add, b0, b1) {
  const keep = (old || []).filter((e) => e.beat < b0 - 0.01 || e.beat > b1 + 0.01);
  return keep.concat(add).sort((a, b) => a.beat - b.beat);
}

// uložená choreografie → herní události
export function chartFromChoreo(ch, track, spb, duration, range) {
  const map = beatMap(track, spb);
  const ev = ch.events
    .map((e) => ({ ...e, t: map.timeOf(e.beat), sx: 0, sy: 0, section: 'groove' }))
    .filter((e) => e.t > 1 && e.t < duration - 0.3 && (!range || (e.t >= range.t0 - 0.05 && e.t <= range.t1 + 0.05)))
    .sort((a, b) => a.t - b.t);
  ev.forEach((e, i) => (e.i = i));
  const last = ev.length ? ev[ev.length - 1].beat : 0;
  if (range) return { events: ev, duration: Math.min(duration, range.t1 + 2.5), targets: ev.filter((e) => e.kind === 't').length, barriers: ev.filter((e) => e.kind === 'b').length, custom: true };
  addFinale(ev, map.timeOf, Math.ceil(last) + 4, duration);
  return { events: ev, duration, targets: ev.filter((e) => e.kind === 't').length, barriers: ev.filter((e) => e.kind === 'b').length, custom: true };
}
