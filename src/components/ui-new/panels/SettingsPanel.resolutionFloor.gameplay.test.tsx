import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./BuildCacheDiagnostics', () => ({ BuildCacheDiagnostics: () => null }));

import { SettingsPanel } from './SettingsPanel';
import { useGraphicsStore } from '../../../stores/graphicsStore';
import { setLocale } from '../../../i18n';

// App.tsx floors the canvas at 0.5 device pixels per CSS pixel, so on a DPR-1
// screen every Resolution Scale step below 50% rendered exactly like 50%: the
// slider moved and nothing changed. Working if the slider offers only steps
// that change the picture (minimum max(25%, 0.5 / devicePixelRatio), on the
// 5% grid) and a stored scale below it reads as the minimum.
const originalDpr = window.devicePixelRatio;
const setDpr = (value: number) =>
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value });

const renderPanel = () =>
  render(<SettingsPanel productionSpeed={1} setProductionSpeed={() => {}} />);
const slider = () => screen.getByLabelText('Resolution scale') as HTMLInputElement;

describe('Resolution Scale slider floor', () => {
  let storedGraphics: ReturnType<typeof useGraphicsStore.getState>['graphics'];
  beforeEach(() => {
    storedGraphics = useGraphicsStore.getState().graphics;
  });
  afterEach(() => {
    cleanup();
    setLocale('en');
    setDpr(originalDpr);
    useGraphicsStore.setState({ graphics: storedGraphics });
  });

  it('starts at 50% on a DPR-1 screen, where lower steps change nothing', () => {
    setDpr(1);
    renderPanel();
    expect(slider().min).toBe('0.5');
    expect(slider()).toHaveAttribute('aria-valuemin', '50');
  });

  it('keeps 25% on a DPR-2 screen, where 25% is still half a device pixel', () => {
    setDpr(2);
    renderPanel();
    expect(slider().min).toBe('0.25');
    expect(slider()).toHaveAttribute('aria-valuemin', '25');
  });

  it('rounds the floor up to a 5% step so 100% stays reachable on DPR 1.5', () => {
    setDpr(1.5);
    renderPanel();
    expect(slider().min).toBe('0.35');
  });

  it('shows a stored Low-preset 40% as 50% on DPR 1, without rewriting it', () => {
    setDpr(1);
    useGraphicsStore.getState().setGraphicsSetting('resolutionScale', 0.4);
    renderPanel();
    expect(slider()).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText('50%', { selector: 'output' })).toBeInTheDocument();
    expect(useGraphicsStore.getState().graphics.resolutionScale).toBe(0.4);
  });

  // App caps the canvas at 1 device pixel per CSS pixel on Low and 2 above it,
  // so on a DPR-2 Low screen every step above 50% rendered like 50%. Working if
  // the slider ends at the highest step that still changes the picture.
  it('ends at 50% on a DPR-2 screen at Low, where higher steps render like 50%', () => {
    setDpr(2);
    useGraphicsStore.getState().setGraphicsQuality('low');
    useGraphicsStore.getState().setGraphicsSetting('resolutionScale', 1);
    renderPanel();
    expect(slider().max).toBe('0.5');
    expect(slider()).toHaveAttribute('aria-valuemax', '50');
    expect(slider()).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText('50%', { selector: 'output' })).toBeInTheDocument();
    expect(useGraphicsStore.getState().graphics.resolutionScale).toBe(1);
  });

  it('shows a High preset 75% as 70% on a DPR-3 phone, the step where the cap begins', () => {
    setDpr(3);
    useGraphicsStore.getState().setGraphicsQuality('high');
    renderPanel();
    expect(slider().max).toBe('0.7');
    expect(slider()).toHaveAttribute('aria-valuenow', '70');
    const ticks = Array.from(slider().nextElementSibling?.children ?? []).map(
      (tick) => tick.textContent
    );
    expect(ticks).toEqual(['25%', '50%', '70%']);
  });

  it('keeps 100% on a DPR-1 screen at High', () => {
    setDpr(1);
    useGraphicsStore.getState().setGraphicsQuality('high');
    renderPanel();
    expect(slider().max).toBe('1');
  });

  it('follows a devicePixelRatio change (browser zoom or another monitor)', () => {
    setDpr(1);
    renderPanel();
    expect(slider().min).toBe('0.5');
    setDpr(2);
    fireEvent(window, new Event('resize'));
    expect(slider().min).toBe('0.25');
  });
});
