/**
 * Tests for ProductionMetrics Component
 *
 * Tests cover:
 * - Chart rendering with mock data
 * - Metric updates from stores
 * - KPI display
 * - Safety metrics integration
 * - Accessibility
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { bagsPerHourToTonnesPerHour, ProductionMetrics } from '../ProductionMetrics';
import { useProductionStore } from '../../stores/productionStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { MachineType } from '../../types';

// Mock Recharts - it's a heavy dependency
vi.mock('recharts', () => ({
  AreaChart: ({ children }: any) => (
    <svg data-testid="area-chart" role="img" xmlns="http://www.w3.org/2000/svg">
      {children}
    </svg>
  ),
  Area: () => <g data-testid="area" />,
  ResponsiveContainer: ({ children }: any) => (
    <div data-testid="responsive-container">{children}</div>
  ),
}));

describe('ProductionMetrics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'));

    // Reset production store
    useProductionStore.setState({
      productionSpeed: 1,
      metrics: {
        throughput: 1200,
        efficiency: 87,
        quality: 94,
        uptime: 98,
      },
      machines: [
        {
          id: 'rm-101',
          name: 'Roller Mill 101',
          type: MachineType.ROLLER_MILL,
          status: 'running',
          position: [0, 0, 0] as [number, number, number],
          size: [2, 2, 2] as [number, number, number],
          rotation: 0,
          metrics: {
            rpm: 1200,
            temperature: 45,
            vibration: 0.5,
            load: 75,
            wear: 15,
            efficiency: 92,
          },
          lastMaintenance: '2024-01-01',
          nextMaintenance: '2024-02-01',
        },
        {
          id: 'rm-102',
          name: 'Roller Mill 102',
          type: MachineType.ROLLER_MILL,
          status: 'running',
          position: [5, 0, 0] as [number, number, number],
          size: [2, 2, 2] as [number, number, number],
          rotation: 0,
          metrics: {
            rpm: 1250,
            temperature: 48,
            vibration: 0.6,
            load: 80,
            wear: 20,
            efficiency: 88,
          },
          lastMaintenance: '2024-01-01',
          nextMaintenance: '2024-02-01',
        },
      ],
    });

    // Reset safety store
    useSafetyStore.setState({
      safetyMetrics: {
        nearMisses: 0,
        safetyStops: 2,
        routeConflicts: 1,
        lastIncidentTime: null,
        daysSinceIncident: 127,
      },
    });

    useGameSimulationStore.setState({
      gameTime: 10,
      emergencyActive: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Rendering and Accessibility', () => {
    it('renders the complete KPI, secondary, safety, and live-status contract', () => {
      render(<ProductionMetrics />);

      const labelledValues = [
        ['Throughput', '30'],
        ['Efficiency', '87%'],
        ['Quality', '94%'],
        ['bags/min', '20'],
        ['uptime', '98%'],
        ['kWh', '152'],
        ['stops', '2'],
        ['evasions', '1'],
      ];

      for (const [label, value] of labelledValues) {
        const labelElement = screen.getByText(label);
        expect(labelElement.parentElement).toHaveTextContent(value);
      }

      expect(within(screen.getByText('Throughput').parentElement!).getByText('t/hr')).toBeVisible();
      expect(screen.getByText('Safety')).toBeInTheDocument();
      expect(screen.getByText('Live')).toBeInTheDocument();
    });

    it('exposes a named chart and a complete screen-reader data table', () => {
      render(<ProductionMetrics />);

      expect(
        screen.getByRole('img', {
          name: 'Recent production throughput chart showing a current value of 30 tonnes per hour',
        })
      ).toBeInTheDocument();
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
      expect(screen.getByTestId('area-chart')).toBeInTheDocument();

      const table = screen.getByRole('table', {
        name: 'Recent sampled production throughput data',
      });
      expect(
        within(table)
          .getAllByRole('columnheader')
          .map((cell) => cell.textContent)
      ).toEqual(['Time', 'Throughput (t/hr)', 'Efficiency (%)', 'Quality (%)']);
      const cells = within(table).getAllByRole('cell');
      expect(cells.slice(1).map((cell) => cell.textContent)).toEqual(['30.0', '87.0', '94.0']);
    });
  });

  describe('Throughput Conversion', () => {
    it.each([
      { name: 'zero', bagsPerHour: 0, expected: 0 },
      { name: 'negative input', bagsPerHour: -1, expected: 0 },
      { name: 'NaN', bagsPerHour: Number.NaN, expected: 0 },
      { name: 'positive infinity', bagsPerHour: Number.POSITIVE_INFINITY, expected: 0 },
      { name: 'one tonne per hour', bagsPerHour: 40, expected: 1 },
      { name: 'the baseline production rate', bagsPerHour: 1200, expected: 30 },
    ])('converts $name safely', ({ bagsPerHour, expected }) => {
      expect(bagsPerHourToTonnesPerHour(bagsPerHour)).toBe(expected);
    });

    it('keeps the maximum finite production rate finite', () => {
      const converted = bagsPerHourToTonnesPerHour(Number.MAX_VALUE);

      expect(Number.isFinite(converted)).toBe(true);
      expect(converted).toBeGreaterThan(0);
    });
  });

  describe('Store Updates', () => {
    it('should update when production store changes', async () => {
      render(<ProductionMetrics />);

      // Initial efficiency
      expect(screen.getByText('87%')).toBeInTheDocument();

      // Update store
      act(() => {
        useProductionStore.setState({
          metrics: {
            throughput: 1300,
            efficiency: 92,
            quality: 96,
            uptime: 99,
          },
        });
      });

      // Component should reflect new values
      expect(screen.getByText('92%')).toBeInTheDocument();
    });

    it('should update when safety store changes', () => {
      render(<ProductionMetrics />);

      // Update safety metrics
      act(() => {
        useSafetyStore.setState({
          safetyMetrics: {
            nearMisses: 1,
            safetyStops: 5,
            routeConflicts: 3,
            lastIncidentTime: Date.now(),
            daysSinceIncident: 0,
          },
        });
      });

      // Safety stops should update
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });

  describe('Data Updates Over Time', () => {
    it('samples on the original five-second deadline using the latest store metrics', async () => {
      render(<ProductionMetrics />);

      expect(document.querySelectorAll('tbody tr')).toHaveLength(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });

      act(() => {
        useProductionStore.setState({
          metrics: {
            throughput: 1600,
            efficiency: 91,
            quality: 97,
            uptime: 99,
          },
        });
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(999);
      });
      expect(document.querySelectorAll('tbody tr')).toHaveLength(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      const rows = document.querySelectorAll('tbody tr');
      expect(rows).toHaveLength(2);
      expect(Array.from(rows[1].querySelectorAll('td')).map((cell) => cell.textContent)).toEqual([
        expect.any(String),
        '40.0',
        '91.0',
        '97.0',
      ]);
    });
  });

  describe('Time Since Incident', () => {
    it('should show "Clean record" when lastIncidentTime is null', () => {
      useSafetyStore.setState({
        safetyMetrics: {
          nearMisses: 0,
          safetyStops: 0,
          routeConflicts: 0,
          lastIncidentTime: null,
          daysSinceIncident: 127,
        },
      });

      render(<ProductionMetrics />);

      expect(screen.getByText(/Clean record/i)).toBeInTheDocument();
    });

    it('shows an exact five-minute elapsed duration under a fixed clock', () => {
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      useSafetyStore.setState({
        safetyMetrics: {
          nearMisses: 1,
          safetyStops: 1,
          routeConflicts: 0,
          lastIncidentTime: fiveMinutesAgo,
          daysSinceIncident: 0,
        },
      });

      render(<ProductionMetrics />);

      const elapsedLabel = screen.getByText('elapsed');
      expect(elapsedLabel.previousElementSibling).toHaveTextContent(/^5m 0s$/);
    });
  });

  describe('Safety Status Message', () => {
    it('should show "All safe" when no safety stops', () => {
      useSafetyStore.setState({
        safetyMetrics: {
          nearMisses: 0,
          safetyStops: 0,
          routeConflicts: 0,
          lastIncidentTime: null,
          daysSinceIncident: 127,
        },
      });

      render(<ProductionMetrics />);

      expect(screen.getByText(/All safe/i)).toBeInTheDocument();
    });

    it('should not show "All safe" when there are safety stops', () => {
      useSafetyStore.setState({
        safetyMetrics: {
          nearMisses: 0,
          safetyStops: 3,
          routeConflicts: 0,
          lastIncidentTime: null,
          daysSinceIncident: 127,
        },
      });

      render(<ProductionMetrics />);

      // "All safe" should not be displayed
      expect(screen.queryByText(/All safe/i)).not.toBeInTheDocument();
    });
  });

  describe('Efficiency Trend', () => {
    it('should display the exact efficiency delta in the efficiency card', () => {
      render(<ProductionMetrics />);

      const efficiencyCard = screen.getByText('Efficiency').parentElement;
      expect(efficiencyCard).not.toBeNull();
      expect(within(efficiencyCard!).getByText('+0.0%')).toBeInTheDocument();

      act(() => {
        useProductionStore.setState({
          metrics: {
            throughput: 1200,
            efficiency: 91.5,
            quality: 94,
            uptime: 98,
          },
        });
      });

      expect(within(efficiencyCard!).getByText('91.5%')).toBeInTheDocument();
      expect(within(efficiencyCard!).getByText('+4.5%')).toBeInTheDocument();
    });
  });
});
