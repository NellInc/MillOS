import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// The store prewarms the local model 2.5 s after import; faked before the
// import and released before the first test, that timer never fires here.
vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ['setTimeout'] });
});
beforeAll(() => {
  vi.useRealTimers();
});

import { AchievementsPanel } from '../../game/AchievementsPanel';
import { DecisionReplay } from '../DecisionReplay';
import { AISettingsModal } from '../../AISettingsModal';
import { WebGPUClient } from '../../../utils/webgpuClient';
import type { AIDecision } from '../../../types';

const decision: AIDecision = {
  id: 'decision-escape',
  timestamp: new Date(1_700_000_000_000),
  type: 'optimization',
  action: 'Balance the packing lines',
  reasoning: 'Line 2 is starved',
  confidence: 0.82,
  impact: 'Steadier output',
  status: 'completed',
  priority: 'medium',
};

// These dialogs close on Escape through their focus trap, which listens on the
// dialog element. A click on the dialog's text (not a control) sent focus to
// <body>, and Escape then did nothing. Working if Escape still closes them.
describe('Escape after a click on a dialog’s text', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const clickTextThenEscape = async (onClose: () => void) => {
    const user = userEvent.setup();
    const dialog = screen.getByRole('dialog');
    await user.click(dialog);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  };

  it('Achievements', async () => {
    const onClose = vi.fn();
    render(<AchievementsPanel onClose={onClose} />);
    await clickTextThenEscape(onClose);
  });

  it('Decision replay', async () => {
    const onClose = vi.fn();
    render(<DecisionReplay decision={decision} onClose={onClose} />);
    await clickTextThenEscape(onClose);
  });

  it('AI settings', async () => {
    vi.spyOn(WebGPUClient, 'isModelCached').mockResolvedValue(true);
    vi.spyOn(WebGPUClient, 'getCacheStorageSize').mockResolvedValue(null);
    const onClose = vi.fn();
    render(<AISettingsModal isOpen onClose={onClose} />);
    await clickTextThenEscape(onClose);
  });
});
