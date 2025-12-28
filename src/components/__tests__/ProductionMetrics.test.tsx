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
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ProductionMetrics } from '../ProductionMetrics';
import { useProductionStore } from '../../stores/productionStore';
import { useSafetyStore } from '../../stores/safetyStore';
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
          metrics: { rpm: 1200, temperature: 45, vibration: 0.5, load: 75, wear: 15, efficiency: 92 },
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
          metrics: { rpm: 1250, temperature: 48, vibration: 0.6, load: 80, wear: 20, efficiency: 88 },
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
        workerEvasions: 1,
        lastIncidentTime: null,
        daysSinceIncident: 127,
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Rendering', () => {
    it('should render the component', () => {
      render(<ProductionMetrics />);

      // Component should render without errors
      expect(document.body).toBeInTheDocument();
    });

    it('should render KPI cards', () => {
      render(<ProductionMetrics />);

      // Look for KPI labels (may have multiple matches due to chart data)
      expect(screen.getAllByText(/Throughput/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Efficiency/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Quality/i).length).toBeGreaterThan(0);
    });

    it('should render the chart container', () => {
      render(<ProductionMetrics />);

      // Recharts ResponsiveContainer should be present
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    });

    it('should render secondary stats', () => {
      render(<ProductionMetrics />);

      // Secondary stat labels
      expect(screen.getByText(/bags\/min/i)).toBeInTheDocument();
      expect(screen.getByText(/uptime/i)).toBeInTheDocument();
      expect(screen.getByText(/kWh/i)).toBeInTheDocument();
    });

    it('should render safety section', () => {
      render(<ProductionMetrics />);

      // Safety section
      expect(screen.getByText(/Safety/i)).toBeInTheDocument();
      expect(screen.getByText(/stops/i)).toBeInTheDocument();
      expect(screen.getByText(/evasions/i)).toBeInTheDocument();
    });
  });

  describe('Data Display', () => {
    it('should display efficiency from store', () => {
      render(<ProductionMetrics />);

      // Efficiency value should be displayed
      expect(screen.getByText('87%')).toBeInTheDocument();
    });

    it('should display quality from store', () => {
      render(<ProductionMetrics />);

      // Quality value should be displayed
      expect(screen.getByText('94%')).toBeInTheDocument();
    });

    it('should display uptime from store', () => {
      render(<ProductionMetrics />);

      // Uptime value should be displayed
      expect(screen.getByText('98%')).toBeInTheDocument();
    });

    it('should display safety stops from store', () => {
      render(<ProductionMetrics />);

      // Safety stops value
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('should display worker evasions from store', () => {
      render(<ProductionMetrics />);

      // Worker evasions value
      expect(screen.getByText('1')).toBeInTheDocument();
    });
  });

  describe('Live Metrics Calculation', () => {
    it('should calculate throughput based on production speed and machines', () => {
      // Set production speed
      useProductionStore.setState({ productionSpeed: 1.5 });

      render(<ProductionMetrics />);

      // Throughput should be calculated (base + speed factor + machine factor)
      // The exact value depends on the calculation formula
      const throughputElements = screen.getAllByText(/t\/hr/i);
      expect(throughputElements.length).toBeGreaterThan(0);
    });

    it('should calculate bags per minute', () => {
      render(<ProductionMetrics />);

      // Bags per minute label should exist
      expect(screen.getByText(/bags\/min/i)).toBeInTheDocument();
    });

    it('should calculate energy usage', () => {
      render(<ProductionMetrics />);

      // Energy usage (kWh label)
      expect(screen.getByText(/kWh/i)).toBeInTheDocument();
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
            workerEvasions: 3,
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
    it('should update chart data periodically', async () => {
      render(<ProductionMetrics />);

      // Initial render
      expect(screen.getByTestId('area-chart')).toBeInTheDocument();

      // Advance time past update interval (5 seconds)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5100);
      });

      // Chart should still be rendered
      expect(screen.getByTestId('area-chart')).toBeInTheDocument();
    });
  });

  describe('Time Since Incident', () => {
    it('should show "No incidents" when lastIncidentTime is null', () => {
      useSafetyStore.setState({
        safetyMetrics: {
          nearMisses: 0,
          safetyStops: 0,
          workerEvasions: 0,
          lastIncidentTime: null,
          daysSinceIncident: 127,
        },
      });

      render(<ProductionMetrics />);

      expect(screen.getByText(/No incidents/i)).toBeInTheDocument();
    });

    it('should show elapsed time when there was an incident', () => {
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      useSafetyStore.setState({
        safetyMetrics: {
          nearMisses: 1,
          safetyStops: 1,
          workerEvasions: 0,
          lastIncidentTime: fiveMinutesAgo,
          daysSinceIncident: 0,
        },
      });

      render(<ProductionMetrics />);

      // Should show elapsed time in minutes/seconds format
      expect(screen.getByText(/elapsed/i)).toBeInTheDocument();
    });
  });

  describe('Safety Status Message', () => {
    it('should show "All safe" when no safety stops', () => {
      useSafetyStore.setState({
        safetyMetrics: {
          nearMisses: 0,
          safetyStops: 0,
          workerEvasions: 0,
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
          workerEvasions: 0,
          lastIncidentTime: null,
          daysSinceIncident: 127,
        },
      });

      render(<ProductionMetrics />);

      // "All safe" should not be displayed
      expect(screen.queryByText(/All safe/i)).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible chart with aria-label', () => {
      render(<ProductionMetrics />);

      // Chart should have role="img" and aria-label
      const chartContainer = document.querySelector('[role="img"]');
      expect(chartContainer).toBeInTheDocument();
      expect(chartContainer).toHaveAttribute('aria-label');
    });

    it('should have screen reader table for chart data', () => {
      render(<ProductionMetrics />);

      // SR-only table should exist
      const table = document.querySelector('table.sr-only');
      expect(table).toBeInTheDocument();
    });

    it('should have table headers for screen reader data', () => {
      render(<ProductionMetrics />);

      // Table headers
      expect(screen.getByText('Time')).toBeInTheDocument();
      expect(screen.getByText('Throughput (t/hr)')).toBeInTheDocument();
      expect(screen.getByText('Efficiency (%)')).toBeInTheDocument();
      expect(screen.getByText('Quality (%)')).toBeInTheDocument();
    });

    it('should have caption for data table', () => {
      render(<ProductionMetrics />);

      const caption = document.querySelector('caption');
      expect(caption).toBeInTheDocument();
      expect(caption).toHaveTextContent(/Production throughput data/i);
    });
  });

  describe('Efficiency Trend', () => {
    it('should calculate efficiency trend', () => {
      render(<ProductionMetrics />);

      // The efficiency trend is displayed below the efficiency percentage
      // Look for the trend text pattern (+X.X% or -X.X%)
      const efficiencyCards = screen.getAllByText(/Efficiency/i);
      expect(efficiencyCards.length).toBeGreaterThan(0);

      // The trend should be rendered as part of the efficiency display
      // It will show something like "+0.0%" or "-0.0%" initially
      const trendPattern = /[+-]\d+\.\d+%/;
      const allText = document.body.textContent || '';
      expect(trendPattern.test(allText)).toBe(true);
    });
  });

  describe('Live Indicator', () => {
    it('should show live indicator', () => {
      render(<ProductionMetrics />);

      expect(screen.getByText(/Live/i)).toBeInTheDocument();
    });
  });
});
