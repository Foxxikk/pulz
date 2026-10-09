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
  const totalBeats = bar * 4;
  // bariéry z plánovače místo pevných ze vzorů
  const phr = [];
  let bb = 0;
  for (const [type, bars] of track.structure) {
    for (let p = 0; p < bars / 2; p++) phr.push({ b: bb + p * 8, type });
    bb += bars * 4;
  }
  const rawT = raw.filter((e) => e.kind !== 'b').concat(planBarriers(phr, totalBeats - 4, () => spb, diffId, R));
  raw.length = 0;
  raw.push(...rawT);
  raw.sort((a, b) => a.beat - b.beat);

  const events = finalize(raw, (b) => b * spb, 8, totalBeats - 4);
  addFinale(events, (b) => b * spb, totalBeats - 2, totalBeats * spb);
  return { events, totalBeats, duration: totalBeats * spb, targets: events.filter((e) => e.kind === 't').length, barriers: events.filter((e) => e.kind === 'b').length };
}


// ---------- bariéry: půlkruhy (i šikmé), spirály za sebou a létající zdi ----------
// úhel v násobcích 45°: 0 = podřep, ±1 = podřep do strany (šikmo), ±2 = úklon
const SPIRAL_TYPE = { '-2': 'leanL', '-1': 'duckL', 0: 'duck', 1: 'duckR', 2: 'leanR' };
const BAR_PLAN = {
  // pravděpodobnost bariérové figury ve frázi podle sekce
  easy: { intro: 0, groove: 0.35, build: 0.45, drop: 0.25, break: 0.6, outro: 0, seq: 6, slalom: 2 },
  mid: { intro: 0.1, groove: 0.4, build: 0.55, drop: 0.35, break: 0.75, outro: 0, seq: 11, slalom: 2 },
  hard: { intro: 0.2, groove: 0.5, build: 0.7, drop: 0.45, break: 0.85, outro: 0, seq: 15, slalom: 3 },
};

// phrases: [{ b: první doba fráze (8 dob), type }]; spbAt(b) = délka doby v s
function planBarriers(phrases, maxBeat, spbAt, diffId, R) {
  const P = BAR_PLAN[diffId];
  const out = [];
  let free = 6; // první doba, od které smí přijít další figura
  let seqId = 0;
  phrases.forEach((ph, pi) => {
    const p = P[ph.type] ?? 0.3;
    if (ph.b < free || ph.b + 8 > maxBeat - 4 || R() >= p) return;
    const spb = spbAt(ph.b + 2);
    const kind = ph.type === 'break' || ph.type === 'build' ? 'spiral' : ph.type === 'drop' ? (R() < 0.7 ? 'slalom' : 'single') : R() < 0.45 ? 'single' : R() < 0.6 ? 'spiral' : 'wall';
    seqId++;
    if (kind === 'spiral') {
      // hustá spirála půlkruhů: každý pootočený o 22,5°, po půldobách → hlava plynule opisuje oblouk
      const half = spb * 0.5 >= 0.2 && diffId !== 'easy';
      const step = half ? 0.5 : 1;
      const len = P.seq;
      const STEP = Math.PI / 8;
      let a = 0, d = R() < 0.5 ? -1 : 1;
      if (diffId !== 'easy' && R() < 0.5) a = -d * 4; // začne úklonem a přejde přes podřep na druhou stranu
      const lim = diffId === 'easy' ? 3 : 4;
      for (let k = 0; k < len; k++) {
        out.push({ kind: 'b', type: 'arc', ang: a * STEP, beat: ph.b + 1 + k * step, sx: 0, sy: 0, seq: seqId, si: k });
        let n = a + d;
        if (Math.abs(n) > lim) {
          d = -d;
          n = a + d;
        }
        a = n;
      }
      free = ph.b + 1 + (len - 1) * step + 5;
    } else if (kind === 'slalom') {
      // létající zdi střídavě vlevo a vpravo → krok do strany
      const step = Math.max(2, Math.ceil(0.85 / spb));
      let side = R() < 0.5 ? 'wallL' : 'wallR';
      const len = P.slalom;
      for (let k = 0; k < len; k++) {
        out.push({ kind: 'b', type: side, beat: ph.b + 2 + k * step, sx: 0, sy: 0, seq: seqId });
        side = side === 'wallL' ? 'wallR' : 'wallL';
      }
      free = ph.b + 2 + (len - 1) * step + 5;
    } else if (kind === 'wall') {
      out.push({ kind: 'b', type: R() < 0.5 ? 'wallL' : 'wallR', beat: ph.b + 4, sx: 0, sy: 0, seq: seqId });
      free = ph.b + 9;
    } else {
      const pool = diffId === 'easy' ? ['duck', 'duck', 'wallL', 'wallR'] : ['duck', 'duckL', 'duckR', 'leanL', 'leanR', 'wallL', 'wallR'];
      out.push({ kind: 'b', type: pool[Math.floor(R() * pool.length)], beat: ph.b + 4, sx: 0, sy: 0, seq: seqId });
      free = ph.b + 9;
    }
  });
  return out;
}

// společné dočištění: bariéry, volno kolem nich, stejná ruka min. 0,35 s, časy
function finalize(raw, timeOf, minBeat, maxBeat) {
  raw.sort((a, b) => a.beat - b.beat);
  // bariéry naplánované planBarriers (figury: spirála půlkruhů, slalom zdí, jednotlivé)
  const barriers = raw.filter((e) => e.kind === 'b');
  // terče ne těsně u bariér a ne uvnitř figury (hráč se vyhýbá, ne boxuje)
  const seqSpan = {};
  for (const b of barriers) {
    const sp = (seqSpan[b.seq] = seqSpan[b.seq] || [b.beat, b.beat]);
    sp[0] = Math.min(sp[0], b.beat);
    sp[1] = Math.max(sp[1], b.beat);
  }
  const spans = Object.values(seqSpan);
  let events = raw.filter((e) => e.kind === 't' && !barriers.some((b) => Math.abs(b.beat - e.beat) < 1.1) && !spans.some(([a, z]) => e.beat > a - 1.1 && e.beat < z + 1.1));
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
  let lastT = -9;
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
  }
  let minBeat = 0;
  while (minBeat < beats.length && beats[minBeat] < 3.5) minBeat++;
  const lastPh = phrases.filter((p) => p.type !== 'silent').pop();
  const maxBeat = lastPh ? lastPh.b + 8 : beats.length - 1;
  const spbAt = (b) => timeOf(b + 1) - timeOf(b);
  const phr = phrases.filter((p) => p.type !== 'silent').map((p) => ({ b: p.b, type: p.type }));
  raw.push(...planBarriers(phr, Math.min(maxBeat, beats.length - 2), spbAt, diffId, R));
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
