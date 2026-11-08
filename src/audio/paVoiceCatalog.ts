import type { Locale } from '../i18n';

/**
 * The PA voices a player can pick, from Gradium's voice catalogue at the
 * revision phonon-webgpu pins (gradium/phonon-voices@0ee17205), so Settings can
 * list them before any model has downloaded. Names are proper names and are
 * never translated. If a later Phonon drops one, paVoice falls back to the
 * language's default.
 */
export type PAVoiceGroup = 'british' | 'american' | 'characters' | 'brazilian';

export const PA_VOICE_GROUPS: Record<Locale, readonly PAVoiceGroup[]> = {
  en: ['british', 'american', 'characters'],
  'pt-BR': ['brazilian'],
};

export const PA_VOICES: Record<PAVoiceGroup, readonly string[]> = {
  british: [
    'Alfie',
    'Bryony',
    'Edwin',
    'Elodie-Rose',
    'Freya',
    'Hugh',
    'Imogen',
    'Lottie',
    'Maeve',
    'Pippa',
    'Spencer',
    'Teddy',
    'Toby',
  ],
  american: [
    'Delia',
    'Easton',
    'Everly',
    'Hadley',
    'Harper',
    'Juniper',
    'Micah',
    'Miles',
    'Preston',
    'Russell',
    'Trevor',
    'Zoey',
  ],
  characters: [
    'Azgorath',
    'Captain Silas Blackwater',
    'Fairy Godmother',
    'Fennick the Young Elf',
    'Grub the Ogre',
    'Master Aldric',
    'Morwenna of the Deep',
    'Old Mortlake',
    'Sir Bramwell',
    'The Snow Queen',
    'The Thing Under the Stairs',
    'Vyrmathrax the Ancient',
  ],
  brazilian: [
    'Clarice',
    'Davi',
    'Débora',
    'Flávia',
    'Igor',
    'Isadora',
    'Kauã',
    'Manuela-Lu',
    'Marcelo',
    'Otávio',
    'Rafaela',
    'Vitor',
  ],
};

/**
 * Female voices that hold up through a band-limited tannoy. Lottie was chosen
 * by Nell by ear from rendered auditions of every female English voice through
 * the tannoy filter (D-056); Bryony, picked from the descriptions alone
 * (D-055), sounded flat next to the old male default. Débora: "low-set and resonant, with firm even phrasing and short
 * decisive sentences". A saved choice is only ever a voice the player picked
 * (Settings writes voiceNames on a change), so a player who never chose follows
 * this default, and one who picked Edwin keeps him.
 */
export const DEFAULT_PA_VOICE: Record<Locale, string> = {
  en: 'Lottie',
  'pt-BR': 'Débora',
};

export function isPAVoiceFor(locale: Locale, name: unknown): name is string {
  return (
    typeof name === 'string' &&
    PA_VOICE_GROUPS[locale].some((group) => PA_VOICES[group].includes(name))
  );
}

/** The player's choice for a language when it is one of its voices, else the default. */
/**
 * The two voices Settings offers per language, the default first. Nell chose
 * Lottie by ear and asked for Edwin, the previous male default, beside her
 * (D-061). A voice saved from the older full list still plays.
 */
export const FEATURED_PA_VOICES: Record<Locale, readonly [string, string]> = {
  en: ['Lottie', 'Edwin'],
  'pt-BR': ['Débora', 'Marcelo'],
};

export function paVoiceFor(locale: Locale, chosen: Partial<Record<Locale, string>>): string {
  const name = chosen[locale];
  return isPAVoiceFor(locale, name) ? name : DEFAULT_PA_VOICE[locale];
}
