// Vizuály terčů (disk s ikonou, závorky-časovač, ukazatel směru) a bariér („Měsíc“)
import * as THREE from 'three';
import { COL, GEO } from './config.js';
import { getIconTex } from './hands.js';

const R = GEO.targetR;

function wingShape() {
  // srpek/„křídlo“ ukazující, odkud úder přichází
  const s = new THREE.Shape();
  s.absarc(0, 0, 0.11, -Math.PI * 0.42, Math.PI * 0.42, false);
  s.absarc(0.045, 0, 0.085, Math.PI * 0.45, -Math.PI * 0.45, true);
  return new THREE.ShapeGeometry(s, 16);
}

export class TargetPool {
  constructor(scene) {
    this.scene = scene;
    this.bodyGeo = new THREE.CylinderGeometry(R, R * 0.92, 0.075, 40);
    this.bodyGeo.rotateX(Math.PI / 2);
    this.bodyMat = new THREE.MeshStandardMaterial({ color: 0x161c2a, roughness: 0.35, metalness: 0.5 });
    this.rimGeo = new THREE.TorusGeometry(R * 0.97, 0.011, 8, 48);
    this.rimMat = {
      L: new THREE.MeshBasicMaterial({ color: COL.L, toneMapped: false }),
      R: new THREE.MeshBasicMaterial({ color: COL.R, toneMapped: false }),
    };
    this.faceGeo = new THREE.CircleGeometry(R * 0.82, 40);
    this.faceMat = {
      L: new THREE.MeshBasicMaterial({ map: getIconTex('L'), toneMapped: false }),
      R: new THREE.MeshBasicMaterial({ map: getIconTex('R'), toneMapped: false }),
    };
    this.bracketGeo = new THREE.TorusGeometry(1, 0.045, 4, 20, Math.PI * 0.5);
    this.wingGeo = wingShape();
    this.pool = [];
    for (let i = 0; i < 28; i++) this.pool.push(this.make());

    // bariéry
    this.barrierPool = [];
    for (let i = 0; i < 6; i++) this.barrierPool.push(this.makeBarrier());
  }

  make() {
    const g = new THREE.Group();
    const spin = new THREE.Group();
    g.add(spin);
    const body = new THREE.Mesh(this.bodyGeo, this.bodyMat);
    const rim = new THREE.Mesh(this.rimGeo, this.rimMat.L);
    rim.position.z = 0.038;
    const face = new THREE.Mesh(this.faceGeo, this.faceMat.L);
    face.position.z = 0.0385;
    spin.add(body, rim, face);
    const brMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
    const brackets = new THREE.Group();
    for (const a of [Math.PI * 0.75, -Math.PI * 0.25]) {
      const b = new THREE.Mesh(this.bracketGeo, brMat);
      b.rotation.z = a;
      brackets.add(b);
    }
    g.add(brackets);
    const wingMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
    const wing = new THREE.Mesh(this.wingGeo, wingMat);
    g.add(wing);
    g.visible = false;
    this.scene.add(g);
    return { g, spin, rim, face, brackets, brMat, wing, wingMat, busy: false };
  }

  get(side, type) {
    let o = this.pool.find((p) => !p.busy);
    if (!o) {
      o = this.make();
      this.pool.push(o);
    }
    o.busy = true;
    o.g.visible = true;
    o.rim.material = this.rimMat[side];
    o.face.material = this.faceMat[side];
    o.g.scale.setScalar(1);
    o.spin.rotation.set(0, 0, Math.random() * 6.28);
    o.brackets.visible = true;
    // ukazatel směru
    if (type === 'hook') {
      o.wing.visible = true;
      // křídlo na vnější straně (pravý hook přichází zprava)
      const sgn = side === 'R' ? 1 : -1;
      o.wing.position.set(sgn * (R + 0.035), 0, 0.01);
      o.wing.rotation.set(0, 0, sgn > 0 ? 0 : Math.PI);
    } else if (type === 'upper') {
      o.wing.visible = true;
      o.wing.position.set(0, -(R + 0.035), 0.01);
      o.wing.rotation.set(0, 0, -Math.PI / 2);
    } else o.wing.visible = false;
    return o;
  }

  release(o) {
    o.busy = false;
    o.g.visible = false;
  }

  makeBarrier() {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xffb13b, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48, 0, Math.PI), mat);
    g.add(disc);
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.95, toneMapped: false, depthWrite: false });
    const arc = new THREE.Mesh(new THREE.TorusGeometry(1, 0.018, 6, 64, Math.PI), edgeMat);
    g.add(arc);
    const line = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.045, 0.045), edgeMat);
    g.add(line);
    // pruhy (výstražné)
    for (let k = 1; k <= 3; k++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(k * 0.24, 0.007, 4, 48, Math.PI), edgeMat);
      g.add(r);
    }
    g.visible = false;
    this.scene.add(g);
    return { g, mat, edgeMat, busy: false };
  }

  getBarrier(type) {
    let o = this.barrierPool.find((p) => !p.busy);
    if (!o) {
      o = this.makeBarrier();
      this.barrierPool.push(o);
    }
    o.busy = true;
    o.g.visible = true;
    o.g.scale.setScalar(0.9);
    // duck: plochá hrana dole (vodorovně); lean: plochá hrana svisle
    if (type === 'duck') o.g.rotation.set(0, 0, 0);
    else if (type === 'leanL') o.g.rotation.set(0, 0, -Math.PI / 2); // stěna vpravo, ukloň se vlevo
    else o.g.rotation.set(0, 0, Math.PI / 2);
    o.mat.color.setHex(0xffb13b);
    o.edgeMat.color.setHex(0xffd36a);
    return o;
  }

  releaseBarrier(o) {
    o.busy = false;
    o.g.visible = false;
  }
}
