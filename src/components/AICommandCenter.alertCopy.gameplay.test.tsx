import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AICommandCenter } from './AICommandCenter';
import { useUIStore } from '../stores/uiStore';
import { defineMessages, setLocale } from '../i18n';
import { registerAlertCatalog } from '../i18n/alertCopy';

vi.mock('../utils/onDeviceOperator', () => ({ initializeOnDeviceOperator: () => () => {} }));
vi.mock('./AISettingsModal', () => ({ AISettingsModal: () => null }));
vi.mock('./ui/JevAdvisoryPanel', () => ({
  JevAdvisoryPanel: ({ latestAlert }: { latestAlert?: string }) => (
    <pre data-testid="latest-alert">{latestAlert ?? ''}</pre>
  ),
}));
vi.mock('./ui/OnDeviceOperatorRecord', () => ({ OnDeviceOperatorRecord: () => null }));
vi.mock('./ui/ActionPlanTimeline', () => ({ ActionPlanTimeline: () => null }));
vi.mock('./ui/StrategicPriorityCards', () => ({ StrategicPriorityCards: () => null }));
vi.mock('./ui/VCLDebugPanel', () => ({ VCLDebugPanel: () => null }));
vi.mock('./ui/VCLDiffPanel', () => ({ VCLDiffPanel: () => null }));
vi.mock('./ui/DecisionReplay', () => ({ DecisionReplay: () => null }));

const catalog = defineMessages({
  en: { title: 'Bearing hot', message: 'Roller mill bearing above limit.' },
  'pt-BR': { title: 'Rolamento quente', message: 'Rolamento do moinho acima do limite.' },
});
registerAlertCatalog('aiCommandCenterTest', catalog);

// "Review latest alert" fills the advisory with the newest bell notice. It read
// the notice's stored text, in the language it was filed in, so a player who
// switched to Portuguese sent the model (and saw in the box) the English
// notice the bell itself now shows in Portuguese. Working if the advisory gets
// the notice as the bell words it now.
describe('the advisory reads the latest notice in the language chosen now', () => {
  beforeEach(() => {
    setLocale('en');
    useUIStore.setState({ alerts: [] });
  });
  afterEach(() => {
    cleanup();
    setLocale('en');
  });

  it('passes the keyed notice in Portuguese after the switch', () => {
    useUIStore.getState().addAlert({
      id: 'keyed',
      type: 'warning',
      title: 'Bearing hot',
      message: 'Roller mill bearing above limit.',
      timestamp: new Date(),
      acknowledged: false,
      copy: { catalog: 'aiCommandCenterTest', title: 'title', message: 'message' },
    });
    render(<AICommandCenter isOpen onClose={() => undefined} embedded />);
    act(() => setLocale('pt-BR'));
    fireEvent.click(screen.getByRole('tab', { name: /recomendações/i }));
    const latest = screen.getByTestId('latest-alert').textContent ?? '';
    expect(latest).toContain('Rolamento quente');
    expect(latest).toContain('Rolamento do moinho acima do limite.');
    expect(latest).not.toContain('Bearing hot');
  });
});
