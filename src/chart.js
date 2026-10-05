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
  // bariéry: min. 3 doby od sebe, kolem nich volno
  const barriers = [];
  for (const e of raw) {
    if (e.kind !== 'b') continue;
    if (barriers.length && e.beat - barriers[barriers.length - 1].beat < 3) continue;
    barriers.push(e);
  }
  let events = raw.filter((e) => e.kind === 't' && !barriers.some((b) => Math.abs(b.beat - e.beat) < 0.9));
  // stejná ruka nejdřív za 0,35 s
  const lastT = { L: -9, R: -9 };
  const ok = [];
  for (const e of events) {
    const t = e.beat * spb;
    if (t - lastT[e.hand] < 0.35) {
      const other = e.hand === 'L' ? 'R' : 'L';
      if (t - lastT[other] >= 0.35 && e.type !== 'hook') e.hand = other;
      else continue;
    }
    lastT[e.hand] = t;
    ok.push(e);
  }
  events = ok.concat(barriers).filter((e) => e.beat >= 8 && e.beat <= totalBeats - 4);
  events.sort((a, b) => a.beat - b.beat);
  events.forEach((e, i) => {
    e.i = i;
    e.t = e.beat * spb;
  });
  return { events, totalBeats, duration: totalBeats * spb, targets: events.filter((e) => e.kind === 't').length, barriers: events.filter((e) => e.kind === 'b').length };
}
