// Modelos 3D hechos con código: zombis, mochila, huellas...
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const rnd = (a, b) => a + Math.random() * (b - a);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

function blob(g, x, y, r, col) {
  g.fillStyle = col;
  g.beginPath();
  g.arc(x, y, r, 0, 7);
  g.fill();
  for (let i = 0; i < 9; i++) {
    const a = Math.random() * 6.28, d = r * rnd(0.8, 2);
    g.beginPath();
    g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * rnd(0.08, 0.35), 0, 7);
    g.fill();
  }
}
function drip(g, x, y, len, w, col) {
  g.fillStyle = col;
  g.fillRect(x - w / 2, y, w, len);
  g.beginPath();
  g.arc(x, y + len, w * 0.75, 0, 7);
  g.fill();
}
function blood(g, w, h, n, dripN) {
  for (let i = 0; i < n; i++) {
    const x = rnd(0, w), y = rnd(0, h * 0.8), r = rnd(4, 11);
    blob(g, x, y, r, '#4a0509');
    blob(g, x, y, r * 0.7, '#9e0f1a');
  }
  for (let i = 0; i < dripN; i++) drip(g, rnd(0, w), rnd(0, h * 0.6), rnd(10, 45), rnd(2, 4), '#8a0c16');
}

function skinTex(fear) {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#7d8c6a';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const v = Math.floor(rnd(-25, 25));
      g.fillStyle = `rgb(${110 + v},${125 + v},${95 + v})`;
      g.fillRect(rnd(0, w), rnd(0, h), rnd(2, 7), rnd(2, 7));
    }
    g.strokeStyle = 'rgba(60,40,70,.6)';
    g.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      let x = rnd(0, w), y = rnd(0, h);
      g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += rnd(-14, 14); y += rnd(-14, 14); g.lineTo(x, y); }
      g.stroke();
    }
    if (fear >= 2) {
      for (let i = 0; i < (fear >= 3 ? 4 : 2); i++) {
        const x = rnd(15, w - 15), y = rnd(15, h - 15), r = rnd(6, 12);
        g.fillStyle = '#3a0306';
        g.beginPath(); g.ellipse(x, y, r, r * 0.6, rnd(0, 3), 0, 7); g.fill();
        g.fillStyle = '#b3121f';
        g.beginPath(); g.ellipse(x, y, r * 0.6, r * 0.3, rnd(0, 3), 0, 7); g.fill();
      }
    }
    if (fear >= 3) blood(g, w, h, 3, 4);
  });
}

function clothTex(fear, base) {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 200; i++) {
      g.fillStyle = `rgba(0,0,0,${rnd(0.05, 0.25)})`;
      g.fillRect(rnd(0, w), rnd(0, h), rnd(2, 9), rnd(2, 9));
    }
    // rotos
    g.fillStyle = '#1a1612';
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      const x = rnd(0, w), y = rnd(0, h);
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) g.lineTo(x + rnd(-14, 14), y + rnd(-14, 14));
      g.fill();
    }
    if (fear >= 2) blood(g, w, h, fear >= 3 ? 7 : 3, fear >= 3 ? 8 : 2);
  });
}

function faceTex(fear) {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#7d8c6a';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) {
      const v = Math.floor(rnd(-25, 25));
      g.fillStyle = `rgb(${110 + v},${125 + v},${95 + v})`;
      g.fillRect(rnd(0, w), rnd(0, h), rnd(2, 6), rnd(2, 6));
    }
    // ojeras hundidas
    g.fillStyle = '#2b2a2a';
    g.beginPath(); g.ellipse(40, 50, 20, 15, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(88, 50, 20, 15, 0, 0, 7); g.fill();
    // boca con dientes
    g.fillStyle = '#1a0507';
    g.beginPath(); g.ellipse(64, 98, 30, 14, 0, 0, 7); g.fill();
    g.fillStyle = '#e8e0c0';
    for (let i = 0; i < 7; i++) g.fillRect(38 + i * 8, 86, 5, rnd(6, 10));
    for (let i = 0; i < 6; i++) g.fillRect(42 + i * 8, 104, 5, rnd(4, 8));
    // cicatriz
    g.strokeStyle = '#3a2a2a'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(15, 20); g.lineTo(45, 30); g.stroke();
    for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(18 + i * 6, 18 + i * 2); g.lineTo(20 + i * 6, 30 + i * 2); g.stroke(); }
    if (fear >= 2) {
      // sangre en la boca
      g.fillStyle = '#8a0c16';
      for (let i = 0; i < (fear >= 3 ? 6 : 2); i++) drip(g, rnd(40, 90), 106, rnd(8, 24), rnd(2, 4), '#8a0c16');
    }
    if (fear >= 3) {
      blob(g, 100, 25, 8, '#7a0a12');
      drip(g, 30, 60, 30, 3, '#8a0c16');
      drip(g, 95, 60, 22, 3, '#8a0c16');
    }
  });
}

