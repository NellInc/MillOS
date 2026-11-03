import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { turnChecks } from '../../../simulation/workplaceParticipation';
import { WorkplaceParticipation } from './WorkplaceParticipation';
import { setLocale } from '../../../i18n';

beforeEach(() => {
  useWorkplaceStore.setState({
    workplace: createWorkplace(),
    participationMode: 'solo',
    turn: null,
  });
});
afterEach(() => {
  cleanup();
  setLocale('en');
});

it.each([
  ['en', 'Turn check'],
  ['pt-BR', 'Verificação da vez'],
] as const)('names each turn check by its question, not its id, in %s', (locale, prefix) => {
  setLocale(locale);
  const get = () => useWorkplaceStore.getState();
  get().setParticipationMode('separate-turns');
  get().start('workshop', 17);
  get().startTurn('packing');
  render(<WorkplaceParticipation report={() => {}} />);
  for (const q of turnChecks(get().workplace)) {
    expect(screen.getByRole('combobox', { name: `${prefix}: ${q.prompt}` })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: `${prefix}: ${q.id}` })).toBeNull();
  }
});
