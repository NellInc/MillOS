import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../../../i18n';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { OverviewPanel, QuickActionsSection } from './OverviewPanel';
vi.mock('../../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: { div: 'div', aside: 'aside' },
}));

const campaign = () => useOperationsCampaignStore.getState();
const shipFirstOrder = () =>
  useOperationsCampaignStore.setState({
    orders: campaign().orders.map((order) =>
      order.id === 'order-001'
        ? { ...order, shippedKg: order.requiredKg, status: 'fulfilled' as const }
        : order
    ),
  });
const deliverAll = () =>
  useOperationsCampaignStore.setState({
    orders: campaign().orders.map((order) => ({
      ...order,
      shippedKg: order.requiredKg,
      status: 'fulfilled' as const,
    })),
  });

beforeEach(() => {
  setLocale('en');
  campaign().resetCampaign();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  campaign().resetCampaign();
});

// D11: Overview showed "Daily Target 0 / 1,200" bags beside the customers'
// 18 t. The goal is the running programme's committed tonnes.
describe("Overview's goal", () => {
  it('is the programme: tonnes shipped of tonnes committed, not a bag target', () => {
    shipFirstOrder();
    render(<OverviewPanel />);
    expect(screen.queryByText('Daily Target')).not.toBeInTheDocument();
    expect(screen.queryByText(/1,200/)).not.toBeInTheDocument();
    const tile = screen.getByText('Programme').parentElement!.parentElement!;
    expect(tile).toHaveTextContent('6.0 / 18.0 t');
    expect(tile).toHaveTextContent('33.3% complete');
  });

  it('is absent with no programme open', () => {
    deliverAll();
    render(<OverviewPanel />);
    expect(screen.queryByText('Programme')).not.toBeInTheDocument();
    expect(screen.queryByText('Daily Target')).not.toBeInTheDocument();
  });
});

const readBlob = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });

describe("Overview's exported report", () => {
  const exportReport = async () => {
    const blobs: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      blobs.push(blob as Blob);
      return 'blob:report';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    render(<QuickActionsSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    return JSON.parse(await readBlob(blobs[0]));
  };

  it('carries the programme commitment and no bag target', async () => {
    shipFirstOrder();
    const report = await exportReport();
    expect(report).not.toHaveProperty('productionTarget');
    expect(report.programme).toEqual({ key: 'guided', committedKg: 18000, shippedKg: 6000 });
  });

  it('carries no programme when none is open', async () => {
    deliverAll();
    const report = await exportReport();
    expect(report.programme).toBeNull();
  });
});
