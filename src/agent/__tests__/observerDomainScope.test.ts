import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installMillOSAgentRuntime } from '../adapters/runtime/installAgentRuntime';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useIncidentReplayStore } from '../../stores/incidentReplayStore';
import {
  AgentAuthorityEngine,
  createDefaultActors,
  createDefaultGrants,
  createDefaultPolicy,
} from '../command/authority';
import { AgentCausalLedger } from '../command/causalLedger';
import { createAgentCommandKernel } from '../command/commandKernel';
import { SYSTEM_REGISTRY_SOURCE } from '../registry/systemRegistrySource.js';
import type { AgentDomainCapture, AgentJsonValue } from '../contracts/queryContracts';
import type { AgentDomainId } from '../contracts/systemManifest';
import { createTranslator } from '../../i18n';
import { agentCockpitMessages } from '../../components/ui-new/widgets/AgentCockpit.messages';

// In the mounted app RuntimeController subscribes to the plant's stores and
// writes a diagnostic command to the incident replay log synchronously when the
// game speed, weather, a safety event, the newest AI decision or a truck
// changes. The agent plane projects that log as `evidence.commands`, so every
// command that caused one of those changes read as a domain-scope violation
// and its receipt said `failed` although the command worked; the on-device
// operator then treated a mitigation it had done as not handled.
// Working if a write by that observer is recorded as the observer's in the
// receipt, and any other write outside a handler's domains still fails.

/**
 * STAND-IN for RuntimeController's recorder (src/components/RuntimeController.tsx,
 * the useGameSimulationStore subscription): same store, same trigger, same
 * synchronous write. It is a test fixture, not the real component.
 */
function standInRuntimeControllerRecorder(): () => void {
  return useGameSimulationStore.subscribe((state, previous) => {
    if (state.gameSpeed !== previous.gameSpeed) {
      useIncidentReplayStore.getState().recordCommand({
        timestamp: Date.now(),
        category: 'control',
        action: 'game_speed_changed',
        data: { value: state.gameSpeed },
      });
    }
  });
}

describe('a plant observer writing evidence during a commit', () => {
  const cleanups: Array<() => void> = [];
  let speedBefore = 1;
  beforeEach(() => {
    speedBefore = useGameSimulationStore.getState().gameSpeed;
    useIncidentReplayStore.setState({ replayMode: false });
  });
  afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
    useGameSimulationStore.setState({ gameSpeed: speedBefore });
    useIncidentReplayStore.setState({ replayMode: false });
  });

  const setSpeed = async (speed: number) => {
    const target = {} as Window;
    cleanups.push(installMillOSAgentRuntime(target));
    const api = target.__MILLOS_AGENT__!;
    const preview = await api.preview(
      api.draft({
        capabilityId: 'simulation.set-speed',
        targetUri: 'millos://simulation/main',
        parameters: { simulationUri: 'millos://simulation/main', speed },
        reason: 'Change the plant speed.',
      })
    );
    expect(preview.status).toBe('ready');
    return api.commit(preview);
  };
  const otherSpeed = () => (useGameSimulationStore.getState().gameSpeed === 2 ? 3 : 2);

  it('verifies a speed change the recorder logged, naming evidence.commands as the observer’s', async () => {
    cleanups.push(standInRuntimeControllerRecorder());
    const receipt = await setSpeed(otherSpeed());
    expect(receipt.changedDomains).toContain('evidence');
    expect(receipt.status).toBe('verified');
    const scope = receipt.verification.find((item) => item.id === 'INV.COMMAND.DOMAIN_SCOPE');
    expect(scope).toMatchObject({ passed: true });
    expect(scope?.detail).toContain('evidence.commands');
    expect(scope?.detail).toContain('observer');
  });

  it('still fails and names the key when any other evidence key changes during the commit', async () => {
    cleanups.push(
      useGameSimulationStore.subscribe((state, previous) => {
        if (state.gameSpeed !== previous.gameSpeed)
          useIncidentReplayStore.setState({ replayMode: true });
      })
    );
    const receipt = await setSpeed(otherSpeed());
    expect(receipt.status).toBe('failed');
    expect(receipt.verification).toContainEqual(
      expect.objectContaining({
        id: 'INV.COMMAND.DOMAIN_SCOPE',
        passed: false,
        detail: 'Unexpected domain mutations: evidence (replayMode).',
      })
    );
  });

  it('adds no scope item when no observer path changed', async () => {
    const receipt = await setSpeed(otherSpeed());
    expect(receipt.status).toBe('verified');
    expect(receipt.changedDomains).not.toContain('evidence');
    expect(receipt.verification.some((item) => item.id === 'INV.COMMAND.DOMAIN_SCOPE')).toBe(false);
  });
});

