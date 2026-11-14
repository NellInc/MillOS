import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StatusHUD } from './StatusHUD';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useUIStore } from '../../../stores/uiStore';
import { setLocale } from '../../../i18n';

const campaign = () => useOperationsCampaignStore.getState();

beforeEach(() => {
  setLocale('en');
  campaign().resetCampaign();
  useGameSimulationStore.getState().resetGameState();
  // The guide is closed: the HUD alone must name the order.
  useUIStore.setState({ alerts: [], journeyVisible: false });
});
afterEach(() => {
  cleanup();
  setLocale('en');
  campaign().resetCampaign();
});

describe('the commitment on the HUD (2.1)', () => {
  it('names the active order, shipped of required and its due time, and opens the commitment', () => {
    render(<StatusHUD />);
    const commitment = screen.getByRole('button', {
      name: "Open the commitment: Riverside Bakers' Cooperative, 0 of 6,000 kg shipped. Due in 4h 0m (simulated)",
    });
    expect(commitment).toHaveTextContent(
      "Riverside Bakers' Cooperative · 0 / 6,000 kg · Due in 4h 0m (simulated)"
    );
    // The route the shift card's own buttons take: Overview, which leads with it.
    const opened = vi.fn();
    window.addEventListener('millos:open-operations-workspace', opened);
    try {
      fireEvent.click(commitment);
    } finally {
      window.removeEventListener('millos:open-operations-workspace', opened);
    }
    expect(opened).toHaveBeenCalledTimes(1);
    expect((opened.mock.calls[0][0] as CustomEvent).detail).toBe('overview');
  });

  it('follows the order as it ships and runs late, and in Portuguese', () => {
    render(<StatusHUD />);
    act(() =>
      useOperationsCampaignStore.setState({
        elapsedMinutes: 250,
        orders: campaign().orders.map((order) =>
          order.id === 'order-001' ? { ...order, shippedKg: 5000 } : order
        ),
      })
    );
    expect(
      screen.getByText(
        "Riverside Bakers' Cooperative · 5,000 / 6,000 kg · Overdue by 10m (simulated)"
      )
    ).toBeVisible();
    act(() => setLocale('pt-BR'));
    expect(
      screen.getByText(
        "Riverside Bakers' Cooperative · 5.000 / 6.000 kg · Atrasado em 10min (tempo simulado)"
      )
    ).toBeVisible();
  });

  it('shows nothing there, and no target, once no order is open', () => {
    useOperationsCampaignStore.setState({
      activeOrderId: null,
      orders: campaign().orders.map((order) => ({
        ...order,
        shippedKg: order.requiredKg,
        status: 'fulfilled' as const,
      })),
    });
    render(<StatusHUD />);
    expect(screen.queryByRole('button', { name: /Open the commitment/ })).toBeNull();
    expect(screen.queryByLabelText(/Programme commitment/)).toBeNull();
  });
});

describe("the programme's committed tonnes replace the daily bag target (D11)", () => {
  it('counts shipped kilograms of the running programme, rounded down', () => {
    render(<StatusHUD />);
    expect(screen.getByText('Programme 0.0 / 18.0 t')).toBeVisible();
    act(() =>
      useOperationsCampaignStore.setState({
        orders: campaign().orders.map((order) =>
          order.id === 'order-001' ? { ...order, shippedKg: 5999.6 } : order
        ),
      })
    );
    expect(screen.getByLabelText('Programme commitment: 5.9 of 18.0 tonnes shipped')).toBeVisible();
  });
});
