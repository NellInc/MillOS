/**
 * The decision dialog carries the cause (mechanics review 08, F2): an echo's
 * "Because" line with the body, a variant's on its choice, and a choice the
 * record ruled out shown as gone with the ruling that removed it.
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChronicleEventHost } from './ChronicleEventHost';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { DEFAULT_CHARTER } from '../../chronicle/charter';
import { createInitialState, eventEcho, type ChronicleState } from '../../chronicle/engine';
import { EVENT_DECK } from '../../chronicle/eventDeck';
import { setLocale } from '../../i18n';
import type { DecisionMark } from '../../chronicle/types';

const chronicle = (): ChronicleState => useChronicleStore.getState().chronicle;
const mark = (id: string): DecisionMark => ({
  id,
  shift: 7,
  eventId: 'evt-court-short-weight',
  choiceId: 'terminate',
  actor: 'player',
});

/** Put one event on the desk, as it would appear with these marks on the record. */
function placeEvent(eventId: string, marks: string[]) {
  const withMarks: ChronicleState = {
    ...chronicle(),
    shift: 33,
    marks: Object.fromEntries(marks.map((id) => [id, mark(id)])),
  };
  const event = EVENT_DECK.find((candidate) => candidate.id === eventId)!;
  const echo = eventEcho(withMarks, event);
  act(() =>
    useChronicleStore.setState({
      chronicle: {
        ...withMarks,
        pendingEvents: [
          {
            instanceId: 'event-90',
            eventId,
            appearedShift: 33,
            lapsesShift: 35,
            ...(echo ? { echo } : {}),
          },
        ],
      },
    })
  );
}

describe('the decision dialog says why', () => {
  beforeEach(() => {
    useOperationsCampaignStore.getState().resetCampaign();
    useChronicleStore.setState({
      chronicle: createInitialState(),
      quiz: null,
      deferredPrompts: [],
    });
    act(() => useChronicleStore.getState().sign(DEFAULT_CHARTER, 4));
  });
  afterEach(() => {
    cleanup();
    setLocale('en');
  });

  it('shows the valley meeting’s because line with its body', () => {
    placeEvent('evt-valley-meeting', ['grower-terminated']);
    render(<ChronicleEventHost />);
    const dialog = screen.getByRole('dialog', { name: /The valley meeting/ });
    expect(dialog).toHaveTextContent(
      'Because the hail-struck farm’s contract was ended at arbitration.'
    );
    expect(dialog).toHaveTextContent(/The hill growers have come down to the meeting/);
  });

  it('shows the because line in Portuguese', () => {
    setLocale('pt-BR');
    placeEvent('evt-valley-meeting', ['grower-terminated']);
    render(<ChronicleEventHost />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(
      'Porque o contrato da fazenda atingida pelo granizo foi encerrado na arbitragem.'
    );
    expect(dialog).not.toHaveTextContent('Because the hail-struck');
  });

  it('shows a variant’s because line on its choice', () => {
    placeEvent('evt-valley-meeting', ['haulier-terminated']);
    render(<ChronicleEventHost />);
    const close = screen.getByRole('button', { name: /Close the meeting/ });
    expect(close).toHaveTextContent('Because Valley Haulage’s contract was ended at arbitration');
    expect(close).toHaveTextContent('Valley Haulage -8');
  });

  it('shows a choice the record ruled out as gone, with the ruling that removed it', () => {
    placeEvent('evt-quarry-haul', ['stone-bought', 'haulier-terminated']);
    render(<ChronicleEventHost />);
    const ask = screen.getByRole('button', { name: /^Ask Valley Haulage to make the runs/ });
    expect(ask).toBeDisabled();
    expect(ask).toHaveTextContent(
      'ruled out: ended Valley Haulage’s contract for the abandoned run'
    );
    expect(screen.getByRole('button', { name: /Hire quarry lorries/ })).toBeEnabled();
  });
});
