// Cámara con objetos 3D.
// - WebXR (realidad aumentada de verdad, ARCore): los objetos se quedan pegados al suelo real
//   y, si el móvil mide profundidad (Depth API), las manos y objetos reales tapan a los zombis.
// - Si no hay WebXR: cámara trasera de fondo + sensores de orientación (solo girar sobre uno mismo).
// - En ordenador: arrastrar para mirar.
import * as THREE from 'three';
import { $, sleep, clamp, store } from './util.js';

const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
const zee = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);
const DEG = Math.PI / 180;
const KID_EYE = 1.15; // altura aproximada del móvil en manos de un niño (m)

export class AR {
  constructor() {
    this.root = $('#ar');
    this.video = $('#ar-video');
    this.canvas = $('#ar-canvas');
    this.ui = $('#ar-ui');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.xr.enabled = true;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.05, 80);
    this.scene.add(new THREE.HemisphereLight(0xe8eeff, 0x3a2a2a, 2.2));
    const d = new THREE.DirectionalLight(0xffffff, 1.6);
    d.position.set(1, 3, 2);
    this.scene.add(d);
    this.tappables = new Set();
    this.updaters = new Set();
    this.mode = null;
    this.active = false;
    this.floorY = -1.3;
    this.floorLocked = true;
    this.yaw = 0;
    this.pitch = 0;
    this._euler = new THREE.Euler();
    this._q0 = new THREE.Quaternion();
    this._qt = new THREE.Quaternion();
    this._last = performance.now();
    this._lastTap = 0;
    this.xrSupported = null;
    this.exitHandlers = new Set();