function textSprite(text, size = 0.35) {
  const tex = canvasTex(128, 128, (g) => {
    g.font = '90px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 64, 70);
  });
  tex.magFilter = THREE.LinearFilter;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  s.scale.set(size, size, size);
  return s;
}

const SHIRTS = ['#3d4f6b', '#6b3d3d', '#55603a', '#5a4a6b', '#6b5a3d', '#4a6b66'];

// ---------- Zombis realistas (modelos 3D de Mixamo con animaciones) ----------
const ZFILES = { cop: 'models/zombie_cop.glb', girl: 'models/zombie_girl.glb', war: 'models/zombie_war.glb' };
const zPromises = {};
const zLoaded = {};

function loadZombieModel(kind) {
  if (!zPromises[kind]) {
    zPromises[kind] = new GLTFLoader().loadAsync(ZFILES[kind]).then((g) => { zLoaded[kind] = g; return g; });
  }
  return zPromises[kind];
}

// Carga los modelos según el nivel de miedo (el soldado es el más sangriento: solo en Terror)
export function preloadZombies(fear) {
  const kinds = fear >= 3 ? ['war', 'cop', 'girl'] : ['cop', 'girl'];
  return Promise.allSettled(kinds.map(loadZombieModel));
}

let _shadowTex = null;
function contactShadow() {
  _shadowTex = _shadowTex || canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.65)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: _shadowTex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.01;
  return m;
}

function makeRealZombie(fear, kinds) {
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  const g = zLoaded[kind];
  const model = SkeletonUtils.clone(g.scene);
  const root = new THREE.Group();
  const box = new THREE.Box3().setFromObject(model);
  const h = box.max.y - box.min.y;
  const s = (kind === 'girl' ? 1.62 : 1.78) / h;
  model.scale.multiplyScalar(s);
  model.position.y = -box.min.y * s;
  model.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  root.add(model);
  root.add(contactShadow());
  const zzz = textSprite('💤', 0.5);
  zzz.position.set(0, 0.5, 0);
  zzz.visible = false;
  root.add(zzz);

  const mixer = new THREE.AnimationMixer(model);
  const clips = Object.fromEntries(g.animations.map((c) => [c.name, c]));
  const actions = {};
  const act = (n) => (clips[n] ? (actions[n] = actions[n] || mixer.clipAction(clips[n])) : null);
  let current = act('idle');
  current.time = Math.random() * clips.idle.duration;
  current.play();
  const play = (name, { once = false, fade = 0.35 } = {}) => {
    const a = act(name);
    if (!a || a === current) return a;
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    a.clampWhenFinished = once;
    a.play();
    current.crossFadeTo(a, fade, false);
    current = a;
    return a;
  };

  const st = { t: 0, walk: 0, lunge: 0, state: 'idle', anim: 'idle', busyUntil: 0 };
  root.userData = {
    real: true,
    center: new THREE.Vector3(0, 1.0, 0),
    tapSeg: [new THREE.Vector3(0, 0.3, 0), new THREE.Vector3(0, 1.6, 0)],
    radius: 0.35,
    st,
    sleep() {
      if (st.state === 'down') return;
      st.state = 'down';
      st.t = 0;
      play('death', { once: true, fade: 0.15 });
    },
    get asleep() { return st.state === 'down'; },
    // Gritar o levantarse del suelo (para los sustos)
    special(name) {
      const a = play(name, { once: true, fade: 0.1 });
      if (a) st.busyUntil = st.t + clips[name].duration - 0.2;
      return !!a;
    },
    animate(dt) {
      st.t += dt;
      if (st.state === 'down') {
        if (st.t > 1.8) { zzz.visible = true; zzz.position.y = 0.5 + Math.sin(st.t * 2) * 0.1; }
      } else if (st.t > st.busyUntil) {
        const want = st.walk > 0.5 ? 'walk' : st.lunge > 0.5 && clips.attack ? 'attack' : 'idle';
        if (want !== st.anim || current !== actions[want]) { st.anim = want; play(want); }
      }
      mixer.update(dt);
    },
  };
  return root;
}

