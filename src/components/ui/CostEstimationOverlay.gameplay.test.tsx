import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CostEstimationOverlay } from './CostEstimationOverlay';
import { useAIConfigStore } from '../../stores/aiConfigStore';

describe('the BYOK usage overlay', () => {
  const original = useAIConfigStore.getState();
  beforeEach(() => {
    useAIConfigStore.setState({
      showCostOverlay: true,
      llmBackend: 'haiku',
      costTracking: {
        ...original.costTracking,
        sessionCost: 0,
        reservedCost: 0,
        uncertainCost: 0.00002,
        requestCount: 0,
      },
    });
  });
  afterEach(() => {
    cleanup();
    useAIConfigStore.setState({
      showCostOverlay: original.showCostOverlay,
      llmBackend: original.llmBackend,
      aiMode: original.aiMode,
      costTracking: original.costTracking,
    });
  });

  // A Jev advisory costs about $0.00002; four fixed digits read it as zero.
  it('shows a small in-flight or uncertain charge instead of $0.0000', () => {
    render(<CostEstimationOverlay />);
    expect(screen.getByText(/\$0\.000020 in flight or uncertain/)).toBeInTheDocument();
  });

  // With the on-device model loaded the card read a grey 'Disconnected' while
  // the AI panel's badge read Local in green for the same state.
  it('reads Connected while the on-device model is serving', () => {
    useAIConfigStore.setState({ llmBackend: 'webgpu', webgpuModelReady: true });
    try {
      render(<CostEstimationOverlay />);
      expect(screen.getByText('Connected')).toBeInTheDocument();
    } finally {
      useAIConfigStore.setState({ webgpuModelReady: original.webgpuModelReady });
    }
  });

  // 'gemini' is only the persisted id of LLM-only mode; no Gemini model runs.
  it('names LLM-only mode rather than its legacy persisted id', () => {
    useAIConfigStore.setState({ aiMode: 'gemini' });
    render(<CostEstimationOverlay />);
    expect(screen.queryByText(/gemini/i)).not.toBeInTheDocument();
    expect(screen.getByText('LLM only')).toBeInTheDocument();
  });
});

// The session length was read from Date.now() at render, and the overlay only
// re-renders on a charge: with no new call it read "(0m)" an hour later.
describe('the BYOK usage overlay session length', () => {
  const original = useAIConfigStore.getState();
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    useAIConfigStore.setState({
      showCostOverlay: original.showCostOverlay,
      costTracking: original.costTracking,
    });
  });

  it('keeps counting while no charge arrives', async () => {
    vi.useFakeTimers();
    useAIConfigStore.setState({
      showCostOverlay: true,
      costTracking: { ...original.costTracking, sessionStartTime: Date.now() },
    });
    render(<CostEstimationOverlay />);
    expect(screen.getByText(/\(0m\)/)).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });
    expect(screen.getByText(/\(5m\)/)).toBeInTheDocument();
  });
});
