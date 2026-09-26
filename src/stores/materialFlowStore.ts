/**
 * Material Flow Store
 *
 * Tracks actual material flow through the mill network:
 * - Silos (raw grain storage) -> Roller Mills (grinding)
 * - Roller Mills -> Plansifters (sifting/separation)
 * - Plansifters -> Packers (packaging)
 *
 * Zone Layout (matches the live scene in MillScene.tsx / factoryLayout.ts):
 * - Zone 1 (z=-22): 5 Silos (silo-0..silo-4)
 * - Zone 2 (z=-6): 4 Roller Mills (rm-101 to rm-104)
 * - Zone 3 (z=6, y=9 elevated): 3 Plansifters (sifter-a..c)
 * - Zone 4 (z=25): 3 Packers (packer-0..packer-2)
 *
 * Buffer ids MUST match the live machine ids from MillScene's machine roster —
 * syncMachineProcessing() joins on them to couple machine status to flow.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

// =============================================================================
// MATERIAL TYPES
// =============================================================================

export type MaterialType =
  | 'wheat_grain'
  | 'corn_grain'
  | 'flour'
  | 'bran'
  | 'middlings'
  | 'semolina';

export interface SourceContribution {
  /** Receiving or opening-stock lot that supplied this mass. */
  lotId: string;
  /** Conserved mass from this source lot. */
  amount: number;
  /** Ordered machine path already traversed by this contribution. */
  path: string[];
}

export interface ProductBatchContribution {
  batchId: string;
  amount: number;
}

export interface MaterialAmount {
  type: MaterialType;
  amount: number; // kg
  /** Optional only for backwards-compatible fixtures. Live material always carries it. */
  sourceContributions?: SourceContribution[];
  /** Present on packed output so prohibited batches can never be dispatched by aggregation. */
  productBatches?: ProductBatchContribution[];
}

/**
 * The active customer recipe expressed as a physical routing instruction.
 * When present, only its source grain and finished product enter new process
 * steps. Material already on a conveyor is still delivered so mass is never
 * stranded or discarded when the campaign changes over.
 */
export interface MaterialFlowProductionPlan {
  sourceMaterial: Extract<MaterialType, 'wheat_grain' | 'corn_grain'>;
  finishedMaterial: Extract<MaterialType, 'flour' | 'semolina'>;
}

export type MaterialDisposition = 'released' | 'hold' | 'recalled' | 'shipped';

export interface SourceLot {
  id: string;
  materialType: MaterialType;
  origin: 'opening_stock' | 'receiving';
  sourceManifestId: string | null;
  supplier: string;
  receivedKg: number;
  simulationTime: number;
  disposition: Exclude<MaterialDisposition, 'shipped'>;
  dispositionReason: string | null;
}

export interface ProductionBatch {
  id: string;
  packerId: string;
  materialType: Extract<MaterialType, 'flour' | 'semolina'>;
  producedKg: number;
  availableKg: number;
  simulationTime: number;
  sourceContributions: SourceContribution[];
  disposition: MaterialDisposition;
  dispositionReason: string | null;
  qcTestIds: string[];
  dispatchManifestIds: string[];
  sealed: boolean;
}

export interface ProcessGenealogyRecord {
  id: string;
  machineId: string;
  inputType: MaterialType;
  inputKg: number;
  outputs: MaterialAmount[];
  wasteKg: number;
  sourceContributions: SourceContribution[];
  simulationTime: number;
}

export interface BatchTrace {
  batch: ProductionBatch;
  sourceLots: Array<{
    lot: SourceLot;
    amount: number;
    paths: string[][];
  }>;
}

export interface GenealogyBalance {
  expectedKg: number;
  inventoryKg: number;
  inTransitKg: number;
  wasteKg: number;
  /** Bran and middlings discharged from the mills as millfeed. */
  byproductKg: number;
  shippedKg: number;
  accountedKg: number;
  errorKg: number;
}

export interface MaterialManifest {
  id: string;
  kind: 'receiving' | 'shipping';
  dock: 'receiving' | 'shipping';
  requestedKg: number;
  actualKg: number;
  materials: MaterialAmount[];
  sourceLots: SourceContribution[];
  productBatches: ProductBatchContribution[];
  simulationTime: number;
}

export interface MaterialBalance {
  initialKg: number;
  receivedKg: number;
  inventoryKg: number;
  inTransitKg: number;
  wasteKg: number;
  /** Bran and middlings discharged from the mills as millfeed. */
  byproductKg: number;
  shippedKg: number;
  expectedKg: number;
  accountedKg: number;
  errorKg: number;
}

// =============================================================================
// MACHINE BUFFERS - Input/Output storage for each machine
// =============================================================================

export interface MachineBuffer {
  machineId: string;
  machineType: 'silo' | 'roller_mill' | 'plansifter' | 'packer';
  inputBuffer: MaterialAmount[];
  outputBuffer: MaterialAmount[];
  inputCapacity: number; // kg
  outputCapacity: number; // kg
  processingRate: number; // kg per second at production speed 1.0
  /** Conversion ratios: input material -> output materials */
  conversionRatios: ConversionRatio[];
  /** Whether this machine is currently processing */
  isProcessing: boolean;
}

export interface ConversionRatio {
  inputType: MaterialType;
  outputs: { type: MaterialType; ratio: number }[];
}

// =============================================================================
// CONVEYOR SEGMENTS - Links between machines
// =============================================================================

export interface ConveyorSegment {
  id: string;
  fromMachineId: string;
  toMachineId: string;
  fromOutputType: MaterialType;
  capacity: number; // kg max on conveyor at once
  currentLoad: number; // kg currently on conveyor
  flowRate: number; // kg per second at production speed 1.0
  /** Transit time in seconds at production speed 1.0 */
  transitTime: number;
  /** Material in transit with arrival timestamps */
  inTransit: Array<{
    amount: number;
    arrivalTime: number;
    type: MaterialType;
    sourceContributions?: SourceContribution[];
  }>;
}

// =============================================================================
// NETWORK TOPOLOGY
// =============================================================================

export interface NetworkTopology {
  /** All conveyor connections */
  segments: ConveyorSegment[];
  /** Machine ID -> downstream machine IDs */
  downstreamMap: Map<string, string[]>;
  /** Machine ID -> upstream machine IDs */
  upstreamMap: Map<string, string[]>;
}

// =============================================================================
// STORE STATE
// =============================================================================

export interface MaterialFlowState {
  // Machine buffers indexed by machine ID
  machineBuffers: Map<string, MachineBuffer>;

  // Network topology
  network: NetworkTopology;

  // Cumulative stats
  totalMaterialProcessed: number; // kg total
  totalFlourProduced: number; // kg flour output
  currentFlowRate: number; // kg/sec instantaneous (summed across ALL stages)
  currentPackerFlowRate: number; // kg/sec processed at the final packing stage only

  // Conserved material ledger
  initialInventoryKg: number;
  receivedKg: number;
  wasteKg: number;
  /**
   * Bran and middlings discharged from the roller mills to the millfeed
   * system. A conserved co-product, not waste: it is sold as feed.
   */
  byproductKg: number;
  shippedKg: number;
  manifests: MaterialManifest[];
  manifestSequence: number;

