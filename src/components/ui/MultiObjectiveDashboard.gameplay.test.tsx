import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MultiObjectiveDashboard } from './MultiObjectiveDashboard';
import { useAIConfigStore } from '../../stores/aiConfigStore';
import { useProductionStore } from '../../stores/productionStore';

describe('the multi-objective dashboard', () => {
  const originalMetrics = useProductionStore.getState().metrics;
  const originalMachines = useProductionStore.getState().machines;
  const originalShow = useAIConfigStore.getState().showMultiObjective;

  beforeEach(() => {
    useAIConfigStore.setState({ showMultiObjective: true });
    useProductionStore.setState({ machines: [] });
  });
  afterEach(() => {
    cleanup();
    useAIConfigStore.setState({ showMultiObjective: originalShow });
    useProductionStore.setState({ metrics: originalMetrics, machines: originalMachines });
  });

  // metrics.quality is the latest QC grade, and a FAIL scores 0. `quality || 95`
  // read that failure as 95%, a passing figure beside a failed QC lab.
  it('shows a failed QC grade as 0% quality, not the 95% placeholder', () => {
    useProductionStore.setState({
      metrics: { ...originalMetrics, quality: 0, throughput: 0 },
    });
    render(<MultiObjectiveDashboard />);
    const quality = screen.getByText('Quality').parentElement as HTMLElement;
    expect(quality).toHaveTextContent('0%');
    expect(quality).not.toHaveTextContent('95%');
  });
});
