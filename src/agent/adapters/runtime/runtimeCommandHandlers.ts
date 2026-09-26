import type { AIDecisionDisposition } from '../../../types';
import { getSCADAService, peekSCADAService } from '../../../scada/SCADAService';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useProductionStore } from '../../../stores/productionStore';
import { useTruckScheduleStore } from '../../../stores/truckScheduleStore';
import { applyDecisionEffects } from '../../../utils/aiEngine';
import type {
  AgentCommandEnvelope,
  AgentVerificationResult,
} from '../../contracts/commandContracts';
import type { AgentJsonValue } from '../../contracts/queryContracts';
import { parseSemanticUri } from '../../ontology/semanticUri.js';
import type { AgentCommandHandler, AgentCommandInspection } from '../../command/commandKernel';

export function createMillOSRuntimeCommandHandlers(): AgentCommandHandler[] {
  return [
    activateOrderHandler(),
    acknowledgeIncidentHandler(),
    mitigateIncidentHandler(),
    respondToDecisionHandler(),
    requestRepairHandler(),
    requestRestartHandler(),
    holdBatchHandler(),
    releaseBatchHandler(),
    releaseDispatchHandler(),
    setSimulationSpeedHandler(),
    startFireDrillHandler(),
    acknowledgeAlarmHandler(),
    writeSetpointHandler(),
  ];
}

function activateOrderHandler(): AgentCommandHandler {
  return {
    capabilityId: 'operations.activate-order',
    allowedDomains: ['campaign'],
    inspect: (command, capture) => {
      const id = localId(command.targetUri, 'order');
      const campaign = record(capture.domains.campaign);
      const order = arrayOfRecords(campaign.orders).find((candidate) => candidate.id === id);
      const simulation = record(capture.domains.simulation);
      return inspection(
        [
          'Make the target order active.',
          'Move any previous active order back to planned.',
          'Reset the execution recipe to planning.',
        ],
        ['Future production and dispatch consequences occur on later central ticks.'],
        [
          check('PRE.ORDER.EXISTS', Boolean(order), `Order ${id} must exist.`),
          check(
            'PRE.ORDER.ACTIVATABLE',
            Boolean(order && order.status !== 'fulfilled' && order.status !== 'cancelled'),
            'Order must be planned, active, or late.'
          ),
          check(
            'PRE.ORDER.TARGET_MATCH',
            command.parameters.orderUri === command.targetUri,
            'orderUri must equal targetUri.'
          ),
        ],
        [
          check(
            'INV.SAFETY.EMERGENCY_DOMINANCE',
            simulation.emergencyActive !== true,
            'Order activation is held during an emergency.'
          ),
          check(
            'INV.RESOURCE.BOUNDED',
            // The logbook is not part of the projected campaign domain, so the
            // bound is read from the live store rather than an absent field.
            useOperationsCampaignStore.getState().logbook.length <= 160,
            'Campaign logbook remains within its 160-entry bound.'
          ),
        ]
      );
    },
    execute: (command) => {
      const orderId = localId(command.targetUri, 'order');
      const before = useOperationsCampaignStore.getState();
      before.activateOrder(orderId);
      const after = useOperationsCampaignStore.getState();
      return {
        changed: before.activeOrderId !== after.activeOrderId,
        activeOrderId: after.activeOrderId,
      };
    },
    verify: (command, _before, after) => {
      const orderId = localId(command.targetUri, 'order');
      const campaign = record(after.domains.campaign);
      const orders = arrayOfRecords(campaign.orders);
      const selected = orders.find((order) => order.id === orderId);
      const active = orders.filter((order) => order.status === 'active');
      const execution = record(campaign.execution);
      return [
        verify(
          'VERIFY.ORDER.ACTIVE_ID',
          campaign.activeOrderId === orderId,
          'Active order ID matches the command target.'
        ),
        verify(
          'VERIFY.ORDER.SINGLE_ACTIVE',
          active.length === 1 && active[0]?.id === orderId,
          'Exactly one order is active.'
        ),
        verify(
          'VERIFY.ORDER.RECIPE',
          execution.orderId === orderId && execution.recipeId === record(selected?.recipe).id,
          'Execution recipe matches the selected order.'
        ),
      ];
    },
  };
}