    // Retícula que enseña dónde ha encontrado el suelo
    this.reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.12, 0.17, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x7dff9a, transparent: true, opacity: 0.85, depthWrite: false })
    );
    this.reticle.visible = false;
    this.scene.add(this.reticle);

    // Oclusión con profundidad real (manos, árboles, personas tapan lo virtual)
    this.occ = {
      tex: null,
      uniforms: {
        uDepthTex: { value: null },
        uUvT: { value: new THREE.Matrix4() },
        uRawToM: { value: 0.001 },
        uOn: { value: 0 },
        uFloat: { value: 0 },
        uViewport: { value: new THREE.Vector2(1, 1) },
      },
    };

    addEventListener('resize', () => this.resize());
    this.setupPointer();
    $('#ar-exit').addEventListener('click', () => this.requestExit());
    this.root.addEventListener('beforexrselect', (e) => { if (e.target.closest('button,.noxr')) e.preventDefault(); });
    this.checkXR();
  }

  async checkXR() {
    if (this.xrSupported !== null) return this.xrSupported;
    try { this.xrSupported = !!(navigator.xr && (await navigator.xr.isSessionSupported('immersive-ar'))); } catch { this.xrSupported = false; }
    return this.xrSupported;
  }

  resize() {
    if (this.mode === 'xr' || !this.active) return;
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Abre la cámara. Hay que llamarlo desde un toque (el navegador lo exige).
  async open() {
    this.root.hidden = false;
    document.body.classList.add('ar-open');
    this.active = true;
    this._last = performance.now();
    this.setMsg('');
    const ok = this.xrSupported ?? (await this.checkXR());
    if (ok && !this.noXR) {
      try { await this.startXR(); this.badge(); return this.mode; } catch (e) { console.warn('WebXR no disponible, uso la cámara normal', e); }
    }
    await this.startFallback();
    this.badge();
    return this.mode;
  }

  // Indicador arriba: RA+ = realidad aumentada recibiendo profundidad ahora mismo
  badge() {
    const el = $('#ar-mode');
    if (!el) return;
    const depthNow = this.depthTime && performance.now() - this.depthTime < 1500;
    el.textContent = this.mode === 'xr' ? (depthNow ? 'RA+' : 'RA') : this.mode === 'orient' ? '📷' : '🖱️';
    const dg = $('#ar-diag');
    if (dg) { dg.hidden = !this.diagOn; if (this.diagOn) dg.textContent = this.diagText(); }
    clearTimeout(this._badgeT);
    if (this.active) this._badgeT = setTimeout(() => this.badge(), this.diagOn ? 400 : 1000);
  }

  async startXR() {
    const session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay', 'depth-sensing'],
      domOverlay: { root: this.root },
      depthSensing: { usagePreference: ['cpu-optimized'], dataFormatPreference: ['luminance-alpha', 'float32'] },
    });
    this.mode = 'xr';
    this.root.classList.add('xr');
    this.session = session;
    this.renderer.xr.setReferenceSpaceType('local');
    await this.renderer.xr.setSession(session);
    this.refSpace = this.renderer.xr.getReferenceSpace();
    const viewer = await session.requestReferenceSpace('viewer');
    try {
      this.hitSource = await session.requestHitTestSource({ space: viewer, entityTypes: ['plane'] });
    } catch {
      this.hitSource = await session.requestHitTestSource({ space: viewer });
    }
    this.depthOn = !!(session.enabledFeatures && session.enabledFeatures.includes('depth-sensing') && session.depthUsage === 'cpu-optimized');
    this.occ.uniforms.uFloat.value = session.depthDataFormat === 'float32' ? 1 : 0;
    // Suelo: el círculo verde solo se pide la primera vez. Luego se recuerda a qué altura
    // se lleva el móvil y se usa directamente (y se afina en silencio si el suelo se ve).
    const h = store.get('floorH', null);
    this.floorQuiet = typeof h === 'number' && h > 0.4 && h < 2.2;
    this.floorY = this.floorQuiet ? -h : -KID_EYE;
    this.floorLocked = false;
    this.floorCands = [];
    this.floorStart = performance.now();
    session.addEventListener('select', (e) => this.onSelect(e));
    session.addEventListener('end', () => {
      this.hitSource = null;
      this.session = null;
      if (this.active) this.requestExit();
    });
    this.renderer.setAnimationLoop((t, f) => this.frame(f));
    // Consejo una vez por partida: la mano tiene que estar lejos del móvil para tapar
    if (!this._handTip) {
      setTimeout(() => {
        if (this.active && this.depthTime && !this._handTip) {
          this._handTip = true;
          this.toast('✋ Para tapar a un zombi con la mano, <b>estira bien el brazo</b>: tiene que estar a más de medio metro del móvil.', 6000);
        }
      }, 6000);
    }
  }

  async startFallback() {
    this.mode = 'orient';
    this.depthOn = false;
    this.root.classList.remove('xr');
    this.resize();
    this.camera.position.set(0, 0, 0);
    this.camera.quaternion.identity();
    this.floorY = -KID_EYE;
    this.floorLocked = true;
    this.yaw = 0;
    this.pitch = 0;
    this.root.classList.add('nocam');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      this.video.srcObject = this.stream;
      await this.video.play().catch(() => {});
      this.root.classList.remove('nocam');
    } catch (e) { console.warn('sin cámara', e); }
    this.orient = null;
    this._orientH = (e) => { if (e.alpha == null && e.beta == null) return; this.orient = e; };
    addEventListener('deviceorientation', this._orientH);
    this.renderer.setAnimationLoop(() => this.frame(null));
    await sleep(600);
    if (!this.orient) this.mode = 'drag';
    this.root.classList.toggle('drag', this.mode === 'drag');
  }

  frame(f) {
    const tnow = performance.now(), dt = Math.min((tnow - this._last) / 1000, 0.1);
    this._last = tnow;
    if (this.mode === 'xr') {
      if (f) {
        if (!this.floorLocked) this.calibrateFloor(f);
        if (this.depthOn) this.updateDepth(f);
      }
    } else this.updateOrientation();
    for (const c of this.scene.children) {
      if (!c.userData.floor) continue;
      c.position.y = this.floorY;
      if (!c.userData.fitted && this.depthCpu) this.fitInRoom(c);
    }
    for (const u of this.updaters) { try { u(dt); } catch (e) { this.diagError(e); } }
    this.renderer.render(this.scene, this.camera);
  }

  // Distancia real (metros) en un punto de la pantalla, según el sensor de profundidad. 0 = no se sabe.
  depthAt(sx, sy) {
    const d = this.depthCpu;
    if (!d || performance.now() - this.depthTime > 1000) return 0;
    const v = new THREE.Vector4(sx / innerWidth, sy / innerHeight, 0, 1).applyMatrix4(d.m);
    const col = clamp(Math.floor(v.x * d.w), 0, d.w - 1), row = clamp(Math.floor(v.y * d.h), 0, d.h - 1);
    return d.data[row * d.w + col] * d.raw;
  }

  // Si un objeto ha quedado "dentro" de una pared o un mueble, lo acerca hasta delante del obstáculo.
  // Se comprueba varias veces durante los primeros 12 s que el objeto está a la vista
  // (al principio el sensor tarda en dar medidas buenas).
  fitInRoom(obj) {
    const ud = obj.userData, now = performance.now();
    const s = this.toScreen(this.centerOf(obj));
    if (!s || s.x < 0 || s.y < 0 || s.x > innerWidth || s.y > innerHeight) return;
    ud.seenAt = ud.seenAt || now;
    if (now - ud.seenAt > 12000) { ud.fitted = true; return; }
    if (now - (ud.lastFit || 0) < 150) return;
    ud.lastFit = now;
    // varios puntos alrededor del centro del objeto; se ignoran lecturas vacías o muy cercanas (manos)
    const vals = [];
    for (const [dx, dy] of [[0, 0], [-30, 0], [30, 0], [0, -40], [0, 40], [-20, 20], [20, -20]]) {
      const r = this.depthAt(s.x + dx, s.y + dy);
      if (r > 0.6) vals.push(r);
    }
    this.lastFitInfo = { vals: vals.length, obj: s.dist };
    if (vals.length < 3) return;
    vals.sort((a, b) => a - b);
    const real = vals[Math.floor(vals.length / 2)]; // mediana: distancia "en línea recta" desde la cámara
    if (real > s.dist - 0.3) { ud.behind = 0; return; }
    ud.behind = (ud.behind || 0) + 1;
    if (ud.behind < 3) return; // tiene que repetirse para fiarse
    ud.behind = 0;
    const k = Math.max(0.9, real - 0.45) / s.dist;
    const p = this.camPos();
    obj.position.x = p.x + (obj.position.x - p.x) * k;
    obj.position.z = p.z + (obj.position.z - p.z) * k;
  }

  // Busca el suelo (solo planos horizontales por debajo del móvil) y lo fija
  calibrateFloor(f) {
    if (!this.hitSource) return;
    const r = f.getHitTestResults(this.hitSource);
    this.reticle.visible = false;
    // en modo silencioso solo se afina durante los primeros segundos
    if (this.floorQuiet && performance.now() - this.floorStart > 6000) { this.floorLocked = true; return; }
    if (!r.length) return;
    const p = r[0].getPose(this.refSpace);
    if (!p) return;
    const o = p.transform.orientation;
    const up = UP.clone().applyQuaternion(new THREE.Quaternion(o.x, o.y, o.z, o.w));
    const y = p.transform.position.y, cy = this.camera.position.y;
    if (up.y < 0.9 || y > cy - 0.3 || y < cy - 2.3) return;
    this.reticle.visible = !this.floorQuiet;
    this.reticle.position.set(p.transform.position.x, y + 0.005, p.transform.position.z);
    this.floorCands.push(y);
    if (this.floorCands.length >= 12) this.lockFloor();
  }

  lockFloor(fallbackY) {
    if (this.floorLocked) return;
    const c = [...(this.floorCands || [])].sort((a, b) => a - b);
    // el suelo es lo más bajo: nos quedamos con la parte baja de las lecturas
    const found = c.length ? c[Math.floor(c.length * 0.25)] : null;
    if (found != null && (!this.floorQuiet || Math.abs(found - this.floorY) < 0.4)) {
      this.floorY = found;
      store.set('floorH', this.camera.position.y - found); // altura del móvil sobre el suelo
    } else if (found == null && !this.floorQuiet) this.floorY = fallbackY ?? this.camera.position.y - KID_EYE;
    this.floorLocked = true;
    this.reticle.visible = false;
  }

  // Profundidad real -> textura para que los objetos reales tapen a los virtuales
  updateDepth(f) {
    const pose = f.getViewerPose(this.refSpace);
    if (!pose || !pose.views.length) return;
    let di = null;
    try { di = f.getDepthInformation(pose.views[0]); } catch { di = null; }
    const U = this.occ.uniforms;
    if (!di || !di.data) { U.uOn.value = 0; return; }
    const isFloat = U.uFloat.value > 0.5;
    const w = di.width, h = di.height;
    let tex = this.occ.tex;
    if (!tex || tex.image.width !== w || tex.image.height !== h) {
      if (tex) tex.dispose();
      tex = isFloat
        ? new THREE.DataTexture(new Float32Array(w * h), w, h, THREE.RedFormat, THREE.FloatType)
        : new THREE.DataTexture(new Uint8Array(w * h * 2), w, h, THREE.RGFormat, THREE.UnsignedByteType);
      tex.magFilter = tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.unpackAlignment = 1;
      this.occ.tex = tex;
      U.uDepthTex.value = tex;
    }
    tex.image.data = isFloat ? new Float32Array(di.data) : new Uint8Array(di.data);
    tex.needsUpdate = true;
    U.uUvT.value.fromArray(di.normDepthBufferFromNormView.matrix);
    U.uRawToM.value = di.rawValueToMeters;
    // copia para consultar distancias desde el programa (paredes)
    this.depthCpu = {
      data: isFloat ? new Float32Array(di.data.slice(0)) : new Uint16Array(di.data.slice(0)),
      w, h, raw: di.rawValueToMeters, m: U.uUvT.value.clone(),
    };
    this.depthTime = performance.now();
    const bl = this.session && this.session.renderState.baseLayer;
    if (bl) U.uViewport.value.set(bl.framebufferWidth, bl.framebufferHeight);
    U.uOn.value = 1;
  }

  // Añade la oclusión a los materiales de un objeto
  patchOcclusion(obj) {
    const U = this.occ.uniforms;
    obj.traverse((m) => {
      if (!m.isMesh || !m.material) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        if (mat.userData.occ) continue;
        mat.userData.occ = true;
        const prev = mat.onBeforeCompile;
        mat.onBeforeCompile = (sh, r) => {
          if (prev) prev(sh, r);
          Object.assign(sh.uniforms, U);
          sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\nvarying float vOccZ;')
            .replace('#include <project_vertex>', '#include <project_vertex>\nvOccZ = -mvPosition.z;');
          sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', `#include <common>
varying float vOccZ;
uniform sampler2D uDepthTex; uniform mat4 uUvT; uniform float uRawToM; uniform float uOn; uniform float uFloat; uniform vec2 uViewport;`)
            .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
if (uOn > 0.5) {
  vec2 nv = vec2(gl_FragCoord.x / uViewport.x, 1.0 - gl_FragCoord.y / uViewport.y);
  vec2 duv = (uUvT * vec4(nv, 0.0, 1.0)).xy;
  float realM;
  if (uFloat > 0.5) realM = texture2D(uDepthTex, duv).r * uRawToM;
  else { vec2 p = texture2D(uDepthTex, duv).rg; realM = dot(p, vec2(255.0, 65280.0)) * uRawToM; }
  if (realM > 0.05 && realM < vOccZ - 0.1) discard;
}`);
        };
        const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
        mat.customProgramCacheKey = () => prevKey() + '|occ';
        mat.needsUpdate = true;
      }
    });
  }

  updateOrientation() {
    if (this.mode === 'orient' && this.orient) {
      const o = this.orient;
      const so = ((screen.orientation && screen.orientation.angle) || 0) * DEG;
      this._euler.set((o.beta || 0) * DEG, (o.alpha || 0) * DEG, -(o.gamma || 0) * DEG, 'YXZ');
      this._qt.setFromEuler(this._euler).multiply(q1).multiply(this._q0.setFromAxisAngle(zee, -so));
      this.camera.quaternion.slerp(this._qt, 0.5);
    } else if (this.mode === 'drag') {
      this._euler.set(this.pitch, this.yaw, 0, 'YXZ');
      this.camera.quaternion.setFromEuler(this._euler);
    }
  }

  setupPointer() {
    let sx = 0, sy = 0, lx = 0, ly = 0, down = false, moved = false;
    this.ui.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button,.noxr')) return;
      down = true; moved = false;
      sx = lx = e.clientX; sy = ly = e.clientY;
    });
    this.ui.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      if (Math.hypot(e.clientX - sx, e.clientY - sy) > 25) moved = true;
      if (this.mode === 'drag') {
        this.yaw += dx * 0.006;
        this.pitch = clamp(this.pitch + dy * 0.006, -1.2, 1.2);
      }
    });
    this.ui.addEventListener('pointerup', (e) => {
      if (!down) return;
      down = false;
      if ((moved && this.mode === 'drag') || !this.active) return;
      this.tapAt(e.clientX, e.clientY);
    });
    this.ui.addEventListener('pointercancel', () => { down = false; });
    // En realidad aumentada algunos móviles no mandan "pointer": se escuchan también touch y click
    this.ui.addEventListener('touchend', (e) => {
      this.diagCount('touch');
      if (e.target.closest('button,.noxr') || !this.active) return;
      const t = e.changedTouches && e.changedTouches[0];
      if (t) this.tapAt(t.clientX, t.clientY);
    }, { passive: true });
    this.ui.addEventListener('click', (e) => {
      this.diagCount('click');
      if (e.target.closest('button,.noxr') || !this.active) return;
      this.tapAt(e.clientX, e.clientY);
    });
    this.ui.addEventListener('pointerdown', () => this.diagCount('pointer'), true);
    addEventListener('keydown', (e) => {
      if (this.mode !== 'drag' || !this.active) return;
      if (e.key === 'ArrowLeft') this.yaw += 0.15;
      if (e.key === 'ArrowRight') this.yaw -= 0.15;
      if (e.key === 'ArrowUp') this.pitch = clamp(this.pitch + 0.1, -1.2, 1.2);
      if (e.key === 'ArrowDown') this.pitch = clamp(this.pitch - 0.1, -1.2, 1.2);
    });
  }

  // Toque en RA: se convierte el rayo del dedo en un punto de la pantalla
  onSelect(e) {
    this.diagCount('select');
    const pose = e.frame.getPose(e.inputSource.targetRaySpace, this.refSpace);
    if (!pose) return;
    const m = new THREE.Matrix4().fromArray(pose.transform.matrix);
    const o = new THREE.Vector3().setFromMatrixPosition(m);
    const d = new THREE.Vector3(0, 0, -1).transformDirection(m);
    const s = this.toScreen(o.addScaledVector(d, 2));
    if (s) this.tapAt(s.x, s.y);
  }

  // Punto 3D -> píxeles de pantalla (null si está detrás)
  toScreen(v) {
    const inv = new THREE.Matrix4().copy(this.camera.matrixWorld).invert();
    const c = v.clone().applyMatrix4(inv);
    if (c.z > -0.05) return null;
    const n = c.applyMatrix4(this.camera.projectionMatrix);
    return { x: ((n.x + 1) / 2) * innerWidth, y: ((1 - n.y) / 2) * innerHeight, dist: -v.clone().applyMatrix4(inv).z };
  }

  // Toque en la pantalla: se elige el objeto más cercano al dedo, con margen generoso para niños
  tapAt(x, y) {
    const now = performance.now();
    if (now - this._lastTap < 250) return;
    this._lastTap = now;
    this.ripple(x, y);
    const f = this.camera.projectionMatrix.elements[5];
    let best = null, bestScore = Infinity;
    // Plan B para dedos de niño: si no se acierta, vale cualquier objeto visible a menos de un tercio de pantalla
    let near = null, nearD = Math.hypot(innerWidth, innerHeight) / 3;
    for (const obj of this.tappables) {
      const seg = obj.userData.tapSeg || [obj.userData.center || new THREE.Vector3()];
      const pts = seg.map((p) => this.toScreen(obj.localToWorld(p.clone())));
      if (pts.some((p) => !p)) continue;
      const mid = pts[pts.length > 1 ? 1 : 0];
      const onScreen = pts.some((p) => p.x > 0 && p.x < innerWidth && p.y > 0 && p.y < innerHeight);
      if (onScreen) {
        const dd = Math.min(...pts.map((p) => Math.hypot(x - p.x, y - p.y)), Math.hypot(x - (pts[0].x + mid.x) / 2, y - (pts[0].y + mid.y) / 2));
        if (dd < nearD) { nearD = dd; near = obj; }
      }
      let d;
      if (pts.length === 1) d = Math.hypot(x - pts[0].x, y - pts[0].y);
      else {
        const [a, b] = pts;
        const abx = b.x - a.x, aby = b.y - a.y;
        const t = clamp(((x - a.x) * abx + (y - a.y) * aby) / (abx * abx + aby * aby || 1), 0, 1);
        d = Math.hypot(x - (a.x + abx * t), y - (a.y + aby * t));
      }
      const dist = pts[0].dist;
      const rpx = ((obj.userData.radius || 0.4) * obj.scale.x * f) / dist * (innerHeight / 2);
      const thr = Math.max(rpx * 1.3, 60);
      const score = d / thr;
      if (score < 1 && score < bestScore) { best = obj; bestScore = score; }
    }
    best = best || near;
    this.lastTapInfo = { x: Math.round(x), y: Math.round(y), n: this.tappables.size, hit: !!best, depth: this.depthAt(x, y) };
    if (best && best.userData.onTap) {
      try { best.userData.onTap(best); } catch (e) { this.diagError(e); }
    }
  }

  // ---------- Modo diagnóstico (abrir la web con ?diag=1) ----------
  diagCount(k) { this.diag = this.diag || {}; this.diag[k] = (this.diag[k] || 0) + 1; }
  diagError(e) { this.diagErr = String((e && e.message) || e).slice(0, 80); console.warn(e); }
  diagText() {
    const d = this.diag || {}, t = this.lastTapInfo, f = this.lastFitInfo;
    const center = this.depthAt(innerWidth / 2, innerHeight / 2);
    const cam = this.camPos();
    return [
      `modo ${this.mode} · prof ${this.depthTime && performance.now() - this.depthTime < 1500 ? 'sí' : 'no'} · centro ${center.toFixed(2)} m`,
      `suelo ${this.floorY.toFixed(2)} · cámara y ${cam.y.toFixed(2)} · fijado ${this.floorLocked ? 'sí' : 'no'}`,
      `toques: pointer ${d.pointer || 0} · touch ${d.touch || 0} · click ${d.click || 0} · select ${d.select || 0}`,
      t ? `último toque ${t.x},${t.y} · objetos ${t.n} · acierto ${t.hit ? 'sí' : 'no'} · prof ${t.depth.toFixed(2)} m` : 'sin toques',
      f ? `pared: lecturas ${f.vals} · objeto a ${f.obj.toFixed(2)} m` : '',
      this.diagErr ? `error: ${this.diagErr}` : '',
    ].filter(Boolean).join('\n');
  }

  // Círculo donde se ha tocado (para ver que el toque ha llegado)
  ripple(x, y) {
    const r = document.createElement('div');
    r.className = 'tap-ripple';
    r.style.left = x + 'px';
    r.style.top = y + 'px';
    this.ui.append(r);
    setTimeout(() => r.remove(), 600);
  }

  centerOf(obj) {
    const c = obj.userData.center ? obj.userData.center.clone() : new THREE.Vector3();
    return obj.localToWorld(c);
  }

  camPos() { return this.camera.getWorldPosition(new THREE.Vector3()); }
  camYaw() {
    const d = this.camera.getWorldDirection(new THREE.Vector3());
    return Math.atan2(-d.x, -d.z);
  }
  // Punto en el suelo a cierta distancia, girado "rel" radianes (positivo = izquierda) desde donde se mira
  posAt(rel, dist) {
    const yaw = this.camYaw() + rel, p = this.camPos();
    return new THREE.Vector3(p.x - Math.sin(yaw) * dist, this.floorY, p.z - Math.cos(yaw) * dist);
  }
  angleTo(obj) {
    const d = this.camera.getWorldDirection(new THREE.Vector3());
    return this.centerOf(obj).sub(this.camPos()).normalize().angleTo(d);
  }
  relYaw(obj) {
    const c = this.centerOf(obj), p = this.camPos();
    const oy = Math.atan2(-(c.x - p.x), -(c.z - p.z));
    let r = oy - this.camYaw();
    while (r > Math.PI) r -= 2 * Math.PI;
    while (r < -Math.PI) r += 2 * Math.PI;
    return r;
  }
  flatDist(obj) {
    const p = this.camPos(), o = obj.position;
    return Math.hypot(o.x - p.x, o.z - p.z);
  }
  faceCamera(obj) {
    const p = this.camPos();
    obj.rotation.y = Math.atan2(p.x - obj.position.x, p.z - obj.position.z);
  }

  add(obj, { tap, floor } = {}) {
    obj.userData.dyn = true;
    if (floor) { obj.userData.floor = true; obj.position.y = this.floorY; }
    if (this.occlusion) this.patchOcclusion(obj); // apagado: se toca la pantalla, no hace falta
    this.scene.add(obj);
    if (tap) { obj.userData.onTap = tap; this.tappables.add(obj); }
    if (obj.userData.animate) { const a = obj.userData.animate; obj.userData._upd = (dt) => a(dt); this.updaters.add(obj.userData._upd); }
    return obj;
  }
  remove(obj) {
    this.scene.remove(obj);
    this.tappables.delete(obj);
    if (obj.userData._upd) this.updaters.delete(obj.userData._upd);
  }
  untap(obj) { this.tappables.delete(obj); }
  onUpdate(fn) { this.updaters.add(fn); return () => this.updaters.delete(fn); }
  clear() {
    for (const c of [...this.scene.children]) if (c.userData.dyn) this.scene.remove(c);
    this.tappables.clear();
    this.updaters.clear();
  }

  // En RA: pedir que apunten al suelo hasta encontrarlo (máx. unos segundos)
  async waitFloor(ms = 7000) {
    if (this.mode !== 'xr' || this.floorLocked || this.floorQuiet) return;
    this.setMsg('📱 Apunta la cámara al suelo y muévela despacio hasta que salga un <b style="color:#7dff9a">círculo verde</b>');
    const t0 = Date.now();
    while (this.active && !this.floorLocked && Date.now() - t0 < ms) await sleep(100);
    if (!this.floorLocked) this.lockFloor();
    if (this.active) { this.setMsg('✅ ¡Suelo encontrado!'); await sleep(500); }
  }

  // Aviso corto arriba. Se oculta solo a los 5 s (si se repite el mismo texto no vuelve a salir)
  setMsg(t, ms = 5000) {
    const el = $('#ar-msg');
    if (t && t === this._msg) return;
    this._msg = t || '';
    el.innerHTML = t || '';
    el.hidden = !t;
    clearTimeout(this._msgT);
    if (t && ms) this._msgT = setTimeout(() => { el.hidden = true; }, ms);
  }

  // Espera a que delante haya un sitio despejado (sin árboles ni bancos) usando el sensor de profundidad
  async findClearSpot(minDist = 3, ms = 12000) {
    if (this.mode !== 'xr' || !this.depthCpu) return false;
    const t0 = Date.now();
    let ok = 0;
    while (this.active && Date.now() - t0 < ms) {
      let min = Infinity, valid = 0;
      for (const fx of [0.3, 0.5, 0.7]) for (const fy of [0.38, 0.5]) {
        const d = this.depthAt(innerWidth * fx, innerHeight * fy);
        if (d > 0.3) { valid++; min = Math.min(min, d); }
      }
      ok = valid >= 4 && min > minDist ? ok + 1 : 0;
      if (ok >= 10) return true;
      await sleep(80);
    }
    return false;
  }
  setCount(t) { $('#ar-count').textContent = t || ''; }
  toast(t, ms = 3500) {
    const el = $('#ar-toast');
    el.innerHTML = t;
    el.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => el.classList.remove('show'), ms);
  }
  flash(kind = 'red') {
    const el = $('#ar-flash');
    el.className = '';
    void el.offsetWidth;
    el.className = 'flash-' + kind;
  }
  arrow(rel) {
    const el = $('#ar-arrow');
    if (rel == null || Math.abs(rel) < 0.45) { el.hidden = true; return; }
    el.hidden = false;
    el.className = rel > 0 ? 'left' : 'right';
    el.textContent = rel > 0 ? '⬅️ ¡Por aquí!' : '¡Por aquí! ➡️';
  }
  // Oscuridad con un círculo de luz en el centro; size = radio en % del lado largo de la pantalla
  dark(on, size = 0) {
    const el = $('#ar-dark');
    el.hidden = !on;
    el.style.setProperty('--hole', size ? size + 'vmax' : '-7vmin');
  }
  async torch(on) {
    try {
      if (!this.stream) return;
      const t = this.stream.getVideoTracks()[0];
      const caps = t.getCapabilities ? t.getCapabilities() : {};
      if (caps.torch) await t.applyConstraints({ advanced: [{ torch: on }] });
    } catch { /* sin linterna real */ }
  }

  onExit(fn) { this.exitHandlers.add(fn); return () => this.exitHandlers.delete(fn); }
  requestExit() { for (const f of [...this.exitHandlers]) f(); }

  async close() {
    const wasActive = this.active;
    this.active = false;
    if (this.session) { try { await this.session.end(); } catch { /* ya cerrada */ } }
    this.session = null;
    this.renderer.setAnimationLoop(null);
    if (this.stream) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null; }
    if (this._orientH) removeEventListener('deviceorientation', this._orientH);
    this.video.srcObject = null;
    this.clear();
    this.reticle.visible = false;
    this.occ.uniforms.uOn.value = 0;
    this.depthCpu = null;
    this.depthTime = 0;
    this.exitHandlers.clear();
    this.root.hidden = true;
    this.root.classList.remove('xr', 'nocam', 'drag');
    document.body.classList.remove('ar-open');
    this.dark(false);
    this.arrow(null);
    this.setMsg('');
    this._msg = '';
    this.setCount('');
    this.mode = null;
    return wasActive;
  }
}
