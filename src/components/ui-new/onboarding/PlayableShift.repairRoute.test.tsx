import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FirstDeliveryJourney } from './PlayableShift';
import { useCameraStore } from '../../CameraController';
import { useUIStore } from '../../../stores/uiStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useBreakdownStore, type MaintenanceWorkOrder } from '../../../stores/breakdownStore';
vi.mock('../../knowledge/LearningNote', () => ({ LearningNote: () => null }));

beforeEach(() => {
  useCameraStore.setState(useCameraStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
  useBreakdownStore.setState(useBreakdownStore.getInitialState(), true);
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
});
afterEach(cleanup);

// A breakdown turns the guide to the repair and its button opens Overview at
// Maintenance. Labelled "Open Overview and QC" (compact: "Review delivery and
// QC"), it promised a quality review the player would not find there.
it('names Overview, not a QC review, on the button that opens a repair', () => {
  const state = useOperationsCampaignStore.getState();
  useOperationsCampaignStore.setState({
    execution: { ...state.execution, orderId: state.activeOrderId, stage: 'milling' },
  });
  useBreakdownStore.setState({
    workOrders: [
      {
        id: 'wo-00001',
        machineName: 'R.M. 101',
        phase: 'repairing',
      } as unknown as MaintenanceWorkOrder,
    ],
  });
  useUIStore.getState().startDeliveryJourney(state.activeOrderId);
  useUIStore.getState().recordMachineInspection('rm-101');
  const open = vi.fn();
  render(<FirstDeliveryJourney selectedMachine={null} onOpenWorkspace={open} />);
  expect(screen.getByRole('heading', { name: 'Repair R.M. 101' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /QC/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open Overview' }));
  expect(open).toHaveBeenLastCalledWith('overview');
  expect(useUIStore.getState().maintenanceFocusRequested).toBe(true);

  fireEvent.click(screen.getByRole('button', { name: 'Compact delivery guide' }));
  expect(screen.queryByRole('button', { name: /QC/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open Overview' }));
  expect(open).toHaveBeenCalledTimes(2);
});

// The quality hold is the step the QC wording belongs to; it keeps it.
it('keeps the QC wording on the quality-hold step', () => {
  const state = useOperationsCampaignStore.getState();
  useOperationsCampaignStore.setState({
    execution: { ...state.execution, orderId: state.activeOrderId, stage: 'quality_hold' },
  });
  useUIStore.getState().startDeliveryJourney(state.activeOrderId);
  useUIStore.getState().recordMachineInspection('rm-101');
  render(<FirstDeliveryJourney selectedMachine={null} onOpenWorkspace={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Open Overview and QC' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Compact delivery guide' }));
  expect(screen.getByRole('button', { name: 'Review delivery and QC' })).toBeInTheDocument();
});
