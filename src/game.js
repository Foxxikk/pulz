// Herní logika tréninku: terče letí v rytmu, posuzování zásahů, skóre, combo, bariéry, kalorie
import * as THREE from 'three';
import { GEO, JUDGE, COL, DIFFS, SENS, ZONE, PUNCH_NAMES, BAR, barOf } from './config.js';
import { clamp } from './util.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _v = new THREE.Vector3();
const _qf = new THREE.Quaternion();
const _qWater = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
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
    this.bombsOk = 0;
    this.bombsHit = 0;
    this.pairHit = {};
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
    const bm = this.app.settings.barriers || 'all';
    this.events = chart.events
      .filter((e) => e.kind !== 'b' || bm === 'all' || (bm === 'duck' && barOf(e).kind === 'arc'))
      .map((e, i) => Object.assign({}, e, { i }));
    this.finaleDone = null;
    this.prevMult = 1;
    this.duration = chart.duration;
    this.track = track;
    this.diff = DIFFS[diff];
    this.flight = this.diff.flight;
    this.calib = calib;
    this.running = true;
    // záznam tréninku pro analýzu detekce (bez osobních údajů)
    const S = this.app.settings;
    this.rec = {
      v: 1,
      ver: 'v7',
      ts: new Date().toISOString(),
      track: track.name,
      custom: !!track.custom,
      bpm: Math.round(track.bpm),
      diff,
      mode: this.app.mode,
      demo: !!this.app.demo,
      ua: navigator.userAgent.slice(0, 160),
      set: { sens: { ...S.sens }, zone: S.zone, barriers: S.barriers || 'all', drop: S.barrierDrop, off: S.audioOffset },
      calib: { h: +calib.headH.toFixed(2), reach: +(calib.reach || 0).toFixed(2) },
      trk: { L: { n: 0, ok: 0, ex: 0 }, R: { n: 0, ok: 0, ex: 0 } },
      fps: [],
      items: [],
      bars: [],
    };
    this.recFpsT = 0;
  }

  // zapsat výsledek terče do záznamu
  recItem(it, res, extra = {}) {
    if (!this.rec || it.practice) return;
    const r = {
      t: +it.tHit.toFixed(2),
      ty: it.type,
      h: it.side,
      r: res,
      n: it.near < 9 ? Math.round(it.near * 100) : null, // nejmenší vzdálenost ke kraji zóny (cm, záporné = uvnitř)
      ns: +it.nearSpd.toFixed(2), // rychlost při přiblížení
      np: +(it.nearPk || 0).toFixed(2), // špičková rychlost při přiblížení
      nc: it.nearCos != null ? +it.nearCos.toFixed(2) : null, // směr úderu vs. očekávaný (cos)
      w: it.wrongShown ? 1 : 0,
      wk: it.weakShown ? 1 : 0,
      d: it.dirShown ? 1 : 0,
      tr: it.trkN ? +(it.trkOk / it.trkN).toFixed(2) : null, // podíl snímků se sledovanou rukou kolem úderu
      ex: it.trkN ? +(it.trkEx / it.trkN).toFixed(2) : null,
      ...extra,
    };
    this.rec.items.push(r);
  }

  // shrnutí důvodů minutí (pro výsledky)
  missReasons() {
    const out = { slabý: 0, 'druhá ruka': 0, směr: 0, 'ztráta sledování': 0, 'těsně vedle': 0, mimo: 0 };
    if (!this.rec) return out;
    for (const x of this.rec.items) {
      if (x.r !== 'miss') continue;
      if (x.wk) out['slabý']++;
      else if (x.w) out['druhá ruka']++;
      else if (x.d) out['směr']++;
      else if (x.tr != null && x.tr < 0.6) out['ztráta sledování']++;
      else if (x.n != null && x.n <= 6) out['těsně vedle']++;
      else out.mimo++;
    }
    return out;
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
      // střed bariéry = výchozí poloha hlavy posunutá proti normále o potřebný úhyb
      const b = barOf(e);
      const drop = this.app.settings.barrierDrop;
      const c2 = Math.cos(b.ang) ** 2;
      // 'auto' (spirála): plynule mezi podřepem (0°) a úklonem (90°)
      const dist = b.dist === 'drop' ? drop * (b.ang ? 0.85 : 1) : b.dist === 'auto' ? 0.12 + (drop - 0.12) * c2 : b.dist;
      const nx = -Math.sin(b.ang), ny = Math.cos(b.ang);
      return out.set(c.cx - nx * dist, c.headH - ny * dist, c.cz);
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
      trkN: 0,
      trkOk: 0,
      trkEx: 0,
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
      if (e.type === 'bomb') {
        it.vis = this.app.targets.getBomb();
        it.far.set((rr - 0.5) * 3, 0.6 + rr, 0);
      } else it.vis = this.app.targets.get(e.hand, e.type);
      if (e.small) it.vis.base = 0.72;
      // dvojitý terč: světelné spojení s partnerem
      if (e.pair != null) {
        const pt = this.items.find((x) => x.e.pair === e.pair && x !== it && x.state === 'fly');
        if (pt) {
          it.partner = pt;
          pt.partner = it;
          it.link = pt.link = this.app.targets.getLink();
        }
      }
    } else {
      it.far.set((rr - 0.5) * 2, 0.8, 0);
      it.vis = this.app.targets.getBarrier(e.type, barOf(e).ang);
    }
    this.posAt(it, this.t, it.pos);
    it.prevPos.copy(it.pos);
    // záblesk „portálu“ tam, kde se terč objeví
    if (it.kind === 't' && e.i >= 0 && this.app.fx) this.app.fx.ring(it.pos, e.hand === 'L' ? C_L : e.hand === 'R' ? C_R : new THREE.Color(COL.gold), 0.1, 2.2, 0.45, 0.18, null, 0.8);
    this.items.push(it);
    return it;
  }

  // poloha v čase t: rychlý přílet, na konci „doplachtí“ (finalFrac rychlosti)
  posAt(it, t, out) {
    if (it.practice) return out.copy(it.hit).add(_a.set(0, Math.sin(t * 2.2) * 0.012, 0));
    // boss: po příletu visí před hráčem (hold), lehce se pohupuje
    if (it.type === 'boss' && t >= it.tHit && t <= it.tHit + (it.e.hold || 2)) {
      return out.copy(it.hit).add(_a.set(Math.sin(t * 1.7) * 0.03, Math.sin(t * 2.6) * 0.03, 0));
    }
    const tt0 = it.type === 'boss' && t > it.tHit ? t - (it.e.hold || 2) : t;
    const u = (it.tHit - tt0) / this.flight;
    const D = GEO.spawnDist;
    const a = GEO.finalFrac;
    let off;
    if (u >= 0) off = D * (a * u + (1 - a) * u * u);
    else if (it.kind === 'b') off = D * a * u * 1.6;
    else {
      // po okamžiku úderu terč rychle zabrzdí (neproletí hráči hlavou)
      const vEnd = (D * a) / this.flight, tau = 0.035, tt = -u * this.flight;
      off = -vEnd * tau * (1 - Math.exp(-tt / tau));
    }
    const uu = Math.max(0, u);
    const conv = uu * uu;
    out.set(it.hit.x + it.far.x * conv, it.hit.y + it.far.y * conv, it.hit.z - off);
    // zakřivený let: oblouk ze strany, na začátku i v cíli bez odchylky
    if (it.e.curve && uu > 0) out.x += it.e.curve * 1.1 * Math.sin(Math.PI * Math.min(1, uu * 1.15));
    return out;
  }

  releaseItem(it) {
    if (it.link) {
      this.app.targets.releaseLink(it.link);
      if (it.partner) it.partner.link = null;
      it.link = null;
    }
    if (!it.vis) return;
    if (it.vis.bomb) {
      it.vis.busy = false;
      it.vis.g.visible = false;
    } else if (it.kind === 't') this.app.targets.release(it.vis);
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
    if (this.rec && !this.practiceMode) {
      for (const side of ['L', 'R']) {
        const hh = side === 'L' ? hands.L : hands.R, rs = this.rec.trk[side];
        rs.n++;
        if (hh.fresh) rs.ok++;
        else if (hh.extrap) rs.ex++;
      }
      this.recFpsT += dt;
      if (this.recFpsT > 5) {
        this.recFpsT = 0;
        this.rec.fps.push(this.app.fps);
      }
    }
    const zone = this.zone();
    const RAD = GEO.targetR + GEO.fistR + zone.tol;
    const sq = zone.squash, sqSide = 1 + (zone.squash - 1) * 0.3;
    for (const it of this.items) {
      it.prevPos.copy(it.pos);
      this.posAt(it, t, it.pos);
      if (it.kind === 't') {
        // kvalita sledování očekávané ruky kolem okamžiku úderu
        if (it.state === 'fly' && Math.abs(t - it.tHit) < 0.35) {
          const hh = it.side === 'L' ? hands.L : hands.R;
          it.trkN++;
          if (hh.fresh) it.trkOk++;
          else if (hh.extrap) it.trkEx++;
        }
        if (it.state === 'fly') {
          // zásah? (jen v rozumné blízkosti)
          if (it.pos.z > this.calib.cz - this.calib.hitDist - 0.75) {
            for (const h of [hands.L, hands.R]) {
              if (!h.valid) continue;
              // úsečka pěsti v soustavě terče
              _a.subVectors(h.prevFist, it.prevPos);
              _b.subVectors(h.fist, it.pos);
              // zóna je elipsoid: ve směru úderu užší (rozbije se až při viditelném dotyku), do stran velkorysá
              if (it.type === 'jab' || it.type === 'finale') { _a.z *= sq; _b.z *= sq; }
              else if (it.type === 'hook') { _a.x *= sqSide; _b.x *= sqSide; }
              else { _a.y *= sqSide; _b.y *= sqSide; }
              _d.subVectors(_b, _a);
              const dd = _d.lengthSq();
              let s = dd > 1e-10 ? clamp(-_a.dot(_d) / dd, 0, 1) : 1;
              _p.copy(_a).addScaledVector(_d, s);
              const dist = _p.length();
              if ((h.side === it.side || it.side === 'B') && dist - RAD < it.near) {
                it.near = dist - RAD;
                it.nearSpd = Math.max(it.nearSpd, h.speed);
                it.nearPk = Math.max(it.nearPk || 0, h.pk || 0);
                const gd = GEO[it.type];
                const pv = h.speed > 0.35 || !h.pk ? h.vel : h.pkVel;
                const l = pv.length();
                if (l > 0.3) it.nearCos = (pv.x * gd.dir[0] * (it.type === 'hook' && it.side === 'L' ? -1 : 1) + pv.y * gd.dir[1] + pv.z * gd.dir[2]) / l;
              }
              if (dist > (it.type === 'finale' ? RAD + GEO.targetR * 0.7 : it.type === 'boss' ? RAD + GEO.targetR * 1.2 : it.type === 'bomb' ? RAD - 0.03 : RAD)) continue;
              this.contact(it, h, t);
              if (it.state !== 'fly') break;
            }
          }
          if (it.state === 'fly' && !it.practice) {
            if (it.type === 'bomb') {
              // bomba proletěla netknutá → v pořádku
              if (t > it.tHit + 0.3) {
                it.state = 'gone';
                this.bombsOk = (this.bombsOk || 0) + 1;
              }
            } else if (it.type === 'boss') {
              if (t > it.tHit + (it.e.hold || 2) + JUDGE.late) this.miss(it);
            } else if (t > it.tHit + JUDGE.late) this.miss(it);
          }
        }
      } else if (it.state === 'fly') {
        // zvuk průletu: vrchol zvuku přesně v okamžiku průletu kolem hlavy, ze strany, kde bariéra je
        if (!it.flyPlayed && it.tHit - t <= 0.42 && app.audio) {
          it.flyPlayed = true;
          // v husté spirále jen každý druhý (jinak by syčení splynulo)
          if (!(it.e.si % 2 === 1)) {
            const b = barOf(it.e);
            app.audio.play(b.kind === 'wall' ? 'flybyWall' : 'flyby', { pan: -Math.sin(b.ang) * 0.75, gain: b.kind === 'wall' ? 1 : 0.85 });
          }
        }
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
    if (this.finaleDone != null && t > this.finaleDone + 2.2) app.finish(true);
    else if (t >= this.duration && this.items.length === 0) app.finish(true);
    else if (t >= this.duration + 1.5) app.finish(true);
  }

  contact(it, h, t) {
    if (it.type === 'bomb') return this.bombHit(it, h, t);
    if (it.type === 'boss') return this.bossHit(it, h, t);
    const app = this.app;
    // rozhoduje švih (špička za posledních 120 ms), ne rychlost v okamžiku doteku, kdy pěst už brzdí
    const spd = Math.max(h.speed, h.pk || 0);
    // směr: z okamžiku doteku (hook je oblouk – ve špičce švihu míří pěst jinam); jen při téměř stojící ruce ze špičky
    const vv = h.speed > 0.35 || !h.pk ? h.vel : h.pkVel;
    const sens = this.sens(it.type === 'finale' ? 'jab' : it.type);
    if (it.practice && this.autocal) {
      // kalibrace: úder sledovat ještě 0,25 s po prvním dotyku (max. švih, nejbližší průchod středem)
      if (h.side !== it.side) return;
      if (it.acT == null && spd < 0.8) return; // ruka jen leží v zóně
      const g0 = GEO[it.type];
      _d.copy(vv).normalize();
      const cos = _d.x * g0.dir[0] * (it.type === 'hook' && it.side === 'L' ? -1 : 1) + _d.y * g0.dir[1] + _d.z * g0.dir[2];
      const dc = _v.subVectors(h.fist, it.pos).length();
      if (it.acT == null) {
        it.acT = t;
        it.acSpd = spd;
        it.acCos = cos;
        it.acMin = dc;
        app.fx.burst(it.pos, it.side === 'L' ? C_L : C_R, _d, 0.5, true, it.type !== 'jab');
        app.audio && app.audio.play(it.type !== 'jab' ? 'hitBig' : 'hit', { gain: 0.9 });
        it.vis.g.visible = false;
      } else {
        it.acSpd = Math.max(it.acSpd, spd);
        it.acCos = Math.max(it.acCos, cos); // směr: nejlepší shoda během doteku
        it.acMin = Math.min(it.acMin, dc);
      }
      return;
    }
    const nm = PUNCH_NAMES[it.type] + ' ' + (it.side === 'L' ? 'L' : 'P');
    if (h.side !== it.side && it.side !== 'B') {
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
    _d.copy(vv).normalize();
    const cos = _d.x * g.dir[0] * (it.type === 'hook' && it.side === 'L' ? -1 : 1) + _d.y * g.dir[1] + _d.z * g.dir[2];
    const dirOk = it.type === 'finale' || cos >= sens.cos;
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
      it.vis.g.updateMatrixWorld(true);
      it.vis.orient.getWorldQuaternion(_qf);
      app.fx.burst(it.pos, col, _d, clamp((spd - 2) / 4, 0, 1), true, it.type !== 'jab', _qf);
      it.vis.g.position.copy(it.pos);
      app.targets.shatter(it.vis, _d, clamp((spd - 2) / 4, 0, 1));
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
    // létající body z místa zásahu
    app.fx.text(null, _v.copy(it.pos).add(_a.set((it.side === 'L' ? -1 : 1) * 0.16, -0.08, 0)), '+' + pts, this.mult > 1 ? COL.goldCss : '#ffffff', 'score');
    if (this.mult > (this.prevMult || 1)) this.multUp();
    this.prevMult = this.mult;
    this.hits++;
    this.speedSum += spd;
    if (h.side === 'L') this.punchesL++;
    else this.punchesR++;
    this.punchLog.push(t);
    it.state = 'hit';
    it.t1 = t;
    this.log.push({ i: it.e.i, r: q, err, spd, dirOk });
    this.recItem(it, q, { e: Math.round(err * 1000), s: +spd.toFixed(2), s0: +h.speed.toFixed(2), c: +cos.toFixed(2), x: h.extrap ? 1 : 0 });
    // dvojitý terč: obě pěsti do 0,15 s → bonus
    if (it.e.pair != null) {
      this.pairHit = this.pairHit || {};
      const other = this.pairHit[it.e.pair];
      if (other != null && t - other < 0.15) {
        this.score += 150 * this.mult;
        app.fx.text(null, _v.copy(it.pos).add(_a.set((it.side === 'L' ? 1 : -1) * 0.2, 0.35, 0)), 'DVOJITĚ! +' + 150 * this.mult, COL.goldCss, 'big');
        app.audio && app.audio.play('perfect', { gain: 0.9 });
      }
      this.pairHit[it.e.pair] = t;
    }
    this.logAttempt({ nm, spd, res: (dirOk ? '' : 'jiný směr · ') + { perfect: 'perfektní', great: 'skvělé', good: 'dobré' }[q] });
    // efekty
    const col = it.side === 'L' ? C_L : C_R;
    const big = it.type !== 'jab';
    _p.copy(it.pos);
    it.vis.g.position.copy(_p);
    it.vis.g.updateMatrixWorld(true);
    it.vis.orient.getWorldQuaternion(_qf);
    app.fx.burst(_p, it.side === 'B' ? new THREE.Color(COL.gold) : col, _d, power, q === 'perfect', big, _qf);
    app.env.kick && app.env.kick(Math.atan2(it.pos.x - this.calib.cx, -(it.pos.z - this.calib.cz)), it.side === 'B' ? new THREE.Color(COL.gold) : col, 0.6 + power * 0.4);
    it.vis.g.position.copy(_p);
    app.targets.shatter(it.vis, _d, power);
    app.fx.text(label, _v.copy(_p).add(_a.set(0, 0.2, 0)));
    app.hands.gloves[h.side].flash = 1;
    if (app.audio) {
      const pan = (it.pos.x - this.calib.cx) * 3;
      // dva „tomy“: levá ruka výš, pravá níž (jako když hraješ na bicí)
      app.audio.play(big ? 'hitBig' : 'hit', { pan, gain: 0.85 + power * 0.3, rate: (h.side === 'L' ? 1.07 : 0.95) + (Math.random() - 0.5) * 0.02 });
      if (q === 'perfect') app.audio.play('perfect', { pan, gain: 0.7 });
    }
    if (it.type === 'finale') {
      this.score += 1000 * this.mult;
      app.fx.fireworks(_v.set(this.calib.cx, this.calib.headH + 3, this.calib.cz - 12), [C_L, C_R, new THREE.Color(COL.gold)]);
      app.fx.fireworks(_v.set(this.calib.cx, this.calib.headH + 5, this.calib.cz - 18), [new THREE.Color(COL.gold), C_L, C_R]);
      app.fx.burst(_p, new THREE.Color(COL.gold), _d, 1, true, true);
      app.fx.text('finale', _v.copy(_p).add(_a.set(0, 0.35, 0)));
      app.audio && app.audio.play('finish', { gain: 1 });
      this.finaleDone = t;
    }
    this.milestone();
  }

  // bomba: zásah = výbuch, konec comba, srážka bodů
  bombHit(it, h, t) {
    const spd = Math.max(h.speed, h.pk || 0);
    if (spd < 1.0 || it.state !== 'fly') return;
    const app = this.app;
    it.state = 'hit';
    it.t1 = t;
    this.bombsHit = (this.bombsHit || 0) + 1;
    this.breakCombo();
    this.score = Math.max(0, this.score - 300);
    const red = new THREE.Color(0xff2a3a);
    app.fx.burst(it.pos, red, _d.copy(h.vel).normalize(), 1, false, true);
    app.fx.burst(it.pos, new THREE.Color(0xff9a2a), _d, 0.6, false, true);
    app.fx.text(null, _v.copy(it.pos).add(_a.set(0, 0.25, 0)), 'BOMBA! −300', '#ff5a5a');
    app.audio && app.audio.play('barrierHit', { gain: 1 });
    app.audio && app.audio.play('hitBig', { gain: 0.8, rate: 0.6 });
    app.hurt = 1;
    if (this.rec) this.rec.items.push({ t: +it.tHit.toFixed(2), ty: 'bomb', h: h.side, r: 'bomb' });
  }

  // boss: visí před hráčem, každý úder odštípne díl; po posledním dílu velký výbuch
  bossHit(it, h, t) {
    if (it.state !== 'fly' || t < it.tHit - JUDGE.late) return;
    const spd = Math.max(h.speed, h.pk || 0);
    const sens = this.sens('jab');
    it.cool = it.cool || { L: 0, R: 0 };
    if (spd < sens.v || t < it.cool[h.side]) return;
    it.cool[h.side] = t + 0.18;
    const app = this.app;
    const power = clamp((spd - 2) / 4, 0, 1);
    _d.copy(h.vel).normalize();
    const left = app.targets.chip(it.vis, _d, power);
    it.bump = 1;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.mult = this.combo >= 50 ? 4 : this.combo >= 25 ? 3 : this.combo >= 10 ? 2 : 1;
    const pts = 80 * this.mult;
    this.score += pts;
    this.punchLog.push(t);
    if (h.side === 'L') this.punchesL++;
    else this.punchesR++;
    app.fx.burst(_p.copy(h.fist), new THREE.Color(COL.gold), _d, power, false, false);
    app.fx.text(null, _v.copy(it.pos).add(_a.set((h.side === 'L' ? -1 : 1) * 0.3, 0.1, 0)), '+' + pts, COL.goldCss, 'score');
    app.audio && app.audio.play('hitBig', { gain: 0.9, rate: h.side === 'L' ? 1.07 : 0.95 });
    app.hands.gloves[h.side].flash = 1;
    if (this.mult > (this.prevMult || 1)) this.multUp();
    this.prevMult = this.mult;
    if (left === 0) {
      it.state = 'hit';
      it.t1 = t;
      this.hits++;
      this.speedSum += spd;
      this.score += 600 * this.mult;
      app.targets.shatter(it.vis, _d, 1);
      app.fx.burst(it.pos, new THREE.Color(COL.gold), _d, 1, true, true);
      app.fx.fireworks(_v.set(this.calib.cx, this.calib.headH + 3, this.calib.cz - 10), [C_L, C_R, new THREE.Color(COL.gold)]);
      app.fx.text(null, _v.copy(it.pos).add(_a.set(0, 0.45, 0)), 'BOSS PORAŽEN!', COL.goldCss, 'big');
      app.audio && app.audio.play('finish', { gain: 0.8 });
      this.log.push({ i: it.e.i, r: 'perfect', err: 0, spd, dirOk: true });
      this.recItem(it, 'boss', { s: +spd.toFixed(2) });
    }
  }

  // nový násobič: zlatá vlna po hladině + velké „×N“
  multUp() {
    const app = this.app;
    app.fx.ring(_v.set(this.calib.cx, 0.03, this.calib.cz), new THREE.Color(COL.gold), 0.8, 18, 1.6, 0.1, _qWater, 1);
    app.fx.text(null, _v.set(this.calib.cx, this.calib.headH + 0.25, this.calib.cz - 1.4), '×' + this.mult, COL.goldCss, 'big');
    app.audio && app.audio.play('combo', { gain: 0.7 });
  }

  milestone() {
    const m = Math.floor(this.combo / 25) * 25;
    if (m >= 25 && m > this.lastMilestone) {
      this.lastMilestone = m;
      const app = this.app;
      app.fx.fireworks(_v.set(this.calib.cx, this.calib.headH + 6, this.calib.cz - 22), [C_L, C_R, new THREE.Color(COL.gold)]);
      app.audio && app.audio.play('combo', { gain: 0.8 });
      app.comboPop = 1;
      app.fx.ring(_v.set(this.calib.cx, 0.03, this.calib.cz), new THREE.Color(COL.R), 0.8, 22, 1.9, 0.08, _qWater, 0.9);
    }
  }

  breakCombo() {
    this.combo = 0;
    this.mult = 1;
    this.prevMult = 1;
    this.lastMilestone = 0;
  }

  miss(it) {
    if (it.type === 'finale') this.finaleDone = this.t;
    it.state = 'miss';
    it.t1 = this.t;
    this.misses++;
    this.breakCombo();
    this.log.push({ i: it.e.i, r: 'miss' });
    this.recItem(it, 'miss');
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
    const b = barOf(it.e);
    const nx = -Math.sin(b.ang), ny = Math.cos(b.ang);
    // hlava musí být na volné straně hrany (aspoň 1,5 cm)
    const marg = (head.x - it.hit.x) * nx + (head.y - it.hit.y) * ny;
    const ok = marg < -0.015;
    if (this.rec) this.rec.bars.push({ t: +it.tHit.toFixed(2), ty: it.type, ok: ok ? 1 : 0, m: Math.round(-marg * 100) });
    it.t1 = this.t;
    if (ok) {
      it.state = 'passed';
      this.barriersOk++;
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.mult = this.combo >= 50 ? 4 : this.combo >= 25 ? 3 : this.combo >= 10 ? 2 : 1;
      this.score += 50 * this.mult;
      this.duckLog.push(this.t);
      app.audio && app.audio.play('dodgeOk', { gain: 0.5 });
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
    if (it.link && it.partner && it.state === 'fly' && it.partner.state === 'fly' && it.side === 'L') tp.placeLink(it.link, it.pos, it.partner.pos, clamp((t - (it.tHit - this.flight)) / 0.4, 0, 1));
    else if (it.link && (it.state !== 'fly' || !it.partner || it.partner.state !== 'fly')) {
      tp.releaseLink(it.link);
      if (it.partner) it.partner.link = null;
      it.link = null;
    }
    if (v.bomb) {
      v.g.position.copy(it.pos);
      if (it.state === 'fly') {
        const pop = clamp((t - (it.tHit - this.flight)) / 0.25, 0, 1);
        v.g.scale.setScalar(0.3 + 0.7 * pop);
        tp.animateBomb(v, it.tHit - t, dt);
      } else it.state = 'gone';
      return;
    }
    if (it.kind === 't') {
      const g = v.g;
      if (it.state === 'fly') {
        g.position.copy(it.pos);
        const age = it.practice ? 1 : t - (it.tHit - this.flight);
        const pop = clamp(age / 0.25, 0, 1);
        it.bump = Math.max(0, it.bump - dt * 5);
        g.scale.setScalar((0.3 + 0.7 * pop) * (1 + it.bump * 0.15) * (v.base || 1));
        if (it.bump > 0) g.position.z -= it.bump * 0.04;
        const r = it.practice ? 0.0 : it.tHit - t;
        tp.animateTarget(v, r, pop, JUDGE.perfect, dt);
        // svítící ohon za letícím terčem
        if (!it.practice && r > 0.12) {
          const c = it.side === 'L' ? C_L : it.side === 'R' ? C_R : new THREE.Color(COL.gold);
          const sp = (it.pos.z - it.prevPos.z) / Math.max(dt, 1e-3);
          const n = sp > 3 ? 2 : 1;
          for (let k = 0; k < n; k++) {
            const j = 0.05;
            this.app.fx.emit(
              it.prevPos.x + (Math.random() - 0.5) * j, it.prevPos.y + (Math.random() - 0.5) * j, it.prevPos.z - 0.04,
              (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, -0.4,
              c.r * 0.7 + 0.3, c.g * 0.7 + 0.3, c.b * 0.7 + 0.3, 0.4, 0.22, 0.012 + Math.min(0.02, r * 0.008), 0.5
            );
          }
        }
      } else if (it.state === 'hit') {
        it.state = 'gone';
      } else if (it.state === 'miss') {
        const k = (t - it.t1) / 0.45;
        if (k >= 1) it.state = 'gone';
        else {
          // minutý krystal zhasne a propadne se
          g.position.copy(it.pos);
          g.position.y -= k * k * 0.6;
          g.scale.setScalar((1 - k * 0.7) * (v.base || 1));
          v.glow.material.opacity = 0.3 * (1 - k);
          tp.animateTarget(v, -1, 1, 0, dt);
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
  // automatická kalibrace: 12 zkušebních terčů s mírným vyhodnocením, změří švih, směr a přesnost
  startAutoCal(calib) {
    const S = this.app.settings;
    this.startPractice(calib);
    this.practiceSeq = [['jab', 'L'], ['jab', 'R'], ['hook', 'L'], ['hook', 'R'], ['upper', 'L'], ['upper', 'R'], ['jab', 'R'], ['jab', 'L'], ['hook', 'R'], ['hook', 'L'], ['upper', 'R'], ['upper', 'L']];
    this.autocal = { res: [], saved: { sens: { ...S.sens }, zone: S.zone } };
    S.sens = { jab: 5, hook: 5, upper: 5 };
    S.zone = 5;
  }
  finishAutoCal() {
    const app = this.app, S = app.settings, ac = this.autocal;
    this.autocal = null;
    const hits = ac.res.filter((x) => !x.miss);
    const med = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
    const q = (a, p) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(p * b.length))] : null; };
    if (hits.length < 6) {
      S.sens = ac.saved.sens;
      S.zone = ac.saved.zone;
      app.calMsg = `Kalibrace se nepovedla – trefil jsi ${hits.length} z 12. Zkus to znovu.`;
    } else {
      const sens = {};
      const parts = [];
      for (const ty of ['jab', 'hook', 'upper']) {
        const h = hits.filter((x) => x.type === ty);
        if (!h.length) {
          sens[ty] = ac.saved.sens[ty];
          continue;
        }
        const m = med(h.map((x) => x.spd));
        const c25 = q(h.map((x) => x.cos), 0.25);
        // nejpřísnější stupeň, který projde většina tvých úderů (práh ≤ 55 % tvého typického švihu, směr s rezervou)
        let lv = 5;
        for (let l = 1; l <= 5; l++) {
          const sv = SENS[l - 1];
          if (sv.v <= m * 0.55 && sv.cos <= c25 - 0.08) {
            lv = l;
            break;
          }
        }
        sens[ty] = Math.max(2, lv);
        parts.push(`${PUNCH_NAMES[ty]} ${ac.saved.sens[ty]}→${sens[ty]} (švih ${m.toFixed(1)} m/s)`);
      }
      // zóna: jak daleko od středu terče typicky trefuješ
      const need = q(hits.map((x) => x.d - GEO.targetR - GEO.fistR), 0.85);
      let zl = 5;
      for (let l = 1; l <= 5; l++) if (ZONE[l - 1].tol >= need + 0.01) { zl = l; break; }
      S.sens = sens;
      S.zone = Math.max(2, zl);
      parts.push(`zóna ${ac.saved.zone}→${S.zone}`);
      app.calMsg = 'Nastaveno: ' + parts.join(' · ') + ` · trefeno ${hits.length}/12`;
    }
    app.saveSettings();
    this.stopPractice();
    app.onAutoCalDone && app.onAutoCalDone();
  }

  stopPractice() {
    if (this.autocal) {
      // přerušená kalibrace → vrátit původní nastavení
      this.app.settings.sens = this.autocal.saved.sens;
      this.app.settings.zone = this.autocal.saved.zone;
      this.autocal = null;
    }
    this.practiceMode = false;
    this.running = false;
    for (const it of this.items) this.releaseItem(it);
    this.items = [];
  }
  updatePractice(t, dt, hands, head) {
    if (!this.practiceMode) return;
    if (this.autocal) {
      for (const it of this.items) if (it.state === 'fly' && it.acT != null && t - it.acT > 0.25) {
        this.autocal.res.push({ type: it.type, spd: it.acSpd, cos: it.acCos, d: it.acMin });
        this.logAttempt({ nm: PUNCH_NAMES[it.type] + ' ' + (it.side === 'L' ? 'L' : 'P'), spd: it.acSpd, res: 'změřeno' });
        it.state = 'gone';
        this.practiceNext = t + 0.45;
      }
      // neodbitý terč po 5 s přeskočit
      for (const it of this.items) if (it.state === 'fly' && it.acT == null && t - it.born > 5) {
        this.autocal.res.push({ type: it.type, miss: true, pk: it.nearPk || 0 });
        it.state = 'gone';
        this.practiceNext = t + 0.3;
      }
      if (this.practiceIdx >= this.practiceSeq.length && !this.items.some((i) => i.state === 'fly') && t >= this.practiceNext) {
        this.finishAutoCal();
        return;
      }
    }
    if (!this.items.some((i) => i.state === 'fly') && t >= this.practiceNext && (!this.autocal || this.practiceIdx < this.practiceSeq.length)) {
      const [type, hand] = this.practiceSeq[this.practiceIdx++ % this.practiceSeq.length];
      const it = this.spawn({ i: -1, kind: 't', type, hand, sx: 0, sy: 0, t: t + 99, low: false });
      it.practice = true;
      it.born = t;
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
      perfect: this.perfect,
      great: this.great,
      good: this.good,
      finale: this.finaleDone != null,
      grade,
    };
  }
}
