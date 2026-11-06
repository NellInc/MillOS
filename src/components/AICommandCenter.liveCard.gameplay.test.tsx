import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AICommandCenter } from './AICommandCenter';
import { useProductionStore } from '../stores/productionStore';
import { useAIConfigStore } from '../stores/aiConfigStore';
import { useUIStore } from '../stores/uiStore';
import { setLocale } from '../i18n';
import type { AIDecision } from '../types';

vi.mock('../utils/onDeviceOperator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/onDeviceOperator')>()),
  initializeOnDeviceOperator: () => () => {},
}));
vi.mock('./AISettingsModal', () => ({ AISettingsModal: () => null }));
vi.mock('./ui/JevAdvisoryPanel', () => ({ JevAdvisoryPanel: () => null }));
vi.mock('./ui/OnDeviceOperatorRecord', () => ({ OnDeviceOperatorRecord: () => null }));

const card = (id: string): AIDecision => ({
  id,
  timestamp: new Date(),
  type: 'prediction',
  action: `Inspect the bearing on ${id}`,
  reasoning: 'Vibration is trending up.',
  confidence: 70,
  impact: 'Avoids an unplanned stop.',
  status: 'pending',
  priority: 'medium',
});

describe('the AI Partner panel reads the live decision list', () => {
  beforeEach(() => {
    setLocale('en');
    useUIStore.setState({ alerts: [] });
    useProductionStore.setState({ aiDecisions: [] });
    useAIConfigStore.getState().updateSystemStatus({ decisions: 0 });
  });
  afterEach(() => {
    cleanup();
    useProductionStore.setState({ aiDecisions: [] });
  });

  // The header's DEC readout came from the engine's 2-second status sample, so
  // a new card showed "Decisions (1)" on the tab beside "DEC 0" until the next
  // sample (and forever with the engine stopped). Working if both read the list.
  it('counts a new card in the header as the tab does', () => {
    render(<AICommandCenter isOpen onClose={() => {}} embedded />);
    act(() => {
      useProductionStore.getState().addAIDecision(card('rm-101'));
    });
    expect(screen.getByRole('tab', { name: /Decisions \(1\)/ })).toBeInTheDocument();
    expect(screen.getByTestId('ai-decisions-count')).toHaveTextContent('1');
  });

  // Inspect evidence opened a snapshot of the card: answered meanwhile (by the
  // agent, or a deferral returning or lapsing), the evidence still read
  // "pending, awaiting a response". Working if the open evidence follows it.
  it('keeps the open evidence in step with the card', () => {
    act(() => {
      useProductionStore.getState().addAIDecision(card('rm-102'));
    });
    render(<AICommandCenter isOpen onClose={() => {}} embedded />);
    fireEvent.click(screen.getByRole('button', { name: 'Inspect evidence' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Awaiting a response/)).toBeInTheDocument();

    act(() => {
      useProductionStore.getState().recordDecisionResponse('rm-102', 'rejected');
    });
    expect(within(screen.getByRole('dialog')).queryByText(/Awaiting a response/)).toBeNull();
    expect(within(screen.getByRole('dialog')).getByText('superseded')).toBeInTheDocument();
  });
});
