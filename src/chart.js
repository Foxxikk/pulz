// Choreografie: skládání boxerských kombinací podle hudebních sekcí a obtížnosti
import { rng } from './util.js';

// zápis: j/h/u + L/R + doba (jab, hook, zvedák); d = podřep, a = úklon vlevo, b = úklon vpravo
const LIB = {
  intro: {
    easy: ['jL0 jR4'],
    mid: ['jL0 jR2 jL4 jR6', 'jL0 jR1 jL4 jR5'],
    hard: ['jL0 jR1 jL2 jR3 jL4 jR6', 'jL0 jR1 jL4 jR5 jL6'],
  },
  groove: {
    easy: ['jL0 jR2 jL4 jR6', 'jL0 jR1 jL4 jR5', 'jL0 jR2 hL4 hR6', 'jL0 jR2 a5'],
    mid: ['jL0 jR1 jL2 jR3 hL4 hR6', 'jL0 jL1 jR2 jL4 jR5 hL6', 'jL0 jR1 hL2 jR4 jL5 hR6', 'jL0 jR2 hL4 hR6', 'a1 jR3 jL4 b5 jL7'],
    hard: ['jL0 jR1 jL2 jR3 hL4 hR6', 'jL0 jL1 jR2 jL4 jR5 hL6', 'jL0 jR0.5 jL1 hR2 jL3 jR3.5 hL4 uR5 uL6 jR7', 'a1 jR3 jL4 b5 jL7', 'jL0 jR1 hL2 jR4 jL5 hR6'],
  },
  drop: {
    easy: ['jL0 jR1 jL4 jR5', 'jL0 jR2 hL4 hR6', 'jR0 jL2 jR4 d6', 'uL0 uR2 jL4 jR6', 'hL0 hR2 jL4 jR6'],
    mid: ['jL0 jR1 jL2 jR3 hL4 hR6', 'jL0 jR1 hL2 jR4 jL5 hR6', 'uL0 uR1 jL2 jR3 hL4 hR5', 'jL0 jR1 d3 jL5 jR6 jL7', 'hL0 hR1 hL2 hR3 jL4 jR5 uL6 uR7', 'jL0 jR1 jL2 hR3 d5 jL7'],
    hard: [
      'jL0 jR0.5 jL1 hR2 jL3 jR3.5 hL4 uR5 uL6 jR7',
      'jL0 jR0.5 jL1 jR1.5 hL2 hR3 d4.5 jL6 jR6.5 jL7',
      'uL0 uR0.5 hL1 hR2 jL2.5 jR3 jL3.5 hR4 a5.5 jR7',
      'hL0 jR0.5 jL1 hR1.5 jL2.5 jR3 uL4 uR4.5 hL5 hR6 jL6.5 jR7',
      'jL0 jR0.5 jL1 jR1.5 jL2 jR2.5 hL3 hR4 d5 jL6.5 jR7',
      'hL0 hR1 hL2 hR3 jL4 jR5 uL6 uR7',
    ],
  },
  dropStart: {
    easy: ['hL0 hR2 jL4 jR6'],
    mid: ['hL0 hR1 jL2 jR3 uL4 uR5 jL6 jR7'],
    hard: ['hL0 hR1 hL2 hR3 jL4 jR4.5 jL5 jR5.5 uL6 uR7'],
  },
  break: {
    easy: ['d2', 'jL0 jR4', 'a2', 'b2 jL6'],
    mid: ['d0 jL3 jR4 d6', 'a1 jR3 jL4 b5 jL7', 'b1 jL3 jR4 a5'],
    hard: ['a1 jR3 jL4 b5 jL7', 'd0 jL2 jR2.5 d4 hL6 hR7', 'jL0 jR1 d3 jL5 jR6 jL7'],
  },
  outro: {
    easy: ['jL0 jR4'],
    mid: ['jL0 jR2 jL4 jR6'],
    hard: ['jL0 jR1 jL2 jR3 hL4 hR6'],
  },
};

