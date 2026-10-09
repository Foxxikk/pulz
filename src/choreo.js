// Editor choreografie: záznam vlastních úderů na skladbu, zarovnání na doby, uložení a přehrání jako trénink.
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
export class Recorder {
  constructor(calib, map) {
    this.calib = calib;
    this.map = map;
    this.events = [];
    this.last = { L: -9, R: -9, body: -9 };
    this.arm = { L: true, R: true };
    this.prevPk = { L: 0, R: 0 };
  }
  // vrací zaznamenanou událost (pro efekt) nebo null
  update(t, hands, head) {
    let out = null;
    for (const side of ['L', 'R']) {
      const h = hands.get(side);
      if (!h.valid) continue;
      const s = h.speed;
      // úder = švih nad 1,6 m/s; zapíše se, když rychlost po vrcholu klesne (pěst je natažená)
      if (this.arm[side]) {
        this.prevPk[side] = Math.max(this.prevPk[side], s);
        const pk = this.prevPk[side];
        if (pk > 1.6 && s < pk * 0.85 && t - this.last[side] > 0.22) {
          const v = h.vel.lengthSq() > 0.01 ? h.vel : h.pkVel;
          const ax = Math.abs(v.x), ay = Math.abs(v.y), az = Math.abs(v.z);
          let type = 'jab';
          if (ay > az * 1.1 && v.y > 0 && ay > ax) type = 'upper';
          else if (ax > az * 1.1 && ax > ay) type = 'hook';
          const c = this.calib;
          const b = Math.round(this.map.beatOf(t + 0.03) * 2) / 2;
          // stejná ruka na stejné půldobě jen jednou
          if (!this.events.some((e) => e.kind === 't' && e.hand === side && e.beat === b)) {
            const e = { kind: 't', type, hand: side, beat: b, px: +Math.max(-0.45, Math.min(0.45, h.fist.x - c.cx)).toFixed(3), py: +Math.max(-0.6, Math.min(0.2, h.fist.y - c.headH)).toFixed(3) };
            this.events.push(e);
            out = e;
          }
          this.last[side] = t;
          this.arm[side] = false;
        }
      } else if (s < 0.9) {
        this.arm[side] = true;
        this.prevPk[side] = 0;
      }
    }
    // podřep / úklon → bariéra
    const c = this.calib;
    if (t - this.last.body > 0.9) {
      const dy = head.y - c.headH, dx = head.x - c.cx;
      let type = null;
      if (dy < -0.16) type = dx < -0.1 ? 'duckL' : dx > 0.1 ? 'duckR' : 'duck';
      else if (dx < -0.14) type = 'leanL';
      else if (dx > 0.14) type = 'leanR';
      if (type) {
        const b = Math.round(this.map.beatOf(t) * 2) / 2;
        const e = { kind: 'b', type, beat: b };
        this.events.push(e);
        this.last.body = t;
        out = out || e;
      }
    }
    return out;
  }
}

// uložená choreografie → herní události
export function chartFromChoreo(ch, track, spb, duration) {
  const map = beatMap(track, spb);
  const ev = ch.events
    .map((e) => ({ ...e, t: map.timeOf(e.beat), sx: 0, sy: 0, section: 'groove' }))
    .filter((e) => e.t > 1 && e.t < duration - 0.3)
    .sort((a, b) => a.t - b.t);
  ev.forEach((e, i) => (e.i = i));
  const last = ev.length ? ev[ev.length - 1].beat : 0;
  addFinale(ev, map.timeOf, Math.ceil(last) + 4, duration);
  return { events: ev, duration, targets: ev.filter((e) => e.kind === 't').length, barriers: ev.filter((e) => e.kind === 'b').length, custom: true };
}
