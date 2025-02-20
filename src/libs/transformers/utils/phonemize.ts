import { phonemize as espeakng } from "phonemizer";

// Some of this code is from https://github.com/hexgrad/kokoro/

/**
 * Helper function to split a string on a regex, but keep the delimiters.
 * This is required, because the JavaScript `.split()` method does not keep the delimiters,
 * and wrapping in a capturing group causes issues with existing capturing groups (due to nesting).
 * @param {string} text The text to split.
 * @param {RegExp} regex The regex to split on.
 * @returns {{match: boolean; text: string}[]} The split string.
 */
function split(text: string, regex: RegExp) {
  const result = [];
  let prev = 0;
  for (const match of text.matchAll(regex)) {
    const fullMatch = match[0];
    if (prev < match.index) {
      result.push({ match: false, text: text.slice(prev, match.index) });
    }
    if (fullMatch.length > 0) {
      result.push({ match: true, text: fullMatch });
    }
    prev = match.index + fullMatch.length;
  }
  if (prev < text.length) {
    result.push({ match: false, text: text.slice(prev) });
  }
  return result;
}

/**
 * Helper function to split numbers into phonetic equivalents
 * @param {string} match The matched number
 * @returns {string} The phonetic equivalent
 */
function split_num(match: string) {
  if (match.includes(".")) {
    return match;
  } else if (match.includes(":")) {
    let [h, m] = match.split(":").map(Number);
    if (m === 0) {
      return `${h} o'clock`;
    } else if (m < 10) {
      return `${h} oh ${m}`;
    }
    return `${h} ${m}`;
  }
  let year = parseInt(match.slice(0, 4), 10);
  if (year < 1100 || year % 1000 < 10) {
    return match;
  }
  let left = match.slice(0, 2);
  let right = parseInt(match.slice(2, 4), 10);
  let suffix = match.endsWith("s") ? "s" : "";
  if (year % 1000 >= 100 && year % 1000 <= 999) {
    if (right === 0) {
      return `${left} hundred${suffix}`;
    } else if (right < 10) {
      return `${left} oh ${right}${suffix}`;
    }
  }
  return `${left} ${right}${suffix}`;
}

/**
 * Helper function to format monetary values
 * @param {string} match The matched currency
 * @returns {string} The formatted currency
 */
function flip_money(match: string) {
  const bill = match[0] === "$" ? "dollar" : "pound";
  if (isNaN(Number(match.slice(1)))) {
    return `${match.slice(1)} ${bill}s`;
  } else if (!match.includes(".")) {
    let suffix = match.slice(1) === "1" ? "" : "s";
    return `${match.slice(1)} ${bill}${suffix}`;
  }
  const [b, c] = match.slice(1).split(".");
  const d = parseInt(c.padEnd(2, "0"), 10);
  let coins = match[0] === "$" ? (d === 1 ? "cent" : "cents") : d === 1 ? "penny" : "pence";
  return `${b} ${bill}${b === "1" ? "" : "s"} and ${d} ${coins}`;
}

/**
 * Helper function to process decimal numbers
 * @param {string} match The matched number
 * @returns {string} The formatted number
 */
function point_num(match: string) {
  let [a, b] = match.split(".");
  return `${a} point ${b.split("").join(" ")}`;
}

/**
 * Normalize text for phonemization
 * @param {string} text The text to normalize
 * @returns {string} The normalized text
 */
