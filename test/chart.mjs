import { buildChart } from '../src/chart.js';
import { TRACKS } from '../src/config.js';
for (const t of TRACKS) for (const d of ['easy','mid','hard']) {
  const spb = 60/t.bpm;
  const c = buildChart(t, d, spb);
  // kontrola: stejná ruka >= 0.35 s, bariéry volno
  let bad=0; const last={L:-9,R:-9};
  for (const e of c.events) { if (e.kind!=='t') continue; if (e.t-last[e.hand]<0.349) bad++; last[e.hand]=e.t; }
  const types = {}; c.events.forEach(e=>types[e.type]=(types[e.type]||0)+1);
  console.log(t.id, d, 'dur', c.duration.toFixed(0)+'s', 'targets', c.targets, 'barriers', c.barriers, 'perMin', (c.targets/c.duration*60).toFixed(0), 'bad', bad, JSON.stringify(types));
}