function acknowledgeIncidentHandler(): AgentCommandHandler {
  return incidentHandler('incident.acknowledge', 'raised', (id) =>
    useOperationsCampaignStore.getState().acknowledgeIncident(id)
  );
}

function mitigateIncidentHandler(): AgentCommandHandler {
  return incidentHandler('incident.mitigate', 'unresolved', (id) =>
    useOperationsCampaignStore.getState().mitigateIncident(id)
  );
}

function incidentHandler(
  capabilityId: 'incident.acknowledge' | 'incident.mitigate',
  requiredPhase: 'raised' | 'unresolved',
  action: (incidentId: string) => void
): AgentCommandHandler {
  const finalPhase = capabilityId === 'incident.acknowledge' ? 'acknowledged' : 'mitigated';
  return {
    capabilityId,
    allowedDomains: ['campaign'],
    inspect: (command, capture) => {
      const id = localId(command.targetUri, 'incident');
      const incident = arrayOfRecords(record(capture.domains.campaign).incidents).find(
        (item) => item.id === id
      );
      const phaseAllowed =
        requiredPhase === 'raised' ? incident?.phase === 'raised' : incident?.phase !== 'resolved';
      return inspection(
        [`Move incident ${id} to ${finalPhase}.`],
        capabilityId === 'incident.mitigate'
          ? [
              'Mitigation reduces the current simulated process effect; later ticks reveal the operational outcome.',
            ]
          : [],
        [
          check('PRE.INCIDENT.EXISTS', Boolean(incident), `Incident ${id} must exist.`),
          check(
            'PRE.INCIDENT.PHASE',
            Boolean(incident && phaseAllowed),
            `Incident must be ${requiredPhase}.`
          ),
        ],
        [
          check(
            'INV.TRUTH.MODE_LABEL',
            command.mode === capture.mode,
            'Command and capture modes agree.'
          ),
        ]
      );
    },
    execute: (command) => {
      const id = localId(command.targetUri, 'incident');
      const before = useOperationsCampaignStore
        .getState()
        .incidents.find((item) => item.id === id)?.phase;
      action(id);
      const after = useOperationsCampaignStore
        .getState()
        .incidents.find((item) => item.id === id)?.phase;
      return { changed: before !== after, phase: after ?? null };
    },
    verify: (command, _before, after) => {
      const id = localId(command.targetUri, 'incident');
      const incident = arrayOfRecords(record(after.domains.campaign).incidents).find(
        (item) => item.id === id
      );
      return [
        verify(
          'VERIFY.INCIDENT.PHASE',
          incident?.phase === finalPhase,
          `Incident phase is ${finalPhase}.`
        ),
      ];
    },
  };
}

function respondToDecisionHandler(): AgentCommandHandler {
  return {
    capabilityId: 'ai.respond-to-decision',
    allowedDomains: ['production'],
    inspect: (command, capture) => {
      const id = localId(command.targetUri, 'decision');
      const decision = arrayOfRecords(record(capture.domains.production).aiDecisions).find(
        (item) => item.id === id
      );
      return inspection(
        [`Record ${String(command.parameters.disposition)} for decision ${id}.`],
        ['Accepted recommendations use the existing production-domain effect interpreter.'],
        [
          check('PRE.DECISION.EXISTS', Boolean(decision), `Decision ${id} must exist.`),
          check(
            'PRE.DECISION.PENDING',
            decision?.status === 'pending',
            'Decision must still be pending.'
          ),
        ],
        [
          check(
            'INV.TRUTH.MODE_LABEL',
            command.mode === capture.mode,
            'Decision response keeps the current truth label.'
          ),
        ]
      );
    },
    execute: (command) => {
      const id = localId(command.targetUri, 'decision');
      const store = useProductionStore.getState();
      const decision = store.aiDecisions.find((candidate) => candidate.id === id);
      if (!decision) return json({ changed: false, reason: 'decision_not_found' });
      const disposition = command.parameters.disposition as AIDecisionDisposition;
      if (disposition === 'modified') {
        // Without the replacement action there is nothing to apply; running the
        // AI's original recommendation instead would be an unauthorised effect.
        if (typeof command.parameters.modifiedAction !== 'string') {
          return json({ changed: false, reason: 'modified_action_required' });
        }
        // Record the replacement and close the decision without running the
        // original recommendation's machine effect: the operator replaced it.
        store.recordDecisionResponse(id, 'modified', {
          modifiedAction: command.parameters.modifiedAction,
          note: stringParameter(command, 'note'),
        });
        useProductionStore
          .getState()
          .updateDecisionStatus(id, 'completed', 'Completed after operator modification');
      } else if (disposition === 'accepted') {
        applyDecisionEffects(decision, 'accepted', { note: stringParameter(command, 'note') });
      } else {
        store.recordDecisionResponse(id, disposition, { note: stringParameter(command, 'note') });
      }
      return json({ changed: true, disposition });
    },
    verify: (command, _before, after) => {
      const id = localId(command.targetUri, 'decision');
      const decision = arrayOfRecords(record(after.domains.production).aiDecisions).find(
        (item) => item.id === id
      );
      const disposition = command.parameters.disposition;
      return [
        verify(
          'VERIFY.DECISION.RESPONSE',
          record(decision?.response).disposition === disposition,
          'Decision response matches the command.'
        ),
      ];
    },
  };
}

