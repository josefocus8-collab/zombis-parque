// Historia y textos del juego. fear: 1 suave, 2 miedo, 3 terror
// Partida de unos 20 minutos con 4 puntos:
//  1. Radar (con punto de dirección) → cofre con un zombi al lado → ingrediente 1
//  2. Huellas de sangre en el suelo (cámara) → 5 murciélagos → ingrediente 2
//  3. Brújula → el Doctor Moho, herido, da el ingrediente 3
//  4. Radar (sin punto) con 5 zombis por el camino → mesa de laboratorio: mezclar los ingredientes
const F = (fear, suave, miedo, terror) => (fear >= 3 ? terror : fear >= 2 ? miedo : suave);

export const N_ING = 3; // ingredientes
export const FINAL = 4; // el último punto es el laboratorio

export const FEAR_NAMES = { 1: 'Suave', 2: 'Miedo', 3: 'Terror' };

// nav: cómo se llega. 'none' = la propia prueba guía con la cámara (huellas o radar con zombis)
export const STATIONS = {
  1: { nav: 'radar', ch: ['chest'], ing: { icon: '🍄', name: 'Seta mágica' } },
  2: { nav: 'none', ch: ['bats'], ing: { icon: '🦇', name: 'Colmillo de murciélago' } },
  3: { nav: 'compass', ch: ['doctor'], ing: { icon: '🧪', name: 'Agua de luna' } },
  4: { nav: 'none', ch: ['lab'] },
};

export const ROLES = ['Capitán', 'Exploradora', 'Vigía', 'Científica', 'Linterna', 'Rastreador', 'Médica', 'Guardián', 'Mensajera', 'Cazaniebla'];

const ANIMALS = ['Lobo', 'Búho', 'Zorro', 'Lince', 'Halcón', 'Tejón', 'Cuervo', 'Puma', 'Oso', 'Gato', 'Murciélago', 'Jabalí'];
const ADJ = ['Rojo', 'Gris', 'Veloz', 'Valiente', 'Sombra', 'Negro', 'Feroz', 'Silencioso', 'Azul', 'Dorado'];
export const randomNick = () => ANIMALS[Math.floor(Math.random() * ANIMALS.length)] + ' ' + ADJ[Math.floor(Math.random() * ADJ.length)];

export function introText(fear) {
  return F(fear,
    '…ksshh… Soy el Doctor Moho. Una niebla gris convierte a la gente en zombis. Para el antídoto necesito 3 ingredientes y mezclarlos en mi laboratorio. Tenéis 20 minutos. El primero está en un cofre. ¡Seguid el radar!',
    '…ksshh… Soy el Doctor Moho. Una niebla roja convierte a la gente en zombis con heridas abiertas. Necesito 3 ingredientes para el antídoto. Tenéis 20 minutos. El primero está en un cofre. ¡Seguid el radar!',
    '…ksshh… Soy el Doctor Moho. La niebla roja se ha escapado. He visto zombis morder… hay sangre por todas partes. Necesito 3 ingredientes para el antídoto. Tenéis 20 minutos. El primero está en un cofre. Seguid el radar… y no hagáis ruido.');
}

export function lateText(fear, got, mins) {
  return `Te unes a la Patrulla Antídoto. Tu equipo tiene ${got} de ${N_ING} ingredientes y quedan ${mins} minutos. ${F(fear, '¡Ayúdales!', '¡Corre, hay zombis cerca!', '¡Corre! Hay huellas de sangre por todas partes…')}`;
}