function parse(str) {
  return str.split(/\s+/).filter(Boolean).map((tok) => {
    let m = tok.match(/^([jhu])([LR])([\d.]+)$/);
    if (m) return { kind: 't', type: { j: 'jab', h: 'hook', u: 'upper' }[m[1]], hand: m[2], b: parseFloat(m[3]) };
    m = tok.match(/^([dab])([\d.]+)$/);
    if (m) return { kind: 'b', type: { d: 'duck', a: 'leanL', b: 'leanR' }[m[1]], b: parseFloat(m[2]) };
    throw new Error('Chybný zápis choreografie: ' + tok);
  });
}

// generovaný nástřik: houstnoucí údery
function buildPhrase(diff, phraseIdx) {
  const out = [];
  let hand = 'L';
  const push = (b, type = 'jab') => {
    out.push({ kind: 't', type, hand, b });
    hand = hand === 'L' ? 'R' : 'L';
  };
  if (diff === 'easy') {
    if (phraseIdx === 0) for (let b = 0; b < 8; b += 2) push(b);
    else for (let b = 0; b < 7; b += 1) push(b);
  } else if (diff === 'mid') {
    if (phraseIdx === 0) for (let b = 0; b < 8; b += 1) push(b);
    else {
      for (let b = 0; b < 4; b += 1) push(b);
      for (let b = 4; b < 7; b += 0.5) push(b);
    }
  } else {
    if (phraseIdx === 0) for (let b = 0; b < 8; b += 0.5) push(b, b % 2 === 1.5 ? 'hook' : 'jab');
    else {
      for (let b = 0; b < 4; b += 0.5) push(b, b === 3 || b === 3.5 ? 'hook' : 'jab');
      for (let b = 4; b < 7; b += 0.5) push(b);
    }
  }
  return out;
}

export function buildChart(track, diffId, spb) {
  const R = rng(track.seed * 1000 + diffId.length * 17 + diffId.charCodeAt(0));
  const raw = [];
  let bar = 0;
  let prevType = null;
  for (const [type, bars] of track.structure) {
    for (let p = 0; p < bars / 2; p++) {
      const phraseBar = bar + p * 2;
      let list;
      if (type === 'build') {
        list = buildPhrase(diffId, p);
      } else {
        let lib = LIB[type][diffId];
        if (type === 'drop' && p === 0 && prevType === 'build') lib = LIB.dropStart[diffId];
        if (type === 'intro' && p === 0) continue; // první dva takty volno (odpočet)
        if (type === 'outro' && p >= bars / 2 - 1) continue; // konec volno
        list = parse(lib[Math.floor(R() * lib.length)]);
      }
      const sx = (R() - 0.5) * 0.14;
      const sy = (R() - 0.5) * 0.1;
      for (const e of list) {
        raw.push({ ...e, beat: phraseBar * 4 + e.b, sx: sx + (R() - 0.5) * 0.05, sy: sy + (R() - 0.5) * 0.05, low: e.type === 'jab' && R() < 0.15, section: type });
      }
    }
    bar += bars;
    prevType = type;
  }
  raw.sort((a, b) => a.beat - b.beat);

  const totalBeats = bar * 4;
  const events = finalize(raw, (b) => b * spb, 8, totalBeats - 4);
  addFinale(events, (b) => b * spb, totalBeats - 2, totalBeats * spb);
  return { events, totalBeats, duration: totalBeats * spb, targets: events.filter((e) => e.kind === 't').length, barriers: events.filter((e) => e.kind === 'b').length };
}

