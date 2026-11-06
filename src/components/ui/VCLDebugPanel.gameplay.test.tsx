import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { VCLDebugPanel } from './VCLDebugPanel';
import { VCLDiffPanel } from './VCLDiffPanel';
import { useAIConfigStore } from '../../stores/aiConfigStore';
import { useUIStore } from '../../stores/uiStore';
import type { AlertData } from '../../types';

const alert = (overrides: Partial<AlertData>): AlertData => ({
  id: 'alert-1',
  type: 'critical',
  title: 'RM-101 bearing temperature',
  message: 'Bearing over limit',
  timestamp: new Date(),
  acknowledged: false,
  ...overrides,
});

// The live encoding's alarm field reads "N active critical alarms", but it
// counted every critical alert still listed, including ones the operator had
// acknowledged and ones whose condition had cleared: the panel said 2 while the
// alarm bell had none standing.
describe('the VCP alarm field', () => {
  const originalAlerts = useUIStore.getState().alerts;
  const originalShow = useAIConfigStore.getState().showVCLDebug;
  beforeEach(() => useAIConfigStore.setState({ showVCLDebug: true }));
  afterEach(() => {
    cleanup();
    useUIStore.setState({ alerts: originalAlerts });
    useAIConfigStore.setState({ showVCLDebug: originalShow });
  });

  it('counts only standing critical alarms', () => {
    useUIStore.setState({
      alerts: [
        alert({ id: 'acked', acknowledged: true }),
        alert({ id: 'cleared', returnedToNormal: true }),
        alert({ id: 'standing' }),
      ],
    });
    render(<VCLDebugPanel />);
    render(<VCLDiffPanel />);
    const encodings = screen.getAllByText(/\|🚨|\|✅0/);
    expect(encodings.length).toBeGreaterThan(0);
    for (const encoding of encodings) expect(encoding.textContent).toMatch(/\|🚨1$/);
  });

  it('reads clear when every critical alarm is acknowledged', () => {
    useUIStore.setState({ alerts: [alert({ id: 'acked', acknowledged: true })] });
    render(<VCLDebugPanel />);
    for (const encoding of screen.getAllByText(/\|🚨|\|✅0/))
      expect(encoding.textContent).toMatch(/\|✅0$/);
  });
});
