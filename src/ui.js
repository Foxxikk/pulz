// Panely ve VR: 2D canvas → textura na rovině. Tlačítka se zapisují při kreslení, zásah přes UV.
import * as THREE from 'three';
import { COL, TRACKS, DIFFS, DIFF_ORDER, SENS, ZONE, ENVS } from './config.js';
import { drawHexIcon } from './hands.js';
import { fmtTime, fmtNum } from './util.js';

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

export class Panel {
  constructor(wPx, hPx, wM, draw, opts = {}) {
    this.wPx = wPx;
    this.hPx = hPx;
    this.wM = wM;
    this.hM = (wM * hPx) / wPx;
    this.canvas = document.createElement('canvas');
    this.canvas.width = wPx;
    this.canvas.height = hPx;
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    if (opts.mips) this.tex.anisotropy = 4;
    else {
      this.tex.generateMipmaps = false;
      this.tex.minFilter = THREE.LinearFilter;
    }
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, toneMapped: false, depthWrite: false, depthTest: opts.depthTest !== false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(this.wM, this.hM), this.mat);
    this.mesh.renderOrder = opts.order || 10;
    this.mesh.visible = false;
    this.draw = draw;
    this.buttons = [];
    this.key = null;
    this.hover = null;
    this.interactive = !!opts.interactive;
    this.pressFlash = null;
  }
  refresh(key) {
    const k = key + '|' + this.hover + '|' + this.pressFlash;
    if (k === this.key) return;
    this.key = k;
    this.buttons = [];
    this.g.clearRect(0, 0, this.wPx, this.hPx);
    this.draw(this.g, this);
    this.tex.needsUpdate = true;
  }
  // souřadnice v pixelech z lokálních (metry)
  hitLocal(lx, ly) {
    const px = (lx / this.wM + 0.5) * this.wPx;
    const py = (0.5 - ly / this.hM) * this.hPx;
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const b = this.buttons[i];
      if (!b.disabled && px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b;
    }
    return null;
  }
  hitUV(uv) {
    return this.hitLocal((uv.x - 0.5) * this.wM, (uv.y - 0.5) * this.hM);
  }
  btn(id, x, y, w, h, label, o = {}) {
    const g = this.g;
    const hov = this.hover === id;
    const pressed = this.pressFlash === id;
    this.buttons.push({ id, x, y, w, h, disabled: o.disabled, action: o.action });
    g.save();
    const r = o.r || 22;
    roundRect(g, x, y, w, h, r);
    if (o.primary) {
      const gr = g.createLinearGradient(x, y, x + w, y + h);
      gr.addColorStop(0, pressed ? '#ffd27a' : hov ? '#ffb24f' : '#ff9a2e');
      gr.addColorStop(1, pressed ? '#ff9d5c' : hov ? '#ff7b3a' : '#ff6a2b');
      g.fillStyle = gr;
    } else if (o.on) {
      g.fillStyle = hov ? 'rgba(80,160,255,0.55)' : 'rgba(58,141,255,0.42)';
    } else {
      g.fillStyle = pressed ? 'rgba(255,255,255,0.32)' : hov ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)';
    }
    if (o.disabled) g.globalAlpha = 0.35;
    g.fill();
    g.lineWidth = o.on || hov ? 4 : 2;
    g.strokeStyle = o.on ? '#7fb8ff' : o.primary ? 'rgba(255,240,220,0.9)' : 'rgba(255,255,255,0.28)';
    g.stroke();
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `${o.weight || 700} ${o.size || 34}px ${FONT}`;
    if (o.sub) {
      g.fillText(label, x + w / 2, y + h / 2 - (o.size || 34) * 0.42);
      g.font = `500 ${Math.round((o.size || 34) * 0.68)}px ${FONT}`;
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.fillText(o.sub, x + w / 2, y + h / 2 + (o.size || 34) * 0.55);
    } else g.fillText(label, x + w / 2, y + h / 2 + 2);
    g.restore();
  }
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function glass(g, w, h, r = 44) {
  roundRect(g, 4, 4, w - 8, h - 8, r);
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, 'rgba(18,30,52,0.9)');
  gr.addColorStop(1, 'rgba(10,18,34,0.92)');
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(160,210,255,0.35)';
  g.stroke();
  // akcentní linka nahoře
  const ag = g.createLinearGradient(80, 0, w - 80, 0);
  ag.addColorStop(0, COL.Lcss);
  ag.addColorStop(1, COL.Rcss);
  g.fillStyle = ag;
  g.fillRect(r + 20, 6, w - 2 * r - 40, 5);
}

function text(g, s, x, y, size, o = {}) {
  g.font = `${o.weight || 600} ${size}px ${FONT}`;
  g.fillStyle = o.color || '#fff';
  g.textAlign = o.align || 'left';
  g.textBaseline = o.base || 'alphabetic';
  g.fillText(s, x, y);
}

function logo(g, x, y, s) {
  drawHexIcon(g, x + s * 0.5, y + s * 0.5, s * 0.46, COL.Lcss);
  g.save();
  g.globalCompositeOperation = 'source-atop';
  const gr = g.createLinearGradient(x, y, x + s, y + s);
  gr.addColorStop(0, COL.Lcss);
  gr.addColorStop(1, COL.Rcss);
  g.fillStyle = gr;
  g.fillRect(x, y, s, s);
  g.restore();
}

