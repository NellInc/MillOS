import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useOperationsCampaignStore } from './operationsCampaignStore';
import { setLocale } from '../i18n';

// Seventh-pass campaign defects, reproduced through the store's own paths.

beforeEach(() => {
  setLocale('en');
  useOperationsCampaignStore.getState().resetCampaign();
});

afterEach(() => {
  setLocale('en');
  useOperationsCampaignStore.getState().resetCampaign();
});

describe('recipe names after a restore', () => {
  it('follow the active language once a saved shift is restored', () => {
    // A reload restores the campaign from the physical session record, which
    // is JSON: each recipe's label getter was frozen into a string in the
    // language active when the save was written.
    const saved = JSON.parse(JSON.stringify(useOperationsCampaignStore.getState().orders));
    expect(saved[0].recipe.label).toBe('Strong white bread flour');
    setLocale('pt-BR');
    useOperationsCampaignStore.setState({ orders: saved });
    const orders = useOperationsCampaignStore.getState().orders;
    expect(orders[0].recipe.label).toBe('Farinha de trigo forte para pão');
    expect(orders[1].recipe.label).toBe('Fubá');
  });

  it('follow the active language after a replay restores a structured clone', () => {
    const saved = structuredClone(useOperationsCampaignStore.getState().orders);
    useOperationsCampaignStore.setState({ orders: saved });
    setLocale('pt-BR');
    expect(useOperationsCampaignStore.getState().orders[2].recipe.label).toBe(
      'Farinha comunitária multiuso'
    );
  });
});
