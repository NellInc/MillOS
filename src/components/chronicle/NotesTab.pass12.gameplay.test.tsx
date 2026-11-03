import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotesTab } from './NotesTab';
import { DEFAULT_CHARTER } from '../../chronicle/charter';
import { createInitialState, signCharter, type ChronicleState } from '../../chronicle/engine';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };

describe('The record in the Notes tab', () => {
  it('does not call what the year filed a lapsed decision', () => {
    const signed = signCharter(createInitialState(), DEFAULT_CHARTER, 11, baseline).state;
    const state: ChronicleState = {
      ...signed,
      marks: {
        'reserve-kept': {
          id: 'reserve-kept',
          shift: 63,
          eventId: 'reserve',
          choiceId: 'close',
          actor: 'chronicle',
        },
        'meeting-dismissed': {
          id: 'meeting-dismissed',
          shift: 30,
          eventId: 'evt-valley-meeting',
          choiceId: 'close',
          actor: 'chronicle',
        },
      },
    };
    render(<NotesTab state={state} />);
    const kept = screen.getByText(/Closed the chronicle with the co-op reserve in hand/);
    expect(kept.textContent).not.toMatch(/lapsed/);
    // A ruling that ran out is still named as one.
    expect(screen.getByText(/Closed the valley meeting unanswered/).textContent).toMatch(/lapsed/);
  });
});
