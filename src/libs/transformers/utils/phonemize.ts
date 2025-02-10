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

// Add Hindi phoneme mappings
const HINDI_PHONEME_MAP: { [key: string]: string } = {
  // Vowels - corrections to better match standard IPA
  'अ': 'ə',      
  'आ': 'aː',     
  'इ': 'ɪ',      
  'ई': 'iː',     
  'उ': 'ʊ',     
  'ऊ': 'uː',     
  'ऋ': 'r̩',     
  'ए': 'eː',     
  'ऐ': 'ɛː',     // updated: previously was 'æː'
  'ओ': 'oː',     
  'औ': 'ɔː',     

  // Consonants – corrections for more accurate IPA
  'क': 'k',      
  'ख': 'kʰ',     
  'ग': 'g',      
  'घ': 'gʰ',     
  'ङ': 'ŋ',      
  'च': 'tʃ',     
  'छ': 'tʃʰ',    
  'ज': 'dʒ',     
  'झ': 'dʒʰ',    
  'ञ': 'ɲ',      
  'ट': 'ʈ',      
  'ठ': 'ʈʰ',     
  'ड': 'ɖ',      
  'ढ': 'ɖʰ',     
  'ण': 'ɳ',      
  'त': 't̪',     
  'थ': 't̪ʰ',    
  'द': 'd̪',     
  'ध': 'd̪ʰ',    
  'न': 'n̪',     
  'प': 'p',      
  'फ': 'pʰ',     
  'ब': 'b',      
  'भ': 'bʰ',     
  'म': 'm',      
  'य': 'j',      
  'र': 'r',      
  'ल': 'l',      
  'व': 'ʋ',      
  'श': 'ʃ',      
  'ष': 'ʂ',      
  'स': 's̪',     
  'ह': 'ɦ',      

  // Matras (Vowel Signs)
  'ा': 'aː',     
  'ि': 'ɪ',     
  'ी': 'iː',     
  'ु': 'ʊ',     
  'ू': 'uː',     
  'ृ': 'r̩',     
  'े': 'eː',     
  'ै': 'ɛː',     // updated here as well for vowel sign
  'ो': 'oː',     
  'ौ': 'ɔː',     
  'ं': 'ŋ',      // this is context dependent and further handled below
  'ः': 'h',      
  '्': '',       

  // Nukta variations
  'क़': 'q',      
  'ख़': 'x',      
  'ग़': 'ɣ',      
  'ज़': 'z',      
  'ड़': 'ɽ',      
  'ढ़': 'ɽʰ',     
  'फ़': 'f',

  // Additional common conjuncts (if needed)
  'न्न': 'nn',
  'म्म': 'mm',
  'च्च': 'ttʃ',
  'ज्ज': 'ddʒ',
  'प्प': 'pp',
  'व्व': 'ʋʋ',
  'स्स': 'ss',
  'क्त': 'kt',
  'प्त': 'pt',
  'न्त': 'nt',
  'स्त': 'st',

  // Chandrabindu (nasalization marker)
  'ँ': '̃',
};

// Add function to detect script
function isDevanagari(text: string): boolean {
  return /[\u0900-\u097F]/.test(text);
}

// Add Spanish phoneme detection
function isSpanish(text: string): boolean {
  // Check for Spanish-specific characters and common patterns
  return /[áéíóúñ¿¡]|ll|ñ/i.test(text);
}

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
  'll': 'ʎ',
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
    // Handle inherent 'a' sound after consonants
    .replace(/([क-ह])(?![ािीुूृेैोौ्ंँः])/g, (_, c) => {
      const phoneme = HINDI_PHONEME_MAP[c] || c;
      return phoneme + 'ə';
    })
    // Handle nasalization
    .replace(/([aeiouəɛɔ])ं/g, '$1̃')
    .replace(/([aeiouəɛɔ])ँ/g, '$1̃');
}

// Add helper function to detect script type for a token
function getTokenType(token: string): 'devanagari' | 'latin' | 'number' | 'other' {
  if (/[\u0900-\u097F]/.test(token)) return 'devanagari';
  if (/[a-zA-Z]/.test(token)) return 'latin';
  if (/\d+/.test(token)) return 'number';
  return 'other';
}

// Update phonemizeHindiWord to handle mixed text
async function phonemizeMixedText(text: string): Promise<string> {
  // Split on word boundaries while preserving spaces
  const tokens = text.split(/(\s+)/);
  
  const phonemizedTokens = await Promise.all(tokens.map(async (token) => {
    if (!token.trim()) return token; // preserve whitespace
    
    const tokenType = getTokenType(token);
    switch (tokenType) {
      case 'devanagari':
        return processHindiSyllable(token);
      case 'latin':
        // Use English phonemizer for Latin text
        return (await espeakng(token, 'en-us')).join(" ");
      case 'number':
        // Handle numbers - can use existing split_num function
        return split_num(token);
      default:
        return token;
    }
  }));

  return phonemizedTokens.join('');
}

export async function phonemize(text: string, language = "a", norm = true) {
  // 1. Normalize text
  if (norm) {
    text = normalize_text(text);
  }

  // 2. Check script type
  const hasDevanagari = isDevanagari(text);
  const hasSpanish = isSpanish(text);

  // 3. Split into chunks, to ensure we preserve punctuation
  const sections = split(text, PUNCTUATION_PATTERN);

  // 4. Convert each section to phonemes
  const ps = (await Promise.all(
    sections.map(async ({ match, text }) => {
      if (match) return text;
      
      if (hasDevanagari) {
        // Use the new mixed text phonemizer
        return await phonemizeMixedText(text);
      } else if (hasSpanish) {
        // Handle Spanish text
        let result = text.toLowerCase();
        // Replace digraphs first
        result = result.replace(/ch/g, 'tʃ')
                      .replace(/ll/g, 'ʎ')
                      .replace(/rr/g, 'r');
        // Then handle individual characters
        return Array.from(result)
          .map(char => SPANISH_PHONEME_MAP[char] || char)
          .join('');
      } else {
        // Use existing English phonemization
        const lang = language === "a" ? "en-us" : "en";
        return (await espeakng(text, lang)).join(" ");
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