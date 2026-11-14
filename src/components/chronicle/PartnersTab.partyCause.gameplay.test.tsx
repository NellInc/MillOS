/**
 * Plan item 1.3: an organisation's last changes include those a red line, a
 * quota or a policy made, each named by its cause in the current language.
 */
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PartnersTab } from './PartnersTab';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { DEFAULT_CHARTER } from '../../chronicle/charter';
import { createInitialState, type ChronicleState } from '../../chronicle/engine';
import { setLocale } from '../../i18n';
import { localizedStakeholderName } from '../../chronicle/stakeholders';

const chronicle = (): ChronicleState => useChronicleStore.getState().chronicle;

describe('organisations’ changes outside rulings', () => {
  beforeEach(() => {
    useOperationsCampaignStore.getState().resetCampaign();
    useChronicleStore.setState({ chronicle: createInitialState(), quiz: null });
    act(() => useChronicleStore.getState().sign(DEFAULT_CHARTER, 4));
  });
  afterEach(() => {
    cleanup();
    setLocale('en');
  });

  const history = (): ChronicleState => ({
    ...chronicle(),
    eventHistory: [
      { eventId: 'evt-court-short-weight', shift: 6, choiceId: 'terminate', actor: 'player' },
    ],
    governance: {
      ...chronicle().governance,
      partyChanges: [
        {
          party: 'growers',
          shift: 9,
          delta: 6,
          cause: { kind: 'policy', ladder: 'intake', rung: 2 },
        },
        { party: 'federation', shift: 18, delta: 6, cause: { kind: 'quota', met: true, year: 1 } },
        {
          party: 'federation',
          shift: 27,
          delta: -6,
          cause: { kind: 'quota', met: false, year: 2 },
        },
        {
          party: 'growers',
          shift: 30,
          delta: -15,
          cause: { kind: 'red-line', ladder: 'intake', rung: 0 },
        },
      ],
    },
  });

  it('names each cause beside its change, newest first', () => {
    render(<PartnersTab state={history()} />);
    const growers = within(screen.getByRole('group', { name: 'Growers’ cooperative' }));
    const changes = growers.getAllByRole('listitem');
    expect(changes).toHaveLength(3);
    expect(changes[0]).toHaveTextContent('Warning acted on: Intake, any lot');
    expect(changes[0]).toHaveTextContent('-15');
    expect(changes[1]).toHaveTextContent('Intake: Contracted growers only');
    expect(changes[1]).toHaveTextContent('+6');
    expect(changes[2]).toHaveTextContent('The short-weighted lots');
    const federation = within(screen.getByRole('group', { name: 'Regional federation' }));
    const returns = federation.getAllByRole('listitem');
    expect(returns[0]).toHaveTextContent('Crop year 3 return: quota missed');
    expect(returns[0]).toHaveTextContent('-6');
    expect(returns[1]).toHaveTextContent('Crop year 2 return: quota met');
    expect(returns[1]).toHaveTextContent('+6');
  });

  it('names them in Portuguese', () => {
    setLocale('pt-BR');
    render(<PartnersTab state={history()} />);
    const growers = screen.getByRole('group', { name: localizedStakeholderName('growers') });
    expect(within(growers).getAllByRole('listitem')).toHaveLength(3);
    expect(growers).not.toHaveTextContent('Warning acted on');
    expect(growers).not.toHaveTextContent('Contracted growers only');
    const federation = screen.getByRole('group', {
      name: localizedStakeholderName('federation'),
    });
    expect(federation).not.toHaveTextContent('quota');
    expect(within(federation).getAllByRole('listitem')).toHaveLength(2);
  });
});
