// Knihovna skladeb na serveru (Vercel Blob), přístup jen s PINem ověřeným na serveru.
// Stažená skladba + její rytmická analýza se ukládají do zařízení (IndexedDB), podruhé se nestahuje.
import { put, get, cleanName } from './songs.js';

const PIN_KEY = 'pulz.pin';

export function savedPin() {
  try {
    return localStorage.getItem(PIN_KEY) || '';
  } catch (e) {
    return '';
  }
}
export function rememberPin(pin) {
  try {
    if (pin) localStorage.setItem(PIN_KEY, pin);
    else localStorage.removeItem(PIN_KEY);
  } catch (e) {}
}

// "songs/Imagine Dragons - Believer-AbC123xyz.mp3" → "Imagine Dragons - Believer"
export function songName(pathname) {
  let s = pathname.replace(/^songs\//, '').replace(/\.[a-z0-9]{2,4}$/i, '');
  s = s.replace(/-[A-Za-z0-9]{20,40}$/, '');
  return cleanName(s) || 'Skladba';
}

export async function listSongs(pin) {
  const r = await fetch('/api/songs', { headers: { 'x-pin': pin }, cache: 'no-store' });
  if (r.status === 401) throw Object.assign(new Error('Špatný PIN'), { code: 'pin' });
  if (!r.ok) throw new Error('Knihovna není dostupná (' + r.status + ')');
  const j = await r.json();
  return j.songs.map((s) => ({ ...s, name: songName(s.pathname) }));
}

export async function uploadSong(pin, file, onProgress) {
  const { upload } = await import('../vendor/blob-client.js');
  const safe = file.name.replace(/[^\p{L}\p{N} ._()&'-]+/gu, '_').slice(0, 90);
  return upload('songs/' + safe, file, {
    access: 'public',
    handleUploadUrl: '/api/upload',
    clientPayload: JSON.stringify({ pin }),
    contentType: file.type || 'audio/mpeg',
    onUploadProgress: onProgress ? (e) => onProgress(e.percentage / 100) : undefined,
  });
}

export async function deleteSong(pin, url) {
  const r = await fetch('/api/delete', { method: 'POST', headers: { 'x-pin': pin, 'content-type': 'application/json' }, body: JSON.stringify({ url }) });
  if (!r.ok) throw new Error('Smazání se nepovedlo');
}

// stažení s cache v zařízení; onProgress(0..1)
export async function fetchSong(url, onProgress) {
  try {
    const c = await get('lib:' + url);
    if (c && c.data) return c;
  } catch (e) {}
  const r = await fetch(url);
  if (!r.ok) throw new Error('Stažení se nepovedlo (' + r.status + ')');
  const total = +r.headers.get('content-length') || 0;
  let data;
  if (r.body && onProgress) {
    const reader = r.body.getReader();
    const parts = [];
    let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      n += value.length;
      if (total) onProgress(Math.min(1, n / total));
    }
    const buf = new Uint8Array(n);
    let o = 0;
    for (const p of parts) {
      buf.set(p, o);
      o += p.length;
    }
    data = buf.buffer;
  } else data = await r.arrayBuffer();
  return { data, an: null };
}

export async function cacheSong(url, data, an) {
  try {
    await put('lib:' + url, { data, an });
  } catch (e) {}
}
