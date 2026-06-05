/**
 * Material Flow Store
 *
 * Tracks actual material flow through the mill network:
 * - Silos (raw grain storage) -> Roller Mills (grinding)
 * - Roller Mills -> Plansifters (sifting/separation)
 * - Plansifters -> Packers (packaging)
 *
 * Zone Layout (from CLAUDE.md):
 * - Zone 1 (z=-22): 5 Silos (Alpha-Epsilon)
 * - Zone 2 (z=-6): 6 Roller Mills (RM-101 to RM-106)
 * - Zone 3 (z=6, y=9 elevated): 3 Plansifters (A-C)
 * - Zone 4 (z=20): 3 Packers (Lines 1-3)
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

export interface MaterialAmount {
  type: MaterialType;
  amount: number; // kg
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
  inTransit: { amount: number; arrivalTime: number; type: MaterialType }[];
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

  // Time tracking for transit
  simulationTime: number; // seconds elapsed

  // Actions
  tickMaterialFlow: (deltaSeconds: number, productionSpeed: number) => void;
  getMachineBuffer: (machineId: string) => MachineBuffer | undefined;
  getConveyorLoad: (segmentId: string) => number;
  getTotalInputBuffer: (machineId: string) => number;
  getTotalOutputBuffer: (machineId: string) => number;
  resetMaterialFlow: () => void;
}

// =============================================================================
// INITIAL STATE FACTORY
// =============================================================================

function createInitialMachineBuffers(): Map<string, MachineBuffer> {
  const buffers = new Map<string, MachineBuffer>();

  // Silos - 5 silos with initial grain storage (20 tons each)
  const siloIds = ['silo-alpha', 'silo-beta', 'silo-gamma', 'silo-delta', 'silo-epsilon'];
  siloIds.forEach((id, index) => {
    const grainType: MaterialType = index % 2 === 0 ? 'wheat_grain' : 'corn_grain';
    buffers.set(id, {
      machineId: id,
      machineType: 'silo',
      inputBuffer: [], // Silos receive from trucks (external)
      outputBuffer: [{ type: grainType, amount: 20000 }], // 20 tons initial
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
      inputBuffer: [{ type: 'wheat_grain', amount: 500 }], // Start with some grain
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
      inputBuffer: [{ type: 'flour', amount: 300 }], // Start with some flour
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

  // Packers - 3 packing lines
  const packerIds = ['packer-1', 'packer-2', 'packer-3'];
  packerIds.forEach((id) => {
    buffers.set(id, {
      machineId: id,
      machineType: 'packer',
      inputBuffer: [{ type: 'flour', amount: 200 }], // Start with some flour
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

function createInitialNetwork(): NetworkTopology {
  const segments: ConveyorSegment[] = [];
  const downstreamMap = new Map<string, string[]>();
  const upstreamMap = new Map<string, string[]>();

  // Helper to add a segment
  const addSegment = (
    fromId: string,
    toId: string,
    materialType: MaterialType,
    flowRate: number = 30
  ) => {
    const segmentId = `conv-${fromId}-${toId}`;
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
  addSegment('silo-alpha', 'rm-101', 'wheat_grain', 40);
  addSegment('silo-alpha', 'rm-102', 'wheat_grain', 40);
  addSegment('silo-beta', 'rm-102', 'corn_grain', 40);
  addSegment('silo-beta', 'rm-103', 'corn_grain', 40);
  addSegment('silo-gamma', 'rm-103', 'wheat_grain', 40);
  addSegment('silo-gamma', 'rm-104', 'wheat_grain', 40);
  addSegment('silo-delta', 'rm-104', 'corn_grain', 40);
  addSegment('silo-delta', 'rm-101', 'corn_grain', 40);
  addSegment('silo-epsilon', 'rm-102', 'wheat_grain', 40);
  addSegment('silo-epsilon', 'rm-103', 'wheat_grain', 40);

  // Mills -> Sifters (flour output); mirrors the physical spouting (rm[i] -> sifter[i % 3]),
  // so every sifter is fed by the 4 mills (sifter-a by rm-101 & rm-104).
  addSegment('rm-101', 'sifter-a', 'flour', 50);
  addSegment('rm-102', 'sifter-b', 'flour', 50);
  addSegment('rm-103', 'sifter-c', 'flour', 50);
  addSegment('rm-104', 'sifter-a', 'flour', 50);

  // Sifters -> Packers
  // Each sifter feeds one packer primarily
  addSegment('sifter-a', 'packer-1', 'flour', 80);
  addSegment('sifter-b', 'packer-2', 'flour', 80);
  addSegment('sifter-c', 'packer-3', 'flour', 80);

  return { segments, downstreamMap, upstreamMap };
}

// =============================================================================
// STORE IMPLEMENTATION
// =============================================================================

export const useMaterialFlowStore = create<MaterialFlowState>()(
  subscribeWithSelector((set, get) => ({
    machineBuffers: createInitialMachineBuffers(),
    network: createInitialNetwork(),
    totalMaterialProcessed: 0,
    totalFlourProduced: 0,
    currentFlowRate: 0,
    currentPackerFlowRate: 0,
    simulationTime: 0,

    tickMaterialFlow: (deltaSeconds: number, productionSpeed: number) => {
      if (productionSpeed === 0 || deltaSeconds <= 0) return;

      const state = get();
      const effectiveDelta = deltaSeconds * productionSpeed;
      const newTime = state.simulationTime + effectiveDelta;

      // Clone buffers for mutation
      const newBuffers = new Map<string, MachineBuffer>();
      state.machineBuffers.forEach((buffer, id) => {
        newBuffers.set(id, {
          ...buffer,
          inputBuffer: buffer.inputBuffer.map((m) => ({ ...m })),
          outputBuffer: buffer.outputBuffer.map((m) => ({ ...m })),
        });
      });

      // Clone network segments
      const newSegments = state.network.segments.map((seg) => ({
        ...seg,
        inTransit: seg.inTransit.map((t) => ({ ...t })),
      }));

      let instantFlowRate = 0;
      let instantPackerFlowRate = 0;
      let flourProducedThisTick = 0;

      // 1. Process each machine: convert input -> output
      newBuffers.forEach((buffer) => {
        if (!buffer.isProcessing) return;

        const processAmount = buffer.processingRate * effectiveDelta;

        // Process each input material type
        buffer.inputBuffer.forEach((inputMaterial) => {
          if (inputMaterial.amount <= 0) return;

          const conversion = buffer.conversionRatios.find(
            (c) => c.inputType === inputMaterial.type
          );
          if (!conversion) return;

          // Calculate how much we can process
          const available = inputMaterial.amount;
          const toProcess = Math.min(available, processAmount);

          if (toProcess <= 0) return;

          // Subtract from input
          inputMaterial.amount -= toProcess;

          // Add to output based on conversion ratios
          conversion.outputs.forEach(({ type, ratio }) => {
            const outputAmount = toProcess * ratio;
            const existingOutput = buffer.outputBuffer.find((o) => o.type === type);
            if (existingOutput) {
              existingOutput.amount += outputAmount;
            } else {
              buffer.outputBuffer.push({ type, amount: outputAmount });
            }

            // Track flour production
            if (type === 'flour' && buffer.machineType === 'plansifter') {
              flourProducedThisTick += outputAmount;
            }
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
            const existingInput = toBuffer.inputBuffer.find((m) => m.type === arrived.type);
            if (existingInput) {
              existingInput.amount += toAdd;
            } else {
              toBuffer.inputBuffer.push({ type: arrived.type, amount: toAdd });
            }
            segment.currentLoad -= toAdd;
          }

          const remainder = arrived.amount - toAdd;
          if (remainder > 0.01) {
            // Destination full: keep the remainder on the belt (currentLoad
            // still includes it) and retry in 1s of sim time.
            segment.inTransit.push({
              amount: remainder,
              arrivalTime: newTime + 1,
              type: arrived.type,
            });
          }
        });

        // Move material from source output to conveyor
        const outputMaterial = fromBuffer.outputBuffer.find(
          (m) => m.type === segment.fromOutputType
        );
        if (outputMaterial && outputMaterial.amount > 0) {
          const spaceOnConveyor = segment.capacity - segment.currentLoad;
          const flowThisTick = segment.flowRate * effectiveDelta;
          const toMove = Math.min(outputMaterial.amount, flowThisTick, spaceOnConveyor);

          if (toMove > 0) {
            outputMaterial.amount -= toMove;
            segment.currentLoad += toMove;
            segment.inTransit.push({
              amount: toMove,
              arrivalTime: newTime + segment.transitTime,
              type: segment.fromOutputType,
            });
          }
        }
      });

      // Clean up zero-amount materials
      newBuffers.forEach((buffer) => {
        buffer.inputBuffer = buffer.inputBuffer.filter((m) => m.amount > 0.01);
        buffer.outputBuffer = buffer.outputBuffer.filter((m) => m.amount > 0.01);
      });

      set({
        machineBuffers: newBuffers,
        network: { ...state.network, segments: newSegments },
        simulationTime: newTime,
        totalMaterialProcessed: state.totalMaterialProcessed + instantFlowRate * deltaSeconds,
        totalFlourProduced: state.totalFlourProduced + flourProducedThisTick,
        currentFlowRate: instantFlowRate,
        currentPackerFlowRate: instantPackerFlowRate,
      });
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
      set({
        machineBuffers: createInitialMachineBuffers(),
        network: createInitialNetwork(),
        totalMaterialProcessed: 0,
        totalFlourProduced: 0,
        currentFlowRate: 0,
        currentPackerFlowRate: 0,
        simulationTime: 0,
      });
    },
  }))
);
