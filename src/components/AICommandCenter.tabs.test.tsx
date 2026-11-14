import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AICommandCenter } from './AICommandCenter';
import { useProductionStore } from '../stores/productionStore';
import { useUIStore } from '../stores/uiStore';
import { setLocale } from '../i18n';

vi.mock('../utils/onDeviceOperator', () => ({ initializeOnDeviceOperator: () => () => {} }));
vi.mock('./AISettingsModal', () => ({ AISettingsModal: () => null }));
vi.mock('./ui/JevAdvisoryPanel', () => ({ JevAdvisoryPanel: () => null }));
vi.mock('./ui/OnDeviceOperatorRecord', () => ({ OnDeviceOperatorRecord: () => null }));
vi.mock('./ui/ActionPlanTimeline', () => ({ ActionPlanTimeline: () => null }));
vi.mock('./ui/StrategicPriorityCards', () => ({ StrategicPriorityCards: () => null }));
vi.mock('./ui/VCLDebugPanel', () => ({ VCLDebugPanel: () => null }));
vi.mock('./ui/VCLDiffPanel', () => ({ VCLDiffPanel: () => null }));
vi.mock('./ui/DecisionReplay', () => ({
  DecisionReplay: () => null,
  DecisionReplayTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// The capture pass: in Portuguese the advisory tab's icon sat above
// "Recomendações". Working if each tab keeps its icon and label on one line.

beforeEach(() => {
  useUIStore.setState({ alerts: [] });
  useProductionStore.setState({ aiDecisions: [] });
});
afterEach(() => {
  cleanup();
  setLocale('en');
});

it.each(['en', 'pt-BR'] as const)('keeps icon and label on one line in %s', (locale) => {
  setLocale(locale);
  render(<AICommandCenter isOpen onClose={() => {}} embedded />);
  const tabs = screen.getAllByRole('tab');
  expect(tabs).toHaveLength(3);
  for (const tab of tabs) {
    expect(tab.className).toMatch(/\binline-flex\b/);
    expect(tab.className).toMatch(/\bwhitespace-nowrap\b/);
    expect(tab.querySelector('svg')!.getAttribute('class')).not.toMatch(/\binline\b/);
  }
});
