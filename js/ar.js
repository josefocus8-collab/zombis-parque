// Cámara con objetos 3D: WebXR (realidad aumentada con suelo real) o, si no hay,
// cámara trasera de fondo + sensores de orientación. En ordenador: arrastrar para mirar.
import * as THREE from 'three';
import { $, sleep, clamp } from './util.js';

const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
const zee = new THREE.Vector3(0, 0, 1);
const DEG = Math.PI / 180;

export class AR {
  constructor() {
    this.root = $('#ar');
    this.video = $('#ar-video');
    this.canvas = $('#ar-canvas');
    this.ui = $('#ar-ui');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.xr.enabled = true;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.05, 80);
    this.scene.add(new THREE.HemisphereLight(0xe8eeff, 0x3a2a2a, 2.4));
    const d = new THREE.DirectionalLight(0xffffff, 1.5);
    d.position.set(1, 3, 2);
    this.scene.add(d);
    this.raycaster = new THREE.Raycaster();
    this.tappables = new Set();
    this.updaters = new Set();
    this.mode = null;
    this.active = false;
    this.floorY = -1.35;
    this.yaw = 0;
    this.pitch = 0;
    this._euler = new THREE.Euler();
    this._q0 = new THREE.Quaternion();
    this._qt = new THREE.Quaternion();
    this._last = performance.now();
    this.xrSupported = null;
    this.exitHandlers = new Set();
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

  // Abre la cámara. Llamar desde un toque del usuario.
  async open() {
    this.root.hidden = false;
    document.body.classList.add('ar-open');
    this.active = true;
    this._last = performance.now();
    this.setMsg('');
    const ok = this.xrSupported ?? (await this.checkXR());
    if (ok && !this.noXR) {
      try { await this.startXR(); return this.mode; } catch (e) { console.warn('WebXR no disponible, uso la cámara normal', e); }
    }
    await this.startFallback();
    return this.mode;
  }

