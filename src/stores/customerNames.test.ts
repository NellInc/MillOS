import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../i18n';
import { buildProgramme } from '../simulation/programmes';
import { useOperationsCampaignStore } from './operationsCampaignStore';
import { customerDisplayName, CUSTOMER_DISPLAY_KEYS } from './customerNames';

const storedNames = (): string[] => {
  useOperationsCampaignStore.getState().resetCampaign();
  const first = useOperationsCampaignStore.getState().orders;
  const later = [2, 3, 4, 5].flatMap((n) =>
    (['morning', 'afternoon', 'night'] as const).flatMap((shift) =>
      buildProgramme(first, n, shift, 0)
    )
  );
  return [...new Set([...first, ...later].map((order) => order.customer))];
};

// D17: the stored customer string is canonical (saves, the Chronicle's
// customerIdForName, agent text); what a player reads goes through one mapping.
describe('customer display names', () => {
  afterEach(() => setLocale('en'));

  it('covers every customer the campaign and its programmes carry, in both languages', () => {
    const names = storedNames();
    expect(names.length).toBeGreaterThan(0);
    for (const locale of ['en', 'pt-BR'] as const) {
      setLocale(locale);
      for (const name of names) {
        expect(Object.keys(CUSTOMER_DISPLAY_KEYS)).toContain(name);
        expect(customerDisplayName(name)).not.toBe('');
      }
    }
  });

  it('shows the maize-meal customer as a polenta kitchen, keeping the stored name', () => {
    expect(storedNames()).toContain('Community Pasta Works');
    for (const locale of ['en', 'pt-BR'] as const) {
      setLocale(locale);
      expect(customerDisplayName('Community Pasta Works')).toBe('Community Polenta Kitchen');
    }
  });

  it('passes an unknown name through unchanged', () => {
    expect(customerDisplayName('Hill Farm Shop')).toBe('Hill Farm Shop');
  });
});