function requestRepairHandler(): AgentCommandHandler {
  return {
    capabilityId: 'maintenance.request-repair',
    allowedDomains: ['maintenance'],
    inspect: (command, capture) => {
      const id = localId(command.targetUri, 'breakdown');
      const maintenance = record(capture.domains.maintenance);
      const breakdown = arrayOfRecords(maintenance.activeBreakdowns).find((item) => item.id === id);
      const workOrder = arrayOfRecords(maintenance.workOrders).find(
        (item) => item.breakdownId === id
      );
      const parts = record(maintenance.partsInventory);
      const requiredParts = Array.isArray(workOrder?.requiredParts) ? workOrder.requiredParts : [];
      const missing = requiredParts.filter(
        (part) => typeof part === 'string' && Number(parts[part]) <= 0
      );
      return inspection(
        ['Consume the required simulated parts and move the work order to repairing.'],
        [
          'Repair completion and far-side restart remain separate commands and central-tick consequences.',
        ],
        [
          check('PRE.REPAIR.BREAKDOWN', Boolean(breakdown), `Breakdown ${id} must be active.`),
          check(
            'PRE.REPAIR.PHASE',
            workOrder?.phase === 'diagnosed' || workOrder?.phase === 'awaiting_parts',
            'Work order must be diagnosed or awaiting parts.'
          ),
          check(
            'PRE.REPAIR.PARTS',
            missing.length === 0,
            missing.length === 0
              ? 'Required parts are available.'
              : `Missing parts: ${missing.join(', ')}.`
          ),
        ],
        [
          check(
            'INV.SAFETY.MAINTENANCE_LOCKOUT',
            workOrder?.phase !== 'returned_to_service',
            'Returned equipment cannot re-enter repair through this command.'
          ),
        ]
      );
    },
    execute: (command) =>
      json(useBreakdownStore.getState().startRepair(localId(command.targetUri, 'breakdown'))),
    verify: (command, _before, after, result) => {
      const id = localId(command.targetUri, 'breakdown');
      const workOrder = arrayOfRecords(record(after.domains.maintenance).workOrders).find(
        (item) => item.breakdownId === id
      );
      return [
        verify(
          'VERIFY.REPAIR.STARTED',
          record(result).started === true && workOrder?.phase === 'repairing',
          'Repair result and work-order phase agree.'
        ),
      ];
    },
  };
}

function requestRestartHandler(): AgentCommandHandler {
  return {
    capabilityId: 'maintenance.request-restart',
    allowedDomains: ['maintenance'],
    inspect: (command, capture) => {
      const id = localId(command.targetUri, 'breakdown');
      const workOrder = arrayOfRecords(record(capture.domains.maintenance).workOrders).find(
        (item) => item.breakdownId === id
      );
      return inspection(
        ['Move the verified work order to restart_requested.'],
        ['The central tick owns far-side machine status restoration.'],
        [
          check(
            'PRE.RESTART.VERIFIED',
            workOrder?.phase === 'ready_to_restart',
            'Repair must be independently verified first.'
          ),
        ],
        [
          check(
            'INV.SAFETY.MAINTENANCE_LOCKOUT',
            workOrder?.phase === 'ready_to_restart',
            'Restart cannot bypass repair verification.'
          ),
        ]
      );
    },
    execute: (command) => {
      const changed = useBreakdownStore
        .getState()
        .requestMachineRestart(localId(command.targetUri, 'breakdown'));
      return { changed };
    },
    verify: (command, _before, after) => {
      const id = localId(command.targetUri, 'breakdown');
      const workOrder = arrayOfRecords(record(after.domains.maintenance).workOrders).find(
        (item) => item.breakdownId === id
      );
      return [
        verify(
          'VERIFY.RESTART.REQUESTED',
          workOrder?.phase === 'restart_requested',
          'Work order is queued for controlled restart.'
        ),
      ];
    },
  };
}