  // Lot and batch genealogy
  sourceLots: Map<string, SourceLot>;
  productionBatches: ProductionBatch[];
  processGenealogy: ProcessGenealogyRecord[];
  wasteSourceContributions: SourceContribution[];
  byproductSourceContributions: SourceContribution[];
  shippedSourceContributions: SourceContribution[];
  lotSequence: number;
  batchSequence: number;
  processSequence: number;

  // Time tracking for transit
  simulationTime: number; // seconds elapsed

  // Actions
  tickMaterialFlow: (
    deltaSeconds: number,
    productionSpeed: number,
    productionPlan?: MaterialFlowProductionPlan
  ) => void;
  /**
   * Couple machine status to flow: stopped/idle/critical machines stop
   * processing material. Joined on the live machine ids from the scene.
   */
  syncMachineProcessing: (machines: ReadonlyArray<{ id: string; status: string }>) => void;
  /**
   * A receiving truck delivers grain: tops up the emptiest silo (wheat for
   * even silo indices, corn for odd, matching the initial fill pattern).
   */
  receiveGrainDelivery: (
    amountKg: number,
    details?: {
      supplier?: string;
      materialType?: Extract<MaterialType, 'wheat_grain' | 'corn_grain'>;
    }
  ) => number;
  /**
   * A shipping truck removes completed flour or semolina from packer output.
   * Returns the amount actually loaded, which may be lower than requested.
   */
  shipFinishedGoods: (
    amountKg: number,
    preferredMaterial?: Extract<MaterialType, 'flour' | 'semolina'>
  ) => number;
  setBatchDisposition: (
    batchIds: readonly string[],
    disposition: Exclude<MaterialDisposition, 'shipped'>,
    reason: string,
    qcTestId?: string
  ) => string[];
  setLotDisposition: (
    lotIds: readonly string[],
    disposition: Exclude<MaterialDisposition, 'shipped'>,
    reason: string
  ) => string[];
  getBatchTrace: (batchId: string) => BatchTrace | null;
  getDispatchableFinishedGoods: () => number;
  getGenealogyBalance: () => GenealogyBalance;
  getMaterialBalance: () => MaterialBalance;
  getMachineBuffer: (machineId: string) => MachineBuffer | undefined;
  getConveyorLoad: (segmentId: string) => number;
  getTotalInputBuffer: (machineId: string) => number;
  getTotalOutputBuffer: (machineId: string) => number;
  resetMaterialFlow: () => void;
}

// =============================================================================
// INITIAL STATE FACTORY
// =============================================================================

// This threshold removes only numerical dust. It must stay far below the
// operator-facing 0.01 kg reconciliation tolerance because it is applied to
// many lot/path contributions over a long simulation run.
const GENEALOGY_EPSILON_KG = 0.000000001;
const PRODUCT_BATCH_TARGET_KG = 1000;
// Bran and middlings have no conveyor lane: a mill discharges them to the
// millfeed system whenever its co-product bin reaches this level. Without the
// outlet they filled the mill's output buffer and stopped the line for good.
const MILLFEED_DISCHARGE_KG = 500;
const MAX_PROCESS_GENEALOGY_RECORDS = 500;
const MAX_MATERIAL_MANIFESTS = 200;
const MAX_PRODUCTION_BATCHES = 500;
const MAX_SOURCE_LOTS = 1000;

function contributionKey(contribution: SourceContribution): string {
  return `${contribution.lotId}|${contribution.path.join('>')}`;
}

function cloneSourceContributions(
  contributions: readonly SourceContribution[] | undefined
): SourceContribution[] {
  return (contributions ?? []).map((contribution) => ({
    ...contribution,
    path: [...contribution.path],
  }));
}

function mergeSourceContributions(
  current: readonly SourceContribution[] | undefined,
  additions: readonly SourceContribution[] | undefined
): SourceContribution[] {
  const merged = new Map<string, SourceContribution>();
  const merge = (contribution: SourceContribution) => {
    if (!Number.isFinite(contribution.amount) || contribution.amount <= GENEALOGY_EPSILON_KG)
      return;
    const key = contributionKey(contribution);
    const existing = merged.get(key);
    if (existing) {
      existing.amount += contribution.amount;
    } else {
      merged.set(key, { ...contribution, path: [...contribution.path] });
    }
  };
  current?.forEach(merge);
  additions?.forEach(merge);
  return [...merged.values()];
}

function subtractSourceContributions(
  current: readonly SourceContribution[] | undefined,
  removals: readonly SourceContribution[]
): SourceContribution[] {
  const remaining = new Map(
    cloneSourceContributions(current).map((contribution) => [
      contributionKey(contribution),
      contribution,
    ])
  );
  for (const removal of removals) {
    const key = contributionKey(removal);
    const existing = remaining.get(key);
    if (!existing) continue;
    existing.amount = Math.max(0, existing.amount - removal.amount);
    if (existing.amount <= GENEALOGY_EPSILON_KG) remaining.delete(key);
  }
  return [...remaining.values()];
}

function scaleSourceContributions(
  contributions: readonly SourceContribution[] | undefined,
  scale: number
): SourceContribution[] {
  if (!Number.isFinite(scale) || scale <= 0) return [];
  return (contributions ?? [])
    .map((contribution) => ({
      ...contribution,
      path: [...contribution.path],
      amount: contribution.amount * scale,
    }))
    .filter((contribution) => contribution.amount > GENEALOGY_EPSILON_KG);
}

function withdrawSourceContributions(
  material: MaterialAmount,
  amountKg: number
): SourceContribution[] {
  if (amountKg <= 0 || material.amount <= 0 || !material.sourceContributions?.length) return [];
  const fraction = Math.min(1, amountKg / material.amount);
  const withdrawn = scaleSourceContributions(material.sourceContributions, fraction);
  material.sourceContributions = scaleSourceContributions(
    material.sourceContributions,
    1 - fraction
  );
  return withdrawn;
}

function appendMachineToPath(
  contributions: readonly SourceContribution[],
  machineId: string
): SourceContribution[] {
  return contributions.map((contribution) => ({
    ...contribution,
    path:
      contribution.path.at(-1) === machineId
        ? [...contribution.path]
        : [...contribution.path, machineId],
  }));
}

function mergeProductBatchContributions(
  current: readonly ProductBatchContribution[] | undefined,
  additions: readonly ProductBatchContribution[] | undefined
): ProductBatchContribution[] {
  const merged = new Map<string, number>();
  const merge = (contribution: ProductBatchContribution) => {
    if (!Number.isFinite(contribution.amount) || contribution.amount <= GENEALOGY_EPSILON_KG)
      return;
    merged.set(contribution.batchId, (merged.get(contribution.batchId) ?? 0) + contribution.amount);
  };
  current?.forEach(merge);
  additions?.forEach(merge);
  return [...merged.entries()].map(([batchId, amount]) => ({ batchId, amount }));
}

function openingMaterial(machineId: string, type: MaterialType, amount: number): MaterialAmount {
  return {
    type,
    amount,
    sourceContributions: [{ lotId: `lot-opening-${machineId}`, amount, path: [machineId] }],
  };
}

