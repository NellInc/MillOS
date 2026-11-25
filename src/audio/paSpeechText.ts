import type { Locale } from '../i18n';

/**
 * Text for the PA voice. Phonon reads letters, not digits or symbols ("numbers
 * read best written as words"), so a caption is rewritten before it is spoken:
 * numbers in the locale's own format ("87.5" / "87,5", "6,000" / "6.000"),
 * percentages, pounds, clock times, dotted designations ("R.M. 101" is said
 * "roller mill one oh one") and a lone grade letter ("an A" is not "an a").
 * Anything not matched passes through unchanged. The caption on screen is
 * never touched.
 */

const EN_SMALL = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const EN_TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
];

const PT_SMALL = [
  'zero',
  'um',
  'dois',
  'três',
  'quatro',
  'cinco',
  'seis',
  'sete',
  'oito',
  'nove',
  'dez',
  'onze',
  'doze',
  'treze',
  'catorze',
  'quinze',
  'dezesseis',
  'dezessete',
  'dezoito',
  'dezenove',
];
const PT_TENS = [
  '',
  '',
  'vinte',
  'trinta',
  'quarenta',
  'cinquenta',
  'sessenta',
  'setenta',
  'oitenta',
  'noventa',
];
const PT_HUNDREDS = [
  '',
  'cento',
  'duzentos',
  'trezentos',
  'quatrocentos',
  'quinhentos',
  'seiscentos',
  'setecentos',
  'oitocentos',
  'novecentos',
];

/** Beyond this, digits are left as they are. */
const MAX_SPOKEN = 999_999_999;

function enUnderThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(`${EN_SMALL[hundreds]} hundred`);
  if (rest) {
    if (hundreds) parts.push('and');
    parts.push(
      rest < 20
        ? EN_SMALL[rest]
        : `${EN_TENS[Math.floor(rest / 10)]}${rest % 10 ? `-${EN_SMALL[rest % 10]}` : ''}`
    );
  }
  return parts.join(' ');
}

function enInteger(n: number): string {
  if (n === 0) return 'zero';
  const parts: string[] = [];
  let rest = n;
  for (const [scale, name] of [
    [1_000_000, 'million'],
    [1_000, 'thousand'],
  ] as const) {
    const count = Math.floor(rest / scale);
    if (count) parts.push(`${enUnderThousand(count)} ${name}`);
    rest %= scale;
  }
  if (rest) {
    if (parts.length && rest < 100) parts.push('and');
    parts.push(enUnderThousand(rest));
  }
  return parts.join(' ');
}

function ptUnderThousand(n: number, feminine: boolean): string {
  if (n === 100) return 'cem';
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds) {
    const word = PT_HUNDREDS[hundreds];
    parts.push(feminine && hundreds > 1 ? word.replace(/os$/, 'as') : word);
  }
  if (rest) {
    const unit = (u: number) =>
      feminine && u === 1 ? 'uma' : feminine && u === 2 ? 'duas' : PT_SMALL[u];
    parts.push(
      rest < 20
        ? unit(rest)
        : `${PT_TENS[Math.floor(rest / 10)]}${rest % 10 ? ` e ${unit(rest % 10)}` : ''}`
    );
  }
  return parts.join(' e ');
}

function ptInteger(n: number, feminine = false): string {
  if (n === 0) return 'zero';
  const parts: string[] = [];
  let rest = n;
  const millions = Math.floor(rest / 1_000_000);
  if (millions) {
    parts.push(millions === 1 ? 'um milhão' : `${ptUnderThousand(millions, false)} milhões`);
    rest %= 1_000_000;
  }
  const thousands = Math.floor(rest / 1_000);
  if (thousands) {
    parts.push(thousands === 1 ? 'mil' : `${ptUnderThousand(thousands, feminine)} mil`);
    rest %= 1_000;
  }
  if (rest) {
    // "mil e cem", "mil e vinte", but "mil duzentos e trinta".
    const joiner = parts.length && (rest < 100 || rest % 100 === 0) ? ' e ' : ' ';
    return `${parts.join(' ')}${parts.length ? joiner : ''}${ptUnderThousand(rest, feminine)}`;
  }
  return parts.join(' ');
}

function integerWords(n: number, locale: Locale, feminine = false): string {
  return locale === 'pt-BR' ? ptInteger(n, feminine) : enInteger(n);
}

