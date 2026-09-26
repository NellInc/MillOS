// @ts-check

import { COMMAND_CAPABILITY_DESCRIPTORS } from './commandCapabilityDescriptors.js';

/** @typedef {import('../contracts/systemManifest').AgentDomainDescriptor} AgentDomainDescriptor */
/** @typedef {import('../contracts/systemManifest').AgentEntitySeed} AgentEntitySeed */
/** @typedef {import('../contracts/systemManifest').AgentInvariantDescriptor} AgentInvariantDescriptor */
/** @typedef {import('../contracts/systemManifest').AgentCapabilityDescriptor} AgentCapabilityDescriptor */
/** @typedef {import('../contracts/systemManifest').AgentSourceRef} AgentSourceRef */
/** @typedef {import('../contracts/systemManifest').AgentSystemRegistrySource} AgentSystemRegistrySource */

/**
 * @param {AgentSourceRef['kind']} kind
 * @param {string} path
 * @param {AgentSourceRef['evidenceLevel']} evidenceLevel
 * @param {string} [symbol]
 * @param {string} [note]
 * @returns {AgentSourceRef}
 */
const ref = (kind, path, evidenceLevel, symbol, note) => ({
  kind,
  path,
  evidenceLevel,
  ...(symbol ? { symbol } : {}),
  ...(note ? { note } : {}),
});

const allModes = /** @type {const} */ (['simulation', 'shadow', 'replay', 'live-external']);
const nonExternalModes = /** @type {const} */ (['simulation', 'shadow', 'replay']);

