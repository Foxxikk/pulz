// Zvuk: předrenderovaná hudba (smyčky po sekcích) + efekty. Herní čas = hodiny audia.
import { Kit, makeNoise, impulse } from './synth.js';
import { rng } from './util.js';

const LOOP_BARS = 4;

export class AudioSys {
  constructor() {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = 0.9;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -10;
    this.comp.ratio.value = 3;
    this.master.connect(this.comp).connect(c.destination);
    this.musicBus = c.createGain();
    this.musicBus.gain.value = 0.75;
    this.musicBus.connect(this.master);
    this.sfxBus = c.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);
    this.ambBus = c.createGain();
    this.ambBus.gain.value = 0;
    this.ambBus.connect(this.master);
    this.amb = [];
    this.ambLevel = 0.6;
    this.ambDuck = 1;
    this.noise = makeNoise(c, 2);
    this.loops = new Map(); // klíč trackId:typ -> AudioBuffer
    this.sfx = {};
    this.voices = [];
    this.song = null;
    this.sfxReady = this.renderSfx();
  }

  resume() {
    if (this.ctx.state !== 'running') this.ctx.resume();
  }

  // ---------- ZVUKY PROSTŘEDÍ (streamované nahrávky, smyčka) ----------
  setAmbient(layers) {
    for (const a of this.amb) {
      try { a.el.pause(); a.node.disconnect(); } catch (e) {}
      a.el.removeAttribute('src');
    }
    this.amb = [];
    for (const l of layers || []) {
      const el = new Audio();
      el.crossOrigin = 'anonymous';
      el.loop = true;
      el.preload = 'auto';
      el.src = l.url;
      const g = this.ctx.createGain();
      g.gain.value = l.gain;
      let node;
      try {
        node = this.ctx.createMediaElementSource(el);
        node.connect(g).connect(this.ambBus);
      } catch (e) {
        continue;
      }
      // každá vrstva začne jinde, ať se smyčky nepotkávají
      el.addEventListener('loadedmetadata', () => {
        if (el.duration > 20) el.currentTime = Math.random() * (el.duration - 10);
      });
      el.play().catch(() => {});
      this.amb.push({ el, node: g });
    }
    this.applyAmbient(0.8);
  }
  setAmbientLevel(x) {
    this.ambLevel = x;
    this.applyAmbient(0.3);
  }
  duckAmbient(on) {
    this.ambDuck = on ? 0.45 : 1;
    this.applyAmbient(1.5);
  }
  applyAmbient(t) {
    const g = this.ambBus.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(this.ambLevel * this.ambDuck, now + t);
  }
  resumeAmbient() {
    for (const a of this.amb) if (a.el.paused) a.el.play().catch(() => {});
  }

  // ---------- HUDBA ----------
  loopLen(track) {
    const sr = this.ctx.sampleRate;
    return Math.round(LOOP_BARS * 4 * (60 / track.bpm) * sr); // vzorků
  }
  spb(track) {
    return this.loopLen(track) / (LOOP_BARS * 4) / this.ctx.sampleRate; // přesná délka doby
  }

  async prepare(track, onProgress) {
    const types = [...new Set(track.structure.map((s) => s[0]))];
    let done = 0;
    for (const type of types) {
      const key = track.id + ':' + type;
      if (!this.loops.has(key)) {
        const buf = await this.renderLoop(track, type);
        this.loops.set(key, buf);
      }
      done++;
      if (onProgress) onProgress(done / types.length);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  isPrepared(track) {
    return track.structure.every((s) => this.loops.has(track.id + ':' + s[0]));
  }

  async renderLoop(track, type) {
    const sr = this.ctx.sampleRate;
    const N = this.loopLen(track);
    const spb = this.spb(track);
    const tail = Math.round(1.6 * sr);
    const oc = new OfflineAudioContext(2, N + tail, sr);
    const k = new Kit(oc, this.noise);
    const R = rng(track.seed * 131 + type.length * 7 + type.charCodeAt(0));

    const mix = oc.createGain();
    mix.gain.value = 0.62;
    const comp = oc.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.12;
    mix.connect(comp).connect(oc.destination);

    const rev = oc.createConvolver();
    rev.buffer = impulse(oc, 1.7, 2.8);
    const revOut = k.gain(0.28);
    rev.connect(revOut).connect(mix);

    const dly = oc.createDelay(2);
    dly.delayTime.value = spb * 0.75;
    const fb = k.gain(0.33);
    const dlf = k.filt('lowpass', 2600);
    dly.connect(dlf).connect(fb).connect(dly);
    const dOut = k.gain(0.3);
    dlf.connect(dOut).connect(mix);

    // „pumpování“ (sidechain) pro pad a basu
    const pump = k.gain(1);
    pump.connect(mix);
    const P = {
      intro: { kick: 0.8, clap: 0, hat: 'off', bass: 0, pad: 0.9, pluck: 0.55, arp: 0, cut: 900 },
      groove: { kick: 1, clap: 0.8, hat: 'off8', bass: 1, pad: 0.7, pluck: 0.3, arp: 0, cut: 1400 },
      build: { kick: 1, clap: 0.7, hat: '16', bass: 1, pad: 0.75, pluck: 0, arp: 0.5, cut: 700, cutTo: 4200, riser: 1, roll: 1 },
      drop: { kick: 1.05, clap: 0.95, hat: '16', open: 1, bass: 1.15, pad: 0.85, pluck: 0, arp: 1, cut: 2800, crash: 1 },
      break: { kick: 0, clap: 0, hat: 'soft', bass: 0, pad: 1.05, pluck: 0.75, arp: 0, cut: 1100, riserEnd: 1 },
      outro: { kick: 0.85, clap: 0.6, hat: 'off', bass: 0.6, pad: 0.8, pluck: 0.35, arp: 0, cut: 1000 },
    }[type];
    const bright = track.bright || 1;
    const beats = LOOP_BARS * 4;

    for (let b = 0; b < beats; b++) {
      const t = b * spb;
      if (P.kick || P.bass) {
        pump.gain.setValueAtTime(0.32, t);
        pump.gain.linearRampToValueAtTime(1, t + spb * 0.55);
      }
    }

    for (let bar = 0; bar < LOOP_BARS; bar++) {
      const bt = bar * 4 * spb;
      const ci = bar % 4;
      const chord = track.chords[ci];
      const root = track.bass[ci];
      // pad / akordy
      if (P.pad) k.pad(bt, 4 * spb, chord.map((m) => m - 12).concat([chord[0]]), 0.22 * P.pad, P.cut * bright, pump, P.cutTo ? P.cutTo * bright : 0);
      for (let q = 0; q < 4; q++) {
        const t = bt + q * spb;
        // kick
        if (P.kick) k.kick(t, 0.95 * P.kick, mix);
        if (P.roll && bar === LOOP_BARS - 1) k.kick(t + spb / 2, 0.6, mix);
        // clap na 2 a 4
        if (P.clap && (q === 1 || q === 3)) k.clap(t, 0.5 * P.clap, mix, rev);
        if (P.roll && bar >= 2) {
          const sub = bar === 3 ? 4 : 2;
          for (let s = 0; s < sub; s++) {
            const tt = t + (s * spb) / sub;
            const pr = (bar - 2 + (q + s / sub) / 4) / 2;
            k.clap(tt, 0.12 + 0.35 * pr, mix, rev);
          }
        }
        // hi-hat
        if (P.hat === 'off' || P.hat === 'off8') k.hat(t + spb / 2, P.hat === 'off8' ? 0.22 : 0.15, P.open && q % 2 === 1, mix);
        if (P.hat === 'off8') k.hat(t, 0.07, false, mix);
        if (P.hat === '16') {
          for (let s = 0; s < 4; s++) {
            const open = P.open && s === 2;
            k.hat(t + (s * spb) / 4, s === 2 ? 0.22 : 0.09 + (s % 2) * 0.03, open, mix);
          }
        }
        if (P.hat === 'soft') k.hat(t + spb / 2, 0.06, false, mix);
        // basa (offbeat osminy, v dropu valivé šestnáctiny)
        if (P.bass) {
          if (type === 'drop') {
            for (let s = 1; s < 4; s++) k.bass(t + (s * spb) / 4, spb / 4 - 0.01, root + (s === 3 ? 12 : 0), 0.34 * P.bass, pump, bright);
          } else {
            k.bass(t + spb / 2, spb / 2 - 0.02, root, 0.36 * P.bass, pump, bright);
          }
        }
      }
      // arpeggio
      if (P.arp) {
        const tones = [chord[0], chord[1], chord[2], chord[0] + 12];
        const seq = [0, 1, 2, 3, 2, 1, 2, 3, 0, 2, 1, 3, 2, 3, 1, 2];
        for (let s = 0; s < 16; s++) {
          k.pluck(bt + (s * spb) / 4, tones[seq[s]] + 12, 0.09 * P.arp, mix, dly, 0.16, 'sawtooth');
        }
      }
      // melodie (pluck)
      if (P.pluck) {
        const tones = [chord[0], chord[1], chord[2], chord[0] + 12, chord[1] + 12];
        for (let s = 0; s < 8; s++) {
          if (R() < 0.45 || s === 0) {
            k.pluck(bt + (s * spb) / 2, tones[Math.floor(R() * tones.length)] + 12, 0.11 * P.pluck, mix, dly, 0.3, 'triangle');
          }
        }
      }
    }
    if (P.riser) k.riser(0, LOOP_BARS * 4 * spb, 0.3, mix);
    if (P.riserEnd) k.riser(beats * spb - 4 * spb, 4 * spb, 0.18, mix);
    if (P.crash) {
      k.crash(0, 0.35, mix);
      k.impact(0, 0.5, mix);
    }

    const out = await oc.startRendering();
    // ocas (dozvuk) přičíst na začátek → smyčka bez švu
    const buf = this.ctx.createBuffer(2, N, sr);
    for (let c = 0; c < 2; c++) {
      const src = out.getChannelData(c);
      const dst = buf.getChannelData(c);
      dst.set(src.subarray(0, N));
      for (let i = 0; i < tail && i < N; i++) dst[i] += src[N + i];
    }
    return buf;
  }

  // Sestaví časovou osu skladby (v dobách) a spustí přehrávání v čase `when`
  startSong(track, when) {
    this.stopSong();
    const c = this.ctx;
    const loopSec = this.loopLen(track) / c.sampleRate;
    const segs = [];
    let at = 0;
    for (const [type, bars] of track.structure) {
      for (let i = 0; i < bars / LOOP_BARS; i++) {
        segs.push({ type, at });
        at += loopSec;
      }
    }
    const gain = c.createGain();
    gain.connect(this.musicBus);
    this.song = { track, startAt: when, segs, next: 0, gain, sources: [], duration: at, paused: false, est: 0, last: 0 };
    this.schedule();
    return at;
  }

  // vlastní skladba (celý AudioBuffer)
  startBuffer(buffer, when) {
    this.stopSong();
    const c = this.ctx;
    const gain = c.createGain();
    gain.gain.value = 0.95;
    gain.connect(this.musicBus);
    this.song = { kind: 'buffer', buffer, startAt: when, segs: [], next: 0, gain, sources: [], duration: buffer.duration, paused: false, est: 0 };
    this.playBufferFrom(0, when);
    return buffer.duration;
  }
  playBufferFrom(offset, when) {
    const s = this.song;
    const src = this.ctx.createBufferSource();
    src.buffer = s.buffer;
    src.connect(s.gain);
    src.start(when, Math.max(0, offset));
    s.sources = [src];
  }

  schedule() {
    const s = this.song;
    if (!s || s.paused || s.kind === 'buffer') return;
    const c = this.ctx;
    while (s.next < s.segs.length && s.startAt + s.segs[s.next].at < c.currentTime + 1.5) {
      const seg = s.segs[s.next];
      const src = c.createBufferSource();
      src.buffer = this.loops.get(s.track.id + ':' + seg.type);
      src.connect(s.gain);
      const when = s.startAt + seg.at;
      if (when >= c.currentTime - 0.01) src.start(Math.max(when, c.currentTime));
      else src.start(c.currentTime, c.currentTime - when);
      if (s.next === s.segs.length - 1) {
        const loopSec = src.buffer.duration;
        s.gain.gain.setValueAtTime(1, when + loopSec * 0.4);
        s.gain.gain.linearRampToValueAtTime(0.0001, when + loopSec);
      }
      s.sources.push(src);
      s.next++;
    }
    if (s.sources.length > 6) s.sources.splice(0, s.sources.length - 6);
  }

  stopSong(fade = 0) {
    const s = this.song;
    if (!s) return;
    const c = this.ctx;
    if (fade > 0) {
      s.gain.gain.cancelScheduledValues(c.currentTime);
      s.gain.gain.setValueAtTime(s.gain.gain.value, c.currentTime);
      s.gain.gain.linearRampToValueAtTime(0.0001, c.currentTime + fade);
      const srcs = s.sources;
      setTimeout(() => srcs.forEach((x) => { try { x.stop(); } catch (e) {} }), fade * 1000 + 50);
    } else {
      s.sources.forEach((x) => { try { x.stop(); } catch (e) {} });
      s.gain.disconnect();
    }
    this.song = null;
  }

  pauseSong() {
    const s = this.song;
    if (!s || s.paused) return;
    s.pausedAt = s.est;
    s.paused = true;
    s.sources.forEach((x) => { try { x.stop(); } catch (e) {} });
    s.sources = [];
    s.gain.gain.cancelScheduledValues(this.ctx.currentTime);
    s.gain.gain.setValueAtTime(1, this.ctx.currentTime);
  }

  resumeSong(lead = 0.15) {
    const s = this.song;
    if (!s || !s.paused) return;
    const c = this.ctx;
    s.startAt = c.currentTime + lead - s.pausedAt;
    if (s.kind === 'buffer') {
      s.paused = false;
      s.init = false;
      this.playBufferFrom(s.pausedAt, c.currentTime + lead);
      return;
    }
    let k = 0;
    for (let i = 0; i < s.segs.length; i++) if (s.segs[i].at <= s.pausedAt + 1e-6) k = i;
    s.next = k;
    s.paused = false;
    s.init = false;
    this.schedule();
  }

  // surový čas toho, co je právě slyšet
  rawNow() {
    const c = this.ctx;
    if (c.getOutputTimestamp) {
      const ts = c.getOutputTimestamp();
      if (ts && ts.contextTime > 0 && ts.performanceTime > 0) {
        return ts.contextTime + Math.min(0.1, Math.max(0, (performance.now() - ts.performanceTime) / 1000));
      }
    }
    return c.currentTime - (c.outputLatency || c.baseLatency || 0);
  }

  // vyhlazený čas skladby v sekundách (monotónní)
  songTime(dt, offsetMs = 0) {
    const s = this.song;
    if (!s) return 0;
    if (s.paused) return s.pausedAt;
    if (this.ctx.state !== 'running') return s.est;
    const raw = this.rawNow() - s.startAt + offsetMs / 1000;
    if (!s.init) {
      s.est = raw;
      s.init = true;
    } else {
      s.est += dt;
      const err = raw - s.est;
      if (Math.abs(err) > 0.06) s.est = raw;
      else s.est += err * 0.12;
    }
    return s.est;
  }

  // ---------- EFEKTY ----------
  async renderSfx() {
    const sr = this.ctx.sampleRate;
    const defs = {
      hit: [0.5, (k, d) => {
        k.tone(0, 130, 0.16, 0.9, 'sine', d, 48);
        k.noiseBurst(0, 0.07, 0.6, 'bandpass', 2600, 1, d);
        k.noiseBurst(0.005, 0.25, 0.25, 'highpass', 5000, 0.7, d);
        [2900, 3700, 4600].forEach((f, i) => k.tone(0.01 + i * 0.012, f, 0.12, 0.05, 'sine', d));
      }],
      hitBig: [0.7, (k, d) => {
        k.tone(0, 110, 0.25, 1, 'sine', d, 38);
        k.noiseBurst(0, 0.1, 0.7, 'bandpass', 1800, 0.8, d);
        k.noiseBurst(0.005, 0.4, 0.3, 'highpass', 4200, 0.7, d);
        [2400, 3100, 3900, 5200].forEach((f, i) => k.tone(0.01 + i * 0.015, f, 0.16, 0.05, 'sine', d));
      }],
      perfect: [0.9, (k, d) => {
        k.tone(0, 1568, 0.5, 0.16, 'sine', d);
        k.tone(0.0, 2349, 0.45, 0.09, 'sine', d);
        k.tone(0.03, 3136, 0.35, 0.05, 'triangle', d);
      }],
      weak: [0.2, (k, d) => {
        k.tone(0, 420, 0.06, 0.35, 'triangle', d, 300);
        k.noiseBurst(0, 0.03, 0.15, 'bandpass', 1500, 1, d);
      }],
      wrong: [0.3, (k, d) => {
        k.tone(0, 150, 0.16, 0.55, 'square', d, 90);
      }],
      miss: [0.45, (k, d) => {
        k.noiseBurst(0, 0.32, 0.25, 'bandpass', 1300, 1.2, d, 280);
        k.tone(0, 330, 0.25, 0.08, 'sine', d, 180);
      }],
      whoosh: [0.6, (k, d) => {
        k.noiseBurst(0, 0.5, 0.45, 'bandpass', 380, 1.8, d, 2600);
      }],
      barrierHit: [0.5, (k, d) => {
        k.tone(0, 110, 0.35, 0.4, 'sawtooth', d, 70);
        k.tone(0, 80, 0.25, 0.7, 'sine', d, 40);
        k.noiseBurst(0, 0.12, 0.4, 'lowpass', 900, 0.7, d);
      }],
      combo: [0.6, (k, d) => {
        [72, 76, 79, 84].forEach((m, i) => k.tone(i * 0.06, 440 * Math.pow(2, (m - 69) / 12), 0.25, 0.18, 'triangle', d));
      }],
      count: [0.25, (k, d) => k.tone(0, 880, 0.14, 0.3, 'sine', d)],
      go: [0.5, (k, d) => {
        k.tone(0, 1320, 0.35, 0.25, 'sine', d);
        k.tone(0, 1760, 0.35, 0.18, 'triangle', d);
      }],
      click: [0.1, (k, d) => {
        k.tone(0, 1900, 0.03, 0.25, 'sine', d);
        k.noiseBurst(0, 0.015, 0.1, 'highpass', 4000, 0.7, d);
      }],
      pause: [0.35, (k, d) => {
        k.tone(0, 880, 0.12, 0.22, 'sine', d);
        k.tone(0.12, 660, 0.16, 0.22, 'sine', d);
      }],
      finish: [1.8, (k, d) => {
        [60, 64, 67, 72, 76].forEach((m, i) => k.tone(i * 0.09, 440 * Math.pow(2, (m - 69) / 12), 1.2 - i * 0.1, 0.15, 'triangle', d));
        k.crash(0.36, 0.25, d);
      }],
      splash: [0.4, (k, d) => {
        k.noiseBurst(0, 0.3, 0.18, 'bandpass', 900, 0.6, d, 2500);
      }],
    };
    for (const [name, [dur, fn]] of Object.entries(defs)) {
      const oc = new OfflineAudioContext(1, Math.ceil(dur * sr), sr);
      const k = new Kit(oc, this.noise);
      const g = oc.createGain();
      g.gain.value = 0.9;
      g.connect(oc.destination);
      fn(k, g);
      this.sfx[name] = await oc.startRendering();
    }
  }

  play(name, opts = {}) {
    const buf = this.sfx[name];
    if (!buf) return;
    const c = this.ctx;
    // limit hlasů
    const now = c.currentTime;
    this.voices = this.voices.filter((v) => v.end > now);
    if (this.voices.length > 18) {
      const v = this.voices.shift();
      try { v.src.stop(); } catch (e) {}
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    if (opts.rate) src.playbackRate.value = opts.rate;
    const g = c.createGain();
    g.gain.value = opts.gain == null ? 1 : opts.gain;
    let node = src.connect(g);
    if (opts.pan && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      node = node.connect(p);
    }
    node.connect(this.sfxBus);
    src.start();
    this.voices.push({ src, end: now + buf.duration / (opts.rate || 1) });
  }
}
