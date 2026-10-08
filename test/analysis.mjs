import { analyze, phrasesFrom } from '../src/analysis.js';
import fs from 'fs';
const buf = fs.readFileSync('/tmp/claude-0/-home-claude-pulz/bc7fd394-8c22-5c33-960d-95a1a7172d61/scratchpad/song.f32');
const mono = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
const t0 = Date.now();
const an = analyze(mono);
console.log('ms', Date.now() - t0, 'bpm', an.bpm.toFixed(2), 'beats', an.beats.length, 'phase', an.phase, 'first', an.beats.slice(0, 6).map(x => x.toFixed(3)).join(' '));
const ph = phrasesFrom(an);
console.log(ph.map(p => (an.beats[p.b]).toFixed(0) + ':' + p.type[0]).join(' '));
fs.writeFileSync('/tmp/claude-0/-home-claude-pulz/bc7fd394-8c22-5c33-960d-95a1a7172d61/scratchpad/js_beats.json', JSON.stringify(an.beats));
const { buildChartFromAnalysis } = await import('../src/chart.js');
for (const d of ['easy','mid','hard']) { const c = buildChartFromAnalysis(an, ph, d); console.log(d, 'targets', c.targets, 'barriers', c.barriers, 'first', c.events[0].t.toFixed(2), 'last', c.events[c.events.length-1].t.toFixed(1), 'perMin', (c.targets / c.duration * 60).toFixed(0)); }