/** @type {AgentInvariantDescriptor[]} */
const invariants = [
  {
    id: 'INV.MASS.CONSERVATION',
    uri: 'millos://invariant/INV.MASS.CONSERVATION',
    title: 'Material mass remains conserved',
    family: 'physical',
    ownerDomainId: 'material',
    severity: 'critical',
    status: 'executable',
    checker: 'useMaterialFlowStore.getState().getGenealogyBalance',
    applicableModes: [...allModes],
    remediation: 'Stop affected transfers and reconcile inventory, transit, waste, and shipment.',
    sourceRefs: [
      ref('source', 'src/stores/materialFlowStore.ts', 'source', 'getGenealogyBalance'),
      ref(
        'test',
        'src/stores/__tests__/materialFlowStore.test.ts',
        'unit',
        undefined,
        'Current deterministic material-flow contract tests.'
      ),
    ],
  },
  {
    id: 'INV.MATERIAL.GENEALOGY',
    uri: 'millos://invariant/INV.MATERIAL.GENEALOGY',
    title: 'Every dispatched batch retains causal source genealogy',
    family: 'physical',
    ownerDomainId: 'material',
    severity: 'blocking',
    status: 'executable',
    checker: 'useMaterialFlowStore.getState().getBatchTrace',
    applicableModes: [...allModes],
    remediation: 'Hold the batch until its source lots, transformations, and manifests resolve.',
    sourceRefs: [
      ref('source', 'src/stores/materialFlowStore.ts', 'source', 'getBatchTrace'),
      ref('ui', 'src/components/ui-new/panels/OverviewPanel.tsx', 'runtime'),
    ],
  },
  {
    id: 'INV.QUALITY.DISPATCH_RELEASE',
    uri: 'millos://invariant/INV.QUALITY.DISPATCH_RELEASE',
    title: 'Held, recalled, or failed material cannot dispatch',
    family: 'quality',
    ownerDomainId: 'quality',
    severity: 'critical',
    status: 'executable',
    checker: 'getDispatchQualityStatus',
    applicableModes: [...allModes],
    remediation: 'Keep dispatch isolated and obtain current conforming quality evidence.',
    sourceRefs: [
      ref('source', 'src/stores/qcLabStore.ts', 'source', 'getDispatchQualityStatus'),
      ref('source', 'src/systems/UnifiedGameTick.ts', 'source', 'dispatchStatus'),
    ],
  },
  {
    id: 'INV.MAINTENANCE.LOCKOUT',
    uri: 'millos://invariant/INV.MAINTENANCE.LOCKOUT',
    title: 'Maintenance lockout persists until verified return to service',
    family: 'safety',
    ownerDomainId: 'maintenance',
    severity: 'critical',
    status: 'partially-executable',
    checker: 'UnifiedGameTick maintenance restart far-side check',
    applicableModes: [...nonExternalModes],
    remediation: 'Retain the machine lockout until repair verification and production reset agree.',
    sourceRefs: [
      ref('source', 'src/stores/breakdownStore.ts', 'source', 'MaintenanceWorkOrder'),
      ref('source', 'src/systems/UnifiedGameTick.ts', 'source', 'maintenanceRestarted'),
    ],
  },
  {
    id: 'INV.SAFETY.EMERGENCY_DOMINANCE',
    uri: 'millos://invariant/INV.SAFETY.EMERGENCY_DOMINANCE',
    title: 'Emergency interlocks dominate ordinary production authority',
    family: 'safety',
    ownerDomainId: 'simulation',
    severity: 'critical',
    status: 'partially-executable',
    checker: 'gameSimulationStore emergency state and production stop',
    applicableModes: [...allModes],
    remediation: 'Reject ordinary motion and production commands until explicit recovery succeeds.',
    sourceRefs: [
      ref('source', 'src/stores/gameSimulationStore.ts', 'source', 'triggerEmergency'),
      ref('source', 'src/stores/safetyStore.ts', 'source', 'forkliftEmergencyStop'),
    ],
  },
  {
    id: 'INV.TRUTH.MODE_LABEL',
    uri: 'millos://invariant/INV.TRUTH.MODE_LABEL',
    title: 'Simulation, shadow, replay, and external state remain distinguishable',
    family: 'truth',
    ownerDomainId: 'evidence',
    severity: 'blocking',
    status: 'documented',
    checker: null,
    applicableModes: [...allModes],
    remediation: 'Withhold the claim or action until its mode and provenance are explicit.',
    sourceRefs: [
      ref('source', 'src/runtime/runtimeMode.ts', 'source', 'parseRuntimeMode'),
      ref('runtime', 'src/components/RuntimeController.tsx', 'runtime', '__MILLOS_RUNTIME__'),
    ],
  },
  {
    id: 'INV.AUTHORITY.DEFAULT_DENY',
    uri: 'millos://invariant/INV.AUTHORITY.DEFAULT_DENY',
    title: 'Consequence-bearing capabilities require an explicit scoped grant',
    family: 'authority',
    ownerDomainId: 'safety',
    severity: 'critical',
    status: 'documented',
    checker: null,
    applicableModes: [...allModes],
    remediation: 'Request a current grant bound to capability, scope, mode, risk, and revision.',
    sourceRefs: [
      ref(
        'doc',
        'docs/AGENT_OPERATING_ARCHITECTURE.md',
        'human',
        'Authority and bilateral governance'
      ),
    ],
  },
  {
    id: 'INV.BILATERAL.OBJECTION_PRESERVED',
    uri: 'millos://invariant/INV.BILATERAL.OBJECTION_PRESERVED',
    title: 'Objections and unresolved preference conflicts remain visible',
    family: 'bilateral',
    ownerDomainId: 'experience',
    severity: 'blocking',
    status: 'documented',
    checker: null,
    applicableModes: [...allModes],
    remediation: 'Pause or narrow the intent and preserve authorship, status, and escalation.',
    sourceRefs: [
      ref('doc', 'docs/BILATERAL_AUTONOMY_SYSTEM_SPEC.md', 'human', 'Bilateral Autonomy System'),
    ],
  },
  {
    id: 'INV.RESOURCE.BOUNDED',
    uri: 'millos://invariant/INV.RESOURCE.BOUNDED',
    title: 'Operational collections and retained evidence remain bounded',
    family: 'resource',
    ownerDomainId: 'evidence',
    severity: 'blocking',
    status: 'partially-executable',
    checker: 'Store-specific MAX collection contracts',
    applicableModes: [...allModes],
    remediation: 'Reject, compact, page, or expire data before exceeding the declared bound.',
    sourceRefs: [
      ref('source', 'src/stores/incidentReplayStore.ts', 'source', 'MAX_REPLAY_FRAMES'),
      ref('source', 'src/stores/materialFlowStore.ts', 'source', 'MAX_PRODUCTION_BATCHES'),
      ref('source', 'src/stores/operationsCampaignStore.ts', 'source', 'MAX_LOG_ENTRIES'),
    ],
  },
  {
    id: 'INV.PRIVACY.DIAGNOSTIC_EXPORT',
    uri: 'millos://invariant/INV.PRIVACY.DIAGNOSTIC_EXPORT',
    title: 'Diagnostic exports exclude credentials and bounded personal data',
    family: 'privacy',
    ownerDomainId: 'evidence',
    severity: 'critical',
    status: 'executable',
    checker: 'useIncidentReplayStore.getState().createDiagnosticExport',
    applicableModes: [...nonExternalModes],
    remediation: 'Reject the export and remove secret or unbounded personal fields at the source.',
    sourceRefs: [
      ref('source', 'src/stores/incidentReplayStore.ts', 'source', 'createDiagnosticExport'),
    ],
  },
];

