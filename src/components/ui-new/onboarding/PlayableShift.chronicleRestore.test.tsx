import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FirstDeliveryJourney, OperationsPlayCard } from './PlayableShift';
import { useUIStore } from '../../../stores/uiStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useChronicleStore } from '../../../stores/chronicleStore';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { recordOwnedIncident } from '../../../chronicle/engine';
import { setLocale } from '../../../i18n';
vi.mock('../../knowledge/LearningNote', () => ({ LearningNote: () => null }));

/*
 * Plan item 1.15 (report 02, defect 5), on the card: a Chronicle-raised
 * incident still open beside a ready programme names the Chronicle's Restore
 * controls, and the press asks for the Chronicle workspace.
 */

beforeEach(() => {
  setLocale('en');
  useWorkplaceStore.setState({ workplace: createWorkplace() });
  useUIStore.setState(useUIStore.getInitialState(), true);
  useChronicleStore.setState(useChronicleStore.getInitialState(), true);
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
});
afterEach(cleanup);

describe('the shift card routes a Chronicle incident to the Chronicle (1.15)', () => {
  it('the finished guided delivery names and opens it too', () => {
    raiseOwnedAndFinishProgramme();
    const handler = vi.fn();
    const onOpenWorkspace = vi.fn();
    window.addEventListener('millos:open-operations-workspace', handler);
    render(<FirstDeliveryJourney selectedMachine={null} onOpenWorkspace={onOpenWorkspace} />);
    expect(screen.getByText('Restore controls in the Mill Chronicle')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open Mill Chronicle' }));
    expect(handler.mock.calls.at(-1)?.[0].detail).toBe('chronicle');
    expect(onOpenWorkspace).not.toHaveBeenCalled();
    window.removeEventListener('millos:open-operations-workspace', handler);
  });

  it('names and opens the Chronicle restore', () => {
    raiseOwnedAndFinishProgramme();
    const handler = vi.fn();
    window.addEventListener('millos:open-operations-workspace', handler);
    render(<OperationsPlayCard />);
    expect(screen.queryByText(/remaining incident effects in SCADA/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Restore controls in the Mill Chronicle' }));
    expect(handler.mock.calls.at(-1)?.[0].detail).toBe('chronicle');
    window.removeEventListener('millos:open-operations-workspace', handler);
  });
});

/** A power sag the Chronicle raised, mitigated and taking effect; every order fulfilled. */
function raiseOwnedAndFinishProgramme() {
  const campaign = useOperationsCampaignStore.getState();
  const incident = campaign.triggerIncident('power_sag')!;
  campaign.acknowledgeIncident(incident.id);
  campaign.mitigateIncident(incident.id);
  campaign.markIncidentEffectApplied(incident.id);
  useOperationsCampaignStore.setState((s) => ({
    orders: s.orders.map((order) => ({ ...order, status: 'fulfilled' as const })),
  }));
  useChronicleStore.setState((s) => ({
    chronicle: recordOwnedIncident(s.chronicle, incident.id, incident.kind),
  }));
}
