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

  P.menu = new Panel(1280, 800, 0.84, (g, p) => {
    const S = app.settings;
    glass(g, 1280, 800);
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
      p.btn('track:' + t.id, x, y, 284, 168, '', { on, disabled: t.placeholder });
      const nm = t.name.length > 16 ? t.name.slice(0, 15) + '…' : t.name;
      text(g, nm, x + 20, y + 48, 34, { weight: 800, color: t.placeholder ? 'rgba(255,255,255,0.55)' : '#fff' });
      if (t.placeholder) {
        text(g, 'Nahraj MP3 na stránce', x + 20, y + 94, 23, { color: '#9fd0ff', weight: 600 });
        text(g, 'před vstupem do VR', x + 20, y + 130, 23, { color: 'rgba(255,255,255,0.5)', weight: 500 });
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
    p.btn('start', 852, 466, 376, 130, 'BOXOVAT', { primary: true, size: 58, weight: 900, sub: app.mode === 'vr' ? 'Start tréninku' : 'Ukázka – hraje bot' });
    // nastavení
    const sn = (k) => S.sens[k];
    p.btn('settings', 52, 630, 1176, 120, 'Citlivost úderů a nastavení', {
      size: 38,
      sub: `Direkt ${sn('jab')} · Hook ${sn('hook')} · Zvedák ${sn('upper')} · Zóna ${S.zone} · zkušební terče`,
    });
  }, { interactive: true });

  P.settings = new Panel(1280, 900, 0.84, (g, p) => {
    const S = app.settings;
    glass(g, 1280, 900);
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
    // poslední údery
    roundRect(g, 52, 432, 700, 420, 24);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fill();
    text(g, 'Poslední údery', 76, 478, 30, { weight: 800 });
    const at = (app.game.attempts || []).slice(0, 7);
    if (!at.length) text(g, 'Zapni zkušební terče a zkus pár úderů.', 76, 530, 26, { color: 'rgba(255,255,255,0.55)', weight: 500 });
    at.forEach((a, i) => {
      const y = 528 + i * 46;
      const ok = /zásah|perfekt|skvěl|dobré/.test(a.res);
      text(g, a.nm, 76, y, 26, { weight: 700 });
      text(g, a.spd ? `${a.spd.toFixed(1)} m/s` : '–', 330, y, 26, { color: '#9fd0ff', weight: 600 });
      text(g, a.res, 470, y, 26, { color: ok ? '#7dffb0' : '#ffb08a', weight: 600 });
    });
    p.btn('practice', 780, 432, 448, 200, app.game.practiceMode ? 'Vypnout terče' : 'Zkušební terče', {
      primary: !app.game.practiceMode,
      size: 40,
      weight: 900,
      sub: app.game.practiceMode ? 'běží: direkt, hook, zvedák' : 'stojí před tebou, trefuj',
    });
    p.btn('back', 780, 652, 448, 200, 'Zpět do menu', { size: 40, weight: 800 });
  }, { interactive: true });

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

  P.info = new Panel(640, 300, 0.44, (g) => {
    const gm = app.game;
    roundRect(g, 6, 6, 628, 288, 40);
    g.fillStyle = 'rgba(14,26,44,0.72)';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(160,210,255,0.35)';
    g.stroke();
    const rem = Math.max(0, gm.duration - gm.t);
    text(g, fmtTime(rem), 40, 118, 92, { weight: 800 });
    text(g, `${Math.round(gm.kcal)} kcal`, 40, 186, 46, { weight: 700, color: '#ffd9a8' });
    text(g, `${fmtNum(gm.score)} b.`, 40, 252, 40, { weight: 600, color: '#bfe0ff' });
    // kruh průběhu
    const k = gm.duration ? Math.min(1, gm.t / gm.duration) : 0;
    g.lineWidth = 22;
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.beginPath();
    g.arc(500, 150, 86, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = '#5ee39a';
    g.lineCap = 'round';
    g.beginPath();
    g.arc(500, 150, 86, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
    g.stroke();
    g.lineCap = 'butt';
    text(g, `×${gm.mult}`, 500, 166, 54, { align: 'center', weight: 900, color: gm.mult > 1 ? COL.goldCss : '#fff' });
    if (app.settings.showFps) text(g, `${app.fps} FPS`, 600, 270, 22, { align: 'right', color: 'rgba(255,255,255,0.5)' });
  });

  P.combo = new Panel(512, 256, 1.5, (g) => {
    const gm = app.game;
    if (gm.combo < 2) return;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `900 160px ${FONT}`;
    g.lineWidth = 10;
    g.strokeStyle = 'rgba(10,25,45,0.45)';
    g.strokeText(String(gm.combo), 256, 104);
    g.fillStyle = '#ffffff';
    g.fillText(String(gm.combo), 256, 104);
    g.font = `800 42px ${FONT}`;
    g.fillStyle = gm.mult > 1 ? COL.goldCss : 'rgba(255,255,255,0.9)';
    g.fillText(gm.mult > 1 ? `COMBO ×${gm.mult}` : 'COMBO', 256, 214);
  }, { order: 8, mips: true });

  P.pause = new Panel(1024, 640, 0.7, (g, p) => {
    glass(g, 1024, 640);
    const gm = app.game;
    text(g, 'Pauza', 512, 100, 64, { align: 'center', weight: 900 });
    text(g, `${fmtNum(gm.score)} bodů · combo ${gm.combo} · ${Math.round(gm.kcal)} kcal`, 512, 160, 30, { align: 'center', color: 'rgba(255,255,255,0.7)', weight: 500 });
    p.btn('resume', 162, 210, 700, 120, 'Pokračovat', { primary: true, size: 50, weight: 900 });
    p.btn('recal', 162, 350, 340, 110, 'Znovu kalibrovat', { size: 32 });
    p.btn('restart', 522, 350, 340, 110, 'Začít znovu', { size: 32 });
    p.btn('quit', 162, 480, 700, 100, 'Ukončit trénink', { size: 34 });
  }, { interactive: true });

  P.results = new Panel(1280, 820, 0.84, (g, p) => {
    glass(g, 1280, 820);
    const r = app.lastResult;
    if (!r) return;
    text(g, r.finished ? 'Trénink dokončen!' : 'Trénink ukončen', 60, 112, 64, { weight: 900 });
    text(g, `${r.trackName} · ${r.diffName}`, 60, 164, 32, { color: 'rgba(255,255,255,0.65)', weight: 500 });
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
      const x = 60 + col * 292, y = 290 + row * 170;
      roundRect(g, x, y - 66, 272, 150, 24);
      g.fillStyle = 'rgba(255,255,255,0.06)';
      g.fill();
      text(g, k, x + 24, y - 20, 26, { color: 'rgba(255,255,255,0.6)', weight: 600 });
      text(g, v, x + 24, y + 48, 54, { weight: 800 });
    });
    p.btn('again', 60, 640, 560, 130, 'Znovu', { primary: true, size: 52, weight: 900 });
    p.btn('menu', 660, 640, 560, 130, 'Menu', { size: 46, weight: 800 });
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
