// Las pruebas del juego
import * as THREE from 'three';
import { $, $$, h, rand, randInt, pick, shuffle, sleep, vibrate, onShake, waitClick, abortError } from './util.js';
import { makeZombie, makeBackpack, makeHandprint, makeGlowRing, preloadZombies } from './models.js';

const F = (fear, a, b, c) => (fear >= 3 ? c : fear >= 2 ? b : a);
const biteMs = (fear) => (fear >= 3 ? 20000 : fear >= 2 ? 10000 : 0);

// ---------- Pruebas con cámara ----------
async function arChallenge(el, ctx, info, run) {
  const models = preloadZombies(ctx.fear); // se descargan mientras leen la tarjeta
  for (;;) {
    // Toda la tarjeta es el botón: un solo toque en cualquier parte abre la cámara
    // (el navegador no deja abrirla sin que el usuario toque la pantalla)
    el.innerHTML = `
      <div class="panel challenge tap-cam" id="open-cam" role="button" tabindex="0">
        <div class="ch-icon">${info.icon}</div>
        <h2>${info.title}</h2>
        <p class="big">${info.text}</p>
        <div class="cam-big">📷</div>
        <p class="big"><b>¡Toca aquí para abrir la cámara!</b></p>
      </div>
      <p class="muted center">Si el móvil pide permiso para la cámara o la realidad aumentada, pulsa «Permitir».</p>`;
    vibrate([150, 80, 150]);
    await waitClick($('#open-cam', el), ctx.signal);
    ctx.audio.unlock();
    const cl = [];
    let result = 'exit';
    try {
      $('#open-cam', el).style.pointerEvents = 'none';
      await ctx.ar.open();
      ctx.ar.setMsg('⏳ Despertando a los zombis…');
      await Promise.race([models, sleep(8000)]);
      ctx.ar.setMsg('');
      result = await new Promise((res, rej) => {
        cl.push(ctx.ar.onExit(() => rej(new Error('exit'))));
        const ab = () => rej(abortError());
        ctx.signal.addEventListener('abort', ab);
        cl.push(() => ctx.signal.removeEventListener('abort', ab));
        run(ctx, cl).then(res, rej);
      });
    } catch (e) {
      result = e.name === 'AbortError' ? 'abort' : 'exit';
      if (e.message !== 'exit' && e.name !== 'AbortError') console.warn(e);
    } finally {
      cl.forEach((f) => { try { f(); } catch { /* nada */ } });
      ctx.audio.heartbeat(0);
      ctx.audio.drone(0.35);
      await ctx.ar.close();
    }
    if (result === 'done') return;
    if (ctx.signal.aborted) throw abortError();
  }
}

function anchorAt(ar, rel, dist) {
  const g = new THREE.Group();
  g.position.copy(ar.posAt(rel, dist));
  return g;
}

