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
import { useAIConfigStore } from '../stores/aiConfigStore';
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import { useUIStore } from '../stores/uiStore';
import { initializeOnDeviceOperator } from './onDeviceOperator';

// A command the kernel refused was reported with the kernel's English problem
// line inside an otherwise Portuguese notice ("...: Incident must be raised.").
// Working if a pt-BR player reads the refusal in Portuguese.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the on-device operator reporting a refusal in Portuguese', () => {
  let release: () => void;
  beforeEach(() => {
    setLocale('pt-BR');
    useOperationsCampaignStore.setState({ incidents: [] });
    useUIStore.setState({ alerts: [] });
    useAIConfigStore.setState({ lightsOut: true, webgpuModelReady: true });
    mocks.requestJevAdvice.mockReset();
    mocks.executeAgentCommand.mockReset();
    release = initializeOnDeviceOperator();
  });
  afterEach(() => {
    release();
    setLocale('en');
    useAIConfigStore.setState({ webgpuModelReady: false });
  });

  it('names the refusal in the reader language', async () => {
    mocks.requestJevAdvice.mockResolvedValue({ queue: 'Equipment maintenance', receivedAt: 0 });
    mocks.executeAgentCommand.mockResolvedValueOnce({
      receipt: { status: 'rejected', problems: [{ message: 'Incident must be raised.' }] },
      preview: { status: 'denied' },
    });
    useOperationsCampaignStore.getState().triggerIncident('power_sag');
    for (let i = 0; i < 5; i++) await settle();
    const message = useUIStore.getState().alerts[0]?.message ?? '';
    expect(message).not.toContain('Incident must be raised.');
    expect(message).toMatch(/ocorrência/i);
  });

  // The route is the English queue name the model answers with; the notice
  // printed it as-is ("IA no dispositivo · Logistics coordination").
  // Working if the bell names the route and the expected queue in Portuguese.
  it('names the route and the expected queue in Portuguese', async () => {
    mocks.requestJevAdvice.mockResolvedValue({ queue: 'Equipment maintenance', receivedAt: 0 });
    mocks.executeAgentCommand.mockResolvedValue({
      receipt: { status: 'verified' },
      preview: { status: 'ready' },
    });
    useOperationsCampaignStore.getState().triggerIncident('delayed_truck');
    for (let i = 0; i < 8; i++) await settle();
    const alert = useUIStore.getState().alerts[0];
    expect(alert?.title).toBe('IA no dispositivo · Manutenção de equipamentos');
    expect(alert?.message).toContain('Coordenação logística');
    expect(`${alert?.title} ${alert?.message}`).not.toMatch(
      /Equipment maintenance|Logistics coordination/
    );
  });

  // The notice copied the incident's stored title, so an incident raised before
  // a switch to Portuguese was reported as "Site power sag: reconhecida e
  // mitigada." Working if the notice names it in the language chosen now.
  it('names an incident raised in English in the language chosen since', async () => {
    mocks.requestJevAdvice.mockResolvedValue({ queue: 'Equipment maintenance', receivedAt: 0 });
    mocks.executeAgentCommand.mockResolvedValue({
      receipt: { status: 'verified' },
      preview: { status: 'ready' },
    });
    setLocale('en');
    useOperationsCampaignStore.getState().triggerIncident('power_sag');
    setLocale('pt-BR');
    for (let i = 0; i < 8; i++) await settle();
    const message = useUIStore.getState().alerts[0]?.message ?? '';
    expect(message).toContain('Queda de tensão na unidade');
    expect(message).not.toContain('Site power sag');
  });
});