// Mensaje del Doctor al salir hacia cada punto
export function stationText(s, fear) {
  switch (s) {
    case 1: return introText(fear);
    case 2: return F(fear,
      'Mirad el suelo con la cámara: hay huellas rojas. Seguidlas hasta el segundo ingrediente. Cuidado con los murciélagos.',
      'En el suelo hay huellas de sangre… Seguidlas con la cámara hasta el segundo ingrediente. Y cuidado: allí viven murciélagos.',
      'Huellas de sangre… alguien ha pasado por ahí arrastrándose. Seguidlas con la cámara. Llevan al segundo ingrediente… y a los murciélagos.');
    case 3: return F(fear,
      'Me noto raro… Estoy escondido. Seguid la flecha de la brújula y venid a buscarme.',
      'Me ha mordido un zombi… Estoy escondido. Seguid la brújula y venid a buscarme. Rápido.',
      'Me ha mordido… en el cuello. Me arde. Estoy escondido. Seguid la brújula… antes de que me convierta.');
    case 4: return F(fear,
      'Ahora id a mi laboratorio. El radar os guiará, pero hay zombis por el camino. Llevad el polvo de dormir.',
      'Al laboratorio. El radar os guiará… pero el camino está lleno de zombis. ¡Dormidlos tocándolos!',
      'Al laboratorio… El radar os guiará. El camino está lleno de zombis hambrientos. Dormidlos… o no llegaréis.');
  }
  return '';
}

// Lo que dice el Doctor cuando lo encontráis (punto 3)
export function doctorText(fear) {
  return F(fear,
    '¡Por fin! Me he torcido el tobillo huyendo de los zombis. Tomad: agua de luna, el tercer ingrediente. Ahora id a mi laboratorio y mezcladlo todo. ¡Confío en vosotros!',
    '¡Por fin! Un zombi me ha mordido la pierna y no puedo andar. Tomad: agua de luna, el tercer ingrediente. Id a mi laboratorio y mezcladlo todo. ¡Deprisa!',
    '¡Por fin! Me ha mordido… noto la niebla dentro. Tomad: agua de luna, el tercer ingrediente. Id a mi laboratorio y haced el antídoto. ¡Deprisa… antes de que os muerda yo!');
}

export const LAB_TEXT = '¡Mi laboratorio! Tocad cada ingrediente para echarlo en el caldero.';

// Mensaje al conseguir el ingrediente
export function rewardText(s, fear) {
  switch (s) {
    case 1: return F(fear,
      '¡El cofre se abre! Dentro hay una seta mágica que brilla.',
      '¡El cofre se abre! Dentro, entre telarañas, hay una seta mágica.',
      '¡El cofre se abre! Tiene arañazos y sangre seca… y dentro, una seta mágica.');
    case 2: return F(fear,
      '¡Los murciélagos se han ido! Uno ha dejado caer un colmillo.',
      '¡Ningún murciélago queda en el aire! En el suelo hay un colmillo de murciélago.',
      '¡Los murciélagos han caído! Entre las plumas negras hay un colmillo manchado de rojo.');
    case 3: return 'El Doctor os ha dado el agua de luna. ¡Ya tenéis los 3 ingredientes!';
  }
  return '';
}

export function winText(fear) {
  return F(fear,
    '¡El antídoto funciona! La niebla desaparece y los zombis vuelven a ser personas. ¡Sois la mejor Patrulla Antídoto del mundo!',
    '¡El antídoto funciona! Una luz enorme barre el parque y los zombis se curan. ¡Habéis salvado el parque!',
    '¡El antídoto explota en una luz blanca! Las heridas se cierran, la sangre desaparece y los zombis vuelven a ser personas. ¡Habéis salvado el parque!');
}

export function loseText(fear) {
  return F(fear,
    'La niebla os ha alcanzado… Pero el Doctor guardaba un frasco de emergencia…',
    'La niebla os rodea y se oyen gruñidos… Pero el Doctor guardaba un frasco de emergencia…',
    'La niebla roja os envuelve. Manos frías os agarran… Pero el Doctor guardaba un frasco de emergencia…');
}

export const NAV_HINTS = {
  radar: [
    'Cuando el barrido verde pasa, se enciende un punto: ¡el cofre está en esa dirección!',
    'Si pone «frío», os alejáis. Si pone «caliente», ¡vais bien!',
  ],
  compass: [
    'Poned el móvil plano, como una bandeja, y caminad hacia donde apunta la flecha.',
    'Si la flecha baila mucho, alejaos de bancos o farolas de metal.',
  ],
};
