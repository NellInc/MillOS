import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JevAdvisoryPanel } from './JevAdvisoryPanel';
import {
  JEV_CLIENT_CATALOG,
  JEV_RESULT_TTL_MS,
  requestJevAdvice,
  type JevAdvice,
} from '../../utils/jevClient';
import { KeyedError } from '../../utils/cloudAIClient';
import { setLocale } from '../../i18n';
import { useAIConfigStore } from '../../stores/aiConfigStore';

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

  // Cancel leaves with the pending state it ends, and focus fell to the page
  // body. It belongs back on the send button, which is usable again.
  it('returns focus to the send button when a request is cancelled', async () => {
    requestMock.mockReturnValue(new Promise<JevAdvice>(() => undefined));
    render(<JevAdvisoryPanel />);
    prepare();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send to Jev' }));
    });
    const cancelButton = screen.getByRole('button', { name: 'Cancel request' });
    cancelButton.focus();
    fireEvent.click(cancelButton);
    expect(screen.queryByRole('button', { name: 'Cancel request' })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Send to Jev' }));
  });

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

  // The panel kept a failure's resolved text, so after a switch to pt-BR its
  // alert stayed English. Working if a keyed failure reads in the language now.
  it('shows a kept failure in the language active now', async () => {
    requestMock.mockRejectedValue(
      new KeyedError('Request cancelled or timed out.', {
        catalog: JEV_CLIENT_CATALOG,
        key: 'cancelledOrTimedOut',
      })
    );
    render(<JevAdvisoryPanel />);
    prepare();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send to Jev' }));
    });
    const english = screen.getByRole('alert').textContent;
    act(() => setLocale('pt-BR'));
    try {
      expect(screen.getByRole('alert').textContent).not.toBe(english);
    } finally {
      act(() => setLocale('en'));
    }
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

describe('on-device advisory', () => {
  beforeEach(() => {
    requestMock.mockReset();
    useAIConfigStore.setState({ webgpuModelReady: false });
  });
  afterEach(() => {
    cleanup();
    useAIConfigStore.setState({ webgpuModelReady: false });
  });

  it('appears only while the local model is loaded and asks for no key or consent', async () => {
    render(<JevAdvisoryPanel />);
    expect(screen.queryByRole('radio', { name: /on this device/ })).not.toBeInTheDocument();
    act(() => useAIConfigStore.setState({ webgpuModelReady: true }));
    fireEvent.click(screen.getByRole('radio', { name: /on this device/ }));
    expect(screen.queryByLabelText('Your OpenRouter API key')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    const send = screen.getByRole('button', { name: 'Ask the on-device model' });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Incident text'), {
      target: { value: 'The pump is broken.' },
    });
    requestMock.mockResolvedValue(advice());
    await act(async () => {
      fireEvent.click(send);
    });
    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'local', apiKey: '', text: 'The pump is broken.' })
    );
    expect(screen.getByRole('status')).toHaveTextContent('Equipment maintenance');
  });

  it('falls back to Jev when the local model unloads', () => {
    useAIConfigStore.setState({ webgpuModelReady: true });
    render(<JevAdvisoryPanel />);
    fireEvent.click(screen.getByRole('radio', { name: /on this device/ }));
    act(() => useAIConfigStore.setState({ webgpuModelReady: false }));
    expect(screen.getByRole('button', { name: 'Send to Jev' })).toBeInTheDocument();
    expect(screen.getByLabelText('Your OpenRouter API key')).toBeInTheDocument();
  });

  // Forget key leaves with the key it forgets; focus fell to <body>.
  it('moves focus to the key field after Forget key', () => {
    render(<JevAdvisoryPanel />);
    const field = screen.getByLabelText('Your OpenRouter API key');
    fireEvent.change(field, { target: { value: key } });
    const forget = screen.getByRole('button', { name: 'Forget key' });
    forget.focus();
    fireEvent.click(forget);
    expect(screen.queryByRole('button', { name: 'Forget key' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText('Your OpenRouter API key'));
  });

  // Send disables itself while the request runs, and Cancel leaves when the
  // answer arrives: a keyboard player lost their place both times (a disabled
  // control, then <body>). Working if focus rides Send -> Cancel -> Send.
  it('keeps focus on a usable control while a request starts and when it answers', async () => {
    let answer: (value: JevAdvice) => void = () => undefined;
    requestMock.mockReturnValue(
      new Promise<JevAdvice>((resolve) => {
        answer = resolve;
      })
    );
    render(<JevAdvisoryPanel />);
    prepare();
    const sendButton = screen.getByRole('button', { name: 'Send to Jev' });
    sendButton.focus();
    await act(async () => {
      fireEvent.click(sendButton);
    });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel request' }));
    await act(async () => {
      answer(advice());
    });
    expect(screen.queryByRole('button', { name: 'Cancel request' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Send to Jev' }));
  });
});
