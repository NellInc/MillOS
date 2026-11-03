import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeSCADA, shutdownSCADA } from '../SCADAService';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { setLocale } from '../../i18n';
import { createMillOSRuntimeCommandHandlers } from '../../agent/adapters/runtime/runtimeCommandHandlers';
import { HUMAN_OPERATOR_URI } from '../../agent/command/authority';
import type { AgentCommandInspection } from '../../agent/command/commandKernel';

const TAG = 'RM103.ST001.SP';

const setpointEntries = () =>
  useOperationsCampaignStore.getState().logbook.filter((entry) => entry.relatedId === TAG);

describe('SCADA setpoint writes are decisions in the campaign log', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date('2026-10-19T12:00:00Z'));
    setLocale('en');
    useOperationsCampaignStore.getState().resetCampaign();
    await initializeSCADA({ mode: 'simulation', connection: { type: 'simulation' } });
  });

  afterEach(async () => {
    await shutdownSCADA();
    vi.useRealTimers();
    useOperationsCampaignStore.getState().resetCampaign();
  });

  it('tags an agent write-setpoint command as the agent, with the tag and value', async () => {
    const handler = createMillOSRuntimeCommandHandlers().find(
      (candidate) => candidate.capabilityId === 'scada.write-setpoint'
    )!;
    await handler.execute({
      targetUri: `millos://tag/${TAG}`,
      parameters: { value: 1500 },
    } as never);

    expect(setpointEntries()).toEqual([
      expect.objectContaining({
        actor: 'agent',
        category: 'operation',
        message: 'RM-103 Speed Setpoint set to 1,500 RPM.',
      }),
    ]);
  });

  it('previews an out-of-range agent setpoint as refused, as the service will refuse it', async () => {
    const handler = createMillOSRuntimeCommandHandlers().find(
      (candidate) => candidate.capabilityId === 'scada.write-setpoint'
    )!;
    const range = (value: number) =>
      (
        handler.inspect(
          { targetUri: `millos://tag/${TAG}`, parameters: { value } } as never,
          {} as never
        ) as AgentCommandInspection
      ).preconditions.find((item) => item.id === 'PRE.TAG.RANGE');

    expect(range(1500)?.satisfied).toBe(true);
    expect(range(2500)?.satisfied).toBe(false);
    expect(range(Number.NaN)?.satisfied).toBe(false);
  });

  it('tags a write the human operator issued through the command path as the operator', async () => {
    const handler = createMillOSRuntimeCommandHandlers().find(
      (candidate) => candidate.capabilityId === 'scada.write-setpoint'
    )!;
    await handler.execute({
      targetUri: `millos://tag/${TAG}`,
      actorUri: HUMAN_OPERATOR_URI,
      parameters: { value: 1250 },
    } as never);

    expect(setpointEntries()).toEqual([
      expect.objectContaining({
        actor: 'operator',
        message: 'RM-103 Speed Setpoint set to 1,250 RPM.',
      }),
    ]);
  });

  it('logs an operator write from the SCADA hook path, and nothing for untagged or refused writes', async () => {
    const { getSCADAService } = await import('../SCADAService');
    const service = getSCADAService();

    // A write with no actor is the plant's own (automation, replay): not a decision.
    await expect(service.writeSetpoint(TAG, 1100)).resolves.toBe(true);
    // A refused write changed nothing, so it is not a decision either.
    await expect(service.writeSetpoint('RM103.TT001.PV', 80, 'operator')).resolves.toBe(false);
    expect(useOperationsCampaignStore.getState().logbook).toEqual([]);

    await expect(service.writeSetpoint(TAG, 1300, 'operator')).resolves.toBe(true);
    expect(setpointEntries()).toEqual([
      expect.objectContaining({
        actor: 'operator',
        message: 'RM-103 Speed Setpoint set to 1,300 RPM.',
      }),
    ]);
  });
});

// Every other logbook line now carries its wording and follows the language; a
// setpoint decision kept its frozen reading ('1,234.5' in pt-BR). Working if
// the line re-words in Portuguese with Portuguese grouping.
describe('setpoint decision wording', () => {
  it('re-words a setpoint decision after a switch to pt-BR', async () => {
    const { recordSetpointDecision } = await import('../setpointDecisionLog');
    const { logWordingText } = await import('../../stores/operationsCampaignStore');
    useOperationsCampaignStore.setState({ logbook: [] });
    setLocale('en');
    recordSetpointDecision(
      { id: TAG, name: 'RM-103 Speed Setpoint', engUnit: 'RPM' },
      1234.5,
      'operator'
    );
    const [entry] = useOperationsCampaignStore.getState().logbook;
    setLocale('pt-BR');
    try {
      expect(logWordingText(entry.wording)).toContain('1.234,5');
    } finally {
      setLocale('en');
      useOperationsCampaignStore.setState({ logbook: [] });
    }
  });
});
