// Prostředí „Zahradní město“: tyrkysová řeka, bujné břehy, zelené věže, panorama, obloha
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from './util.js';

const FOG = new THREE.Color(0xcde8ee);
export const WATER_Y = -0.16;

function skyTexture() {
  const W = 2048, H = 1024;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  // svislý přechod (equirect: v=0 nahoře)
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#1f8fe0');
  grd.addColorStop(0.28, '#3aa8ee');
  grd.addColorStop(0.44, '#8fd3f4');
  grd.addColorStop(0.5, '#d6eef2');
  grd.addColorStop(0.52, '#cde8ee');
  grd.addColorStop(1, '#9fc9d2');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  // slunce (vpředu vpravo nahoře)
  const sx = W * 0.62, sy = H * 0.2;
  const sg = g.createRadialGradient(sx, sy, 0, sx, sy, 260);
  sg.addColorStop(0, 'rgba(255,255,240,1)');
  sg.addColorStop(0.08, 'rgba(255,250,220,0.9)');
  sg.addColorStop(0.3, 'rgba(255,240,200,0.25)');
  sg.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = sg;
  g.fillRect(0, 0, W, H);
  // mraky – shluky měkkých elips
  const R = rng(5);
  for (let i = 0; i < 70; i++) {
    const cx = R() * W;
    const cy = H * (0.18 + R() * 0.28);
    const scale = 0.4 + R() * 1.2;
    const n = 6 + Math.floor(R() * 8);
    for (let k = 0; k < n; k++) {
      const x = cx + (R() - 0.5) * 160 * scale;
      const y = cy + (R() - 0.5) * 22 * scale;
      const r = (20 + R() * 40) * scale;
      const cg = g.createRadialGradient(x, y, 0, x, y, r);
      const a = 0.32 * (1 - (cy / H - 0.18) * 1.2);
      cg.addColorStop(0, `rgba(255,255,255,${a})`);
      cg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = cg;
      g.beginPath();
      g.ellipse(x, y, r * 1.8, r * 0.7, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}

// dlaždicová textura vln (normála v RG, výška v B)
function waveTexture() {
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  const R = rng(77);
  const waves = [];
  for (let i = 0; i < 14; i++) {
    const kx = Math.round((R() - 0.5) * 10) || 1;
    const ky = Math.round(2 + R() * 9);
    waves.push({ kx, ky, a: 1 / (1 + Math.hypot(kx, ky) * 0.35), p: R() * 6.283 });
  }
  const h = new Float32Array(N * N);
  let mn = 1e9, mx = -1e9;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let v = 0;
      for (const w of waves) v += w.a * Math.sin(((w.kx * x + w.ky * y) / N) * 6.2832 + w.p);
      h[y * N + x] = v;
      mn = Math.min(mn, v);
      mx = Math.max(mx, v);
    }
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const dx = h[y * N + ((x + 1) % N)] - h[y * N + ((x - 1 + N) % N)];
      const dy = h[((y + 1) % N) * N + x] - h[((y - 1 + N) % N) * N + x];
      data[i * 4] = Math.max(0, Math.min(255, 128 + dx * 60));
      data[i * 4 + 1] = Math.max(0, Math.min(255, 128 + dy * 60));
      data[i * 4 + 2] = ((h[i] - mn) / (mx - mn)) * 255;
      data[i * 4 + 3] = 255;
    }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

function waterMaterial(tex) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tN: { value: tex },
      uT: { value: 0 },
      uSun: { value: new THREE.Vector3(0.35, 0.55, -0.75).normalize() },
      uDeep: { value: new THREE.Color(0x07657e) },
      uShallow: { value: new THREE.Color(0x27c3cf) },
      uSky: { value: new THREE.Color(0xa8e2f0) },
      uFog: { value: FOG },
      uFogNear: { value: 40 },
      uFogFar: { value: 330 },
    },
    vertexShader: `
      varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform sampler2D tN; uniform float uT; uniform vec3 uSun, uDeep, uShallow, uSky, uFog; uniform float uFogNear, uFogFar;
      varying vec3 vW;
      void main(){
        vec2 p = vW.xz;
        vec2 uv1 = (p - vec2(0.0, -uT*1.6)) * 0.06;
        vec2 uv2 = (p - vec2(uT*0.35, -uT*0.9)) * 0.11 + 0.37;
        vec4 a = texture2D(tN, uv1);
        vec4 b = texture2D(tN, uv2);
        vec2 g = (a.xy*2.0-1.0) + (b.xy*2.0-1.0)*0.7;
        vec3 n = normalize(vec3(g.x, 2.6, g.y));
        vec3 V = normalize(cameraPosition - vW);
        float dist = length(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
        float h = a.z*0.65 + b.z*0.35;
        // malířské pásy barev
        float band = smoothstep(0.4, 0.62, h + g.x*0.2);
        vec3 col = mix(uDeep, uShallow, band);
        col = mix(col, uDeep*0.62, smoothstep(0.68, 0.86, b.z) * 0.7);
        col = mix(col, uShallow*1.12, smoothstep(0.8, 0.9, a.z) * 0.35);
        col = mix(col, uSky, clamp(fres*0.7 + smoothstep(60.0, 220.0, dist)*0.3, 0.0, 0.8));
        vec3 R = reflect(-V, n);
        float sp = pow(max(dot(R, uSun), 0.0), 600.0);
        col += vec3(1.0, 0.97, 0.88) * sp * 0.9 * smoothstep(4.0, 25.0, dist);
        float glint = smoothstep(0.88, 0.96, h) * (1.0 - smoothstep(10.0, 70.0, dist));
        col += glint * 0.12;
        col = mix(col, uFog, smoothstep(uFogNear, uFogFar, dist));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

// pomocník: geometrie s barvou vrcholů
function colored(geo, color, shade = 0) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color(color);
  let ymin = Infinity, ymax = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    ymin = Math.min(ymin, pos.getY(i));
    ymax = Math.max(ymax, pos.getY(i));
  }
  for (let i = 0; i < pos.count; i++) {
    const k = shade ? 1 - shade + shade * ((pos.getY(i) - ymin) / (ymax - ymin || 1)) : 1;
    col[i * 3] = c.r * k;
    col[i * 3 + 1] = c.g * k;
    col[i * 3 + 2] = c.b * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  return geo;
}

export class Env {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.fog = new THREE.Fog(FOG, 45, 340);
    scene.fog = this.fog;
    scene.background = FOG.clone();
    this.mode = 'proc';
    this.panoCache = new Map();
    this.splash = true;

    // světla
    const hemi = (this.hemi = new THREE.HemisphereLight(0xdff4ff, 0x3a6a55, 1.25));
    scene.add(hemi);
    const sun = (this.sun = new THREE.DirectionalLight(0xfff2dd, 1.7));
    sun.position.set(30, 50, -60);
    scene.add(sun);

    // obloha
    const skyTex = skyTexture();
    this.skyTex = skyTex;
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(450, 48, 24),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false })
    );
    sky.rotation.y = Math.PI * 0.5;
    sky.renderOrder = -10;
    this.group.add(sky);

    // voda
    this.waterTex = waveTexture();
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), waterMaterial(this.waterTex));
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = WATER_Y;
    this.group.add(this.water);

    this.buildBanks();
    this.buildTowers();
    this.buildSkyline();
    this.buildPlatform();
    this.t = 0;

    // 360° fotka (koule kolem hráče, střed ve výšce očí)
    const pg = new THREE.SphereGeometry(80, 128, 64);
    pg.scale(-1, 1, 1);
    this.pano = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ fog: false, depthWrite: false, toneMapped: false }));
    this.pano.renderOrder = -10;
    this.pano.position.y = 1.6;
    this.pano.visible = false;
    scene.add(this.pano);

    // odrazy (environment map) z kreslené oblohy
    try {
      this.pmrem = new THREE.PMREMGenerator(renderer);
      this.procEnv = this.pmrem.fromEquirectangular(skyTex).texture;
      scene.environment = this.procEnv;
    } catch (e) {
      this.procEnv = null;
    }
  }

  setEyeHeight(h) {
    this.pano.position.y = h;
  }

  useProc() {
    this.mode = 'proc';
    this.group.visible = true;
    this.pano.visible = false;
    this.scene.fog = this.fog;
    this.scene.environment = this.procEnv;
    this.hemi.color.setHex(0xdff4ff);
    this.hemi.groundColor.setHex(0x3a6a55);
    this.hemi.intensity = 1.25;
    this.splash = true;
  }

  // Načte 360° fotku (Poly Haven, CC0). Vrací true/false. onProgress(0..1 nebo -1 = neznámé)
  async loadPanorama(env, onProgress) {
    if (!env || env.id === 'proc') {
      this.useProc();
      return true;
    }
    let entry = this.panoCache.get(env.id);
    if (!entry) {
      const urls = ['/pano/' + env.id + '.jpg', 'https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Tonemapped%20JPG/' + env.id + '.jpg'];
      let blob = null;
      for (const url of urls) {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const total = +res.headers.get('content-length') || 0;
          if (res.body && res.body.getReader) {
            const reader = res.body.getReader();
            const chunks = [];
            let got = 0;
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              chunks.push(value);
              got += value.length;
              if (onProgress) onProgress(total ? Math.min(0.95, got / total) : -1);
            }
            blob = new Blob(chunks, { type: 'image/jpeg' });
          } else blob = await res.blob();
          if (blob.size < 10000) throw new Error('malý soubor');
          break;
        } catch (e) {
          console.warn('Panorama', url, e.message);
          blob = null;
        }
      }
      if (!blob) {
        this.useProc();
        return false;
      }
      try {
        const max = Math.min(8192, this.renderer.capabilities.maxTextureSize || 4096);
        const opts = { imageOrientation: 'flipY' };
        if (max < 8192) Object.assign(opts, { resizeWidth: max, resizeHeight: max / 2, resizeQuality: 'high' });
        const bmp = await createImageBitmap(blob, opts);
        const tex = new THREE.Texture(bmp);
        tex.flipY = false;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        // malá kopie: odrazy + barvy světla
        const small = await createImageBitmap(blob, { imageOrientation: 'flipY', resizeWidth: 1024, resizeHeight: 512, resizeQuality: 'medium' });
        const st = new THREE.Texture(small);
        st.flipY = false;
        st.colorSpace = THREE.SRGBColorSpace;
        st.mapping = THREE.EquirectangularReflectionMapping;
        st.needsUpdate = true;
        const envMap = this.pmrem ? this.pmrem.fromEquirectangular(st).texture : null;
        // průměrné barvy horní a dolní poloviny (bitmapa je převrácená: řádek 0 = spodek)
        const cv = document.createElement('canvas');
        cv.width = 32;
        cv.height = 16;
        const g = cv.getContext('2d');
        g.drawImage(small, 0, 0, 32, 16);
        const px = g.getImageData(0, 0, 32, 16).data;
        const avg = (y0, y1) => {
          let r = 0, gg = 0, b = 0, n = 0;
          for (let y = y0; y < y1; y++)
            for (let x = 0; x < 32; x++) {
              const i = (y * 32 + x) * 4;
              r += px[i]; gg += px[i + 1]; b += px[i + 2]; n++;
            }
          return new THREE.Color(r / n / 255, gg / n / 255, b / n / 255);
        };
        const bottom = avg(0, 7), top = avg(9, 16);
        entry = { tex, envMap, top, bottom };
        this.panoCache.set(env.id, entry);
      } catch (e) {
        console.warn('Panorama dekódování', e);
        this.useProc();
        return false;
      }
    }
    if (onProgress) onProgress(1);
    this.mode = 'pano';
    this.pano.material.map = entry.tex;
    this.pano.material.needsUpdate = true;
    this.pano.rotation.y = env.yaw || 0;
    this.pano.visible = true;
    this.group.visible = false;
    this.scene.fog = null;
    if (entry.envMap) this.scene.environment = entry.envMap;
    this.hemi.color.copy(entry.top).lerp(new THREE.Color(1, 1, 1), 0.35);
    this.hemi.groundColor.copy(entry.bottom);
    this.hemi.intensity = 1.1;
    this.splash = false;
    return true;
  }

  buildBanks() {
    const R = rng(3);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const parts = [];
    for (const side of [-1, 1]) {
      // pobřeží (travnatý pás + skalní hrana)
      for (let z = -320; z < 140; z += 20) {
        const w = 60;
        const x0 = side * (24 + Math.sin(z * 0.03) * 3 + R() * 2);
        const ground = colored(new THREE.BoxGeometry(w, 1.2, 21), 0x4f8a3c);
        ground.translate(x0 + side * w * 0.5, 0.25, z);
        parts.push(ground);
        // fialově šedé kameny u vody
        for (let k = 0; k < 4; k++) {
          const r = 1.2 + R() * 2.2;
          const rock = colored(new THREE.DodecahedronGeometry(r, 0), [0x6e6a8a, 0x5b5a78, 0x7d7896][k % 3], 0.4);
          rock.scale(1.4, 0.7, 1);
          rock.translate(x0 + side * (R() * 2), 0.0, z + R() * 20 - 10);
          parts.push(rock);
        }
      }
    }
    const banks = new THREE.Mesh(mergeGeometries(parts), mat);
    this.group.add(banks);

    // stromy a keře – jedna instancovaná síť
    const treeParts = [];
    const trunk = colored(new THREE.CylinderGeometry(0.25, 0.4, 3, 6), 0x6b4a33);
    trunk.translate(0, 1.5, 0);
    treeParts.push(trunk);
    const blobs = [
      [0, 4.2, 0, 2.6],
      [1.5, 3.4, 0.6, 1.9],
      [-1.4, 3.6, -0.4, 2.0],
      [0.3, 5.6, -0.3, 1.8],
      [-0.6, 3.2, 1.3, 1.6],
    ];
    for (const [x, y, z, r] of blobs) {
      const g = colored(new THREE.IcosahedronGeometry(r, 1), 0xffffff, 0.55);
      g.translate(x, y, z);
      treeParts.push(g);
    }
    const treeGeo = mergeGeometries(treeParts);
    const palette = [0x5fa84a, 0x77b84e, 0x4e9a45, 0x8cc456, 0x3f8a43, 0x6fae3e, 0xd9573b, 0xe8833a, 0xc94a5b, 0x9cc95a, 0xf0a64a];
    const N = 420;
    const trees = new THREE.InstancedMesh(treeGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), N);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const side = i % 2 ? 1 : -1;
      const z = -300 + R() * 430;
      const edge = 24 + Math.sin(z * 0.03) * 3;
      const bush = R() < 0.35;
      const x = side * (edge + (bush ? 1 + R() * 3 : 3 + Math.pow(R(), 0.7) * 40));
      const sc = bush ? 0.35 + R() * 0.3 : 0.8 + R() * 1.1;
      p.set(x, bush ? 0.2 : 0.6, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6.28);
      s.set(sc * (0.9 + R() * 0.3), sc * (0.8 + R() * 0.5), sc);
      m.compose(p, q, s);
      trees.setMatrixAt(i, m);
      c.setHex(palette[Math.floor(R() * (R() < 0.75 ? 6 : palette.length))]);
      trees.setColorAt(i, c);
    }
    trees.instanceMatrix.needsUpdate = true;
    this.group.add(trees);
  }

  buildTowers() {
    const R = rng(9);
    const parts = [];
    const spots = [
      [-38, -95, 34], [-58, -150, 46], [44, -120, 40], [70, -175, 52], [-30, -210, 30], [36, -60, 22], [-75, -70, 26], [95, -110, 30],
    ];
    for (const [x, z, h] of spots) {
      const floors = Math.floor(h / 4);
      const w = 9 + R() * 6;
      const d = 9 + R() * 6;
      for (let f = 0; f < floors; f++) {
        const y = 0.8 + f * 4;
        const shrink = 1 - (f / floors) * 0.25 + Math.sin(f * 1.7) * 0.05;
        const glass = colored(new THREE.BoxGeometry(w * shrink, 3.1, d * shrink), f % 3 === 0 ? 0x9fd6e8 : 0x7fc0dc, 0.3);
        glass.translate(x, y + 1.55, z);
        parts.push(glass);
        const slab = colored(new THREE.BoxGeometry(w * shrink + 1.6, 0.5, d * shrink + 1.6), 0xf1efe6);
        slab.translate(x, y + 3.3, z);
        parts.push(slab);
        // zeleň na terasách
        const hedge = colored(new THREE.BoxGeometry(w * shrink + 1.8, 0.9, 0.8), R() < 0.3 ? 0xd9573b : 0x5aa646, 0.4);
        hedge.translate(x, y + 3.9, z + (d * shrink) / 2 + 0.5);
        parts.push(hedge);
        if (R() < 0.6) {
          const hedge2 = colored(new THREE.BoxGeometry(0.8, 0.9, d * shrink + 1.8), 0x6fb54d, 0.4);
          hedge2.translate(x + (R() < 0.5 ? -1 : 1) * ((w * shrink) / 2 + 0.5), y + 3.9, z);
          parts.push(hedge2);
        }
      }
      // stromy na střeše
      for (let k = 0; k < 3; k++) {
        const g = colored(new THREE.IcosahedronGeometry(1.6 + R(), 1), 0x5fa84a, 0.5);
        g.translate(x + (R() - 0.5) * w * 0.6, 0.8 + floors * 4 + 1.5, z + (R() - 0.5) * d * 0.6);
        parts.push(g);
      }
    }
    const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.group.add(mesh);
  }

  buildSkyline() {
    const R = rng(21);
    const parts = [];
    for (let i = 0; i < 70; i++) {
      const x = -260 + R() * 520;
      if (Math.abs(x) < 30 && R() < 0.7) continue;
      const h = 15 + Math.pow(R(), 2) * 95;
      const w = 6 + R() * 14;
      const g = colored(new THREE.BoxGeometry(w, h, w), R() < 0.5 ? 0xa9c3d3 : 0x97b4c7, 0.25);
      g.translate(x, h / 2, -300 - R() * 60);
      parts.push(g);
    }
    const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.group.add(mesh);
  }

  buildPlatform() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.78, 0.84, 0.16, 56),
      new THREE.MeshStandardMaterial({ color: 0x1b2232, roughness: 0.55, metalness: 0.2 })
    );
    body.position.y = -0.08;
    g.add(body);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x5c6a85 });
    const r1 = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.46, 64), ringMat);
    r1.rotation.x = -Math.PI / 2;
    r1.position.y = 0.002;
    g.add(r1);
    const r2 = new THREE.Mesh(new THREE.RingGeometry(0.66, 0.68, 64), new THREE.MeshBasicMaterial({ color: 0x8090ad }));
    r2.rotation.x = -Math.PI / 2;
    r2.position.y = 0.002;
    g.add(r2);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.05, 24), new THREE.MeshBasicMaterial({ color: 0xc8d2e6 }));
    dot.rotation.x = -Math.PI / 2;
    dot.position.y = 0.003;
    g.add(dot);
    const markMat = new THREE.MeshBasicMaterial({ color: 0xff7a45 });
    for (const a of [-0.75, 0.75, Math.PI - 0.75, Math.PI + 0.75]) {
      const mk = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.06, 4, 8), markMat);
      mk.rotation.z = Math.PI / 2;
      mk.rotation.y = -a;
      mk.position.set(Math.sin(a) * 0.79, 0.0, -Math.cos(a) * 0.79);
      g.add(mk);
    }
    this.platform = g;
    this.scene.add(g);
  }

  update(dt) {
    this.t += dt;
    if (this.mode === 'proc') this.water.material.uniforms.uT.value = this.t;
    // plošina se jen nepatrně houpe (kamera ne)
    this.platform.position.y = Math.sin(this.t * 1.1) * 0.006;
    this.platform.rotation.z = Math.sin(this.t * 0.8) * 0.004;
  }
}
