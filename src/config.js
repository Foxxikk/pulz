// Data hry – barvy, trati, obtížnosti, geometrie zásahu
export const COL = {
  L: 0x3a8dff,
  R: 0xff8a24,
  Lcss: '#3d8fff',
  Rcss: '#ff8c26',
  gold: 0xffd54a,
  goldCss: '#ffd54a',
};

// Trati: vlastní syntetizovaná hudba. structure = [typ sekce, počet taktů] (násobky 4)
export const TRACKS = [
  {
    id: 'rano',
    name: 'Ranní proud',
    desc: 'Rozcvička, pohodové tempo',
    bpm: 100,
    seed: 11,
    chords: [
      [60, 64, 67],
      [59, 62, 67],
      [57, 60, 64],
      [57, 60, 65],
    ],
    bass: [36, 43, 45, 41],
    bright: 0.9,
    structure: [
      ['intro', 8],
      ['groove', 16],
      ['build', 4],
      ['drop', 16],
      ['break', 8],
      ['groove', 8],
      ['drop', 12],
      ['outro', 4],
    ],
  },
  {
    id: 'mesto',
    name: 'Pulz města',
    desc: 'Kardio, stálý drive',
    bpm: 124,
    seed: 23,
    chords: [
      [60, 65, 68],
      [61, 65, 68],
      [60, 63, 68],
      [58, 63, 67],
    ],
    bass: [41, 37, 44, 39],
    bright: 1.0,
    structure: [
      ['intro', 8],
      ['groove', 16],
      ['build', 4],
      ['drop', 16],
      ['break', 8],
      ['build', 4],
      ['drop', 16],
      ['groove', 8],
      ['outro', 8],
    ],
  },
  {
    id: 'boure',
    name: 'Bouře na řece',
    desc: 'Výzva, rychlé série',
    bpm: 140,
    seed: 37,
    chords: [
      [62, 65, 69],
      [62, 65, 70],
      [60, 65, 69],
      [60, 64, 67],
    ],
    bass: [38, 34, 41, 36],
    bright: 1.15,
    structure: [
      ['intro', 8],
      ['groove', 16],
      ['build', 4],
      ['drop', 16],
      ['break', 8],
      ['build', 4],
      ['drop', 24],
      ['groove', 8],
      ['outro', 8],
    ],
  },
];

export const DIFFS = {
  easy: { id: 'easy', name: 'Lehká', flight: 2.2 },
  mid: { id: 'mid', name: 'Střední', flight: 1.9 },
  hard: { id: 'hard', name: 'Těžká', flight: 1.6 },
};
export const DIFF_ORDER = ['easy', 'mid', 'hard'];

// Minimální rychlost pěsti (m/s), aby úder rozbil terč
export const POWER = [
  { id: 'soft', name: 'Lehký', v: 0.9 },
  { id: 'norm', name: 'Normální', v: 1.3 },
  { id: 'strong', name: 'Silný', v: 1.8 },
];

export const GEO = {
  targetR: 0.13, // poloměr terče
  fistR: 0.06, // poloměr pěsti
  tol: 0.04, // tolerance zásahu
  spawnDist: 26, // jak daleko se terč objeví
  finalFrac: 0.15, // podíl rychlosti na konci letu (terč „doplachtí“)
  // pozice úderů vůči hlavě (pravá ruka; levá zrcadlově)
  jab: { x: 0.17, dy: -0.22, dir: [0, 0, -1] },
  hook: { x: 0.1, dy: -0.15, dir: [-1, 0, 0] },
  upper: { x: 0.13, dy: -0.33, dir: [0, 1, 0] },
};

export const JUDGE = { perfect: 0.06, great: 0.12, late: 0.22 };

export const DEFAULT_SETTINGS = {
  track: 'mesto',
  diff: 'mid',
  power: 'norm',
  barrierDrop: 0.17, // o kolik níž než hlava je spodní hrana bariéry
  weight: 75,
  audioOffset: 0, // ms
  showFps: false,
};
