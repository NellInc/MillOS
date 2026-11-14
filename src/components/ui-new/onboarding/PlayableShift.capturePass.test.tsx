import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OperationsPlayCard, ShiftDebrief } from './PlayableShift';
import { playableShiftMessages } from './PlayableShift.messages';
import { operationsPlayMessages } from '../../../simulation/operationsPlay.messages';
import { useUIStore } from '../../../stores/uiStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { createTranslator, setLocale } from '../../../i18n';
vi.mock('../../knowledge/LearningNote', () => ({ LearningNote: () => null }));

// The capture pass (wave 2): the one action had two names, helper text sat
// under the customer select, the shipping step and the disabled accept, and
// at 1280x657 in Portuguese the third onward button was below the fold.

const campaign = () => useOperationsCampaignStore.getState();

beforeEach(() => {
  setLocale('en');
  useWorkplaceStore.setState({ workplace: createWorkplace() });
  useMaterialFlowStore.setState(useMaterialFlowStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
  useGameSimulationStore.setState({ gameSpeed: 30, clockHolds: [] });
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  campaign().initializeCampaign();
});
afterEach(() => {
  cleanup();
  setLocale('en');
});

function completeProgramme() {
  useOperationsCampaignStore.setState({
    orders: campaign().orders.map((order) => ({
      ...order,
      status: 'fulfilled' as const,
      shippedKg: order.requiredKg,
      completedAtMinute: 400,
    })),
    activeOrderId: null,
    elapsedMinutes: 480,
  });
}

describe('one name for accepting the next programme', () => {
  it.each(['en', 'pt-BR'] as const)('the card and the debrief agree in %s', (locale) => {
    expect(createTranslator(operationsPlayMessages, locale)('programmeLabel')).toBe(
      createTranslator(playableShiftMessages, locale)('acceptNextProgramme')
    );
  });

  it('names the card button as the debrief does', () => {
    completeProgramme();
    render(<OperationsPlayCard />);
    expect(
      screen.getByRole('button', { name: 'Accept next delivery programme' })
    ).toBeInTheDocument();
  });
});

describe('no helper text under the commitment controls', () => {
  it('shows no hint under the customer select', () => {
    render(<OperationsPlayCard />);
    expect(screen.getByText('Active customer commitment', { exact: false })).toBeInTheDocument();
    expect(screen.queryByText(/Changing customer changes/)).toBeNull();
  });

  it('shows no explanation under the shipping step', () => {
    useOperationsCampaignStore.setState({
      execution: {
        ...campaign().execution,
        stage: 'loading',
        qualityReleased: true,
        sourceInventoryKg: 5000,
      },
    });
    render(<OperationsPlayCard />);
    expect(screen.getByRole('button', { name: 'Check shipping in SCADA' })).toBeInTheDocument();
    expect(screen.queryByText(/Only material recorded/)).toBeNull();
  });

  it('shows no explanation under the production-line step', () => {
    render(<OperationsPlayCard />);
    expect(
      screen.getByRole('button', { name: 'Check the production line in SCADA' })
    ).toBeInTheDocument();
    expect(screen.queryByText(/Follow feedstock through mills/)).toBeNull();
  });

  it('still says what accepting the next programme creates', () => {
    completeProgramme();
    render(<OperationsPlayCard />);
    expect(screen.getByText(/Creates three customer commitments/)).toBeInTheDocument();
  });

  it('says why the debrief accept is refused only when it is pressed', () => {
    useOperationsCampaignStore.setState({
      reports: [
        {
          id: 'report-1',
          shiftKey: 'day-0-morning',
          shiftLabel: 'Day one',
          startedAtMinute: 0,
          endedAtMinute: 480,
          metrics: campaign().shiftMetrics,
          completedOrderIds: [],
          openRisks: [],
          grade: 'C',
          summary: 'Delivery remained open.',
          gradeReasons: [],
          decisions: [],
        },
      ],
    });
    render(<ShiftDebrief />);
    const accept = screen.getByRole('button', { name: 'Accept next delivery programme' });
    expect(accept).toHaveAttribute('aria-disabled', 'true');
    // Not on screen until pressed; a screen reader has it as the description.
    expect(screen.getByText(/Finish current customer commitments/)).not.toBeVisible();
    expect(accept).toHaveAccessibleDescription(/Finish current customer commitments/);
    const before = campaign().orders.length;
    fireEvent.click(accept);
    expect(screen.getByText(/Finish current customer commitments/)).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(/Finish current customer commitments/);
    expect(campaign().orders.length).toBe(before);
  });
});

describe('the completed programme card keeps its onward buttons together', () => {
  it('puts the three onward buttons before the long consequence', () => {
    completeProgramme();
    render(<OperationsPlayCard />);
    const charter = screen.getByRole('button', { name: 'Chronicle charter' });
    const consequence = screen.getByText(/Creates three customer commitments/);
    expect(
      charter.compareDocumentPosition(consequence) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});
