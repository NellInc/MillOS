// @ts-check

/** @typedef {import('../contracts/systemManifest').AgentCapabilityDescriptor} AgentCapabilityDescriptor */

const objectResultSchema = {
  type: /** @type {const} */ ('object'),
  additionalProperties: false,
  required: ['changed'],
  properties: {
    changed: { type: 'boolean' },
    reason: { type: ['string', 'null'] },
  },
};

/**
 * Keep command cards mechanically uniform. Domain-specific truth remains in
 * each explicit handler and verifier rather than in this construction helper.
 *
 * @param {{
 *   id: string,
 *   title: string,
 *   ownerDomainId: AgentCapabilityDescriptor['ownerDomainId'],
 *   risk: AgentCapabilityDescriptor['risk'],
 *   targetKinds: AgentCapabilityDescriptor['targetKinds'],
 *   required: string[],
 *   properties: Record<string, Readonly<Record<string, unknown>>>,
 *   reads: string[],
 *   writes: string[],
 *   sideEffects: string[],
 *   verifier: string,
 *   sourcePath: string,
 *   sourceSymbol: string,
 * }} options
 * @returns {AgentCapabilityDescriptor}
 */
function capability(options) {
  return {
    id: options.id,
    uri: `millos://capability/${options.id}`,
    version: 1,
    status: 'implemented',
    title: options.title,
    ownerDomainId: options.ownerDomainId,
    modes: ['simulation', 'shadow'],
    risk: options.risk,
    targetKinds: options.targetKinds,
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: options.required,
      properties: options.properties,
    },
    result: objectResultSchema,
    reads: options.reads,
    writes: options.writes,
    preconditions: [
      'Target exists in the canonical owner domain.',
      'Observed owner-domain revision is current.',
      'Actor holds a scoped grant for the active mode and target.',
    ],
    invariantIds: ['INV.AUTHORITY.DEFAULT_DENY', 'INV.TRUTH.MODE_LABEL', 'INV.RESOURCE.BOUNDED'],
    sideEffects: options.sideEffects,
    reversible: false,
    compensationCapability: null,
    supportsPreview: true,
    expectedLatencyMs: 15,
    costModel: {
      latencyClass: 'local',
      computeClass: 'trivial',
      externalCalls: false,
      boundedCollectionWrites: 1,
    },
    verifier: options.verifier,
    currentCallers: [],
    sourceRefs: [
      {
        kind: 'source',
        path: options.sourcePath,
        symbol: options.sourceSymbol,
        evidenceLevel: 'source',
      },
      {
        kind: 'runtime',
        path: 'src/agent/adapters/runtime/runtimeCommandHandlers.ts',
        symbol: options.id,
        evidenceLevel: 'runtime',
      },
    ],
  };
}

