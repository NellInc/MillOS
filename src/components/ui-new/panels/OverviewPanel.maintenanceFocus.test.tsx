import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useUIStore } from '../../../stores/uiStore';
import { MaintenanceSection } from './OverviewPanel';

vi.mock('../../ui/PredictiveMaintenancePanel', () => ({
  PredictiveMaintenancePanel: () => <p>Work orders</p>,
}));

beforeEach(() => useUIStore.setState(useUIStore.getInitialState(), true));
afterEach(cleanup);

it('brings the maintenance section into view and focus when the shift card asks for it', async () => {
  const scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  useUIStore.getState().requestMaintenanceFocus();
  render(<MaintenanceSection />);
  const section = screen.getByRole('region', { name: 'Maintenance and repairs' });
  await waitFor(() => expect(section).toHaveFocus());
  expect(scrollIntoView).toHaveBeenCalled();
  expect(useUIStore.getState().maintenanceFocusRequested).toBe(false);
});

it('leaves focus alone when nothing asked for it', async () => {
  render(<MaintenanceSection />);
  await screen.findByText('Work orders');
  expect(screen.getByRole('region', { name: 'Maintenance and repairs' })).not.toHaveFocus();
});