// 1. Buscar la mochila con la cámara
export async function find(el, ctx) {
  const { fear } = ctx;
  let arrowUntil = 0;
  ctx.setHints([
    'Gira despacio sobre ti mismo con el móvil delante. ¡Mira también detrás de ti!',
    { text: 'Sigue la flecha que sale en la pantalla.', action: () => { arrowUntil = Date.now() + 15000; } },
    'Cuando veas la mochila, tócala en la pantalla.',
  ]);
  await arChallenge(el, ctx, {
    icon: '🎒',
    title: 'La mochila del Doctor',
    text: F(fear, 'La mochila está en el suelo, muy cerca. Abre la cámara, gira despacio y tócala cuando la veas.',
      'La mochila está tirada en el suelo, cerca. Abre la cámara y búscala… con cuidado.',
      'La mochila está en el suelo, cerca. Hay huellas de manos ensangrentadas alrededor. Abre la cámara… y no te asustes.'),
  }, async ({ ar, audio }, cl) => {
    await ar.waitFloor();
    ar.setMsg('🔎 Busca la mochila en el suelo… ¡gira a tu alrededor!');
    audio.drone(0.55);
    const anchor = anchorAt(ar, (Math.random() < 0.5 ? 1 : -1) * rand(1.7, 2.8), rand(1.5, 2.1));
    const bag = makeBackpack(fear);
    bag.scale.setScalar(1.7);
    anchor.add(bag);
    const ring = makeGlowRing();
    ring.scale.setScalar(1.5);
    anchor.add(ring);
    if (fear >= 2) for (let i = 0; i < (fear >= 3 ? 7 : 3); i++) {
      const hp = makeHandprint();
      hp.position.set(rand(-1, 1), 0.015, rand(-1, 1));
      anchor.add(hp);
    }
    anchor.userData.center = new THREE.Vector3(0, 0.4, 0);
    anchor.userData.radius = 0.7;
    ar.faceCamera(anchor);
    let zombie = null, seen = false, nextGrowl = 0;
    return new Promise((res) => {
      ar.add(anchor, {
        floor: true,
        tap: () => {
          if (zombie && !zombie.userData.asleep) { ar.toast('¡Primero duerme al zombi! <b>Tócalo</b>.'); audio.growl(0.5); return; }
          ar.untap(anchor);
          anchor.visible = false;
          audio.chime();
          vibrate(200);
          ar.flash('gold');
          ar.setMsg('🎒 ¡Tienes la mochila!');
          setTimeout(() => res('done'), 1600);
        },
      });
      cl.push(ar.onUpdate((dt) => {
        ring.userData.animate(dt);
        ar.arrow(Date.now() < arrowUntil && anchor.visible ? ar.relYaw(anchor) : null);
        if (!seen && ar.angleTo(anchor) < 0.35) {
          seen = true;
          ar.setMsg('¡Ahí está! ¡Tócala!');
          if (fear >= 2) {
            zombie = makeZombie(fear);
            const side = new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)).normalize().multiplyScalar(0.9);
            zombie.position.copy(anchor.position).add(side);
            ar.add(zombie, {
              floor: true,
              tap: (z) => {
                z.userData.sleep();
                ar.untap(z);
                audio.growl(0.35, 0, 0.8);
                vibrate(120);
                ar.setMsg('💤 ¡Dormido! Ahora, ¡coge la mochila!');
              },
            });
            if (zombie.userData.special) zombie.userData.special(Math.random() < 0.5 ? 'rise' : 'scream');
            audio.scream(fear >= 3 ? 0.9 : 0.6);
            vibrate([250, 80, 350]);
            ar.flash('red');
            ar.setMsg('😱 ¡UN ZOMBI! ¡Tócalo para lanzarle polvo de dormir!');
          }
        }
        if (zombie && !zombie.userData.asleep) {
          ar.faceCamera(zombie);
          const d = ar.flatDist(zombie);
          const busy = zombie.userData.st.busyUntil > zombie.userData.st.t;
          zombie.userData.st.walk = d > 1.4 ? 1 : 0;
          if (d > 1.4 && !busy) {
            const p = ar.camPos();
            const dir = new THREE.Vector3(p.x - zombie.position.x, 0, p.z - zombie.position.z).normalize();
            zombie.position.addScaledVector(dir, dt * 0.9);
          }
          if (performance.now() > nextGrowl) { nextGrowl = performance.now() + rand(1800, 3200); audio.growl(0.6, -Math.sin(ar.relYaw(zombie))); }
        }
      }));
    });
  });
}

