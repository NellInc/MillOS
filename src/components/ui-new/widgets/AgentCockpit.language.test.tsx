import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AgentCockpit } from './AgentCockpit';
import { agentCockpitMessages } from './AgentCockpit.messages';
import { installMillOSAgentRuntime } from '../../../agent/adapters/runtime/installAgentRuntime';
import { captureMillOSAgentState } from '../../../agent/adapters/runtime/runtimeProjection';
import { createMillOSRuntimeCommandHandlers } from '../../../agent/adapters/runtime/runtimeCommandHandlers';
import { SYSTEM_REGISTRY_SOURCE } from '../../../agent/registry/systemRegistrySource.js';
import type { AgentCommandEnvelope } from '../../../agent/contracts/commandContracts';
import { setLocale, translate } from '../../../i18n';
import { useProductionStore } from '../../../stores/productionStore';
import { MachineType, type MachineData } from '../../../types';

// PLAYTEST-4: in Portuguese the Autonomy cockpit still read 'attention',
// 'SIMULATION', 'Silo Alpha is warning.', an English objection behind
// 'Objeção:', and every command title in English. The registry's contract
// text and hashes stay as they are; the cockpit translates what it shows.
describe('the agent cockpit in Portuguese', () => {
  const removals: Array<() => void> = [];
  const originalMachines = useProductionStore.getState().machines;
  afterEach(() => {
    cleanup();
    removals.splice(0).forEach((remove) => remove());
    setLocale('en');
    useProductionStore.setState({ machines: originalMachines });
  });

  it('shows the situation brief, exceptions, objection and command list in pt-BR', () => {
    useProductionStore.setState({
      machines: [
        {
          id: 'silo-alpha',
          name: 'Silo Alpha',
          type: MachineType.SILO,
          position: [0, 0, 0],
          size: [1, 1, 1],
          rotation: 0,
          status: 'warning',
          lastMaintenance: '',
          nextMaintenance: '',
          metrics: { rpm: 0, temperature: 20, vibration: 0, load: 50, wear: 0, efficiency: 90 },
        } as MachineData,
      ],
    });
    removals.push(installMillOSAgentRuntime(window));
    setLocale('pt-BR');
    render(<AgentCockpit />);

    const brief = screen.getByRole('region', { name: 'Resumo da situação' });
    expect(brief).not.toHaveTextContent(/\battention\b/);
    expect(brief).not.toHaveTextContent(/\bsimulation\b/i);
    expect(brief).toHaveTextContent('Atenção');
    expect(brief).toHaveTextContent('simulação');

    const queue = screen.getByRole('region', { name: 'Fila de exceções' });
    expect(queue).toHaveTextContent('Silo Alpha está em alerta.');
    expect(queue).not.toHaveTextContent('is warning');
    expect(queue).not.toHaveTextContent('External SCADA writes');
    expect(queue).toHaveTextContent('Objeção: As gravações SCADA externas');

    const select = screen.getByLabelText('Capacidade');
    const titles = within(select)
      .getAllByRole('option')
      .map((option) => option.textContent ?? '');
    for (const english of [
      'Activate a production order',
      'Request controlled machine restart',
      'Place a product batch on quality hold',
      'Release the shipping transfer',
      'Start a simulated fire drill',
    ]) {
      expect(titles).not.toContain(english);
    }
    expect(titles).toContain('Ativar um pedido de produção');
    expect(titles).toContain('Iniciar um simulado de evacuação');
  });

  // The default reason was captured into state in the language the cockpit
  // first rendered in, so after a switch it stayed English in a Portuguese
  // form (and was sent as the command's reason). An edited reason is the
  // player's own text and is kept.
  it('shows the untouched default reason in the language chosen now', () => {
    removals.push(installMillOSAgentRuntime(window));
    render(<AgentCockpit />);
    expect(screen.getByLabelText('Reason')).toHaveValue(
      'Advance the current production objective.'
    );
    act(() => setLocale('pt-BR'));
    expect(screen.getByLabelText('Motivo')).toHaveValue('Avançar o objetivo de produção atual.');
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Minha razão' } });
    act(() => setLocale('en'));
    expect(screen.getByLabelText('Reason')).toHaveValue('Minha razão');
  });

  it('shows a fire-drill preview in pt-BR', async () => {
    removals.push(installMillOSAgentRuntime(window));
    setLocale('pt-BR');
    render(<AgentCockpit />);
    fireEvent.change(screen.getByLabelText('Capacidade'), {
      target: { value: 'simulation.start-fire-drill' },
    });
    expect(screen.getByLabelText('Total de zonas')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Pré-visualizar/ }));
    });
    const preview = screen.getByRole('region', { name: 'Prévia atual' });
    expect(preview).not.toHaveTextContent('Activate the simulated fire-drill');
    expect(preview).not.toHaveTextContent('No emergency or crisis');
    expect(preview).toHaveTextContent('Parar a produção simulada e os equipamentos móveis.');
  });

  // Every effect, precondition, invariant and verification line a handler can
  // put in front of the player has a Portuguese rendering.
  it('has a Portuguese rendering for every handler line', async () => {
    setLocale('pt-BR');
    const capture = captureMillOSAgentState();
    const targets: Record<string, string> = {
      'operations.activate-order': 'millos://order/order-x',
      'incident.acknowledge': 'millos://incident/incident-x',
      'incident.mitigate': 'millos://incident/incident-x',
      'workplace.activate-plan': 'millos://simulation/local',
      'ai.respond-to-decision': 'millos://decision/decision-x',
      'maintenance.request-repair': 'millos://breakdown/breakdown-x',
      'maintenance.request-restart': 'millos://breakdown/breakdown-x',
      'quality.hold-batch': 'millos://batch/batch-x',
      'quality.release-batch': 'millos://batch/batch-x',
      'dispatch.release': 'millos://dispatch/shipping',
      'simulation.set-speed': 'millos://simulation/local',
      'simulation.start-fire-drill': 'millos://simulation/local',
      'scada.acknowledge-alarm': 'millos://alarm/alarm-x',
      'scada.write-setpoint': 'millos://tag/tag-x',
    };
    const lines = new Set<string>();
    for (const handler of createMillOSRuntimeCommandHandlers()) {
      const command = {
        capabilityId: handler.capabilityId,
        targetUri: targets[handler.capabilityId],
        parameters: { disposition: 'accepted', speed: 1.5, value: 12.5, reason: '' },
        mode: 'simulation',
        reason: 'test',
      } as unknown as AgentCommandEnvelope;
      const inspection = await handler.inspect(command, capture);
      inspection.effects.forEach((line) => lines.add(line));
      // The workplace readiness reasons arrive already translated
      // (bilateralWorkplace resolves them in the reader's language).
      [...inspection.preconditions, ...inspection.invariants]
        .filter((item) => item.id !== 'PRE.WORKPLACE.READY')
        .forEach((item) => lines.add(item.detail));
      const verification = await handler.verify(command, capture, capture, { changed: false });
      verification.forEach((item) => lines.add(item.detail));
    }
    expect(lines.size).toBeGreaterThan(40);
    const untranslated = [...lines].filter((line) => {
      const shown = translate(agentCockpitMessages, 'agentText', { text: line });
      return shown === line || shown === 'agentText';
    });
    expect(untranslated).toEqual([]);
  });

  it('leaves English copy exactly as the runtime wrote it', () => {
    // The first command descriptor, read through the typed registry.
    const descriptor = SYSTEM_REGISTRY_SOURCE.capabilities.find(
      (item) => item.id === 'workplace.activate-plan'
    )!;
    expect(
      translate(agentCockpitMessages, 'capabilityTitle', {
        id: descriptor.id,
        title: descriptor.title,
      })
    ).toBe(descriptor.title);
    expect(translate(agentCockpitMessages, 'agentText', { text: 'Silo Alpha is warning.' })).toBe(
      'Silo Alpha is warning.'
    );
  });
});