export function makeZombie(fear = 3, opts = {}) {
  const kinds = Object.keys(zLoaded).filter((k) => fear >= 3 || k !== 'war');
  if (kinds.length && !opts.procedural) return makeRealZombie(fear, kinds);
  return makeBlockZombie(fear, opts);
}

// Zombi hecho con cajas (si no se han podido cargar los modelos)
function makeBlockZombie(fear = 3, opts = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const mat = (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.95 });
  const skinT = skinTex(fear);
  const skin = mat(skinT);
  const shirt = mat(clothTex(fear, opts.doctor ? '#d8d8d0' : SHIRTS[Math.floor(Math.random() * SHIRTS.length)]));
  const pants = mat(clothTex(Math.max(1, fear - 1), '#2c2a28'));
  const face = mat(faceTex(fear));

  // piernas
  const legGeo = new THREE.BoxGeometry(0.15, 0.82, 0.17);
  legGeo.translate(0, -0.41, 0);
  const legL = new THREE.Mesh(legGeo, pants);
  legL.position.set(-0.11, 0.84, 0);
  const legR = new THREE.Mesh(legGeo, pants);
  legR.position.set(0.11, 0.84, 0);
  body.add(legL, legR);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.25), shirt);
  torso.position.y = 1.14;
  body.add(torso);

  // cabeza
  const neck = new THREE.Group();
  neck.position.y = 1.45;
  body.add(neck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 0.28), [skin, skin, skin, skin, face, skin]);
  head.position.y = 0.17;
  neck.add(head);
  const eyeMat = new THREE.MeshBasicMaterial({ color: fear >= 3 ? 0xfff6c8 : 0xe8ffe0 });
  const eyeGeo = new THREE.SphereGeometry(0.03, 10, 8);
  const eL = new THREE.Mesh(eyeGeo, eyeMat); eL.position.set(-0.065, 0.2, 0.142);
  const eR = new THREE.Mesh(eyeGeo, eyeMat); eR.position.set(0.065, 0.2, 0.142);
  neck.add(eL, eR);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.06), new THREE.MeshStandardMaterial({ color: fear >= 2 ? 0x5a0a10 : 0x3a2a2a }));
  jaw.position.set(0, 0.03, 0.13);
  neck.add(jaw);

  // brazos
  const armGeo = new THREE.BoxGeometry(0.12, 0.62, 0.12);
  armGeo.translate(0, -0.31, 0);
  const handGeo = new THREE.BoxGeometry(0.13, 0.14, 0.1);
  handGeo.translate(0, -0.68, 0);
  const mkArm = (x) => {
    const sh = new THREE.Group();
    sh.position.set(x, 1.4, 0);
    sh.add(new THREE.Mesh(armGeo, shirt), new THREE.Mesh(handGeo, skin));
    body.add(sh);
    return sh;
  };
  const armL = mkArm(-0.3), armR = mkArm(0.3);
  const limp = fear >= 3 && Math.random() < 0.5;
  armL.rotation.x = limp ? -0.15 : -1.45;
  armL.rotation.z = limp ? 0.12 : 0;
  armR.rotation.x = -1.4;

  // sombra
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.4, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;
  root.add(shadow);

  const zzz = textSprite('💤', 0.5);
  zzz.position.set(0, 0.6, 0);
  zzz.visible = false;
  root.add(zzz);

  const s = opts.scale || 1;
  root.scale.setScalar(s);
  const st = { t: Math.random() * 10, walk: 0, down: 0, state: 'idle', lunge: 0 };
  root.userData = {
    center: new THREE.Vector3(0, 1.1, 0),
    tapSeg: [new THREE.Vector3(0, 0.4, 0), new THREE.Vector3(0, 1.65, 0)],
    radius: 0.35,
    st,
    sleep() { if (st.state !== 'down') { st.state = 'down'; st.down = 0; } },
    get asleep() { return st.state === 'down'; },
    animate(dt) {
      st.t += dt;
      const t = st.t;
      if (st.state === 'down') {
        st.down = Math.min(1, st.down + dt * 1.6);
        const p = st.down;
        body.rotation.x = -p * 1.5;
        body.position.y = p * 0.12;
        jaw.rotation.x = 0;
        armL.rotation.x = -1.45 + p * 1.2;
        armR.rotation.x = -1.4 + p * 1.2;
        if (p >= 1) { zzz.visible = true; zzz.position.y = 0.5 + Math.sin(t * 2) * 0.1; }
        return;
      }
      const w = st.walk;
      body.rotation.z = Math.sin(t * 1.7) * 0.07;
      body.rotation.x = 0.1 + st.lunge * 0.25;
      neck.rotation.z = 0.25 + Math.sin(t * 1.1) * 0.1;
      neck.rotation.x = Math.sin(t * 2.3) * 0.08;
      jaw.rotation.x = (Math.sin(t * 7) + 1) * 0.3;
      jaw.position.y = 0.03 - (Math.sin(t * 7) + 1) * 0.02;
      legL.rotation.x = Math.sin(t * 4.2) * 0.45 * w;
      legR.rotation.x = -Math.sin(t * 4.2) * 0.45 * w;
      if (!limp) armL.rotation.x = -1.45 + Math.sin(t * 2.1) * 0.12;
      else armL.rotation.z = 0.12 + Math.sin(t * 4.2) * 0.1 * w;
      armR.rotation.x = -1.4 + Math.sin(t * 2.4 + 1) * 0.12;
    },
  };
  return root;
}

