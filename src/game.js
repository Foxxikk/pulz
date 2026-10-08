// Herní logika tréninku: terče letí v rytmu, posuzování zásahů, skóre, combo, bariéry, kalorie
import * as THREE from 'three';
import { GEO, JUDGE, COL, DIFFS, SENS, ZONE, PUNCH_NAMES } from './config.js';
import { clamp } from './util.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _v = new THREE.Vector3();
const C_L = new THREE.Color(COL.L), C_R = new THREE.Color(COL.R);

export class Game {
  constructor(app) {
    this.app = app;
    this.items = [];
    this.events = [];
    this.reset();
  }

  reset() {
    for (const it of this.items) this.releaseItem(it);
    this.items = [];
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.mult = 1;
    this.hits = 0;
    this.perfect = 0;
    this.great = 0;
    this.good = 0;
    this.misses = 0;
    this.skipped = 0;
    this.barriersOk = 0;
    this.barriersHit = 0;
    this.punchesL = 0;
    this.punchesR = 0;
    this.speedSum = 0;
    this.kcal = 0;
    this.t = 0;
    this.next = 0;
    this.duration = 0;
    this.running = false;
    this.punchLog = [];
    this.duckLog = [];
    this.lastMilestone = 0;
    this.log = []; // pro testy: záznam rozhodnutí
    if (!this.attempts) this.attempts = [];
    this.attemptRev = (this.attemptRev || 0) + 1;
  }

  start(chart, track, diff, calib) {
    this.reset();
    this.chart = chart;
    this.events = chart.events;
    this.duration = chart.duration;
    this.track = track;
    this.diff = DIFFS[diff];
    this.flight = this.diff.flight;
    this.calib = calib;
    this.running = true;
  }

  sens(type) {
    const S = this.app.settings;
    const lv = Math.max(1, Math.min(5, (S.sens && S.sens[type]) || 3));
    return { lv, ...SENS[lv - 1] };
  }
  zone() {
    const lv = Math.max(1, Math.min(5, this.app.settings.zone || 3));
    return ZONE[lv - 1];
  }

  logAttempt(a) {
    this.attempts.unshift(a);
    if (this.attempts.length > 8) this.attempts.pop();
    this.attemptRev++;
  }

  // cílová (zásahová) poloha události
  hitPos(e, out) {
    const c = this.calib;
    if (e.kind === 'b') {
      const s = this.app.settings;
      if (e.type === 'duck') return out.set(c.cx, c.headH - s.barrierDrop, c.cz);
      const edge = e.type === 'leanL' ? c.cx - 0.12 : c.cx + 0.12;
      return out.set(edge, c.headH - 0.1, c.cz);
    }
    const g = GEO[e.type];
    const sgn = e.hand === 'L' ? -1 : 1;
    let dy = g.dy;
    if (e.low) dy = -0.36;
    return out.set(c.cx + sgn * g.x + e.sx, c.headH + dy + e.sy, c.cz - c.hitDist);
  }

  spawn(e) {
    const it = {
      e,
      kind: e.kind,
      side: e.hand,
      type: e.type,
      tHit: e.t,
      hit: this.hitPos(e, new THREE.Vector3()),
      far: new THREE.Vector3(),
      pos: new THREE.Vector3(),
      prevPos: new THREE.Vector3(),
      state: 'fly',
      t1: 0,
      weakShown: false,
      wrongShown: false,
      dirShown: false,
      near: 9,
      nearSpd: 0,
      practice: false,
      bump: 0,
      vis: null,
      prevZ: -99,
    };
    // odkud přilétá: z dálky nad hladinou, rozprostřeno do stran
    const r1 = Math.sin(e.i * 12.9898) * 43758.5453;
    const rr = r1 - Math.floor(r1);
    if (it.kind === 't') {
      const sgn = e.hand === 'L' ? -1 : 1;
      it.far.set(sgn * (1.2 + rr * 2.8), 0.4 + rr * 1.6, 0);
      it.vis = this.app.targets.get(e.hand, e.type);
    } else {
      it.far.set((rr - 0.5) * 2, 0.8, 0);
      it.vis = this.app.targets.getBarrier(e.type);
    }
    this.posAt(it, this.t, it.pos);
    it.prevPos.copy(it.pos);
    this.items.push(it);
    return it;
  }

