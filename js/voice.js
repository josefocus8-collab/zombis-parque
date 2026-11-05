// Identifica cada frase del Doctor para encontrar su audio grabado (audio/voz/<clave>.mp3).
// Lo usan el juego y el programa que genera las voces con Piper.

// Quita lo que no se debe leer en voz alta (ruidos de radio, gruñidos, emojis)
export function voiceClean(text) {
  return String(text)
    .replace(/…?\s*ksshh\s*…?/gi, ' ')
    .replace(/\bGR+R+\b…?/g, ' ')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Huella corta del texto (FNV-1a de 32 bits)
export function voiceKey(text) {
  const s = voiceClean(text);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