/** @type {AgentDomainDescriptor[]} */
const domains = [
  {
    id: 'simulation',
    label: 'Simulation and facility control',
    status: 'current',
    stateOwners: ['useGameSimulationStore', 'UnifiedGameTick'],
    writeScope: ['clock', 'speed', 'weather', 'shift', 'emergency state', 'drill state'],
    internalTransitions: ['tick', 'triggerEmergency', 'resolveEmergency', 'startEmergencyDrill'],
    readProjection: 'gameSimulationStore canonical operational fields',
    operationalCommandCandidates: [],
    eventTypes: ['simulation.time-advanced', 'safety.emergency-changed'],
    invariantIds: ['INV.SAFETY.EMERGENCY_DOMINANCE', 'INV.TRUTH.MODE_LABEL'],
    sourceRefs: [
      ref('source', 'src/stores/gameSimulationStore.ts', 'source'),
      ref('source', 'src/systems/UnifiedGameTick.ts', 'source'),
    ],
  },
  {
    id: 'production',
    label: 'Production equipment and metrics',
    status: 'current',
    stateOwners: ['useProductionStore'],
    writeScope: ['machine status', 'machine metrics', 'production speed', 'AI decision records'],
    internalTransitions: ['updateMachineMetrics', 'updateMetrics', 'performMaintenance'],
    readProjection: 'productionStore machines, metrics, speed, and decisions',
    operationalCommandCandidates: [],
    eventTypes: ['production.machine-state-changed', 'production.metrics-updated'],
    invariantIds: ['INV.SAFETY.EMERGENCY_DOMINANCE'],
    sourceRefs: [ref('source', 'src/stores/productionStore.ts', 'source')],
  },
  {
    id: 'material',
    label: 'Material flow and genealogy',
    status: 'current',
    stateOwners: ['useMaterialFlowStore'],
    writeScope: ['inventory', 'buffers', 'parcels', 'batches', 'manifests', 'genealogy'],
    internalTransitions: [
      'addMaterial',
      'transferMaterial',
      'createReceivingManifest',
      'dispatchMaterial',
    ],
    readProjection: 'materialFlowStore conserved inventory and trace views',
    operationalCommandCandidates: [],
    eventTypes: ['material.transferred', 'batch.created', 'manifest.created'],
    invariantIds: ['INV.MASS.CONSERVATION', 'INV.MATERIAL.GENEALOGY'],
    sourceRefs: [ref('source', 'src/stores/materialFlowStore.ts', 'source')],
  },
  {
    id: 'quality',
    label: 'Quality laboratory and dispositions',
    status: 'current',
    stateOwners: ['useQCLabStore'],
    writeScope: ['quality tests', 'batch holds', 'batch releases', 'recalls', 'quality audit'],
    internalTransitions: ['startQCTest', 'completeQCTest', 'resolveContaminationAlert'],
    readProjection: 'qcLabStore tests, holds, recalls, and dispatch status',
    operationalCommandCandidates: [],
    eventTypes: ['quality.test-completed', 'quality.disposition-changed'],
    invariantIds: ['INV.QUALITY.DISPATCH_RELEASE', 'INV.MATERIAL.GENEALOGY'],
    sourceRefs: [ref('source', 'src/stores/qcLabStore.ts', 'source')],
  },
  {
    id: 'maintenance',
    label: 'Maintenance and return to service',
    status: 'current',
    stateOwners: ['useBreakdownStore'],
    writeScope: ['breakdowns', 'work orders', 'parts', 'repair and restart phases'],
    internalTransitions: [
      'startRepair',
      'verifyRepair',
      'requestMachineRestart',
      'confirmMachineRestart',
    ],
    readProjection: 'breakdownStore work orders, lockouts, parts, and predictive alerts',
    operationalCommandCandidates: [],
    eventTypes: ['maintenance.work-order-changed', 'maintenance.machine-returned'],
    invariantIds: ['INV.MAINTENANCE.LOCKOUT'],
    sourceRefs: [
      ref('source', 'src/stores/breakdownStore.ts', 'source'),
      ref('source', 'src/systems/UnifiedGameTick.ts', 'source', 'maintenanceRestarted'),
    ],
  },
  {
    id: 'campaign',
    label: 'Orders, incidents, and campaign economics',
    status: 'current',
    stateOwners: ['useOperationsCampaignStore'],
    writeScope: ['orders', 'active order', 'incidents', 'execution plan', 'economics', 'logbook'],
    internalTransitions: [
      'activateOrder',
      'acknowledgeIncident',
      'mitigateIncident',
      'tickCampaign',
    ],
    readProjection:
      'operationsCampaignStore orders, incidents, execution, constraints, and economics',
    operationalCommandCandidates: [
      'operations.activate-order',
      'incident.acknowledge',
      'incident.mitigate',
    ],
    eventTypes: ['operations.order-activated', 'incident.phase-changed'],
    invariantIds: [
      'INV.AUTHORITY.DEFAULT_DENY',
      'INV.SAFETY.EMERGENCY_DOMINANCE',
      'INV.RESOURCE.BOUNDED',
    ],
    sourceRefs: [ref('source', 'src/stores/operationsCampaignStore.ts', 'source')],
  },
  {
    id: 'logistics',
    label: 'Truck scheduling and vehicle movement',
    status: 'current',
    stateOwners: ['useTruckScheduleStore', 'vehicle controllers'],
    writeScope: ['truck lifecycle', 'dock transfer state', 'vehicle movement authority'],
    internalTransitions: ['setTruckLifecycle', 'recordTruckDeparture', 'vehicle controller tick'],
    readProjection: 'truck schedule and bounded vehicle telemetry',
    operationalCommandCandidates: [],
    eventTypes: ['logistics.truck-state-changed', 'logistics.movement-authority-changed'],
    invariantIds: ['INV.QUALITY.DISPATCH_RELEASE', 'INV.SAFETY.EMERGENCY_DOMINANCE'],
    sourceRefs: [
      ref('source', 'src/stores/truckScheduleStore.ts', 'source'),
      ref('source', 'src/simulation/vehicles/forkliftController.ts', 'source'),
    ],
  },
  {
    id: 'safety',
    label: 'Safety policy, incidents, and metrics',
    status: 'current',
    stateOwners: ['useSafetyStore', 'useGameSimulationStore'],
    writeScope: [
      'safety incidents',
      'forklift emergency stop',
      'safety metrics',
      'interlock policy',
    ],
    internalTransitions: ['addSafetyIncident', 'setForkliftEmergencyStop', 'triggerEmergency'],
    readProjection: 'safetyStore and simulation emergency state',
    operationalCommandCandidates: [],
    eventTypes: ['safety.incident-recorded', 'safety.interlock-changed'],
    invariantIds: ['INV.SAFETY.EMERGENCY_DOMINANCE', 'INV.AUTHORITY.DEFAULT_DENY'],
    sourceRefs: [
      ref('source', 'src/stores/safetyStore.ts', 'source'),
      ref('source', 'src/stores/gameSimulationStore.ts', 'source'),
    ],
  },
  {
    id: 'scada',
    label: 'SCADA observations, alarms, and history',
    status: 'current',
    stateOwners: ['SCADAService', 'AlarmManager', 'HistoryStore'],
    writeScope: [
      'tag observations',
      'alarm lifecycle',
      'historian records',
      'external adapter writes',
    ],
    internalTransitions: ['evaluate', 'acknowledgeAlarm', 'writeTag', 'writeHistory'],
    readProjection: 'SCADAService tags, alarms, quality, and bounded history',
    operationalCommandCandidates: [],
    eventTypes: ['scada.tag-updated', 'scada.alarm-changed'],
    invariantIds: ['INV.TRUTH.MODE_LABEL', 'INV.AUTHORITY.DEFAULT_DENY', 'INV.RESOURCE.BOUNDED'],
    sourceRefs: [
      ref('source', 'src/scada/SCADAService.ts', 'source'),
      ref('source', 'src/scada/AlarmManager.ts', 'source'),
      ref('source', 'src/scada/HistoryStore.ts', 'source'),
    ],
  },
  {
    id: 'experience',
    label: 'Human interface and presentation preferences',
    status: 'current',
    stateOwners: ['useUIStore', 'useGraphicsStore', 'audio and knowledge stores'],
    writeScope: [
      'panel state',
      'presentation preferences',
      'graphics',
      'audio',
      'knowledge surfaces',
    ],
    internalTransitions: ['UI actions', 'graphics preferences', 'audio preferences'],
    readProjection: 'bounded interface preferences and operator-visible notices',
    operationalCommandCandidates: [],
    eventTypes: ['experience.preference-changed', 'experience.objection-recorded'],
    invariantIds: ['INV.BILATERAL.OBJECTION_PRESERVED'],
    sourceRefs: [
      ref('source', 'src/stores/uiStore.ts', 'source'),
      ref('source', 'src/stores/graphicsStore.ts', 'source'),
      ref('source', 'src/stores/knowledgeStore.ts', 'source'),
    ],
  },
  {
    id: 'evidence',
    label: 'Diagnostic and decision evidence',
    status: 'current',
    stateOwners: ['useIncidentReplayStore', 'useHistoricalPlaybackStore'],
    writeScope: [
      'diagnostic frames',
      'diagnostic commands',
      'decision history',
      'evidence exports',
    ],
    internalTransitions: [
      'recordReplayFrame',
      'recordCommand',
      'logDecision',
      'createDiagnosticExport',
    ],
    readProjection: 'bounded replay and decision evidence with build and seed provenance',
    operationalCommandCandidates: [],
    eventTypes: ['evidence.command-recorded', 'evidence.frame-recorded'],
    invariantIds: ['INV.TRUTH.MODE_LABEL', 'INV.RESOURCE.BOUNDED', 'INV.PRIVACY.DIAGNOSTIC_EXPORT'],
    sourceRefs: [
      ref('source', 'src/stores/incidentReplayStore.ts', 'source'),
      ref('source', 'src/stores/historicalPlaybackStore.ts', 'source'),
    ],
  },
];

