import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceLab } from './WorkplaceLab';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { createWorkplace, transitionWorkplace } from '../../../simulation/bilateralWorkplace';
import { campaignRecord } from '../../../simulation/workplaceCampaign';
import { endReplayClock } from '../../../simulation/workplaceReplayRuntime';
import type { WorkplaceMission } from '../../../types/workplace';
import { setLocale } from '../../../i18n';

vi.mock('../../../agent/client/executeAgentCommand', () => ({ executeAgentCommand: vi.fn() }));

const mission = (overrides: Partial<WorkplaceMission> = {}): WorkplaceMission => ({
  orderId: 'order-1',
  customer: 'Bakery',
  materialSessionId: 'session',
  startingShippedKg: 0,
  originalTargetKg: 6000,
  targetKg: 6000,
  observedShippedKg: 6000,
  creditedKg: 6000,
  manifestIds: [],
  evidence: 'current',
  ...overrides,
});

beforeEach(() => {
  setLocale('en');
  endReplayClock();
  useOperationsCampaignStore.setState({ orders: [], activeOrderId: null });
  useGameSimulationStore.getState().setGameSpeed(0);
  const started = transitionWorkplace(createWorkplace(), {
    type: 'startCampaign',
    args: ['cooperative', 17, mission({ creditedKg: 0, observedShippedKg: 0 })],
  }).state;
  const record = campaignRecord({ ...started, minute: 90, shippedKg: 1250 });
  useWorkplaceStore.setState({
    participationMode: 'solo',
    turn: null,
    workplace: {
      ...started,
      phase: 'review',
      minute: 90,
      campaign: {
        ...started.campaign!,
        shift: 1,
        mission: mission(),
        followOn: mission({
          orderId: 'order-2',
          customer: 'Mill shop',
          originalTargetKg: 3000,
          targetKg: 3000,
          observedShippedKg: 1250,
          creditedKg: 1250,
        }),
        history: [{ ...record, shift: 0 }],
      },
    },
  });
});
afterEach(() => {
  cleanup();
  setLocale('en');
});

// The Lab groups every kilogram figure the way the delivery lines do; the
// follow-on credit and the per-shift history still printed '1250.0 kg' beside
// 'credited 6,000.0 / 6,000 kg'. Working if both group their figures.
describe('kilogram figures in the Lab, fourteenth pass', () => {
  it('groups the follow-on credit and the shift history', () => {
    render(<WorkplaceLab />);
    expect(screen.getByText(/This season now works Mill shop/)).toHaveTextContent(
      '1,250.0 kg of its dispatch'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(screen.getByText(/^Shift 1: /)).toHaveTextContent(
      'shipped 1,250.0 kg during this shift'
    );
    expect(document.body.textContent).not.toMatch(/\b1250\.0 kg/);
    // The learning review beside the delivery line ('6,000.0 kg credited').
    expect(screen.getByText(/^Delivery record:/)).toHaveTextContent('6,000.0 kg credited');
    expect(document.body.textContent).not.toMatch(/\b6000(\.0)? kg/);
  });
});