// 2. Linterna: agitar para encender y alumbrar zombis en la oscuridad
export async function flashlight(el, ctx) {
  const { fear } = ctx;
  let arrowUntil = 0;
  ctx.setHints([
    'Agita el móvil con fuerza, como un bote de ketchup. Si no funciona, espera y saldrá un botón.',
    'Mueve la luz despacio a tu alrededor. Los zombis se esconden en la oscuridad, ¡también detrás de ti!',
    { text: 'Sigue la flecha hacia el zombi más cercano.', action: () => { arrowUntil = Date.now() + 15000; } },
  ]);
  await arChallenge(el, ctx, {
    icon: '🔦',
    title: 'La oscuridad',
    text: F(fear, 'Cuando abras la cámara se hará de noche. Agita el móvil para encender la linterna y alumbra a los zombis hasta que se duerman.',
      'Cuando abras la cámara todo se volverá negro. Agita el móvil para encender la linterna. Hay zombis escondidos: ¡alúmbralos hasta que caigan!',
      'Al abrir la cámara se apagará el sol. Oirás respiraciones. Agita el móvil para encender la linterna y alumbra a cada zombi hasta que caiga. No dejes que se acerquen…'),
  }, async ({ ar, audio }, cl) => {
    await ar.waitFloor(2000);
    ar.dark(true, 0);
    ar.setMsg('🌑 ¡Se ha apagado el sol! <b>Agita el móvil</b> para encender la linterna.');
    audio.drone(0.75);
    audio.heartbeat(85);
    audio.whisper();
    let on = false;
    const zombies = [];
    const n = F(fear, 1, 2, 3);
    const btn = $('#ar-action');
    const spawn = () => {
      const base = rand(0.9, 2.6) * (Math.random() < 0.5 ? 1 : -1);
      for (let i = 0; i < n; i++) {
        const z = makeZombie(fear);
        z.position.copy(ar.posAt(base + (i * 2 * Math.PI) / Math.max(n, 2) + rand(-0.3, 0.3), rand(2.0, 2.8)));
        z.userData.lit = 0;
        ar.add(z, { floor: true });
        ar.faceCamera(z);
        zombies.push(z);
      }
    };
    const turnOn = () => {
      if (on) return;
      on = true;
      btn.hidden = true;
      ar.dark(true, 30);
      ar.torch(true);
      audio.click();
      vibrate(80);
      ar.setMsg(`🔦 ¡Linterna encendida! Busca ${n === 1 ? 'al zombi' : `a los ${n} zombis`} y alúmbralos.`);
      spawn();
    };
    cl.push(onShake(turnOn));
    const tBtn = setTimeout(() => {
      if (on) return;
      btn.hidden = false;
      btn.textContent = '🔦 Encender linterna';
      btn.onclick = turnOn;
    }, 7000);
    cl.push(() => { clearTimeout(tBtn); btn.hidden = true; btn.onclick = null; ar.torch(false); });
    let flickerAt = performance.now() + rand(9000, 15000), flickerEnd = 0, nextGrowl = 0, done = false;
    return new Promise((res) => {
      cl.push(ar.onUpdate((dt) => {
        if (!on || done) return;
        const now = performance.now();
        if (fear >= 3 && now > flickerAt) { flickerEnd = now + 450; flickerAt = now + rand(9000, 16000); audio.whisper(); }
        const flicker = now < flickerEnd;
        ar.dark(true, flicker ? (Math.random() < 0.5 ? 0 : 12) : 30);
        let awake = 0, nearest = null, nd = Infinity;
        for (const z of zombies) {
          if (z.userData.asleep) continue;
          awake++;
          ar.faceCamera(z);
          const a = ar.angleTo(z);
          if (a < nd) { nd = a; nearest = z; }
          if (a < 0.24 && !flicker) {
            if (z.userData.lit === 0) { audio.growl(0.7, -Math.sin(ar.relYaw(z))); vibrate(60); if (z.userData.special) z.userData.special('scream'); }
            z.userData.lit += dt;
            z.userData.st.lunge = Math.min(1, z.userData.lit);
            if (z.userData.lit > 1.1) {
              z.userData.sleep();
              if (fear >= 2) audio.scream(0.5); else audio.growl(0.4);
              vibrate([100, 50, 100]);
              awake--;
            }
          } else z.userData.lit = Math.max(0, z.userData.lit - dt * 0.5);
        }
        ar.setCount(`💤 ${n - awake} / ${n}`);
        ar.arrow(Date.now() < arrowUntil && nearest ? ar.relYaw(nearest) : null);
        if (now > nextGrowl && awake) { nextGrowl = now + rand(2500, 4500); if (nearest) audio.growl(0.45, -Math.sin(ar.relYaw(nearest))); }
        if (awake === 0) {
          done = true;
          ar.dark(false);
          ar.torch(false);
          ar.arrow(null);
          audio.heartbeat(0);
          audio.chime();
          ar.flash('gold');
          ar.setMsg('☀️ ¡Todos dormidos! Vuelve la luz…');
          setTimeout(() => res('done'), 2000);
        }
      }));
    });
  });
}

