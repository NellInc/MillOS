import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSafetyStore } from '../../../stores/safetyStore';
import { SafetyAnalyticsPanel } from '../SafetyAnalyticsPanel';
import { SafetyMetricsDisplay } from '../SafetyMetricsDisplay';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'));
  useSafetyStore.setState(useSafetyStore.getInitialState(), true);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useSafetyStore.setState(useSafetyStore.getInitialState(), true);
});

const sessionCount = () => screen.getByText('This Session').nextElementSibling?.textContent;

// "This Session" was the incident log's length: the log is capped at 50 and
// can be cleared, so the session total stopped at 50 and fell to 0 on a clear.
// Working if it counts every incident logged this session, whatever the log holds.
describe('SafetyAnalyticsPanel session incident count', () => {
  it('counts past the 50-entry log cap', () => {
    act(() => {
      for (let i = 0; i < 55; i += 1) {
        useSafetyStore.getState().addSafetyIncident({ type: 'emergency', description: 'Stop' });
      }
    });
    render(<SafetyAnalyticsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Safety Analytics' }));
    expect(useSafetyStore.getState().safetyIncidents).toHaveLength(50);
    expect(sessionCount()).toBe('55');
  });

  it('keeps the session total when the incident log is cleared', () => {
    act(() => {
      useSafetyStore.getState().recordSafetyStop();
      useSafetyStore.getState().addSafetyIncident({ type: 'emergency', description: 'Stop' });
    });
    render(<SafetyAnalyticsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Safety Analytics' }));
    expect(sessionCount()).toBe('2');
    act(() => {
      useSafetyStore.getState().clearSafetyIncidents();
    });
    expect(sessionCount()).toBe('2');
    act(() => {
      useSafetyStore.getState().recordSafetyStop();
    });
    expect(sessionCount()).toBe('3');
  });

  // A session restored from an older save has a log but no counter.
  it('never reads below the incidents the log is showing', () => {
    act(() => {
      useSafetyStore.getState().addSafetyIncident({ type: 'emergency', description: 'Stop' });
      useSafetyStore.setState({ sessionIncidentCount: 0 });
    });
    render(<SafetyAnalyticsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Safety Analytics' }));
    expect(sessionCount()).toBe('1');
  });
});

// Forklift yields are kept out of the safety record by design and nothing
// records a route conflict, so a Conflicts card could only ever read 0.
describe('SafetyMetricsDisplay without a conflicts counter', () => {
  it('shows no Conflicts card and no conflicts in its spoken status', () => {
    render(<SafetyMetricsDisplay />);
    expect(screen.queryByText('Conflicts')).toBeNull();
    expect(screen.getByRole('status').textContent).not.toMatch(/conflict/i);
    expect(screen.getByRole('status')).toHaveTextContent('Blocked-route stops: 0');
  });
});

// The report's "hotspots" were the ten oldest heat-map cells, so a hotspot
// that kept recurring after the tenth location never appeared; and its totals
// came from the capped log alone, below the This Session the panel showed.
describe('SafetyAnalyticsPanel report totals and hotspots', () => {
  const readReport = async (blob: Blob) =>
    JSON.parse(
      await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsText(blob);
      })
    );

  it('lists the hottest cells and the session total', async () => {
    vi.useRealTimers();
    const blobs: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      blobs.push(blob as Blob);
      return 'blob:report';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const store = useSafetyStore.getState();
    for (let i = 0; i < 11; i += 1) store.recordIncidentLocation(i * 10, 0, 'stop');
    for (let i = 0; i < 4; i += 1) store.recordIncidentLocation(100, 0, 'stop');
    for (let i = 0; i < 52; i += 1)
      store.addSafetyIncident({ type: 'emergency', description: 'S' });
    render(<SafetyAnalyticsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Safety Analytics' }));
    fireEvent.click(screen.getByRole('button', { name: /Download Safety Report/ }));
    const report = await readReport(blobs[0]);
    expect(report.hotspots[0]).toMatchObject({ location: { x: 100, z: 0 }, intensity: 5 });
    expect(report.summary.sessionIncidents).toBe(52);
    vi.restoreAllMocks();
  });
});