function createInitialMachineBuffers(): Map<string, MachineBuffer> {
  const buffers = new Map<string, MachineBuffer>();

  // Silos - 5 silos with initial grain storage (20 tons each).
  // Ids match the live scene roster (MillScene creates silo-0..silo-4).
  const siloIds = ['silo-0', 'silo-1', 'silo-2', 'silo-3', 'silo-4'];
  siloIds.forEach((id, index) => {
    const grainType: MaterialType = index % 2 === 0 ? 'wheat_grain' : 'corn_grain';
    buffers.set(id, {
      machineId: id,
      machineType: 'silo',
      inputBuffer: [], // Silos receive from trucks (external)
      outputBuffer: [openingMaterial(id, grainType, 20000)], // 20 tons initial
      inputCapacity: 50000, // 50 ton capacity
      outputCapacity: 50000,
      processingRate: 200, // 200 kg/sec discharge rate
      conversionRatios: [], // Silos just store, no conversion
      isProcessing: true,
    });
  });

  // Roller Mills - 4 mills that grind grain to flour/bran/middlings
  const millIds = ['rm-101', 'rm-102', 'rm-103', 'rm-104'];
  millIds.forEach((id) => {
    buffers.set(id, {
      machineId: id,
      machineType: 'roller_mill',
      inputBuffer: [openingMaterial(id, 'wheat_grain', 500)], // Start with some grain
      outputBuffer: [],
      inputCapacity: 2000, // 2 ton input buffer
      outputCapacity: 2000,
      processingRate: 50, // 50 kg/sec processing rate (per mill, across the 4 mills)
      conversionRatios: [
        {
          inputType: 'wheat_grain',
          outputs: [
            { type: 'flour', ratio: 0.72 }, // 72% flour extraction
            { type: 'bran', ratio: 0.18 }, // 18% bran
            { type: 'middlings', ratio: 0.1 }, // 10% middlings
          ],
        },
        {
          inputType: 'corn_grain',
          outputs: [
            { type: 'semolina', ratio: 0.65 }, // 65% semolina from corn
            { type: 'bran', ratio: 0.25 },
            { type: 'middlings', ratio: 0.1 },
          ],
        },
      ],
      isProcessing: true,
    });
  });

  // Plansifters - 3 sifters that separate flour grades
  const sifterIds = ['sifter-a', 'sifter-b', 'sifter-c'];
  sifterIds.forEach((id) => {
    buffers.set(id, {
      machineId: id,
      machineType: 'plansifter',
      inputBuffer: [openingMaterial(id, 'flour', 300)], // Start with some flour
      outputBuffer: [],
      inputCapacity: 3000, // 3 ton buffer
      outputCapacity: 3000,
      processingRate: 80, // 80 kg/sec - faster than mills
      conversionRatios: [
        {
          inputType: 'flour',
          outputs: [{ type: 'flour', ratio: 0.95 }], // 95% passes through (5% lost to dust)
        },
        {
          inputType: 'semolina',
          outputs: [{ type: 'semolina', ratio: 0.95 }],
        },
      ],
      isProcessing: true,
    });
  });

  // Packers - 3 packing lines. Ids match the live scene roster
  // (MillScene creates packer-0..packer-2).
  const packerIds = ['packer-0', 'packer-1', 'packer-2'];
  packerIds.forEach((id) => {
    buffers.set(id, {
      machineId: id,
      machineType: 'packer',
      inputBuffer: [openingMaterial(id, 'flour', 200)], // Start with some flour
      outputBuffer: [],
      inputCapacity: 1000, // 1 ton hopper
      outputCapacity: 5000, // Packed bags accumulate
      processingRate: 25, // 25 kg/sec = ~60 bags/min at 25kg/bag
      conversionRatios: [
        {
          inputType: 'flour',
          outputs: [{ type: 'flour', ratio: 1.0 }], // 1:1 packing
        },
        {
          inputType: 'semolina',
          outputs: [{ type: 'semolina', ratio: 1.0 }],
        },
      ],
      isProcessing: true,
    });
  });

  return buffers;
}

function createInitialSourceLots(
  buffers: ReadonlyMap<string, MachineBuffer>
): Map<string, SourceLot> {
  const lots = new Map<string, SourceLot>();
  buffers.forEach((buffer) => {
    for (const material of [...buffer.inputBuffer, ...buffer.outputBuffer]) {
      for (const contribution of material.sourceContributions ?? []) {
        const existing = lots.get(contribution.lotId);
        if (existing) {
          existing.receivedKg += contribution.amount;
        } else {
          lots.set(contribution.lotId, {
            id: contribution.lotId,
            materialType: material.type,
            origin: 'opening_stock',
            sourceManifestId: null,
            supplier: 'Opening inventory',
            receivedKg: contribution.amount,
            simulationTime: 0,
            disposition: 'released',
            dispositionReason: null,
          });
        }
      }
    }
  });
  return lots;
}

function sumMachineInventory(buffers: ReadonlyMap<string, MachineBuffer>): number {
  let total = 0;
  buffers.forEach((buffer) => {
    total += buffer.inputBuffer.reduce((sum, material) => sum + material.amount, 0);
    total += buffer.outputBuffer.reduce((sum, material) => sum + material.amount, 0);
  });
  return total;
}

const INITIAL_INVENTORY_KG = sumMachineInventory(createInitialMachineBuffers());

