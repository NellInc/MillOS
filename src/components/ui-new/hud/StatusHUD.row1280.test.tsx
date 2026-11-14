import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StatusHUD } from './StatusHUD';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useProductionStore } from '../../../stores/productionStore';
import { useUIStore } from '../../../stores/uiStore';
import { setLocale } from '../../../i18n';

// The capture pass put the HUD in a real browser at 1280x720 and found the
// commitment cut to "Community Pasta Works · 0 / 4,..." and the result line to
// "Achievemen...". The commitment is what the row is for: the bag rate goes,
// then safety, then the programme shortens to figures, and the commitment is
// never truncated. Working if the row gives way in that order and the
// commitment's text carries no truncation.

const campaign = () => useOperationsCampaignStore.getState();
const originalMetrics = useProductionStore.getState().metrics;

beforeEach(() => {
  setLocale('en');
  campaign().resetCampaign();
  useGameSimulationStore.getState().resetGameState();
  useUIStore.setState({ alerts: [], journeyVisible: false });
  useProductionStore.setState((state) => ({ metrics: { ...state.metrics, throughput: 917 } }));
});
afterEach(() => {
  cleanup();
  setLocale('en');
  campaign().resetCampaign();
  useProductionStore.setState({ metrics: originalMetrics });
});

const commitmentText = () =>
  screen.getByText("Riverside Bakers' Cooperative · 0 / 6,000 kg · Due in 4h 0m (simulated)");

/**
 * jsdom has no layout. Overflow is read from the metrics row's scrollWidth
 * against its clientWidth, so the row reports an overflow while `overflowing`
 * says so for what is on screen now.
 */
function fakeRowOverflow(overflowing: () => boolean) {
  const scroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth');
  const client = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.dataset.hudMetrics !== undefined && overflowing() ? 1200 : 900;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 900,
  });
  // jsdom defines both on Element.prototype: put back an own one, else delete ours.
  return () => {
    if (scroll) Object.defineProperty(HTMLElement.prototype, 'scrollWidth', scroll);
    else delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
    if (client) Object.defineProperty(HTMLElement.prototype, 'clientWidth', client);
    else delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  };
}