// 5. La horda: tocar zombis que se acercan
export async function horde(el, ctx) {
  const { fear } = ctx;
  const target = ctx.players > 1 ? Math.min(20, 4 * ctx.players) : 6;
  const myGoal = 6;
  ctx.setHints([
    'Gira sobre ti mismo: vienen de todas partes. La flecha te dice dónde está el más cercano.',
    'Toca a cada zombi en la pantalla antes de que llegue hasta ti.',
    'Si sois varios, poneos espalda con espalda: así cada uno vigila un lado.',
  ]);
  await arChallenge(el, ctx, {
    icon: '🧟',
    title: '¡La horda!',
    text: F(fear, `Vienen muchos zombis lentos. Gira y tócalos para lanzarles polvo de dormir. ${ctx.players > 1 ? `Entre todo el equipo hay que dormir ${target}.` : `Duerme a ${myGoal}.`}`,
      `¡Una horda viene hacia vosotros! Gira y toca a cada zombi antes de que te muerda. ${ctx.players > 1 ? `Entre todo el equipo: ${target} zombis.` : `Duerme a ${myGoal}.`}`,
      `¡LA HORDA! Vienen arrastrándose, con la boca abierta. Si uno te alcanza, te muerde y perdéis tiempo. ${ctx.players > 1 ? `Entre todo el equipo: ${target} zombis.` : `Duerme a ${myGoal}.`}`),
  }, async ({ ar, audio }, cl) => {
    await ar.waitFloor(2000);
    ar.setMsg('🧟 ¡Toca a los zombis antes de que lleguen!');
    audio.drone(0.9);
    let mine = 0, alive = [], spawned = 0, nextSpawn = 0, done = false;
    const speed = F(fear, [0.35, 0.5], [0.45, 0.65], [0.55, 0.85]);
    const interval = F(fear, 2800, 2200, 1700);
    const spawn = () => {
      const z = makeZombie(fear);
      const rel = spawned < 2 ? rand(-0.5, 0.5) : rand(-Math.PI, Math.PI);
      z.position.copy(ar.posAt(rel, rand(4, 5)));
      z.userData.speed = rand(...speed);
      z.userData.nextGrowl = performance.now() + rand(500, 2500);
      z.userData.st.walk = 1;
      ar.add(z, {
        floor: true,
        tap: (zz) => {
          if (zz.userData.asleep || done) return;
          zz.userData.sleep();
          ar.untap(zz);
          mine++;
          ctx.hordeAdd(mine);
          audio.growl(0.3, 0, 0.6);
          audio.sparkle();
          vibrate(60);
          setTimeout(() => { ar.remove(zz); alive = alive.filter((x) => x !== zz); }, 2500);
        },
      });
      ar.faceCamera(z);
      alive.push(z);
      spawned++;
    };
    return new Promise((res) => {
      cl.push(ar.onUpdate((dt) => {
        if (done) return;
        const now = performance.now();
        const awake = alive.filter((z) => !z.userData.asleep);
        if (now > nextSpawn && awake.length < 4) { spawn(); nextSpawn = now + interval; }
        let nearest = null, nd = Infinity;
        const p = ar.camPos();
        for (const z of awake) {
          ar.faceCamera(z);
          const d = ar.flatDist(z);
          if (d < nd) { nd = d; nearest = z; }
          const dir = new THREE.Vector3(p.x - z.position.x, 0, p.z - z.position.z).normalize();
          z.position.addScaledVector(dir, dt * z.userData.speed);
          z.userData.st.lunge = d < 2 ? 1 : 0;
          if (now > z.userData.nextGrowl) { z.userData.nextGrowl = now + rand(2000, 4000); audio.growl(Math.min(0.9, 1.6 / d), -Math.sin(ar.relYaw(z))); }
          if (d < 0.9) {
            // ¡mordisco!
            ar.remove(z);
            alive = alive.filter((x) => x !== z);
            audio.bite();
            vibrate([400, 100, 200]);
            ar.flash('bite');
            const ms = biteMs(fear);
            if (ms) { ctx.penalty(ms); ar.toast(`🩸 ¡Te ha mordido! Perdéis ${ms / 1000} segundos.`); } else ar.toast('¡Uy! Te ha alcanzado. ¡Sigue!');
          }
        }
        audio.heartbeat(nd < 2 ? 140 : nd < 4 ? 105 : 75);
        ar.arrow(nearest && ar.angleTo(nearest) > 0.5 ? ar.relYaw(nearest) : null);
        const team = ctx.hordeTeam();
        ar.setCount(ctx.players > 1 ? `💤 Tú: ${mine} · Equipo: ${team}/${target}` : `💤 ${mine}/${myGoal}`);
        if (mine >= myGoal || (ctx.players > 1 && team >= target)) {
          done = true;
          for (const z of alive) z.userData.sleep();
          ar.arrow(null);
          audio.heartbeat(0);
          audio.chime();
          ar.flash('gold');
          ar.setMsg('💤 ¡Toda la horda duerme!');
          setTimeout(() => res('done'), 2200);
        }
      }));
    });
  });
}

