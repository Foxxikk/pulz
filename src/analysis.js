// Analýza skladby v prohlížeči: onset (spektrální tok) → tempo → sledování dob (dynamické programování)
// → první doba taktu → energie po frázích (klid / groove / refrén / gradace). Bez knihoven.

const SR = 22050;
const N = 1024; // okno FFT
const HOP = 256; // ~11.6 ms

function fftRadix2(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

// mono + převzorkování na ~22 kHz (průměrování)
export function toMono(channels, sampleRate) {
  const len = channels[0].length;
  const ratio = sampleRate / SR;
  const outLen = Math.floor(len / ratio);
  const out = new Float32Array(outLen);
  const nc = channels.length;
  for (let i = 0; i < outLen; i++) {
    const a = Math.floor(i * ratio), b = Math.max(a + 1, Math.floor((i + 1) * ratio));
    let s = 0;
    for (let c = 0; c < nc; c++) {
      const ch = channels[c];
      for (let k = a; k < b && k < len; k++) s += ch[k];
    }
    out[i] = s / (nc * (b - a));
  }
  return out;
}

function movingAvg(x, w) {
  const out = new Float32Array(x.length);
  let s = 0;
  const h = Math.floor(w / 2);
  const pre = new Float64Array(x.length + 1);
  for (let i = 0; i < x.length; i++) pre[i + 1] = pre[i] + x[i];
  for (let i = 0; i < x.length; i++) {
    const a = Math.max(0, i - h), b = Math.min(x.length, i + h + 1);
    out[i] = (pre[b] - pre[a]) / (b - a);
  }
  return out;
}

export function analyze(mono, onProgress) {
  const frames = Math.max(1, Math.floor((mono.length - N) / HOP));
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const nb = N / 2;
  const prev = new Float32Array(nb);
  const cur = new Float32Array(nb);
  const re = new Float32Array(N), im = new Float32Array(N);
  const flux = new Float32Array(frames);
  const low = new Float32Array(frames);
  const rms = new Float32Array(frames);
  const binHz = SR / N;
  const lowBin = Math.ceil(160 / binHz);
  for (let f = 0; f < frames; f++) {
    const o = f * HOP;
    let e = 0;
    for (let i = 0; i < N; i++) {
      const v = mono[o + i];
      e += v * v;
      re[i] = v * win[i];
      im[i] = 0;
    }
    rms[f] = Math.sqrt(e / N);
    fftRadix2(re, im);
    let fl = 0, lo = 0;
    for (let k = 1; k < nb; k++) {
      const m = Math.log1p(100 * Math.hypot(re[k], im[k]));
      cur[k] = m;
      const d = m - prev[k];
      if (d > 0) {
        fl += d;
        if (k <= lowBin) lo += d;
      }
    }
    flux[f] = fl;
    low[f] = lo;
    prev.set(cur);
    if (onProgress && f % 2000 === 0) onProgress((f / frames) * 0.7);
  }
  const fps = SR / HOP;
  // normalizace onsetu: odečíst lokální průměr, ořezat záporné
  const avg = movingAvg(flux, Math.round(fps * 0.5));
  const onset = new Float32Array(frames);
  let mx = 1e-9;
  for (let i = 0; i < frames; i++) {
    onset[i] = Math.max(0, flux[i] - avg[i]);
    mx = Math.max(mx, onset[i]);
  }
  for (let i = 0; i < frames; i++) onset[i] /= mx;
  const lavg = movingAvg(low, Math.round(fps * 0.5));
  const lowOn = new Float32Array(frames);
  for (let i = 0; i < frames; i++) lowOn[i] = Math.max(0, low[i] - lavg[i]);
  let lmx = 1e-9;
  for (let i = 0; i < frames; i++) lmx = Math.max(lmx, lowOn[i]);

  // ---- jednotlivé údery v hudbě (vrcholy onsetu nad adaptivním prahem) ----
  const thr = movingAvg(onset, Math.round(fps * 1.0));
  const onsets = [];
  const minGap = Math.round(fps * 0.06);
  let lastI = -999;
  for (let i = 1; i < frames - 1; i++) {
    const v = onset[i];
    if (v < onset[i - 1] || v < onset[i + 1]) continue;
    if (v < thr[i] * 1.4 + 0.03) continue;
    if (i - lastI < minGap) {
      if (onsets.length && v > onsets[onsets.length - 1].s) onsets.pop();
      else continue;
    }
    let lo = 0;
    for (let k = i - 2; k <= i + 2; k++) if (k >= 0 && k < frames) lo = Math.max(lo, lowOn[k] / lmx);
    onsets.push({ t: (i * HOP + N / 2) / SR + 0.025, s: v, low: lo });
    lastI = i;
  }

  // ---- tempo: autokorelace + preference okolo 120 BPM ----
  const minLag = Math.round((fps * 60) / 180), maxLag = Math.round((fps * 60) / 70);
  let best = minLag, bestScore = -1;
  const ac = new Float32Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let i = lag; i < frames; i++) s += onset[i] * onset[i - lag];
    ac[lag] = s;
  }
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = (60 * fps) / lag;
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2));
    // přičíst i dvojnásobek periody (stabilnější)
    const s = (ac[lag] + 0.5 * (2 * lag <= maxLag + 1 ? ac[2 * lag] || 0 : 0)) * prior;
    if (s > bestScore) {
      bestScore = s;
      best = lag;
    }
  }
  // zpřesnění parabolou
  let lagF = best;
  if (best > minLag && best < maxLag) {
    const a = ac[best - 1], b = ac[best], c = ac[best + 1];
    const den = a - 2 * b + c;
    if (Math.abs(den) > 1e-9) lagF = best + (0.5 * (a - c)) / den;
  }
  const period = lagF; // v rámcích
  if (onProgress) onProgress(0.8);

  // ---- sledování dob (Ellis 2007) ----
  const alpha = 400;
  const score = new Float32Array(frames);
  const back = new Int32Array(frames).fill(-1);
  const lo2 = Math.round(period * 0.5), hi2 = Math.round(period * 2);
  for (let t = 0; t < frames; t++) {
    let bs = 0, bp = -1;
    for (let p = t - hi2; p <= t - lo2; p++) {
      if (p < 0) continue;
      const r = Math.log((t - p) / period);
      const v = score[p] - alpha * r * r;
      if (v > bs || bp < 0) {
        bs = v;
        bp = p;
      }
    }
    score[t] = onset[t] + (bp >= 0 ? Math.max(0, bs) : 0);
    back[t] = bs > 0 ? bp : -1;
  }
  // konec: nejlepší skóre v poslední periodě
  let end = frames - 1, es = -1;
  for (let t = Math.max(0, frames - Math.round(period)); t < frames; t++)
    if (score[t] > es) {
      es = score[t];
      end = t;
    }
  const bf = [];
  for (let t = end; t >= 0; t = back[t]) {
    bf.push(t);
    if (back[t] < 0) break;
  }
  bf.reverse();
  // doplnit doby před první nalezenou (intro) – jen pokud je tam zvuk
  // +25 ms: změřeno proti náběhům bicích (spektrální tok reaguje o kousek dřív)
  const beats = bf.map((f) => (f * HOP + N / 2) / SR + 0.025);

  // ---- energie a první doba taktu ----
  const rmsS = movingAvg(rms, Math.round(fps * 0.4));
  const atT = (arr, t) => arr[Math.max(0, Math.min(frames - 1, Math.round((t * SR - N / 2) / HOP)))];
  const beatOn = beats.map((t) => {
    let m = 0;
    const c = Math.round((t * SR - N / 2) / HOP);
    for (let k = c - 2; k <= c + 2; k++) if (k >= 0 && k < frames) m = Math.max(m, lowOn[k]);
    return m;
  });
  let phase = 0, ps = -1;
  for (let ph = 0; ph < 4; ph++) {
    let s = 0;
    for (let i = ph; i < beats.length; i += 4) s += beatOn[i];
    if (s > ps) {
      ps = s;
      phase = ph;
    }
  }
  const beatE = beats.map((t) => atT(rmsS, t));
  const halfOn = beats.map((t, i) => {
    const t2 = i + 1 < beats.length ? (t + beats[i + 1]) / 2 : t + period * HOP / SR / 2;
    return atT(onset, t2);
  });
  if (onProgress) onProgress(0.95);
  const bpm = (60 * fps) / period;
  return { bpm, beats, phase, beatE, beatOn, halfOn, onsets, duration: mono.length / SR };
}

// Fráze po 2 taktech → typ sekce podle energie
export function phrasesFrom(an) {
  const { beats, phase, beatE } = an;
  const out = [];
  const sorted = [...beatE].sort((a, b) => a - b);
  const q = (p) => sorted[Math.floor(p * (sorted.length - 1))];
  const loud = q(0.62), quiet = q(0.25), silent = q(0.04) * 1.5 + 0.004;
  const startB = phase;
  for (let b = startB; b + 8 <= beats.length; b += 8) {
    let e = 0;
    for (let k = b; k < b + 8; k++) e += beatE[k];
    e /= 8;
    let type = e >= loud ? 'drop' : e <= quiet ? 'break' : 'groove';
    if (e < silent) type = 'silent';
    out.push({ b, e, type });
  }
  // gradace: fráze před výrazným zesílením
  for (let i = 0; i + 1 < out.length; i++) {
    if (out[i].type !== 'drop' && out[i + 1].type === 'drop' && out[i + 1].e > out[i].e * 1.15) out[i].type = 'build';
  }
  // první fráze s hudbou = intro (lehké)
  const first = out.findIndex((p) => p.type !== 'silent');
  if (first >= 0 && out[first].type !== 'drop') out[first].type = 'intro';
  return out;
}