  async startXR() {
    const session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: this.root },
    });
    this.mode = 'xr';
    this.root.classList.add('xr');
    this.session = session;
    this.renderer.xr.setReferenceSpaceType('local');
    await this.renderer.xr.setSession(session);
    this.refSpace = this.renderer.xr.getReferenceSpace();
    const viewer = await session.requestReferenceSpace('viewer');
    this.hitSource = await session.requestHitTestSource({ space: viewer });
    this.floorY = -1.2;
    this.floorSamples = 0;
    session.addEventListener('select', (e) => this.onSelect(e));
    session.addEventListener('end', () => {
      this.hitSource = null;
      this.session = null;
      if (this.active) this.requestExit();
    });
    this.renderer.setAnimationLoop((t, f) => this.frame(f));
  }

  async startFallback() {
    this.mode = 'orient';
    this.root.classList.remove('xr');
    this.resize();
    this.camera.position.set(0, 0, 0);
    this.camera.quaternion.identity();
    this.floorY = -1.3;
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
      if (f && this.hitSource) {
        const r = f.getHitTestResults(this.hitSource);
        if (r.length) {
          const p = r[0].getPose(this.refSpace);
          if (p) {
            const y = p.transform.position.y, cy = this.camera.position.y;
            if (y < cy - 0.4 && y > cy - 2.4) {
              this.floorY = this.floorSamples ? this.floorY * 0.9 + y * 0.1 : y;
              this.floorSamples++;
            }
          }
        }
      }
    } else this.updateOrientation();
    for (const c of this.scene.children) if (c.userData.floor) c.position.y = this.floorY;
    for (const u of this.updaters) { try { u(dt); } catch (e) { console.warn(e); } }
    this.renderer.render(this.scene, this.camera);
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
      if (Math.hypot(e.clientX - sx, e.clientY - sy) > 12) moved = true;
      if (this.mode === 'drag') {
        this.yaw += dx * 0.006;
        this.pitch = clamp(this.pitch + dy * 0.006, -1.2, 1.2);
      }
    });
    const up = (e) => {
      if (!down) return;
      down = false;
      if (moved || this.mode === 'xr' || !this.active) return;
      const r = this.canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      this.handleRay(this.raycaster.ray.origin.clone(), this.raycaster.ray.direction.clone());
    };
    this.ui.addEventListener('pointerup', up);
    this.ui.addEventListener('pointercancel', () => { down = false; });
    addEventListener('keydown', (e) => {
      if (this.mode !== 'drag' || !this.active) return;
      if (e.key === 'ArrowLeft') this.yaw += 0.15;
      if (e.key === 'ArrowRight') this.yaw -= 0.15;
      if (e.key === 'ArrowUp') this.pitch = clamp(this.pitch + 0.1, -1.2, 1.2);
      if (e.key === 'ArrowDown') this.pitch = clamp(this.pitch - 0.1, -1.2, 1.2);
    });
  }

  onSelect(e) {
    const pose = e.frame.getPose(e.inputSource.targetRaySpace, this.refSpace);
    if (!pose) return;
    const m = new THREE.Matrix4().fromArray(pose.transform.matrix);
    const o = new THREE.Vector3().setFromMatrixPosition(m);
    const d = new THREE.Vector3(0, 0, -1).transformDirection(m);
    this.handleRay(o, d);
  }

  centerOf(obj) {
    const c = obj.userData.center ? obj.userData.center.clone() : new THREE.Vector3();
    return obj.localToWorld(c);
  }

  // Busca el objeto tocable más cercano al rayo (con margen generoso para niños)
  handleRay(o, d) {
    let best = null, bestA = Infinity;
    for (const obj of this.tappables) {
      const v = this.centerOf(obj).sub(o);
      const dist = v.length();
      const ang = v.normalize().angleTo(d);
      const tol = Math.max(Math.atan((obj.userData.radius || 0.5) / dist) * 1.4, 0.15);
      if (ang < tol && ang < bestA) { best = obj; bestA = ang; }
    }
    if (best && best.userData.onTap) best.userData.onTap(best);
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
  // Ángulo entre el centro de la pantalla y el objeto
  angleTo(obj) {
    const d = this.camera.getWorldDirection(new THREE.Vector3());
    return this.centerOf(obj).sub(this.camPos()).normalize().angleTo(d);
  }
  // Giro horizontal necesario para ver el objeto (positivo = a la izquierda)
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
    if (floor) obj.userData.floor = true;
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

  // Esperar a tener suelo (XR) unos segundos
  async waitFloor(ms = 3000) {
    if (this.mode !== 'xr') return;
    this.setMsg('📱 Apunta un momento al suelo…');
    const t0 = Date.now();
    while (this.active && this.floorSamples < 5 && Date.now() - t0 < ms) await sleep(100);
  }

  setMsg(t) { $('#ar-msg').innerHTML = t || ''; $('#ar-msg').hidden = !t; }
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
  // Flecha lateral que indica hacia dónde girar
  arrow(rel) {
    const el = $('#ar-arrow');
    if (rel == null || Math.abs(rel) < 0.45) { el.hidden = true; return; }
    el.hidden = false;
    el.className = rel > 0 ? 'left' : 'right';
    el.textContent = rel > 0 ? '⬅️ ¡Por aquí!' : '¡Por aquí! ➡️';
  }
  dark(on, holeVmin = 0) {
    const el = $('#ar-dark');
    el.hidden = !on;
    el.style.setProperty('--hole', (holeVmin || -7) + 'vmin');
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
    this.exitHandlers.clear();
    this.root.hidden = true;
    this.root.classList.remove('xr', 'nocam', 'drag');
    document.body.classList.remove('ar-open');
    this.dark(false);
    this.arrow(null);
    this.setMsg('');
    this.setCount('');
    this.mode = null;
    return wasActive;
  }
}