// ---------- Pruebas en pantalla ----------
function keypad(el, onSubmit, maxLen = 3) {
  let val = '';
  el.innerHTML = `<div class="kp-display">&nbsp;</div><div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '⌫', 0, '✔'].map((k) => `<button data-k="${k}" class="${k === '✔' ? 'green' : ''}">${k}</button>`).join('')}</div>`;
  const disp = $('.kp-display', el);
  const show = () => { disp.innerHTML = val || '&nbsp;'; };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]');
    if (!b) return;
    const k = b.dataset.k;
    if (k === '⌫') val = val.slice(0, -1);
    else if (k === '✔') { if (val) onSubmit(val); return; }
    else if (val.length < maxLen) val += k;
    show();
  });
  return { clear() { val = ''; show(); }, shake() { disp.classList.remove('shake'); void disp.offsetWidth; disp.classList.add('shake'); } };
}

function waitDone(ctx, setup) {
  return new Promise((res, rej) => {
    if (ctx.signal.aborted) return rej(abortError());
    ctx.signal.addEventListener('abort', () => rej(abortError()), { once: true });
    setup(res);
  });
}

function mathChallenge(el, ctx, { icon, title, text, problems, opSign }) {
  let i = 0;
  ctx.setHints([
    'Puedes contar con los dedos o pedir ayuda a un compañero. ¡En equipo es más fácil!',
    opSign === '+' ? 'Con números grandes: suma primero las decenas y luego las unidades.' : 'Multiplicar es sumar varias veces: 4 × 3 es 4 + 4 + 4.',
    { text: () => { const [a, b] = problems[Math.min(i, problems.length - 1)]; const r = opSign === '+' ? a + b : a * b; return `La respuesta de «${a} ${opSign} ${b}» está entre ${Math.max(0, r - 3)} y ${r + 3}.`; } },
  ]);
  el.innerHTML = `
    <div class="panel challenge">
      <div class="ch-icon">${icon}</div><h2>${title}</h2><p>${text}</p>
      <div class="locks">${problems.map(() => '<span class="lock">🔒</span>').join('')}</div>
      <div class="problem"></div>
    </div>
    <div class="kp"></div>`;
  const prob = $('.problem', el);
  const showP = () => { const [a, b] = problems[i]; prob.textContent = `${a} ${opSign} ${b} = ?`; };
  showP();
  return waitDone(ctx, (res) => {
    const kp = keypad($('.kp', el), (v) => {
      const [a, b] = problems[i];
      const r = opSign === '+' ? a + b : a * b;
      if (Number(v) === r) {
        ctx.audio.chime();
        vibrate(80);
        $$('.lock', el)[i].textContent = '🔓';
        i++;
        kp.clear();
        if (i >= problems.length) { prob.textContent = '¡Abierto!'; setTimeout(() => res(), 1200); } else showP();
      } else {
        ctx.audio.wrong();
        vibrate([80, 60, 80]);
        kp.shake();
        kp.clear();
        if (ctx.fear >= 2 && Math.random() < 0.6) { ctx.audio.growl(0.5, rand(-1, 1)); ctx.toast(pick(['¡Shhh! Un zombi te ha oído…', 'Algo gruñe detrás de ti…', '¡Prueba otra vez, rápido!'])); }
      }
    });
  });
}

