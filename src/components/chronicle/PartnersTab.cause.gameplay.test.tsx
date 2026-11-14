/**
 * Each organisation shows where it stands against the tier lines and the last
 * rulings that moved it (mechanics review 08, F2).
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

describe('organisations show why and against what', () => {
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
      { eventId: 'evt-valley-meeting', shift: 33, choiceId: 'close', actor: 'player' },
    ],
  });

  it('lists the growers’ last changes with their causes, and the 34 and 67 lines', () => {
    render(<PartnersTab state={history()} />);
    const growers = screen.getByRole('group', { name: 'Growers’ cooperative' });
    const changes = within(growers).getAllByRole('listitem');
    expect(changes).toHaveLength(2);
    expect(changes[0]).toHaveTextContent('The valley meeting: Close the meeting');
    expect(changes[0]).toHaveTextContent('-8');
    expect(changes[1]).toHaveTextContent('The short-weighted lots');
    expect(changes[1]).toHaveTextContent('-10');
    expect(within(growers).getByText('34')).toBeInTheDocument();
    expect(within(growers).getByText('67')).toBeInTheDocument();
    const village = screen.getByRole('group', { name: 'Village committee' });
    expect(within(village).getAllByRole('listitem')).toHaveLength(1);
    const federation = screen.getByRole('group', { name: 'Regional federation' });
    expect(within(federation).queryAllByRole('listitem')).toHaveLength(0);
  });

  it('names the causes in Portuguese', () => {
    setLocale('pt-BR');
    render(<PartnersTab state={history()} />);
    const growers = screen.getByRole('group', { name: localizedStakeholderName('growers') });
    expect(growers).not.toHaveTextContent('The valley meeting');
    expect(within(growers).getAllByRole('listitem')).toHaveLength(2);
  });
});
