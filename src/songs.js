// Vlastní skladby: načtení MP3, analýza rytmu, uložení do zařízení (IndexedDB – nikam se neodesílá)
import { toMono, analyze, phrasesFrom } from './analysis.js';

const DB = 'pulz';
const STORE = 'songs';

function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export async function put(key, val) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(val, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
export async function get(key) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function decode(arrayBuffer) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const oc = new OAC(2, 1, 44100);
  return await oc.decodeAudioData(arrayBuffer.slice(0));
}

export function cleanName(name) {
  return name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/^[0-9a-f]{6,}[-_ ]/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/[([]?\s*(official|oficiální)?\s*(music|lyric)?\s*video\s*[)\]]?/gi, '')
    .replace(/-?\s*\d{2,3}\s*kbps/gi, '')
    .replace(/\s+-\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 60);
}

const wait = () => new Promise((r) => setTimeout(r, 30));

// Z MP3 vytvoří trať: { id:'custom', name, bpm, buffer, an, phrases, duration }
export async function makeTrack(name, arrayBuffer, onStatus, cachedAn) {
  onStatus && onStatus('Dekóduji skladbu…');
  await wait();
  const buffer = await decode(arrayBuffer);
  let an = cachedAn;
  if (!an) {
    onStatus && onStatus('Hledám rytmus…');
    await wait();
    const ch = [];
    for (let c = 0; c < buffer.numberOfChannels; c++) ch.push(buffer.getChannelData(c));
    const mono = toMono(ch, buffer.sampleRate);
    an = analyze(mono);
  }
  const phrases = phrasesFrom(an);
  return {
    id: 'custom',
    custom: true,
    name: cleanName(name),
    desc: 'Vlastní skladba',
    bpm: Math.round(an.bpm),
    seed: 7,
    buffer,
    an,
    phrases,
    duration: buffer.duration,
  };
}

export async function saveCustom(name, arrayBuffer, an, libUrl, localId) {
  try {
    await put('custom', { name, data: arrayBuffer, an, libUrl: libUrl || null, localId: localId || null });
  } catch (e) {
    console.warn('Uložení skladby se nepovedlo', e);
  }
}

export async function loadCustom() {
  try {
    return await get('custom');
  } catch (e) {
    return null;
  }
}

export async function saveVideo(name, blob) {
  await put('video', { name, blob });
}
export async function loadVideo() {
  try {
    return await get('video');
  } catch (e) {
    return null;
  }
}

// ---------- více vlastních skladeb v zařízení ----------
// index: [{ id, name, bpm, dur, added, libUrl }]; data: 'my:<id>' → { name, data, an }
export async function listLocal() {
  try {
    let idx = (await get('my:index')) || null;
    if (!idx) {
      // převod staré jediné skladby do seznamu
      idx = [];
      const old = await get('custom');
      if (old && old.data) {
        const id = 'm' + Date.now().toString(36);
        await put('my:' + id, { name: old.name, data: old.data, an: old.an });
        idx.push({ id, name: cleanName(old.name), bpm: old.an ? Math.round(old.an.bpm) : 0, dur: old.an ? old.an.duration : 0, added: Date.now(), libUrl: old.libUrl || null });
      }
      await put('my:index', idx);
    }
    return idx;
  } catch (e) {
    return [];
  }
}
export async function addLocal(name, data, an, libUrl = null) {
  const idx = await listLocal();
  const nm = cleanName(name);
  // stejná skladba (název + délka) se nepřidává dvakrát
  const dup = idx.find((x) => x.name === nm && Math.abs((x.dur || 0) - (an ? an.duration : 0)) < 0.5);
  if (dup) {
    if (libUrl && !dup.libUrl) {
      dup.libUrl = libUrl;
      await put('my:index', idx);
    }
    return dup.id;
  }
  const id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  await put('my:' + id, { name, data, an });
  idx.unshift({ id, name: nm, bpm: an ? Math.round(an.bpm) : 0, dur: an ? an.duration : 0, added: Date.now(), libUrl });
  await put('my:index', idx);
  return id;
}
export async function setLocalLib(id, libUrl) {
  const idx = await listLocal();
  const x = idx.find((y) => y.id === id);
  if (x) {
    x.libUrl = libUrl;
    await put('my:index', idx);
  }
}
export async function getLocal(id) {
  try {
    return await get('my:' + id);
  } catch (e) {
    return null;
  }
}
export async function delLocal(id) {
  const idx = (await listLocal()).filter((x) => x.id !== id);
  await put('my:index', idx);
  await put('my:' + id, null);
}