export function sums(el, ctx) {
  const problems = [[randInt(3, 9), randInt(3, 9)], [randInt(12, 39), randInt(3, 9)]];
  return mathChallenge(el, ctx, {
    icon: '🧰', title: 'El cofre cerrado', opSign: '+', problems,
    text: F(ctx.fear, 'El cofre tiene 2 candados. Resuelve las sumas para abrirlos.',
      'El cofre tiene arañazos por todas partes. Tiene 2 candados: resuelve las sumas para abrirlos.',
      'El cofre está lleno de arañazos y huellas de manos rojas. Tiene 2 candados: resuelve las sumas, rápido.'),
  });
}

export function mult(el, ctx) {
  const tables = [2, 3, 4, 5, 10];
  const problems = [[pick(tables), randInt(2, 9)], [pick(tables), randInt(2, 9)]];
  return mathChallenge(el, ctx, {
    icon: '🦉', title: 'El nido de los búhos', opSign: '×', problems,
    text: 'La puerta del nido tiene un candado de multiplicaciones. ¡Ábrelo!',
  });
}

export function words(el, ctx) {
  const list = F(ctx.fear, ['NIEBLA', 'LUNA', 'BUHO', 'ZOMBI'], ['ZOMBI', 'NIEBLA', 'MIEDO', 'GRITO'], ['SANGRE', 'ZOMBI', 'GRITO', 'MIEDO']);
  const word = pick(list);
  let letters;
  do { letters = shuffle(word.split('')); } while (letters.join('') === word);
  ctx.setHints([
    'Es una palabra de nuestra historia.',
    `Empieza por la letra «${word[0]}».`,
    `Empieza por «${word.slice(0, 2)}» y tiene ${word.length} letras.`,
  ]);
  el.innerHTML = `
    <div class="panel challenge">
      <div class="ch-icon">🔤</div><h2>La palabra secreta</h2>
      <p>${F(ctx.fear, 'Las letras se han mezclado. Tócalas en orden para formar la palabra secreta.', 'Alguien ha escrito unas letras en el árbol. Ordénalas para descubrir la palabra secreta.', 'Hay letras escritas con sangre en el tronco del árbol. Ordénalas para descubrir la palabra secreta.')}</p>
      <div class="slots">${word.split('').map(() => '<span class="slot"></span>').join('')}</div>
      <div class="tiles">${letters.map((l, i) => `<button class="tile" data-i="${i}">${l}</button>`).join('')}</div>
    </div>
    <button class="small" id="w-clear">↩️ Borrar</button>`;
  let ans = [];
  const slots = $$('.slot', el), tiles = $$('.tile', el);
  const reset = () => { ans = []; slots.forEach((s) => { s.textContent = ''; }); tiles.forEach((t) => { t.disabled = false; }); };
  return waitDone(ctx, (res) => {
    $('#w-clear', el).onclick = reset;
    tiles.forEach((t) => {
      t.onclick = () => {
        ctx.audio.click();
        t.disabled = true;
        ans.push(t.textContent);
        slots[ans.length - 1].textContent = t.textContent;
        if (ans.length === word.length) {
          if (ans.join('') === word) {
            ctx.audio.chime();
            $('.slots', el).classList.add('ok');
            setTimeout(() => res(), 1300);
          } else {
            ctx.audio.wrong();
            vibrate([80, 60, 80]);
            $('.slots', el).classList.add('shake');
            setTimeout(() => { $('.slots', el).classList.remove('shake'); reset(); }, 600);
          }
        }
      };
    });
  });
}

