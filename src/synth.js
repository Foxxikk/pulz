// Syntetizované nástroje pro OfflineAudioContext (předrenderování – na Questu se živá syntéza seká)
export const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function makeNoise(ctx, secs = 2) {
  const sr = ctx.sampleRate;
  const b = ctx.createBuffer(1, Math.floor(sr * secs), sr);
  const d = b.getChannelData(0);
  let s = 1234567;
  for (let i = 0; i < d.length; i++) {
    s = (s * 16807) % 2147483647;
    d[i] = (s / 2147483647) * 2 - 1;
  }
  return b;
}

export function impulse(oc, secs = 1.8, decay = 2.6) {
  const sr = oc.sampleRate;
  const n = Math.floor(sr * secs);
  const b = oc.createBuffer(2, n, sr);
  let s = 99991;
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) {
      s = (s * 16807) % 2147483647;
      d[i] = ((s / 2147483647) * 2 - 1) * Math.pow(1 - i / n, decay);
    }
  }
  return b;
}

// Sada nástrojů nad jedním offline kontextem
export class Kit {
  constructor(oc, noise) {
    this.oc = oc;
    this.noise = noise;
    this.noff = 0;
  }
  gain(v = 1) {
    const g = this.oc.createGain();
    g.gain.value = v;
    return g;
  }
  filt(type, f, q = 0.7) {
    const b = this.oc.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  }
  noiseSrc(t, dur) {
    const s = this.oc.createBufferSource();
    s.buffer = this.noise;
    this.noff = (this.noff + 0.37) % 1.3;
    s.start(t, this.noff, dur + 0.02);
    return s;
  }
  // obálka: náběh a, vrchol p, pokles d
  env(param, t, a, p, d) {
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(p, t + a);
    param.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  kick(t, v, dest) {
    const oc = this.oc;
    const o = oc.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(175, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.08);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.32);
    const g = this.gain(0);
    this.env(g.gain, t, 0.003, v, 0.42);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.5);
    const n = this.noiseSrc(t, 0.03);
    const hp = this.filt('highpass', 2800);
    const g2 = this.gain(0);
    this.env(g2.gain, t, 0.001, 0.22 * v, 0.018);
    n.connect(hp).connect(g2).connect(dest);
  }

  clap(t, v, dest, send) {
    const n = this.noiseSrc(t, 0.3);
    const bp = this.filt('bandpass', 1500, 0.9);
    const g = this.gain(0);
    const p = g.gain;
    p.setValueAtTime(0.0001, t);
    for (let k = 0; k < 3; k++) {
      const tk = t + k * 0.011;
      p.setValueAtTime(v * 0.9, tk);
      p.exponentialRampToValueAtTime(v * 0.25, tk + 0.009);
    }
    p.setValueAtTime(v * 0.8, t + 0.034);
    p.exponentialRampToValueAtTime(0.0001, t + 0.22);
    n.connect(bp).connect(g);
    g.connect(dest);
    if (send) {
      const s = this.gain(0.35);
      g.connect(s).connect(send);
    }
  }

  hat(t, v, open, dest) {
    const n = this.noiseSrc(t, open ? 0.3 : 0.06);
    const hp = this.filt('highpass', open ? 7500 : 8500);
    const g = this.gain(0);
    this.env(g.gain, t, 0.001, v, open ? 0.24 : 0.045);
    n.connect(hp).connect(g).connect(dest);
  }

  bass(t, dur, midi, v, dest, bright = 1) {
    const oc = this.oc;
    const o1 = oc.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = hz(midi);
    const o2 = oc.createOscillator();
    o2.type = 'square';
    o2.frequency.value = hz(midi - 12);
    const lp = this.filt('lowpass', 200, 4);
    lp.frequency.setValueAtTime(180, t);
    lp.frequency.exponentialRampToValueAtTime(700 * bright, t + 0.02);
    lp.frequency.exponentialRampToValueAtTime(220, t + dur * 0.9);
    const g = this.gain(0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.006);
    g.gain.setValueAtTime(v, t + dur * 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const g2 = this.gain(0.5);
    o1.connect(lp);
    o2.connect(g2).connect(lp);
    lp.connect(g).connect(dest);
    o1.start(t);
    o2.start(t);
    o1.stop(t + dur + 0.02);
    o2.stop(t + dur + 0.02);
  }

  pad(t, dur, notes, v, cut, dest, cutTo) {
    const oc = this.oc;
    const lp = this.filt('lowpass', cut, 0.5);
    if (cutTo) {
      lp.frequency.setValueAtTime(cut, t);
      lp.frequency.exponentialRampToValueAtTime(cutTo, t + dur);
    }
    const g = this.gain(0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + Math.min(0.25, dur * 0.3));
    g.gain.setValueAtTime(v, t + dur - 0.12);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.05);
    lp.connect(g).connect(dest);
    for (const m of notes) {
      for (const det of [-9, 8]) {
        const o = oc.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz(m);
        o.detune.value = det;
        const og = this.gain(0.16);
        o.connect(og).connect(lp);
        o.start(t);
        o.stop(t + dur + 0.1);
      }
    }
  }

  pluck(t, midi, v, dest, send, len = 0.22, type = 'square') {
    const oc = this.oc;
    const o = oc.createOscillator();
    o.type = type;
    o.frequency.value = hz(midi);
    const lp = this.filt('lowpass', 3000, 2);
    lp.frequency.setValueAtTime(4200, t);
    lp.frequency.exponentialRampToValueAtTime(500, t + len);
    const g = this.gain(0);
    this.env(g.gain, t, 0.003, v, len);
    o.connect(lp).connect(g).connect(dest);
    if (send) {
      const s = this.gain(0.5);
      g.connect(s).connect(send);
    }
    o.start(t);
    o.stop(t + len + 0.05);
  }

  riser(t, dur, v, dest) {
    const n = this.noiseSrc(t, dur);
    const bp = this.filt('bandpass', 300, 2.5);
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(6000, t + dur);
    const g = this.gain(0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + dur);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.02);
    n.connect(bp).connect(g).connect(dest);
  }

  crash(t, v, dest) {
    const n = this.noiseSrc(t, 1.6);
    const hp = this.filt('highpass', 4200);
    const g = this.gain(0);
    this.env(g.gain, t, 0.002, v, 1.5);
    n.connect(hp).connect(g).connect(dest);
  }

  impact(t, v, dest) {
    const o = this.oc.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.8);
    const g = this.gain(0);
    this.env(g.gain, t, 0.005, v, 0.9);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 1);
  }

  tone(t, f, dur, v, type, dest, fTo) {
    const o = this.oc.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t);
    if (fTo) o.frequency.exponentialRampToValueAtTime(fTo, t + dur);
    const g = this.gain(0);
    this.env(g.gain, t, 0.004, v, dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noiseBurst(t, dur, v, type, f, q, dest, fTo) {
    const n = this.noiseSrc(t, dur);
    const b = this.filt(type, f, q);
    if (fTo) {
      b.frequency.setValueAtTime(f, t);
      b.frequency.exponentialRampToValueAtTime(fTo, t + dur);
    }
    const g = this.gain(0);
    this.env(g.gain, t, Math.min(0.01, dur * 0.2), v, dur);
    n.connect(b).connect(g).connect(dest);
  }
}