function holdBatchHandler(): AgentCommandHandler {
  return batchDispositionHandler('quality.hold-batch', 'hold');
}

function releaseBatchHandler(): AgentCommandHandler {
  return batchDispositionHandler('quality.release-batch', 'released');
}

function batchDispositionHandler(
  capabilityId: 'quality.hold-batch' | 'quality.release-batch',
  disposition: 'hold' | 'released'
): AgentCommandHandler {
  return {
    capabilityId,
    allowedDomains: ['material', 'quality'],
    inspect: (command, capture) => {
      const id = localId(command.targetUri, 'batch');
      const batch = arrayOfRecords(record(capture.domains.material).productionBatches).find(
        (item) => item.id === id
      );
      const alerts = arrayOfRecords(record(capture.domains.quality).contaminationAlerts);
      const contaminationBlocks = alerts.some(
        (alert) =>
          alert.resolved !== true && Array.isArray(alert.batchIds) && alert.batchIds.includes(id)
      );
      const canChange =
        disposition === 'hold'
          ? batch?.disposition !== 'shipped' && batch?.disposition !== 'recalled'
          : batch?.disposition === 'hold' && !contaminationBlocks;
      return inspection(
        [`Set batch ${id} disposition to ${disposition}.`],
        disposition === 'released'
          ? ['Dispatch remains held until every current quality interlock passes.']
          : [],
        [
          check('PRE.BATCH.EXISTS', Boolean(batch), `Batch ${id} must exist.`),
          check(
            'PRE.BATCH.DISPOSITION',
            Boolean(batch && canChange),
            disposition === 'hold'
              ? 'Shipped or recalled product cannot be held.'
              : 'Only a non-contaminated hold may be released.'
          ),
          check(
            'PRE.BATCH.REASON',
            Boolean(stringParameter(command, 'reason')?.trim()),
            'A disposition reason is required.'
          ),
        ],
        [
          check(
            'INV.QUALITY.DISPATCH_RELEASE',
            batch?.disposition !== 'recalled',
            'A recall cannot be reversed by release.'
          ),
        ]
      );
    },
    execute: (command) => {
      const id = localId(command.targetUri, 'batch');
      const changedIds = useMaterialFlowStore
        .getState()
        .setBatchDisposition(
          [id],
          disposition,
          stringParameter(command, 'reason') ?? command.reason
        );
      return { changed: changedIds.includes(id), changedIds };
    },
    verify: (command, _before, after) => {
      const id = localId(command.targetUri, 'batch');
      const batch = arrayOfRecords(record(after.domains.material).productionBatches).find(
        (item) => item.id === id
      );
      return [
        verify(
          'VERIFY.BATCH.DISPOSITION',
          batch?.disposition === disposition,
          `Batch disposition is ${disposition}.`
        ),
      ];
    },
  };
}

function releaseDispatchHandler(): AgentCommandHandler {
  return {
    capabilityId: 'dispatch.release',
    allowedDomains: ['logistics'],
    inspect: (_command, capture) => {
      const logistics = record(capture.domains.logistics);
      const shipping = record(logistics.shipping);
      const quality = record(capture.domains.quality);
      return inspection(
        ['Set shipping transfer readiness for the current docked truck.'],
        ['The truck controller and central tick own physical loading and departure.'],
        [
          check(
            'PRE.DISPATCH.DOCKED',
            shipping.truckDocked === true,
            'A shipping truck must be docked.'
          ),
          check(
            'PRE.DISPATCH.QUALITY',
            quality.dispatchReleased === true,
            `Quality dispatch release is required; current reason: ${String(quality.dispatchHoldReason ?? 'none')}.`
          ),
        ],
        [
          check(
            'INV.QUALITY.DISPATCH_RELEASE',
            quality.dispatchReleased === true,
            'Held or recalled material cannot dispatch.'
          ),
        ]
      );
    },
    execute: () => {
      const store = useTruckScheduleStore.getState();
      const before = store.truckSchedule.shipping.transferReady;
      store.setTruckTransferReady('shipping', true);
      const after = useTruckScheduleStore.getState().truckSchedule.shipping.transferReady;
      return { changed: before !== after, transferReady: after };
    },
    verify: (_command, _before, after) => [
      verify(
        'VERIFY.DISPATCH.TRANSFER_READY',
        record(record(after.domains.logistics).shipping).transferReady === true,
        'Shipping transfer is ready.'
      ),
    ],
  };
}