// 4a. Frotar para limpiar el moho
export function rub(el, ctx) {
  const { fear } = ctx;
  ctx.setHints(['Frota con el dedo por toda la imagen, como limpiando un cristal sucio.', 'No te olvides de las esquinas y los bordes.']);
  el.innerHTML = `
    <div class="panel challenge">
      <h2>🧪 El frasco sucio</h2>
      <p>${F(fear, 'El frasco está cubierto de moho. ¡Frota la pantalla para limpiarlo!', 'El frasco está cubierto de moho y barro. ¡Frota para limpiarlo!', 'El frasco está cubierto de moho y sangre seca. ¡Frota fuerte para limpiarlo!')}</p>
      <div class="rub-wrap"><div class="rub-under">🧪<span>Agua de luna</span></div><canvas class="rub"></canvas></div>
      <div class="bar"><div></div></div>
    </div>`;
  const wrap = $('.rub-wrap', el), cv = $('canvas', el);
  const size = Math.min(wrap.clientWidth || 300, 360);
  cv.width = size;
  cv.height = size;
  const g = cv.getContext('2d');
  g.fillStyle = '#3d4a2c';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = pick(['#56663a', '#2f3a22', '#6b7a45', '#4a5532', '#7c8a50']);
    g.beginPath();
    g.arc(rand(0, size), rand(0, size), rand(4, 18), 0, 7);
    g.fill();
  }
  if (fear >= 2) {
    for (let i = 0; i < (fear >= 3 ? 12 : 5); i++) {
      g.fillStyle = pick(['#5c0a10', '#7a0b14', '#3a0306']);
      g.beginPath();
      g.arc(rand(0, size), rand(0, size), rand(8, 26), 0, 7);
      g.fill();
    }
  }
  if (fear >= 3) {
    g.fillStyle = '#8a0c16';
    g.font = `bold ${size / 6}px sans-serif`;
    g.textAlign = 'center';
    g.fillText('AYUDA', size / 2, size / 2);
    for (let i = 0; i < 5; i++) g.fillRect(size * 0.25 + i * size * 0.12, size / 2 + 4, 4, rand(15, 50));
  }
  g.globalCompositeOperation = 'destination-out';
  let last = null, lastSound = 0;
  const pt = (e) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * size, y: ((e.clientY - r.top) / r.height) * size }; };
  const draw = (p) => {
    g.lineWidth = size / 6;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo((last || p).x, (last || p).y);
    g.lineTo(p.x, p.y);
    g.stroke();
    last = p;
    if (performance.now() - lastSound > 120) { lastSound = performance.now(); ctx.audio.tone(rand(200, 400), 0.05, 'triangle', 0.05); }
  };
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); last = null; draw(pt(e)); });
  cv.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') { if (last || e.buttons) draw(pt(e)); } });
  cv.addEventListener('pointerup', () => { last = null; });
  return waitDone(ctx, (res) => {
    const iv = setInterval(() => {
      const d = g.getImageData(0, 0, size, size).data;
      let clear = 0, tot = 0;
      for (let y = 4; y < size; y += 12) for (let x = 4; x < size; x += 12) { tot++; if (d[(y * size + x) * 4 + 3] < 40) clear++; }
      const f = clear / tot;
      $('.bar div', el).style.width = Math.min(100, (f / 0.85) * 100) + '%';
      if (f > 0.85) {
        clearInterval(iv);
        g.clearRect(0, 0, size, size);
        ctx.audio.chime();
        $('.rub-under', el).classList.add('glow');
        setTimeout(() => res(), 1300);
      }
    }, 350);
    ctx.signal.addEventListener('abort', () => clearInterval(iv));
  });
}