function createInitialNetwork(): NetworkTopology {
  const segments: ConveyorSegment[] = [];
  const downstreamMap = new Map<string, string[]>();
  const upstreamMap = new Map<string, string[]>();

  // Helper to add a segment
  const addSegment = (
    fromId: string,
    toId: string,
    materialType: MaterialType,
    flowRate: number = 30,
    idSuffix = ''
  ) => {
    const segmentId = `conv-${fromId}-${toId}${idSuffix}`;
    segments.push({
      id: segmentId,
      fromMachineId: fromId,
      toMachineId: toId,
      fromOutputType: materialType,
      capacity: 500, // 500 kg max on conveyor
      currentLoad: 0,
      flowRate: flowRate, // kg/sec
      transitTime: 3, // 3 seconds transit time
      inTransit: [],
    });

    // Update maps
    const downstream = downstreamMap.get(fromId) ?? [];
    downstream.push(toId);
    downstreamMap.set(fromId, downstream);

    const upstream = upstreamMap.get(toId) ?? [];
    upstream.push(fromId);
    upstreamMap.set(toId, upstream);
  };

  // Silos -> Mills (5 silos distribute across the 4 roller mills for load balancing)
  addSegment('silo-0', 'rm-101', 'wheat_grain', 40);
  addSegment('silo-0', 'rm-102', 'wheat_grain', 40);
  addSegment('silo-1', 'rm-102', 'corn_grain', 40);
  addSegment('silo-1', 'rm-103', 'corn_grain', 40);
  addSegment('silo-2', 'rm-103', 'wheat_grain', 40);
  addSegment('silo-2', 'rm-104', 'wheat_grain', 40);
  addSegment('silo-3', 'rm-104', 'corn_grain', 40);
  addSegment('silo-3', 'rm-101', 'corn_grain', 40);
  addSegment('silo-4', 'rm-102', 'wheat_grain', 40);
  addSegment('silo-4', 'rm-103', 'wheat_grain', 40);

  // Mills -> Sifters (flour output); mirrors the physical spouting (rm[i] -> sifter[i % 3]),
  // so every sifter is fed by the 4 mills (sifter-a by rm-101 & rm-104).
  addSegment('rm-101', 'sifter-a', 'flour', 50);
  addSegment('rm-102', 'sifter-b', 'flour', 50);
  addSegment('rm-103', 'sifter-c', 'flour', 50);
  addSegment('rm-104', 'sifter-a', 'flour', 50);
  addSegment('rm-101', 'sifter-a', 'semolina', 50, '-semolina');
  addSegment('rm-102', 'sifter-b', 'semolina', 50, '-semolina');
  addSegment('rm-103', 'sifter-c', 'semolina', 50, '-semolina');
  addSegment('rm-104', 'sifter-a', 'semolina', 50, '-semolina');

  // Sifters -> Packers
  // Each sifter feeds one packer primarily
  addSegment('sifter-a', 'packer-0', 'flour', 80);
  addSegment('sifter-b', 'packer-1', 'flour', 80);
  addSegment('sifter-c', 'packer-2', 'flour', 80);
  addSegment('sifter-a', 'packer-0', 'semolina', 80, '-semolina');
  addSegment('sifter-b', 'packer-1', 'semolina', 80, '-semolina');
  addSegment('sifter-c', 'packer-2', 'semolina', 80, '-semolina');

  return { segments, downstreamMap, upstreamMap };
}

// =============================================================================
// STORE IMPLEMENTATION
// =============================================================================

