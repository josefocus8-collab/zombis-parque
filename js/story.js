// Historia y textos del juego. fear: 1 suave, 2 miedo, 3 terror
const F = (fear, suave, miedo, terror) => (fear >= 3 ? terror : fear >= 2 ? miedo : suave);

export const FEAR_NAMES = { 1: 'Suave', 2: 'Miedo', 3: 'Terror' };

export const STATIONS = {
  1: { nav: 'radar', ch: ['find'], ing: { icon: '🍄', name: 'Seta mágica' } },
  2: { nav: 'radar', ch: ['flashlight'], ing: { icon: '🪶', name: 'Pluma de búho' } },
  3: { nav: 'compass', ch: ['sums'], ing: { icon: '💎', name: 'Piedra brillante' } },
  4: { nav: 'radar', ch: ['rub', 'wires'], ing: { icon: '🧪', name: 'Agua de luna' } },
  5: { nav: 'compass', ch: ['horde'], ing: { icon: '🦷', name: 'Diente de dragón' } },
  6: { nav: 'radar', ch: ['words', 'mult'], ing: { icon: '🌸', name: 'Flor de niebla' } },
  7: { nav: 'compass', ch: ['final'] },
};

export const ROLES = ['Capitán', 'Exploradora', 'Vigía', 'Científica', 'Linterna', 'Rastreador', 'Médica', 'Guardián', 'Mensajera', 'Cazaniebla'];

const ANIMALS = ['Lobo', 'Búho', 'Zorro', 'Lince', 'Halcón', 'Tejón', 'Cuervo', 'Puma', 'Oso', 'Gato', 'Murciélago', 'Jabalí'];
const ADJ = ['Rojo', 'Gris', 'Veloz', 'Valiente', 'Sombra', 'Negro', 'Feroz', 'Silencioso', 'Azul', 'Dorado'];
export const randomNick = () => ANIMALS[Math.floor(Math.random() * ANIMALS.length)] + ' ' + ADJ[Math.floor(Math.random() * ADJ.length)];

export function introText(fear) {
  return F(fear,
    `…ksshh… ¿Me oye alguien? Soy el Doctor Moho. Una niebla gris se ha escapado de mi laboratorio. Quien la respira se convierte en zombi: camina arrastrando los pies, gruñe y busca gente. Necesito vuestra ayuda, Patrulla Antídoto. Encontrad los 6 ingredientes del antídoto que escondí por el parque. Tenéis 45 minutos antes de que la niebla lo cubra todo.`,
    `…ksshh… ¿Me oye alguien? Soy el Doctor Moho. Una niebla roja se ha escapado de mi laboratorio. Quien la respira se convierte en zombi. Les he visto… con heridas abiertas, arrastrándose… buscando a quién morder. Patrulla Antídoto: encontrad los 6 ingredientes del antídoto que escondí por el parque. Tenéis 45 minutos. Y no hagáis ruido.`,
    `…ksshh… ¿Me oye… alguien? Soy el Doctor Moho. La niebla roja se ha escapado. Todo el que la respira… se convierte. Les he visto morder. Hay sangre por todas partes… en los bancos, en los árboles… Patrulla Antídoto: tenéis 45 minutos para encontrar los 6 ingredientes del antídoto. Si no… la niebla os alcanzará a vosotros también. Y por favor… no hagáis ruido. Ellos lo oyen… todo.`
  );
}

export function lateText(fear, got, mins) {
  return `Un superviviente se une a la Patrulla Antídoto. Tu equipo ya tiene ${got} de 6 ingredientes y quedan ${mins} minutos. ${F(fear, '¡Ayúdales!', '¡Corre, los zombis están cerca!', '¡Corre! Hay huellas de sangre por todas partes…')}`;
}

// Mensaje del Doctor antes de ir a cada punto
export function stationText(s, fear) {
  switch (s) {
    case 1: return F(fear,
      'Mi mochila con la primera nota se quedó cerca. Usad el radar: cuanto más caliente, más cerca estáis.',
      'Mi mochila está tirada cerca de aquí. La perdí cuando un zombi me agarró del brazo. Usad el radar: cuanto más caliente, más cerca.',
      'Mi mochila… se me cayó cuando un zombi me clavó las uñas en el brazo. Todavía sangra. Usad el radar: cuanto más caliente, más cerca. Rápido.');
    case 2: return F(fear,
      'Algo se mueve entre los árboles… La segunda pista está donde la niebla es más oscura. Seguid el radar.',
      'Algo se mueve entre los árboles. Gruñidos… pasos… La segunda pista está donde la niebla es más oscura. Seguid el radar.',
      'He oído gritos entre los árboles. Y luego… silencio. La segunda pista está donde la niebla es más oscura. Seguid el radar… y no miréis atrás.');
    case 3: return F(fear,
      'Escondí un cofre en mi antiguo escondite. La brújula os señalará el camino.',
      'Escondí un cofre en mi antiguo escondite. Los zombis intentaron abrirlo a arañazos. Seguid la flecha de la brújula.',
      'Escondí un cofre en mi escondite. Los zombis lo arañaron hasta romperse las uñas. Hay marcas rojas por todo. Seguid la flecha de la brújula.');
    case 4: return F(fear,
      'Me noto raro… La niebla me ha tocado. El agua de luna está junto a mi máquina rota. Seguid el radar.',
      '…me ha mordido uno… Me noto raro. Tengo frío. El agua de luna está junto a mi máquina rota. Seguid el radar, deprisa.',
      '…me ha mordido. En el cuello. Me arde… veo todo rojo… El agua de luna está junto a mi máquina rota. Seguid el radar… antes de que yo… también…');
    case 5: return F(fear,
      'Silencio… oigo muchos pasos. Muchos. El diente de dragón está hacia donde marca la brújula. Preparad el polvo de dormir.',
      'Silencio… oigo muchos pasos. Una horda viene hacia aquí. El diente de dragón está hacia donde marca la brújula. ¡Preparad el polvo de dormir!',
      'grrr… perdón… Oigo muchos pasos. Es una HORDA. Vienen arrastrando los pies, con la boca abierta… El diente de dragón está donde marca la brújula. ¡Preparad el polvo de dormir!');
    case 6: return F(fear,
      'El último ingrediente está en el viejo nido de los búhos. Seguid el radar.',
      'El último ingrediente… está en el viejo nido de los búhos. No… puedo… pensar bien… Seguid el radar.',
      'Tengo… hambre… ¡NO! Concentraos. El último ingrediente está en el nido de los búhos. Seguid el radar… y no os acerquéis a mí.');
    case 7: return F(fear,
      '¡Tenéis los 6 ingredientes! Id al laboratorio con la brújula y abrid el maletín del antídoto. Cada uno tiene algunos números del código.',
      '¡Tenéis los 6 ingredientes! Id al laboratorio siguiendo la brújula. El maletín tiene un código. Cada uno de vosotros guarda algunos números. ¡Juntaos!',
      '¡Los 6 ingredientes! Id… al laboratorio… con la brújula. El maletín tiene un código: cada uno guarda algunos números. Juntaos. Y daos prisa… porque yo… ya no soy… yo… GRRRR…');
  }
  return '';
}