function digitWords(digits: string, locale: Locale): string {
  return [...digits].map((d) => integerWords(Number(d), locale)).join(' ');
}

/** "87.5" reads "eighty-seven point five"; pt-BR "oitenta e sete vírgula cinco". */
function numberWords(whole: string, fraction: string | undefined, locale: Locale): string | null {
  const n = Number(whole);
  if (!Number.isSafeInteger(n) || n > MAX_SPOKEN) return null;
  const spoken = integerWords(n, locale);
  if (!fraction) return spoken;
  if (locale === 'pt-BR') {
    // "vírgula cinco", "vírgula vinte e cinco"; a leading zero reads digit by digit.
    const tail =
      fraction.startsWith('0') || fraction.length > 3
        ? digitWords(fraction, locale)
        : integerWords(Number(fraction), locale);
    return `${spoken} vírgula ${tail}`;
  }
  return `${spoken} point ${digitWords(fraction, locale)}`;
}

/** A number in the locale's written form: grouping and decimal marks swap. */
const NUMBER: Record<Locale, RegExp> = {
  en: /(?<![\w.,])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(?![\w])/g,
  'pt-BR': /(?<![\w.,])(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?(?![\w])/g,
};
const GROUP_MARK: Record<Locale, RegExp> = { en: /,/g, 'pt-BR': /\./g };

const PERCENT: Record<Locale, string> = { en: 'percent', 'pt-BR': 'por cento' };
const MINUS: Record<Locale, string> = { en: 'minus', 'pt-BR': 'menos' };
const UNITS: Record<Locale, Record<string, string>> = {
  en: {
    kg: 'kilograms',
    kw: 'kilowatts',
    rpm: 'R P M',
    h: 'hours',
    m: 'minutes',
  },
  'pt-BR': {
    kg: 'quilogramas',
    kw: 'quilowatts',
    rpm: 'R P M',
    h: 'horas',
    m: 'minutos',
  },
};

function replaceNumbers(text: string, locale: Locale): string {
  return text.replace(NUMBER[locale], (match, whole: string, fraction?: string) => {
    return numberWords(whole.replace(GROUP_MARK[locale], ''), fraction, locale) ?? match;
  });
}

function clockTime(hourText: string, minutes: number, locale: Locale): string | null {
  const hours = Number(hourText);
  if (hours > 23 || minutes > 59) return null;
  if (locale === 'pt-BR') {
    const h = integerWords(hours, locale, true);
    const unit = hours === 1 ? 'hora' : 'horas';
    return minutes === 0 ? `${h} ${unit}` : `${h} e ${integerWords(minutes, locale)}`;
  }
  // Midnight hour reads "zero hundred" / "zero oh five" (never "oh zero hundred").
  if (hours === 0) {
    if (minutes === 0) return 'zero hundred';
    return minutes < 10
      ? `zero oh ${integerWords(minutes, locale)}`
      : `zero ${integerWords(minutes, locale)}`;
  }
  // A written leading zero is spoken, as a 24-hour clock reads: "oh six hundred".
  const h = `${hourText.length === 2 && hours < 10 ? 'oh ' : ''}${integerWords(hours, locale)}`;
  if (minutes === 0) return `${h} hundred`;
  return minutes < 10
    ? `${h} oh ${integerWords(minutes, locale)}`
    : `${h} ${integerWords(minutes, locale)}`;
}

function pounds(amount: string, locale: Locale): string | null {
  const [whole, pence] = amount.split(locale === 'pt-BR' ? ',' : '.');
  const n = Number(whole.replace(GROUP_MARK[locale], ''));
  if (!Number.isSafeInteger(n) || n > MAX_SPOKEN) return null;
  const p = pence ? Number(pence.padEnd(2, '0').slice(0, 2)) : 0;
  if (locale === 'pt-BR') {
    const head = `${integerWords(n, locale, true)} ${n === 1 ? 'libra' : 'libras'}`;
    if (!p) return head;
    return p < 10
      ? `${head} e ${integerWords(p, locale)} pence`
      : `${head} e ${integerWords(p, locale)}`;
  }
  const head = `${integerWords(n, locale)} ${n === 1 ? 'pound' : 'pounds'}`;
  if (!p) return head;
  return p < 10 ? `${head} oh ${integerWords(p, locale)}` : `${head} ${integerWords(p, locale)}`;
}

/** A roller mill's designation as it is said on the floor. */
const ROLLER_MILL: Record<Locale, string> = { en: 'roller mill', 'pt-BR': 'moinho' };

/** "101" as a plant number: "one oh one", "one twelve"; pt-BR says "cento e um". */
function designationWords(digits: string, locale: Locale): string {
  if (locale === 'pt-BR' || digits.length !== 3) return integerWords(Number(digits), locale);
  const head = integerWords(Number(digits[0]), locale);
  const tail = Number(digits.slice(1));
  if (tail === 0) return `${head} hundred`;
  return digits[1] === '0'
    ? `${head} oh ${integerWords(tail, locale)}`
    : `${head} ${integerWords(tail, locale)}`;
}

/*
 * A capital letter standing alone at the end of a clause is a letter (a grade,
 * "Sifter A."), never the article; spelled as it is said, so "an A." is not
 * read as "an a". So is one that ends a machine name mid-sentence ("Sifter A
 * needs a look", "Sifter A's still down"): a lone capital straight after a
 * capitalised word. Only the letters a reader could take for a word are spelled.
 */
const LONE_LETTER: Record<Locale, Record<string, string>> = {
  en: { A: 'ay' },
  'pt-BR': { A: 'á', E: 'é' },
};

export function speakableText(text: string, locale: Locale): string {
  let out = text;
  // "R.M. 101" is said "roller mill one oh one", not "R M one hundred and one".
  out = out.replace(/\bR\.M\.\s?(\d{3})(?![\w])/g, (_match, digits: string) => {
    return `${ROLLER_MILL[locale]} ${designationWords(digits, locale)}`;
  });
  out = out.replace(/(?<=\s)([A-Z])(?=[.,!?;]|$)/g, (match, letter: string) => {
    return LONE_LETTER[locale][letter] ?? match;
  });
  out = out.replace(/(?<=\b[A-Z][a-z]+ )([A-Z])(?=\s|'s\b|’s\b)/g, (match, letter: string) => {
    return LONE_LETTER[locale][letter] ?? match;
  });
  // Clock times before plain numbers, so "14:05" is one time, not two numbers.
  out = out.replace(/(?<![\w:])(\d{1,2}):(\d{2})(?![\w:])/g, (match, h: string, m: string) => {
    return clockTime(h, Number(m), locale) ?? match;
  });
  out = out.replace(/£\s?(\d[\d.,]*\d|\d)/g, (match, amount: string) => {
    return pounds(amount, locale) ?? match;
  });
  out = out.replace(/(\d)\s?%/g, `$1 ${PERCENT[locale]}`);
  // Attached measurement units ("5000kg", "80kW", "1200RPM", "3h", "45m").
  out = out.replace(
    /(?<![\w.,])(\d[\d.,]*\d|\d)(kg|kW|RPM|h|m)(?![\w])/gi,
    (match, digits: string, unit: string) => {
      const spokenUnit = UNITS[locale][unit.toLowerCase()];
      return spokenUnit ? `${digits} ${spokenUnit}` : match;
    }
  );
  // Signed negative numbers ("-5", "-12.5").
  out = out.replace(/(?<![\w])-(\d)/g, `${MINUS[locale]} $1`);
  out = replaceNumbers(out, locale);
  // Spell AI / IA acronyms so pt-BR Phonon never reads "IA" as the verb "ia".
  if (locale === 'pt-BR') {
    out = out.replace(/\bIA\b/g, 'i á');
  } else {
    out = out.replace(/\bAI\b/g, 'A I');
  }
  // Dotted capitals ("R.M.") read as letters; preserve a sentence-ending stop.
  out = out.replace(/\b((?:[A-Z]\.){2,})($|\s+[A-Z])/g, (_match, abbr: string, tail: string) => {
    const spelled = abbr.replace(/\./g, ' ').trim();
    return tail === '' ? `${spelled}.` : `${spelled} ${tail.trimStart()}`;
  });
  out = out.replace(/\b((?:[A-Z]\.){2,})/g, (match) => match.replace(/\./g, ' ').trim() + ' ');
  // Dashes read as a pause.
  out = out.replace(/\s*[—–]\s*/g, ', ');
  return out.replace(/\s{2,}/g, ' ').trim();
}
