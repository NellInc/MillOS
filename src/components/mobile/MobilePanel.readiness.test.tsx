import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MobilePanel } from './MobilePanel';
import { AutonomyPanel } from '../ui-new/widgets/AutonomyPanel';
import { useProductionStore } from '../../stores/productionStore';
import {
  useOperationsCampaignStore,
  type OperationalIncident,
} from '../../stores/operationsCampaignStore';

vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: { div: 'div', aside: 'aside' },
}));
vi.mock('../ui-new/widgets/WorkplaceLab', () => ({ WorkplaceLab: () => null }));
vi.mock('../ui-new/widgets/AgentCockpit', () => ({ AgentCockpit: () => null }));

const initialMetrics = useProductionStore.getState().metrics;
beforeEach(() => {
  useProductionStore.setState({
    metrics: { ...initialMetrics, efficiency: 90, uptime: 95, quality: 99 },
  });
  useOperationsCampaignStore.setState({
    incidents: [{ id: 'incident-1', phase: 'raised' } as OperationalIncident],
  });
});
afterEach(() => {
  cleanup();
  useProductionStore.setState({ metrics: initialMetrics });
  useOperationsCampaignStore.setState({ incidents: [] });
});

// The Management dock button opens the Autonomy panel on a desktop and this
// sheet on a phone. The desktop scores readiness as the mean of efficiency,
// uptime and quality; the phone kept its own uptime-minus-incidents formula,
// so the same plant read 95% at the desk and 87% on the phone.
it('scores readiness on the phone exactly as the desktop Autonomy panel does', () => {
  render(<AutonomyPanel />);
  const desktop = screen.getByText('readiness index').previousElementSibling?.textContent;
  expect(desktop).toBe('95%');
  cleanup();
  render(<MobilePanel isVisible content="management" onClose={vi.fn()} />);
  const row = screen.getByText('Autonomous readiness').closest('div')?.parentElement as HTMLElement;
  expect(within(row).getByText(desktop!)).toBeInTheDocument();
  expect(screen.queryByText('87%')).not.toBeInTheDocument();
});

// The desktop Overview groups the daily target and throughput (1,200 bags),
// and the guide groups the truck's load (5,000 kg); the phone sheet printed
// the same numbers ungrouped in English, 1200 and 5000.
it('groups thousands on the phone as the desktop Overview and the guide do', () => {
  const production = useProductionStore.getState();
  const campaign = useOperationsCampaignStore.getState();
  useProductionStore.setState({
    metrics: { ...production.metrics, throughput: 1234 },
    productionTarget: { ...production.productionTarget!, producedBags: 345, targetBags: 1200 },
  });
  useOperationsCampaignStore.setState({
    execution: {
      ...campaign.execution,
      dispatchLoad: { ...campaign.execution.dispatchLoad, loadedKg: 2500, capacityKg: 5000 },
    },
  });
  try {
    render(<MobilePanel isVisible content="overview" onClose={vi.fn()} />);
    expect(screen.getByText(/345\/\s*1,200/)).toBeInTheDocument();
    expect(screen.getByText(/2,500\s*\/\s*5,000 kg/)).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
  } finally {
    useProductionStore.setState({ productionTarget: production.productionTarget });
    useOperationsCampaignStore.setState({ execution: campaign.execution });
  }
});

// The same rule reached revenue on the Overview sheet and the released stock on
// the SCADA sheet: one order earns thousands of pounds, and a truckload is
// thousands of kilograms, and both printed ungrouped (£4920, 5000 kg).
it('groups revenue and released stock on the phone sheets', () => {
  const campaign = useOperationsCampaignStore.getState();
  useOperationsCampaignStore.setState({
    economics: { ...campaign.economics, revenue: 4920 },
    execution: { ...campaign.execution, releasedFinishedKg: 5000 },
  });
  try {
    render(<MobilePanel isVisible content="overview" onClose={vi.fn()} />);
    expect(screen.getByText('£4,920')).toBeInTheDocument();
    cleanup();
    render(<MobilePanel isVisible content="scada" onClose={vi.fn()} />);
    expect(screen.getByText(/5,000 kg available/)).toBeInTheDocument();
  } finally {
    useOperationsCampaignStore.setState({
      economics: campaign.economics,
      execution: campaign.execution,
    });
  }
});