/** @type {AgentCapabilityDescriptor[]} */
export const COMMAND_CAPABILITY_DESCRIPTORS = [
  capability({
    id: 'workplace.activate-plan',
    title: 'Run an agreed workplace plan',
    ownerDomainId: 'experience',
    risk: 'high',
    targetKinds: ['simulation'],
    required: ['revision'],
    properties: { revision: { type: 'integer', minimum: 0 } },
    reads: ['experience.workplace'],
    writes: ['experience.workplace'],
    sideEffects: [
      'Reserves funded compensation and the approved improvement budget.',
      'The central tick applies the agreed line-capacity envelope in Game mode only.',
      'Refused in Game mode during a stop or drill, and while simulation.restartPending shows the line idle after one; only a person restarts the line (RESTART LINE).',
    ],
    verifier: 'The exact consensual plan enters active state with its obligations funded.',
    sourcePath: 'src/stores/workplaceStore.ts',
    sourceSymbol: 'activate',
  }),
  capability({
    id: 'ai.respond-to-decision',
    title: 'Respond to an AI decision',
    ownerDomainId: 'production',
    risk: 'medium',
    targetKinds: ['decision'],
    required: ['decisionUri', 'disposition'],
    properties: {
      decisionUri: { type: 'string', pattern: '^millos://decision/' },
      disposition: { type: 'string', enum: ['accepted', 'modified', 'rejected', 'deferred'] },
      note: { type: 'string' },
      modifiedAction: { type: 'string' },
    },
    // The answered card only: a new card filed meanwhile must not make the
    // player's response preview stale.
    reads: ['production.aiDecisions[target]'],
    writes: ['production.aiDecisions[target].response', 'production.aiDecisions[target].status'],
    sideEffects: [
      'Records a bounded response to the recommendation.',
      "A partner proposal (type 'proposal') runs the answer chosen through the owning store: a service takes one spare part and lowers the unit's wear; accepting a programme opens its three orders; a forfeit closes an order with its fee.",
      'An intake answer receives the lot into a silo or refuses it with its fee, and a refusal may delay the next grain truck.',
      'An incident answer may send a relief lorry (the shipping delay shortens, its cost is booked), take a filter from stores, or recall the stock a supplier notice holds.',
    ],
    verifier:
      'The target decision records the requested disposition and a current response timestamp.',
    sourcePath: 'src/stores/productionStore.ts',
    sourceSymbol: 'recordDecisionResponse',
  }),
  capability({
    id: 'maintenance.request-repair',
    title: 'Request repair work',
    ownerDomainId: 'maintenance',
    risk: 'medium',
    targetKinds: ['breakdown'],
    required: ['breakdownUri'],
    properties: { breakdownUri: { type: 'string', pattern: '^millos://breakdown/' } },
    // The fields the handler decides on. The kernel hashes reads into the
    // preview's revision, and a down machine's downtime grows every tick.
    reads: [
      'maintenance.activeBreakdowns[].id',
      'maintenance.workOrders[].breakdownId',
      'maintenance.workOrders[].phase',
      'maintenance.workOrders[].openedAt',
      'maintenance.workOrders[].requiredParts',
      'maintenance.partsInventory',
    ],
    writes: ['maintenance.workOrders[].phase', 'maintenance.partsInventory'],
    sideEffects: ['Consumes required simulated parts when repair begins.'],
    verifier: 'The work order enters repairing or returns an explicit non-mutating block reason.',
    sourcePath: 'src/stores/breakdownStore.ts',
    sourceSymbol: 'startRepair',
  }),
  capability({
    id: 'maintenance.request-restart',
    title: 'Request controlled machine restart',
    ownerDomainId: 'maintenance',
    risk: 'high',
    targetKinds: ['breakdown'],
    required: ['breakdownUri'],
    properties: { breakdownUri: { type: 'string', pattern: '^millos://breakdown/' } },
    reads: ['maintenance.workOrders[].breakdownId', 'maintenance.workOrders[].phase'],
    writes: ['maintenance.workOrders[].phase', 'maintenance.workOrders[].audit'],
    sideEffects: [
      'Queues the far-side central tick restart confirmation.',
      'The tick holds it during a stop, and while simulation.restartPending is true until a person presses RESTART LINE.',
    ],
    verifier: 'Only a verified repair enters restart_requested.',
    sourcePath: 'src/stores/breakdownStore.ts',
    sourceSymbol: 'requestMachineRestart',
  }),
  capability({
    id: 'quality.hold-batch',
    title: 'Place a product batch on quality hold',
    ownerDomainId: 'material',
    risk: 'medium',
    targetKinds: ['batch'],
    required: ['batchUri', 'reason'],
    properties: {
      batchUri: { type: 'string', pattern: '^millos://batch/' },
      reason: { type: 'string' },
    },
    // Not the whole batch: the open batch's packed kg grows every tick.
    reads: ['material.productionBatches[].id', 'material.productionBatches[].disposition'],
    writes: [
      'material.productionBatches[].disposition',
      'material.productionBatches[].dispositionReason',
    ],
    sideEffects: ['The quality dispatch interlock excludes the held batch.'],
    verifier: 'The exact unshipped batch is held with the supplied reason.',
    sourcePath: 'src/stores/materialFlowStore.ts',
    sourceSymbol: 'setBatchDisposition',
  }),
  capability({
    id: 'quality.release-batch',
    title: 'Release a held product batch',
    ownerDomainId: 'material',
    risk: 'high',
    targetKinds: ['batch'],
    required: ['batchUri', 'reason'],
    properties: {
      batchUri: { type: 'string', pattern: '^millos://batch/' },
      reason: { type: 'string' },
    },
    reads: [
      'material.productionBatches[].id',
      'material.productionBatches[].disposition',
      'quality.contaminationAlerts[]',
    ],
    writes: [
      'material.productionBatches[].disposition',
      'material.productionBatches[].dispositionReason',
    ],
    sideEffects: ['Released mass may become dispatchable after all quality interlocks pass.'],
    verifier: 'A held batch becomes released while recalled or shipped product remains unchanged.',
    sourcePath: 'src/stores/materialFlowStore.ts',
    sourceSymbol: 'setBatchDisposition',
  }),
  capability({
    id: 'dispatch.release',
    title: 'Release the shipping transfer',
    ownerDomainId: 'logistics',
    risk: 'high',
    targetKinds: ['dispatch'],
    required: ['dispatchUri'],
    properties: { dispatchUri: { type: 'string', pattern: '^millos://dispatch/' } },
    reads: ['logistics.shipping', 'quality.dispatchReleased', 'material.productionBatches[]'],
    writes: ['logistics.shipping.transferReady'],
    sideEffects: ['Allows the current simulated shipping load sequence to proceed.'],
    verifier:
      'Transfer readiness changes only for a docked shipping truck with current quality release.',
    sourcePath: 'src/stores/truckScheduleStore.ts',
    sourceSymbol: 'setTruckTransferReady',
  }),
  capability({
    id: 'simulation.set-speed',
    title: 'Set deterministic simulation speed',
    ownerDomainId: 'simulation',
    risk: 'medium',
    targetKinds: ['simulation'],
    required: ['simulationUri', 'speed'],
    properties: {
      simulationUri: { type: 'string', pattern: '^millos://simulation/' },
      speed: { type: 'number', minimum: 0, maximum: 120 },
    },
    reads: ['simulation.gameSpeed'],
    writes: ['simulation.gameSpeed'],
    sideEffects: ['Changes future simulated-time advancement while preserving wall time.'],
    verifier:
      'The sanitized chosen pace (the handoff resume pace while it holds the clock) equals the requested value.',
    sourcePath: 'src/stores/gameSimulationStore.ts',
    sourceSymbol: 'setGameSpeed',
  }),
  capability({
    id: 'simulation.start-fire-drill',
    title: 'Start a simulated fire drill',
    ownerDomainId: 'simulation',
    risk: 'high',
    targetKinds: ['simulation'],
    required: ['simulationUri'],
    properties: {
      simulationUri: { type: 'string', pattern: '^millos://simulation/' },
      totalZones: { type: 'integer', minimum: 1, maximum: 4 },
    },
    reads: ['simulation.emergencyActive', 'simulation.crisis'],
    writes: [
      'simulation.emergencyDrillMode',
      'simulation.drillMetrics',
      'simulation.safetyEvents[]',
    ],
    sideEffects: [
      'Stops simulated equipment and the forklifts and starts the egress verification sequence.',
      'When the drill ends the line stays idle until a person presses RESTART LINE, and simulation.restartPending is true until then; no agent command restarts it.',
    ],
    verifier: 'The drill interlock and metrics become active only from a non-emergency state.',
    sourcePath: 'src/stores/gameSimulationStore.ts',
    sourceSymbol: 'startEmergencyDrill',
  }),
  capability({
    id: 'scada.acknowledge-alarm',
    title: 'Acknowledge a simulated SCADA alarm',
    ownerDomainId: 'scada',
    risk: 'low',
    targetKinds: ['alarm'],
    required: ['alarmUri'],
    properties: {
      alarmUri: { type: 'string', pattern: '^millos://alarm/' },
      note: { type: 'string' },
    },
    // The target alarm's identity and acknowledgement only. The AlarmManager
    // rewrites a standing alarm's value on every evaluation, and hashing the
    // whole list made each preview stale before the player could commit it.
    reads: ['scada.activeAlarms[target].id', 'scada.activeAlarms[target].acknowledgedAt'],
    writes: ['scada.activeAlarms[target].acknowledgedAt'],
    sideEffects: ['Records acknowledgement while preserving the alarm condition.'],
    verifier: 'The exact active alarm records acknowledgement.',
    sourcePath: 'src/scada/SCADAService.ts',
    sourceSymbol: 'acknowledgeAlarm',
  }),
  capability({
    id: 'scada.write-setpoint',
    title: 'Write a simulated SCADA setpoint',
    ownerDomainId: 'scada',
    risk: 'critical',
    targetKinds: ['tag'],
    required: ['tagUri', 'value'],
    properties: {
      tagUri: { type: 'string', pattern: '^millos://tag/' },
      value: { type: 'number' },
    },
    reads: ['scada.mode', 'scada.connection', 'scada.tags[]'],
    writes: ['scada.tags[].value'],
    sideEffects: [
      'Writes only through the local SimulationAdapter or shadow evaluator.',
      'A mill roll-speed setpoint sets the line rate (1,000 RPM = 100%).',
    ],
    verifier:
      'The simulated writable tag reads back the requested value with explicit mode evidence.',
    sourcePath: 'src/scada/SCADAService.ts',
    sourceSymbol: 'writeSetpoint',
  }),
];