// Mensaje al conseguir el ingrediente
export function rewardText(s, fear) {
  switch (s) {
    case 1: return F(fear,
      '¡La mochila del Doctor! Dentro hay una seta mágica que brilla y una nota: «La niebla odia la luz».',
      '¡La mochila! Está rota y manchada. Dentro hay una seta mágica y una nota: «La niebla odia la luz».',
      '¡La mochila! Tiene manchas de sangre y marcas de dientes. Dentro hay una seta mágica y una nota temblorosa: «La niebla odia la luz».');
    case 2: return F(fear,
      'Los zombis se han dormido. Entre las hojas brilla una pluma de búho.',
      'Los zombis han caído dormidos. Entre ellos brilla una pluma de búho.',
      'Los zombis han caído al suelo, gruñendo en sueños. Uno tenía en la mano una pluma de búho… manchada de rojo.');
    case 3: return '¡El cofre se abre! Dentro hay una piedra brillante que ilumina la niebla.';
    case 4: return '¡La máquina funciona! El frasco se llena de agua de luna, fría y brillante.';
    case 5: return F(fear,
      '¡Toda la horda duerme! En el suelo hay un diente de dragón.',
      '¡Toda la horda duerme! Entre los zombis dormidos encontráis un diente de dragón.',
      '¡La horda ha caído! Ronquidos, gruñidos… y entre los cuerpos, un diente de dragón afilado.');
    case 6: return '¡La flor de niebla! Ya tenéis los 6 ingredientes del antídoto.';
  }
  return '';
}

export function finalScareText(fear) {
  return F(fear,
    '¡Mirad! El Doctor Moho está aquí… pero se ha convertido en zombi. ¡Rápido, abrid el maletín y curadle!',
    '¡El Doctor Moho está aquí! Pero tiene los ojos blancos y la piel gris… Se ha convertido. ¡Abrid el maletín antes de que os alcance!',
    '¡El Doctor Moho! Tiene los ojos blancos, la bata llena de sangre y una herida enorme en el cuello. Se acerca gruñendo… ¡Abrid el maletín YA!');
}

export function winText(fear) {
  return F(fear,
    '¡El antídoto funciona! La niebla desaparece, los zombis bostezan y vuelven a ser personas normales. El Doctor Moho os da las gracias. ¡Sois la mejor Patrulla Antídoto del mundo!',
    '¡El antídoto funciona! Una luz enorme barre el parque. Los zombis se curan: sus heridas se cierran y vuelven a ser personas. El Doctor Moho os abraza. ¡Habéis salvado el parque!',
    '¡El antídoto explota en una luz blanca! La niebla roja se deshace. Las heridas se cierran, la sangre desaparece y los zombis vuelven a ser personas… muy confundidas. El Doctor Moho llora de alegría. ¡Habéis salvado el parque, Patrulla Antídoto!');
}

export function loseText(fear) {
  return F(fear,
    'La niebla os ha alcanzado… Todo se vuelve gris. Pero el Doctor guardaba un último frasco de emergencia…',
    'La niebla os rodea… Se oyen gruñidos muy cerca. Pero el Doctor guardaba un último frasco de emergencia…',
    'La niebla roja os envuelve. Manos frías os agarran de los tobillos… Pero el Doctor guardaba un último frasco de emergencia…');
}

export const NAV_HINTS = {
  radar: [
    'Mirad la palabra del radar: si pone «frío», os estáis alejando. Si pone «caliente», ¡vais bien!',
    'Probad a caminar 10 pasos en una dirección y mirad si se calienta o se enfría.',
  ],
  compass: [
    'Poned el móvil plano, como una bandeja, y caminad hacia donde apunta la flecha.',
    'Si la flecha baila mucho, alejaos un poco de bancos o farolas de metal.',
  ],
};
