import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChronicleEventHost } from './ChronicleEventHost';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { DEFAULT_CHARTER } from '../../chronicle/charter';
import { createInitialState } from '../../chronicle/engine';

// A suspended mill's standing does not move until it is reinstated, so a choice
// button must not promise or threaten a standing change that cannot happen.
describe('Chronicle choices while the approval is suspended', () => {
  beforeEach(() => {
    useOperationsCampaignStore.getState().resetCampaign();
    useChronicleStore.setState({
      chronicle: createInitialState(),
      quiz: null,
      deferredPrompts: [],
    });
    act(() => useChronicleStore.getState().sign(DEFAULT_CHARTER, 4));
  });
  afterEach(() => cleanup());

  const showLotNotification = (suspended: boolean) =>
    act(() =>
      useChronicleStore.setState((s) => ({
        chronicle: {
          ...s.chronicle,
          shift: 8,
          certifier: suspended ? { score: 100, suspended: true } : s.chronicle.certifier,
          pendingEvents: [
            {
              instanceId: 'event-pass11',
              eventId: 'evt-lot-notification',
              appearedShift: 8,
              lapsesShift: 10,
            },
          ],
        },
      }))
    );

  it('names no standing change on a choice while suspended', () => {
    showLotNotification(true);
    render(<ChronicleEventHost />);
    const millOn = screen.getByRole('button', { name: /Mill it while/ });
    expect(millOn).not.toHaveTextContent(/standing/);
    expect(millOn).toHaveTextContent(/quality -2/);
  });

  it('still names it while the approval is in force', () => {
    showLotNotification(false);
    render(<ChronicleEventHost />);
    expect(screen.getByRole('button', { name: /Mill it while/ })).toHaveTextContent(
      /standing -0\.10/
    );
  });
});
