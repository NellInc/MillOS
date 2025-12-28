/**
 * Mock Machine Data Fixtures
 *
 * Sample machine data for testing covering all zones and statuses.
 */

import { MachineData, MachineType } from '../../types';
import { FACTORY_ZONE_Z } from '../../constants/factoryLayout';

export const mockMachines: MachineData[] = [
  // Zone 1: Silos
  {
    id: 'silo-alpha',
    name: 'Silo Alpha',
    type: MachineType.SILO,
    position: [-20, 0, -22],
    size: [8, 20, 8],
    rotation: 0,
    status: 'running',
    metrics: {
      rpm: 0,
      temperature: 25,
      vibration: 0.1,
      load: 75,
    },
    lastMaintenance: '2025-01-01',
    nextMaintenance: '2025-02-01',
    fillLevel: 75,
    grainType: 'Wheat',
    grainQuality: 'premium',
  },
  {
    id: 'silo-beta',
    name: 'Silo Beta',
    type: MachineType.SILO,
    position: [-10, 0, -22],
    size: [8, 20, 8],
    rotation: 0,
    status: 'idle',
    metrics: {
      rpm: 0,
      temperature: 22,
      vibration: 0,
      load: 20,
    },
    lastMaintenance: '2025-01-05',
    nextMaintenance: '2025-02-05',
    fillLevel: 20,
    grainType: 'Corn',
    grainQuality: 'standard',
  },
  // Zone 2: Roller Mills
  {
    id: 'rm-101',
    name: 'Roller Mill RM-101',
    type: MachineType.ROLLER_MILL,
    position: [-15, 0, -6],
    size: [4, 5, 3],
    rotation: 0,
    status: 'running',
    metrics: {
      rpm: 1200,
      temperature: 65,
      vibration: 2.5,
      load: 85,
    },
    lastMaintenance: '2025-01-10',
    nextMaintenance: '2025-02-10',
    personality: {
      nickname: 'Old Reliable',
      trait: 'reliable',
      description: 'A dependable workhorse',
      quirks: ['Hums at 3AM'],
    },
    mood: 'happy',
  },
  {
    id: 'rm-102',
    name: 'Roller Mill RM-102',
    type: MachineType.ROLLER_MILL,
    position: [-5, 0, -6],
    size: [4, 5, 3],
    rotation: 0,
    status: 'warning',
    metrics: {
      rpm: 1100,
      temperature: 78,
      vibration: 4.2,
      load: 92,
    },
    lastMaintenance: '2024-12-15',
    nextMaintenance: '2025-01-15',
    mood: 'stressed',
  },
  // Zone 3: Plansifters
  {
    id: 'sifter-a',
    name: 'Plansifter A',
    type: MachineType.PLANSIFTER,
    position: [-10, 9, 6],
    size: [5, 4, 4],
    rotation: 0,
    status: 'running',
    metrics: {
      rpm: 200,
      temperature: 35,
      vibration: 1.8,
      load: 70,
    },
    lastMaintenance: '2025-01-08',
    nextMaintenance: '2025-02-08',
  },
  {
    id: 'sifter-b',
    name: 'Plansifter B',
    type: MachineType.PLANSIFTER,
    position: [0, 9, 6],
    size: [5, 4, 4],
    rotation: 0,
    status: 'critical',
    metrics: {
      rpm: 50,
      temperature: 95,
      vibration: 8.5,
      load: 100,
    },
    lastMaintenance: '2024-11-01',
    nextMaintenance: '2024-12-01',
  },
  // Zone 4: Packers
  {
    id: 'packer-1',
    name: 'Packer Line 1',
    type: MachineType.PACKER,
    position: [-10, 0, FACTORY_ZONE_Z.packing],
    size: [4, 3, 3],
    rotation: 0,
    status: 'running',
    metrics: {
      rpm: 60,
      temperature: 28,
      vibration: 0.8,
      load: 65,
    },
    lastMaintenance: '2025-01-12',
    nextMaintenance: '2025-02-12',
  },
  {
    id: 'packer-2',
    name: 'Packer Line 2',
    type: MachineType.PACKER,
    position: [0, 0, FACTORY_ZONE_Z.packing],
    size: [4, 3, 3],
    rotation: 0,
    status: 'idle',
    metrics: {
      rpm: 0,
      temperature: 22,
      vibration: 0,
      load: 0,
    },
    lastMaintenance: '2025-01-14',
    nextMaintenance: '2025-02-14',
  },
];

// Utility to get machines by status
export const getMachinesByStatus = (
  status: 'running' | 'idle' | 'warning' | 'critical'
): MachineData[] => mockMachines.filter((m) => m.status === status);

// Utility to get machines by zone
export const getMachinesByType = (type: MachineType): MachineData[] =>
  mockMachines.filter((m) => m.type === type);
