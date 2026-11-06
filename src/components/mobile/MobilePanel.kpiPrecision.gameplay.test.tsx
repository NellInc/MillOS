import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MobilePanel } from './MobilePanel';
import { useProductionStore } from '../../stores/productionStore';
vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: { div: 'div', aside: 'aside' },
}));

const initialMetrics = useProductionStore.getState().metrics;
beforeEach(() => {
  // The plant's own readings: quality is 99.5 until the first QC test, and
  // efficiency is 11 of 12 units running.
  useProductionStore.setState({
    metrics: { ...initialMetrics, efficiency: 91.7, uptime: 98.4, quality: 99.5 },
  });
});
afterEach(() => {
  cleanup();
  useProductionStore.setState({ metrics: initialMetrics });
});

/** The phone Overview's card: the value sits directly above its label. */
const valueAbove = (label: string) => {
  const labels = screen
    .getAllByText(label)
    .filter((el) => el.tagName === 'DIV' && el.previousElementSibling);
  expect(labels).toHaveLength(1);
  return labels[0].previousElementSibling?.textContent;
};
/** The SCADA sheet's card: the label shares a row with its icon; the value follows. */
const valueBelow = (label: string) => {
  const labels = screen.getAllByText(label).filter((el) => el.tagName === 'SPAN');
  expect(labels).toHaveLength(1);
  return labels[0].parentElement?.nextElementSibling?.textContent;
};

// The desktop Overview and the phone's own SCADA sheet print these three to one
// decimal. The phone Overview rounded them whole, so the same plant read
// Quality 100% there and 99.5 everywhere else, efficiency 92% against 91.7.
it('prints efficiency, uptime and quality on the phone Overview as SCADA and the desktop do', () => {
  const overview = render(<MobilePanel isVisible content="overview" onClose={vi.fn()} />);
  const phoneOverview = {
    efficiency: valueAbove('Efficiency'),
    uptime: valueAbove('Uptime'),
    quality: valueAbove('Quality'),
  };
  overview.unmount();
  render(<MobilePanel isVisible content="scada" onClose={vi.fn()} />);
  const scada = {
    efficiency: valueBelow('Efficiency'),
    uptime: valueBelow('Uptime'),
    quality: valueBelow('Quality'),
  };
  expect(scada).toEqual({ efficiency: '91.7%', uptime: '98.4%', quality: '99.5%' });
  expect(phoneOverview).toEqual(scada);
});
