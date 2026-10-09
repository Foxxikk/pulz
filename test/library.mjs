// Knihovna skladeb s mockovaným API: špatný PIN, správný PIN, výběr skladby, VR klávesnice
import { chromium } from 'playwright';
import fs from 'fs';
const MP3 = '/root/.claude/uploads/bc7fd394-8c22-5c33-960d-95a1a7172d61/fdb7d188-Imagine_Dragons_-_Believer_Official_Music_Video_-_320_Kbps.mp3';
const OUT = '/tmp/claude-0/-home-claude-pulz/bc7fd394-8c22-5c33-960d-95a1a7172d61/scratchpad/shots';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const BLOB = 'https://abc.public.blob.vercel-storage.com/songs/Imagine Dragons - Believer-Xy12AbCdEfGhIjKlMnOpQr.mp3';
await page.route('**/api/songs', (r) => r.request().headers()['x-pin'] === '4321'
  ? r.fulfill({ json: { songs: [{ url: BLOB, pathname: 'songs/Imagine Dragons - Believer-Xy12AbCdEfGhIjKlMnOpQr.mp3', size: 8e6 }, { url: BLOB + '2', pathname: 'songs/Druha skladba-AAAAAAAAAAAAAAAAAAAAAAAA.mp3', size: 5e6 }] } })
  : r.fulfill({ status: 401, json: { error: 'Špatný PIN' } }));
await page.route('**/*.blob.vercel-storage.com/**', (r) => r.fulfill({ body: fs.readFileSync(MP3), headers: { 'content-type': 'audio/mpeg', 'access-control-allow-origin': '*' } }));
await page.goto('http://127.0.0.1:8123/index.html');
await page.waitForFunction(() => window.__app, null, { timeout: 30000 });
await page.evaluate(() => { localStorage.removeItem('pulz.pin'); window.__app.libPin = ''; });
await page.click('#btn-lib');
await page.fill('#lib-pin', '1111');
await page.click('#lib-pinform button');
await page.waitForTimeout(500);
console.log('wrong pin →', await page.evaluate(() => [window.__app.libPin, document.getElementById('lib-status').textContent]));
await page.fill('#lib-pin', '4321');
await page.click('#lib-pinform button');
await page.waitForSelector('.lib-row');
console.log('rows', await page.$$eval('.lib-row span', (e) => e.map((x) => x.textContent)));
await page.screenshot({ path: OUT + '/lib-dom.png' });
await page.click('.lib-row button.sec');
await page.waitForFunction(() => window.__app.customTrack && window.__app.customTrack.libUrl, null, { timeout: 120000 });
console.log('selected', await page.evaluate(() => [window.__app.customTrack.name, window.__app.customTrack.bpm, window.__app.settings.track, localStorage.getItem('pulz.pin')]));
// VR panel: zamknout, klávesnice
await page.evaluate(() => { const a = window.__app; document.getElementById('lib').hidden = true; a.libLock(); a.showLibrary(); for (const k of ['4','3','2','1']) a.press(a.panels.lib, 'key:' + k); });
await page.waitForTimeout(800);
console.log('vr keypad', await page.evaluate(() => [window.__app.libPin, window.__app.libSongs && window.__app.libSongs.length]));
await page.evaluate(() => { const a = window.__app; a.loop(); });
await page.waitForTimeout(300);
await page.screenshot({ path: OUT + '/lib-vr.png' });
await page.evaluate(() => { const a = window.__app; a.libLock(); a.pinEntry = '43'; a.panels.lib.key = null; });
await page.waitForTimeout(300);
await page.screenshot({ path: OUT + '/lib-keypad.png' });
await page.evaluate(() => { const a = window.__app; a.showMenu(); });
await page.waitForTimeout(400);
await page.screenshot({ path: OUT + '/menu.png' });
console.log('errors', errors);
await browser.close();
