/* Search key for names stored in the DVB-TT (ISM) font encoding, so that Marathi typed in Unicode
   (phone keyboard, Windows Marathi keyboard) finds them. Both texts are reduced to their consonant "skeleton"
   (vowel signs, halant, anusvara are ignored; ण=न, ष=श, ळ=ल), so small spelling differences still match.
   Example: DVB "¯ÖãÂ¯ÖÖ ²Ö»Ö×³Ö´Ö" and Unicode "पुष्पा ब" both start with "पशपब". */
'use strict';

const DVBSearch = (() => {
  // DVB-TT glyph -> consonant / independent vowel (derived from the stored supplier names)
  const C = {
    'Û': 'क', 'Ü': 'ख', 'Ý': 'ग', '‘': 'घ', '“': 'च', '”': 'छ', '•': 'ज', '—': 'झ', '–': 'जञ',
    '™': 'ट', 'š': 'ठ', '›': 'ड', 'œ': 'ड', 'Þ': 'न', 'Ÿ': 'त', '£': 'थ', '¤': 'द', '¬': 'ध', '®': 'न',
    '¯': 'प', '±': 'फ', '²': 'ब', '³': 'भ', '´': 'म', 'µ': 'य', '¸': 'र', 'º': 'र', '»': 'ल', '¾': 'व',
    '¿': 'श', 'À': 'श', 'Â': 'श', 'Ã': 'स', 'Æ': 'ह', 'ô': 'ल', 'õ': 'कश',
    '¢': 'तत', '¡': 'तर', '¦': 'दर', '§': 'दद', '«': 'दव', 'Á': 'शर', '÷': 'ठठ', 'Î': 'र', 'Ï': 'र',
    '†': 'अ', '‡': 'इ', 'ˆ': 'उ', '‰': 'उ', '‹': 'ए', 'Š': 'र'
  };
  const REPH = new Set(['Ô', 'Ù']);           // र् written after its consonant in DVB
  const UNI_SAME = { 'ण': 'न', 'ष': 'श', 'ळ': 'ल', 'ढ': 'ड', 'ञ': 'ञ' };
  const UNI_VOWEL = { 'अ': 'अ', 'आ': 'अ', 'ओ': 'अ', 'औ': 'अ', 'ऑ': 'अ', 'इ': 'इ', 'ई': 'इ', 'उ': 'उ', 'ऊ': 'उ', 'ए': 'ए', 'ऐ': 'ए', 'ऋ': 'र' };
  const NUKTA = { 'क़': 'क', 'ख़': 'ख', 'ग़': 'ग', 'ज़': 'ज', 'ड़': 'ड', 'ढ़': 'ड', 'फ़': 'फ', 'य़': 'य' };
  const isLatin = ch => /[a-z0-9]/i.test(ch);

  /** consonant skeleton of a DVB-encoded text */
  function fromDvb(text) {
    let out = '';
    let lastStart = -1, prev = '';
    for (const ch of text || '') {
      if (C[ch] !== undefined) {
        const v = UNI_SAME[C[ch]] || C[ch];
        lastStart = out.length;
        out += v;
      } else if (REPH.has(ch)) {
        if (prev !== '‡' && lastStart >= 0) out = out.slice(0, lastStart) + 'र' + out.slice(lastStart);  // ‡Ô = ई, not a reph
      } else if (ch === ' ') {
        out += ' '; lastStart = -1;
      } else if (isLatin(ch)) {
        out += ch.toLowerCase(); lastStart = -1;
      }
      prev = ch;
    }
    return out;
  }

  /** consonant skeleton of a Unicode Devanagari text */
  function fromUnicode(text) {
    let out = '';
    for (const raw of (text || '').normalize('NFC')) {
      const ch = NUKTA[raw] || raw;
      const cp = ch.codePointAt(0);
      if (cp >= 0x0915 && cp <= 0x0939) out += UNI_SAME[ch] || ch;
      else if (UNI_VOWEL[ch]) out += UNI_VOWEL[ch];
      else if (ch === ' ') out += ' ';
      else if (isLatin(ch)) out += ch.toLowerCase();
      // matras, halant, anusvara, chandrabindu, nukta, visarga: ignored
    }
    return out;
  }

  const hasDevanagari = s => /[ऀ-ॿ]/.test(s || '');
  const squash = s => s.replace(/\s+/g, '');

  return {
    fromDvb, fromUnicode, hasDevanagari,
    /** true when the Unicode query matches the DVB-encoded name (substring of the skeletons; words may be skipped) */
    match(dvbText, unicodeQuery, cache) {
      const q = squash(fromUnicode(unicodeQuery));
      if (!q) return false;
      let k = cache && cache.get(dvbText);
      if (k === undefined) { k = squash(fromDvb(dvbText)); if (cache) cache.set(dvbText, k); }
      return k.includes(q);
    },
    startsWith(dvbText, unicodeQuery, cache) {
      const q = squash(fromUnicode(unicodeQuery));
      let k = cache && cache.get(dvbText);
      if (k === undefined) { k = squash(fromDvb(dvbText)); if (cache) cache.set(dvbText, k); }
      return !!q && k.startsWith(q);
    }
  };
})();