// společné dočištění: bariéry, volno kolem nich, stejná ruka min. 0,35 s, časy
function finalize(raw, timeOf, minBeat, maxBeat) {
  raw.sort((a, b) => a.beat - b.beat);
  // bariéry: min. 2 takty od sebe, úklon nikdy hned po úklonu (žádné „spirály“)
  const barriers = [];
  for (const e of raw) {
    if (e.kind !== 'b') continue;
    const prev = barriers[barriers.length - 1];
    if (prev && e.beat - prev.beat < 8) continue;
    if (prev && prev.type !== 'duck' && e.type !== 'duck' && e.beat - prev.beat < 24) e.type = 'duck';
    barriers.push(e);
  }
  let events = raw.filter((e) => e.kind === 't' && !barriers.some((b) => Math.abs(b.beat - e.beat) < 0.9));
  const lastT = { L: -9, R: -9 };
  const ok = [];
  for (const e of events) {
    const t = timeOf(e.beat);
    if (t - lastT[e.hand] < 0.35) {
      const other = e.hand === 'L' ? 'R' : 'L';
      if (t - lastT[other] >= 0.35 && e.type !== 'hook') e.hand = other;
      else continue;
    }
    lastT[e.hand] = t;
    ok.push(e);
  }
  events = ok.concat(barriers).filter((e) => e.beat >= minBeat && e.beat <= maxBeat);
  events.sort((a, b) => a.beat - b.beat);
  events.forEach((e, i) => {
    e.i = i;
    e.t = timeOf(e.beat);
  });
  return events;
}

// Choreografie pro vlastní skladbu: terče na SKUTEČNÉ výrazné údery v hudbě (onsety),
// zarovnané na rytmickou mřížku (doby a půldoby). Hustota podle sekce a obtížnosti.
const DENSITY = {
  // počet terčů na frázi (2 takty = 8 dob)
  easy: { intro: 2, groove: 3, build: 4, drop: 5, break: 2 },
  mid: { intro: 4, groove: 7, build: 9, drop: 10, break: 3 },
  hard: { intro: 6, groove: 10, build: 13, drop: 14, break: 5 },
};
const MIN_GAP = { easy: 0.45, mid: 0.28, hard: 0.2 };
const HALF_MIN = { easy: 9, mid: 0.6, hard: 0.38 }; // min. síla pro půldobu (easy = nikdy)

