// Historia y textos del juego. fear: 1 suave, 2 miedo, 3 terror
// Partida corta (unos 20 minutos): 4 ingredientes + el maletín final = 5 puntos en el parque.
const F = (fear, suave, miedo, terror) => (fear >= 3 ? terror : fear >= 2 ? miedo : suave);

export const N_ING = 4; // ingredientes (y números del código final)
export const FINAL = 5; // el último punto es el laboratorio

export const FEAR_NAMES = { 1: 'Suave', 2: 'Miedo', 3: 'Terror' };

export const STATIONS = {
  1: { nav: 'radar', ch: ['find'], ing: { icon: '🍄', name: 'Seta mágica' } },
  2: { nav: 'radar', ch: ['flashlight'], ing: { icon: '🪶', name: 'Pluma de búho' } },
  3: { nav: 'compass', ch: ['sums'], ing: { icon: '💎', name: 'Piedra brillante' } },
  4: { nav: 'compass', ch: ['horde'], ing: { icon: '🦷', name: 'Diente de dragón' } },
  5: { nav: 'compass', ch: ['final'] },
};

export const ROLES = ['Capitán', 'Exploradora', 'Vigía', 'Científica', 'Linterna', 'Rastreador', 'Médica', 'Guardián', 'Mensajera', 'Cazaniebla'];

const ANIMALS = ['Lobo', 'Búho', 'Zorro', 'Lince', 'Halcón', 'Tejón', 'Cuervo', 'Puma', 'Oso', 'Gato', 'Murciélago', 'Jabalí'];
const ADJ = ['Rojo', 'Gris', 'Veloz', 'Valiente', 'Sombra', 'Negro', 'Feroz', 'Silencioso', 'Azul', 'Dorado'];
export const randomNick = () => ANIMALS[Math.floor(Math.random() * ANIMALS.length)] + ' ' + ADJ[Math.floor(Math.random() * ADJ.length)];

// Mensaje inicial + primera pista, todo junto para empezar rápido
export function introText(fear) {
  return F(fear,
    '…ksshh… Soy el Doctor Moho. Una niebla gris se ha escapado de mi laboratorio y convierte a la gente en zombis. Patrulla Antídoto: encontrad 4 ingredientes antes de 20 minutos. El primero está en mi mochila. ¡Seguid el radar!',
    '…ksshh… Soy el Doctor Moho. Una niebla roja se ha escapado y convierte a la gente en zombis con heridas abiertas. Patrulla Antídoto: tenéis 20 minutos para encontrar 4 ingredientes. El primero está en mi mochila. ¡Seguid el radar!',
    '…ksshh… Soy el Doctor Moho. La niebla roja se ha escapado. He visto zombis morder… hay sangre por todas partes. Tenéis 20 minutos para encontrar 4 ingredientes. El primero está en mi mochila. Seguid el radar… y no hagáis ruido.');
}

export function lateText(fear, got, mins) {
  return `Te unes a la Patrulla Antídoto. Tu equipo tiene ${got} de ${N_ING} ingredientes y quedan ${mins} minutos. ${F(fear, '¡Ayúdales!', '¡Corre, hay zombis cerca!', '¡Corre! Hay huellas de sangre por todas partes…')}`;
}

// Mensaje del Doctor al salir hacia cada punto (el 1 va dentro del mensaje inicial)
export function stationText(s, fear) {
  switch (s) {
    case 1: return introText(fear);
    case 2: return F(fear,
      'Algo se mueve entre los árboles. La pluma de búho está donde la niebla es más oscura. Seguid el radar.',
      'Gruñidos entre los árboles… La pluma de búho está donde la niebla es más oscura. Seguid el radar.',
      'He oído gritos entre los árboles. La pluma de búho está donde la niebla es más oscura. Seguid el radar… y no miréis atrás.');
    case 3: return F(fear,
      'Me noto raro… La piedra brillante está en un cofre. Seguid la flecha de la brújula.',
      'Me ha mordido uno… me noto raro. La piedra está en un cofre lleno de arañazos. Seguid la brújula.',
      'Me ha mordido… en el cuello. Me arde. La piedra está en un cofre con huellas rojas. Seguid la brújula… rápido.');
    case 4: return F(fear,
      'Oigo muchos pasos… El diente de dragón está donde marca la brújula. ¡Preparad el polvo de dormir!',
      'Viene una horda… El diente de dragón está donde marca la brújula. ¡Preparad el polvo de dormir!',
      'Grrr… perdón… Viene una HORDA, con la boca abierta. El diente está donde marca la brújula. ¡Polvo de dormir, ya!');
    case 5: return F(fear,
      '¡Tenéis los 4 ingredientes! Id al laboratorio con la brújula. Cada uno guarda algunos números del maletín.',
      '¡Los 4 ingredientes! Id al laboratorio con la brújula y juntad vuestros números para abrir el maletín.',
      '¡Los 4 ingredientes! Al laboratorio… con la brújula. Juntad vuestros números. Y daos prisa… porque yo… ya no soy… yo…');
  }
  return '';
}

// Mensaje al conseguir el ingrediente
export function rewardText(s, fear) {
  switch (s) {
    case 1: return F(fear,
      '¡La mochila! Dentro hay una seta mágica y una nota: «La niebla odia la luz».',
      '¡La mochila! Está rota. Dentro hay una seta mágica y una nota: «La niebla odia la luz».',
      '¡La mochila! Tiene sangre y marcas de dientes. Dentro, una seta mágica y una nota: «La niebla odia la luz».');
    case 2: return F(fear,
      'Los zombis se han dormido. Entre las hojas brilla una pluma de búho.',
      'Los zombis han caído dormidos. Entre ellos brilla una pluma de búho.',
      'Los zombis han caído al suelo, gruñendo en sueños. Uno tenía una pluma de búho manchada de rojo.');
    case 3: return '¡El cofre se abre! Dentro hay una piedra brillante.';
    case 4: return F(fear,
      '¡Toda la horda duerme! Y en el suelo hay un diente de dragón.',
      '¡Toda la horda duerme! Entre los zombis hay un diente de dragón.',
      '¡La horda ha caído! Entre los cuerpos dormidos hay un diente de dragón.');
  }
  return '';
}

export function finalScareText(fear) {
  return F(fear,
    '¡Mirad! El Doctor Moho se ha convertido en zombi. ¡Abrid el maletín y curadle!',
    '¡El Doctor Moho tiene los ojos blancos y la piel gris! ¡Abrid el maletín antes de que os alcance!',
    '¡El Doctor Moho! Ojos blancos, la bata llena de sangre… ¡Se acerca! ¡Abrid el maletín YA!');
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
    'Mirad la palabra del radar: si pone «frío», os alejáis. Si pone «caliente», ¡vais bien!',
    'Caminad 10 pasos en una dirección y mirad si se calienta o se enfría.',
  ],
  compass: [
    'Poned el móvil plano, como una bandeja, y caminad hacia donde apunta la flecha.',
    'Si la flecha baila mucho, alejaos de bancos o farolas de metal.',
  ],
};