// 4b. Unir cables del mismo color
export function wires(el, ctx) {
  const cols = [['rojo', '#e53935'], ['azul', '#1e88e5'], ['amarillo', '#fdd835'], ['verde', '#43a047']];
  const right = shuffle(cols.map((c, i) => i));
  ctx.setHints(['Toca un cable de la izquierda y después el del mismo color a la derecha.', 'Si sale un chispazo, es que los colores no coinciden. ¡Prueba otro!']);
  el.innerHTML = `
    <div class="panel challenge">
      <h2>⚙️ La máquina rota</h2>
      <p>${F(ctx.fear, 'Une cada cable con el de su mismo color para arreglar la máquina del Doctor.', 'Los zombis han arrancado los cables. Une cada uno con el de su color.', 'Los zombis han arrancado los cables a mordiscos. Une cada uno con el de su color… rápido.')}</p>
      <div class="wires">
        <svg class="wire-svg"></svg>
        <div class="wcol left">${cols.map((c, i) => `<button class="wnode" data-side="L" data-i="${i}" style="--c:${c[1]}"></button>`).join('')}</div>
        <div class="wcol right">${right.map((i) => `<button class="wnode" data-side="R" data-i="${i}" style="--c:${cols[i][1]}"></button>`).join('')}</div>
      </div>
    </div>`;
  const svg = $('.wire-svg', el), box = $('.wires', el);
  let sel = null, done = 0;
  const center = (b) => { const r = b.getBoundingClientRect(), br = box.getBoundingClientRect(); return [r.left - br.left + r.width / 2, r.top - br.top + r.height / 2]; };
  const line = (a, b, c) => {
    const [x1, y1] = center(a), [x2, y2] = center(b);
    svg.insertAdjacentHTML('beforeend', `<path d="M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}" stroke="${c}" stroke-width="10" fill="none" stroke-linecap="round"/>`);
  };
  return waitDone(ctx, (res) => {
    $$('.wnode', el).forEach((b) => {
      b.onclick = () => {
        if (b.classList.contains('done')) return;
        if (b.dataset.side === 'L') {
          $$('.wnode.sel', el).forEach((x) => x.classList.remove('sel'));
          sel = b;
          b.classList.add('sel');
          ctx.audio.click();
          return;
        }
        if (!sel) { ctx.toast('Primero toca un cable de la izquierda.'); return; }
        if (sel.dataset.i === b.dataset.i) {
          line(sel, b, cols[b.dataset.i][1]);
          sel.classList.remove('sel');
          sel.classList.add('done');
          b.classList.add('done');
          sel = null;
          done++;
          ctx.audio.sparkle();
          vibrate(50);
          if (done === 4) { ctx.audio.chime(); setTimeout(() => res(), 1200); }
        } else {
          ctx.audio.wrong();
          vibrate([60, 40, 60]);
          b.classList.add('spark');
          setTimeout(() => b.classList.remove('spark'), 500);
          if (ctx.fear >= 2) ctx.toast('⚡ ¡Chispazo! Ese no es.');
        }
      };
    });
  });
}

// Cara de zombi para los sustos (dibujo SVG)
export function scareFaceSVG(fear) {
  const blood = fear >= 2 ? `
    <path d="M60 175 q5 40 0 70 q-6 -30 -8 -70z M140 178 q4 30 0 55 q-5 -25 -6 -55z M95 182 q3 50 -1 85 q-6 -40 -5 -85z" fill="#9e0f1a"/>
    ${fear >= 3 ? '<circle cx="150" cy="60" r="14" fill="#7a0a12"/><path d="M40 70 l25 -5 l-20 25z" fill="#5c0a10"/><path d="M150 74 q4 30 0 50 q-5 -22 -4 -50z" fill="#9e0f1a"/>' : ''}` : '';
  return `<svg viewBox="0 0 200 280" class="scare-face" aria-hidden="true">
    <ellipse cx="100" cy="120" rx="80" ry="105" fill="#7d8c6a"/>
    <ellipse cx="65" cy="100" rx="24" ry="20" fill="#1b1b1b"/><ellipse cx="135" cy="100" rx="24" ry="20" fill="#1b1b1b"/>
    <circle cx="65" cy="102" r="7" fill="#fffbe6"/><circle cx="135" cy="102" r="7" fill="#fffbe6"/>
    <path d="M45 165 q55 -30 110 0 q-10 40 -55 42 q-45 -2 -55 -42z" fill="#1a0507"/>
    <path d="M55 162 l8 15 l8 -17 l8 17 l8 -18 l8 18 l8 -18 l8 17 l8 -17 l8 15 l8 -12z" fill="#e8e0c0"/>
    <path d="M30 60 l35 15 M38 55 l2 12 M48 60 l2 12 M58 65 l2 12" stroke="#3a2a2a" stroke-width="3"/>
    ${blood}
  </svg>`;
}
