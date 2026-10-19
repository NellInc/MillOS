import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MobilePanel } from './MobilePanel';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { useMaterialFlowStore, type ProductionBatch } from '../../stores/materialFlowStore';
import { useQCLabStore } from '../../stores/qcLabStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: { div: 'div', aside: 'aside' },
}));

beforeEach(() => {
  useOperationsCampaignStore.getState().resetCampaign();
  useMaterialFlowStore.getState().resetMaterialFlow();
  useQCLabStore.getState().resetQCLab();
});
afterEach(cleanup);

describe('compact operating controls', () => {
  it('opens the shared protected logistics workspace from the mobile overview', () => {
    const open = vi.fn();
    window.addEventListener('millos:open-layout-planner', open);
    render(<MobilePanel isVisible content="overview" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Plan logistics' }));
    expect(open).toHaveBeenCalledOnce();
    window.removeEventListener('millos:open-layout-planner', open);
  });
  it('activates the actual customer recipe instead of a read-only SCADA summary', () => {
    const order = useOperationsCampaignStore.getState().orders[1];
    render(<MobilePanel isVisible content="overview" onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Active customer commitment', { exact: false }), {
      target: { value: order.id },
    });
    expect(useOperationsCampaignStore.getState().getActiveProductionPlan()).toMatchObject({
      orderId: order.id,
      sourceMaterial: order.recipe.sourceMaterial,
    });
  });

  it('exposes the same real batch hold authority without changing physical mass', () => {
    const batch: ProductionBatch = {
      id: 'batch-compact',
      packerId: 'packer-0',
      materialType: 'flour',
      producedKg: 100,
      availableKg: 100,
      simulationTime: 1,
      sourceContributions: [],
      disposition: 'released',
      dispositionReason: 'Fixture release',
      qcTestIds: [],
      dispatchManifestIds: [],
      sealed: true,
    };
    useMaterialFlowStore.setState({ productionBatches: [batch] });
    render(<MobilePanel isVisible content="overview" onClose={vi.fn()} />);
    const details = screen.getByText('Batch quality and traceability').closest('details')!;
    details.open = true;
    const controls = within(details);
    fireEvent.click(controls.getByRole('button', { name: 'Place hold' }));
    expect(useMaterialFlowStore.getState().productionBatches[0]).toMatchObject({
      disposition: 'hold',
      producedKg: 100,
      availableKg: 100,
    });
    expect(controls.getByRole('button', { name: 'Retest and release' })).toBeInTheDocument();
    expect(useQCLabStore.getState().qcLab.contaminationAlerts[0].batchIds).toEqual([batch.id]);
  });

  it('shows the pace a handoff hold resumes at, with the same hold note as Shift pace', () => {
    try {
      // A handoff decision holds the clock; 2x was chosen meanwhile.
      useGameSimulationStore.setState({
        gameSpeed: 0,
        clockHolds: [{ holder: 'handoff', resumeSpeed: 60 }],
      });
      render(<MobilePanel isVisible content="overview" onClose={vi.fn()} />);
      const group = screen.getByRole('group', { name: /The pace runs the whole plant/ });
      const buttons = within(group);
      expect(buttons.getByRole('button', { name: 'Fast, 2x' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      expect(buttons.getByRole('button', { name: 'Paused, inspect freely' })).toHaveAttribute(
        'aria-pressed',
        'false'
      );
      expect(
        within(group.parentElement!).getByText(/Held while the team decides the handoff experiment/)
      ).toBeInTheDocument();
    } finally {
      useGameSimulationStore.setState({ gameSpeed: 30, clockHolds: [] });
    }
  });
});