describe('the domain-scope check with observer-written paths configured', () => {
  const DOMAINS: AgentDomainId[] = [
    'simulation',
    'production',
    'material',
    'quality',
    'maintenance',
    'campaign',
    'logistics',
    'safety',
    'scada',
    'experience',
    'evidence',
  ];

  // A handler declared to write simulation that also writes production (and,
  // in the second case, the observer key as well): the exemption covers only
  // the named evidence key, never another domain.
  async function commitWith(
    write: (state: Record<string, Record<string, AgentJsonValue>>) => void
  ) {
    const state: Record<string, Record<string, AgentJsonValue>> = Object.fromEntries(
      DOMAINS.map((domainId) => [domainId, { marker: 0 }])
    );
    state.simulation = { gameSpeed: 1 };
    state.evidence = { commands: [], replayMode: false };
    const capture = (): AgentDomainCapture => ({
      domains: structuredClone(state) as Record<AgentDomainId, AgentJsonValue>,
      simulationTime: { day: 1, hour: 6 },
      mode: 'simulation',
      build: 'test',
      seed: 'test',
      completeness: 'complete',
      freshness: [],
      warnings: [],
    });
    const now = () => new Date('2026-11-13T12:00:00.000Z');
    const kernel = createAgentCommandKernel({
      registry: SYSTEM_REGISTRY_SOURCE,
      capture,
      handlers: [
        {
          capabilityId: 'simulation.set-speed',
          allowedDomains: ['simulation'],
          inspect: () => ({ effects: [], uncertainties: [], preconditions: [], invariants: [] }),
          execute: (command) => {
            state.simulation = { gameSpeed: Number(command.parameters.speed) };
            write(state);
            return { changed: true };
          },
          verify: () => [{ id: 'VERIFY.SPEED', passed: true, detail: 'Speed set.' }],
        },
      ],
      authority: new AgentAuthorityEngine({
        actors: createDefaultActors(),
        grants: createDefaultGrants(now()),
        policy: createDefaultPolicy(),
        now,
      }),
      ledger: new AgentCausalLedger({ now }),
      now,
      observerWrittenPaths: { evidence: ['commands'] },
    });
    const preview = await kernel.preview(
      kernel.draft({
        capabilityId: 'simulation.set-speed',
        targetUri: 'millos://simulation/main',
        parameters: { simulationUri: 'millos://simulation/main', speed: 2 },
        reason: 'Scope check.',
      })
    );
    expect(preview.status).toBe('ready');
    return kernel.commit(preview);
  }

  it('still fails a handler that writes a domain it did not declare', async () => {
    const receipt = await commitWith((state) => {
      state.production = { marker: 1 };
    });
    expect(receipt.status).toBe('failed');
    expect(receipt.verification).toContainEqual({
      id: 'INV.COMMAND.DOMAIN_SCOPE',
      passed: false,
      detail: 'Unexpected domain mutations: production (marker).',
    });
  });

  it('names only the undeclared write when the observer also wrote its key', async () => {
    const receipt = await commitWith((state) => {
      state.production = { marker: 1 };
      state.evidence = { ...state.evidence, commands: ['logged'] };
    });
    expect(receipt.status).toBe('failed');
    expect(receipt.verification.filter((item) => item.id === 'INV.COMMAND.DOMAIN_SCOPE')).toEqual([
      {
        id: 'INV.COMMAND.DOMAIN_SCOPE',
        passed: false,
        detail: 'Unexpected domain mutations: production (marker).',
      },
    ]);
  });

  it('reads both scope lines in Portuguese', () => {
    const pt = createTranslator(agentCockpitMessages, 'pt-BR');
    expect(
      pt('agentText', {
        text: 'Domain scope held: an observer of the plant wrote evidence.commands, not this command.',
      })
    ).toBe(
      'Escopo de domínio mantido: um observador da fábrica gravou evidence.commands, não este comando.'
    );
    expect(pt('agentText', { text: 'Unexpected domain mutations: evidence (replayMode).' })).toBe(
      'Mutações inesperadas de domínio: evidence (replayMode).'
    );
  });
});
