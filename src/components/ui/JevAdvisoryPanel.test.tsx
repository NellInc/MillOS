import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JevAdvisoryPanel } from './JevAdvisoryPanel';
import { JEV_RESULT_TTL_MS, requestJevAdvice, type JevAdvice } from '../../utils/jevClient';

vi.mock('../../utils/jevClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/jevClient')>()),
  requestJevAdvice: vi.fn(),
}));
const requestMock = vi.mocked(requestJevAdvice);
const key = `sk-or-v1-${'test-only-'.repeat(5)}`;
function prepare() {
  fireEvent.change(screen.getByLabelText('Your OpenRouter API key'), { target: { value: key } });
  fireEvent.change(screen.getByLabelText('Incident text'), {
    target: { value: 'The pump is broken.' },
  });
  fireEvent.click(screen.getByRole('checkbox'));
}
const advice = (): JevAdvice => ({ queue: 'Equipment maintenance', receivedAt: Date.now() });

describe('Jev advisory consent and lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    requestMock.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('makes no requests by default, imports alerts for review only, and requires key, text and consent', () => {
    render(<JevAdvisoryPanel latestAlert="Review this alert" />);
    expect(screen.getByRole('button', { name: 'Send to Jev' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Review latest alert' }));
    expect(screen.getByLabelText('Incident text')).toHaveValue('Review this alert');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(requestMock).not.toHaveBeenCalled();
    prepare();
    expect(screen.getByRole('button', { name: 'Send to Jev' })).toBeEnabled();
  });

  it('renders read-only advice without action controls or confidence scores; editing invalidates it', async () => {
    requestMock.mockResolvedValue(advice());
    render(<JevAdvisoryPanel />);
    prepare();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send to Jev' }));
    });
    expect(screen.getByRole('status')).toHaveTextContent('Equipment maintenance');
    expect(screen.getByRole('status')).toHaveTextContent('cannot clear an incident');
    expect(
      screen.queryByRole('button', { name: /accept|apply|clear incident/i })
    ).not.toBeInTheDocument();
    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: key, text: 'The pump is broken.', consent: true })
    );
    fireEvent.change(screen.getByLabelText('Incident text'), { target: { value: 'New evidence' } });
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('limits admission to one request and ignores a late response after cancellation', async () => {
    let finish!: (value: JevAdvice) => void;
    requestMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    render(<JevAdvisoryPanel />);
    prepare();
    fireEvent.click(screen.getByRole('button', { name: 'Send to Jev' }));
    fireEvent.click(screen.getByRole('button', { name: 'Requesting advice...' }));
    expect(requestMock).toHaveBeenCalledTimes(1);
    const signal = requestMock.mock.calls[0][0].signal;
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }));
    expect(signal.aborted).toBe(true);
    await act(async () => finish(advice()));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it.each(['forget', 'consent', 'edit', 'unmount'])(
    'cancels outstanding advice on %s',
    async (action) => {
      requestMock.mockImplementation(() => new Promise(() => {}));
      const { unmount } = render(<JevAdvisoryPanel />);
      prepare();
      fireEvent.click(screen.getByRole('button', { name: 'Send to Jev' }));
      const signal = requestMock.mock.calls[0][0].signal;
      if (action === 'forget') {
        fireEvent.click(screen.getByRole('button', { name: 'Forget key' }));
        expect(screen.getByLabelText('Your OpenRouter API key')).toHaveValue('');
        expect(screen.getByRole('checkbox')).not.toBeChecked();
      } else if (action === 'consent') fireEvent.click(screen.getByRole('checkbox'));
      else if (action === 'edit')
        fireEvent.change(screen.getByLabelText('Incident text'), { target: { value: 'Changed' } });
      else unmount();
      expect(signal.aborted).toBe(true);
    }
  );

  it('expires advice and does not persist a key across remounts', async () => {
    requestMock.mockResolvedValue(advice());
    const { unmount } = render(<JevAdvisoryPanel />);
    prepare();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send to Jev' }));
    });
    await act(async () => {
      vi.advanceTimersByTime(JEV_RESULT_TTL_MS);
    });
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(Object.values(localStorage).join('')).not.toContain(key);
    expect(Object.values(sessionStorage).join('')).not.toContain(key);
    unmount();
    render(<JevAdvisoryPanel />);
    expect(screen.getByLabelText('Your OpenRouter API key')).toHaveValue('');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('shows failures without silently retrying', async () => {
    requestMock.mockRejectedValue(new Error('OpenRouter requires more credit for this request.'));
    render(<JevAdvisoryPanel />);
    prepare();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send to Jev' }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('requires more credit');
    expect(requestMock).toHaveBeenCalledTimes(1);
  });
});
