import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MobilePanel } from './MobilePanel';
import { requestJevAdvice } from '../../utils/jevClient';

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: 'div',
    aside: 'aside',
  },
}));
vi.mock('../../stores/productionStore', () => ({
  useProductionStore: (selector: (state: unknown) => unknown) => selector({ aiDecisions: [] }),
}));
vi.mock('../../stores/uiStore', () => ({
  useUIStore: (selector: (state: unknown) => unknown) =>
    selector({ alerts: [{ title: 'Bearing fault', message: 'Needs inspection.' }] }),
}));
vi.mock('../../stores/gameSimulationStore', () => ({ useGameSimulationStore: vi.fn() }));
vi.mock('../../stores/safetyStore', () => ({ useSafetyStore: vi.fn() }));
vi.mock('../../stores/operationsCampaignStore', () => ({ useOperationsCampaignStore: vi.fn() }));
vi.mock('../ui/EmergencyStopButton', () => ({ EmergencyStopButton: () => null }));
vi.mock('../../utils/jevClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/jevClient')>()),
  requestJevAdvice: vi.fn(),
}));
const requestMock = vi.mocked(requestJevAdvice);
const key = `sk-or-v1-${'test-only-'.repeat(5)}`;
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Mobile AI advisory wiring', () => {
  it('keeps Decisions as the default and exposes the same reviewed-text advisory', () => {
    render(<MobilePanel isVisible content="ai" onClose={vi.fn()} />);
    expect(screen.getByText('No AI decisions yet')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Jev advisory' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Advisory' }));
    expect(screen.getByRole('tabpanel', { name: 'Advisory' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review latest alert' }));
    expect(screen.getByLabelText('Incident text')).toHaveValue('Bearing fault\nNeeds inspection.');
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('forgets the credential and consent on tab changes', () => {
    render(<MobilePanel isVisible content="ai" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Advisory' }));
    fireEvent.change(screen.getByLabelText('Your OpenRouter API key'), { target: { value: key } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('tab', { name: 'Decisions' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Advisory' }));
    expect(screen.getByLabelText('Your OpenRouter API key')).toHaveValue('');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('aborts advisory work when the mobile panel closes', () => {
    requestMock.mockImplementation(() => new Promise(() => {}));
    const onClose = vi.fn();
    const { rerender } = render(<MobilePanel isVisible content="ai" onClose={onClose} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Advisory' }));
    fireEvent.change(screen.getByLabelText('Your OpenRouter API key'), { target: { value: key } });
    fireEvent.change(screen.getByLabelText('Incident text'), {
      target: { value: 'Bearing fault.' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Send to Jev' }));
    const signal = requestMock.mock.calls[0][0].signal;
    rerender(<MobilePanel isVisible={false} content="ai" onClose={onClose} />);
    expect(signal.aborted).toBe(true);
  });
});
