import type {
  AgentDomainCapture,
  AgentFreshness,
  AgentJsonValue,
  AgentStructuredProblem,
} from '../../contracts/queryContracts';
import type { AgentDomainId, AgentRuntimeMode } from '../../contracts/systemManifest';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useHistoricalPlaybackStore } from '../../../stores/historicalPlaybackStore';
import { useIncidentReplayStore } from '../../../stores/incidentReplayStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { getDispatchQualityStatus, useQCLabStore } from '../../../stores/qcLabStore';
import { useProductionStore } from '../../../stores/productionStore';
import { useSafetyStore } from '../../../stores/safetyStore';
import { useTruckScheduleStore } from '../../../stores/truckScheduleStore';
import { peekSCADAService } from '../../../scada/SCADAService';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { projectWorkplace } from '../../../simulation/bilateralWorkplace';

const BUILD_ID = typeof __MILLOS_BUILD_ID__ === 'string' ? __MILLOS_BUILD_ID__ : 'development';

/**
 * Read each domain owner once and project only canonical operational fields.
 * Store actions, React/UI selection, frame telemetry, and cosmetic state never
 * enter this object, so query revisions cannot change because of those surfaces.
 */
export function captureMillOSAgentState(now = new Date()): AgentDomainCapture {
  const observedAt = now.toISOString();
  const simulation = useGameSimulationStore.getState();
  const production = useProductionStore.getState();
  const material = useMaterialFlowStore.getState();
  const qcLab = useQCLabStore.getState().qcLab;
  const maintenance = useBreakdownStore.getState();
  const campaign = useOperationsCampaignStore.getState();
  const logistics = useTruckScheduleStore.getState().truckSchedule;
  const safety = useSafetyStore.getState();
  const replay = useIncidentReplayStore.getState();
  const historical = useHistoricalPlaybackStore.getState();
  const qualityStatus = getDispatchQualityStatus(qcLab, material.productionBatches);
  const scadaService = peekSCADAService();
  const scadaState = scadaService?.getState() ?? null;
  const mode: AgentRuntimeMode =
    replay.replayMode || historical.isReplaying ? 'replay' : 'simulation';
  const warnings: AgentStructuredProblem[] = [];

  if (production.scadaLive) {
    warnings.push({
      code: 'SCADA_CONNECTION_UNVERIFIED',
      severity: 'warning',
      scope: 'scada',
      message:
        'The compatibility live flag is set, but the query plane has no direct connection-health observation.',
      remediation:
        'Treat SCADA values as uncertain until a Phase 2 adapter observes connection state and tag freshness directly.',
    });
  }

  const freshness: AgentFreshness[] = [
    {
      source: 'canonical-zustand-domain-owners',
      observedAt,
      staleAfterMs: 1000,
      quality: 'good',
    },
    {
      source: 'incident-and-historical-evidence-stores',
      observedAt,
      staleAfterMs: 2000,
      quality: 'good',
    },
    {
      source: 'scada-connection-health',
      observedAt,
      staleAfterMs: 1000,
      quality: production.scadaLive ? 'uncertain' : 'good',
    },
  ];

  const domains: Record<AgentDomainId, AgentJsonValue> = {
    simulation: asJson({
      gameDay: finite(simulation.gameDay),
      gameTime: finite(simulation.gameTime),
      gameSpeed: finite(simulation.gameSpeed),
      weather: simulation.weather,
      currentShift: simulation.currentShift,
      emergencyActive: simulation.emergencyActive,
      emergencyMachineId: simulation.emergencyMachineId,
      emergencyDrillMode: simulation.emergencyDrillMode,
      activeSafetyEventId: simulation.activeSafetyEventId,
      safetyEvents: simulation.safetyEvents.map((event) => ({ ...event })),
      drillMetrics: {
        ...simulation.drillMetrics,
        verifiedZoneIds: [...simulation.drillMetrics.verifiedZoneIds],
      },
      crisis: { ...simulation.crisisState },
    }),
    production: asJson({
      productionSpeed: finite(production.productionSpeed),
      machines: production.machines.map((machine) => ({
        id: machine.id,
        name: machine.name,
        type: machine.type,
        status: machine.status,
        metrics: { ...machine.metrics },
        lastMaintenance: machine.lastMaintenance,
        nextMaintenance: machine.nextMaintenance,
        fillLevel: machine.fillLevel ?? null,
        maintenanceCountdown: machine.maintenanceCountdown ?? null,
      })),
      metrics: { ...production.metrics },
      productionTarget: production.productionTarget ? { ...production.productionTarget } : null,
      totalBagsProduced: finite(production.totalBagsProduced),
      dailyBagsProduced: finite(production.dailyBagsProduced),
      dockStatus: {
        receiving: { ...production.dockStatus.receiving },
        shipping: { ...production.dockStatus.shipping },
      },
      scadaLive: production.scadaLive,
      aiDecisions: production.aiDecisions.slice(-100).map((decision) => ({
        id: decision.id,
        timestamp: toIso(decision.timestamp),
        type: decision.type,
        action: decision.action,
        confidence: finite(decision.confidence),
        impact: decision.impact,
        machineId: decision.machineId ?? null,
        status: decision.status,
        priority: decision.priority,
        response: decision.response ? { ...decision.response } : null,
        measuredOutcome: decision.measuredOutcome ? { ...decision.measuredOutcome } : null,
      })),
    }),
    material: asJson({
      totals: {
        totalMaterialProcessed: finite(material.totalMaterialProcessed),
        totalFlourProduced: finite(material.totalFlourProduced),
        currentFlowRate: finite(material.currentFlowRate),
        currentPackerFlowRate: finite(material.currentPackerFlowRate),
        initialInventoryKg: finite(material.initialInventoryKg),
        receivedKg: finite(material.receivedKg),
        wasteKg: finite(material.wasteKg),
        shippedKg: finite(material.shippedKg),
        simulationTime: finite(material.simulationTime),
      },
      machineBuffers: [...material.machineBuffers.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([id, buffer]) => ({ id, ...buffer })),
      conveyorSegments: material.network.segments.map((segment) => ({ ...segment })),
      sourceLots: [...material.sourceLots.values()]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((lot) => ({ ...lot })),
      productionBatches: material.productionBatches.map((batch) => ({
        ...batch,
        sourceContributions: cloneContributions(batch.sourceContributions),
      })),
      manifests: material.manifests.map((manifest) => ({
        ...manifest,
        materials: manifest.materials.map((entry) => ({
          ...entry,
          sourceContributions: cloneContributions(entry.sourceContributions ?? []),
          productBatches: entry.productBatches?.map((batch) => ({ ...batch })) ?? [],
        })),
        sourceLots: cloneContributions(manifest.sourceLots),
        productBatches: manifest.productBatches.map((batch) => ({ ...batch })),
      })),
      processGenealogy: material.processGenealogy.map((record) => ({
        ...record,
        sourceContributions: cloneContributions(record.sourceContributions),
      })),
    }),
    quality: asJson({
      isRunning: qcLab.isRunning,
      currentTest: qcLab.currentTest
        ? { ...qcLab.currentTest, startTime: toIso(qcLab.currentTest.startTime) }
        : null,
      certificationStatus: qcLab.certificationStatus,
      certificationExpiry: toIso(qcLab.certificationExpiry),
      dispatchReleased: qualityStatus.released,
      dispatchHoldReason: qualityStatus.reason,
      testHistory: qcLab.testHistory.map((test) => ({
        ...test,
        timestamp: toIso(test.timestamp),
      })),
      contaminationAlerts: qcLab.contaminationAlerts.map((alert) => ({
        ...alert,
        timestamp: toIso(alert.timestamp),
        resolvedAt: alert.resolvedAt ? toIso(alert.resolvedAt) : null,
      })),
      dispositionHistory: qcLab.dispositionHistory.map((record) => ({
        ...record,
        timestamp: toIso(record.timestamp),
      })),
      auditSequence: qcLab.auditSequence,
    }),
    maintenance: asJson({
      activeBreakdowns: maintenance.activeBreakdowns.map((item) => ({ ...item })),
      workOrders: maintenance.workOrders.map((item) => ({
        ...item,
        requiredParts: [...item.requiredParts],
        consumedParts: [...item.consumedParts],
        audit: item.audit.map((entry) => ({ ...entry })),
      })),
      predictiveAlerts: maintenance.predictiveAlerts.map((item) => ({
        ...item,
        basedOnMetrics: { ...item.basedOnMetrics },
      })),
      partsInventory: { ...maintenance.partsInventory },
      maintenanceSchedule: maintenance.maintenanceSchedule.map((item) => ({
        ...item,
        partsNeeded: [...item.partsNeeded],
      })),
    }),
    campaign: asJson({
      initialized: campaign.initialized,
      elapsedMinutes: finite(campaign.elapsedMinutes),
      activeOrderId: campaign.activeOrderId,
      orders: campaign.orders.map((order) => ({
        ...order,
        recipe: { ...order.recipe },
        batchIds: [...order.batchIds],
        manifestIds: [...order.manifestIds],
      })),
      incidents: campaign.incidents.map((incident) => ({ ...incident })),
      economics: { ...campaign.economics },
      shiftMetrics: { ...campaign.shiftMetrics },
      constraints: campaign.constraints.map((constraint) => ({ ...constraint })),
      execution: {
        ...campaign.execution,
        dispatchLoad: { ...campaign.execution.dispatchLoad },
      },
      utilityAssets: campaign.utilityAssets.map((asset) => ({ ...asset })),
      currentShiftKey: campaign.currentShiftKey,
      currentShiftLabel: campaign.currentShiftLabel,
    }),
    logistics: asJson({
      receiving: { ...logistics.receiving },
      shipping: { ...logistics.shipping },
    }),
    safety: asJson({
      safetyMetrics: { ...safety.safetyMetrics },
      safetyIncidents: safety.safetyIncidents.map((incident) => ({
        ...incident,
        location: incident.location ? { ...incident.location } : null,
      })),
      forkliftEmergencyStop: safety.forkliftEmergencyStop,
      safetyConfig: { ...safety.safetyConfig },
      speedZones: safety.speedZones.map((zone) => ({ ...zone })),
    }),
    scada: asJson({
      mode: scadaState?.mode ?? 'disconnected',
      connected: scadaState?.connected ?? false,
      lastUpdate: scadaState?.lastUpdate ?? 0,
      tagCount: scadaState?.tagCount ?? 0,
      activeAlarms:
        scadaService?.getActiveAlarms().map((alarm) => ({
          ...alarm,
          timestamp: toIso(alarm.timestamp),
          acknowledgedAt: alarm.acknowledgedAt ? toIso(alarm.acknowledgedAt) : null,
          clearedAt: alarm.clearedAt ? toIso(alarm.clearedAt) : null,
        })) ?? [],
      writableTags:
        scadaService
          ?.getAllTags()
          .filter((tag) => tag.accessMode !== 'READ')
          .map((tag) => ({
            id: tag.id,
            accessMode: tag.accessMode,
            value: scadaService.getValue(tag.id)?.value ?? null,
            quality: scadaService.getValue(tag.id)?.quality ?? 'UNCERTAIN',
          })) ?? [],
      externalObservationClaimed: production.scadaLive,
      connectionVerified: Boolean(scadaState?.connected),
      externalWritesAllowed: false,
      truthLabel: production.scadaLive
        ? 'compatibility flag set; connection health unobserved'
        : 'local simulation; no external observation claimed',
    }),
    experience: asJson({
      workplace: projectWorkplace(useWorkplaceStore.getState().workplace),
      operationalProjectionOnly: true,
      cosmeticStateExcludedFromRevision: true,
      frameTelemetryExcludedFromRevision: true,
      legacyRuntimeTelemetryPreserved: true,
    }),
    evidence: asJson({
      replayMode: replay.replayMode,
      currentReplayIndex: replay.currentReplayIndex,
      replayFrameCount: replay.replayFrames.length,
      currentReplayFrameTimestamp:
        replay.replayFrames[replay.currentReplayIndex]?.timestamp ?? null,
      sessionStartedAt: replay.sessionStartedAt,
      commands: replay.commands.map((command) => ({
        ...command,
        targetUri: command.targetId ? inferTargetUri(command.targetId) : null,
      })),
      historicalReplayMode: historical.isReplaying,
      playbackTime: historical.playbackTime,
      availableRange: {
        start: historical.availableStart,
        end: historical.availableEnd,
      },
      decisionHistoryCount: historical.decisionHistory.length,
      decisionHistory: historical.decisionHistory.slice(-100).map((entry) => ({ ...entry })),
    }),
  };

  return {
    domains,
    simulationTime: {
      day: Math.max(1, Math.trunc(finite(simulation.gameDay, 1))),
      hour: normalizeHour(simulation.gameTime),
    },
    mode,
    build: BUILD_ID,
    seed: replay.simulationSeed,
    completeness: production.scadaLive ? 'partial' : 'complete',
    freshness,
    warnings,
  };
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeHour(value: number): number {
  const finiteValue = finite(value);
  return ((finiteValue % 24) + 24) % 24;
}

function cloneContributions<T extends { path: string[] }>(values: readonly T[]): T[] {
  return values.map((value) => ({ ...value, path: [...value.path] }));
}

function inferTargetUri(targetId: string): string | null {
  const lower = targetId.toLowerCase();
  if (lower.startsWith('order-')) return `millos://order/${encodeURIComponent(targetId)}`;
  if (lower.startsWith('batch-')) return `millos://batch/${encodeURIComponent(targetId)}`;
  if (lower.startsWith('manifest-')) return `millos://manifest/${encodeURIComponent(targetId)}`;
  if (lower.startsWith('incident-')) return `millos://incident/${encodeURIComponent(targetId)}`;
  if (/^(rm-|sifter-|packer-|silo-)/.test(lower)) {
    return `millos://machine/${encodeURIComponent(targetId)}`;
  }
  return null;
}

function asJson(value: unknown): AgentJsonValue {
  return JSON.parse(JSON.stringify(value)) as AgentJsonValue;
}

function toIso(value: Date | number | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString();
}
