import { describe, expect, it } from 'vitest';
import { LOCALES } from '../i18n';
import {
  DEFAULT_PA_VOICE,
  PA_VOICE_GROUPS,
  PA_VOICES,
  isPAVoiceFor,
  paVoiceFor,
} from './paVoiceCatalog';

describe('PA voice catalogue', () => {
  it.each(LOCALES)('offers voices in %s, its default among them', (locale) => {
    const names = PA_VOICE_GROUPS[locale].flatMap((group) => PA_VOICES[group]);
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain(DEFAULT_PA_VOICE[locale]);
  });

  it('keeps each language to its own voices', () => {
    expect(isPAVoiceFor('en', 'Edwin')).toBe(true);
    expect(isPAVoiceFor('en', 'Débora')).toBe(false);
    expect(isPAVoiceFor('pt-BR', 'Débora')).toBe(true);
    expect(isPAVoiceFor('pt-BR', 'Edwin')).toBe(false);
  });

  it('falls back to the default for a missing or unknown choice', () => {
    expect(paVoiceFor('en', {})).toBe('Lottie');
    expect(paVoiceFor('en', { en: 'Zoey' })).toBe('Zoey');
    expect(paVoiceFor('pt-BR', { 'pt-BR': 'Edwin' })).toBe('Débora');
  });

  // D-055: the default became a female voice. Nothing is stored until the
  // player picks one, so an untouched save follows the new default and a
  // player who chose Edwin keeps him.
  it('moves an untouched save to Lottie and keeps a player who chose Edwin', () => {
    expect(DEFAULT_PA_VOICE).toEqual({ en: 'Lottie', 'pt-BR': 'Débora' });
    expect(paVoiceFor('en', {})).toBe('Lottie');
    expect(paVoiceFor('en', { en: 'Edwin' })).toBe('Edwin');
    expect(isPAVoiceFor('en', 'Edwin')).toBe(true);
  });
});
