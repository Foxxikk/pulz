// Trenér: krátké povely během tréninku (hlasem přes speechSynthesis, nebo jen textem) a tip po tréninku.
import * as THREE from 'three';
import { barOf } from './config.js';

const _p = new THREE.Vector3();

export class Coach {
  constructor(app) {
    this.app = app;
    this.voice = null;
    this.last = -99;
    this.said = new Set();
    const pick = () => {
      try {
        const vs = window.speechSynthesis ? speechSynthesis.getVoices() : [];
        this.voice = vs.find((v) => /^cs/i.test(v.lang)) || null;
      } catch (e) {}
    };
    pick();
    try {
      if (window.speechSynthesis) speechSynthesis.onvoiceschanged = pick;
    } catch (e) {}
  }
  get mode() {
    return this.app.settings.coach || 'voice';
  }
  // pri: 0 = běžné, 1 = důležité (přebije odstup)
  say(msg, pri = 0, color = '#bfe4ff') {
    const m = this.mode;
    if (m === 'off') return;
    const now = performance.now() / 1000;
    if (pri === 0 && now - this.last < 3.5) return;
    this.last = now;
    const app = this.app;
    const c = app.calibData || { cx: 0, cz: 0, headH: 1.62 };
    if (app.screen === 'play' || app.screen === 'settings' || app.screen === 'warmup') app.fx.text(null, _p.set(c.cx, c.headH + 0.42, c.cz - 1.6), msg, color, 'big');
    // hlas jen s českým hlasem (jinak by četl s cizím přízvukem)
    if (m === 'voice' && this.voice && window.speechSynthesis) {
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(msg.replace(/!/g, '.'));
        u.voice = this.voice;
        u.lang = this.voice.lang;
        u.rate = 1.12;
        u.volume = 0.9;
        speechSynthesis.speak(u);
      } catch (e) {}
    }
  }
  reset() {
    this.said.clear();
    this.missRun = 0;
  }
  once(key, msg, pri, color) {
    if (this.said.has(key)) return;
    this.said.add(key);
    this.say(msg, pri, color);
  }
  // volá se každý snímek během hry
  update(game, t) {
    if (this.mode === 'off' || !game.running) return;
    const d = game.duration;
    if (t > 1.5 && t < 3) this.once('start', 'Jdeme na to!');
    if (d > 60 && t > d / 2 && t < d / 2 + 2) this.once('half', 'Polovina! Výborně.');
    if (d > 60 && t > d - 30 && t < d - 28) this.once('last30', 'Posledních 30 sekund!', 1);
    // co přiletí za chvíli
    for (const e of game.events) {
      if (e.t < t + 1.1 || e.t > t + 1.6) continue;
      if (e.kind === 'b' && e.seq != null && !this.said.has('seq' + e.seq)) {
        this.said.add('seq' + e.seq);
        const b = barOf(e);
        if (e.type === 'arc') this.say('Spirála!', 1, '#ffd36a');
        else if (b.kind === 'wall') this.say(e.type === 'wallL' ? 'Zeď zleva!' : 'Zeď zprava!', 1, '#ff8aa8');
        else this.say(e.type === 'duck' ? 'Podřep!' : 'Úhyb!', 0, '#ffd36a');
      } else if (e.type === 'boss' && !this.said.has('boss' + e.i)) {
        this.said.add('boss' + e.i);
        this.say('Boss! Mlať, dokud nepadne!', 1, '#ffd54a');
      } else if (e.type === 'bomb') this.once('bomb', 'Červenou bombu netrefuj!', 1, '#ff6a6a');
      else if (e.pair != null) this.once('pair', 'Obě ruce najednou!', 0, '#ffffff');
    }
  }
  onMiss() {
    this.missRun = (this.missRun || 0) + 1;
    if (this.missRun === 3) this.say('Uvolni se, bij skrz terč.', 1);
  }
  onHit() {
    this.missRun = 0;
  }
  onMilestone(n) {
    this.say(`Combo ${n}! Skvělé!`, 0, '#ffd54a');
  }
}

// tip po tréninku podle záznamu
export function trainingTip(r, rec) {
  const rs = r.reasons || {};
  const miss = Object.values(rs).reduce((a, b) => a + b, 0);
  const items = (rec && rec.items) || [];
  const mL = items.filter((x) => x.r === 'miss' && x.h === 'L').length;
  const mR = items.filter((x) => x.r === 'miss' && x.h === 'R').length;
  if (r.barriersTotal && r.barriersTotal - r.barriersOk >= 3) return 'U půlkruhů a zdí jdi víc do podřepu a do strany – celým tělem.';
  if (miss >= 4) {
    const top = Object.entries(rs).sort((a, b) => b[1] - a[1])[0][0];
    const tips = {
      slabý: 'Bij víc ze švihu – terč chce ránu, ne dotyk. Případně spusť automatickou kalibraci.',
      'těsně vedle': 'Miř do středu terče – často jsi minul jen o pár centimetrů.',
      'ztráta sledování': 'Quest ti občas ztrácel ruce – drž je víc před sebou a rozsviť v místnosti.',
      'druhá ruka': 'Hlídej barvy: modrá je levá ruka, oranžová pravá.',
      směr: 'Hook bij ze strany, zvedák zespodu – podle křídla u terče.',
      mimo: 'Nenech terče proletět – sleduj jejich rytmus a bij na dobu.',
    };
    if (mR >= mL * 2 && mR >= 4) return 'Pravá ruka zaostává – soustřeď se na ni. ' + tips[top];
    if (mL >= mR * 2 && mL >= 4) return 'Levá ruka zaostává – soustřeď se na ni. ' + tips[top];
    return tips[top];
  }
  if (r.acc >= 0.95 && r.finished) return 'Výborně! Zkus vyšší obtížnost nebo režim Bez chyby.';
  if (r.finished) return 'Dobrá práce! Zítra zase – série dní se počítá.';
  return '';
}