const machineSeeds = [
  ['silo-0', 'Silo Alpha'],
  ['silo-1', 'Silo Beta'],
  ['silo-2', 'Silo Gamma'],
  ['silo-3', 'Silo Delta'],
  ['silo-4', 'Silo Epsilon'],
  ['rm-101', 'Roller Mill 101'],
  ['rm-102', 'Roller Mill 102'],
  ['rm-103', 'Roller Mill 103'],
  ['rm-104', 'Roller Mill 104'],
  ['sifter-a', 'Plansifter A'],
  ['sifter-b', 'Plansifter B'],
  ['sifter-c', 'Plansifter C'],
  ['packer-0', 'Packer Line 1'],
  ['packer-1', 'Packer Line 2'],
  ['packer-2', 'Packer Line 3'],
];

/** @type {AgentEntitySeed[]} */
const entities = machineSeeds.map(([currentId, label]) => ({
  uri: `millos://machine/${currentId}`,
  kind: 'machine',
  currentId,
  ownerDomainId: 'production',
  label,
  aliases: [currentId.toUpperCase()],
  dynamic: false,
  relations: [],
  sourceRefs: [ref('source', 'src/constants/siteLayout.ts', 'source', currentId)],
}));

entities.push(
  ...[
    ['order-001', "Riverside Bakers' Cooperative order"],
    ['order-002', 'Community Pasta Works order'],
    ['order-003', 'County School Meals order'],
  ].map(([currentId, label]) => ({
    uri: `millos://order/${currentId}`,
    kind: /** @type {const} */ ('order'),
    currentId,
    ownerDomainId: /** @type {const} */ ('campaign'),
    label,
    aliases: [currentId.toUpperCase()],
    dynamic: false,
    relations: [],
    sourceRefs: [
      ref('source', 'src/stores/operationsCampaignStore.ts', 'source', 'createInitialOrders'),
    ],
  })),
  {
    uri: 'millos://batch/batch-00001',
    kind: 'batch',
    currentId: 'batch-00001',
    ownerDomainId: 'material',
    label: 'Dynamic production batch identity pattern',
    aliases: [],
    dynamic: true,
    relations: [],
    sourceRefs: [ref('source', 'src/stores/materialFlowStore.ts', 'source', 'batchSequence')],
  },
  {
    uri: 'millos://manifest/receiving-0001',
    kind: 'manifest',
    currentId: 'receiving-0001',
    ownerDomainId: 'material',
    label: 'Dynamic receiving manifest identity pattern',
    aliases: [],
    dynamic: true,
    relations: [],
    sourceRefs: [ref('source', 'src/stores/materialFlowStore.ts', 'source', 'manifestSequence')],
  },
  {
    uri: 'millos://manifest/shipping-0001',
    kind: 'manifest',
    currentId: 'shipping-0001',
    ownerDomainId: 'material',
    label: 'Dynamic shipping manifest identity pattern',
    aliases: [],
    dynamic: true,
    relations: [],
    sourceRefs: [ref('source', 'src/stores/materialFlowStore.ts', 'source', 'manifestSequence')],
  },
  {
    uri: 'millos://incident/incident-0001',
    kind: 'incident',
    currentId: 'incident-0001',
    ownerDomainId: 'campaign',
    label: 'Dynamic campaign incident identity pattern',
    aliases: [],
    dynamic: true,
    relations: [],
    sourceRefs: [
      ref('source', 'src/stores/operationsCampaignStore.ts', 'source', 'triggerIncident'),
    ],
  },
  {
    uri: 'millos://alarm/RM101.TT001.PV-HI',
    kind: 'alarm',
    currentId: 'RM101.TT001.PV-HI',
    ownerDomainId: 'scada',
    label: 'Dynamic SCADA alarm identity pattern',
    aliases: [],
    dynamic: true,
    relations: [{ predicate: 'alarm-for-tag', target: 'RM101.TT001.PV' }],
    sourceRefs: [ref('source', 'src/scada/AlarmManager.ts', 'source', 'raiseAlarm')],
  }
);

