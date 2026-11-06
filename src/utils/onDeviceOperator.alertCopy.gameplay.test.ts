import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requestJevAdvice: vi.fn(),
  executeAgentCommand: vi.fn(),
}));
vi.mock('./jevClient', () => ({ requestJevAdvice: mocks.requestJevAdvice }));
vi.mock('../agent/client/executeAgentCommand', () => ({
  executeAgentCommand: mocks.executeAgentCommand,
}));
vi.mock('./webgpuClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./webgpuClient')>()),
  webgpuClient: { isConnected: () => true, onEngineLost: () => () => undefined },
}));

import { setLocale } from '../i18n';
import { alertText, keyedText } from '../i18n/alertCopy';
import { useAnnouncementsStore } from '../stores/announcementsStore';
import { useAIConfigStore } from '../stores/aiConfigStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import { useUIStore } from '../stores/uiStore';
import { initializeOnDeviceOperator } from './onDeviceOperator';

// The bell keeps the on-device operator's notices (and a reload restores them),
// but each was stored as text in the language it was filed in. Working if a
// notice filed in English reads in Portuguese once the player switches.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('on-device operator notices follow the language', () => {
  let release: () => void;
  beforeEach(() => {
    setLocale('en');
    useOperationsCampaignStore.setState({ incidents: [] });
    useUIStore.setState({ alerts: [] });
    useGameSimulationStore.setState({ emergencyActive: false, emergencyDrillMode: false });
    useAIConfigStore.setState({ lightsOut: true, webgpuModelReady: true });
    mocks.requestJevAdvice.mockReset();
    mocks.executeAgentCommand.mockReset();
    release = initializeOnDeviceOperator();
  });
  afterEach(() => {
    release();
    setLocale('en');
    useGameSimulationStore.setState({ emergencyActive: false });
    useAIConfigStore.setState({ webgpuModelReady: false });
  });

  it('reads a handled notice in Portuguese after the switch', async () => {
    mocks.requestJevAdvice.mockResolvedValue({ queue: 'Equipment maintenance', receivedAt: 0 });
    mocks.executeAgentCommand.mockResolvedValue({
      receipt: { status: 'verified' },
      preview: { status: 'ready' },
    });
    useOperationsCampaignStore.getState().triggerIncident('power_sag');
    for (let i = 0; i < 8; i++) await settle();
    const notice = useUIStore.getState().alerts[0];
    expect(notice).toBeDefined();
    expect(alertText(notice!).message).toContain('acknowledged and mitigated');
    setLocale('pt-BR');
    const text = alertText(notice!);
    expect(text.title).toContain('IA no dispositivo');
    expect(text.message).toContain('Queda de tensão na unidade');
    expect(text.message).toContain('reconhecida e mitigada');
  });

  it('reads a refusal and its kernel reason in Portuguese after the switch', async () => {
    mocks.requestJevAdvice.mockResolvedValue({ queue: 'Equipment maintenance', receivedAt: 0 });
    mocks.executeAgentCommand.mockResolvedValueOnce({
      receipt: { status: 'rejected', problems: [{ message: 'Incident must be raised.' }] },
      preview: { status: 'denied' },
    });
    useOperationsCampaignStore.getState().triggerIncident('power_sag');
    for (let i = 0; i < 5; i++) await settle();
    const notice = useUIStore.getState().alerts[0];
    expect(alertText(notice!).message).toContain('Incident must be raised.');
    setLocale('pt-BR');
    const message = alertText(notice!).message;
    expect(message).not.toContain('Incident must be raised.');
    expect(message).toMatch(/ocorrência/i);
  });

  // The PA caption (queued, or restored from the transcript) kept the language
  // it was made in. Working if the queued line reads in Portuguese after a switch.
  it('reads the PA caption in Portuguese after the switch', async () => {
    useAnnouncementsStore.setState({ announcements: [], lastAnnouncementTime: {} });
    mocks.requestJevAdvice.mockResolvedValue({ queue: 'Equipment maintenance', receivedAt: 0 });
    mocks.executeAgentCommand.mockResolvedValue({
      receipt: { status: 'verified' },
      preview: { status: 'ready' },
    });
    useOperationsCampaignStore.getState().triggerIncident('power_sag');
    for (let i = 0; i < 8; i++) await settle();
    const line = useAnnouncementsStore.getState().announcements[0];
    expect(line).toBeDefined();
    expect(keyedText(line!.copy, line!.message)).toContain('acknowledged and mitigated');
    setLocale('pt-BR');
    const caption = keyedText(line!.copy, line!.message);
    expect(caption).toContain('IA no dispositivo');
    expect(caption).toContain('reconhecida e mitigada');
  });

  it('reads a stand-down notice in Portuguese after the switch', async () => {
    useGameSimulationStore.setState({ emergencyActive: true });
    useOperationsCampaignStore.getState().triggerIncident('power_sag');
    await settle();
    const notice = useUIStore.getState().alerts.find((a) => a.id.endsWith('-stoodDown'));
    expect(notice).toBeDefined();
    expect(alertText(notice!).message).toContain('while the emergency stop is active');
    setLocale('pt-BR');
    expect(alertText(notice!).message).toContain('enquanto a parada de emergência está ativa');
  });
});