function handprintTex() {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = 'rgba(140,10,20,.9)';
    g.beginPath(); g.ellipse(64, 78, 26, 30, 0, 0, 7); g.fill();
    [[-26, -30, -0.5], [-12, -48, -0.15], [4, -52, 0], [20, -46, 0.15], [36, -12, 0.9]].forEach(([dx, dy, a]) => {
      g.save();
      g.translate(64 + dx, 70 + dy);
      g.rotate(a);
      g.beginPath(); g.ellipse(0, 0, 7, 17, 0, 0, 7); g.fill();
      g.restore();
    });
    for (let i = 0; i < 12; i++) { g.beginPath(); g.arc(rnd(20, 108), rnd(20, 120), rnd(1, 4), 0, 7); g.fill(); }
  });
}
let _hpTex = null;
export function makeHandprint() {
  _hpTex = _hpTex || handprintTex();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ map: _hpTex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = rnd(0, 6.28);
  m.position.y = 0.015;
  return m;
}

export function makeGlowRing(color = 0xffd23f) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.55, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  let t = 0;
  ring.userData.animate = (dt) => {
    t += dt;
    const s = 1 + Math.sin(t * 4) * 0.15;
    ring.scale.set(s, s, s);
    ring.material.opacity = 0.35 + Math.sin(t * 4) * 0.25;
  };
  return ring;
}

export function makeBackpack(fear) {
  const g = new THREE.Group();
  const tex = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = '#6a4322'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 150; i++) { c.fillStyle = `rgba(0,0,0,${rnd(0.05, 0.2)})`; c.fillRect(rnd(0, w), rnd(0, h), 3, 3); }
    c.strokeStyle = '#d9b77a'; c.setLineDash([4, 4]); c.lineWidth = 2;
    c.strokeRect(10, 10, w - 20, h - 20);
    c.fillStyle = '#ffe9a8'; c.font = 'bold 22px sans-serif'; c.textAlign = 'center';
    c.fillText('DR. MOHO', 64, 70);
    if (fear >= 2) blood(c, w, h, fear >= 3 ? 5 : 2, fear >= 3 ? 5 : 1);
  });
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.46, 0.24), m);
  bag.position.y = 0.23;
  const flap = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.14, 0.26), new THREE.MeshStandardMaterial({ color: 0x4d2f15 }));
  flap.position.y = 0.42;
  const strapM = new THREE.MeshStandardMaterial({ color: 0x222222 });
  const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.02), strapM); s1.position.set(-0.12, 0.25, -0.13);
  const s2 = s1.clone(); s2.position.x = 0.12;
  const note = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.12), new THREE.MeshBasicMaterial({ color: 0xfff4c0 }));
  note.position.set(0.05, 0.35, 0.125);
  note.rotation.z = 0.2;
  g.add(bag, flap, s1, s2, note);
  g.rotation.z = 0.15;
  g.userData.center = new THREE.Vector3(0, 0.25, 0);
  g.userData.radius = 0.45;
  return g;
}

export { textSprite };
