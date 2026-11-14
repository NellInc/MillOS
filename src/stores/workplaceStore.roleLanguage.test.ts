import { afterEach, describe, expect, it } from 'vitest';
import { useWorkplaceStore } from './workplaceStore';
import { createWorkplace } from '../simulation/bilateralWorkplace';
import { setLocale } from '../i18n';

// Season roles are stored as text in the language active when written. A
// language switch must leave none in the old language: the store rewrites the
// members, archived reviews included, in the language chosen.
afterEach(() => setLocale('en'));

describe('season role names after a language switch', () => {
  it('reads every role in the language just chosen, and back again', () => {
    setLocale('en');
    useWorkplaceStore.setState({ workplace: createWorkplace() });
    const roles = () => useWorkplaceStore.getState().workplace.members.map((m) => m.role);
    expect(roles()).toEqual(['Packing', 'Quality', 'Maintenance', 'Coordinator']);
    setLocale('pt-BR');
    expect(roles()).toEqual(['Ensaque', 'Qualidade', 'Manutenção', 'Coordenação']);
    setLocale('en');
    expect(roles()).toEqual(['Packing', 'Quality', 'Maintenance', 'Coordinator']);
  });
});