function setSimulationSpeedHandler(): AgentCommandHandler {
  return {
    capabilityId: 'simulation.set-speed',
    allowedDomains: ['simulation'],
    inspect: (command, capture) =>
      inspection(
        [`Set simulation speed to ${String(command.parameters.speed)}.`],
        ['Changing speed affects future ticks; it does not replay elapsed wall time.'],
        [
          check(
            'PRE.SPEED.FINITE',
            typeof command.parameters.speed === 'number' &&
              Number.isFinite(command.parameters.speed),
            'Speed must be finite.'
          ),
        ],
        [
          check(
            'INV.TRUTH.MODE_LABEL',
            capture.mode === 'simulation' || capture.mode === 'shadow',
            'Speed control is local to simulation or shadow mode.'
          ),
        ]
      ),
    execute: (command) => {
      const before = useGameSimulationStore.getState().gameSpeed;
      useGameSimulationStore.getState().setGameSpeed(Number(command.parameters.speed));
      const after = useGameSimulationStore.getState().gameSpeed;
      return { changed: before !== after, speed: after };
    },
    verify: (command, _before, after) => [
      verify(
        'VERIFY.SPEED.VALUE',
        record(after.domains.simulation).gameSpeed === command.parameters.speed,
        'Simulation speed matches the request.'
      ),
    ],
  };
}

function startFireDrillHandler(): AgentCommandHandler {
  return {
    capabilityId: 'simulation.start-fire-drill',
    allowedDomains: ['simulation', 'production', 'safety'],
    inspect: (_command, capture) => {
      const simulation = record(capture.domains.simulation);
      return inspection(
        [
          'Activate the simulated fire-drill interlock and egress metrics.',
          'Stop simulated production and mobile equipment.',
        ],
        ['Audio and animated movement are presentation consequences verified separately.'],
        [
          check(
            'PRE.DRILL.CLEAR',
            simulation.emergencyActive !== true && record(simulation.crisis).active !== true,
            'No emergency or crisis may already be active.'
          ),
        ],
        [
          check(
            'INV.SAFETY.EMERGENCY_DOMINANCE',
            simulation.emergencyActive !== true,
            'The drill cannot override an active emergency.'
          ),
        ]
      );
    },
    execute: (command) => {
      const before = useGameSimulationStore.getState().emergencyDrillMode;
      const totalZones = command.parameters.totalZones;
      useGameSimulationStore
        .getState()
        .startEmergencyDrill(typeof totalZones === 'number' ? totalZones : undefined);
      return { changed: before !== useGameSimulationStore.getState().emergencyDrillMode };
    },
    verify: (_command, _before, after) => {
      const simulation = record(after.domains.simulation);
      return [
        verify(
          'VERIFY.DRILL.ACTIVE',
          simulation.emergencyDrillMode === true,
          'Fire drill mode is active.'
        ),
        verify(
          'VERIFY.DRILL.METRICS',
          record(simulation.drillMetrics).active === true,
          'Drill metrics are active.'
        ),
      ];
    },
  };
}