function normalize_text(text: string) {
  return (
    text
      // 1. Handle quotes and brackets
      .replace(/[‘’]/g, "'")
      .replace(/«/g, "“")
      .replace(/»/g, "”")
      .replace(/[“”]/g, '"')
      .replace(/\(/g, "«")
      .replace(/\)/g, "»")

      // 2. Replace uncommon punctuation marks
      .replace(/、/g, ", ")
      .replace(/。/g, ". ")
      .replace(/！/g, "! ")
      .replace(/，/g, ", ")
      .replace(/：/g, ": ")
      .replace(/；/g, "; ")
      .replace(/？/g, "? ")

      // 3. Whitespace normalization
      .replace(/[^\S \n]/g, " ")
      .replace(/  +/, " ")
      .replace(/(?<=\n) +(?=\n)/g, "")

      // 4. Abbreviations
      .replace(/\bD[Rr]\.(?= [A-Z])/g, "Doctor")
      .replace(/\b(?:Mr\.|MR\.(?= [A-Z]))/g, "Mister")
      .replace(/\b(?:Ms\.|MS\.(?= [A-Z]))/g, "Miss")
      .replace(/\b(?:Mrs\.|MRS\.(?= [A-Z]))/g, "Mrs")
      .replace(/\betc\.(?! [A-Z])/gi, "etc")

      // 5. Normalize casual words
      .replace(/\b(y)eah?\b/gi, "$1e'a")

      // 5. Handle numbers and currencies
      .replace(/\d*\.\d+|\b\d{4}s?\b|(?<!:)\b(?:[1-9]|1[0-2]):[0-5]\d\b(?!:)/g, split_num)
      .replace(/(?<=\d),(?=\d)/g, "")
      .replace(/[$£]\d+(?:\.\d+)?(?: hundred| thousand| (?:[bm]|tr)illion)*\b|[$£]\d+\.\d\d?\b/gi, flip_money)
      .replace(/\d*\.\d+/g, point_num)
      .replace(/(?<=\d)-(?=\d)/g, " to ")
      .replace(/(?<=\d)S/g, " S")

      // 6. Handle possessives
      .replace(/(?<=[BCDFGHJ-NP-TV-Z])'?s\b/g, "'S")
      .replace(/(?<=X')S\b/g, "s")

      // 7. Handle hyphenated words/letters
      .replace(/(?:[A-Za-z]\.){2,} [a-z]/g, (m) => m.replace(/\./g, "-"))
      .replace(/(?<=[A-Z])\.(?=[A-Z])/gi, "-")

      // 8. Strip leading and trailing whitespace
      .trim()
  );
}

/**
 * Escapes regular expression special characters from a string by replacing them with their escaped counterparts.
 *
 * @param {string} string The string to escape.
 * @returns {string} The escaped string.
 */
function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
}

const PUNCTUATION = ';:,.!?¡¿—…"«»“”(){}[]';
const PUNCTUATION_PATTERN = new RegExp(`(\\s*[${escapeRegExp(PUNCTUATION)}]+\\s*)+`, "g");

const HINDI_PHONEME_MAP: { [key: string]: string } = {
  // Vowels - Updated to be more accurate and broadly understood
  'अ': 'a',      // a
  'आ': 'aː',     // Long 'a'
  'इ': 'e',      // Lax 'i'
  'ई': 'eː',     // Long 'i'
  'उ': 'ʊ',      // Lax 'u'
  'ऊ': 'uː',     // Long 'u'
  'ऋ': 'ri',    // 'ri' sound (often pronounced like this) -  Could also be ɾɪ
  'ए': 'eː',     // Long 'e'
  'ऐ': 'ɛ',      // Diphthong/Monophthong 'ai' - More accurately [ɛ] or [æ] in many dialects
  'ओ': 'oː',     // Long 'o'
  'औ': 'ɔ',      // Diphthong/Monophthong 'au' - More accurately [ɔ] or [ɒ] in many dialects
  'ऍ': 'æ',      // Open 'e' sound (like in 'cat') - Borrowed sound
  'ऑ': 'ɒ',      // Open 'o' sound (like in 'caught') - Borrowed sound

  // Consonants - Updated for broader IPA understanding (using alveolar series where applicable)
  'क': 'k',      // Voiceless velar stop
  'ख': 'kʰ',     // Aspirated voiceless velar stop
  'ग': 'g',      // Voiced velar stop
  'घ': 'gʰ',     // Aspirated voiced velar stop
  'ङ': 'ŋ',      // Velar nasal
  'च': 'tʃ',     // Voiceless postalveolar affricate
  'छ': 'tʃʰ',    // Aspirated voiceless postalveolar affricate
  'ज': 'dʒ',     // Voiced postalveolar affricate
  'झ': 'dʒʰ',    // Aspirated voiced postalveolar affricate
  'ञ': 'ɲ',      // Palatal nasal
  'ट': 'ʈ',      // Voiceless retroflex stop
  'ठ': 'ʈʰ',     // Aspirated voiceless retroflex stop
  'ड': 'ɖ',      // Voiced retroflex stop
  'ढ': 'ɖʰ',     // Aspirated voiced retroflex stop
  'ण': 'ɳ',      // Retroflex nasal
  'त': 't',      // Voiceless alveolar stop (Technically dental [t̪])
  'थ': 'tʰ',     // Aspirated voiceless alveolar stop (Technically dental [t̪ʰ])
  'द': 'd',      // Voiced alveolar stop (Technically dental [d̪])
  'ध': 'dʰ',     // Aspirated voiced alveolar stop (Technically dental [d̪ʰ])
  'न': 'n',      // Alveolar nasal (Technically dental [n̪])
  'प': 'p',      // Voiceless bilabial stop
  'फ': 'pʰ',     // Aspirated voiceless bilabial stop
  'ब': 'b',      // Voiced bilabial stop
  'भ': 'bʰ',     // Aspirated voiced bilabial stop
  'म': 'm',      // Bilabial nasal
  'य': 'j',      // Palatal approximant
  'र': 'r',      // Alveolar trill or flap
  'ल': 'l',      // Alveolar lateral approximant
  'व': 'w',      // Bilabial approximant (More common pronunciation, technically could be labiodental [ʋ])
  'श': 'ʃ',      // Postalveolar voiceless fricative (Often used, but 'ष' is retroflex [ʂ])
  'ष': 'ʂ',      // Retroflex voiceless fricative (More accurate for 'ष')
  'स': 's',      // Alveolar voiceless fricative (Technically dental [s̪])
  'ह': 'h',      // Voiceless glottal fricative (Simpler and common, could be breathy voiced [ɦ])

  // Matras (Vowel Marks) - Updated to match vowel changes
  'ा': 'aː',     // aa matra
  'ि': 'ɪ',      // i matra
  'ी': 'iː',     // ee matra
  'ु': 'ʊ',      // u matra
  'ू': 'uː',     // oo matra
  'ृ': 'ri',    // ri matra - Could also be ɾɪ
  'े': 'eː',     // e matra
  'ै': 'ɛ',      // ai matra
  'ो': 'oː',     // o matra
  'ौ': 'ɔ',      // au matra
  'ं': 'n',      // Anusvara - Simplified to 'n' for general nasal consonant (See notes below)
  'ः': 'h',      // Visarga
  '्': '',       // Halant/Virama - Removes inherent vowel

  // Nukta variations - Generally correct
  'क़': 'q',      // Uvular stop
  'ख़': 'x',      // Voiceless velar fricative
  'ग़': 'ɣ',      // Voiced velar fricative
  'ज़': 'z',      // Voiced alveolar fricative
  'ड़': 'ɽ',      // Retroflex flap
  'ढ़': 'ɽʰ',     // Aspirated retroflex flap
  'फ़': 'f',      // Labiodental fricative
};

// Add function to detect script
// function isDevanagari(text: string): boolean {
//   return /[\u0900-\u097F]/.test(text);
// }

// Add Spanish phoneme detection
// function isSpanish(text: string): boolean {
//   return /[áéíóúñ¿¡]|ll|ñ/i.test(text);
// }

// Add Spanish phoneme mappings
const SPANISH_PHONEME_MAP: { [key: string]: string } = {
  // Vowels
  'a': 'a',
  'á': 'ˈa',
  'e': 'e',
  'é': 'ˈe',
  'i': 'i',
  'í': 'ˈi',
  'o': 'o',
  'ó': 'ˈo',
  'u': 'u',
  'ú': 'ˈu',
  'ü': 'u',

  // Consonants
  'b': 'b',
  'v': 'β',
  'c': 'k',
  'ch': 'tʃ',
  'd': 'ð',
  'f': 'f',
  'g': 'ɡ',
  'h': '',  // silent in Spanish
  'j': 'x',
  'k': 'k',
  'l': 'l',
  'll': 'j',
  'm': 'm',
  'n': 'n',
  'ñ': 'ɲ',
  'p': 'p',
  'q': 'k',
  'r': 'ɾ',
  'rr': 'r',
  's': 's',
  't': 't',
  'w': 'w',
  'x': 'ks',
  'y': 'ʝ',
  'z': 'θ'  // for European Spanish
};

// Add function to handle Hindi syllable structure
function processHindiSyllable(text: string): string {
  return text
    // Handle consonant clusters with virama
    .replace(/([क-ह])्([क-ह])/g, (_, c1, c2) => {
      const p1 = HINDI_PHONEME_MAP[c1] || c1;
      const p2 = HINDI_PHONEME_MAP[c2] || c2;
      return p1 + p2;
    })
    // Handle inherent 'a' sound after consonants, but not at word end
    .replace(/([क-ह])(?![ािीुूृेैोौ्ंँः]|$)/g, (_, c) => {
      const phoneme = HINDI_PHONEME_MAP[c] || c;
      return phoneme + 'ə';
    })
    // Handle word-final consonants without schwa
    .replace(/([क-ह])$/g, (_, c) => HINDI_PHONEME_MAP[c] || c)
    // Handle nasalization
    .replace(/([aeiouəɛɔ])ं/g, '$1̃')
    .replace(/([aeiouəɛɔ])ँ/g, '$1̃');
}

export async function phonemize(text: string, language = "a", norm = true) {
  // 1. Normalize text
  if (norm) {
    text = normalize_text(text);
  }

  // 2. Map language codes to processing types
  const languageMap: { [key: string]: string } = {
    'a': 'en-us',  // American English
    'b': 'en',     // British English
    'h': 'hindi',  // Hindi
    'e': 'spanish', // Spanish
    'f': 'french', // French 
    'z': 'chinese' // Chinese
  };

  const targetLanguage = languageMap[language] || 'en-us';

  // 3. Split into chunks, to ensure we preserve punctuation
  const sections = split(text, PUNCTUATION_PATTERN);

  // 4. Convert each section to phonemes
  const ps = (await Promise.all(
    sections.map(async ({ match, text }) => {
      if (match) return text;
      
      switch (targetLanguage) {
        case 'hindi':
          // console.log('Hindi phonemization');
          return text.split(/(?=[क-ह])/)
            .map(chunk => processHindiSyllable(
              Array.from(chunk)
                .map(char => HINDI_PHONEME_MAP[char] || char)
                .join('')
            ))
            .join('');
        
        case 'spanish':
          // console.log('Spanish phonemization');
          let result = text.toLowerCase();
          result = result
            .replace(/ch/g, 'tʃ')
            .replace(/ll/g, 'j')
            .replace(/rr/g, 'r')
            .replace(/c([ie])/g, 's$1');
          
          return Array.from(result)
            .map(char => SPANISH_PHONEME_MAP[char] || char)
            .join('');
        
        default: // en-us or en
          // console.log('Default phonemization');
          return (await espeakng(text, targetLanguage)).join(" ");
      }
    })
  )).join("");

  // 5. Post-process phonemes
  let processed = ps
    // https://en.wiktionary.org/wiki/kokoro#English
    .replace(/kəkˈoːɹoʊ/g, "kˈoʊkəɹoʊ")
    .replace(/kəkˈɔːɹəʊ/g, "kˈəʊkəɹəʊ")
    .replace(/ʲ/g, "j")
    .replace(/r/g, "ɹ")
    .replace(/x/g, "k")
    .replace(/ɬ/g, "l")
    .replace(/(?<=[a-zɹː])(?=hˈʌndɹɪd)/g, " ")
    .replace(/ z(?=[;:,.!?¡¿—…"«»""(){}[] ]|$)/g, "z")
    // Add Hindi-specific post-processing if needed
    .replace(/(?<=[aeiou])h/g, 'ɦ') // Handle aspirated sounds
    .replace(/(?<=\w)ː/g, 'ː '); // Add space after long vowels

  // 6. Additional post-processing for American English
  if (language === "a") {
    processed = processed.replace(/(?<=nˈaɪn)ti(?!ː)/g, "di");
  }
  return processed.trim();
}