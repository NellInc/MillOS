import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSafetyStore } from '../../../stores/safetyStore';
import { SafetyAnalyticsPanel } from '../SafetyAnalyticsPanel';
import { setLocale } from '../../../i18n';

// Each forklift has one roster operator, so its "Efficiency %" (moving time
// over total) read as a number about that person, and it fell every time the
// forklift gave way to someone on foot (D-008, D-058; mechanics review D16).
// Working if no per-forklift figure is shown or put in the report.
describe('Safety Analytics shows no per-forklift figure', () => {
  let blobs: Blob[] = [];
  beforeEach(() => {
    blobs = [];
    useSafetyStore.setState(useSafetyStore.getInitialState(), true);
    useSafetyStore.setState({
      forkliftMetrics: {
        'forklift-1': {
          totalMovingTime: 30,
          totalStoppedTime: 70,
          lastUpdateTime: 0,
          isMoving: false,
        },
      },
    });
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      blobs.push(blob as Blob);
      return 'blob:report';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    setLocale('en');
    useSafetyStore.setState(useSafetyStore.getInitialState(), true);
  });

  it.each(['en', 'pt-BR'] as const)(
    'has no efficiency, percentage or moving time (%s)',
    (locale) => {
      setLocale(locale);
      const { container } = render(<SafetyAnalyticsPanel />);
      fireEvent.click(
        screen.getByRole('button', { name: /Safety Analytics|Análises de segurança/ })
      );
      const text = container.textContent ?? '';
      expect(text).not.toMatch(/Efficiency|Eficiência/);
      expect(text).not.toMatch(/%/);
      expect(text).not.toMatch(/Moving|Em movimento/);
    }
  );

  it('leaves the figure out of the downloaded report', async () => {
    setLocale('en');
    render(<SafetyAnalyticsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Safety Analytics/ }));
    fireEvent.click(screen.getByRole('button', { name: /Download Safety Report/ }));
    expect(blobs).toHaveLength(1);
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blobs[0]);
    });
    expect(text).not.toMatch(/fficiency/);
    expect(JSON.parse(text)).not.toHaveProperty('forkliftEfficiency');
  });
});
