import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../../../stores/uiStore';
import { registerSceneCapture } from '../../../utils/sceneCapture';
import { setLocale, translate } from '../../../i18n';
import { alertText } from '../../../i18n/alertCopy';
import { screenshotButtonMessages } from '../../game/ScreenshotButton.messages';
import { QuickActionsSection } from './OverviewPanel';

// Overview's Screenshot button must say so when no frame can be captured,
// as the HUD screenshot button already does, rather than doing nothing.

describe('Overview screenshot without a rendering surface', () => {
  beforeEach(() => {
    setLocale('en');
    registerSceneCapture(null);
    useUIStore.setState({ alerts: [] });
  });

  afterEach(() => {
    cleanup();
    useUIStore.setState({ alerts: [] });
  });

  it('raises a warning instead of silently doing nothing', async () => {
    render(<QuickActionsSection />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Screenshot' }));
    });
    const alert = useUIStore.getState().alerts.at(-1);
    expect(alert?.title).toBe('Screenshot Failed');
    expect(alert?.type).toBe('warning');
  });

  it('words the kept warning in the language active when the bell shows it', async () => {
    render(<QuickActionsSection />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Screenshot' }));
    });
    const alert = useUIStore.getState().alerts.at(-1)!;
    expect(alertText(alert).title).toBe('Screenshot Failed');
    setLocale('pt-BR');
    try {
      expect(alertText(alert)).toEqual({
        title: translate(screenshotButtonMessages, 'failedTitle'),
        message: translate(screenshotButtonMessages, 'surfaceUnavailable'),
      });
      expect(alertText(alert).title).not.toBe('Screenshot Failed');
    } finally {
      setLocale('en');
    }
  });

  it('raises nothing when the frame is saved', async () => {
    registerSceneCapture(() => 'data:image/png;base64,AAAA');
    render(<QuickActionsSection />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Screenshot' }));
    });
    expect(useUIStore.getState().alerts).toHaveLength(0);
    registerSceneCapture(null);
  });
});