const objectResultSchema = {
  type: /** @type {const} */ ('object'),
  additionalProperties: false,
  required: ['changed'],
  properties: {
    changed: { type: 'boolean' },
    reason: { type: ['string', 'null'] },
  },
};

/** @type {AgentCapabilityDescriptor[]} */
const capabilities = [
  {
    id: 'operations.activate-order',
    uri: 'millos://capability/operations.activate-order',
    version: 1,
    status: 'implemented',
    title: 'Activate a production order',
    ownerDomainId: 'campaign',
    modes: ['simulation'],
    risk: 'medium',
    targetKinds: ['order'],
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['orderUri'],
      properties: {
        orderUri: { type: 'string', pattern: '^millos://order/' },
      },
    },
    result: objectResultSchema,
    reads: ['campaign.orders', 'campaign.activeOrderId'],
    writes: [
      'campaign.activeOrderId',
      'campaign.orders[].status',
      'campaign.execution.orderId',
      'campaign.execution.recipeId',
      'campaign.execution.sourceMaterial',
      'campaign.execution.finishedMaterial',
      'campaign.execution.stage',
      'campaign.sequence',
      'campaign.logbook[]',
    ],
    preconditions: [
      'Target order exists.',
      'Target order is neither fulfilled nor cancelled.',
      'Observed campaign revision is current.',
      'Actor holds a scoped simulation grant.',
    ],
    invariantIds: [
      'INV.AUTHORITY.DEFAULT_DENY',
      'INV.SAFETY.EMERGENCY_DOMINANCE',
      'INV.RESOURCE.BOUNDED',
    ],
    sideEffects: ['Changes the production plan consumed by UnifiedGameTick and dispatch planning.'],
    reversible: true,
    compensationCapability: 'operations.activate-order',
    supportsPreview: true,
    expectedLatencyMs: 10,
    costModel: {
      latencyClass: 'local',
      computeClass: 'trivial',
      externalCalls: false,
      boundedCollectionWrites: 1,
    },
    verifier: 'Active order, order statuses, execution recipe, and bounded log entry agree.',
    currentCallers: [],
    sourceRefs: [
      ref(
        'runtime',
        'src/agent/adapters/runtime/runtimeCommandHandlers.ts',
        'runtime',
        'operations.activate-order'
      ),
      ref('source', 'src/stores/operationsCampaignStore.ts', 'source', 'activateOrder'),
      ref('source', 'src/systems/UnifiedGameTick.ts', 'source', 'getActiveProductionPlan'),
    ],
  },
  {
    id: 'incident.acknowledge',
    uri: 'millos://capability/incident.acknowledge',
    version: 1,
    status: 'implemented',
    title: 'Acknowledge a campaign incident',
    ownerDomainId: 'campaign',
    modes: ['simulation'],
    risk: 'low',
    targetKinds: ['incident'],
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['incidentUri'],
      properties: {
        incidentUri: { type: 'string', pattern: '^millos://incident/' },
      },
    },
    result: objectResultSchema,
    reads: ['campaign.incidents[]', 'campaign.elapsedMinutes'],
    writes: ['campaign.incidents[].phase', 'campaign.incidents[].acknowledgedAtMinute'],
    preconditions: [
      'Target incident exists.',
      'Target incident phase is raised.',
      'Observed campaign revision is current.',
      'Actor holds a scoped simulation grant.',
    ],
    invariantIds: ['INV.AUTHORITY.DEFAULT_DENY', 'INV.TRUTH.MODE_LABEL'],
    sideEffects: ['Records recognition without changing the incident process effect.'],
    reversible: false,
    compensationCapability: null,
    supportsPreview: true,
    expectedLatencyMs: 10,
    costModel: {
      latencyClass: 'local',
      computeClass: 'trivial',
      externalCalls: false,
      boundedCollectionWrites: 0,
    },
    verifier: 'Incident phase and acknowledgement simulation minute agree.',
    currentCallers: [],
    sourceRefs: [
      ref(
        'runtime',
        'src/agent/adapters/runtime/runtimeCommandHandlers.ts',
        'runtime',
        'incident.acknowledge'
      ),
      ref('source', 'src/stores/operationsCampaignStore.ts', 'source', 'acknowledgeIncident'),
    ],
  },
  {
    id: 'incident.mitigate',
    uri: 'millos://capability/incident.mitigate',
    version: 1,
    status: 'implemented',
    title: 'Mitigate a campaign incident',
    ownerDomainId: 'campaign',
    modes: ['simulation'],
    risk: 'high',
    targetKinds: ['incident'],
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['incidentUri'],
      properties: {
        incidentUri: { type: 'string', pattern: '^millos://incident/' },
      },
    },
    result: objectResultSchema,
    reads: ['campaign.incidents[]', 'campaign.elapsedMinutes', 'campaign.shiftMetrics'],
    writes: [
      'campaign.incidents[].phase',
      'campaign.incidents[].acknowledgedAtMinute',
      'campaign.shiftMetrics.automaticActions',
    ],
    preconditions: [
      'Target incident exists.',
      'Target incident is unresolved.',
      'Observed campaign revision is current.',
      'Actor holds a scoped high-risk simulation grant.',
    ],
    invariantIds: [
      'INV.AUTHORITY.DEFAULT_DENY',
      'INV.SAFETY.EMERGENCY_DOMINANCE',
      'INV.QUALITY.DISPATCH_RELEASE',
    ],
    sideEffects: [
      'Halves the active incident effect.',
      'May release an incident-derived dispatch block.',
      'Increments automatic action metrics.',
    ],
    reversible: false,
    compensationCapability: null,
    supportsPreview: true,
    expectedLatencyMs: 10,
    costModel: {
      latencyClass: 'local',
      computeClass: 'trivial',
      externalCalls: false,
      boundedCollectionWrites: 0,
    },
    verifier: 'Incident effect, incident phase, and automatic action metric agree.',
    currentCallers: [],
    sourceRefs: [
      ref(
        'runtime',
        'src/agent/adapters/runtime/runtimeCommandHandlers.ts',
        'runtime',
        'incident.mitigate'
      ),
      ref('source', 'src/stores/operationsCampaignStore.ts', 'source', 'mitigateIncident'),
      ref('source', 'src/stores/operationsCampaignStore.ts', 'source', 'getIncidentEffect'),
      ref('source', 'src/systems/UnifiedGameTick.ts', 'source', 'applyCampaignIncidentConsequence'),
    ],
  },
  ...COMMAND_CAPABILITY_DESCRIPTORS,
];

