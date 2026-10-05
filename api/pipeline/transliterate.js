// Devanagari → rough Roman Hinglish, for matching only.
//
// Whisper writes Ajay's Hindi speech in Devanagari ("नहीं करते"), while B2C
// scripts are Roman Hinglish ("nahin karte"). This gets the Devanagari close
// enough to Roman spelling for the fuzzy matcher; it is never shown to anyone.

const CONSONANTS = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n',
  'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h',
  'क़': 'q', 'ख़': 'kh', 'ग़': 'g', 'ज़': 'z', 'ड़': 'r', 'ढ़': 'rh', 'फ़': 'f', 'य़': 'y',
};
const VOWELS = { 'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo', 'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऑ': 'o' };
const MATRAS = { 'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o' };
const NASAL = new Set(['ं', 'ँ']);
const VIRAMA = '्';
const NUKTA = '़';

export const hasDevanagari = (s) => /[ऀ-ॿ]/.test(s);

// Tokens: consonant (with its vowel: 'a' inherent, a matra, or none after a
// virama), independent vowel, or nasal. Then Hindi schwa deletion: the
// inherent 'a' is dropped at the end of a word ("कर" → "kar") and between a
// vowel-consonant and a consonant-vowel ("करते" → "karte", not "karate").
export function devanagariToRoman(word) {
  const chars = [...word.normalize('NFC')];
  const units = [];
  for (let i = 0; i < chars.length; i++) {
    let ch = chars[i];
    if (chars[i + 1] === NUKTA) { ch += NUKTA; i++; }
    if (CONSONANTS[ch]) {
      const next = chars[i + 1];
      if (next === VIRAMA) { units.push({ c: CONSONANTS[ch], v: '' }); i++; }
      else if (MATRAS[next]) { units.push({ c: CONSONANTS[ch], v: MATRAS[next] }); i++; }
      else units.push({ c: CONSONANTS[ch], v: 'a', inherent: true });
    } else if (VOWELS[ch]) {
      units.push({ c: '', v: VOWELS[ch] });
    } else if (NASAL.has(ch)) {
      units.push({ c: '', v: 'n', nasal: true });
    } else if (ch === 'ः') {
      units.push({ c: '', v: 'h' });
    } else if (!/[ऀ-ॿ]/.test(ch)) {
      units.push({ c: '', v: ch });
    }
  }

  // Word-final inherent 'a' (not in one-letter words like "न" → "na").
  const last = units[units.length - 1];
  if (units.length > 1 && last?.inherent) last.v = '';
  // Medial: V C[a] C V → drop the 'a'.
  for (let i = 1; i < units.length - 1; i++) {
    const u = units[i];
    const prev = units[i - 1];
    const next = units[i + 1];
    if (u.c && u.inherent && prev.v && next.c && next.v) u.v = '';
  }
  return units.map((u) => u.c + u.v).join('');
}

// A loose spelling key so Hinglish spelling variants compare equal:
// aa/a, ee/i, oo/u, w/v, ph/f, z/j, doubled letters.
export function phoneticKey(word) {
  const roman = hasDevanagari(word) ? devanagariToRoman(word) : word;
  return roman
    .toLowerCase()
    .normalize('NFKD').replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]/g, '')
    .replace(/ph/g, 'f')
    .replace(/w/g, 'v')
    .replace(/z/g, 'j')
    .replace(/q/g, 'k')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/(.)\1+/g, '$1');
}