export const useMaterialFlowStore = create<MaterialFlowState>()(
  subscribeWithSelector((set, get) => {
    const initialMachineBuffers = createInitialMachineBuffers();
    return {
      machineBuffers: initialMachineBuffers,
      network: createInitialNetwork(),
      totalMaterialProcessed: 0,
      totalFlourProduced: 0,
      currentFlowRate: 0,
      currentPackerFlowRate: 0,
      initialInventoryKg: INITIAL_INVENTORY_KG,
      receivedKg: 0,
      wasteKg: 0,
      byproductKg: 0,
      shippedKg: 0,
      manifests: [],
      manifestSequence: 0,
      sourceLots: createInitialSourceLots(initialMachineBuffers),
      productionBatches: [],
      processGenealogy: [],
      wasteSourceContributions: [],
      byproductSourceContributions: [],
      shippedSourceContributions: [],
      lotSequence: 0,
      batchSequence: 0,
      processSequence: 0,
      simulationTime: 0,

      tickMaterialFlow: (deltaSeconds, productionSpeed, productionPlan) => {
        if (
          !Number.isFinite(deltaSeconds) ||
          !Number.isFinite(productionSpeed) ||
          deltaSeconds <= 0
        ) {
          return;
        }

        const state = get();
        if (productionSpeed <= 0) {
          if (state.currentFlowRate !== 0 || state.currentPackerFlowRate !== 0) {
            set({ currentFlowRate: 0, currentPackerFlowRate: 0 });
          }
          return;
        }

        const effectiveDelta = deltaSeconds * productionSpeed;
        const newTime = state.simulationTime + effectiveDelta;

        // Clone buffers for mutation
        const newBuffers = new Map<string, MachineBuffer>();
        state.machineBuffers.forEach((buffer, id) => {
          newBuffers.set(id, {
            ...buffer,
            inputBuffer: buffer.inputBuffer.map((material) => ({
              ...material,
              sourceContributions: cloneSourceContributions(material.sourceContributions),
              productBatches: material.productBatches?.map((batch) => ({ ...batch })),
            })),
            outputBuffer: buffer.outputBuffer.map((material) => ({
              ...material,
              sourceContributions: cloneSourceContributions(material.sourceContributions),
              productBatches: material.productBatches?.map((batch) => ({ ...batch })),
            })),
          });
        });

        // Clone network segments
        const newSegments = state.network.segments.map((seg) => ({
          ...seg,
          inTransit: seg.inTransit.map((transit) => ({
            ...transit,
            sourceContributions: cloneSourceContributions(transit.sourceContributions),
          })),
        }));

        const productionBatches = state.productionBatches.map((batch) => ({
          ...batch,
          sourceContributions: cloneSourceContributions(batch.sourceContributions),
          qcTestIds: [...batch.qcTestIds],
          dispatchManifestIds: [...batch.dispatchManifestIds],
        }));
        const newProcessRecords: ProcessGenealogyRecord[] = [];
        let batchSequence = state.batchSequence;
        let processSequence = state.processSequence;
        let wasteSourceContributions = cloneSourceContributions(state.wasteSourceContributions);
        let byproductSourceContributions = state.byproductSourceContributions;
        let byproductThisTick = 0;

        let instantFlowRate = 0;
        let instantPackerFlowRate = 0;
        let flourProducedThisTick = 0;
        let wasteThisTick = 0;

        const appendPackedBatch = (
          packerId: string,
          materialType: Extract<MaterialType, 'flour' | 'semolina'>,
          amountKg: number,
          sourceContributions: readonly SourceContribution[]
        ): ProductBatchContribution[] => {
          const assignments: ProductBatchContribution[] = [];
          // Material only joins an open batch of the same disposition, so a
          // held lot never dilutes into a released batch, and held output
          // fills one batch toward the target instead of a fragment per tick.
          const sourceDispositions = sourceContributions.map(
            (contribution) => state.sourceLots.get(contribution.lotId)?.disposition ?? 'released'
          );
          const disposition: MaterialDisposition = sourceDispositions.includes('recalled')
            ? 'recalled'
            : sourceDispositions.includes('hold')
              ? 'hold'
              : 'released';
          let remaining = amountKg;
          while (remaining > GENEALOGY_EPSILON_KG) {
            let batch: ProductionBatch | undefined;
            for (let index = productionBatches.length - 1; index >= 0; index -= 1) {
              const candidate = productionBatches[index];
              if (
                candidate.packerId === packerId &&
                candidate.materialType === materialType &&
                !candidate.sealed &&
                candidate.disposition === disposition &&
                candidate.availableKg === candidate.producedKg
              ) {
                batch = candidate;
                break;
              }
            }
            if (!batch) {
              batchSequence += 1;
              batch = {
                id: `batch-${String(batchSequence).padStart(5, '0')}`,
                packerId,
                materialType,
                producedKg: 0,
                availableKg: 0,
                simulationTime: newTime,
                sourceContributions: [],
                disposition,
                dispositionReason:
                  disposition === 'released' ? null : 'Inherited source-lot disposition',
                qcTestIds: [],
                dispatchManifestIds: [],
                sealed: false,
              };
              productionBatches.push(batch);
            }

            const availableCapacity = Math.max(0, PRODUCT_BATCH_TARGET_KG - batch.producedKg);
            const portion = Math.min(remaining, availableCapacity || remaining);
            const portionSources = scaleSourceContributions(
              sourceContributions,
              amountKg > 0 ? portion / amountKg : 0
            );
            batch.producedKg += portion;
            batch.availableKg += portion;
            batch.sourceContributions = mergeSourceContributions(
              batch.sourceContributions,
              portionSources
            );
            batch.sealed = batch.producedKg >= PRODUCT_BATCH_TARGET_KG - GENEALOGY_EPSILON_KG;
            assignments.push({ batchId: batch.id, amount: portion });
            remaining -= portion;
          }
          return assignments;
        };

        // 1. Process each machine: convert input -> output
        newBuffers.forEach((buffer) => {
          if (!buffer.isProcessing) return;

          // The processing rate is a machine-level budget. Sharing it across
          // material types prevents a multi-material buffer from multiplying
          // the machine's rated throughput.
          let remainingProcessCapacity = buffer.processingRate * effectiveDelta;

          // Process each input material type
          buffer.inputBuffer.forEach((inputMaterial) => {
            if (inputMaterial.amount <= 0 || remainingProcessCapacity <= 0) return;
            if (
              productionPlan &&
              ((buffer.machineType === 'roller_mill' &&
                inputMaterial.type !== productionPlan.sourceMaterial) ||
                ((buffer.machineType === 'plansifter' || buffer.machineType === 'packer') &&
                  inputMaterial.type !== productionPlan.finishedMaterial))
            ) {
              return;
            }

            const conversion = buffer.conversionRatios.find(
              (c) => c.inputType === inputMaterial.type
            );
            if (!conversion) return;

            const declaredOutputRatio = conversion.outputs.reduce(
              (sum, output) => sum + Math.max(0, output.ratio),
              0
            );
            if (declaredOutputRatio <= 0) return;

            // Defensive normalization prevents malformed ratios above 100%
            // from creating material. Ratios below 100% become recorded waste.
            const outputScale = declaredOutputRatio > 1 ? 1 / declaredOutputRatio : 1;
            const effectiveOutputRatio = Math.min(1, declaredOutputRatio);
            const existingOutputKg = buffer.outputBuffer.reduce(
              (sum, material) => sum + material.amount,
              0
            );
            const outputSpaceKg = Math.max(0, buffer.outputCapacity - existingOutputKg);
            const capacityLimitedInput =
              effectiveOutputRatio > 0 ? outputSpaceKg / effectiveOutputRatio : 0;

            // Calculate how much we can process
            const available = inputMaterial.amount;
            const toProcess = Math.min(available, remainingProcessCapacity, capacityLimitedInput);

            if (toProcess <= 0) return;

            // Withdraw the exact source contribution before changing the aggregate
            // amount, then append this machine to the path carried downstream.
            const inputContributions = appendMachineToPath(
              withdrawSourceContributions(inputMaterial, toProcess),
              buffer.machineId
            );

            // Subtract from input
            inputMaterial.amount -= toProcess;
            remainingProcessCapacity -= toProcess;

            // Add to output based on conversion ratios
            const processOutputs: MaterialAmount[] = [];
            conversion.outputs.forEach(({ type, ratio }) => {
              const outputAmount = toProcess * Math.max(0, ratio) * outputScale;
              const outputContributions = scaleSourceContributions(
                inputContributions,
                toProcess > 0 ? outputAmount / toProcess : 0
              );
              const existingOutput = buffer.outputBuffer.find((o) => o.type === type);
              if (existingOutput) {
                existingOutput.amount += outputAmount;
                existingOutput.sourceContributions = mergeSourceContributions(
                  existingOutput.sourceContributions,
                  outputContributions
                );
              } else {
                buffer.outputBuffer.push({
                  type,
                  amount: outputAmount,
                  sourceContributions: cloneSourceContributions(outputContributions),
                });
              }

              if (buffer.machineType === 'packer' && (type === 'flour' || type === 'semolina')) {
                const assignments = appendPackedBatch(
                  buffer.machineId,
                  type,
                  outputAmount,
                  outputContributions
                );
                const packedOutput = buffer.outputBuffer.find((output) => output.type === type);
                if (packedOutput) {
                  packedOutput.productBatches = mergeProductBatchContributions(
                    packedOutput.productBatches,
                    assignments
                  );
                }
              }

              processOutputs.push({
                type,
                amount: outputAmount,
                sourceContributions: cloneSourceContributions(outputContributions),
              });

              // Track flour production
              if (type === 'flour' && buffer.machineType === 'plansifter') {
                flourProducedThisTick += outputAmount;
              }
            });
            const processWasteKg = toProcess * (1 - effectiveOutputRatio);
            wasteThisTick += processWasteKg;
            wasteSourceContributions = mergeSourceContributions(
              wasteSourceContributions,
              scaleSourceContributions(
                inputContributions,
                toProcess > 0 ? processWasteKg / toProcess : 0
              )
            );
            processSequence += 1;
            newProcessRecords.push({
              id: `process-${String(processSequence).padStart(7, '0')}`,
              machineId: buffer.machineId,
              inputType: inputMaterial.type,
              inputKg: toProcess,
              outputs: processOutputs,
              wasteKg: processWasteKg,
              sourceContributions: cloneSourceContributions(inputContributions),
              simulationTime: newTime,
            });

            // Defensive check: avoid division by zero (early return already guards this,
            // but add explicit check at point of use for safety)
            if (deltaSeconds > 0) {
              instantFlowRate += toProcess / deltaSeconds;
              // Track the final-stage rate separately: only packers represent
              // finished-goods output. The headline throughput must use this, not
              // the all-stage sum (which triple-counts mill + sifter + packer).
              if (buffer.machineType === 'packer') {
                instantPackerFlowRate += toProcess / deltaSeconds;
              }
            }
          });
        });

        // 1b. Millfeed discharge: once a mill's bran + middlings bin reaches
        // MILLFEED_DISCHARGE_KG it empties to the conserved co-product ledger.
        newBuffers.forEach((buffer) => {
          if (buffer.machineType !== 'roller_mill') return;
          let millfeedKg = 0;
          for (const material of buffer.outputBuffer) {
            if (material.type === 'bran' || material.type === 'middlings') {
              millfeedKg += material.amount;
            }
          }
          if (millfeedKg < MILLFEED_DISCHARGE_KG) return;
          for (const material of buffer.outputBuffer) {
            if (material.type !== 'bran' && material.type !== 'middlings') continue;
            byproductSourceContributions = mergeSourceContributions(
              byproductSourceContributions,
              withdrawSourceContributions(material, material.amount)
            );
            byproductThisTick += material.amount;
            material.amount = 0;
          }
        });

        // 2. Move material along conveyors
        newSegments.forEach((segment) => {
          const fromBuffer = newBuffers.get(segment.fromMachineId);
          const toBuffer = newBuffers.get(segment.toMachineId);
          if (!fromBuffer || !toBuffer) return;

          // Check for material arrivals
          const arrivedMaterial = segment.inTransit.filter((t) => t.arrivalTime <= newTime);
          segment.inTransit = segment.inTransit.filter((t) => t.arrivalTime > newTime);

          // Add arrived material to destination input buffer.
          // Mass conservation: a parcel only leaves the belt (currentLoad -= ...)
          // for the amount the destination actually ACCEPTS. Any remainder stays
          // on the belt as a re-queued in-transit parcel that retries shortly.
          // Previously the whole parcel was removed from inTransit while
          // currentLoad was only decremented by the accepted amount - when a
          // destination buffer filled up, currentLoad ratcheted upward until
          // spaceOnConveyor hit 0 and the belt stalled PERMANENTLY (and the
          // rejected material was silently destroyed). With the re-queue, a
          // jammed belt backs up and then recovers once downstream drains.
          arrivedMaterial.forEach((arrived) => {
            const totalInput = toBuffer.inputBuffer.reduce((sum, m) => sum + m.amount, 0);
            const spaceAvailable = toBuffer.inputCapacity - totalInput;
            const toAdd = Math.max(0, Math.min(arrived.amount, spaceAvailable));

            if (toAdd > 0) {
              const acceptedContributions = scaleSourceContributions(
                arrived.sourceContributions,
                arrived.amount > 0 ? toAdd / arrived.amount : 0
              );
              const existingInput = toBuffer.inputBuffer.find((m) => m.type === arrived.type);
              if (existingInput) {
                existingInput.amount += toAdd;
                existingInput.sourceContributions = mergeSourceContributions(
                  existingInput.sourceContributions,
                  acceptedContributions
                );
              } else {
                toBuffer.inputBuffer.push({
                  type: arrived.type,
                  amount: toAdd,
                  sourceContributions: acceptedContributions,
                });
              }
              segment.currentLoad = Math.max(0, segment.currentLoad - toAdd);
            }

            const remainder = arrived.amount - toAdd;
            if (remainder > GENEALOGY_EPSILON_KG) {
              // Destination full: keep the remainder on the belt (currentLoad
              // still includes it) and retry in 1s of sim time.
              segment.inTransit.push({
                amount: remainder,
                arrivalTime: newTime + 1,
                type: arrived.type,
                sourceContributions: scaleSourceContributions(
                  arrived.sourceContributions,
                  arrived.amount > 0 ? remainder / arrived.amount : 0
                ),
              });
            }
          });

          const routedMaterial =
            fromBuffer.machineType === 'silo'
              ? productionPlan?.sourceMaterial
              : productionPlan?.finishedMaterial;
          if (routedMaterial && segment.fromOutputType !== routedMaterial) return;

          // Move material from source output to conveyor
          const outputMaterial = fromBuffer.outputBuffer.find(
            (m) => m.type === segment.fromOutputType
          );
          if (outputMaterial && outputMaterial.amount > 0) {
            const spaceOnConveyor = segment.capacity - segment.currentLoad;
            const flowThisTick = segment.flowRate * effectiveDelta;
            const toMove = Math.min(outputMaterial.amount, flowThisTick, spaceOnConveyor);

            if (toMove > 0) {
              const sourceContributions = withdrawSourceContributions(outputMaterial, toMove);
              outputMaterial.amount -= toMove;
              segment.currentLoad += toMove;
              segment.inTransit.push({
                amount: toMove,
                arrivalTime: newTime + segment.transitTime,
                type: segment.fromOutputType,
                sourceContributions,
              });
            }
          }
        });

        // Clean up zero-amount materials
        newBuffers.forEach((buffer) => {
          buffer.inputBuffer = buffer.inputBuffer.filter(
            (material) => material.amount > GENEALOGY_EPSILON_KG
          );
          buffer.outputBuffer = buffer.outputBuffer.filter(
            (material) => material.amount > GENEALOGY_EPSILON_KG
          );
        });

        let batchesToDrop = Math.max(0, productionBatches.length - MAX_PRODUCTION_BATCHES);
        const boundedProductionBatches =
          batchesToDrop > 0
            ? productionBatches.filter((batch) => {
                if (batchesToDrop > 0 && batch.disposition === 'shipped') {
                  batchesToDrop -= 1;
                  return false;
                }
                return true;
              })
            : productionBatches;

        set({
          machineBuffers: newBuffers,
          network: { ...state.network, segments: newSegments },
          simulationTime: newTime,
          totalMaterialProcessed: state.totalMaterialProcessed + instantFlowRate * deltaSeconds,
          totalFlourProduced: state.totalFlourProduced + flourProducedThisTick,
          currentFlowRate: instantFlowRate,
          currentPackerFlowRate: instantPackerFlowRate,
          wasteKg: state.wasteKg + wasteThisTick,
          byproductKg: state.byproductKg + byproductThisTick,
          productionBatches: boundedProductionBatches,
          batchSequence,
          processSequence,
          processGenealogy: [...state.processGenealogy, ...newProcessRecords].slice(
            -MAX_PROCESS_GENEALOGY_RECORDS
          ),
          wasteSourceContributions,
          byproductSourceContributions,
        });
      },

      syncMachineProcessing: (machines) => {
        const state = get();
        let changed = false;
        const newBuffers = new Map(state.machineBuffers);

        for (const machine of machines) {
          const buffer = newBuffers.get(machine.id);
          if (!buffer) continue;
          // 'running' and 'warning' machines process; idle/critical/stopped don't.
          const shouldProcess = machine.status === 'running' || machine.status === 'warning';
          if (buffer.isProcessing !== shouldProcess) {
            newBuffers.set(machine.id, { ...buffer, isProcessing: shouldProcess });
            changed = true;
          }
        }

        if (changed) {
          set({ machineBuffers: newBuffers });
        }
      },

      receiveGrainDelivery: (amountKg: number, details) => {
        if (!Number.isFinite(amountKg) || amountKg <= 0) return 0;
        const state = get();

        // Find the emptiest silo (least total stored grain)
        let emptiest: MachineBuffer | null = null;
        let emptiestTotal = Infinity;
        state.machineBuffers.forEach((buffer) => {
          if (buffer.machineType !== 'silo') return;
          const siloIndex = Number.parseInt(buffer.machineId.replace('silo-', ''), 10) || 0;
          const siloMaterial: Extract<MaterialType, 'wheat_grain' | 'corn_grain'> =
            siloIndex % 2 === 0 ? 'wheat_grain' : 'corn_grain';
          if (details?.materialType && details.materialType !== siloMaterial) return;
          const total = buffer.outputBuffer.reduce((sum, m) => sum + m.amount, 0);
          if (total < emptiestTotal) {
            emptiestTotal = total;
            emptiest = buffer;
          }
        });
        if (!emptiest) return 0;

        const target: MachineBuffer = emptiest;
        // Even silo indices store wheat, odd store corn (matches initial fill)
        const siloIndex = Number.parseInt(target.machineId.replace('silo-', ''), 10) || 0;
        const grainType: MaterialType = siloIndex % 2 === 0 ? 'wheat_grain' : 'corn_grain';
        const space = target.outputCapacity - emptiestTotal;
        const toAdd = Math.max(0, Math.min(amountKg, space));
        if (toAdd <= 0) return 0;

        const newBuffers = new Map(state.machineBuffers);
        const newOutput: MaterialAmount[] = target.outputBuffer.map((material) => ({
          ...material,
          sourceContributions: cloneSourceContributions(material.sourceContributions),
          productBatches: material.productBatches?.map((batch) => ({ ...batch })),
        }));
        const manifestSequence = state.manifestSequence + 1;
        const lotSequence = state.lotSequence + 1;
        const manifestId = `receiving-${String(manifestSequence).padStart(4, '0')}`;
        const lotId = `lot-${String(lotSequence).padStart(5, '0')}`;
        const contribution: SourceContribution = {
          lotId,
          amount: toAdd,
          path: [target.machineId],
        };
        const existing = newOutput.find((m) => m.type === grainType);
        if (existing) {
          existing.amount += toAdd;
          existing.sourceContributions = mergeSourceContributions(existing.sourceContributions, [
            contribution,
          ]);
        } else {
          newOutput.push({ type: grainType, amount: toAdd, sourceContributions: [contribution] });
        }
        newBuffers.set(target.machineId, { ...target, outputBuffer: newOutput });
        const manifest: MaterialManifest = {
          id: manifestId,
          kind: 'receiving',
          dock: 'receiving',
          requestedKg: amountKg,
          actualKg: toAdd,
          materials: [{ type: grainType, amount: toAdd }],
          sourceLots: [contribution],
          productBatches: [],
          simulationTime: state.simulationTime,
        };
        const sourceLots = new Map(state.sourceLots);
        sourceLots.set(lotId, {
          id: lotId,
          materialType: grainType,
          origin: 'receiving',
          sourceManifestId: manifestId,
          supplier: details?.supplier?.trim() || 'Scheduled farm intake',
          receivedKg: toAdd,
          simulationTime: state.simulationTime,
          disposition: 'released',
          dispositionReason: null,
        });
        while (sourceLots.size > MAX_SOURCE_LOTS) {
          const oldestLotId = sourceLots.keys().next().value as string | undefined;
          if (!oldestLotId) break;
          sourceLots.delete(oldestLotId);
        }
        set({
          machineBuffers: newBuffers,
          receivedKg: state.receivedKg + toAdd,
          manifests: [...state.manifests.slice(-(MAX_MATERIAL_MANIFESTS - 1)), manifest],
          manifestSequence,
          sourceLots,
          lotSequence,
        });
        return toAdd;
      },

      shipFinishedGoods: (amountKg, preferredMaterial) => {
        if (!Number.isFinite(amountKg) || amountKg <= 0) return 0;
        const state = get();
        const newBuffers = new Map(state.machineBuffers);
        const materials = new Map<MaterialType, number>();
        const productBatches = state.productionBatches.map((batch) => ({
          ...batch,
          sourceContributions: cloneSourceContributions(batch.sourceContributions),
          qcTestIds: [...batch.qcTestIds],
          dispatchManifestIds: [...batch.dispatchManifestIds],
        }));
        const shippedBatchContributions: ProductBatchContribution[] = [];
        let shippedSourceContributions: SourceContribution[] = [];
        let remaining = amountKg;

        // Stable machine and material order makes manifests replayable.
        for (const machineId of ['packer-0', 'packer-1', 'packer-2']) {
          if (remaining <= 0) break;
          const buffer = newBuffers.get(machineId);
          if (!buffer) continue;

          const outputBuffer = buffer.outputBuffer.map((material) => ({
            ...material,
            sourceContributions: cloneSourceContributions(material.sourceContributions),
            productBatches: material.productBatches?.map((batch) => ({ ...batch })),
          }));
          const materialOrder: ReadonlyArray<Extract<MaterialType, 'flour' | 'semolina'>> =
            preferredMaterial === 'semolina' ? ['semolina', 'flour'] : ['flour', 'semolina'];
          for (const materialType of materialOrder) {
            if (remaining <= 0) break;
            const material = outputBuffer.find((entry) => entry.type === materialType);
            if (!material || material.amount <= 0) continue;
            const batchContributions = material.productBatches ?? [];
            for (const contribution of batchContributions) {
              if (remaining <= 0) break;
              const batch = productBatches.find(
                (candidate) => candidate.id === contribution.batchId
              );
              if (!batch || batch.disposition !== 'released' || batch.availableKg <= 0) continue;
              const toShip = Math.min(contribution.amount, batch.availableKg, remaining);
              if (toShip <= 0) continue;

              contribution.amount -= toShip;
              material.amount -= toShip;
              remaining -= toShip;
              batch.availableKg -= toShip;
              batch.sealed = true;
              if (batch.availableKg <= GENEALOGY_EPSILON_KG) {
                batch.availableKg = 0;
                batch.disposition = 'shipped';
                batch.dispositionReason = 'Fully dispatched';
              }
              materials.set(materialType, (materials.get(materialType) ?? 0) + toShip);
              shippedBatchContributions.push({ batchId: batch.id, amount: toShip });
              const batchShipmentSources = scaleSourceContributions(
                batch.sourceContributions,
                batch.producedKg > 0 ? toShip / batch.producedKg : 0
              );
              shippedSourceContributions = mergeSourceContributions(
                shippedSourceContributions,
                batchShipmentSources
              );
              material.sourceContributions = subtractSourceContributions(
                material.sourceContributions,
                batchShipmentSources
              );
            }

            material.productBatches = batchContributions.filter(
              (contribution) => contribution.amount > GENEALOGY_EPSILON_KG
            );
          }

          newBuffers.set(machineId, {
            ...buffer,
            outputBuffer: outputBuffer.filter((material) => material.amount > GENEALOGY_EPSILON_KG),
          });
        }

        const actualKg = amountKg - remaining;
        if (actualKg <= 0) return 0;

        const manifestSequence = state.manifestSequence + 1;
        const manifestId = `shipping-${String(manifestSequence).padStart(4, '0')}`;
        for (const shippedBatch of shippedBatchContributions) {
          const batch = productBatches.find((candidate) => candidate.id === shippedBatch.batchId);
          if (batch && !batch.dispatchManifestIds.includes(manifestId)) {
            batch.dispatchManifestIds.push(manifestId);
          }
        }
        const manifest: MaterialManifest = {
          id: manifestId,
          kind: 'shipping',
          dock: 'shipping',
          requestedKg: amountKg,
          actualKg,
          materials: [...materials.entries()].map(([type, amount]) => ({ type, amount })),
          sourceLots: shippedSourceContributions,
          productBatches: mergeProductBatchContributions([], shippedBatchContributions),
          simulationTime: state.simulationTime,
        };
        const cumulativeShippedSources = mergeSourceContributions(
          state.shippedSourceContributions,
          shippedSourceContributions
        );
        set({
          machineBuffers: newBuffers,
          shippedKg: state.shippedKg + actualKg,
          manifests: [...state.manifests.slice(-(MAX_MATERIAL_MANIFESTS - 1)), manifest],
          manifestSequence,
          productionBatches: productBatches,
          shippedSourceContributions: cumulativeShippedSources,
        });
        return actualKg;
      },

      setBatchDisposition: (batchIds, disposition, reason, qcTestId) => {
        const requested = new Set(batchIds);
        const changed: string[] = [];
        set((state) => ({
          productionBatches: state.productionBatches.map((batch) => {
            if (!requested.has(batch.id) || batch.disposition === 'shipped') return batch;
            // A recall is a terminal product disposition. A later passing retest
            // may release a hold, but must never reverse a recall - not even in
            // two steps (recalled -> hold -> released).
            if (batch.disposition === 'recalled' && disposition !== 'recalled') return batch;
            changed.push(batch.id);
            return {
              ...batch,
              disposition,
              dispositionReason: reason,
              sealed: batch.sealed || disposition !== 'released',
              qcTestIds:
                qcTestId && !batch.qcTestIds.includes(qcTestId)
                  ? [...batch.qcTestIds, qcTestId]
                  : batch.qcTestIds,
            };
          }),
        }));
        return changed;
      },

      setLotDisposition: (lotIds, disposition, reason) => {
        const requested = new Set(lotIds);
        const affectedBatchIds: string[] = [];
        set((state) => {
          const sourceLots = new Map(state.sourceLots);
          for (const lotId of requested) {
            const lot = sourceLots.get(lotId);
            if (!lot) continue;
            if (lot.disposition === 'recalled' && disposition !== 'recalled') continue;
            sourceLots.set(lotId, { ...lot, disposition, dispositionReason: reason });
          }

          const productionBatches = state.productionBatches.map((batch) => {
            if (batch.disposition === 'shipped' || batch.disposition === 'recalled') return batch;
            if (!batch.sourceContributions.some((source) => requested.has(source.lotId)))
              return batch;
            const sourceDispositions = batch.sourceContributions.map(
              (source) => sourceLots.get(source.lotId)?.disposition ?? 'released'
            );
            const nextDisposition = sourceDispositions.includes('recalled')
              ? 'recalled'
              : sourceDispositions.includes('hold')
                ? 'hold'
                : disposition;
            affectedBatchIds.push(batch.id);
            return {
              ...batch,
              disposition: nextDisposition,
              dispositionReason: reason,
              sealed: batch.sealed || nextDisposition !== 'released',
            };
          });
          return { sourceLots, productionBatches };
        });
        return affectedBatchIds;
      },

      getBatchTrace: (batchId) => {
        const state = get();
        const batch = state.productionBatches.find((candidate) => candidate.id === batchId);
        if (!batch) return null;
        const grouped = new Map<string, { amount: number; paths: string[][] }>();
        for (const contribution of batch.sourceContributions) {
          const current = grouped.get(contribution.lotId) ?? { amount: 0, paths: [] };
          current.amount += contribution.amount;
          if (!current.paths.some((path) => path.join('>') === contribution.path.join('>'))) {
            current.paths.push([...contribution.path]);
          }
          grouped.set(contribution.lotId, current);
        }
        return {
          batch,
          sourceLots: [...grouped.entries()].flatMap(([lotId, contribution]) => {
            const lot = state.sourceLots.get(lotId);
            return lot ? [{ lot, ...contribution }] : [];
          }),
        };
      },

      getDispatchableFinishedGoods: () =>
        get().productionBatches.reduce(
          (sum, batch) => sum + (batch.disposition === 'released' ? batch.availableKg : 0),
          0
        ),

      getGenealogyBalance: () => {
        const state = get();
        const sumContributions = (contributions: readonly SourceContribution[] | undefined) =>
          (contributions ?? []).reduce((sum, contribution) => sum + contribution.amount, 0);
        let inventoryKg = 0;
        state.machineBuffers.forEach((buffer) => {
          for (const material of buffer.inputBuffer) {
            inventoryKg += sumContributions(material.sourceContributions);
          }
          for (const material of buffer.outputBuffer) {
            inventoryKg += sumContributions(material.sourceContributions);
          }
        });
        const inTransitKg = state.network.segments.reduce(
          (segmentTotal, segment) =>
            segmentTotal +
            segment.inTransit.reduce(
              (parcelTotal, parcel) => parcelTotal + sumContributions(parcel.sourceContributions),
              0
            ),
          0
        );
        const wasteKg = sumContributions(state.wasteSourceContributions);
        const byproductKg = sumContributions(state.byproductSourceContributions);
        const shippedKg = sumContributions(state.shippedSourceContributions);
        const expectedKg = state.initialInventoryKg + state.receivedKg;
        const accountedKg = inventoryKg + inTransitKg + wasteKg + byproductKg + shippedKg;
        return {
          expectedKg,
          inventoryKg,
          inTransitKg,
          wasteKg,
          byproductKg,
          shippedKg,
          accountedKg,
          errorKg: expectedKg - accountedKg,
        };
      },

      getMaterialBalance: () => {
        const state = get();
        const inventoryKg = sumMachineInventory(state.machineBuffers);
        // currentLoad is the conserved mass represented by inTransit parcels.
        // Summing both would double-count the same material.
        const inTransitKg = state.network.segments.reduce(
          (sum, segment) => sum + segment.currentLoad,
          0
        );
        const expectedKg = state.initialInventoryKg + state.receivedKg;
        const accountedKg =
          inventoryKg + inTransitKg + state.wasteKg + state.byproductKg + state.shippedKg;
        return {
          initialKg: state.initialInventoryKg,
          receivedKg: state.receivedKg,
          inventoryKg,
          inTransitKg,
          wasteKg: state.wasteKg,
          byproductKg: state.byproductKg,
          shippedKg: state.shippedKg,
          expectedKg,
          accountedKg,
          errorKg: expectedKg - accountedKg,
        };
      },

      getMachineBuffer: (machineId: string) => {
        return get().machineBuffers.get(machineId);
      },

      getConveyorLoad: (segmentId: string) => {
        const segment = get().network.segments.find((s) => s.id === segmentId);
        return segment?.currentLoad ?? 0;
      },

      getTotalInputBuffer: (machineId: string) => {
        const buffer = get().machineBuffers.get(machineId);
        if (!buffer) return 0;
        return buffer.inputBuffer.reduce((sum, m) => sum + m.amount, 0);
      },

      getTotalOutputBuffer: (machineId: string) => {
        const buffer = get().machineBuffers.get(machineId);
        if (!buffer) return 0;
        return buffer.outputBuffer.reduce((sum, m) => sum + m.amount, 0);
      },

      resetMaterialFlow: () => {
        const machineBuffers = createInitialMachineBuffers();
        set({
          machineBuffers,
          network: createInitialNetwork(),
          totalMaterialProcessed: 0,
          totalFlourProduced: 0,
          currentFlowRate: 0,
          currentPackerFlowRate: 0,
          initialInventoryKg: INITIAL_INVENTORY_KG,
          receivedKg: 0,
          wasteKg: 0,
          byproductKg: 0,
          shippedKg: 0,
          manifests: [],
          manifestSequence: 0,
          sourceLots: createInitialSourceLots(machineBuffers),
          productionBatches: [],
          processGenealogy: [],
          wasteSourceContributions: [],
          byproductSourceContributions: [],
          shippedSourceContributions: [],
          lotSequence: 0,
          batchSequence: 0,
          processSequence: 0,
          simulationTime: 0,
        });
      },
    };
  })
);