export function buildChartFromAnalysis(an, phrases, diffId, seed = 7) {
  const R = rng(seed * 1000 + diffId.length * 17 + diffId.charCodeAt(0));
  const beats = an.beats;
  const timeOf = (b) => {
    const i = Math.floor(b);
    if (i < 0) return beats[0] + b * (beats[1] - beats[0]);
    if (i >= beats.length - 1) return beats[beats.length - 1] + (b - beats.length + 1) * (beats[beats.length - 1] - beats[beats.length - 2]);
    return beats[i] + (b - i) * (beats[i + 1] - beats[i]);
  };
  // rychlé hledání nejsilnějšího onsetu u času t
  const ons = an.onsets || [];
  const onsetNear = (t, w) => {
    let lo = 0, hi = ons.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (ons[m].t < t - w) lo = m + 1;
      else hi = m;
    }
    let best = null;
    for (let k = lo; k < ons.length && ons[k].t <= t + w; k++) if (!best || ons[k].s > best.s) best = ons[k];
    return best;
  };
  const raw = [];
  const minGap = MIN_GAP[diffId];
  let lastT = -9, lastBarrierBeat = -99, lastLean = null;
  for (let pi = 0; pi < phrases.length; pi++) {
    const ph = phrases[pi];
    if (ph.type === 'silent') continue;
    // sloty v této frázi: doby a půldoby
    const slots = [];
    for (let k = 0; k < 16; k++) {
      const b = ph.b + k / 2;
      if (b >= beats.length - 1) break;
      const t = timeOf(b);
      const o = onsetNear(t, 0.05);
      slots.push({ b, t, half: k % 2 === 1, down: k % 8 === 0, back: k % 4 === 2, s: o ? o.s : 0, low: o ? o.low : 0 });
    }
    if (!slots.length) continue;
    // síla relativně k frázi (i v tiché pasáži najde akcenty)
    const ref = Math.max(1e-6, [...slots].map((x) => x.s).sort((a, b) => b - a)[Math.min(2, slots.length - 1)]);
    for (const x of slots) x.rel = Math.min(1.2, x.s / ref) + (x.down ? 0.12 : 0) + (x.back ? 0.06 : 0) - (x.half ? 0.08 : 0);
    const want = DENSITY[diffId][ph.type] || DENSITY[diffId].groove;
    const order = slots.filter((x) => !x.half || x.rel >= HALF_MIN[diffId]).sort((a, b) => b.rel - a.rel);
    const chosen = [];
    for (const x of order) {
      if (chosen.length >= want) break;
      if (x.rel < 0.3 && chosen.length >= want * 0.6) break;
      if (x.t - lastT < minGap && x.t > lastT) continue;
      if (chosen.some((c) => Math.abs(c.t - x.t) < minGap)) continue;
      chosen.push(x);
    }
    chosen.sort((a, b) => a.t - b.t);
    // ruce a typy úderů
    const sx = (R() - 0.5) * 0.14, sy = (R() - 0.5) * 0.1;
    let hand = R() < 0.5 ? 'L' : 'R';
    let prevT = lastT;
    const sorted = [...chosen].sort((a, b) => b.rel - a.rel);
    const accent = new Set(sorted.slice(0, Math.max(1, Math.round(chosen.length * (diffId === 'easy' ? 0.12 : 0.22)))));
    for (const x of chosen) {
      const gapBefore = x.t - prevT;
      if (gapBefore > 0.9) hand = R() < 0.5 ? 'L' : 'R';
      let type = 'jab';
      const calm = ph.type === 'intro' || ph.type === 'break';
      if (!calm && accent.has(x) && gapBefore > 0.38) {
        if (x.low > 0.55 && R() < 0.45) type = 'upper';
        else type = 'hook';
      }
      raw.push({ kind: 't', type, hand, beat: x.b, sx: sx + (R() - 0.5) * 0.05, sy: sy + (R() - 0.5) * 0.05, low: type === 'jab' && R() < 0.12, section: ph.type, acc: x.rel });
      hand = hand === 'L' ? 'R' : 'L';
      prevT = x.t;
    }
    if (chosen.length) lastT = chosen[chosen.length - 1].t;
    // bariéra: max. jedna za 4 takty, jen ve volném místě, úklony nikdy za sebou
    const barrierOk = ph.type === 'break' || ph.type === 'groove' || (ph.type === 'drop' && R() < 0.35);
    if (barrierOk && ph.b - lastBarrierBeat >= 16 && R() < (diffId === 'easy' ? 0.35 : 0.5)) {
      // najít dobu bez terče v okolí ±1,2 doby
      for (const k of [4, 6, 2, 5, 3]) {
        const bb = ph.b + k;
        if (bb >= beats.length - 2) break;
        if (raw.some((e) => e.kind === 't' && Math.abs(e.beat - bb) < 1.2)) continue;
        let type = 'duck';
        if (lastLean === null && R() < 0.25) type = R() < 0.5 ? 'leanL' : 'leanR';
        raw.push({ kind: 'b', type, beat: bb, sx: 0, sy: 0 });
        lastBarrierBeat = bb;
        lastLean = type === 'duck' ? null : type;
        break;
      }
    }
  }
  let minBeat = 0;
  while (minBeat < beats.length && beats[minBeat] < 3.5) minBeat++;
  const lastPh = phrases.filter((p) => p.type !== 'silent').pop();
  const maxBeat = lastPh ? lastPh.b + 8 : beats.length - 1;
  const events = finalize(raw, timeOf, minBeat, Math.min(maxBeat, beats.length - 2));
  addFinale(events, timeOf, Math.min(maxBeat, beats.length - 2), an.duration);
  return {
    events,
    totalBeats: beats.length,
    duration: an.duration,
    targets: events.filter((e) => e.kind === 't').length,
    barriers: events.filter((e) => e.kind === 'b').length,
  };
}

// Finále: velký zlatý terč 2 doby po posledním terči (hráč ví, že je konec)
export function addFinale(events, timeOf, maxBeat, duration) {
  const last = events.filter((e) => e.kind === 't').pop();
  if (!last) return;
  let b = Math.ceil(last.beat) + 2;
  if (b > maxBeat + 4) b = maxBeat;
  const t = timeOf(b);
  if (t > duration - 0.3) return;
  events.push({ kind: 't', type: 'finale', hand: 'B', beat: b, t, sx: 0, sy: 0.05, i: events.length, section: 'finale' });
}
