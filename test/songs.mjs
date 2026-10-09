// Více skladeb v zařízení + knihovna: nahrání 2 skladeb, seznam, výběr, VR panel
import { chromium } from 'playwright';
import fs from 'fs';
const MP3 = '/root/.claude/uploads/bc7fd394-8c22-5c33-960d-95a1a7172d61/fdb7d188-Imagine_Dragons_-_Believer_Official_Music_Video_-_320_Kbps.mp3';
const OUT = '/tmp/claude-0/-home-claude-pulz/bc7fd394-8c22-5c33-960d-95a1a7172d61/scratchpad/shots';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const BLOB = 'https://abc.public.blob.vercel-storage.com/songs/Jina skladba z Questu-AAAAAAAAAAAAAAAAAAAAAAAA.mp3';
await page.route('**/api/songs', (r) => r.request().headers()['x-pin'] === '4321' ? r.fulfill({ json: { songs: [{ url: BLOB, pathname: 'songs/Jina skladba z Questu-AAAAAAAAAAAAAAAAAAAAAAAA.mp3', size: 6e6 }] } }) : r.fulfill({ status: 401, json: {} }));
await page.goto('http://127.0.0.1:8123/index.html');
await page.waitForFunction(() => window.__app, null, { timeout: 30000 });
await page.evaluate(async () => { localStorage.removeItem('pulz.pin'); window.__app.libPin = ''; await new Promise((r) => { const q = indexedDB.deleteDatabase('pulz'); q.onsuccess = q.onerror = q.onblocked = r; }); window.__app.localSongs = []; });
// krátká WAV skladba
const sr = 22050, n = sr * 20, buf = Buffer.alloc(44 + n * 2);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
for (let i = 0; i < n; i++) { const ph = (i % (sr / 2)) / sr; buf.writeInt16LE(Math.round(Math.sin(i / sr * 2 * Math.PI * 60) * 20000 * Math.exp(-ph * 30)), 44 + i * 2); }
fs.writeFileSync('/tmp/claude-0/-home-claude-pulz/bc7fd394-8c22-5c33-960d-95a1a7172d61/scratchpad/beat120.wav', buf);
await page.setInputFiles('#file-song', [MP3, '/tmp/claude-0/-home-claude-pulz/bc7fd394-8c22-5c33-960d-95a1a7172d61/scratchpad/beat120.wav']);
await page.waitForFunction(() => window.__app.localSongs.length === 2 && !/Načítám|Dekóduji|Hledám/.test(window.__app.songStatus || ''), null, { timeout: 120000 });
console.log('local', await page.evaluate(() => [window.__app.localSongs.map((x) => x.name + ' ' + x.bpm), window.__app.customTrack.name, window.__app.songStatus]));
// znovu stejná skladba → bez duplicity
await page.setInputFiles('#file-song', [MP3]);
await page.waitForTimeout(500);
await page.waitForFunction(() => !/Načítám|Dekóduji|Hledám/.test(window.__app.songStatus || ''), null, { timeout: 120000 });
console.log('after dup', await page.evaluate(() => window.__app.localSongs.length));
await page.click('#btn-lib');
await page.waitForTimeout(300);
await page.screenshot({ path: OUT + '/songs-dom.png' });
// výběr první
await page.click('#lib-local .lib-row:nth-of-type(2) button.sec');
await page.waitForTimeout(1500);
console.log('selected', await page.evaluate(() => window.__app.customTrack.name));
// PIN → knihovna (nahrávání do knihovny v testu vypnuto)
await page.evaluate(() => { window.__app.syncLocalToLib = async () => {}; });
await page.fill('#lib-pin', '4321');
await page.click('#lib-pinform button');
await page.waitForSelector('#lib-list .lib-row');
await page.screenshot({ path: OUT + '/songs-dom2.png' });
// VR panel
await page.evaluate(() => { const a = window.__app; document.getElementById('lib').hidden = true; a.showLibrary(); });
await page.waitForTimeout(800);
await page.screenshot({ path: OUT + '/songs-vr.png' });
// znovu načtení stránky → seznam zůstává
await page.reload();
await page.waitForFunction(() => window.__app && window.__app.localSongs.length === 2 && window.__app.customTrack, null, { timeout: 90000 });
console.log('after reload', await page.evaluate(() => [window.__app.localSongs.length, window.__app.customTrack && window.__app.customTrack.name]));
console.log('errors', errors);
await browser.close();