for (const capability of capabilities) {
  const domain = domains.find((candidate) => candidate.id === capability.ownerDomainId);
  if (domain && !domain.operationalCommandCandidates.includes(capability.id)) {
    domain.operationalCommandCandidates.push(capability.id);
  }
}

/** @type {AgentSystemRegistrySource} */
const systemRegistrySource = {
  schemaVersion: 1,
  product: {
    id: 'millos',
    version: '0.40.0',
  },
  semanticUri: {
    scheme: 'millos',
    maximumLocalIdLength: 256,
  },
  queryPlane: {
    version: 2,
    level0MaximumBytes: 4096,
    level1MaximumBytes: 12288,
    maximumPageSize: 100,
    snapshotHistorySize: 16,
    runtimeMethods: [
      'brief',
      'query',
      'capabilities',
      'trace',
      'legalOptions',
      'draft',
      'preview',
      'approve',
      'commit',
      'actors',
      'grants',
      'policy',
      'revokeGrant',
      'object',
      'resolveObjection',
      'evidence',
      'importEvidence',
      'promoteLesson',
    ],
    authority: {
      observationOnly: false,
      commandExecution: true,
      externalWrites: false,
    },
  },
  domains,
  invariants,
  entities,
  aliases: entities.flatMap((entity) =>
    entity.aliases.map((alias) => ({ alias, canonicalUri: entity.uri }))
  ),
  capabilities,
};

export const SYSTEM_REGISTRY_SOURCE = Object.freeze(systemRegistrySource);
