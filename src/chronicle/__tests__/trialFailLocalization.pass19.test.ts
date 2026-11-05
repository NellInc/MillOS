import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../i18n';
import { localizedNotice } from '../presentation';
import type { ChronicleNotice } from '../types';

/**
 * trials.ts writes a dispatch trial's failure with English grouping
 * ('7,462 of 12,000 kg dispatched.'), and the read-time adapter only accepted
 * an ungrouped first figure, so every failure with 1,000 kg or more dispatched
 * (the usual case) stayed entirely in English for a Portuguese player.
 * Working if it renders in pt-BR with pt-BR grouping and the record is unchanged.
 */
describe('a failed dispatch trial in pt-BR', () => {
  afterEach(() => setLocale('en'));

  const notice = (body: string): ChronicleNotice => ({
    id: 'notice-1',
    shift: 4,
    kind: 'trial',
    title: 'The Bakers’ Rush: trial failed',
    body,
    relatedId: 'bakers_rush',
  });

  it('localises a grouped dispatch figure', () => {
    setLocale('pt-BR');
    const saved = notice('7,462 of 12,000 kg dispatched.');
    const local = localizedNotice(saved);
    expect(local.title).not.toBe(saved.title);
    expect(local.body).toBe('7.462 de 12.000 kg expedidos.');
    expect(saved.body).toBe('7,462 of 12,000 kg dispatched.');
  });

  it('still localises a figure under a thousand', () => {
    setLocale('pt-BR');
    expect(localizedNotice(notice('640 of 12,000 kg dispatched.')).body).toBe(
      '640 de 12.000 kg expedidos.'
    );
  });
});
