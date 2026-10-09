// Uhlazení choreografie: „lidská“ nahrávka (zpoždění, rozptyl, dvojité rány) → kolik sedí do hudby
import { chromium } from 'playwright';
const MP3 = '/root/.claude/uploads/bc7fd394-8c22-5c33-960d-95a1a7172d61/fdb7d188-Imagine_Dragons_-_Believer_Official_Music_Video_-_320_Kbps.mp3';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://127.0.0.1:8123/index.html');
await page.waitForFunction(() => window.__app, null, { timeout: 30000 });
await page.setInputFiles('#file-song', MP3);
await page.waitForFunction(() => window.__app.customTrack && window.__app.customTrack.an, null, { timeout: 120000 });
console.log(await page.evaluate(async () => {
  const { beatMap, smoothChoreo } = await import('/src/choreo.js');
  const { TRACKS } = await import('/src/config.js');
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-6)) * Math.cos(6.283 * rnd());
  const res = {};
  for (const tr of [TRACKS.find((t) => t.id === 'mesto'), window.__app.customTrack]) {
    const spb = 60 / tr.bpm;
    const map = beatMap(tr, spb);
    // hudební akcenty: vestavěná = doby; vlastní = silné onsety
    let acc;
    if (tr.custom) {
      const ss = tr.an.onsets.map((o) => o.s).sort((a, b) => a - b);
      acc = tr.an.onsets.filter((o) => o.s >= ss[Math.floor(ss.length * 0.55)]).map((o) => o.t);
    } else acc = Array.from({ length: 400 }, (_, i) => i * spb);
    // „pravda“: hráč boxuje na akcenty (každý 2.), střídá ruce
    const truth = acc.filter((t, i) => i % 2 === 0 && t > 5 && t < 60);
    const ev = [];
    truth.forEach((t0, i) => {
      const hand = i % 2 ? 'R' : 'L';
      const add = (dt) => {
        const t = t0 + 0.07 + gauss() * 0.045 + dt;
        const rb = map.beatOf(t);
        ev.push({ kind: 't', type: 'jab', hand, beat: Math.round(rb * 2) / 2, rb, yaw: (rnd() - 0.5) * 0.3, px: (hand === 'L' ? -0.2 : 0.2) + (rnd() - 0.5) * 0.2, py: -0.2 + (rnd() - 0.5) * 0.2 });
      };
      add(0);
      if (rnd() < 0.25) add(0.12 + rnd() * 0.1); // dvojitá rána
    });
    const score = (list) => {
      const ts = list.filter((e) => e.kind === 't').map((e) => map.timeOf(e.beat));
      const d = ts.map((t) => Math.min(...acc.map((a) => Math.abs(a - t))));
      return { n: ts.length, within40ms: Math.round((d.filter((x) => x <= 0.04).length / ts.length) * 100) + '%', meanMs: Math.round((d.reduce((a, b) => a + b, 0) / d.length) * 1000), yawJumps: list.filter((e, i) => i && e.kind === 't' && Math.abs((e.yaw || 0) - (list[i - 1].yaw || 0)) > 0.05).length };
    };
    res[tr.name] = { pravda: truth.length, presna: score(ev), uhlazena: score(smoothChoreo(ev, tr, map, 1)), hodne: score(smoothChoreo(ev, tr, map, 2)) };
  }
  return JSON.stringify(res, null, 1);
}));
console.log('errors', errors);
await browser.close();