function acknowledgeAlarmHandler(): AgentCommandHandler {
  return {
    capabilityId: 'scada.acknowledge-alarm',
    allowedDomains: ['scada'],
    inspect: (command) => {
      const alarmId = localId(command.targetUri, 'alarm');
      const service = peekSCADAService();
      const alarm = service?.getActiveAlarms().find((candidate) => candidate.id === alarmId);
      return inspection(
        [`Acknowledge alarm ${alarmId} without clearing its process condition.`],
        [],
        [
          check(
            'PRE.SCADA.CONNECTED',
            service?.getState().connected === true,
            'SCADA simulation service must be connected.'
          ),
          check('PRE.ALARM.ACTIVE', Boolean(alarm), 'Alarm must be active.'),
          check(
            'PRE.ALARM.UNACKNOWLEDGED',
            alarm?.acknowledgedAt === undefined,
            'Alarm must be unacknowledged.'
          ),
        ],
        [
          check(
            'INV.TRUTH.MODE_LABEL',
            service?.getState().mode === 'simulation',
            'Agent acknowledgement is restricted to the SimulationAdapter.'
          ),
        ]
      );
    },
    execute: (command) => {
      const alarmId = localId(command.targetUri, 'alarm');
      const changed = getSCADAService().acknowledgeAlarm(
        alarmId,
        command.actorUri,
        stringParameter(command, 'note') ?? command.reason
      );
      return { changed };
    },
    verify: (command, _before, _after, result) => {
      // An alarm that had already returned to normal is archived by the
      // acknowledgement and leaves the active set, so accept either the
      // active-alarm record or the acknowledge() result itself.
      const alarm = peekSCADAService()
        ?.getActiveAlarms()
        .find((candidate) => candidate.id === localId(command.targetUri, 'alarm'));
      const acknowledged =
        alarm?.acknowledgedAt !== undefined ||
        (alarm === undefined && record(result).changed === true);
      return [
        verify('VERIFY.ALARM.ACKNOWLEDGED', acknowledged, 'Alarm acknowledgement is recorded.'),
      ];
    },
  };
}

function writeSetpointHandler(): AgentCommandHandler {
  return {
    capabilityId: 'scada.write-setpoint',
    allowedDomains: ['scada'],
    inspect: (command) => {
      const tagId = localId(command.targetUri, 'tag');
      const service = peekSCADAService();
      const tag = service?.getTagDefinition(tagId);
      const state = service?.getState();
      return inspection(
        [`Write ${String(command.parameters.value)} to simulated tag ${tagId} and read it back.`],
        [
          'Live, hybrid, disconnected, and unverified external adapters are intentionally excluded.',
        ],
        [
          check(
            'PRE.SCADA.CONNECTED',
            state?.connected === true,
            'SCADA service must be connected.'
          ),
          check(
            'PRE.SCADA.SIMULATION',
            state?.mode === 'simulation',
            'Only SimulationAdapter writes are authorized.'
          ),
          check(
            'PRE.TAG.WRITABLE',
            Boolean(tag && tag.accessMode !== 'READ'),
            'Tag must exist and be writable.'
          ),
        ],
        [
          check(
            'INV.AUTHORITY.DEFAULT_DENY',
            command.mode !== 'live-external',
            'Live external command mode remains denied.'
          ),
          check(
            'INV.TRUTH.MODE_LABEL',
            state?.mode === 'simulation',
            'Setpoint truth label remains simulated.'
          ),
        ]
      );
    },
    execute: async (command) => {
      const tagId = localId(command.targetUri, 'tag');
      const changed = await getSCADAService().writeSetpoint(
        tagId,
        Number(command.parameters.value)
      );
      const readback = getSCADAService().getValue(tagId)?.value ?? null;
      return { changed, readback: json(readback) };
    },
    verify: (command, _before, _after, result) => [
      verify(
        'VERIFY.SCADA.SETPOINT_READBACK',
        record(result).changed === true &&
          Math.abs(Number(record(result).readback) - Number(command.parameters.value)) <= 1e-6,
        'SimulationAdapter readback matches the requested setpoint.'
      ),
    ],
  };
}

function inspection(
  effects: string[],
  uncertainties: string[],
  preconditions: AgentCommandInspection['preconditions'],
  invariants: AgentCommandInspection['invariants']
): AgentCommandInspection {
  return { effects, uncertainties, preconditions, invariants };
}

function check(id: string, satisfied: boolean, detail: string) {
  return { id, satisfied, detail };
}

function verify(id: string, passed: boolean, detail: string): AgentVerificationResult {
  return { id, passed, detail };
}

function localId(uri: string, expectedKind: string): string {
  const parsed = parseSemanticUri(uri);
  if (parsed.kind !== expectedKind)
    throw new Error(`Expected ${expectedKind} URI, received ${parsed.kind}.`);
  return parsed.localId;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function stringParameter(command: AgentCommandEnvelope, name: string): string | undefined {
  const value = command.parameters[name];
  return typeof value === 'string' ? value : undefined;
}

function json(value: unknown): AgentJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as AgentJsonValue;
}
