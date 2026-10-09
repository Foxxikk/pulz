// Metrika: kolik terčů padne na skutečný úder v hudbě (±50 ms) a jak silný
import { analyze, phrasesFrom } from '../src/analysis.js';
import { buildChartFromAnalysis } from '../src/chart.js';
import fs from 'fs';
const buf = fs.readFileSync('/tmp/claude-0/-home-claude-pulz/bc7fd394-8c22-5c33-960d-95a1a7172d61/scratchpad/song.f32');
const mono = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
const an = analyze(mono);
const ph = phrasesFrom(an);
const strong = an.onsets.map(o => o.s).sort((a,b)=>a-b);
const med = strong[Math.floor(strong.length*0.5)];
const p75 = strong[Math.floor(strong.length*0.75)];
console.log('onsets', an.onsets.length, 'per sec', (an.onsets.length/an.duration).toFixed(2));
export function metric(events) {
  const ts = events.filter(e => e.kind === 't').map(e => e.t);
  let on = 0, onStrong = 0, dsum = 0;
  for (const t of ts) {
    let best = null, bd = 1;
    for (const o of an.onsets) { const d = Math.abs(o.t - t); if (d < bd) { bd = d; best = o; } }
    if (bd < 0.05) { on++; if (best.s >= p75) onStrong++; }
    dsum += Math.min(bd, 0.25);
  }
  return { n: ts.length, onBeat: (on/ts.length).toFixed(2), onStrong: (onStrong/ts.length).toFixed(2), meanDistMs: Math.round(dsum/ts.length*1000) };
}
for (const d of ['easy','mid','hard']) console.log(d, JSON.stringify(metric(buildChartFromAnalysis(an, ph, d).events)));
