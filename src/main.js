// PULZ – hlavní aplikace: renderer, režimy (PC / VR), tok obrazovek, ovládání prstem, smyčka
import * as THREE from 'three';
import { TRACKS, DIFFS, DEFAULT_SETTINGS, COL, ENVS, AMB } from './config.js';
import { makeTrack, saveCustom, loadCustom, saveVideo, loadVideo, listLocal, addLocal, setLocalLib, getLocal, delLocal } from './songs.js';
import { Env } from './env.js';
import { Hands, J } from './hands.js';
import { TargetPool } from './targets.js';
import { FX } from './fx.js';
import { makePanels } from './ui.js';
import { Game } from './game.js';
import { Bot } from './bot.js';
import { AudioSys } from './audio.js';
import { buildChart, buildChartFromAnalysis } from './chart.js';
import { savedPin, rememberPin, listSongs, uploadSong, deleteSong, fetchSong, cacheSong } from './library.js';
import { store, clamp, track as va } from './util.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _fwd = new THREE.Vector3(), _lf = new THREE.Vector3(), _lu = new THREE.Vector3();
const PARAMS = new URLSearchParams(location.search);

class App {
  constructor() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, store.get('pulz.settings', {}));
    this.settings.sens = Object.assign({}, DEFAULT_SETTINGS.sens, this.settings.sens || {});
    if (!ENVS.some((e) => e.id === this.settings.env)) this.settings.env = DEFAULT_SETTINGS.env;
    this.envStatus = '';
    this.envReady = false;
    this.records = store.get('pulz.records', {});
    this.mode = 'desktop';
    this.screen = 'menu';
    this.demo = false;
    this.fps = 0;
    this.musicProgress = 0;
    this.hurt = 0;
    this.comboPop = 0;
    this.libPin = savedPin();
    this.localSongs = [];
    this.libKeypad = false;
    this.spkInit = false;
    this.libSongs = null;
    this.libStatus = '';
    this.libPage = 0;
    this.pinEntry = '';
    this.comboBump = 0;
    this.lastComboShown = 0;
    this.dispScore = 0;
    this.beatPulse = 0;
    this.bigText = '';
    this.hint = '';
    this.calibData = null;

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setSize(window.innerWidth, window.innerHeight);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.xr.enabled = true;
    r.xr.setReferenceSpaceType('local-floor');
    document.getElementById('app').appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.03, 900);
    this.camera.position.set(0, 1.62, 0.32);
    this.scene.add(this.camera);
    this.yaw = 0;
    this.pitch = -0.12;

    this.env = new Env(this.scene, r);
    this.hands = new Hands(this.scene);
    this.targets = new TargetPool(this.scene);
    this.fx = new FX(this.scene);
    this.game = new Game(this);
    this.bot = new Bot(this);
    this.audio = null;
    this.head = new THREE.Vector3(0, 1.62, 0);
    this.headQ = new THREE.Quaternion();

    this.panels = makePanels(this);
    for (const p of Object.values(this.panels)) this.scene.add(p.mesh);

    // tlačítko pauzy na levém zápěstí
    const pb = new THREE.Group();
    const hex = new THREE.Mesh(new THREE.CircleGeometry(0.022, 6), new THREE.MeshBasicMaterial({ color: 0x1a2438, transparent: true, opacity: 0.92 }));
    pb.add(hex);
    const barMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const x of [-0.006, 0.006]) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(0.0055, 0.018), barMat);
      b.position.set(x, 0, 0.001);
      pb.add(b);
    }
    this.pauseRing = new THREE.Mesh(new THREE.RingGeometry(0.023, 0.028, 6, 1, 0, 0.01), new THREE.MeshBasicMaterial({ color: COL.R, side: THREE.DoubleSide }));
    pb.add(this.pauseRing);
    pb.visible = false;
    this.pauseBtn = pb;
    this.pauseDwell = 0;
    this.scene.add(pb);

    // červený záblesk při nárazu do bariéry
    this.hurtMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false })
    );
    this.hurtMesh.renderOrder = 50;
    this.scene.add(this.hurtMesh);

    this.clock = new THREE.Clock();
    this.fpsCount = 0;
    this.fpsT = 0;
    this.pokeState = new Map();
    this.pokeCool = 0;
    this.raycaster = new THREE.Raycaster();

    this.initDesktopInput();
    this.initDom();
    window.addEventListener('resize', () => this.onResize());
    this.showMenu();
    this.warmup();
    this.loadEnv();
    this.initCustom();
    r.setAnimationLoop((t, frame) => this.loop(frame));
    window.__app = this;
    window.__game = this.game;
  }

  // načtení prostředí (360° fotka)
  envList() {
    const l = ENVS.slice();
    if (this.customVideoURL) l.splice(l.length - 1, 0, { id: 'video', name: 'Moje video', desc: 'Vlastní 360° video', amb: [] });
    return l;
  }

  loadEnv() {
    const env = this.envList().find((e) => e.id === this.settings.env) || ENVS[0];
    const token = (this.envToken = (this.envToken || 0) + 1);
    this.envReady = false;
    this.envStatus = env.id === 'proc' ? '' : 'Načítám prostředí…';
    const prog = (k) => {
      if (token === this.envToken) this.envStatus = k < 0 ? 'Načítám prostředí…' : `Načítám prostředí ${Math.round(k * 100)} %`;
    };
    const p = env.id === 'video' ? this.env.loadVideo(this.customVideoURL, prog).then((v) => this.attachVideoSound(v)).then(() => true, () => false) : this.env.loadPanorama(env, prog);
    p.then((ok) => {
      if (token !== this.envToken) return;
      this.envReady = true;
      this.envStatus = ok ? '' : 'Prostředí se nepodařilo načíst – kreslená scéna';
      if (!ok && env.id === 'video') this.env.useProc();
    });
    this.applyAmbient(env);
  }

  // zvuky přírody pro prostředí (tiše pod hudbou)
  applyAmbient(env) {
    env = env || this.envList().find((e) => e.id === this.settings.env) || ENVS[0];
    if (!this.audio) return;
    const layers = (env.amb || []).map(([k, g]) => ({ url: AMB[k], gain: g }));
    this.audio.setAmbient(layers);
    this.audio.setAmbientLevel((this.settings.ambient ?? 3) / 5);
  }

  attachVideoSound(v) {
    if (!v || !this.audio || v.__pulzSound) return;
    try {
      const node = this.audio.ctx.createMediaElementSource(v);
      node.connect(this.audio.ambBus);
      v.__pulzSound = true;
      v.muted = false;
    } catch (e) {}
  }

  // vlastní skladba a video (uložené jen v zařízení)
  async initCustom() {
    try {
      this.localSongs = await listLocal();
      this.renderDomLib && this.renderDomLib();
      if (this.libPin) this.libRefresh();
    } catch (e) {}
    try {
      const rec = await loadCustom();
      if (rec && rec.data) {
        this.songStatus = 'Načítám vlastní skladbu…';
        this.customTrack = await makeTrack(rec.name, rec.data, (m) => (this.songStatus = m), rec.an);
        this.customTrack.libUrl = rec.libUrl || null;
        this.customTrack.localId = rec.localId || null;
        this.songStatus = '';
        this.updateDomStatus();
      }
    } catch (e) {
      this.songStatus = '';
    }
    try {
      const vid = await loadVideo();
      if (vid && vid.blob) {
        this.customVideoURL = URL.createObjectURL(vid.blob);
        this.customVideoName = vid.name;
        if (this.settings.env === 'video') this.loadEnv();
        this.updateDomStatus();
      }
    } catch (e) {}
  }

  // nahrání skladeb: uloží se do seznamu v zařízení a (s PINem) i do knihovny na serveru → uvidíš je i na Questu
  async onSongFiles(files) {
    files = [...(files || [])];
    if (!files.length) return;
    let last = null;
    for (const file of files) {
      this.songStatus = 'Načítám ' + file.name + '…';
      this.updateDomStatus();
      try {
        const data = await file.arrayBuffer();
        const t = await makeTrack(file.name, data, (m) => {
          this.songStatus = `${file.name}: ${m}`;
          this.updateDomStatus();
        });
        t.localId = await addLocal(file.name, data, t.an);
        last = { t, data, name: file.name };
        va('custom_song', { bpm: t.bpm });
        if (this.libPin) this.syncUpload(t.localId, file);
      } catch (e) {
        console.error(e);
        this.songStatus = file.name + ': skladbu se nepodařilo načíst (zkus MP3).';
        this.updateDomStatus();
      }
    }
    this.localSongs = await listLocal();
    if (last) {
      this.customTrack = last.t;
      this.settings.track = 'custom';
      this.saveSettings();
      await saveCustom(last.name, last.data, last.t.an, null, last.t.localId);
      this.songStatus = this.libPin ? '' : 'Uloženo v tomto zařízení. Aby skladby byly i na Questu, odemkni „Moje skladby“ PINem.';
    }
    this.updateDomStatus();
    this.renderDomLib();
  }

  // nahrát skladbu z tohoto zařízení do knihovny na serveru (na pozadí)
  async syncUpload(localId, fileOrData, name) {
    try {
      let f = fileOrData;
      if (!(f instanceof Blob)) f = new File([fileOrData], name || 'skladba.mp3', { type: 'audio/mpeg' });
      this.libStatus = 'Nahrávám do knihovny: ' + f.name;
      this.renderDomLib();
      const r = await uploadSong(this.libPin, f, (k) => {
        this.libStatus = `Nahrávám do knihovny: ${f.name} ${Math.round(k * 100)} %`;
        this.renderDomLib();
      });
      await setLocalLib(localId, r.url);
      this.localSongs = await listLocal();
      if (this.customTrack && this.customTrack.localId === localId) this.customTrack.libUrl = r.url;
      this.libStatus = 'V knihovně ✓ ' + f.name;
      this.libSongs = null;
      await this.libRefresh();
    } catch (e) {
      console.error(e);
      this.libStatus = 'Nahrání do knihovny se nepovedlo';
      this.renderDomLib();
    }
  }

  // po odemknutí PINem: skladby jen v zařízení nahrát i do knihovny
  async syncLocalToLib() {
    for (const x of this.localSongs.filter((y) => !y.libUrl)) {
      const rec = await getLocal(x.id);
      if (rec && rec.data) await this.syncUpload(x.id, rec.data, (rec.name || x.name).replace(/(\.mp3)?$/i, '.mp3'));
    }
  }

  // společný seznam: skladby v zařízení + knihovna (ty, které v zařízení nejsou)
  libItems() {
    const local = this.localSongs.map((x) => ({ src: 'local', id: x.id, name: x.name, bpm: x.bpm, dur: x.dur, libUrl: x.libUrl }));
    const have = new Set(local.map((x) => x.libUrl).filter(Boolean));
    const lib = (this.libPin && this.libSongs ? this.libSongs : []).filter((x) => !have.has(x.url)).map((x) => ({ src: 'lib', url: x.url, name: x.name, size: x.size }));
    return local.concat(lib);
  }
  isCurrent(item) {
    const c = this.customTrack;
    if (!c) return false;
    return item.src === 'local' ? c.localId === item.id : c.libUrl === item.url;
  }
  async selectItem(item) {
    if (item.src === 'lib') return this.libSelect(item);
    if (this.libBusy) return;
    this.libBusy = true;
    try {
      this.libStatus = 'Načítám ' + item.name + '…';
      this.renderDomLib();
      const rec = await getLocal(item.id);
      const t = await makeTrack(rec.name, rec.data, (m) => (this.libStatus = m), rec.an);
      t.localId = item.id;
      t.libUrl = item.libUrl || null;
      this.customTrack = t;
      this.settings.track = 'custom';
      this.saveSettings();
      await saveCustom(rec.name, rec.data, t.an, t.libUrl, item.id);
      this.libStatus = 'Vybráno: ' + t.name;
    } catch (e) {
      console.error(e);
      this.libStatus = 'Skladbu se nepodařilo načíst';
    }
    this.libBusy = false;
    this.updateDomStatus();
    this.renderDomLib();
  }

  async onVideoFile(file) {
    if (!file) return;
    try {
      await saveVideo(file.name, file);
    } catch (e) {}
    if (this.customVideoURL) URL.revokeObjectURL(this.customVideoURL);
    this.customVideoURL = URL.createObjectURL(file);
    this.customVideoName = file.name;
    this.settings.env = 'video';
    this.saveSettings();
    this.loadEnv();
    this.updateDomStatus();
  }

  // ---------- knihovna skladeb (PIN) ----------
  async libRefresh() {
    if (!this.libPin) return;
    this.libStatus = '';
    try {
      this.libSongs = await listSongs(this.libPin);
    } catch (e) {
      if (e.code === 'pin') {
        this.libPin = '';
        rememberPin('');
        this.libStatus = 'Špatný PIN';
      } else this.libStatus = e.message;
      this.libSongs = this.libPin ? [] : null;
    }
    this.renderDomLib();
  }

  async libTryPin(pin) {
    this.libPin = pin;
    this.libSongs = null;
    await this.libRefresh();
    if (this.libPin) {
      rememberPin(pin);
      this.libKeypad = false;
      if (/^Uloženo v tomto/.test(this.songStatus || '')) {
        this.songStatus = '';
        this.updateDomStatus();
      }
      this.syncLocalToLib();
    }
    return !!this.libPin;
  }

  libLock() {
    this.libPin = '';
    this.libSongs = null;
    this.pinEntry = '';
    rememberPin('');
    this.renderDomLib();
  }

  async libSelect(song) {
    if (this.libBusy) return;
    this.libBusy = true;
    const st = (m) => {
      this.songStatus = m;
      this.libStatus = m;
      this.updateDomStatus();
      this.renderDomLib();
    };
    try {
      st('Stahuji ' + song.name + '…');
      const c = await fetchSong(song.url, (k) => st(`Stahuji ${song.name}… ${Math.round(k * 100)} %`));
      const t = await makeTrack(song.name, c.data, st, c.an);
      t.libUrl = song.url;
      if (!c.an) await cacheSong(song.url, c.data, t.an);
      t.localId = await addLocal(song.name, c.data, t.an, song.url);
      this.localSongs = await listLocal();
      this.customTrack = t;
      this.settings.track = 'custom';
      this.saveSettings();
      await saveCustom(song.name, c.data, t.an, song.url, t.localId);
      st('');
      this.libStatus = 'Vybráno: ' + t.name;
      va('library_song', { bpm: t.bpm });
    } catch (e) {
      console.error(e);
      st('');
      this.libStatus = 'Skladbu se nepodařilo načíst';
    }
    this.libBusy = false;
    this.updateDomStatus();
    this.renderDomLib();
  }

  showLibrary() {
    this.screen = 'library';
    this.libKeypad = false;
    this.hideAll();
    const p = this.panels.lib;
    p.mesh.visible = true;
    this.pinEntry = '';
    if (this.mode === 'vr') this.placePanel(p, 0.55, -0.28, 0.42);
    else {
      p.mesh.position.set(0, 1.42, -0.62);
      p.mesh.lookAt(this.camera.position);
    }
    if (this.libPin && !this.libSongs) this.libRefresh();
  }

  // DOM okno knihovny (PC / prohlížeč na Questu před vstupem do VR)
  initDomLib() {
    const box = document.getElementById('lib');
    if (!box) return;
    this.dom.lib = box;
    document.getElementById('btn-lib').addEventListener('click', () => {
      this.ensureAudio();
      box.hidden = !box.hidden;
      if (!box.hidden && this.libPin && !this.libSongs) this.libRefresh();
      this.renderDomLib();
    });
    document.getElementById('lib-close').addEventListener('click', () => (box.hidden = true));
    document.getElementById('lib-pinform').addEventListener('submit', async (e) => {
      e.preventDefault();
      const inp = document.getElementById('lib-pin');
      const ok = await this.libTryPin(inp.value.trim());
      inp.value = '';
      if (!ok) this.libStatus = 'Špatný PIN';
      this.renderDomLib();
    });
    document.getElementById('lib-lock').addEventListener('click', () => this.libLock());
    const fu = document.getElementById('lib-file');
    document.getElementById('lib-upload').addEventListener('click', () => fu.click());
    fu.addEventListener('change', async () => {
      const files = [...fu.files];
      fu.value = '';
      for (const f of files) {
        try {
          await uploadSong(this.libPin, f, (k) => {
            this.libStatus = `Nahrávám ${f.name}… ${Math.round(k * 100)} %`;
            this.renderDomLib();
          });
        } catch (e) {
          console.error(e);
          this.libStatus = 'Nahrání se nepovedlo: ' + (e.message || e);
          this.renderDomLib();
          return;
        }
      }
      this.libStatus = files.length ? 'Nahráno ✓' : '';
      await this.libRefresh();
    });
  }

  renderDomLib() {
    const box = this.dom && this.dom.lib;
    if (!box) return;
    const unlocked = !!this.libPin;
    document.getElementById('lib-pinform').hidden = unlocked;
    document.getElementById('lib-hint').hidden = unlocked;
    document.getElementById('lib-main').hidden = !unlocked;
    document.getElementById('lib-status').textContent = this.libStatus || '';
    const row = (it) => {
      const li = document.createElement('div');
      li.className = 'lib-row';
      const cur = this.isCurrent(it);
      const nm = document.createElement('span');
      const tag = it.src === 'local' ? (it.libUrl ? ' · i v knihovně' : ' · jen v zařízení') : '';
      nm.textContent = it.name + (cur ? '  ✓' : '');
      nm.title = it.name + tag;
      const sel = document.createElement('button');
      sel.textContent = cur ? 'Vybráno' : 'Vybrat';
      sel.className = 'sec';
      sel.disabled = !!this.libBusy;
      sel.addEventListener('click', () => this.selectItem(it));
      const del = document.createElement('button');
      del.textContent = 'Smazat';
      del.className = 'del';
      del.addEventListener('click', async () => {
        if (del.dataset.armed !== '1') {
          del.dataset.armed = '1';
          del.textContent = it.src === 'local' && it.libUrl ? 'Ze zařízení?' : 'Opravdu?';
          return;
        }
        try {
          if (it.src === 'local') {
            await delLocal(it.id);
            this.localSongs = await listLocal();
          } else {
            await deleteSong(this.libPin, it.url);
            await this.libRefresh();
          }
        } catch (e) {
          this.libStatus = e.message;
        }
        this.renderDomLib();
      });
      li.append(nm, sel, del);
      return li;
    };
    const items = this.libItems();
    const loc = document.getElementById('lib-local');
    loc.textContent = '';
    const local = items.filter((x) => x.src === 'local');
    const lib = items.filter((x) => x.src === 'lib');
    if (local.length) {
      const h = document.createElement('div');
      h.className = 'lib-sec';
      h.textContent = 'V tomto zařízení';
      loc.append(h, ...local.map(row));
    } else {
      const p = document.createElement('div');
      p.className = 'muted';
      p.style.cssText = 'font-size:14px;opacity:.7';
      p.textContent = 'V tomto zařízení zatím nic – nahraj skladby tlačítkem „Nahrát skladby (MP3)“.';
      loc.append(p);
    }
    const ul = document.getElementById('lib-list');
    ul.textContent = '';
    if (!unlocked) return;
    const h = document.createElement('div');
    h.className = 'lib-sec';
    h.textContent = 'Další v knihovně';
    ul.append(h);
    if (!this.libSongs) ul.append('Načítám…');
    else if (!lib.length) {
      const p = document.createElement('div');
      p.style.cssText = 'font-size:14px;opacity:.7';
      p.textContent = 'Všechny skladby z knihovny už máš v tomto zařízení.';
      ul.append(p);
    } else ul.append(...lib.map(row));
  }

  updateDomStatus() {
    if (!this.dom || !this.dom.custom) return;
    const parts = [];
    if (this.songStatus) parts.push(this.songStatus);
    else if (this.customTrack) parts.push(`Skladba: ${this.customTrack.name} (${this.customTrack.bpm} BPM)`);
    if (this.customVideoName) parts.push('Video: ' + this.customVideoName);
    this.dom.custom.textContent = parts.join(' · ');
  }

  // předkompilace shaderů (jinak zásek na začátku tréninku)
  warmup() {
    const tg = this.targets.get('L', 'hook');
    const br = this.targets.getBarrier('duck');
    tg.g.position.set(0, 1.5, -2);
    br.g.position.set(0, 1.5, -3);
    const p = new THREE.Vector3(0, 1.5, -2);
    this.fx.burst(p, new THREE.Color(1, 0.5, 0.1), new THREE.Vector3(0, 0, -1), 0.5, true, true);
    this.fx.text('perfect', p);
    this.fx.update(0.016, this.head);
    for (const pn of Object.values(this.panels)) pn.refresh('warm');
    const vis = [];
    this.scene.traverse((o) => { if (!o.visible) { vis.push(o); o.visible = true; } });
    try { this.renderer.compile(this.scene, this.camera); } catch (e) { console.warn(e); }
    // nahrát textury do GPU (mimo záběr kamery by se nenahrály)
    const texs = new Set();
    this.scene.traverse((o) => {
      const m = o.material;
      if (m && m.map) texs.add(m.map);
    });
    Object.values(this.fx.labels).forEach((t) => texs.add(t));
    texs.forEach((t) => { try { this.renderer.initTexture(t); } catch (e) {} });
    vis.forEach((o) => (o.visible = false));
    this.targets.release(tg);
    this.targets.releaseBarrier(br);
    this.fx.clearTexts();
    this.fx.time += 5; // ať efekty z předehřátí zmizí
    for (const r of this.fx.rings) { r.active = false; r.mesh.visible = false; }
    for (let i = 0; i < this.fx.NDEB; i++) { this.fx.deb[i].alive = false; this.fx.debris.setMatrixAt(i, this.fx._zero); this.fx.glowDebris.setMatrixAt(i, this.fx._zero); }
  }

  // ---------- pomocné ----------
  trackLen(t) {
    if (t.custom) return t.duration;
    return (t.structure.reduce((s, x) => s + x[1], 0) * 4 * 60) / t.bpm;
  }
  get currentTrack() {
    if (this.settings.track === 'custom' && this.customTrack) return this.customTrack;
    return TRACKS.find((t) => t.id === this.settings.track) || TRACKS[1];
  }
  saveSettings() {
    store.set('pulz.settings', this.settings);
  }
  ensureAudio() {
    if (!this.audio) {
      this.audio = new AudioSys();
      this.audio.setSpatial(this.settings.spatial !== false);
      this.applyAmbient();
      if (this.env.video) this.attachVideoSound(this.env.video);
    }
    this.audio.resume();
    this.audio.resumeAmbient();
    if (this.env.video && this.env.video.paused) this.env.video.play().catch(() => {});
    return this.audio;
  }
  sfx(name, o) {
    if (this.audio) this.audio.play(name, o);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // ---------- DOM (PC) ----------
  initDom() {
    this.dom = {
      vr: document.getElementById('btn-vr'),
      demo: document.getElementById('btn-demo'),
      note: document.getElementById('note'),
      fps: document.getElementById('fps'),
      overlay: document.getElementById('overlay'),
      custom: document.getElementById('custom-status'),
    };
    const fs = document.getElementById('file-song'), fv = document.getElementById('file-video');
    document.getElementById('btn-song').addEventListener('click', () => {
      this.ensureAudio();
      fs.click();
    });
    document.getElementById('btn-video').addEventListener('click', () => {
      this.ensureAudio();
      fv.click();
    });
    fs.addEventListener('change', () => {
      const f = [...fs.files];
      fs.value = '';
      this.onSongFiles(f);
    });
    this.initDomLib();
    fv.addEventListener('change', () => this.onVideoFile(fv.files[0]));
    this.updateDomStatus();
    this.dom.vr.addEventListener('click', () => this.enterVR());
    this.dom.demo.addEventListener('click', (e) => {
      e.currentTarget.blur();
      this.ensureAudio();
      if (this.screen === 'menu' || this.screen === 'results') this.startFlow();
    });
    if (navigator.xr && navigator.xr.isSessionSupported) {
      navigator.xr.isSessionSupported('immersive-vr').then((ok) => {
        this.xrSupported = ok;
        this.dom.vr.disabled = !ok;
        if (!ok) this.dom.note.textContent = 'Tento prohlížeč neumí VR. Otevři odkaz v prohlížeči na Questu 3 – zde si můžeš pustit ukázku.';
      });
    } else {
      this.dom.vr.disabled = true;
      this.dom.note.textContent = 'Tento prohlížeč neumí WebXR. Otevři odkaz v prohlížeči na Questu 3 – zde si můžeš pustit ukázku.';
    }
  }

  initDesktopInput() {
    const el = this.renderer.domElement;
    let down = null;
    el.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch, moved: false };
      this.ensureAudio();
    });
    window.addEventListener('pointermove', (e) => {
      if (!down) {
        this.mouseHover(e);
        return;
      }
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) down.moved = true;
      if (down.moved) {
        this.yaw = down.yaw - dx * 0.004;
        this.pitch = clamp(down.pitch - dy * 0.004, -1.2, 1.2);
      }
    });
    window.addEventListener('pointerup', (e) => {
      if (down && !down.moved) this.mouseClick(e);
      down = null;
    });
    window.addEventListener('keydown', (e) => {
      if (this.mode !== 'desktop') return;
      if (e.code === 'Escape' || e.code === 'Space') {
        e.preventDefault();
        if (this.screen === 'play') this.pause();
        else if (this.screen === 'pause') this.resume();
      }
    });
  }

  rayPanel(e) {
    const m = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(m, this.camera);
    for (const p of Object.values(this.panels)) {
      if (!p.interactive || !p.mesh.visible) continue;
      const hit = this.raycaster.intersectObject(p.mesh)[0];
      if (hit) return { p, b: p.hitUV(hit.uv) };
    }
    return null;
  }
  mouseHover(e) {
    if (this.mode !== 'desktop') return;
    const r = this.rayPanel(e);
    for (const p of Object.values(this.panels)) if (p.interactive) p.hover = r && r.p === p && r.b ? r.b.id : null;
    this.renderer.domElement.style.cursor = r && r.b ? 'pointer' : 'grab';
  }
  mouseClick(e) {
    if (this.mode !== 'desktop') return;
    const r = this.rayPanel(e);
    if (r && r.b) this.press(r.p, r.b.id);
  }

  // ---------- VR ----------
  async enterVR() {
    this.ensureAudio();
    try {
      const session = await navigator.xr.requestSession('immersive-vr', {
        requiredFeatures: ['local-floor'],
        optionalFeatures: ['hand-tracking', 'bounded-floor'],
      });
      this.renderer.xr.setFramebufferScaleFactor(1.0);
      await this.renderer.xr.setSession(session);
      try { this.renderer.xr.setFoveation(0.6); } catch (e) {}
      if (session.updateTargetFrameRate && session.supportedFrameRates) {
        const rates = Array.from(session.supportedFrameRates);
        const want = rates.includes(90) ? 90 : rates.includes(72) ? 72 : null;
        if (want) session.updateTargetFrameRate(want).catch(() => {});
      }
      this.session = session;
      this.quality = 0;
      this.mode = 'vr';
      this.demo = false;
      this.dom.overlay.classList.add('hidden');
      session.addEventListener('end', () => {
        this.session = null;
        this.mode = 'desktop';
        this.dom.overlay.classList.remove('hidden');
        if (this.screen === 'play') this.finish(false);
        this.showMenu();
      });
      session.addEventListener('visibilitychange', () => {
        if (session.visibilityState !== 'visible' && this.screen === 'play') this.pause();
      });
      this.placeAt = 'pending';
      this.showMenu();
    } catch (err) {
      console.error(err);
      this.dom.note.textContent = 'Nepodařilo se spustit VR: ' + (err && err.message ? err.message : err);
    }
  }

  // automatická kvalita: když hra nestíhá obnovovací frekvenci headsetu, ubere efekty (a zase je vrátí)
  adaptQuality(now) {
    if (this.mode !== 'vr' || !this.session) return;
    const target = this.session.frameRate || 72;
    const low = this.fps < target * 0.88;
    const good = this.fps >= target * 0.97;
    this.qLow = low ? (this.qLow || 0) + 1 : 0;
    this.qGood = good ? (this.qGood || 0) + 1 : 0;
    if (this.qLow >= 4 && (this.quality || 0) < 2) {
      this.setQuality((this.quality || 0) + 1);
      this.qLow = 0;
    } else if (this.qGood >= 30 && (this.quality || 0) > 0) {
      this.setQuality(this.quality - 1);
      this.qGood = 0;
    }
  }
  setQuality(q) {
    this.quality = q;
    this.fx.density = q === 0 ? 1 : q === 1 ? 0.6 : 0.35;
    if (this.env.stream) this.env.stream.visible = q < 2;
    try { this.renderer.xr.setFoveation(q === 0 ? 0.6 : 1); } catch (e) {}
    this.targets.setQuality && this.targets.setQuality(q);
    if (this.game.rec) this.game.rec.quality = Math.max(this.game.rec.quality || 0, q);
  }

  // umístí panel před hlavu (ve výšce y vůči hlavě, vzdálenost d)
  placePanel(p, d, dy, tilt = 0, dx = 0) {
    const h = this.head;
    _fwd.set(0, 0, -1).applyQuaternion(this.headQ);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-4) _fwd.set(0, 0, -1);
    _fwd.normalize();
    const right = _w.set(-_fwd.z, 0, _fwd.x);
    p.mesh.position.set(h.x + _fwd.x * d + right.x * dx, h.y + dy, h.z + _fwd.z * d + right.z * dx);
    _v.set(h.x, h.y + dy, h.z);
    p.mesh.lookAt(_v);
    p.mesh.rotateX(-tilt);
  }

  hideAll() {
    for (const p of Object.values(this.panels)) p.mesh.visible = false;
  }

  showMenu() {
    this.screen = 'menu';
    this.demo = false;
    this.hideAll();
    const m = this.panels.menu;
    m.mesh.visible = true;
    if (this.mode === 'vr') this.placeAt = 'menu';
    else {
      m.mesh.position.set(0, 1.42, -0.6);
      m.mesh.rotation.set(0, 0, 0);
      m.mesh.lookAt(0, 1.62, 0.32);
      this.yaw = 0;
      this.pitch = -0.12;
      this.camera.position.set(0, 1.62, 0.32);
    }
    // čisté ruce v menu na PC
    if (this.mode === 'desktop') {
      this.hands.L.valid = this.hands.R.valid = false;
      this.hands.L.alpha = this.hands.R.alpha = 0;
    }
  }

  showSettings() {
    this.screen = 'settings';
    this.hideAll();
    const p = this.panels.settings;
    p.mesh.visible = true;
    if (this.mode === 'vr') this.placePanel(p, 0.55, -0.28, 0.42);
    else {
      p.mesh.position.set(0, 1.42, -0.62);
      p.mesh.lookAt(this.camera.position);
    }
  }

  togglePractice() {
    if (this.game.practiceMode) {
      this.stopPractice();
      if (this.mode === 'vr') this.placePanel(this.panels.settings, 0.55, -0.28, 0.42);
      else {
        this.panels.settings.mesh.position.set(0, 1.42, -0.62);
        this.panels.settings.mesh.lookAt(this.camera.position);
      }
      return;
    }
    const h = this.head;
    const c = this.calibData || { headH: this.mode === 'vr' ? h.y : 1.62, cx: this.mode === 'vr' ? h.x : 0, cz: this.mode === 'vr' ? h.z : 0, reach: 0.58, hitDist: 0.46 };
    this.game.startPractice(c);
    // panel stranou, ať nepřekáží terčům
    if (this.mode === 'vr') this.placePanel(this.panels.settings, 0.6, -0.12, 0.15, -0.62);
    else {
      this.panels.settings.mesh.position.set(-0.55, 1.42, -0.95);
      this.panels.settings.mesh.lookAt(this.camera.position);
    }
  }

  stopPractice() {
    if (this.game.practiceMode) this.game.stopPractice();
  }

  toggleAutoCal() {
    if (this.game.practiceMode) {
      const was = !!this.game.autocal;
      this.togglePractice(); // vypne (a vrátí nastavení, pokud kalibrace běžela)
      if (was) return;
    }
    this.calMsg = '';
    this.togglePractice();
    this.game.stopPractice();
    const h = this.head;
    const c = this.calibData || { headH: this.mode === 'vr' ? h.y : 1.62, cx: this.mode === 'vr' ? h.x : 0, cz: this.mode === 'vr' ? h.z : 0, reach: 0.58, hitDist: 0.46 };
    this.game.startAutoCal(c);
    this.coachSay && this.coachSay('Kalibrace. Boxuj do terčů normálně, jako při hře.');
  }
  onAutoCalDone() {
    if (this.mode === 'vr') this.placePanel(this.panels.settings, 0.55, -0.28, 0.42);
    else {
      this.panels.settings.mesh.position.set(0, 1.42, -0.62);
      this.panels.settings.mesh.lookAt(this.camera.position);
    }
    this.sfx('go');
    this.coachSay && this.coachSay(/nepovedla/.test(this.calMsg) ? 'Kalibrace se nepovedla, zkus to znovu.' : 'Hotovo. Citlivost je nastavená podle tebe.');
  }

  // ---------- tok tréninku ----------
  startFlow() {
    const audio = this.ensureAudio();
    if (this.screen === 'play' || this.screen === 'pause' || this.screen === 'calib') return;
    this.demo = this.mode !== 'vr';
    const track = this.currentTrack;
    this.hideAll();
    this.screen = 'calib';
    this.musicProgress = track.custom || audio.isPrepared(track) ? 1 : 0;
    if (!track.custom && !audio.isPrepared(track)) {
      audio.prepare(track, (k) => (this.musicProgress = k)).then(() => (this.musicProgress = 1));
    }
    const needCal = this.mode === 'vr' && !this.calibData;
    this.calib = { progress: needCal ? 0 : 1, hold: 0, samples: [], start: performance.now(), msg: needCal ? '' : 'Připraveno', need: needCal };
    if (this.mode !== 'vr') this.calibData = { headH: 1.62, cx: 0, cz: 0, reach: 0.6, hitDist: 0.5 };
    const p = this.panels.calib;
    p.mesh.visible = true;
    if (this.mode === 'vr') this.placePanel(p, 1.4, 0.05);
    else {
      p.mesh.position.set(0, 1.55, -1.1);
      p.mesh.lookAt(0, 1.62, 0.32);
    }
    va('start_workout', { track: track.id, diff: this.settings.diff, mode: this.mode });
  }

  updateCalib(dt) {
    const c = this.calib;
    if (c.need) {
      const L = this.hands.L, R = this.hands.R;
      const h = this.head;
      const ok = (x) => x.valid && !x.extrap && h.z - x.fist.z > 0.3 && Math.abs(x.fist.y - (h.y - 0.25)) < 0.3;
      const el = (performance.now() - c.start) / 1000;
      if (!this.hands.anyHandSeen && this.hands.controllersSeen) c.msg = 'Odlož ovladače – PULZ se hraje rukama.';
      else c.msg = '';
      if (ok(L) && ok(R)) {
        c.hold += dt;
        c.samples.push({ y: h.y, x: h.x, z: h.z, reach: h.z - (L.fist.z + R.fist.z) / 2 });
        c.progress = Math.min(1, c.hold / 1.2);
        c.msg = 'Drž…';
      } else {
        c.hold = Math.max(0, c.hold - dt * 2);
        c.progress = Math.min(1, c.hold / 1.2);
      }
      if (c.hold >= 1.2 || el > 10) {
        const n = c.samples.length;
        const avg = (k, d) => (n ? c.samples.reduce((s, x) => s + x[k], 0) / n : d);
        const reach = n ? avg('reach', 0.6) + 0.06 : 0.6;
        this.calibData = {
          headH: n ? avg('y', h.y) : h.y,
          cx: n ? avg('x', h.x) : h.x,
          cz: n ? avg('z', h.z) : h.z,
          reach,
          hitDist: clamp(reach * 0.8, 0.38, 0.6),
        };
        c.need = false;
        c.progress = 1;
        c.msg = n ? 'Hotovo!' : 'Použito výchozí nastavení.';
      }
    }
    this.panels.calib.refresh(`${Math.round(c.progress * 40)}|${c.msg}|${Math.round(this.musicProgress * 20)}`);
    if (!c.need && this.musicProgress >= 1 && this.audio.sfx.hit && this.envReady) {
      c.wait = (c.wait || 0) + dt;
      if (c.wait > 0.4) this.beginPlay();
    }
  }

  beginPlay() {
    const audio = this.audio;
    const track = this.currentTrack;
    const chart = track.custom ? buildChartFromAnalysis(track.an, track.phrases, this.settings.diff, track.seed) : buildChart(track, this.settings.diff, audio.spb(track));
    this.hideAll();
    this.game.start(chart, track, this.settings.diff, this.calibData);
    this.bot.reset();
    if (track.custom) {
      this.spb = 60 / track.bpm;
      audio.startBuffer(track.buffer, audio.ctx.currentTime + 0.25);
    } else {
      this.spb = audio.spb(track);
      audio.startSong(track, audio.ctx.currentTime + 0.25);
    }
    audio.duckAmbient(true);
    this.screen = 'play';
    if (this.mode === 'desktop') {
      this.yaw = 0;
      this.pitch = -0.2;
    }
    this.setupHud();
  }

  // puls na dobu hudby: 1 přesně na dobu, pak rychle klesá
  beatPulseAt(t) {
    const tr = this.game.track;
    let ph;
    const beats = tr && tr.custom && tr.an && tr.an.beats;
    if (beats && beats.length) {
      let lo = 0, hi = beats.length - 1;
      if (t < beats[0]) return 0;
      while (lo < hi) {
        const m = (lo + hi + 1) >> 1;
        if (beats[m] <= t) lo = m;
        else hi = m - 1;
      }
      ph = t - beats[lo];
    } else {
      if (!this.spb || t < 0) return 0;
      ph = t % this.spb;
    }
    return Math.exp(-ph * 9);
  }

  // odeslat záznam tréninku pro analýzu detekce (ukázka s botem se neposílá)
  uploadRec(g, r, done) {
    const rec = g.rec;
    if (!rec || this.demo || this.mode !== 'vr' || rec.items.length < 8) return;
    rec.result = { done: !!done, score: r.score, acc: +r.acc.toFixed(3), grade: r.grade, hits: r.hits, misses: r.misses, t: +g.t.toFixed(1), reasons: r.reasons };
    try {
      fetch('/api/log', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(rec), keepalive: rec.items.length < 600 }).catch(() => {});
    } catch (e) {}
    g.rec = null;
  }

  setupHud() {
    const c = this.calibData;
    if (this.audio) this.audio.setSpeakers(c.cx, c.headH, c.cz);
    this.dispScore = 0;
    this.lastComboShown = 0;
    // HUD
    const info = this.panels.info;
    info.mesh.visible = true;
    info.mesh.position.set(c.cx - 0.8, c.headH + 0.28, c.cz - 1.55);
    info.mesh.lookAt(c.cx, c.headH, c.cz);
    const combo = this.panels.combo;
    combo.mesh.visible = true;
    combo.mesh.position.set(c.cx + 1.9, c.headH + 0.75, c.cz - 6.5);
    combo.mesh.lookAt(c.cx, c.headH, c.cz);
    const big = this.panels.big;
    big.mesh.visible = true;
    big.mesh.position.set(c.cx, c.headH + 0.35, c.cz - 3.2);
    big.mesh.lookAt(c.cx, c.headH, c.cz);
    this.lastCount = -1;
  }

  finish(done) {
    if (this.screen !== 'play' && this.screen !== 'pause') return;
    const g = this.game;
    g.running = false;
    const r = g.result();
    r.finished = done;
    const track = g.track;
    r.trackName = track.name;
    r.diffName = g.diff.name;
    const key = (track.custom ? 'custom:' + track.name : track.id) + ':' + g.diff.id;
    if (this.audio) this.audio.duckAmbient(false);
    const prev = this.records[key];
    r.record = done && (!prev || r.score > prev.score) && r.score > 0;
    if (r.record) {
      this.records[key] = { score: r.score, grade: r.grade, acc: r.acc, combo: r.maxCombo };
      store.set('pulz.records', this.records);
    }
    this.lastResult = r;
    r.reasons = g.missReasons();
    this.uploadRec(g, r, done);
    if (this.audio) {
      this.audio.stopSong(done ? 0.8 : 0.3);
      if (done) this.sfx('finish');
      // klidná hudba v pozadí po tréninku
      const au = this.audio;
      setTimeout(() => { if (this.screen === 'results' || this.screen === 'menu') au.startLounge(TRACKS.find((t) => t.id === 'rano')); }, done ? 2200 : 600);
    }
    for (const it of g.items) it.state = 'gone';
    g.items.forEach((it) => g.releaseItem(it));
    g.items = [];
    this.hideAll();
    this.fx.clearTexts();
    this.screen = 'results';
    const p = this.panels.results;
    p.mesh.visible = true;
    if (this.mode === 'vr') this.placePanel(p, 0.55, -0.22, 0.35);
    else {
      this.camera.position.set(0, 1.62, 0.32);
      this.yaw = 0;
      this.pitch = -0.12;
      this.hands.L.valid = this.hands.R.valid = false;
      this.hands.L.alpha = this.hands.R.alpha = 0;
      p.mesh.position.set(0, 1.42, -0.6);
      p.mesh.lookAt(this.camera.position);
    }
    va(done ? 'finish_workout' : 'quit_workout', { track: track.id, diff: g.diff.id, acc: Math.round(r.acc * 100), score: r.score });
  }

  pause() {
    if (this.screen !== 'play') return;
    this.screen = 'pause';
    this.audio.pauseSong();
    this.sfx('pause');
    const p = this.panels.pause;
    p.mesh.visible = true;
    this.panels.big.mesh.visible = false;
    if (this.mode === 'vr') this.placePanel(p, 0.5, -0.22, 0.35);
    else {
      p.mesh.position.set(this.camera.position.x, this.camera.position.y - 0.15, this.camera.position.z - 0.75);
      p.mesh.lookAt(this.camera.position);
    }
  }

  resume() {
    if (this.screen !== 'pause') return;
    this.panels.pause.mesh.visible = false;
    this.panels.big.mesh.visible = true;
    this.game.clearNear(this.game.t, 1.3);
    this.audio.resumeSong(0.1);
    this.screen = 'play';
  }

  // ---------- tlačítka ----------
  press(panel, id) {
    const S = this.settings;
    this.sfx('click');
    panel.pressFlash = id;
    setTimeout(() => {
      if (panel.pressFlash === id) panel.pressFlash = null;
    }, 160);
    if (id.startsWith('track:')) {
      const tid = id.slice(6);
      if (tid !== 'custom' || this.customTrack) S.track = tid;
    }
    else if (id.startsWith('diff:')) S.diff = id.slice(5);
    else if (id.startsWith('env:')) {
      if (S.env !== id.slice(4)) {
        S.env = id.slice(4);
        this.loadEnv();
      }
    } else if (/^(sj|sh|su|zone):[-+]$/.test(id)) {
      const [k, op] = id.split(':');
      const d = op === '+' ? 1 : -1;
      if (k === 'zone') S.zone = Math.max(1, Math.min(5, S.zone + d));
      else {
        const key = { sj: 'jab', sh: 'hook', su: 'upper' }[k];
        S.sens[key] = Math.max(1, Math.min(5, S.sens[key] + d));
      }
    } else if (id === 'fps') S.showFps = !S.showFps;
    else if (id === 'coach') S.coach = { voice: 'text', text: 'off', off: 'voice' }[S.coach || 'voice'];
    else if (id === 'warmup') S.warmup = S.warmup === false;
    else if (id === 'stretch') S.stretch = S.stretch === false;
    else if (id === 'autocal') this.toggleAutoCal();
    else if (id === 'amb:-' || id === 'amb:+') {
      S.ambient = Math.max(0, Math.min(5, (S.ambient ?? 3) + (id === 'amb:+' ? 1 : -1)));
      if (this.audio) this.audio.setAmbientLevel(S.ambient / 5);
    }
    else if (id === 'settings') this.showSettings();
    else if (id === 'library') this.showLibrary();
    else if (id === 'libback') this.showMenu();
    else if (id === 'liblock') this.libLock();
    else if (id.startsWith('libpg:')) this.libPage = Math.max(0, this.libPage + (id.endsWith('+') ? 1 : -1));
    else if (id === 'libunlock') this.libKeypad = true;
    else if (id.startsWith('lib:')) {
      const it = this.libItems()[+id.slice(4)];
      if (it) this.selectItem(it);
    } else if (id.startsWith('key:')) {
      const k = id.slice(4);
      this.libStatus = '';
      if (k === 'del') this.pinEntry = this.pinEntry.slice(0, -1);
      else if (k === 'ok') {
        const pin = this.pinEntry;
        this.pinEntry = '';
        this.libStatus = 'Ověřuji…';
        this.libTryPin(pin).then((ok) => {
          if (!ok) this.libStatus = 'Špatný PIN';
        });
      } else if (this.pinEntry.length < 4) {
        this.pinEntry += k;
        if (this.pinEntry.length === 4) {
          const pin = this.pinEntry;
          this.pinEntry = '';
          this.libStatus = 'Ověřuji…';
          this.libTryPin(pin).then((ok) => {
            if (!ok) this.libStatus = 'Špatný PIN';
          });
        }
      }
    }
    else if (id === 'practice') this.togglePractice();
    else if (id === 'back') {
      this.stopPractice();
      this.showMenu();
    } else if (id === 'spatial') {
      S.spatial = !S.spatial;
      if (this.audio) this.audio.setSpatial(S.spatial);
    } else if (id === 'barmode') {
      const order = ['all', 'duck', 'off'];
      S.barriers = order[(order.indexOf(S.barriers || 'all') + 1) % 3];
    } else if (id === 'bar:-') S.barrierDrop = Math.max(0.08, +(S.barrierDrop - 0.02).toFixed(2));
    else if (id === 'bar:+') S.barrierDrop = Math.min(0.35, +(S.barrierDrop + 0.02).toFixed(2));
    else if (id === 'kg:-') S.weight = Math.max(35, S.weight - 5);
    else if (id === 'kg:+') S.weight = Math.min(160, S.weight + 5);
    else if (id === 'off:-') S.audioOffset = Math.max(-200, S.audioOffset - 10);
    else if (id === 'off:+') S.audioOffset = Math.min(200, S.audioOffset + 10);
    else if (id === 'start') this.startFlow();
    else if (id === 'resume') this.resume();
    else if (id === 'restart') {
      this.audio.stopSong();
      this.game.running = false;
      this.game.reset();
      this.screen = 'menu';
      this.startFlow();
    } else if (id === 'recal') {
      this.audio.stopSong();
      this.game.running = false;
      this.game.reset();
      this.calibData = null;
      this.screen = 'menu';
      this.startFlow();
    } else if (id === 'quit') this.finish(false);
    else if (id === 'again') {
      this.screen = 'menu';
      this.startFlow();
    } else if (id === 'menu') this.showMenu();
    this.saveSettings();
  }

  // dotyk prstem (šťouchnutí) do panelů
  pokePanels(dt) {
    this.pokeCool = Math.max(0, this.pokeCool - dt);
    for (const p of Object.values(this.panels)) {
      if (!p.interactive || !p.mesh.visible) continue;
      let hover = null;
      for (const h of [this.hands.L, this.hands.R]) {
        const key = p.wPx + h.side + p.hM;
        if (!h.valid || h.extrap) {
          this.pokeState.delete(key);
          continue;
        }
        _v.copy(h.tip);
        p.mesh.worldToLocal(_v);
        const inside = Math.abs(_v.x) < p.wM / 2 + 0.01 && Math.abs(_v.y) < p.hM / 2 + 0.01;
        const prev = this.pokeState.get(key);
        this.pokeState.set(key, _v.z);
        if (!inside) continue;
        const b = p.hitLocal(_v.x, _v.y);
        if (_v.z < 0.07 && _v.z > -0.05 && b) hover = b.id;
        if (b && prev != null && prev > 0.012 && _v.z <= 0.012 && _v.z > -0.06 && this.pokeCool <= 0) {
          this.pokeCool = 0.35;
          this.press(p, b.id);
        }
      }
      p.hover = hover;
    }
  }

  updatePauseButton(dt) {
    const pb = this.pauseBtn;
    const L = this.hands.L, R = this.hands.R;
    const show = this.mode === 'vr' && this.screen === 'play' && L.valid && !L.extrap;
    pb.visible = show;
    if (!show) {
      this.pauseDwell = 0;
      return;
    }
    // na hřbetu zápěstí
    pb.position.copy(L.wrist).addScaledVector(L.back, 0.03).addScaledVector(L.fwd, -0.035);
    _v.copy(pb.position).add(L.back);
    pb.lookAt(_v);
    let near = false;
    if (R.valid && !R.extrap && R.tip.distanceTo(pb.position) < 0.035 && R.speed < 1.2) near = true;
    this.pauseDwell = near ? this.pauseDwell + dt : Math.max(0, this.pauseDwell - dt * 3);
    const k = clamp(this.pauseDwell / 0.4, 0, 1);
    this.pauseRing.geometry.dispose();
    this.pauseRing.geometry = new THREE.RingGeometry(0.023, 0.029, 6, 1, Math.PI / 2, Math.max(0.01, k * Math.PI * 2));
    if (k >= 1) {
      this.pauseDwell = 0;
      this.pause();
    }
  }

  // ---------- smyčka ----------
  loop(frame) {
    const dt = Math.min(0.05, this.clock.getDelta());
    const now = performance.now() / 1000;
    // skutečné FPS (podle reálného času, ne oříznutého dt)
    this.fpsCount++;
    if (!this.fpsT0) this.fpsT0 = now;
    if (now - this.fpsT0 >= 0.5) {
      this.fps = Math.round(this.fpsCount / (now - this.fpsT0));
      this.fpsCount = 0;
      this.fpsT0 = now;
      if (this.dom && this.dom.fps) this.dom.fps.textContent = this.fps + ' FPS' + (this.quality ? ` · kvalita −${this.quality}` : '');
      this.adaptQuality(now);
    }

    // čas skladby
    let t = 0;
    const playing = this.screen === 'play' && this.audio && this.audio.song;
    if (playing) {
      this.audio.schedule();
      t = this.audio.songTime(dt, this.settings.audioOffset);
    }

    // hlava + ruce
    this.hands.begin();
    if (frame && this.mode === 'vr') {
      const ref = this.renderer.xr.getReferenceSpace();
      const pose = frame.getViewerPose(ref);
      if (pose) {
        const p = pose.transform.position, o = pose.transform.orientation;
        this.head.set(p.x, p.y, p.z);
        this.headQ.set(o.x, o.y, o.z, o.w);
      }
      this.hands.fromXR(frame, ref, this.session);
      if (this.placeAt === 'menu' || this.placeAt === 'pending') {
        if (pose) {
          this.placePanel(this.panels.menu, 0.52, -0.3, 0.42);
          this.placeAt = null;
        }
      }
    } else {
      const demoPlay = this.demo && this.screen === 'play';
      if (demoPlay) {
        // ukázka: pevné mezikroky simulace (funguje i při trhaném vykreslování)
        const t0 = this.lastSimT == null || t < this.lastSimT ? t - dt : this.lastSimT;
        const n = Math.min(30, Math.max(1, Math.ceil((t - t0) / (1 / 90))));
        const sdt = Math.max(1e-4, (t - t0) / n);
        for (let i = 1; i <= n; i++) {
          const ts = t0 + (t - t0) * (i / n);
          if (i > 1) this.hands.begin();
          this.bot.update(ts, sdt);
          this.head.copy(this.bot.head);
          this.hands.end(ts, sdt, this.head);
          this.game.update(ts, sdt, this.hands, this.head);
        }
        this.lastSimT = t;
      } else if (this.demo && this.screen === 'pause') {
        this.hands.L.fresh = this.hands.R.fresh = true; // ruce zůstanou vidět
      } else {
        this.head.copy(this.camera.position);
        this.lastSimT = null;
      }
      if (this.demo && (this.screen === 'play' || this.screen === 'pause')) {
        this.head.copy(this.bot.head);
        // kamera kousek za hlavou bota, ať jsou vidět rukavice
        this.camera.position.copy(this.head).add(_w.set(0, 0.1, 0.45));
      }
      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    }
    const simulated = this.demo && this.screen === 'play' && this.mode !== 'vr';
    if (this.injectHands) this.injectHands(this, t, dt);
    if (!simulated) this.hands.end(now, dt, this.head);

    // střed 360° fotky ve výšce očí
    this.env.setEyeHeight(this.screen === 'play' && this.calibData ? this.calibData.headH : this.mode === 'vr' ? this.head.y : 1.62);

    // obrazovky
    if (this.screen === 'calib') this.updateCalib(dt);
    if (this.mode === 'vr') this.pokePanels(dt);
    this.updatePauseButton(dt);

    if (this.screen === 'play') {
      if (!simulated) this.game.update(t, dt, this.hands, this.head);
      // odpočet v prvních dvou taktech
      const beat = Math.floor(t / this.spb);
      const words = { 4: '3', 5: '2', 6: '1', 7: 'BOXUJ!' };
      const wtxt = words[beat] || '';
      if (beat !== this.lastCount && beat >= 0 && beat <= 8) {
        this.lastCount = beat;
        if (wtxt && !(this.game.track && this.game.track.custom)) this.sfx(beat === 7 ? 'go' : 'count');
      }
      if (this.game.track && this.game.track.custom) this.bigText = t < 2.5 ? this.game.track.name.slice(0, 22) : '';
      else this.bigText = t < 8 * this.spb ? wtxt : '';
      this.panels.big.refresh(this.bigText);
      const g = this.game;
      // skóre se „načítá“ nahoru
      const ds = g.score - this.dispScore;
      this.dispScore = ds > 0 ? Math.min(g.score, this.dispScore + Math.max(ds * Math.min(1, dt * 9), 40 * dt * 60)) : g.score;
      this.beatPulse = this.beatPulseAt(g.t);
      const pq = Math.round(this.beatPulse * 4);
      this.panels.info.refresh(`${Math.ceil(g.duration - g.t)}|${Math.round(g.kcal)}|${Math.round(this.dispScore)}|${g.hits}|${g.misses}|${Math.round((g.t / g.duration) * 200)}|${pq}|${this.settings.showFps ? this.fps : ''}`);
      this.panels.combo.refresh(`${g.combo}|${g.mult}`);
      // aura rukavic + zlaté jiskry z pěstí při vysokém násobiči
      const aura = (g.mult - 1) / 3;
      for (const side of ['L', 'R']) {
        this.hands.gloves[side].aura = aura;
        const h = this.hands.get(side);
        if (g.mult >= 3 && h.valid && Math.random() < (g.mult - 2) * 0.5) {
          const f = h.fist;
          this.fx.emit(f.x + (Math.random() - 0.5) * 0.06, f.y + (Math.random() - 0.5) * 0.06, f.z + (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.2, 0.25 + Math.random() * 0.3, (Math.random() - 0.5) * 0.2, 1, 0.75 + Math.random() * 0.2, 0.25, 0.9, 0.5, 0.008, 0.5);
        }
      }
      if (g.combo > this.lastComboShown) this.comboBump = 1;
      this.lastComboShown = g.combo;
      this.comboBump = Math.max(0, this.comboBump - dt * 6);
      this.comboPop = Math.max(0, this.comboPop - dt * 2);
      this.panels.combo.mesh.scale.setScalar(1 + this.comboPop * 0.25 + this.comboBump * 0.06 + this.beatPulse * 0.03);
    }
    if (this.screen === 'menu') this.panels.menu.refresh(JSON.stringify(this.settings) + this.mode + this.envStatus + '|' + this.localSongs.length + '|' + (this.libSongs ? this.libSongs.length : -1) + '|' + (this.customTrack ? this.customTrack.name : ''));
    if (this.screen === 'settings') {
      if (this.game.practiceMode) this.game.updatePractice(now, dt, this.hands, this.head);
      this.panels.settings.refresh(JSON.stringify(this.settings) + '|' + this.game.attemptRev + '|' + this.game.practiceMode + '|' + !!this.game.autocal + '|' + this.game.practiceIdx + '|' + (this.calMsg || ''));
    }
    if (this.screen === 'pause') this.panels.pause.refresh('p' + this.game.score);
    if (this.screen === 'library') this.panels.lib.refresh([this.libPin ? 1 : 0, this.libKeypad ? 1 : 0, this.pinEntry, this.libStatus, this.libPage, this.libSongs ? this.libSongs.length : -1, this.localSongs.length, this.customTrack ? this.customTrack.localId + this.customTrack.libUrl : ''].join('|'));
    if (this.screen === 'results') this.panels.results.refresh('r' + (this.lastResult ? this.lastResult.score : 0));

    // náraz do bariéry
    this.hurt = Math.max(0, this.hurt - dt * 2.5);
    this.hurtMesh.visible = this.mode === 'vr' && this.hurt > 0.01;
    this.hurtMesh.position.copy(this.head);
    this.hurtMesh.material.opacity = this.hurt * 0.35;

    if (this.audio) {
      const hp = this.mode === 'vr' ? this.head : this.camera.position;
      const hq = this.mode === 'vr' ? this.headQ : this.camera.quaternion;
      _lf.set(0, 0, -1).applyQuaternion(hq);
      _lu.set(0, 1, 0).applyQuaternion(hq);
      this.audio.setListener(hp.x, hp.y, hp.z, _lf.x, _lf.y, _lf.z, _lu.x, _lu.y, _lu.z);
    }
    if (this.screen !== 'play') this.hands.gloves.L.aura = this.hands.gloves.R.aura = 0;
    this.env.beat = this.screen === 'play' ? this.beatPulse : this.audio && this.audio.lounge ? 0.25 + 0.25 * Math.sin(now * 4.4) : 0;
    this.env.playing = this.screen === 'play';
    this.env.streamMat.uniforms.uPx.value = this.renderer.domElement.height;
    this.env.update(dt);
    this.targets.update(dt, this.screen === 'play' ? this.beatPulse : 0, this.screen === 'play' ? this.game.mult : 1);
    this.fx.splashOn = this.env.splash;
    this.fx.update(dt, this.head);
    this.renderer.render(this.scene, this.camera);
  }
}

new App();