// ---------------- konkrétní panely ----------------
export function makePanels(app) {
  const P = {};

  P.menu = new Panel(1280, 930, 0.84, (g, p) => {
    const S = app.settings;
    glass(g, 1280, 930);
    logo(g, 52, 30, 84);
    text(g, 'PULZ', 152, 98, 76, { weight: 900 });
    text(g, 'Boxuj v rytmu · ovládání jen rukama', 390, 90, 28, { color: 'rgba(255,255,255,0.7)', weight: 500 });
    // trati
    const list = TRACKS.concat([app.customTrack || { id: 'custom', name: 'Vlastní skladba', placeholder: true }]);
    list.forEach((t, i) => {
      const x = 52 + i * 298, y = 132;
      const on = S.track === t.id && (t.id !== 'custom' || app.customTrack);
      const recKey = (t.custom ? 'custom:' + t.name : t.id) + ':' + S.diff;
      const rec = app.records[recKey];
      p.btn(t.placeholder ? 'library' : 'track:' + t.id, x, y, 284, 168, '', { on });
      const nm = t.name.length > 16 ? t.name.slice(0, 15) + '…' : t.name;
      text(g, nm, x + 20, y + 48, 34, { weight: 800, color: t.placeholder ? 'rgba(255,255,255,0.55)' : '#fff' });
      if (t.placeholder) {
        text(g, 'Moje skladby', x + 20, y + 94, 24, { color: '#9fd0ff', weight: 700 });
        text(g, 'vyber ze seznamu', x + 20, y + 130, 23, { color: 'rgba(255,255,255,0.5)', weight: 500 });
      } else {
        text(g, `${t.bpm} BPM · ${fmtTime(app.trackLen(t))}`, x + 20, y + 94, 24, { color: '#9fd0ff', weight: 700 });
        text(g, rec ? `Rekord ${fmtNum(rec.score)} · ${rec.grade}` : t.custom ? 'Vlastní skladba' : t.desc.split(',')[0], x + 20, y + 136, 23, { color: rec ? COL.goldCss : 'rgba(255,255,255,0.5)', weight: 600 });
      }
    });
    // prostředí (360° fotky / video)
    text(g, 'Prostředí', 52, 340, 26, { color: 'rgba(255,255,255,0.65)', weight: 600 });
    const st = app.envStatus || app.songStatus;
    if (st) text(g, st, 1228, 340, 24, { align: 'right', color: '#9fd0ff', weight: 600 });
    const envs = app.envList();
    const ew = (1176 - (envs.length - 1) * 9) / envs.length;
    envs.forEach((e, i) => {
      p.btn('env:' + e.id, 52 + i * (ew + 9), 354, ew, 82, e.name, { on: S.env === e.id, size: envs.length > 6 ? 27 : 32 });
    });
    // obtížnost
    text(g, 'Obtížnost', 52, 478, 26, { color: 'rgba(255,255,255,0.65)', weight: 600 });
    DIFF_ORDER.forEach((d, i) => {
      p.btn('diff:' + d, 52 + i * 262, 492, 246, 104, DIFFS[d].name, { on: S.diff === d, size: 38 });
    });
    const mode = S.mode || 'train';
    const startSub = { train: app.mode === 'vr' ? 'Start tréninku' : 'Ukázka – hraje bot', perfect: 'Bez chyby – jedna chyba a konec', endurance: 'Vytrvalost – všechny skladby', record: 'Nahrát choreografii' }[mode];
    p.btn('start', 852, 466, 376, 130, mode === 'record' ? 'NAHRÁT' : 'BOXOVAT', { primary: true, size: 58, weight: 900, sub: startSub });
    // režim
    text(g, 'Režim', 52, 628, 26, { color: 'rgba(255,255,255,0.65)', weight: 600 });
    const tk = app.currentTrack;
    const hasRec = tk && app.choreoFor && app.choreoFor(tk);
    if (hasRec) p.btn('usechoreo', 852, 600, 376, 44, 'Moje choreo: ' + (S.useChoreo === false ? 'vypnutá' : ['přesná', 'uhlazená', 'hodně uhlazená'][S.choreoSmooth ?? 1]), { size: 22, weight: 700, on: S.useChoreo !== false, r: 14 });
    [['train', 'Trénink'], ['perfect', 'Bez chyby'], ['endurance', 'Vytrvalost'], ['record', 'Nahrát choreo']].forEach(([id, nm], i) => {
      p.btn('mode:' + id, 52 + i * 298, 652, 284, 96, nm, { on: mode === id, size: 32, weight: 800 });
    });
    // nastavení / statistiky / skladby
    const sn = (k) => S.sens[k];
    p.btn('settings', 52, 778, 520, 120, 'Nastavení', { size: 38, sub: `Direkt ${sn('jab')} · Hook ${sn('hook')} · Zvedák ${sn('upper')} · Zóna ${S.zone}` });
    p.btn('stats', 588, 778, 312, 120, 'Statistiky', { size: 36, sub: app.statsSub ? app.statsSub() : '' });
    p.btn('library', 916, 778, 312, 120, 'Moje skladby', { size: 34, sub: `${app.libItems().length} skladeb` });
  }, { interactive: true });

  P.settings = new Panel(1280, 1150, 0.84, (g, p) => {
    const S = app.settings;
    glass(g, 1280, 1150);
    text(g, 'Citlivost a nastavení', 52, 90, 54, { weight: 900 });
    text(g, '1 = přísná · 5 = bere skoro každý pohyb', 1228, 86, 24, { align: 'right', color: 'rgba(255,255,255,0.6)', weight: 500 });
    const lv = (k) => `${S.sens[k]} · ${SENS[S.sens[k] - 1].name}`;
    const sub = (k) => `od ${SENS[S.sens[k] - 1].v.toFixed(2)} m/s`;
    bigStepper(p, g, 'sj', 52, 120, 'Direkt', lv('jab'), sub('jab'));
    bigStepper(p, g, 'sh', 346, 120, 'Hook', lv('hook'), sub('hook'));
    bigStepper(p, g, 'su', 640, 120, 'Zvedák', lv('upper'), sub('upper'));
    bigStepper(p, g, 'zone', 934, 120, 'Zóna zásahu', `${S.zone} · ${ZONE[S.zone - 1].name}`, `+${Math.round(ZONE[S.zone - 1].tol * 100)} cm`);
    smallStepper(p, g, 'bar', 52, 286, 'Bariéra', `−${Math.round(S.barrierDrop * 100)} cm`);
    smallStepper(p, g, 'kg', 346, 286, 'Váha', `${S.weight} kg`);
    smallStepper(p, g, 'off', 640, 286, 'Posun zvuku', `${S.audioOffset > 0 ? '+' : ''}${S.audioOffset} ms`);
    smallStepper(p, g, 'amb', 934, 286, 'Zvuky přírody', (S.ambient ?? 3) === 0 ? 'vypnuto' : `${S.ambient ?? 3} / 5`);
    // přepínače
    p.btn('barmode', 52, 422, 380, 72, { all: 'Bariéry: všechny', duck: 'Bariéry: bez zdí', off: 'Bariéry: vypnuté' }[S.barriers || 'all'], { size: 24, weight: 800, on: (S.barriers || 'all') !== 'all' });
    p.btn('spatial', 446, 422, 380, 72, S.spatial !== false ? 'Hudba: prostorová' : 'Hudba: stereo', { size: 24, weight: 800, on: S.spatial !== false });
    const hn = S.hints || 'full';
    p.btn('hints', 840, 422, 388, 72, { full: 'Náznak příletu: vše', light: 'Náznak příletu: jen záře', off: 'Náznak příletu: vyp.' }[hn], { size: 24, weight: 800, on: hn !== 'off' });
    const coach = S.coach || 'voice';
    p.btn('coach', 52, 506, 286, 72, { voice: 'Trenér: hlas', text: 'Trenér: jen text', off: 'Trenér: vyp.' }[coach], { size: 24, weight: 800, on: coach !== 'off' });
    p.btn('warmup', 346, 506, 286, 72, S.warmup !== false ? 'Rozcvička: ano' : 'Rozcvička: ne', { size: 24, weight: 800, on: S.warmup !== false });
    p.btn('stretch', 640, 506, 286, 72, S.stretch !== false ? 'Protažení: ano' : 'Protažení: ne', { size: 24, weight: 800, on: S.stretch !== false });
    p.btn('fps', 934, 506, 294, 72, S.showFps ? 'FPS: ukazovat' : 'FPS: skrýt', { size: 24, weight: 800, on: !!S.showFps });
    // poslední údery / výsledek kalibrace
    roundRect(g, 52, 600, 700, 510, 24);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fill();
    const ac = app.game.autocal;
    if (ac) {
      text(g, 'Automatická kalibrace', 76, 646, 30, { weight: 800 });
      text(g, `Terč ${Math.min(12, app.game.practiceIdx)} z 12 – boxuj normálně, jako při hře.`, 76, 696, 26, { color: '#9fd0ff', weight: 600 });
    } else if (app.calMsg) {
      text(g, 'Výsledek kalibrace', 76, 646, 30, { weight: 800 });
      wrap(g, app.calMsg, 76, 696, 650, 34, 25, '#7dffb0');
    } else text(g, 'Poslední údery', 76, 646, 30, { weight: 800 });
    const at = (app.game.attempts || []).slice(0, ac || app.calMsg ? 4 : 9);
    const y0 = ac || app.calMsg ? 880 : 698;
    if (!at.length && !ac && !app.calMsg) text(g, 'Zapni zkušební terče nebo automatickou kalibraci.', 76, 698, 26, { color: 'rgba(255,255,255,0.55)', weight: 500 });
    at.forEach((a, i) => {
      const y = y0 + i * 46;
      const ok = /zásah|perfekt|skvěl|dobré|změřeno/.test(a.res);
      text(g, a.nm, 76, y, 26, { weight: 700 });
      text(g, a.spd ? `${a.spd.toFixed(1)} m/s` : '–', 330, y, 26, { color: '#9fd0ff', weight: 600 });
      text(g, a.res, 470, y, 26, { color: ok ? '#7dffb0' : '#ffb08a', weight: 600 });
    });
    const busy = app.game.practiceMode;
    p.btn('autocal', 780, 600, 448, 160, ac ? 'Zrušit kalibraci' : 'Automatická kalibrace', { primary: !busy, size: 34, weight: 900, sub: ac ? 'vrátí původní nastavení' : '12 terčů, nastaví citlivost za tebe' });
    p.btn('practice', 780, 775, 448, 160, busy && !ac ? 'Vypnout terče' : 'Zkušební terče', { size: 34, weight: 800, sub: busy && !ac ? 'běží: direkt, hook, zvedák' : 'stojí před tebou, trefuj', disabled: !!ac });
    p.btn('back', 780, 950, 448, 160, 'Zpět do menu', { size: 36, weight: 800 });
  }, { interactive: true });

  function wrap(g, str, x, y, w, lh, size, color) {
    g.font = `600 ${size}px ${FONT}`;
    const words = str.split(' ');
    let line = '';
    for (const wd of words) {
      const t = line ? line + ' ' + wd : wd;
      if (g.measureText(t).width > w && line) {
        text(g, line, x, y, size, { color, weight: 600 });
        y += lh;
        line = wd;
      } else line = t;
    }
    if (line) text(g, line, x, y, size, { color, weight: 600 });
  }

  function bigStepper(p, g, id, x, y, label, value, sub) {
    roundRect(g, x, y, 286, 150, 22);
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.fill();
    text(g, label, x + 143, y + 44, 30, { align: 'center', weight: 800 });
    text(g, value, x + 143, y + 90, 26, { align: 'center', color: '#ffd9a8', weight: 700 });
    text(g, sub, x + 143, y + 128, 22, { align: 'center', color: 'rgba(255,255,255,0.6)', weight: 500 });
    p.btn(id + ':-', x + 6, y + 50, 58, 92, '−', { size: 48, r: 16 });
    p.btn(id + ':+', x + 222, y + 50, 58, 92, '+', { size: 48, r: 16 });
  }

  function smallStepper(p, g, id, x, y, label, value) {
    roundRect(g, x, y, 286, 120, 22);
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.fill();
    text(g, label, x + 143, y + 48, 28, { align: 'center', weight: 700 });
    text(g, value, x + 143, y + 92, 28, { align: 'center', color: 'rgba(255,255,255,0.8)', weight: 600 });
    p.btn(id + ':-', x + 6, y + 18, 60, 84, '−', { size: 46, r: 16 });
    p.btn(id + ':+', x + 220, y + 18, 60, 84, '+', { size: 46, r: 16 });
  }

  // knihovna skladeb: PIN klávesnice → seznam skladeb ze serveru
  P.lib = new Panel(1280, 984, 0.84, (g, p) => {
    glass(g, 1280, 984);
    text(g, 'Moje skladby', 52, 92, 54, { weight: 900 });
    if (app.libStatus) text(g, app.libStatus.slice(0, 48), 1228, 88, 24, { align: 'right', color: '#9fd0ff', weight: 600 });
    const items = app.libItems();
    if (app.libKeypad || (!app.libPin && !items.length)) {
      text(g, 'Zadej PIN knihovny', 640, 190, 34, { align: 'center', color: 'rgba(255,255,255,0.75)', weight: 600 });
      const n = app.pinEntry.length;
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.arc(640 - 150 + i * 100, 260, 26, 0, Math.PI * 2);
        g.fillStyle = i < n ? '#ffb24f' : 'rgba(255,255,255,0.12)';
        g.fill();
      }
      const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'];
      keys.forEach((k, i) => {
        const col = i % 3, row = Math.floor(i / 3);
        const x = 640 - 330 + col * 224, y = 330 + row * 130;
        p.btn('key:' + k, x, y, 210, 116, k === 'del' ? '←' : k === 'ok' ? 'OK' : k, { size: 56, weight: 800, primary: k === 'ok' });
      });
      p.btn('libback', 52, 870, 300, 90, 'Zpět', { size: 36, weight: 800 });
      return;
    }
    if (!items.length) {
      text(g, app.libPin && !app.libSongs ? 'Načítám seznam…' : 'Zatím žádné skladby.', 640, 280, 36, { align: 'center', weight: 700 });
      text(g, 'Skladby nahraješ na stránce mimo VR: „Nahrát skladby (MP3)“.', 640, 336, 26, { align: 'center', color: 'rgba(255,255,255,0.65)', weight: 500 });
    } else {
      const per = 6;
      const pages = Math.max(1, Math.ceil(items.length / per));
      const pg = Math.min(app.libPage, pages - 1);
      items.slice(pg * per, pg * per + per).forEach((it, i) => {
        const idx = pg * per + i;
        const cur = app.isCurrent(it);
        const nm = it.name.length > 46 ? it.name.slice(0, 45) + '…' : it.name;
        const sub = cur ? 'vybráno' : it.src === 'local' ? `v zařízení${it.bpm ? ' · ' + it.bpm + ' BPM' : ''}${it.dur ? ' · ' + fmtTime(it.dur) : ''}` : `knihovna · ${(it.size / 1048576).toFixed(1)} MB`;
        p.btn('lib:' + idx, 52, 130 + i * 116, 1176, 104, nm, { size: 36, weight: 700, on: cur, sub });
      });
      if (pages > 1) {
        p.btn('libpg:-', 380, 870, 160, 90, '‹', { size: 56, disabled: pg === 0 });
        text(g, `${pg + 1} / ${pages}`, 640, 928, 32, { align: 'center', weight: 700 });
        p.btn('libpg:+', 740, 870, 160, 90, '›', { size: 56, disabled: pg >= pages - 1 });
      }
    }
    p.btn('libback', 52, 870, 300, 90, 'Zpět', { size: 36, weight: 800 });
    if (app.libPin) p.btn('liblock', 928, 870, 300, 90, 'Zamknout', { size: 32, weight: 700 });
    else p.btn('libunlock', 928, 870, 300, 90, 'Knihovna (PIN)', { size: 30, weight: 700 });
  }, { interactive: true });

  // statistiky a odznaky
  P.stats = new Panel(1280, 980, 0.84, (g, p) => {
    glass(g, 1280, 980);
    const st = app.statsData;
    text(g, 'Statistiky', 52, 92, 54, { weight: 900 });
    if (!st) return;
    const tiles = [
      ['Tréninků', String(st.tot.n)],
      ['Dní v řadě', String(st.streak)],
      ['Tento týden', Math.round(st.week.reduce((a, x) => a + x.kcal, 0)) + ' kcal'],
      ['Celkem', Math.round(st.tot.time / 60) + ' min'],
    ];
    tiles.forEach(([k, v], i) => {
      const x = 52 + i * 298;
      roundRect(g, x, 120, 284, 130, 22);
      g.fillStyle = 'rgba(255,255,255,0.06)';
      g.fill();
      text(g, k, x + 22, 160, 24, { color: 'rgba(255,255,255,0.6)', weight: 600 });
      text(g, v, x + 22, 222, 46, { weight: 900 });
    });
    // kcal za posledních 7 dní (jedna řada, popisky hodnot)
    text(g, 'Kalorie za posledních 7 dní', 52, 300, 28, { weight: 800 });
    const mx = Math.max(50, ...st.week.map((x) => x.kcal));
    const DN = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];
    st.week.forEach((x, i) => {
      const bx = 70 + i * 160, base = 520, hgt = (x.kcal / mx) * 170;
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(bx, base, 120, 2);
      if (hgt > 0.5) {
        roundRect(g, bx + 30, base - hgt, 60, hgt, 6);
        g.fillStyle = i === 6 ? '#ff9a2e' : '#3d8fff';
        g.fill();
        text(g, String(Math.round(x.kcal)), bx + 60, base - hgt - 12, 22, { align: 'center', weight: 700 });
      }
      text(g, i === 6 ? 'dnes' : DN[x.d.getDay()], bx + 60, base + 34, 22, { align: 'center', color: 'rgba(255,255,255,0.6)', weight: 600 });
    });
    // rekordy
    text(g, 'Nejlepší výsledky', 52, 610, 28, { weight: 800 });
    if (!st.best.length) text(g, 'Zatím žádný trénink ve VR.', 52, 656, 24, { color: 'rgba(255,255,255,0.55)' });
    st.best.forEach((b, i) => {
      const nm = b.track.length > 22 ? b.track.slice(0, 21) + '…' : b.track;
      text(g, `${i + 1}. ${nm}`, 52, 656 + i * 40, 24, { weight: 700 });
      text(g, `${fmtNum(b.score)} · ${b.grade}`, 600, 656 + i * 40, 24, { align: 'right', color: COL.goldCss, weight: 700 });
    });
    // odznaky
    text(g, 'Odznaky', 660, 610, 28, { weight: 800 });
    st.badges.forEach(([nm, ok], i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const x = 660 + col * 192, y = 630 + row * 62;
      roundRect(g, x, y, 182, 52, 16);
      g.fillStyle = ok ? 'rgba(255,200,80,0.22)' : 'rgba(255,255,255,0.04)';
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = ok ? 'rgba(255,213,74,0.8)' : 'rgba(255,255,255,0.12)';
      g.stroke();
      text(g, nm, x + 91, y + 34, 20, { align: 'center', weight: ok ? 800 : 500, color: ok ? '#ffe39a' : 'rgba(255,255,255,0.35)' });
    });
    p.btn('statsback', 52, 880, 300, 80, 'Zpět', { size: 34, weight: 800 });
    text(g, `${st.badges.filter((b) => b[1]).length} / ${st.badges.length} odznaků`, 1228, 930, 24, { align: 'right', color: 'rgba(255,255,255,0.55)', weight: 600 });
  }, { interactive: true });

  // rozcvička / protažení
  P.warm = new Panel(1280, 760, 0.9, (g, p) => {
    glass(g, 1280, 760);
    const w = app.warm;
    if (!w) return;
    const st = w.steps[w.i];
    text(g, w.kind === 'warm' ? 'Rozcvička' : 'Protažení', 60, 96, 52, { weight: 900 });
    text(g, `${w.i + 1} / ${w.steps.length}`, 1220, 92, 32, { align: 'right', color: 'rgba(255,255,255,0.6)', weight: 700 });
    // odpočet v kruhu
    const left = Math.max(0, st.d - w.t);
    const cx = 1040, cy = 330, rr = 120;
    g.lineWidth = 20;
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.beginPath();
    g.arc(cx, cy, rr, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = w.kind === 'warm' ? '#ff9a2e' : '#5ee39a';
    g.lineCap = 'round';
    g.beginPath();
    g.arc(cx, cy, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - left / st.d));
    g.stroke();
    g.lineCap = 'butt';
    text(g, String(Math.ceil(left)), cx, cy + 26, 96, { align: 'center', weight: 900 });
    text(g, st.n, 60, 260, 64, { weight: 900 });
    wrap(g, st.h, 60, 330, 800, 46, 34, 'rgba(255,255,255,0.85)');
    // průběh
    w.steps.forEach((x, i) => {
      g.beginPath();
      g.arc(80 + i * 44, 520, 12, 0, Math.PI * 2);
      g.fillStyle = i < w.i ? (w.kind === 'warm' ? '#ff9a2e' : '#5ee39a') : i === w.i ? '#ffffff' : 'rgba(255,255,255,0.2)';
      g.fill();
    });
    p.btn('warmnext', 60, 600, 540, 120, 'Další cvik', { size: 40, weight: 800 });
    p.btn('warmend', 640, 600, 580, 120, w.kind === 'warm' ? 'Přeskočit a boxovat' : 'Hotovo', { primary: true, size: 40, weight: 900 });
  }, { interactive: true });

  P.calib = new Panel(1024, 420, 0.78, (g) => {
    glass(g, 1024, 420);
    const c = app.calib;
    text(g, 'Příprava', 512, 92, 54, { align: 'center', weight: 900 });
    text(g, 'Postav se doprostřed plošiny, narovnej se', 512, 168, 34, { align: 'center', weight: 500 });
    text(g, 'a natáhni obě pěsti před sebe.', 512, 214, 34, { align: 'center', weight: 500 });
    // průběh
    const pr = c ? c.progress : 0;
    roundRect(g, 162, 260, 700, 26, 13);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fill();
    roundRect(g, 162, 260, Math.max(26, 700 * pr), 26, 13);
    const gr = g.createLinearGradient(162, 0, 862, 0);
    gr.addColorStop(0, COL.Lcss);
    gr.addColorStop(1, COL.Rcss);
    g.fillStyle = gr;
    g.fill();
    const mus = app.musicProgress;
    text(g, c && c.msg ? c.msg : '', 512, 340, 28, { align: 'center', color: '#9fd0ff', weight: 600 });
    const envMsg = app.envStatus ? ' · ' + app.envStatus : '';
    text(g, (mus < 1 ? `Ladím hudbu… ${Math.round(mus * 100)} %` : 'Hudba připravena') + envMsg, 512, 384, 24, { align: 'center', color: 'rgba(255,255,255,0.55)', weight: 500 });
  });

  P.big = new Panel(1024, 400, 1.6, (g) => {
    const s = app.bigText || '';
    if (!s) return;
    g.font = `900 ${s.length > 3 ? 170 : 260}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 16;
    g.strokeStyle = 'rgba(10,20,40,0.6)';
    g.strokeText(s, 512, 210);
    const gr = g.createLinearGradient(200, 0, 824, 0);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(1, '#ffe7b0');
    g.fillStyle = gr;
    g.fillText(s, 512, 210);
  }, { depthTest: false, order: 30 });

  // HUD: čas, skóre (počítá nahoru), kalorie, průběh skladby
  P.info = new Panel(640, 300, 0.44, (g) => {
    const gm = app.game;
    const pulse = app.beatPulse || 0;
    roundRect(g, 6, 6, 628, 288, 40);
    const bg = g.createLinearGradient(0, 0, 640, 300);
    bg.addColorStop(0, 'rgba(18,32,58,0.82)');
    bg.addColorStop(1, 'rgba(8,16,30,0.78)');
    g.fillStyle = bg;
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = `rgba(160,210,255,${0.3 + pulse * 0.35})`;
    g.stroke();
    text(g, 'SKÓRE', 40, 58, 24, { weight: 800, color: 'rgba(160,210,255,0.75)' });
    const sc = fmtNum(Math.round(app.dispScore || 0));
    g.save();
    g.shadowColor = 'rgba(120,190,255,0.8)';
    g.shadowBlur = 18;
    text(g, sc, 40, 138, 84, { weight: 900 });
    g.restore();
    const rem = Math.max(0, gm.duration - gm.t);
    text(g, fmtTime(rem), 40, 206, 40, { weight: 700 });
    text(g, `${Math.round(gm.kcal)} kcal`, 600, 206, 40, { weight: 700, color: '#ffd9a8', align: 'right' });
    // průběh skladby
    const k = gm.duration ? Math.min(1, gm.t / gm.duration) : 0;
    roundRect(g, 40, 236, 560, 18, 9);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fill();
    roundRect(g, 40, 236, Math.max(18, 560 * k), 18, 9);
    const gr = g.createLinearGradient(40, 0, 600, 0);
    gr.addColorStop(0, COL.Lcss);
    gr.addColorStop(1, COL.Rcss);
    g.fillStyle = gr;
    g.fill();
    // přesnost vpravo nahoře
    const tot = gm.hits + gm.misses;
    if (tot > 0) text(g, `${Math.round((gm.hits / tot) * 100)} %`, 600, 58, 30, { weight: 800, align: 'right', color: '#7dffb0' });
    if (app.settings.showFps) text(g, `${app.fps} FPS`, 600, 284, 18, { align: 'right', color: 'rgba(255,255,255,0.5)' });
  });

  // combo + násobič s ukazatelem do dalšího stupně
  P.combo = new Panel(640, 300, 1.7, (g) => {
    const gm = app.game;
    if (gm.combo < 2) return;
    const steps = [0, 10, 25, 50];
    const m = gm.mult;
    const lo = steps[m - 1], hi = steps[m] ?? null;
    const prog = hi ? (gm.combo - lo) / (hi - lo) : 1;
    const gold = m > 1;
    const cx = 150, cy = 150;
    // násobič v kruhu
    g.beginPath();
    g.arc(cx, cy, 112, 0, Math.PI * 2);
    g.fillStyle = 'rgba(10,20,40,0.55)';
    g.fill();
    g.lineWidth = 18;
    g.strokeStyle = 'rgba(255,255,255,0.14)';
    g.beginPath();
    g.arc(cx, cy, 112, 0, Math.PI * 2);
    g.stroke();
    g.save();
    g.lineCap = 'round';
    g.shadowColor = gold ? COL.goldCss : '#7fc8ff';
    g.shadowBlur = 24;
    g.strokeStyle = gold ? COL.goldCss : '#7fc8ff';
    g.beginPath();
    g.arc(cx, cy, 112, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, prog));
    g.stroke();
    g.restore();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `900 104px ${FONT}`;
    g.fillStyle = gold ? COL.goldCss : '#ffffff';
    g.fillText('×' + m, cx, cy + 4);
    // počet
    g.textAlign = 'left';
    g.font = `900 150px ${FONT}`;
    g.lineWidth = 10;
    g.strokeStyle = 'rgba(10,25,45,0.5)';
    g.strokeText(String(gm.combo), 296, 130);
    const tg = g.createLinearGradient(0, 60, 0, 200);
    tg.addColorStop(0, '#ffffff');
    tg.addColorStop(1, gold ? '#ffe39a' : '#bfe4ff');
    g.fillStyle = tg;
    g.fillText(String(gm.combo), 296, 130);
    g.font = `800 40px ${FONT}`;
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.fillText('COMBO', 300, 228);
    if (hi) {
      g.font = `600 26px ${FONT}`;
      g.fillStyle = 'rgba(255,255,255,0.6)';
      g.fillText(`×${m + 1} za ${hi - gm.combo}`, 300, 272);
    } else {
      g.font = `800 26px ${FONT}`;
      g.fillStyle = COL.goldCss;
      g.fillText('MAXIMUM!', 300, 272);
    }
  }, { order: 8, mips: true });

  P.pause = new Panel(1024, 640, 0.7, (g, p) => {
    glass(g, 1024, 640);
    const gm = app.game;
    text(g, 'Pauza', 512, 100, 64, { align: 'center', weight: 900 });
    text(g, `${fmtNum(gm.score)} bodů · combo ${gm.combo} · ${Math.round(gm.kcal)} kcal`, 512, 160, 30, { align: 'center', color: 'rgba(255,255,255,0.7)', weight: 500 });
    p.btn('resume', 162, 210, 700, 120, 'Pokračovat', { primary: true, size: 50, weight: 900 });
    p.btn('recal', 162, 350, 340, 110, 'Znovu kalibrovat', { size: 32 });
    p.btn('restart', 522, 350, 340, 110, 'Začít znovu', { size: 32 });
    const rm = app.run && app.run.mode;
    p.btn('quit', 162, 480, 700, 100, rm === 'record' ? 'Uložit nahranou část' : rm === 'try' ? 'Ukončit zkoušku' : 'Ukončit trénink', { size: 34, primary: rm === 'record' });
  }, { interactive: true });

  P.results = new Panel(1280, 900, 0.84, (g, p) => {
    glass(g, 1280, 900);
    const r = app.lastResult;
    if (!r) return;
    const title = r.mode === 'record' ? (r.recRange ? `Uloženo: ${r.recorded} úderů, ${r.recordedBars} překážek` : 'Nic se nenahrálo') : r.mode === 'try' ? 'Zkouška části' : r.mode === 'perfect' ? (r.failed ? `Chyba v ${Math.round((r.progress || 0) * 100)} % skladby` : 'Bez jediné chyby!') : r.endurance ? `Skladba ${r.endurance.idx} z ${r.endurance.n}` : r.finished ? 'Trénink dokončen!' : 'Trénink ukončen';
    text(g, title, 60, 112, 60, { weight: 900 });
    text(g, `${r.trackName} · ${r.diffName}${r.mode === 'perfect' ? ' · Bez chyby' : r.endurance ? ' · Vytrvalost' : ''}`, 60, 164, 32, { color: 'rgba(255,255,255,0.65)', weight: 500 });
    // známka
    const gx = 1080, gy = 150;
    g.beginPath();
    g.arc(gx, gy, 100, 0, Math.PI * 2);
    const gr = g.createLinearGradient(gx - 100, gy - 100, gx + 100, gy + 100);
    gr.addColorStop(0, COL.Lcss);
    gr.addColorStop(1, COL.Rcss);
    g.fillStyle = gr;
    g.fill();
    text(g, r.grade, gx, gy + 6, 130, { align: 'center', base: 'middle', weight: 900 });
    if (r.record) {
      roundRect(g, 790, 50, 180, 50, 25);
      g.fillStyle = COL.goldCss;
      g.fill();
      text(g, 'REKORD!', 880, 76, 28, { align: 'center', base: 'middle', weight: 900, color: '#2a1a00' });
    }
    const stats = [
      ['Skóre', fmtNum(r.score)],
      ['Přesnost', `${Math.round(r.acc * 100)} %`],
      ['Max. combo', String(r.maxCombo)],
      ['Perfektní', `${Math.round(r.perfectRate * 100)} %`],
      ['Kalorie (odhad)', `${Math.round(r.kcal)} kcal`],
      ['Průměrná síla', `${r.avgSpeed.toFixed(1)} m/s`],
      ['Údery L / P', `${r.punchesL} / ${r.punchesR}`],
      ['Bariéry', `${r.barriersOk} / ${r.barriersTotal}`],
    ];
    stats.forEach(([k, v], i) => {
      const col = i % 4, row = Math.floor(i / 4);
      const x = 60 + col * 292, y = 284 + row * 150;
      roundRect(g, x, y - 62, 272, 136, 24);
      g.fillStyle = 'rgba(255,255,255,0.06)';
      g.fill();
      text(g, k, x + 24, y - 20, 26, { color: 'rgba(255,255,255,0.6)', weight: 600 });
      text(g, v, x + 24, y + 48, 54, { weight: 800 });
    });
    // rozložení zásahů: perfektní / skvělé / dobré / minuté
    const parts = [[r.perfect || 0, COL.goldCss, 'perfektní'], [r.great || 0, '#7fc8ff', 'skvělé'], [r.good || 0, '#9be7b8', 'dobré'], [r.misses || 0, 'rgba(255,120,110,0.85)', 'minuté']];
    const tot = parts.reduce((a, b) => a + b[0], 0) || 1;
    let x0 = 60;
    parts.forEach(([n, c], i) => {
      const w = (1176 * n) / tot;
      if (w < 1) return;
      g.fillStyle = c;
      g.fillRect(x0, 548, w, 20);
      x0 += w;
    });
    parts.forEach(([n, c, l], i) => {
      g.fillStyle = c;
      g.beginPath();
      g.arc(72 + i * 292, 590, 9, 0, Math.PI * 2);
      g.fill();
      text(g, `${l} ${n}`, 90 + i * 292, 598, 24, { weight: 600, color: 'rgba(255,255,255,0.8)' });
    });
    // proč se minulo (pomáhá s nastavením citlivosti)
    const rs = Object.entries(r.reasons || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    if (rs.length) text(g, 'Minuté: ' + rs.map(([k, n]) => `${k} ${n}×`).join(' · '), 60, 634, 23, { weight: 600, color: '#ffb08a' });
    // tip trenéra
    if (r.mode === 'record' || r.mode === 'try') {
      const rg = r.recRange || r.tryRange;
      text(g, rg ? `Část ${fmtTime(rg.t0)}–${fmtTime(rg.t1)}${r.recTotal ? ` · v choreografii celkem ${r.recTotal} úderů` : ''}. Vyzkoušej ji, nahraj znovu nebo pokračuj další částí.` : 'Zkus to znovu – boxuj do rytmu, uhýbej podřepem a úklonem.', 60, 672, 24, { weight: 600, color: '#9fd0ff' });
    }
    else if (r.tip) text(g, 'Trenér: ' + r.tip, 60, 672, 24, { weight: 600, color: '#9fd0ff' });
    const en = r.endurance;
    if (en) {
      const tt = en.tot;
      text(g, `Celkem: ${fmtNum(tt.score)} bodů · ${Math.round(tt.kcal)} kcal · ${fmtTime(tt.time)} · zásahy ${tt.hits}/${tt.hits + tt.misses}`, 60, 714, 26, { weight: 700, color: COL.goldCss });
    }
    const by = 750;
    if (r.mode === 'record' || r.mode === 'try') {
      const has = !!(r.recRange || r.tryRange);
      p.btn('rectry', 60, by, 280, 120, 'Zkusit část', { primary: has, size: 34, weight: 900, disabled: !has });
      p.btn('recredo', 356, by, 280, 120, 'Nahrát znovu', { size: 32, weight: 800, sub: 'tuto část' });
      p.btn('recmore', 652, by, 280, 120, 'Nahrát další', { size: 32, weight: 800, sub: 'pokračovat dál' });
      p.btn('menu', 948, by, 272, 120, 'Menu', { size: 36, weight: 800 });
    } else if (en && en.next) {
      const sec = app.endT != null ? Math.max(0, Math.ceil(app.endT)) : '';
      p.btn('endnext', 60, by, 700, 120, `Další: ${en.next.length > 22 ? en.next.slice(0, 21) + '…' : en.next}`, { primary: true, size: 40, weight: 900, sub: sec !== '' ? `začne za ${sec} s` : '' });
      p.btn('endstop', 780, by, 440, 120, 'Ukončit sérii', { size: 36, weight: 800 });
    } else {
      const st = app.settings.stretch !== false && r.finished;
      const w = st ? 370 : 560;
      p.btn('again', 60, by, w, 120, r.mode === 'record' && r.recorded >= 8 ? 'Hrát ji' : 'Znovu', { primary: !st, size: 48, weight: 900 });
      if (st) p.btn('stretchgo', 60 + w + 20, by, w, 120, 'Protažení', { primary: true, size: 44, weight: 900, sub: '1 minuta' });
      p.btn('menu', st ? 60 + 2 * (w + 20) : 660, by, st ? 1160 - 2 * (w + 20) : 560, 120, 'Menu', { size: 44, weight: 800 });
    }
  }, { interactive: true });

  P.hint = new Panel(1024, 200, 0.62, (g) => {
    const s = app.hint;
    if (!s) return;
    roundRect(g, 6, 6, 1012, 188, 40);
    g.fillStyle = 'rgba(14,26,44,0.85)';
    g.fill();
    text(g, s, 512, 112, 38, { align: 'center', base: 'middle', weight: 700 });
  }, { depthTest: false, order: 31 });

  return P;
}