describe('the HUD row at 1280 px', () => {
  it('shows no bags-per-hour rate: the target is tonnes', () => {
    render(<StatusHUD />);
    expect(screen.queryByLabelText(/bags per hour/)).toBeNull();
    expect(screen.queryByText(/bags\/h/)).toBeNull();
    act(() => setLocale('pt-BR'));
    expect(screen.queryByText(/sacos\/h/)).toBeNull();
  });

  it('never truncates the commitment', () => {
    render(<StatusHUD />);
    const text = commitmentText();
    expect(text.className).not.toMatch(/\btruncate\b/);
    expect(text.className).toMatch(/whitespace-nowrap/);
    expect(text.closest('button')!.className).toMatch(/\bshrink-0\b/);
  });

  it('gives way with safety first, then the programme to figures', () => {
    // Overflowing while safety shows; fits once it is gone.
    const restore = fakeRowOverflow(() => document.body.textContent!.includes('% safety'));
    try {
      render(<StatusHUD />);
      expect(screen.queryByText(/% safety$/)).toBeNull();
      expect(screen.getByText('Programme 0.0 / 18.0 t')).toBeInTheDocument();
      expect(commitmentText()).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it('shortens the programme to figures when hiding safety is not enough', () => {
    const restore = fakeRowOverflow(() => document.body.textContent!.includes('Programme '));
    try {
      render(<StatusHUD />);
      expect(screen.queryByText(/% safety$/)).toBeNull();
      expect(screen.queryByText(/Programme/)).toBeNull();
      expect(screen.getByText('0.0 / 18.0 t')).toBeInTheDocument();
      // The full reading stays in the label.
      expect(
        screen.getByLabelText('Programme commitment: 0.0 of 18.0 tonnes shipped')
      ).toBeInTheDocument();
      expect(commitmentText()).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  // The idle chip now names its reason and never truncates. In Portuguese at
  // 1280 px the row gives way around it: safety, then the programme word,
  // and the commitment still reads on one line (it wraps only at the last
  // level). jsdom has no layout, so the overflow is faked as above.
  it('in Portuguese keeps the idle chip whole and the commitment on one line', () => {
    act(() => setLocale('pt-BR'));
    useProductionStore.setState((state) => ({ metrics: { ...state.metrics, throughput: 0 } }));
    const execution = campaign().execution;
    useOperationsCampaignStore.setState({
      execution: {
        ...execution,
        orderId: 'order-001',
        stage: 'dispatched',
        remainingKg: 1000,
        finishedAvailableKg: 999.5,
      },
    });
    const restore = fakeRowOverflow(() => document.body.textContent!.includes('Programa '));
    try {
      render(<StatusHUD />);
      const chip = screen.getByText('Linha ociosa: tudo ensacado');
      expect(chip.className).toMatch(/whitespace-nowrap/);
      expect(chip.className).not.toMatch(/\btruncate\b/);
      expect(screen.queryByText(/Programa /)).toBeNull();
      const commitment = screen.getByRole('button', { name: /^Abrir o compromisso/ });
      expect(commitment.querySelector('span')!.className).toMatch(/whitespace-nowrap/);
    } finally {
      restore();
    }
  });

  // Seen in a capture at 1280 px (a restored shift, held with P, a long
  // overdue commitment): the changeover chip shrank to a 2 px sliver. A chip
  // that shrinks hides the overflow the squeeze listens for, so nothing gave
  // way around it. It keeps its width, and the row's squeeze makes room.
  it('keeps the changeover chip whole and lets the row give way around it', () => {
    useProductionStore.setState((state) => ({ metrics: { ...state.metrics, throughput: 0 } }));
    const execution = campaign().execution;
    useOperationsCampaignStore.setState({
      execution: {
        ...execution,
        orderId: 'order-001',
        stage: 'dispatched',
        remainingKg: 1000,
        finishedAvailableKg: 999.5,
        lineCustomer: 'County School Meals',
      },
    });
    const restore = fakeRowOverflow(() => document.body.textContent!.includes('Programme '));
    try {
      render(<StatusHUD />);
      const chip = screen.getByText('Changing over to the next order');
      expect(chip.className).toMatch(/whitespace-nowrap/);
      expect(chip.className).not.toMatch(/\btruncate\b/);
      expect(chip.parentElement!.className).toMatch(/\bshrink-0\b/);
      expect(screen.queryByText(/Programme /)).toBeNull();
    } finally {
      restore();
    }
  });

  it('keeps safety and the programme word when the row has room', () => {
    render(<StatusHUD />);
    expect(screen.getByText(/% safety$/)).toBeInTheDocument();
    expect(screen.getByText('Programme 0.0 / 18.0 t')).toBeInTheDocument();
  });
});

describe('the phone held-clock chip', () => {
  // The chip sat under the bell, at the music player's height, and the player
  // (z-40) covered it. Working if it shares the bell's row, above the player.
  it('sits in the bell row, not under it', () => {
    useGameSimulationStore.getState().setGameSpeed(0);
    render(<StatusHUD compact />);
    const chip = screen.getByTestId('clock-hold-chip');
    const header = screen.getByRole('banner');
    expect(header.className).not.toMatch(/flex-col/);
    expect(chip.parentElement).toBe(header);
    const bell = screen.getByRole('button', { name: /notification/i });
    expect(bell.parentElement!.parentElement).toBe(header);
  });
});

describe('the notifications dropdown', () => {
  // Glass inside the glass header blurs nothing behind it: the card behind
  // read through. Working if the list is opaque and stacks above the floating
  // widgets (z-30 and z-40), level with the modals so a modal opened over it
  // stays on top.
  it('is opaque and above the floating widgets', () => {
    render(<StatusHUD />);
    fireEvent.click(screen.getByRole('button', { name: /notification/i }));
    const list = screen.getByRole('dialog', { name: 'Notifications' });
    expect(list.className).toMatch(/\bbg-slate-950\b/);
    expect(list.className).not.toMatch(/millos-glass/);
    expect(screen.getByRole('banner').className).toMatch(/\bz-50\b/);
  });
});