  // poloha v čase t: rychlý přílet, na konci „doplachtí“ (finalFrac rychlosti)
  posAt(it, t, out) {
    if (it.practice) return out.copy(it.hit).add(_a.set(0, Math.sin(t * 2.2) * 0.012, 0));
    const u = (it.tHit - t) / this.flight;
    const D = GEO.spawnDist;
    const a = GEO.finalFrac;
    let off;
    if (u >= 0) off = D * (a * u + (1 - a) * u * u);
    else off = D * a * u * (it.kind === 'b' ? 1.6 : 1);
    const uu = Math.max(0, u);
    const conv = uu * uu;
    out.set(it.hit.x + it.far.x * conv, it.hit.y + it.far.y * conv, it.hit.z - off);
    return out;
  }

  releaseItem(it) {
    if (!it.vis) return;
    if (it.kind === 't') this.app.targets.release(it.vis);
    else this.app.targets.releaseBarrier(it.vis);
    it.vis = null;
  }

  // po pauze: terče těsně před hráčem zmizí (nepočítají se)
  clearNear(t, ahead) {
    for (const it of this.items) {
      if (it.state === 'fly' && it.tHit < t + ahead) {
        it.state = 'gone';
        this.skipped++;
      }
    }
  }

  update(t, dt, hands, head, practice = false) {
    if (!this.running) return;
    if (this.practiceMode && !practice) return;
    const app = this.app;
    this.t = t;
    // spawn
    while (this.next < this.events.length && this.events[this.next].t - this.flight <= t) {
      const e = this.events[this.next++];
      if (e.t < t + 0.25) {
        this.skipped++;
        continue;
      }
      this.spawn(e);
    }
    const zone = this.zone();
    const RAD = GEO.targetR + GEO.fistR + zone.tol;
    const sq = zone.squash, sqSide = 1 + (zone.squash - 1) * 0.3;
    for (const it of this.items) {
      it.prevPos.copy(it.pos);
      this.posAt(it, t, it.pos);
      if (it.kind === 't') {
        if (it.state === 'fly') {
          // zásah? (jen v rozumné blízkosti)
          if (it.pos.z > this.calib.cz - this.calib.hitDist - 0.75) {
            for (const h of [hands.L, hands.R]) {
              if (!h.valid) continue;
              // úsečka pěsti v soustavě terče
              _a.subVectors(h.prevFist, it.prevPos);
              _b.subVectors(h.fist, it.pos);
              // zóna je elipsoid: ve směru úderu užší (rozbije se až při viditelném dotyku), do stran velkorysá
              if (it.type === 'jab') { _a.z *= sq; _b.z *= sq; }
              else if (it.type === 'hook') { _a.x *= sqSide; _b.x *= sqSide; }
              else { _a.y *= sqSide; _b.y *= sqSide; }
              _d.subVectors(_b, _a);
              const dd = _d.lengthSq();
              let s = dd > 1e-10 ? clamp(-_a.dot(_d) / dd, 0, 1) : 1;
              _p.copy(_a).addScaledVector(_d, s);
              const dist = _p.length();
              if (h.side === it.side && dist - RAD < it.near) {
                it.near = dist - RAD;
                it.nearSpd = Math.max(it.nearSpd, h.speed);
              }
              if (dist > RAD) continue;
              this.contact(it, h, t);
              if (it.state !== 'fly') break;
            }
          }
          if (it.state === 'fly' && !it.practice && t > it.tHit + JUDGE.late) this.miss(it);
        }
      } else if (it.state === 'fly') {
        // bariéra prochází rovinou hlavy
        const hz = head.z;
        if (it.prevPos.z < hz && it.pos.z >= hz) this.judgeBarrier(it, head);
      }
      this.animate(it, t, dt);
    }
    // úklid
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.state === 'gone') {
        this.releaseItem(it);
        this.items.splice(i, 1);
      }
    }
    // kalorie (odhad MET)
    const now = t;
    while (this.punchLog.length && now - this.punchLog[0] > 20) this.punchLog.shift();
    while (this.duckLog.length && now - this.duckLog[0] > 20) this.duckLog.shift();
    const ppm = this.punchLog.length * 3;
    const dpm = this.duckLog.length * 3;
    const met = clamp(4 + ppm * 0.045 + dpm * 0.12, 4, 9.5);
    this.kcal += (met * 3.5 * app.settings.weight) / 200 / 60 * dt;
    if (t >= this.duration && this.items.length === 0) app.finish(true);
    else if (t >= this.duration + 1.5) app.finish(true);
  }

  contact(it, h, t) {
    const app = this.app;
    const spd = h.speed;
    const sens = this.sens(it.type);
    const nm = PUNCH_NAMES[it.type] + ' ' + (it.side === 'L' ? 'L' : 'P');
    if (h.side !== it.side) {
      if (!it.wrongShown && spd > sens.v * 0.7) {
        it.wrongShown = true;
        it.bump = 1;
        app.fx.text('wrong', _v.copy(it.pos).add(_a.set(0, 0.2, 0)));
        app.audio && app.audio.play('wrong', { pan: it.pos.x * 2, gain: 0.7 });
        this.logAttempt({ nm, spd, res: 'druhá ruka' });
      }
      return;
    }
    if (spd < sens.v) {
      if (!it.weakShown) {
        it.weakShown = true;
        it.bump = 0.6;
        app.fx.text('weak', _v.copy(it.pos).add(_a.set(0, 0.2, 0)));
        app.audio && app.audio.play('weak', { pan: it.pos.x * 2 });
        this.logAttempt({ nm, spd, res: 'slabý (min. ' + sens.v.toFixed(1) + ')' });
      }
      return;
    }
    // směr úderu
    const g = GEO[it.type];
    _d.copy(h.vel).normalize();
    const cos = _d.x * g.dir[0] * (it.type === 'hook' && it.side === 'L' ? -1 : 1) + _d.y * g.dir[1] + _d.z * g.dir[2];
    const dirOk = cos >= sens.cos;
    if (!dirOk && sens.lv === 1) {
      if (!it.dirShown) {
        it.dirShown = true;
        it.bump = 0.6;
        app.fx.text('dir', _v.copy(it.pos).add(_a.set(0, 0.2, 0)));
        this.logAttempt({ nm, spd, res: 'špatný směr' });
      }
      return;
    }
    if (it.practice) {
      it.state = 'hit';
      const col = it.side === 'L' ? C_L : C_R;
      app.fx.burst(it.pos, col, _d, clamp((spd - 2) / 4, 0, 1), true, it.type !== 'jab');
      app.audio && app.audio.play(it.type !== 'jab' ? 'hitBig' : 'hit', { gain: 0.9 });
      this.logAttempt({ nm, spd, res: dirOk ? 'zásah' : 'zásah, jiný směr' });
      this.practiceNext = t + 0.45;
      return;
    }
    // platný zásah
    const err = t - it.tHit;
    const ae = Math.abs(err);
    let q, mul, label;
    if (ae <= JUDGE.perfect) {
      q = 'perfect'; mul = 1; label = 'perfect';
      this.perfect++;
    } else if (ae <= JUDGE.great) {
      q = 'great'; mul = 0.8; label = 'great';
      this.great++;
    } else {
      q = 'good'; mul = 0.6; label = 'good';
      this.good++;
    }
    const power = clamp((spd - 2) / 4, 0, 1);
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.mult = this.combo >= 50 ? 4 : this.combo >= 25 ? 3 : this.combo >= 10 ? 2 : 1;
    const pts = Math.round(100 * mul * (1 + power * 0.5) * (dirOk ? 1 : 0.6) * this.mult);
    this.score += pts;
    this.hits++;
    this.speedSum += spd;
    if (h.side === 'L') this.punchesL++;
    else this.punchesR++;
    this.punchLog.push(t);
    it.state = 'hit';
    it.t1 = t;
    this.log.push({ i: it.e.i, r: q, err, spd, dirOk });
    this.logAttempt({ nm, spd, res: (dirOk ? '' : 'jiný směr · ') + { perfect: 'perfektní', great: 'skvělé', good: 'dobré' }[q] });
    // efekty
    const col = it.side === 'L' ? C_L : C_R;
    const big = it.type !== 'jab';
    _p.copy(it.pos);
    app.fx.burst(_p, col, _d, power, q === 'perfect', big);
    app.fx.text(label, _v.copy(_p).add(_a.set(0, 0.2, 0)));
    app.hands.gloves[h.side].flash = 1;
    if (app.audio) {
      const pan = (it.pos.x - this.calib.cx) * 3;
      app.audio.play(big ? 'hitBig' : 'hit', { pan, gain: 0.8 + power * 0.3, rate: 0.95 + Math.random() * 0.1 });
      if (q === 'perfect') app.audio.play('perfect', { pan, gain: 0.7 });
    }
    this.milestone();
  }

  milestone() {
    const m = Math.floor(this.combo / 25) * 25;
    if (m >= 25 && m > this.lastMilestone) {
      this.lastMilestone = m;
      const app = this.app;
      app.fx.fireworks(_v.set(this.calib.cx, this.calib.headH + 6, this.calib.cz - 22), [C_L, C_R, new THREE.Color(COL.gold)]);
      app.audio && app.audio.play('combo', { gain: 0.8 });
      app.comboPop = 1;
    }
  }

  breakCombo() {
    this.combo = 0;
    this.mult = 1;
    this.lastMilestone = 0;
  }

  miss(it) {
    it.state = 'miss';
    it.t1 = this.t;
    this.misses++;
    this.breakCombo();
    this.log.push({ i: it.e.i, r: 'miss' });
    const app = this.app;
    if (!it.weakShown && !it.wrongShown && !it.dirShown) {
      const nm = PUNCH_NAMES[it.type] + ' ' + (it.side === 'L' ? 'L' : 'P');
      if (it.near < 0.2) {
        this.logAttempt({ nm, spd: it.nearSpd, res: 'vedle o ' + Math.max(1, Math.round(it.near * 100)) + ' cm' });
        app.fx.text('close', _v.copy(it.pos).add(_a.set(0, 0.2, 0)));
      } else this.logAttempt({ nm, spd: 0, res: 'netrefeno' });
    }
    app.audio && app.audio.play('miss', { gain: 0.45, pan: (it.pos.x - this.calib.cx) * 2 });
  }

  judgeBarrier(it, head) {
    const app = this.app;
    let ok;
    if (it.type === 'duck') ok = head.y < it.hit.y - 0.02;
    else if (it.type === 'leanL') ok = head.x < it.hit.x;
    else ok = head.x > it.hit.x;
    it.t1 = this.t;
    if (ok) {
      it.state = 'passed';
      this.barriersOk++;
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.mult = this.combo >= 50 ? 4 : this.combo >= 25 ? 3 : this.combo >= 10 ? 2 : 1;
      this.score += 50 * this.mult;
      this.duckLog.push(this.t);
      app.audio && app.audio.play('whoosh', { gain: 0.8 });
      app.fx.text('dodge', _v.copy(head).add(_a.set(0, 0.35, -0.9)));
      this.milestone();
    } else {
      it.state = 'struck';
      this.barriersHit++;
      this.breakCombo();
      app.audio && app.audio.play('barrierHit', { gain: 0.9 });
      app.fx.text('ouch', _v.copy(head).add(_a.set(0, 0.3, -0.9)));
      app.hurt = 1;
    }
    this.log.push({ i: it.e.i, r: ok ? 'dodge' : 'struck' });
  }

  animate(it, t, dt) {
    const v = it.vis;
    if (!v) return;
    const tp = this.app.targets;
    if (it.kind === 't') {
      const g = v.g;
      if (it.state === 'fly') {
        g.position.copy(it.pos);
        const age = it.practice ? 1 : t - (it.tHit - this.flight);
        const pop = clamp(age / 0.25, 0, 1);
        it.bump = Math.max(0, it.bump - dt * 5);
        g.scale.setScalar((0.3 + 0.7 * pop) * (1 + it.bump * 0.15));
        if (it.bump > 0) g.position.z -= it.bump * 0.04;
        const r = it.practice ? 0.0 : it.tHit - t;
        tp.animateTarget(v, r, pop, JUDGE.perfect, dt);
        // svítící ohon za letícím terčem
        if (!it.practice && r > 0.12) {
          const c = it.side === 'L' ? C_L : C_R;
          const sp = (it.pos.z - it.prevPos.z) / Math.max(dt, 1e-3);
          const n = sp > 3 ? 2 : 1;
          for (let k = 0; k < n; k++) {
            const j = 0.05;
            this.app.fx.emit(
              it.prevPos.x + (Math.random() - 0.5) * j, it.prevPos.y + (Math.random() - 0.5) * j, it.prevPos.z - 0.04,
              (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, -0.4,
              c.r * 0.8 + 0.2, c.g * 0.8 + 0.2, c.b * 0.8 + 0.2, 0.55, 0.28, 0.022 + Math.min(0.03, r * 0.012), 0.5
            );
          }
        }
      } else if (it.state === 'hit') {
        it.state = 'gone';
      } else if (it.state === 'miss') {
        const k = (t - it.t1) / 0.35;
        if (k >= 1) it.state = 'gone';
        else {
          g.position.copy(it.pos);
          g.position.y -= k * k * 0.5;
          g.scale.setScalar(1 - k);
          v.brMat.color.setHex(0xff5050);
          v.brMat.opacity = 1 - k;
          v.ringMat.opacity = 0;
          v.haloMat.opacity *= 0.9;
        }
      }
    } else {
      const g = v.g;
      g.position.copy(it.pos);
      const age = t - (it.tHit - this.flight);
      const pop = clamp(age / 0.4, 0, 1);
      g.scale.setScalar(0.9 * pop);
      const r = it.tHit - t;
      let op = (0.55 + clamp(1 - Math.abs(r) / 1.5, 0, 1) * 0.45) * pop;
      if (it.state === 'passed' || it.state === 'struck') {
        const k = clamp((t - it.t1) / 0.5, 0, 1);
        op *= 1 - k;
        if (k >= 1) it.state = 'gone';
      }
      tp.barrierLook(v, op, it.state === 'struck');
    }
  }

  // ---------- zkušební terče (nastavení citlivosti) ----------
  startPractice(calib) {
    this.reset();
    this.events = [];
    this.next = 0;
    this.calib = calib;
    this.flight = 1.9;
    this.duration = 1e9;
    this.running = true;
    this.practiceMode = true;
    this.practiceIdx = 0;
    this.practiceNext = 0;
    this.practiceSeq = [['jab', 'L'], ['jab', 'R'], ['hook', 'L'], ['hook', 'R'], ['upper', 'L'], ['upper', 'R']];
  }
  stopPractice() {
    this.practiceMode = false;
    this.running = false;
    for (const it of this.items) this.releaseItem(it);
    this.items = [];
  }
  updatePractice(t, dt, hands, head) {
    if (!this.practiceMode) return;
    if (!this.items.some((i) => i.state === 'fly') && t >= this.practiceNext) {
      const [type, hand] = this.practiceSeq[this.practiceIdx++ % this.practiceSeq.length];
      const it = this.spawn({ i: -1, kind: 't', type, hand, sx: 0, sy: 0, t: t + 99, low: false });
      it.practice = true;
      it.far.set(0, 0, 0);
    }
    this.t = t;
    this.update(t, dt, hands, head, true);
  }

  result() {
    const total = this.hits + this.misses;
    const acc = total ? this.hits / total : 0;
    const perfectRate = this.hits ? this.perfect / this.hits : 0;
    const bTot = this.barriersOk + this.barriersHit;
    const accAll = total + bTot ? (this.hits + this.barriersOk) / (total + bTot) : 0;
    let grade = 'D';
    if (accAll >= 0.95 && perfectRate >= 0.5) grade = 'S';
    else if (accAll >= 0.9) grade = 'A';
    else if (accAll >= 0.8) grade = 'B';
    else if (accAll >= 0.65) grade = 'C';
    return {
      score: this.score,
      acc: accAll,
      hitAcc: acc,
      maxCombo: this.maxCombo,
      perfectRate,
      kcal: this.kcal,
      avgSpeed: this.hits ? this.speedSum / this.hits : 0,
      punchesL: this.punchesL,
      punchesR: this.punchesR,
      barriersOk: this.barriersOk,
      barriersTotal: bTot,
      hits: this.hits,
      misses: this.misses,
      grade,
    };
  }
}
