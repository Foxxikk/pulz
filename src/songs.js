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

export async function saveCustom(name, arrayBuffer, an, libUrl) {
  try {
    await put('custom', { name, data: arrayBuffer, an, libUrl: libUrl || null });
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
