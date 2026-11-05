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

/** Even, firm voices that hold up through a band-limited tannoy. */
export const DEFAULT_PA_VOICE: Record<Locale, string> = {
  en: 'Edwin',
  'pt-BR': 'Débora',
};

export function isPAVoiceFor(locale: Locale, name: unknown): name is string {
  return (
    typeof name === 'string' &&
    PA_VOICE_GROUPS[locale].some((group) => PA_VOICES[group].includes(name))
  );
}

/** The player's choice for a language when it is one of its voices, else the default. */
export function paVoiceFor(locale: Locale, chosen: Partial<Record<Locale, string>>): string {
  const name = chosen[locale];
  return isPAVoiceFor(locale, name) ? name : DEFAULT_PA_VOICE[locale];
}
