/**
 * With both floating dashboards and the sidebar open, the pair reached under
 * the sidebar at 1280 px. Working if the sidebar opening closes this one, and
 * opening this one with the sidebar open closes the energy dashboard.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { MultiObjectiveDashboard } from './MultiObjectiveDashboard';
import { useAIConfigStore } from '../../stores/aiConfigStore';

describe('the floating dashboards and the sidebar', () => {
  let root: HTMLDivElement;
  beforeEach(() => {
    root = document.createElement('div');
    root.setAttribute('data-sidebar-visible', 'false');
    document.body.appendChild(root);
  });
  afterEach(() => {
    cleanup();
    root.remove();
    useAIConfigStore.setState({ showMultiObjective: false, showEnergyDashboard: false });
  });

  it('closes this dashboard when the sidebar opens beside both', async () => {
    useAIConfigStore.setState({ showMultiObjective: true, showEnergyDashboard: true });
    render(<MultiObjectiveDashboard />);
    expect(useAIConfigStore.getState().showMultiObjective).toBe(true);
    act(() => root.setAttribute('data-sidebar-visible', 'true'));
    await waitFor(() => expect(useAIConfigStore.getState().showMultiObjective).toBe(false));
    expect(useAIConfigStore.getState().showEnergyDashboard).toBe(true);
  });

  it('closes the energy dashboard when this one opens beside the sidebar', () => {
    root.setAttribute('data-sidebar-visible', 'true');
    useAIConfigStore.setState({ showMultiObjective: true, showEnergyDashboard: true });
    render(<MultiObjectiveDashboard />);
    expect(useAIConfigStore.getState().showEnergyDashboard).toBe(false);
    expect(useAIConfigStore.getState().showMultiObjective).toBe(true);
  });
});
