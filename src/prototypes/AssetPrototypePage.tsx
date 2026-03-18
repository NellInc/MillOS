import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import { ChevronLeft, Factory, Package } from 'lucide-react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { ConveyorBelt as ActualConveyorBelt } from '../components/ConveyorSystem';
import {
  SmallOffice as ActualSmallOffice,
  GrainElevator as ActualGrainElevator,
  ConveyorBridge as ActualConveyorBridge,
  CanalBoat as ActualCanalBoat,
  StorageTank as ActualStorageTank,
  PropaneTank as ActualPropaneTank,
} from '../components/FactoryExterior';
import { Barn as ActualBarn, WindmillComp as ActualWindmill } from '../components/FarmArea';
import { GasStation } from '../components/GasStationInstanced';
import { UtilityConduits } from '../components/infrastructure';
import { InstancedPackers } from '../components/machines/InstancedPackers';
import { InstancedPlansifters } from '../components/machines/InstancedPlansifters';
import { InstancedRollerMills } from '../components/machines/InstancedRollerMills';
import { ForkliftModel, SiloModel, WorkerModel } from '../components/models';
import { SpoutingSystem } from '../components/SpoutingSystem';
import { StackedPallets } from '../components/ambient';
import { Cottage as ActualCottage, TownHall as ActualTownHall } from '../components/VillageArea';
import { MachineType, type MachineData } from '../types';
import type { TruckAnimState } from '../components/truckbay/useTruckPhysics';

type AssetKind =
  | 'silo'
  | 'rollerMill'
  | 'plansifter'
  | 'packer'
  | 'conveyor'
  | 'spouting'
  | 'worker'
  | 'forklift'
  | 'palletCargo'
  | 'utilityTower'
  | 'factoryShell'
  | 'grainElevator'
  | 'conveyorBridge'
  | 'truckBay'
  | 'freightTruck'
  | 'supportOffice'
  | 'gasStation'
  | 'farmBarn'
  | 'windmill'
  | 'villageHouse'
  | 'townHall'
  | 'canalBoat';

type AssetVariant = 'current' | 'prototype';
type DetailLevel = 'hero' | 'swarm';

interface AssetFamily {
  id: AssetKind;
  label: string;
  category: string;
  accent: string;
  currentVersion: string;
  nextGenVersion: string;
  pitch: string;
  improvements: [string, string, string];
  heroScale: number;
  swarmScale: number;
}

type TruckBayPreviewModule = Pick<
  typeof import('../components/TruckBay'),
  'DockShelter' | 'PalletStaging' | 'RealisticTruck' | 'RollUpDoor'
>;

let truckBayPreviewModulePromise: Promise<TruckBayPreviewModule> | null = null;
let truckBayPreviewModuleCache: TruckBayPreviewModule | null = null;

function loadTruckBayPreviewModule(): Promise<TruckBayPreviewModule> {
  if (truckBayPreviewModuleCache) {
    return Promise.resolve(truckBayPreviewModuleCache);
  }

  if (!truckBayPreviewModulePromise) {
    truckBayPreviewModulePromise = import('../components/TruckBay').then((module) => {
      truckBayPreviewModuleCache = {
        DockShelter: module.DockShelter,
        PalletStaging: module.PalletStaging,
        RealisticTruck: module.RealisticTruck,
        RollUpDoor: module.RollUpDoor,
      };
      return truckBayPreviewModuleCache;
    });
  }

  return truckBayPreviewModulePromise;
}

function useTruckBayPreviewModule(): TruckBayPreviewModule | null {
  const [module, setModule] = useState<TruckBayPreviewModule | null>(truckBayPreviewModuleCache);

  useEffect(() => {
    if (module) return;

    let cancelled = false;
    void loadTruckBayPreviewModule().then((loadedModule) => {
      if (!cancelled) {
        setModule(loadedModule);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [module]);

  return module;
}

const ASSET_FAMILIES: AssetFamily[] = [
  {
    id: 'silo',
    label: 'Silo',
    category: 'Storage',
    accent: '#94a3b8',
    currentVersion: 'Silo GLB',
    nextGenVersion: 'Service Silo NX',
    pitch: 'Storage vessels gain service access, telemetry, and a clearer industrial silhouette.',
    improvements: [
      'Catwalk ring with ladder cage and service mast.',
      'Segmented shell ribs and reinforced hopper discharge.',
      'Beacon lighting and inspection hatches for a readable top-down profile.',
    ],
    heroScale: 0.92,
    swarmScale: 0.19,
  },
  {
    id: 'rollerMill',
    label: 'Roller Mill',
    category: 'Processing',
    accent: '#38bdf8',
    currentVersion: 'Instanced Roller Mill',
    nextGenVersion: 'Roller Mill NX',
    pitch:
      'The mill body becomes layered machinery instead of a single box, with motors and service faces.',
    improvements: [
      'Separated motor pod, access doors, and feed chute hierarchy.',
      'Vent slots, control skin, and roller housings add readable depth.',
      'Machine stance is wider and heavier so it feels production-grade in the scene.',
    ],
    heroScale: 0.94,
    swarmScale: 0.19,
  },
  {
    id: 'plansifter',
    label: 'Plansifter',
    category: 'Sifting',
    accent: '#fde68a',
    currentVersion: 'Instanced Plansifter',
    nextGenVersion: 'Twin-Chamber Plansifter',
    pitch:
      'Prototype sifters read as suspended dynamic machines with mounts, ducts, and maintenance access.',
    improvements: [
      'Twin suspended chambers with visible spring isolation.',
      'Upper gantry and walkway establish elevation more clearly.',
      'Drive unit, intake, and outlet geometry break up the current block.',
    ],
    heroScale: 0.86,
    swarmScale: 0.18,
  },
  {
    id: 'packer',
    label: 'Packer',
    category: 'Packaging',
    accent: '#fb923c',
    currentVersion: 'Instanced Packer',
    nextGenVersion: 'Enclosed Line Packer',
    pitch: 'Packaging lines shift from a skeletal frame to an enclosed, operator-facing line end.',
    improvements: [
      'Bag clamp, hood, HMI, and guarded conveyor communicate purpose instantly.',
      'Rhythmic line modules and rails make it read as packaging equipment, not scaffolding.',
      'Color blocking is cleaner for quick identification in the final mill.',
    ],
    heroScale: 0.92,
    swarmScale: 0.2,
  },
  {
    id: 'conveyor',
    label: 'Conveyor',
    category: 'Flow',
    accent: '#22c55e',
    currentVersion: 'Conveyor Belt',
    nextGenVersion: 'Sensor Rail Conveyor',
    pitch:
      'Conveyors get sensors, side rails, and powered drums so the production spine looks intentional.',
    improvements: [
      'Guard rails and drive housing make motion direction legible.',
      'Sensor arches and rollers add scan-line rhythm along the belt.',
      'Product reads more clearly on the line with spacing and support detail.',
    ],
    heroScale: 0.98,
    swarmScale: 0.2,
  },
  {
    id: 'spouting',
    label: 'Spouting',
    category: 'Routing',
    accent: '#67e8f9',
    currentVersion: 'Spouting System',
    nextGenVersion: 'Cyclone Routing Array',
    pitch: 'Pipes become a networked process object with separators, valves, and split routing.',
    improvements: [
      'Cyclone body and elbow network add believable flour-routing hardware.',
      'Valve blocks and hanging supports improve readability from distance.',
      'Branching flow helps distinguish this system from conveyors in screenshots.',
    ],
    heroScale: 0.98,
    swarmScale: 0.2,
  },
  {
    id: 'worker',
    label: 'Worker',
    category: 'Character',
    accent: '#f87171',
    currentVersion: 'Worker GLB',
    nextGenVersion: 'Operator Mk II',
    pitch:
      'Characters move from blocky placeholders to stylized operators with kit, posture, and role cues.',
    improvements: [
      'Helmet, visor, vest, belt, and tablet give the silhouette job identity.',
      'Body proportions stay stylized but less toy-like at medium distance.',
      'Pose language supports animation follow-up without requiring a full rig pass yet.',
    ],
    heroScale: 1,
    swarmScale: 0.22,
  },
  {
    id: 'forklift',
    label: 'Forklift',
    category: 'Vehicle',
    accent: '#facc15',
    currentVersion: 'Forklift GLB',
    nextGenVersion: 'Cargo Forklift NX',
    pitch:
      'The forklift evolves into a more credible vehicle with a layered mast, operator bay, and cargo stack.',
    improvements: [
      'Twin-rail mast, overhead guard, seat, and steering frame the operator area.',
      'Counterweight and body surfacing add mass where the current version is too flat.',
      'Palletized cargo reads better in motion and at rest.',
    ],
    heroScale: 0.9,
    swarmScale: 0.18,
  },
  {
    id: 'palletCargo',
    label: 'Pallet Cargo',
    category: 'Props',
    accent: '#c084fc',
    currentVersion: 'Stacked Pallets',
    nextGenVersion: 'Wrapped Freight Stack',
    pitch: 'Bag stacks become retail-ready freight with wrap, straps, and cleaner pallet layering.',
    improvements: [
      'Stacked sacks vary by layer instead of appearing as one repeated block.',
      'Wrap and strapping improve volume read without changing the game mechanics.',
      'Freight tag and top cap make close-up captures more believable.',
    ],
    heroScale: 1,
    swarmScale: 0.22,
  },
  {
    id: 'utilityTower',
    label: 'Utility Infrastructure',
    category: 'Infrastructure',
    accent: '#a3e635',
    currentVersion: 'Tank and Conduit Cluster',
    nextGenVersion: 'Service Tower NX',
    pitch:
      'Service architecture gets ladders, ducts, and lights so background assets stop feeling disposable.',
    improvements: [
      'Catwalk, ladder cage, and roof plant create a stronger skyline.',
      'Pipe runs and junction boxes tie the tower back into the mill systems.',
      'Lighting and safety accents let it contribute to composition at night.',
    ],
    heroScale: 0.94,
    swarmScale: 0.2,
  },
  {
    id: 'factoryShell',
    label: 'Factory Shell',
    category: 'Exterior',
    accent: '#60a5fa',
    currentVersion: 'Factory Exterior',
    nextGenVersion: 'Campus Mill NX',
    pitch:
      'The main exterior shifts from a plain massing block to a composed industrial facade with rhythm, entries, and service zones.',
    improvements: [
      'Facade stepping, glazed bands, and roofline plant give the mill a stronger silhouette.',
      'Dock portals, service stairs, and lighting break the shell into believable working zones.',
      'Material blocking is cleaner so the building reads from distance and close orbit alike.',
    ],
    heroScale: 1.08,
    swarmScale: 0.22,
  },
  {
    id: 'grainElevator',
    label: 'Grain Elevator',
    category: 'Storage',
    accent: '#93c5fd',
    currentVersion: 'Grain Elevator',
    nextGenVersion: 'Headhouse Elevator NX',
    pitch:
      'Exterior grain handling becomes a vertical process landmark with a proper headhouse, bins, and service access.',
    improvements: [
      'Bin cluster, transfer head, and spouts make the asset read as grain infrastructure, not a generic tower.',
      'Ladders, cages, and platforms add believable maintenance routes.',
      'Massing is tiered so it anchors the skyline next to the factory shell.',
    ],
    heroScale: 1.02,
    swarmScale: 0.2,
  },
  {
    id: 'conveyorBridge',
    label: 'Conveyor Bridge',
    category: 'Routing',
    accent: '#22d3ee',
    currentVersion: 'Conveyor Bridge',
    nextGenVersion: 'Truss Conveyor Bridge',
    pitch:
      'Exterior links become elevated conveyor bridges with truss language, catwalks, and visible transport hardware.',
    improvements: [
      'Open truss structure gives the span depth without making it visually heavy.',
      'Support bents and service walkways explain how the link is built and maintained.',
      'Roller and chute cues help it read as active material movement across the campus.',
    ],
    heroScale: 1,
    swarmScale: 0.2,
  },
  {
    id: 'truckBay',
    label: 'Truck Bay',
    category: 'Logistics',
    accent: '#fb923c',
    currentVersion: 'Dock Bay',
    nextGenVersion: 'Dock Bay NX',
    pitch:
      'The loading area gains shelter, lights, levelers, and lane equipment so it reads as a real logistics edge.',
    improvements: [
      'Dock shelters, bumpers, and bay hardware clearly define where trucks interface with the mill.',
      'Lane markings and safety gear make the apron legible in top-down and oblique views.',
      'Canopies and status lights create a stronger nighttime scene.',
    ],
    heroScale: 1.02,
    swarmScale: 0.2,
  },
  {
    id: 'freightTruck',
    label: 'Freight Truck',
    category: 'Logistics',
    accent: '#f59e0b',
    currentVersion: 'Realistic Truck',
    nextGenVersion: 'Freight Rig NX',
    pitch:
      'Exterior logistics vehicles move from toy-like trucks to a haulage rig with readable cab and trailer detail.',
    improvements: [
      'Aerodynamic cab, fuel tanks, and wheel groups give the tractor proper mass.',
      'Trailer edge lights, under-run bar, and graphics create a cleaner side profile.',
      'The whole rig stages better at the dock and on approach roads.',
    ],
    heroScale: 0.98,
    swarmScale: 0.18,
  },
  {
    id: 'supportOffice',
    label: 'Support Office',
    category: 'Support',
    accent: '#38bdf8',
    currentVersion: 'Small Office',
    nextGenVersion: 'Operations Office NX',
    pitch:
      'Support buildings become a clearer office campus with canopy entries, glazing, and secondary massing.',
    improvements: [
      'Entry canopy and window rhythm distinguish the office from plant utility boxes.',
      'Roof plant and annex volume keep the silhouette from feeling flat.',
      'The prototype reads as inhabited support space rather than a placeholder cuboid.',
    ],
    heroScale: 0.96,
    swarmScale: 0.18,
  },
  {
    id: 'gasStation',
    label: 'Gas Station',
    category: 'Support',
    accent: '#34d399',
    currentVersion: 'Gas Station',
    nextGenVersion: 'Forecourt Service NX',
    pitch:
      'The fuel point becomes a proper forecourt with a kiosk, canopy structure, and pump islands.',
    improvements: [
      'Canopy fascia, pumps, and bollards create a credible roadside service asset.',
      'Kiosk glazing and signage add a usable small-scale landmark.',
      'Lighting and surface detailing help the station hold up in wider exterior shots.',
    ],
    heroScale: 0.94,
    swarmScale: 0.18,
  },
  {
    id: 'farmBarn',
    label: 'Farm Barn',
    category: 'Farm',
    accent: '#ef4444',
    currentVersion: 'Barn',
    nextGenVersion: 'Working Barn NX',
    pitch:
      'The farmstead gets a more complete barn with annexes, loft detail, and readable service doors.',
    improvements: [
      'Loft opening, lean-to bay, and trim hierarchy make the barn feel built rather than symbolic.',
      'Roof vents and side additions improve the long-range silhouette.',
      'The prototype pairs better with the field, animal, and windmill assets nearby.',
    ],
    heroScale: 0.98,
    swarmScale: 0.18,
  },
  {
    id: 'windmill',
    label: 'Windmill',
    category: 'Farm',
    accent: '#facc15',
    currentVersion: 'Windmill',
    nextGenVersion: 'Field Windmill NX',
    pitch:
      'The windmill upgrades from a toy tower to a stronger farm landmark with cap, gallery, and sail structure.',
    improvements: [
      'Blade arms and sail panels gain proper hierarchy and stronger read from distance.',
      'Gallery ring and entry door give the tower believable access.',
      'The tower mass feels stable enough to hold the scene horizon.',
    ],
    heroScale: 0.94,
    swarmScale: 0.18,
  },
  {
    id: 'villageHouse',
    label: 'Village House',
    category: 'Village',
    accent: '#fda4af',
    currentVersion: 'Cottage',
    nextGenVersion: 'Townhouse NX',
    pitch:
      'Village homes become more expressive civic facades with roof shapes, shutters, and storefront rhythm.',
    improvements: [
      'Roof breakups, dormers, and shutters give the houses a memorable silhouette.',
      'Ground-floor trim and glazing add variety without abandoning the stylized look.',
      'Color blocking feels intentional instead of randomly pastel.',
    ],
    heroScale: 0.96,
    swarmScale: 0.18,
  },
  {
    id: 'townHall',
    label: 'Town Hall',
    category: 'Village',
    accent: '#a78bfa',
    currentVersion: 'Town Hall',
    nextGenVersion: 'Civic Hall NX',
    pitch:
      'The village centerpiece becomes a true civic landmark with a clock tower, arcade, and layered roofline.',
    improvements: [
      'Tower base, clock face, and civic stair create a strong plaza anchor.',
      'Arcade openings and trim add depth where the current mass is too flat.',
      'Roof and tower proportions better match the surrounding village scene.',
    ],
    heroScale: 1.02,
    swarmScale: 0.19,
  },
  {
    id: 'canalBoat',
    label: 'Canal Boat',
    category: 'Canal',
    accent: '#67e8f9',
    currentVersion: 'Canal Boat',
    nextGenVersion: 'Cargo Boat NX',
    pitch:
      'The waterside vehicle becomes a proper canal cargo boat with cabin, deck gear, and freight profile.',
    improvements: [
      'Bow, stern cabin, and cargo deck define the hull as transport rather than a floating plank.',
      'Railings, hatches, and stack detail give the boat close-up credibility.',
      'The prototype supports stronger composition along the river and lock areas.',
    ],
    heroScale: 0.98,
    swarmScale: 0.18,
  },
];

const NOOP_SELECT_MACHINE = (_machine: MachineData) => {};

const createPreviewMachine = (
  id: string,
  name: string,
  type: MachineType,
  size: [number, number, number],
  position: [number, number, number],
  rotation = 0
): MachineData => ({
  id,
  name,
  type,
  position,
  size,
  rotation,
  status: 'idle',
  metrics: {
    rpm: 0,
    temperature: 22,
    vibration: 0,
    load: 0,
    wear: 8,
    efficiency: 100,
  },
  lastMaintenance: '2026-03-01',
  nextMaintenance: '2026-04-01',
  fillLevel: type === MachineType.SILO ? 72 : undefined,
  grainQuality: type === MachineType.SILO ? 'standard' : undefined,
  grainType: type === MachineType.SILO ? 'Wheat' : undefined,
  maintenanceCountdown: 168,
});

const CURRENT_ROLLER_MILL_MACHINES: MachineData[] = [
  createPreviewMachine(
    'prototype-current-roller-mill',
    'Prototype Roller Mill',
    MachineType.ROLLER_MILL,
    [3.5, 5, 3.5],
    [0, 0, 0]
  ),
];

const CURRENT_PLANSIFTER_MACHINES: MachineData[] = [
  createPreviewMachine(
    'prototype-current-plansifter',
    'Prototype Plansifter',
    MachineType.PLANSIFTER,
    [7, 7, 7],
    [0, 0, 0]
  ),
];

const CURRENT_PACKER_MACHINES: MachineData[] = [
  createPreviewMachine(
    'prototype-current-packer',
    'Prototype Packer',
    MachineType.PACKER,
    [4, 6, 4],
    [0, 0, 0],
    Math.PI
  ),
];

const CURRENT_SPOUTING_MACHINES: MachineData[] = [
  createPreviewMachine(
    'prototype-spout-silo',
    'Prototype Silo',
    MachineType.SILO,
    [4.5, 16, 4.5],
    [-7, 0, -4]
  ),
  createPreviewMachine(
    'prototype-spout-mill',
    'Prototype Mill',
    MachineType.ROLLER_MILL,
    [3.5, 5, 3.5],
    [0, 0, 0]
  ),
  createPreviewMachine(
    'prototype-spout-sifter',
    'Prototype Sifter',
    MachineType.PLANSIFTER,
    [7, 7, 7],
    [7, 5, 4]
  ),
  createPreviewMachine(
    'prototype-spout-packer',
    'Prototype Packer',
    MachineType.PACKER,
    [4, 6, 4],
    [0, 0, 9],
    Math.PI
  ),
];

const STATIC_TRUCK_STATE: TruckAnimState = {
  phase: 'docked',
  x: 0,
  z: 0,
  rotation: 0,
  speed: 0,
  steeringAngle: 0,
  brakeLights: false,
  reverseLights: false,
  leftSignal: false,
  rightSignal: false,
  trailerAngle: 0,
  cabRoll: 0,
  cabPitch: 0,
  throttle: 0,
  doorsOpen: false,
};

const REVIEW_LENSES = [
  'Industrial design',
  'Gameplay readability',
  'Materials',
  'Animation',
  'Performance',
  'Maintenance',
  'Safety',
  'Lighting',
] as const;

const FACTORY_EQUIPMENT_IDS: AssetKind[] = [
  'silo',
  'rollerMill',
  'plansifter',
  'packer',
  'conveyor',
  'spouting',
  'forklift',
  'palletCargo',
  'utilityTower',
];

const GRID_COLUMNS = 5;
const GRID_SPACING_X = 18;
const GRID_SPACING_Z = 20;
const LEFT_MODEL_OFFSET = -4.8;
const RIGHT_MODEL_OFFSET = 4.8;
const CAMERA_FOCUS_HEIGHT = 3;
const CAMERA_MOVE_SPEED = 6;
const GRID_WIDTH = 136;

const getGridRowCount = (itemCount: number): number => Math.ceil(itemCount / GRID_COLUMNS);

const getGridDepth = (itemCount: number): number =>
  Math.max(94, (getGridRowCount(itemCount) - 1) * GRID_SPACING_Z + 52);

const getCellPosition = (index: number, itemCount: number): [number, number, number] => {
  const column = index % GRID_COLUMNS;
  const row = Math.floor(index / GRID_COLUMNS);
  const rowCount = getGridRowCount(itemCount);
  const x = (column - (GRID_COLUMNS - 1) / 2) * GRID_SPACING_X;
  const z = (row - (rowCount - 1) / 2) * GRID_SPACING_Z;
  return [x, 0, z];
};

const toRgb = (hex: string, alpha: number): string => {
  const safeHex = hex.replace('#', '');
  const expanded =
    safeHex.length === 3
      ? safeHex
          .split('')
          .map((part) => part + part)
          .join('')
      : safeHex;
  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const AssetPrototypePage: React.FC = () => {
  const [comparisonScope, setComparisonScope] = useState<'factory' | 'all'>('factory');
  const [selectedAssetId, setSelectedAssetId] = useState<AssetKind>('rollerMill');

  const visibleFamilies = useMemo(
    () =>
      comparisonScope === 'factory'
        ? ASSET_FAMILIES.filter((family) => FACTORY_EQUIPMENT_IDS.includes(family.id))
        : ASSET_FAMILIES,
    [comparisonScope]
  );

  useEffect(() => {
    if (!visibleFamilies.some((family) => family.id === selectedAssetId)) {
      setSelectedAssetId(visibleFamilies[0]?.id ?? 'rollerMill');
    }
  }, [selectedAssetId, visibleFamilies]);

  const selectedFamily =
    visibleFamilies.find((family) => family.id === selectedAssetId) ??
    visibleFamilies[0] ??
    ASSET_FAMILIES[0];
  const totalModels = visibleFamilies.length * 2;
  const scopeLabel = comparisonScope === 'factory' ? 'Factory equipment' : 'All models';

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-950 text-slate-50">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(17,94,89,0.25),_transparent_42%),linear-gradient(180deg,_rgba(8,15,27,0.85),_rgba(2,6,23,0.98))]" />

      <Canvas
        className="absolute inset-0"
        camera={{ position: [0, 28, 56], fov: 34 }}
        dpr={[1, 1.75]}
        shadows
      >
        <PrototypeScene
          families={visibleFamilies}
          selectedAssetId={selectedAssetId}
          onSelectAsset={setSelectedAssetId}
        />
      </Canvas>

      <div className="absolute inset-0 pointer-events-none">
        <div className="grid h-full grid-rows-[auto_minmax(0,1fr)] gap-3 p-3 md:gap-4 md:p-6">
          <header className="pointer-events-auto">
            <div className="grid gap-3 rounded-[28px] border border-white/10 bg-slate-950/75 p-4 shadow-[0_30px_120px_rgba(2,6,23,0.65)] backdrop-blur-xl md:grid-cols-[minmax(0,1fr)_320px] md:p-5">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-200">
                    <Factory className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-200/70">
                      Prototype Lab
                    </p>
                    <h1 className="text-xl font-semibold tracking-[0.04em] text-white md:text-2xl">
                      Original vs Changed Models
                    </h1>
                  </div>
                </div>

                <p className="max-w-3xl text-sm leading-6 text-slate-300 md:text-[15px]">
                  Showing the untouched in-repo models on the left and the changed versions on the
                  right. The view defaults to factory equipment so you can inspect the before and
                  after pass without the exterior set getting in the way.
                </p>

                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                  Click a model to center on it. Use WASD to move around the field.
                </p>

                <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.24em] text-slate-300">
                  <a
                    href={import.meta.env.BASE_URL}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-slate-100 transition hover:border-cyan-300/50 hover:bg-cyan-300/10"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Return to Mill
                  </a>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">
                    {visibleFamilies.length} models
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">
                    {REVIEW_LENSES.length} review lenses
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">
                    {totalModels} hero models
                  </span>
                </div>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                      Comparison Mode
                    </p>
                    <p className="text-sm font-medium text-white">{scopeLabel}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setComparisonScope('factory')}
                      className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em] transition ${
                        comparisonScope === 'factory'
                          ? 'border-cyan-300/45 bg-cyan-300/15 text-cyan-100'
                          : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/8'
                      }`}
                    >
                      Factory
                    </button>
                    <button
                      type="button"
                      onClick={() => setComparisonScope('all')}
                      className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em] transition ${
                        comparisonScope === 'all'
                          ? 'border-cyan-300/45 bg-cyan-300/15 text-cyan-100'
                          : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/8'
                      }`}
                    >
                      All
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {REVIEW_LENSES.map((lens) => (
                    <span
                      key={lens}
                      className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100"
                    >
                      {lens}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </header>

          <div className="grid min-h-0 gap-3 md:grid-cols-[390px_minmax(0,1fr)_340px] md:gap-4">
            <aside className="pointer-events-auto flex min-h-0 flex-col gap-3">
              <section className="flex min-h-0 flex-col rounded-[28px] border border-white/10 bg-slate-950/78 p-4 shadow-[0_24px_90px_rgba(2,6,23,0.6)] backdrop-blur-xl md:p-5">
                <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-200/70">
                  {comparisonScope === 'factory' ? 'Factory Equipment' : 'Model Registry'}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {comparisonScope === 'factory'
                    ? 'The original factory equipment models before the pass, versus what they were changed to.'
                    : 'Every model on this page with its original and changed version names.'}
                </p>

                <div className="mt-4 min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                  <div className="grid grid-cols-[0.9fr_1.15fr_1.15fr] gap-3 border-b border-white/10 px-4 py-3 text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    <span>Model</span>
                    <span>Original</span>
                    <span>Changed To</span>
                  </div>

                  <div className="overflow-y-auto">
                    {visibleFamilies.map((family) => {
                      const isSelected = family.id === selectedAssetId;
                      return (
                        <button
                          key={`registry-${family.id}`}
                          type="button"
                          onClick={() => setSelectedAssetId(family.id)}
                          className={`grid w-full grid-cols-[0.9fr_1.15fr_1.15fr] gap-3 border-b border-white/6 px-4 py-3 text-left align-top transition last:border-b-0 ${
                            isSelected ? 'bg-white/10' : 'hover:bg-white/7'
                          }`}
                          style={
                            isSelected ? { boxShadow: `inset 3px 0 0 ${family.accent}` } : undefined
                          }
                        >
                          <span className="text-base font-medium leading-6 text-white">
                            {family.label}
                          </span>
                          <span className="text-sm leading-6 text-slate-300">
                            {family.currentVersion}
                          </span>
                          <span className="text-sm leading-6 text-cyan-100">
                            {family.nextGenVersion}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section className="rounded-[28px] border border-white/10 bg-slate-950/78 p-4 shadow-[0_24px_90px_rgba(2,6,23,0.6)] backdrop-blur-xl md:p-5">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-300/30 bg-amber-300/10 text-amber-100">
                    <Package className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-amber-100/70">
                      Quick Select
                    </p>
                    <p className="text-sm text-slate-300">
                      Jump straight to an original-versus-changed equipment pair.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {visibleFamilies.map((family) => {
                    const isSelected = family.id === selectedAssetId;
                    return (
                      <button
                        key={family.id}
                        type="button"
                        onClick={() => setSelectedAssetId(family.id)}
                        className={`rounded-full border px-3 py-2 text-sm transition ${
                          isSelected
                            ? 'border-white/20 bg-white/10 text-white'
                            : 'border-white/8 bg-white/4 text-slate-300 hover:border-white/15 hover:bg-white/8'
                        }`}
                        style={
                          isSelected
                            ? {
                                background: `linear-gradient(135deg, ${toRgb(family.accent, 0.22)}, rgba(15, 23, 42, 0.88))`,
                                borderColor: toRgb(family.accent, 0.55),
                              }
                            : undefined
                        }
                      >
                        {family.label}
                      </button>
                    );
                  })}
                </div>
              </section>
            </aside>

            <div className="hidden md:block" />

            <section className="pointer-events-auto min-h-0">
              <div className="flex h-full min-h-0 flex-col rounded-[28px] border border-white/10 bg-slate-950/78 p-5 shadow-[0_24px_90px_rgba(2,6,23,0.6)] backdrop-blur-xl">
                <p className="text-[11px] uppercase tracking-[0.32em] text-slate-400">
                  Selected Model
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <span
                    className="inline-flex h-3.5 w-3.5 rounded-full border border-white/25"
                    style={{ backgroundColor: selectedFamily.accent }}
                  />
                  <h2 className="text-lg font-semibold text-white">{selectedFamily.label}</h2>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                      Original
                    </p>
                    <p className="mt-1 text-sm font-medium text-white">
                      {selectedFamily.currentVersion}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-100/70">
                      Changed To
                    </p>
                    <p className="mt-1 text-sm font-medium text-cyan-50">
                      {selectedFamily.nextGenVersion}
                    </p>
                  </div>
                </div>

                <p className="mt-4 text-sm leading-6 text-slate-300">{selectedFamily.pitch}</p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {REVIEW_LENSES.map((lens) => (
                    <span
                      key={lens}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-300"
                    >
                      {lens}
                    </span>
                  ))}
                </div>

                <div className="mt-5 flex-1 space-y-2 overflow-y-auto pr-1">
                  {selectedFamily.improvements.map((improvement) => (
                    <div
                      key={improvement}
                      className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3 text-sm leading-6 text-slate-200"
                    >
                      {improvement}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

interface PrototypeSceneProps {
  families: AssetFamily[];
  selectedAssetId: AssetKind;
  onSelectAsset: (assetId: AssetKind) => void;
}

const PrototypeScene: React.FC<PrototypeSceneProps> = ({
  families,
  selectedAssetId,
  onSelectAsset,
}) => {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const gridDepth = getGridDepth(families.length);
  const labelZ = -gridDepth / 2 + 12;

  return (
    <>
      <color attach="background" args={['#061018']} />
      <fog attach="fog" args={['#061018', 44, 105]} />

      <ambientLight intensity={0.75} />
      <hemisphereLight args={['#d8f3ff', '#12202d', 0.8]} />
      <directionalLight
        castShadow
        intensity={2.1}
        position={[24, 38, 26]}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0005}
      />
      <directionalLight intensity={0.7} position={[-28, 16, -22]} color="#67e8f9" />
      <pointLight intensity={18} distance={70} color="#fb923c" position={[0, 20, 0]} />

      <SceneFloor depth={gridDepth} />

      <Text
        position={[-36, 0.25, labelZ]}
        rotation={[-Math.PI / 2, 0, 0]}
        color="#7dd3fc"
        fontSize={2.4}
        letterSpacing={0.22}
        anchorX="left"
      >
        ORIGINAL
      </Text>
      <Text
        position={[26, 0.25, labelZ]}
        rotation={[-Math.PI / 2, 0, 0]}
        color="#f59e0b"
        fontSize={2.4}
        letterSpacing={0.22}
        anchorX="left"
      >
        CHANGED
      </Text>

      {families.map((family, index) => (
        <AssetCell
          key={family.id}
          family={family}
          position={getCellPosition(index, families.length)}
          selected={family.id === selectedAssetId}
          onSelect={() => onSelectAsset(family.id)}
        />
      ))}

      <PrototypeCameraController
        controlsRef={controlsRef}
        families={families}
        selectedAssetId={selectedAssetId}
      />

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enablePan
        enableDamping
        dampingFactor={0.08}
        minDistance={24}
        maxDistance={108}
        maxPolarAngle={Math.PI / 2.08}
        minPolarAngle={Math.PI / 5}
        target={[0, 3, 0]}
      />
    </>
  );
};

const SceneFloor: React.FC<{ depth: number }> = ({ depth }) => {
  return (
    <group position={[0, -0.25, 0]}>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[GRID_WIDTH, depth]} />
        <meshStandardMaterial color="#0b1722" roughness={0.92} metalness={0.08} />
      </mesh>

      <gridHelper args={[GRID_WIDTH, 34, '#1f4858', '#102838']} position={[0, 0.02, 0]} />

      {[...Array.from({ length: GRID_COLUMNS + 1 }).keys()].map((index) => {
        const x = (index - GRID_COLUMNS / 2) * GRID_SPACING_X;
        return (
          <mesh key={`lane-x-${x}`} position={[x, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.26, depth]} />
            <meshBasicMaterial color="#103346" transparent opacity={0.55} />
          </mesh>
        );
      })}

      {[-GRID_SPACING_Z / 2, GRID_SPACING_Z / 2].map((z) => (
        <mesh key={`lane-z-${z}`} position={[0, 0.031, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[GRID_WIDTH, 0.26]} />
          <meshBasicMaterial color="#102d3b" transparent opacity={0.55} />
        </mesh>
      ))}

      <mesh position={[LEFT_MODEL_OFFSET, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[40, depth]} />
        <meshBasicMaterial color="#082438" transparent opacity={0.12} />
      </mesh>

      <mesh position={[RIGHT_MODEL_OFFSET, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[40, depth]} />
        <meshBasicMaterial color="#3c1f05" transparent opacity={0.12} />
      </mesh>
    </group>
  );
};

interface AssetCellProps {
  family: AssetFamily;
  position: [number, number, number];
  selected: boolean;
  onSelect: () => void;
}

const AssetCell: React.FC<AssetCellProps> = ({ family, position, selected, onSelect }) => {
  return (
    <group
      position={position}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[15.6, 15.6]} />
        <meshBasicMaterial color="#091823" transparent opacity={0.55} />
      </mesh>

      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[6.1, 7.35, 48]} />
        <meshBasicMaterial
          color={family.accent}
          transparent
          opacity={selected ? 0.42 : 0.12}
          toneMapped={false}
        />
      </mesh>

      <Text
        position={[0, 7.35, 0]}
        color="#e2e8f0"
        fontSize={0.88}
        maxWidth={11}
        textAlign="center"
        anchorX="center"
      >
        {family.label}
      </Text>

      <Text position={[0, 6.45, 0]} color="#64748b" fontSize={0.34} anchorX="center">
        {family.category}
      </Text>

      <Text position={[LEFT_MODEL_OFFSET, 5.8, 0]} color="#7dd3fc" fontSize={0.34} anchorX="center">
        ORIGINAL
      </Text>
      <Text
        position={[RIGHT_MODEL_OFFSET, 5.8, 0]}
        color="#fdba74"
        fontSize={0.34}
        anchorX="center"
      >
        CHANGED
      </Text>

      <DisplayPedestal
        family={family}
        variant="current"
        position={[LEFT_MODEL_OFFSET, 0, 0]}
        selected={selected}
      />

      <DisplayPedestal
        family={family}
        variant="prototype"
        position={[RIGHT_MODEL_OFFSET, 0, 0]}
        selected={selected}
      />
    </group>
  );
};

interface PrototypeCameraControllerProps {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  families: AssetFamily[];
  selectedAssetId: AssetKind;
}

const PrototypeCameraController: React.FC<PrototypeCameraControllerProps> = ({
  controlsRef,
  families,
  selectedAssetId,
}) => {
  const { camera } = useThree();
  const desiredTarget = useRef(new THREE.Vector3(0, CAMERA_FOCUS_HEIGHT, 0));
  const keyStateRef = useRef({
    KeyW: false,
    KeyA: false,
    KeyS: false,
    KeyD: false,
    ShiftLeft: false,
    ShiftRight: false,
  });
  const targetDelta = useMemo(() => new THREE.Vector3(), []);
  const moveVector = useMemo(() => new THREE.Vector3(), []);
  const forwardVector = useMemo(() => new THREE.Vector3(), []);
  const rightVector = useMemo(() => new THREE.Vector3(), []);
  const upVector = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  useEffect(() => {
    const selectedIndex = families.findIndex((family) => family.id === selectedAssetId);
    const [x, , z] = getCellPosition(Math.max(selectedIndex, 0), families.length);
    desiredTarget.current.set(x, CAMERA_FOCUS_HEIGHT, z);
  }, [families, selectedAssetId]);

  useEffect(() => {
    const updateKeyState = (event: KeyboardEvent, pressed: boolean) => {
      if (!(event.code in keyStateRef.current)) return;

      const activeElement = document.activeElement;
      if (
        pressed &&
        activeElement instanceof HTMLElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeElement.tagName)
      ) {
        return;
      }

      keyStateRef.current[event.code as keyof typeof keyStateRef.current] = pressed;
    };

    const handleKeyDown = (event: KeyboardEvent) => updateKeyState(event, true);
    const handleKeyUp = (event: KeyboardEvent) => updateKeyState(event, false);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;

    const focusEase = 1 - Math.exp(-delta * 5.5);
    targetDelta.copy(desiredTarget.current).sub(controls.target);
    if (targetDelta.lengthSq() > 0.0001) {
      targetDelta.multiplyScalar(focusEase);
      controls.target.add(targetDelta);
      camera.position.add(targetDelta);
    }

    const { KeyW, KeyA, KeyS, KeyD, ShiftLeft, ShiftRight } = keyStateRef.current;
    const moveX = (KeyD ? 1 : 0) - (KeyA ? 1 : 0);
    const moveZ = (KeyS ? 1 : 0) - (KeyW ? 1 : 0);

    if (moveX !== 0 || moveZ !== 0) {
      camera.getWorldDirection(forwardVector);
      forwardVector.y = 0;
      if (forwardVector.lengthSq() < 0.0001) {
        forwardVector.set(0, 0, -1);
      } else {
        forwardVector.normalize();
      }

      rightVector.crossVectors(forwardVector, upVector).normalize();
      moveVector
        .copy(forwardVector)
        .multiplyScalar(-moveZ)
        .addScaledVector(rightVector, moveX)
        .normalize()
        .multiplyScalar(delta * CAMERA_MOVE_SPEED * (ShiftLeft || ShiftRight ? 1.8 : 1));

      camera.position.add(moveVector);
    }

    controls.update();
  });

  return null;
};

interface DisplayPedestalProps {
  family: AssetFamily;
  variant: AssetVariant;
  position: [number, number, number];
  selected: boolean;
}

const DisplayPedestal: React.FC<DisplayPedestalProps> = ({
  family,
  variant,
  position,
  selected,
}) => {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow position={[0, 0.22, 0]}>
        <cylinderGeometry args={[2.15, 2.45, 0.42, 40]} />
        <meshStandardMaterial
          color={variant === 'prototype' ? '#131c26' : '#0d1822'}
          metalness={0.28}
          roughness={0.58}
        />
      </mesh>

      <mesh position={[0, 0.46, 0]}>
        <torusGeometry args={[2.05, 0.07, 18, 48]} />
        <meshStandardMaterial
          color={variant === 'prototype' ? family.accent : '#38bdf8'}
          emissive={variant === 'prototype' ? family.accent : '#38bdf8'}
          emissiveIntensity={selected ? 1.2 : 0.45}
          metalness={0.4}
          roughness={0.18}
          toneMapped={false}
        />
      </mesh>

      <group position={[0, 0.5, 0]}>
        <AssetModel kind={family.id} variant={variant} detail="hero" scale={family.heroScale} />
      </group>
    </group>
  );
};

interface AssetModelProps {
  kind: AssetKind;
  variant: AssetVariant;
  detail: DetailLevel;
  scale: number;
}

const ActualWindmillPreview: React.FC<{ scale: number }> = ({ scale }) => {
  const bladesRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (!bladesRef.current) return;
    bladesRef.current.rotation.z += delta * 0.85;
  });

  return (
    <group scale={0.48 * scale}>
      <ActualWindmill position={[0, 0, 0]} bladesRef={bladesRef} />
    </group>
  );
};

const ActualFreightTruckPreview: React.FC<{ scale: number }> = ({ scale }) => {
  const truckBayModule = useTruckBayPreviewModule();
  const wheelRotation = useRef(0);
  const throttle = useRef(0);
  const trailerAngle = useRef(0);

  if (!truckBayModule) return null;

  const { RealisticTruck } = truckBayModule;

  return (
    <group scale={0.24 * scale} position={[0, 0.02, 0]} rotation={[0, Math.PI / 2, 0]}>
      <RealisticTruck
        color="#2563eb"
        company="MillOS Freight"
        plateNumber="PROTO-1"
        wheelRotation={wheelRotation}
        throttle={throttle}
        trailerAngle={trailerAngle}
        getTruckState={() => STATIC_TRUCK_STATE}
      />
    </group>
  );
};

const ActualForkliftPreview: React.FC<{ scale: number }> = ({ scale }) => {
  const forkHeightRef = useRef(0);

  return (
    <group scale={0.1 * scale} position={[0, 0.06, 0]}>
      <ForkliftModel hasCargo isMoving={false} forkHeightRef={forkHeightRef} speedMultiplier={1} />
    </group>
  );
};

const ActualTruckBayPreview: React.FC<{ scale: number }> = ({ scale }) => {
  const truckBayModule = useTruckBayPreviewModule();

  if (!truckBayModule) return null;

  const { DockShelter, PalletStaging, RollUpDoor } = truckBayModule;

  return (
    <group scale={0.26 * scale} position={[0, 0.02, 0]}>
      <mesh receiveShadow position={[0, 0.04, 4]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[28, 18]} />
        <meshStandardMaterial color="#2b3644" roughness={0.92} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 3.2, -0.4]}>
        <boxGeometry args={[12, 6.4, 0.6]} />
        <meshStandardMaterial color="#4b5563" roughness={0.78} metalness={0.16} />
      </mesh>
      <RollUpDoor position={[0, 0, 0]} isOpen={false} />
      <DockShelter position={[0, 0, 0]} isCompressed={false} />
      <PalletStaging position={[9.5, 0, 4.6]} />
    </group>
  );
};

const FactoryShellCurrentPreview: React.FC<{ scale: number }> = ({ scale }) => {
  return (
    <group scale={0.42 * scale} position={[0, 0.04, 0]}>
      <mesh receiveShadow position={[0, 0.04, 0]}>
        <boxGeometry args={[12.4, 0.12, 8.8]} />
        <meshStandardMaterial color="#334155" roughness={0.9} metalness={0.08} />
      </mesh>

      <mesh castShadow receiveShadow position={[0.2, 2.45, -0.2]}>
        <boxGeometry args={[6.4, 4.9, 3.8]} />
        <meshStandardMaterial color="#64748b" roughness={0.7} metalness={0.12} />
      </mesh>
      <mesh castShadow position={[0.2, 5.05, -0.2]}>
        <boxGeometry args={[6.8, 0.22, 4.1]} />
        <meshStandardMaterial color="#475569" roughness={0.42} metalness={0.18} />
      </mesh>

      <mesh castShadow receiveShadow position={[-4.1, 1.9, 0.3]}>
        <boxGeometry args={[2.8, 3.8, 3.2]} />
        <meshStandardMaterial color="#7b8794" roughness={0.72} metalness={0.1} />
      </mesh>
      <mesh castShadow position={[-4.1, 3.95, 0.3]}>
        <boxGeometry args={[3.1, 0.18, 3.5]} />
        <meshStandardMaterial color="#56616d" roughness={0.42} metalness={0.18} />
      </mesh>

      <mesh castShadow receiveShadow position={[4.15, 1.55, 1.0]}>
        <boxGeometry args={[2.9, 3.1, 2.0]} />
        <meshStandardMaterial color="#56616d" roughness={0.68} metalness={0.12} />
      </mesh>
      <mesh castShadow position={[4.15, 3.25, 1.0]}>
        <boxGeometry args={[3.2, 0.18, 2.2]} />
        <meshStandardMaterial color="#374151" roughness={0.42} metalness={0.18} />
      </mesh>

      <mesh castShadow receiveShadow position={[3.0, 2.8, -1.35]}>
        <boxGeometry args={[1.45, 5.6, 1.45]} />
        <meshStandardMaterial color="#4b5563" roughness={0.62} metalness={0.14} />
      </mesh>

      {[-1.6, 0, 1.6].map((x) => (
        <mesh key={`factory-current-band-${x}`} position={[x, 2.6, 1.72]}>
          <boxGeometry args={[0.92, 1.48, 0.06]} />
          <meshStandardMaterial color="#0f172a" roughness={0.24} metalness={0.06} />
        </mesh>
      ))}

      {[-4.8, -3.9].map((x) => (
        <mesh key={`factory-current-door-${x}`} position={[x, 1.1, 1.92]}>
          <boxGeometry args={[0.72, 2.0, 0.08]} />
          <meshStandardMaterial color="#1f2937" roughness={0.32} metalness={0.1} />
        </mesh>
      ))}

      {[-0.9, 0.9].map((x) => (
        <mesh key={`factory-current-dock-${x}`} position={[x, 0.95, 2.02]}>
          <boxGeometry args={[1.1, 1.9, 0.08]} />
          <meshStandardMaterial color="#1e293b" roughness={0.28} metalness={0.08} />
        </mesh>
      ))}
    </group>
  );
};

const FactoryShellPrototypePreview: React.FC<{ scale: number }> = ({ scale }) => {
  return (
    <group scale={0.42 * scale} position={[0, 0.04, 0]}>
      <mesh receiveShadow position={[0, 0.04, 0]}>
        <boxGeometry args={[12.8, 0.12, 9.2]} />
        <meshStandardMaterial color="#334155" roughness={0.9} metalness={0.08} />
      </mesh>

      <mesh castShadow receiveShadow position={[0.5, 2.55, -0.1]}>
        <boxGeometry args={[5.8, 5.1, 3.6]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.58} metalness={0.08} />
      </mesh>
      <mesh castShadow position={[0.45, 4.8, -0.6]}>
        <boxGeometry args={[2.2, 1.4, 1.9]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.4} metalness={0.1} />
      </mesh>
      <mesh castShadow position={[0.5, 5.2, -0.1]}>
        <boxGeometry args={[6.2, 0.22, 4.0]} />
        <meshStandardMaterial color="#475569" roughness={0.34} metalness={0.16} />
      </mesh>

      <mesh castShadow receiveShadow position={[-4.3, 2.05, 0.25]}>
        <boxGeometry args={[3.0, 4.1, 3.0]} />
        <meshStandardMaterial color="#dbeafe" roughness={0.6} metalness={0.08} />
      </mesh>
      <mesh castShadow position={[-4.3, 4.25, 0.25]}>
        <boxGeometry args={[3.3, 0.18, 3.3]} />
        <meshStandardMaterial color="#64748b" roughness={0.34} metalness={0.16} />
      </mesh>

      <mesh castShadow receiveShadow position={[4.35, 1.65, 0.95]}>
        <boxGeometry args={[3.1, 3.3, 2.1]} />
        <meshStandardMaterial color="#475569" roughness={0.56} metalness={0.1} />
      </mesh>
      <mesh castShadow position={[4.35, 3.45, 0.95]}>
        <boxGeometry args={[3.4, 0.18, 2.3]} />
        <meshStandardMaterial color="#334155" roughness={0.34} metalness={0.16} />
      </mesh>

      <mesh castShadow receiveShadow position={[3.0, 3.1, -1.4]}>
        <boxGeometry args={[1.2, 6.2, 1.3]} />
        <meshStandardMaterial color="#64748b" roughness={0.54} metalness={0.12} />
      </mesh>
      <mesh castShadow position={[2.95, 6.35, -1.4]}>
        <boxGeometry args={[1.45, 0.2, 1.55]} />
        <meshStandardMaterial color="#475569" roughness={0.32} metalness={0.16} />
      </mesh>

      <PrototypeCatwalk position={[-1.95, 4.38, -0.2]} size={[2.55, 0.08, 0.34]} />
      <PrototypeCatwalk position={[2.0, 3.6, -1.4]} size={[1.8, 0.08, 0.32]} />
      <PrototypeLadder
        position={[-3.2, 1.2, -0.2]}
        height={3.25}
        rotation={[0, Math.PI / 2, 0]}
        cage
      />
      <PrototypeLadder position={[2.35, 1.0, -1.4]} height={2.7} rotation={[0, Math.PI / 2, 0]} />

      {[-1.75, -0.55, 0.65, 1.85].map((x) => (
        <mesh key={`factory-proto-band-${x}`} position={[x, 2.75, 1.68]}>
          <boxGeometry args={[0.76, 1.7, 0.06]} />
          <meshStandardMaterial color="#bae6fd" roughness={0.08} metalness={0.08} />
        </mesh>
      ))}

      {[-0.95, 0.95].map((x) => (
        <mesh key={`factory-proto-dock-${x}`} position={[x, 0.95, 1.94]}>
          <boxGeometry args={[1.0, 1.9, 0.08]} />
          <meshStandardMaterial color="#0f172a" roughness={0.24} metalness={0.08} />
        </mesh>
      ))}

      {[-4.85, -3.8].map((x) => (
        <mesh key={`factory-proto-entry-${x}`} position={[x, 1.15, 1.8]}>
          <boxGeometry args={[0.82, 2.1, 0.08]} />
          <meshStandardMaterial color="#1f2937" roughness={0.28} metalness={0.08} />
        </mesh>
      ))}

      {[-1.0, 1.15].map((x) => (
        <mesh key={`factory-roof-unit-${x}`} castShadow position={[x, 5.45, -0.1]}>
          <boxGeometry args={[0.9, 0.32, 0.7]} />
          <meshStandardMaterial color="#475569" roughness={0.3} metalness={0.16} />
        </mesh>
      ))}

      <mesh castShadow receiveShadow position={[0.9, 1.12, 2.24]}>
        <boxGeometry args={[2.4, 0.26, 0.92]} />
        <meshStandardMaterial color="#475569" roughness={0.34} metalness={0.16} />
      </mesh>
      <mesh castShadow position={[-2.6, 4.92, -0.18]}>
        <boxGeometry args={[1.1, 0.26, 0.9]} />
        <meshStandardMaterial color="#64748b" roughness={0.28} metalness={0.14} />
      </mesh>
      <mesh castShadow position={[3.86, 4.12, 0.94]}>
        <boxGeometry args={[0.34, 1.24, 0.34]} />
        <meshStandardMaterial color="#334155" roughness={0.32} metalness={0.2} />
      </mesh>
    </group>
  );
};

const ActualCurrentAsset: React.FC<{ kind: AssetKind; scale: number }> = ({ kind, scale }) => {
  switch (kind) {
    case 'silo':
      return (
        <group scale={0.24 * scale} position={[0, 0.08, 0]}>
          <SiloModel />
        </group>
      );
    case 'rollerMill':
      return (
        <group scale={0.72 * scale}>
          <InstancedRollerMills
            machines={CURRENT_ROLLER_MILL_MACHINES}
            onSelect={NOOP_SELECT_MACHINE}
          />
        </group>
      );
    case 'plansifter':
      return (
        <group scale={0.38 * scale}>
          <InstancedPlansifters
            machines={CURRENT_PLANSIFTER_MACHINES}
            onSelect={NOOP_SELECT_MACHINE}
          />
        </group>
      );
    case 'packer':
      return (
        <group scale={0.5 * scale}>
          <InstancedPackers machines={CURRENT_PACKER_MACHINES} onSelect={NOOP_SELECT_MACHINE} />
        </group>
      );
    case 'conveyor':
      return (
        <group scale={0.34 * scale}>
          <ActualConveyorBelt
            position={[0, 0, 0]}
            length={12}
            productionSpeed={1}
            enableAudio={false}
          />
        </group>
      );
    case 'spouting':
      return (
        <group scale={0.32 * scale}>
          <SpoutingSystem machines={CURRENT_SPOUTING_MACHINES} enableAudio={false} />
        </group>
      );
    case 'worker':
      return (
        <group scale={0.86 * scale}>
          <WorkerModel
            uniformColor="#2563eb"
            skinTone="#f5d0c5"
            hatColor="#facc15"
            hasVest
            pantsColor="#1e293b"
            walkCycle={0}
            isIdle
          />
        </group>
      );
    case 'forklift':
      return <ActualForkliftPreview scale={scale} />;
    case 'palletCargo':
      return (
        <group scale={1.1 * scale}>
          <StackedPallets position={[0, 0, 0]} count={3} />
        </group>
      );
    case 'utilityTower':
      return (
        <group scale={0.5 * scale}>
          <ActualStorageTank position={[0, 0, 0]} length={6.5} radius={1.7} />
          <ActualPropaneTank position={[-3.4, 0, 0.9]} height={3.2} radius={0.9} />
          <ActualPropaneTank position={[3.2, 0, -0.8]} height={3.2} radius={0.9} />
          <group scale={0.07}>
            <UtilityConduits floorWidth={60} floorDepth={60} />
          </group>
        </group>
      );
    case 'factoryShell':
      return <FactoryShellCurrentPreview scale={scale} />;
    case 'grainElevator':
      return (
        <group scale={0.11 * scale}>
          <ActualGrainElevator position={[0, 0, 0]} />
        </group>
      );
    case 'conveyorBridge':
      return (
        <group scale={0.64 * scale}>
          <ActualConveyorBridge start={[-5, 1.3, 0]} end={[5, 3.4, 0]} />
        </group>
      );
    case 'truckBay':
      return <ActualTruckBayPreview scale={scale} />;
    case 'freightTruck':
      return <ActualFreightTruckPreview scale={scale} />;
    case 'supportOffice':
      return (
        <group scale={0.48 * scale}>
          <ActualSmallOffice position={[0, 0, 0]} />
        </group>
      );
    case 'gasStation':
      return (
        <group scale={0.12 * scale}>
          <GasStation position={[0, 0, 0]} />
        </group>
      );
    case 'farmBarn':
      return (
        <group scale={0.42 * scale}>
          <ActualBarn position={[0, 0, 0]} />
        </group>
      );
    case 'windmill':
      return <ActualWindmillPreview scale={scale} />;
    case 'villageHouse':
      return (
        <group scale={0.48 * scale}>
          <ActualCottage position={[0, 0, 0]} />
        </group>
      );
    case 'townHall':
      return (
        <group scale={0.18 * scale}>
          <ActualTownHall position={[0, 0, 0]} />
        </group>
      );
    case 'canalBoat':
      return (
        <group scale={0.28 * scale}>
          <ActualCanalBoat position={[0, 0, 0]} />
        </group>
      );
  }
};

const PrototypeLadder: React.FC<{
  position: [number, number, number];
  height: number;
  rotation?: [number, number, number];
  cage?: boolean;
}> = ({ position, height, rotation = [0, 0, 0], cage = false }) => {
  const rungCount = Math.max(4, Math.floor(height / 0.34));
  const rungSpacing = height / rungCount;

  return (
    <group position={position} rotation={rotation}>
      {[-0.12, 0.12].map((x) => (
        <mesh key={`ladder-rail-${x}`} castShadow position={[x, height / 2, 0]}>
          <boxGeometry args={[0.04, height, 0.04]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.62} roughness={0.24} />
        </mesh>
      ))}

      {Array.from({ length: rungCount }, (_, index) => (
        <mesh
          key={`ladder-rung-${index}`}
          castShadow
          position={[0, rungSpacing * (index + 0.5), 0.02]}
        >
          <boxGeometry args={[0.3, 0.04, 0.04]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.56} roughness={0.28} />
        </mesh>
      ))}

      {cage &&
        Array.from({ length: Math.max(3, Math.floor(height / 0.7)) }, (_, index) => (
          <mesh
            key={`ladder-cage-${index}`}
            position={[0, 0.7 + index * 0.66, -0.1]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <torusGeometry args={[0.26, 0.016, 8, 18]} />
            <meshStandardMaterial color="#64748b" metalness={0.66} roughness={0.22} />
          </mesh>
        ))}
    </group>
  );
};

const PrototypeCatwalk: React.FC<{
  position: [number, number, number];
  size: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, size, rotation = [0, 0, 0] }) => {
  const [width, height, depth] = size;
  const cornerX = width / 2 - 0.12;
  const cornerZ = depth / 2 - 0.08;

  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color="#334155" metalness={0.58} roughness={0.26} />
      </mesh>

      {[-cornerZ, cornerZ].map((z) => (
        <mesh key={`catwalk-rail-${z}`} castShadow position={[0, 0.34, z]}>
          <boxGeometry args={[width, 0.05, 0.05]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.38} roughness={0.26} />
        </mesh>
      ))}

      {[-cornerX, cornerX].map((x) =>
        [-cornerZ, cornerZ].map((z) => (
          <mesh key={`catwalk-post-${x}-${z}`} castShadow position={[x, 0.18, z]}>
            <boxGeometry args={[0.04, 0.32, 0.04]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.46} roughness={0.24} />
          </mesh>
        ))
      )}
    </group>
  );
};

const ActualPrototypeAsset: React.FC<{ kind: AssetKind; scale: number }> = ({ kind, scale }) => {
  switch (kind) {
    case 'silo':
      return (
        <group>
          <ActualCurrentAsset kind={kind} scale={scale} />
          <mesh castShadow receiveShadow position={[0, -0.04, 0]}>
            <cylinderGeometry args={[1.74, 1.96, 0.22, 24]} />
            <meshStandardMaterial color="#334155" metalness={0.42} roughness={0.38} />
          </mesh>
          <mesh castShadow receiveShadow position={[0, 0.34, 0]}>
            <boxGeometry args={[1.9, 0.14, 1.9]} />
            <meshStandardMaterial color="#475569" metalness={0.38} roughness={0.34} />
          </mesh>
          <mesh castShadow position={[0, 3.98, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[1.48, 0.05, 12, 28]} />
            <meshStandardMaterial color="#64748b" metalness={0.72} roughness={0.18} />
          </mesh>
          <PrototypeCatwalk position={[0, 4.08, 0]} size={[2.3, 0.08, 0.56]} />
          <PrototypeLadder
            position={[1.28, 1.04, 0]}
            height={3.38}
            rotation={[0, Math.PI / 2, 0]}
            cage
          />
          <mesh castShadow position={[-0.96, 2.18, 1.02]} rotation={[0, Math.PI / 2, 0]}>
            <cylinderGeometry args={[0.1, 0.1, 2.34, 12]} />
            <meshStandardMaterial color="#475569" metalness={0.68} roughness={0.24} />
          </mesh>
          <mesh castShadow position={[0.98, 5.1, 0]}>
            <boxGeometry args={[0.22, 0.68, 0.22]} />
            <meshStandardMaterial color="#334155" roughness={0.34} metalness={0.24} />
          </mesh>
          {[
            [-0.9, 0.66, 0.9],
            [0.9, 0.66, 0.9],
            [-0.9, 0.66, -0.9],
            [0.9, 0.66, -0.9],
          ].map(([x, y, z]) => (
            <mesh key={`silo-leg-${x}-${z}`} castShadow position={[x, y, z]}>
              <boxGeometry args={[0.12, 1.08, 0.12]} />
              <meshStandardMaterial color="#475569" roughness={0.32} metalness={0.28} />
            </mesh>
          ))}
          <mesh castShadow position={[0, 0.58, 1.24]}>
            <boxGeometry args={[1.24, 0.18, 0.3]} />
            <meshStandardMaterial color="#1e293b" roughness={0.38} metalness={0.2} />
          </mesh>
        </group>
      );
    case 'rollerMill':
      return (
        <group>
          <ActualCurrentAsset kind={kind} scale={scale} />
          <mesh castShadow receiveShadow position={[0, 0.18, 0]}>
            <boxGeometry args={[3.8, 0.26, 2.36]} />
            <meshStandardMaterial color="#1f2937" metalness={0.48} roughness={0.3} />
          </mesh>
          <mesh castShadow position={[1.98, 1.2, -0.02]}>
            <boxGeometry args={[0.94, 1.14, 1.3]} />
            <meshStandardMaterial color="#111827" roughness={0.34} metalness={0.34} />
          </mesh>
          <mesh castShadow position={[0.1, 2.82, -0.22]}>
            <boxGeometry args={[1.86, 0.8, 1.14]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.38} metalness={0.22} />
          </mesh>
          <mesh castShadow position={[-1.28, 2.56, -0.18]} rotation={[0.48, 0, 0]}>
            <cylinderGeometry args={[0.18, 0.24, 1.5, 12]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.46} roughness={0.3} />
          </mesh>
          <mesh castShadow position={[1.08, 1.46, 1.02]}>
            <boxGeometry args={[0.62, 1.04, 0.16]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.22} metalness={0.08} />
          </mesh>
          <PrototypeCatwalk position={[-0.1, 3.16, -0.9]} size={[2.5, 0.08, 0.34]} />
          <mesh castShadow position={[-1.9, 1.08, 0.18]}>
            <boxGeometry args={[0.62, 1.32, 1.46]} />
            <meshStandardMaterial color="#334155" roughness={0.36} metalness={0.24} />
          </mesh>
          <mesh castShadow position={[0.2, 1.0, -1.02]}>
            <boxGeometry args={[2.18, 0.22, 0.42]} />
            <meshStandardMaterial color="#475569" roughness={0.28} metalness={0.26} />
          </mesh>
          {[-1.02, -0.3, 0.42].map((x) => (
            <mesh key={`mill-access-${x}`} position={[x, 1.28, 1.02]}>
              <boxGeometry args={[0.42, 0.78, 0.08]} />
              <meshStandardMaterial color="#0f172a" roughness={0.3} metalness={0.08} />
            </mesh>
          ))}
        </group>
      );
    case 'plansifter':
      return (
        <group>
          <ActualCurrentAsset kind={kind} scale={scale} />
          <PrototypeCatwalk position={[0, 4.54, 1.0]} size={[3.7, 0.08, 0.44]} />
          <PrototypeLadder position={[-1.88, 1.28, 0.98]} height={3.06} cage />
          <mesh castShadow position={[2.0, 2.28, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.28, 0.28, 1.18, 16]} />
            <meshStandardMaterial color="#0f172a" metalness={0.7} roughness={0.18} />
          </mesh>
          <mesh castShadow position={[-1.88, 3.2, 0.42]} rotation={[0.42, 0, 0]}>
            <cylinderGeometry args={[0.12, 0.14, 1.76, 12]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.5} roughness={0.28} />
          </mesh>
          <mesh castShadow position={[0, 1.12, 1.0]}>
            <boxGeometry args={[3.28, 0.18, 0.32]} />
            <meshStandardMaterial color="#475569" metalness={0.54} roughness={0.24} />
          </mesh>
          <mesh castShadow position={[0, 2.28, 0.98]}>
            <boxGeometry args={[1.24, 0.78, 0.08]} />
            <meshStandardMaterial color="#334155" roughness={0.34} metalness={0.14} />
          </mesh>
          {[-1.18, 1.18].map((x) => (
            <mesh key={`plansifter-hopper-${x}`} castShadow position={[x, 1.36, -0.72]}>
              <boxGeometry args={[0.7, 0.88, 0.58]} />
              <meshStandardMaterial color="#1e293b" roughness={0.38} metalness={0.18} />
            </mesh>
          ))}
          {[-1.26, 1.26].map((x) => (
            <mesh key={`plansifter-spring-${x}`} castShadow position={[x, 3.72, -0.14]}>
              <cylinderGeometry args={[0.08, 0.08, 0.72, 12]} />
              <meshStandardMaterial color="#64748b" roughness={0.26} metalness={0.34} />
            </mesh>
          ))}
        </group>
      );
    case 'packer':
      return (
        <group>
          <ActualCurrentAsset kind={kind} scale={scale} />
          <mesh castShadow position={[0.06, 2.32, 0]}>
            <boxGeometry args={[2.42, 3.12, 1.82]} />
            <meshStandardMaterial color="#111827" roughness={0.36} metalness={0.22} />
          </mesh>
          <mesh castShadow position={[0, 2.26, 0.98]}>
            <boxGeometry args={[1.24, 1.7, 0.08]} />
            <meshStandardMaterial color="#dbeafe" roughness={0.12} metalness={0.08} />
          </mesh>
          <mesh castShadow position={[-1.62, 1.94, 0.1]}>
            <boxGeometry args={[0.26, 2.08, 0.56]} />
            <meshStandardMaterial color="#0f172a" roughness={0.36} />
          </mesh>
          <mesh castShadow position={[-1.48, 2.72, 0.22]}>
            <boxGeometry args={[0.18, 0.5, 0.34]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.16} metalness={0.1} />
          </mesh>
          <mesh castShadow position={[0, 0.88, 1.66]}>
            <boxGeometry args={[3.6, 0.18, 1.12]} />
            <meshStandardMaterial color="#1f2937" metalness={0.52} roughness={0.2} />
          </mesh>
          {[-1.22, -0.4, 0.4, 1.22].map((x) => (
            <mesh key={`packer-guard-${x}`} castShadow position={[x, 1.22, 1.66]}>
              <boxGeometry args={[0.06, 0.72, 0.06]} />
              <meshStandardMaterial color="#94a3b8" roughness={0.22} metalness={0.3} />
            </mesh>
          ))}
          <mesh castShadow position={[0.94, 2.66, -0.72]}>
            <boxGeometry args={[0.62, 1.2, 0.72]} />
            <meshStandardMaterial color="#475569" roughness={0.3} metalness={0.24} />
          </mesh>
          <mesh castShadow position={[0, 3.84, -0.1]}>
            <boxGeometry args={[1.56, 0.24, 1.06]} />
            <meshStandardMaterial color="#334155" roughness={0.28} metalness={0.18} />
          </mesh>
          <mesh castShadow position={[1.56, 0.98, 1.66]}>
            <boxGeometry args={[0.44, 0.62, 0.56]} />
            <meshStandardMaterial color="#fef3c7" roughness={0.72} />
          </mesh>
        </group>
      );
    case 'conveyor':
      return (
        <group>
          <ActualCurrentAsset kind={kind} scale={scale} />
          {[-0.66, 0.66].map((z) => (
            <mesh key={`conveyor-rail-${z}`} castShadow position={[0, 1.1, z]}>
              <boxGeometry args={[4.92, 0.14, 0.06]} />
              <meshStandardMaterial color="#475569" metalness={0.42} roughness={0.3} />
            </mesh>
          ))}
          <mesh castShadow position={[-2.26, 0.9, 0]}>
            <boxGeometry args={[0.58, 0.46, 1.3]} />
            <meshStandardMaterial color="#111827" roughness={0.34} metalness={0.28} />
          </mesh>
          <mesh castShadow position={[2.22, 0.88, 0]}>
            <boxGeometry args={[0.5, 0.38, 1.22]} />
            <meshStandardMaterial color="#334155" roughness={0.3} metalness={0.28} />
          </mesh>
          {[0, 1].map((index) => (
            <group key={`conveyor-sensor-${index}`} position={[-0.64 + index * 1.56, 1.12, 0]}>
              <mesh castShadow position={[-0.22, 0.26, 0]}>
                <boxGeometry args={[0.05, 0.52, 0.05]} />
                <meshStandardMaterial color="#94a3b8" roughness={0.22} metalness={0.26} />
              </mesh>
              <mesh castShadow position={[0.22, 0.26, 0]}>
                <boxGeometry args={[0.05, 0.52, 0.05]} />
                <meshStandardMaterial color="#94a3b8" roughness={0.22} metalness={0.26} />
              </mesh>
              <mesh castShadow position={[0, 0.52, 0]}>
                <boxGeometry args={[0.5, 0.05, 0.05]} />
                <meshStandardMaterial color="#64748b" roughness={0.22} metalness={0.28} />
              </mesh>
            </group>
          ))}
          {[-1.58, 0, 1.58].map((x) => (
            <group key={`conveyor-bent-${x}`} position={[x, 0.44, 0]}>
              {[-0.42, 0.42].map((z) => (
                <mesh key={`conveyor-leg-${x}-${z}`} castShadow position={[0, 0.48, z]}>
                  <boxGeometry args={[0.08, 0.96, 0.08]} />
                  <meshStandardMaterial color="#334155" roughness={0.28} metalness={0.24} />
                </mesh>
              ))}
              <mesh castShadow position={[0, 0.98, 0]}>
                <boxGeometry args={[1.12, 0.08, 0.92]} />
                <meshStandardMaterial color="#475569" roughness={0.26} metalness={0.26} />
              </mesh>
            </group>
          ))}
          {[0, 1, 2].map((index) => (
            <mesh
              key={`conveyor-product-${index}`}
              castShadow
              position={[-1.36 + index * 1.32, 1.02, 0]}
            >
              <boxGeometry args={[0.62, 0.34, 0.46]} />
              <meshStandardMaterial color={index === 1 ? '#f8fafc' : '#fef3c7'} roughness={0.76} />
            </mesh>
          ))}
        </group>
      );
    case 'spouting':
      return (
        <group>
          <ActualCurrentAsset kind={kind} scale={scale} />
          <mesh castShadow position={[0.04, 3.64, 0]}>
            <cylinderGeometry args={[0.7, 0.82, 1.96, 18]} />
            <meshStandardMaterial color="#0f172a" roughness={0.48} metalness={0.22} />
          </mesh>
          <mesh castShadow position={[0.04, 2.44, 0]}>
            <coneGeometry args={[0.7, 1.2, 18]} />
            <meshStandardMaterial color="#334155" roughness={0.42} metalness={0.28} />
          </mesh>
          <mesh castShadow position={[1.12, 5.1, 0]} rotation={[0, 0, -0.64]}>
            <cylinderGeometry args={[0.12, 0.12, 2.18, 12]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.72} roughness={0.16} />
          </mesh>
          <mesh castShadow position={[-1.16, 4.54, 0]} rotation={[0, 0, 0.72]}>
            <cylinderGeometry args={[0.1, 0.1, 1.76, 12]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.68} roughness={0.18} />
          </mesh>
          {[-1.4, 1.36].map((x) => (
            <mesh key={`spout-valve-${x}`} castShadow position={[x, 4.84, 0]}>
              <boxGeometry args={[0.38, 0.18, 0.38]} />
              <meshStandardMaterial color="#475569" roughness={0.32} metalness={0.18} />
            </mesh>
          ))}
          <PrototypeLadder
            position={[-0.6, 3.2, -0.52]}
            height={2.08}
            rotation={[0, Math.PI / 2, 0]}
          />
          {[-0.56, 0.56].map((x) => (
            <mesh key={`spout-leg-${x}`} castShadow position={[x, 1.48, -0.42]}>
              <boxGeometry args={[0.08, 1.3, 0.08]} />
              <meshStandardMaterial color="#334155" roughness={0.28} metalness={0.24} />
            </mesh>
          ))}
        </group>
      );
    case 'worker':
      return (
        <group>
          <ActualCurrentAsset kind={kind} scale={scale} />
          <mesh castShadow position={[0, 1.24, 0.18]}>
            <boxGeometry args={[0.58, 0.6, 0.1]} />
            <meshStandardMaterial color="#fb923c" roughness={0.48} />
          </mesh>
          <mesh castShadow position={[0.44, 1.04, 0.14]} rotation={[0, 0, -0.22]}>
            <boxGeometry args={[0.24, 0.16, 0.1]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.26} metalness={0.08} />
          </mesh>
          <mesh castShadow position={[-0.34, 1.04, 0]}>
            <boxGeometry args={[0.12, 0.34, 0.24]} />
            <meshStandardMaterial color="#1e293b" roughness={0.56} />
          </mesh>
          <mesh castShadow position={[0, 2.0, 0.12]}>
            <boxGeometry args={[0.26, 0.04, 0.04]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.24} metalness={0.04} />
          </mesh>
          <mesh castShadow position={[0, 0.86, -0.24]}>
            <boxGeometry args={[0.38, 0.28, 0.12]} />
            <meshStandardMaterial color="#475569" roughness={0.44} />
          </mesh>
          <mesh castShadow position={[0.1, 2.18, 0.02]} rotation={[0, 0, 0.22]}>
            <boxGeometry args={[0.3, 0.06, 0.04]} />
            <meshStandardMaterial color="#0f172a" roughness={0.28} metalness={0.08} />
          </mesh>
        </group>
      );
    case 'forklift':
      return (
        <group>
          <ActualCurrentAsset kind={kind} scale={scale} />
          <mesh castShadow position={[0, 2.02, -0.42]}>
            <boxGeometry args={[1.32, 0.12, 1.12]} />
            <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.2} />
          </mesh>
          <mesh castShadow position={[0, 1.08, -1.06]}>
            <boxGeometry args={[1.2, 0.68, 0.36]} />
            <meshStandardMaterial color="#7c2d12" roughness={0.56} metalness={0.14} />
          </mesh>
          <mesh castShadow position={[0, 0.54, 1.88]}>
            <boxGeometry args={[1.22, 0.18, 1.18]} />
            <meshStandardMaterial color="#8b5a2b" roughness={0.76} />
          </mesh>
          <mesh castShadow position={[0, 1.04, 1.88]}>
            <boxGeometry args={[1.06, 0.84, 1.02]} />
            <meshStandardMaterial color="#fef3c7" roughness={0.7} />
          </mesh>
          {[-0.32, 0.32].map((x) => (
            <mesh key={`fork-crossbar-${x}`} castShadow position={[x, 2.0, 0.02]}>
              <boxGeometry args={[0.08, 0.08, 1.16]} />
              <meshStandardMaterial color="#334155" roughness={0.24} metalness={0.28} />
            </mesh>
          ))}
          <mesh castShadow position={[0, 2.34, -0.12]}>
            <cylinderGeometry args={[0.08, 0.08, 0.18, 12]} />
            <meshStandardMaterial color="#f59e0b" roughness={0.28} metalness={0.18} />
          </mesh>
          <mesh castShadow position={[-0.54, 0.9, -1.22]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.16, 0.16, 0.42, 12]} />
            <meshStandardMaterial color="#64748b" roughness={0.28} metalness={0.26} />
          </mesh>
        </group>
      );
    case 'palletCargo':
      return (
        <group>
          <ActualCurrentAsset kind={kind} scale={scale} />
          <mesh position={[0, 0.9, 0]} rotation={[0, Math.PI / 4, 0]}>
            <boxGeometry args={[1.96, 1.42, 1.96]} />
            <meshPhysicalMaterial
              color="#ffffff"
              transparent
              opacity={0.16}
              roughness={0.08}
              transmission={0.18}
            />
          </mesh>
          {[-0.72, 0.72].map((x) => (
            <mesh key={`pallet-strap-${x}`} position={[x, 0.9, 0]}>
              <boxGeometry args={[0.06, 1.46, 1.96]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.16} roughness={0.42} />
            </mesh>
          ))}
          {[-0.78, 0.78].map((x) =>
            [-0.78, 0.78].map((z) => (
              <mesh key={`pallet-corner-${x}-${z}`} castShadow position={[x, 0.94, z]}>
                <boxGeometry args={[0.06, 1.5, 0.06]} />
                <meshStandardMaterial color="#cbd5e1" roughness={0.36} metalness={0.08} />
              </mesh>
            ))
          )}
          <mesh castShadow position={[0, 1.62, 0]}>
            <boxGeometry args={[1.88, 0.06, 1.88]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.42} metalness={0.08} />
          </mesh>
          <mesh castShadow position={[0.68, 1.5, 0.74]}>
            <boxGeometry args={[0.28, 0.2, 0.02]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.42} />
          </mesh>
        </group>
      );
    case 'utilityTower':
      return (
        <group>
          <ActualCurrentAsset kind={kind} scale={scale} />
          <mesh castShadow receiveShadow position={[0, 2.16, 0]}>
            <boxGeometry args={[2.24, 4.18, 1.82]} />
            <meshStandardMaterial color="#1e293b" roughness={0.64} metalness={0.18} />
          </mesh>
          <PrototypeCatwalk position={[0, 4.44, 0]} size={[2.96, 0.08, 2.02]} />
          <PrototypeLadder
            position={[1.12, 1.08, 0.96]}
            height={3.46}
            rotation={[0, Math.PI / 2, 0]}
            cage
          />
          <mesh castShadow position={[-1.38, 2.54, 0]}>
            <boxGeometry args={[0.46, 2.56, 0.36]} />
            <meshStandardMaterial color="#334155" roughness={0.58} metalness={0.2} />
          </mesh>
          <mesh castShadow position={[-1.04, 3.26, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.12, 0.12, 1.74, 12]} />
            <meshStandardMaterial color="#64748b" metalness={0.54} roughness={0.22} />
          </mesh>
          <mesh castShadow position={[0.98, 3.42, -0.8]} rotation={[0.36, 0, 0]}>
            <cylinderGeometry args={[0.12, 0.12, 1.78, 12]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.26} metalness={0.3} />
          </mesh>
          {[-0.72, 0.72].map((x) => (
            <mesh key={`utility-light-${x}`} position={[x, 4.96, 0.9]}>
              <boxGeometry args={[0.16, 0.12, 0.12]} />
              <meshStandardMaterial color="#fef3c7" roughness={0.2} metalness={0.08} />
            </mesh>
          ))}
        </group>
      );
    case 'factoryShell':
      return <FactoryShellPrototypePreview scale={scale} />;
    case 'grainElevator':
      return (
        <group>
          <ActualCurrentAsset kind={kind} scale={scale} />
          <mesh castShadow receiveShadow position={[0, 4.36, -0.42]}>
            <boxGeometry args={[2.44, 4.24, 1.66]} />
            <meshStandardMaterial color="#1e293b" roughness={0.42} metalness={0.22} />
          </mesh>
          <PrototypeCatwalk position={[0, 5.42, 0.76]} size={[2.74, 0.08, 0.3]} />
          <PrototypeLadder position={[1.3, 2.14, 0.74]} height={3.2} cage />
          <mesh castShadow position={[0, 6.82, -0.42]}>
            <boxGeometry args={[2.96, 0.22, 1.84]} />
            <meshStandardMaterial color="#64748b" roughness={0.26} metalness={0.2} />
          </mesh>
          <mesh castShadow position={[2.22, 5.86, 0.18]} rotation={[0, 0, -0.16]}>
            <boxGeometry args={[2.0, 0.14, 0.14]} />
            <meshStandardMaterial color="#475569" roughness={0.26} metalness={0.2} />
          </mesh>
          <mesh castShadow receiveShadow position={[-1.54, 2.2, 0.24]}>
            <boxGeometry args={[1.24, 2.48, 1.38]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.58} metalness={0.08} />
          </mesh>
          <mesh castShadow position={[-1.54, 3.56, 0.24]}>
            <boxGeometry args={[1.4, 0.18, 1.54]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.28} metalness={0.18} />
          </mesh>
        </group>
      );
    case 'conveyorBridge':
      return (
        <group>
          <ActualCurrentAsset kind={kind} scale={scale} />
          {[-2.12, -1.06, 0, 1.06, 2.12].map((x) => (
            <mesh
              key={`bridge-top-${x}`}
              castShadow
              position={[x, 2.36, 0.46]}
              rotation={[0, 0, Math.PI / 4]}
            >
              <boxGeometry args={[0.12, 0.82, 0.08]} />
              <meshStandardMaterial color="#64748b" roughness={0.24} metalness={0.3} />
            </mesh>
          ))}
          {[-2.12, -1.06, 0, 1.06, 2.12].map((x) => (
            <mesh
              key={`bridge-bottom-${x}`}
              castShadow
              position={[x, 1.28, 0.46]}
              rotation={[0, 0, -Math.PI / 4]}
            >
              <boxGeometry args={[0.12, 0.82, 0.08]} />
              <meshStandardMaterial color="#64748b" roughness={0.24} metalness={0.3} />
            </mesh>
          ))}
          <PrototypeCatwalk position={[0, 2.64, -0.54]} size={[5.02, 0.08, 0.24]} />
          {[-2.12, 2.12].map((x) => (
            <mesh key={`bridge-support-${x}`} castShadow position={[x, 0.82, 0]}>
              <boxGeometry args={[0.26, 1.66, 0.26]} />
              <meshStandardMaterial color="#1e293b" roughness={0.32} metalness={0.24} />
            </mesh>
          ))}
          {[-1.6, 0, 1.6].map((x) => (
            <mesh key={`bridge-clad-${x}`} castShadow position={[x, 2.1, 0]}>
              <boxGeometry args={[1.02, 0.88, 0.96]} />
              <meshStandardMaterial color="#dbeafe" roughness={0.28} metalness={0.08} />
            </mesh>
          ))}
        </group>
      );
    case 'truckBay':
      return (
        <group>
          <ActualCurrentAsset kind={kind} scale={scale} />
          <mesh castShadow position={[0, 3.38, -0.24]}>
            <boxGeometry args={[3.6, 0.18, 2.46]} />
            <meshStandardMaterial color="#0f172a" roughness={0.3} metalness={0.22} />
          </mesh>
          {[-1.12, 1.12].map((x) => (
            <mesh key={`dock-bumper-${x}`} castShadow position={[x, 0.76, -1.2]}>
              <boxGeometry args={[0.4, 0.78, 0.24]} />
              <meshStandardMaterial color="#111827" roughness={0.4} />
            </mesh>
          ))}
          {[-1.6, 0, 1.6].map((x) => (
            <mesh key={`dock-lane-${x}`} position={[x, 0.18, 0.94]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.32, 1.72]} />
              <meshBasicMaterial color="#eab308" transparent opacity={0.52} />
            </mesh>
          ))}
          {[-2.06, 2.06].map((x) => (
            <group key={`dock-light-${x}`} position={[x, 2.76, -0.96]}>
              <mesh castShadow position={[0, 0.18, 0]}>
                <boxGeometry args={[0.08, 0.36, 0.08]} />
                <meshStandardMaterial color="#64748b" roughness={0.22} metalness={0.24} />
              </mesh>
              <mesh position={[0, 0.4, 0]}>
                <boxGeometry args={[0.14, 0.1, 0.12]} />
                <meshStandardMaterial color="#f8fafc" roughness={0.16} metalness={0.08} />
              </mesh>
            </group>
          ))}
          {[-2.42, 2.42].map((x) => (
            <mesh key={`dock-bollard-${x}`} castShadow position={[x, 0.44, 1.48]}>
              <cylinderGeometry args={[0.08, 0.08, 0.88, 12]} />
              <meshStandardMaterial color="#f59e0b" roughness={0.34} metalness={0.14} />
            </mesh>
          ))}
          <mesh castShadow position={[0, 0.34, -0.96]}>
            <boxGeometry args={[2.34, 0.18, 0.42]} />
            <meshStandardMaterial color="#475569" roughness={0.28} metalness={0.24} />
          </mesh>
        </group>
      );
    case 'freightTruck':
      return (
        <group>
          <ActualCurrentAsset kind={kind} scale={scale} />
          <mesh castShadow position={[-2.04, 1.58, 0]}>
            <boxGeometry args={[1.24, 0.38, 1.34]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.34} metalness={0.08} />
          </mesh>
          <mesh castShadow position={[-1.2, 0.56, 0]}>
            <boxGeometry args={[0.9, 0.18, 1.8]} />
            <meshStandardMaterial color="#1f2937" roughness={0.34} metalness={0.22} />
          </mesh>
          <mesh castShadow position={[2.9, 0.34, 0]}>
            <boxGeometry args={[0.2, 0.24, 1.7]} />
            <meshStandardMaterial color="#64748b" roughness={0.32} metalness={0.24} />
          </mesh>
          {[-1.58, 0.08, 1.86].map((x) => (
            <mesh key={`trailer-rubrail-${x}`} position={[x, 1.22, 0.9]}>
              <boxGeometry args={[0.84, 0.06, 0.04]} />
              <meshStandardMaterial color="#94a3b8" roughness={0.18} metalness={0.12} />
            </mesh>
          ))}
          <mesh castShadow position={[-2.72, 0.74, 0]}>
            <cylinderGeometry args={[0.16, 0.16, 0.56, 12]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.22} metalness={0.28} />
          </mesh>
          <mesh castShadow position={[2.72, 1.76, 0]}>
            <boxGeometry args={[0.42, 0.5, 1.52]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.32} metalness={0.1} />
          </mesh>
          {[-2.34, -1.22, 0.42, 1.6, 2.8].map((x) => (
            <mesh
              key={`truck-wheel-${x}`}
              castShadow
              position={[x, 0.2, 0]}
              rotation={[0, 0, Math.PI / 2]}
            >
              <cylinderGeometry args={[0.34, 0.34, x > 0.9 ? 0.22 : 0.28, 14]} />
              <meshStandardMaterial color="#020617" roughness={0.82} />
            </mesh>
          ))}
        </group>
      );
    case 'supportOffice':
      return (
        <group>
          <ActualCurrentAsset kind={kind} scale={scale} />
          <mesh castShadow receiveShadow position={[1.56, 1.3, 0]}>
            <boxGeometry args={[1.64, 2.68, 1.9]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.6} metalness={0.08} />
          </mesh>
          <mesh castShadow position={[0.88, 0.94, 1.2]}>
            <boxGeometry args={[2.04, 0.16, 0.82]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.28} metalness={0.12} />
          </mesh>
          {[-1.02, -0.18, 0.66].map((x) => (
            <mesh key={`office-window-${x}`} position={[x, 2.22, 1.12]}>
              <boxGeometry args={[0.54, 1.34, 0.08]} />
              <meshStandardMaterial color="#bae6fd" roughness={0.08} metalness={0.1} />
            </mesh>
          ))}
          <mesh castShadow position={[-0.44, 4.12, 0]}>
            <boxGeometry args={[0.94, 0.22, 0.5]} />
            <meshStandardMaterial color="#475569" roughness={0.34} metalness={0.16} />
          </mesh>
          <mesh castShadow receiveShadow position={[-1.62, 0.82, -0.1]}>
            <boxGeometry args={[1.18, 1.58, 1.42]} />
            <meshStandardMaterial color="#dbeafe" roughness={0.7} metalness={0.04} />
          </mesh>
          <mesh castShadow position={[-0.92, 0.38, 1.42]}>
            <boxGeometry args={[1.44, 0.14, 0.48]} />
            <meshStandardMaterial color="#475569" roughness={0.28} metalness={0.18} />
          </mesh>
        </group>
      );
    case 'gasStation':
      return (
        <group>
          <ActualCurrentAsset kind={kind} scale={scale} />
          <mesh castShadow receiveShadow position={[0, 0.9, -1.48]}>
            <boxGeometry args={[2.12, 1.84, 1.0]} />
            <meshStandardMaterial color="#1e293b" roughness={0.46} metalness={0.12} />
          </mesh>
          <mesh castShadow position={[0, 2.5, 1.2]}>
            <boxGeometry args={[4.82, 0.2, 0.32]} />
            <meshStandardMaterial color="#475569" roughness={0.22} metalness={0.16} />
          </mesh>
          {[-1.82, 1.82].map((x) => (
            <mesh key={`station-post-${x}`} castShadow position={[x, 1.06, 0]}>
              <boxGeometry args={[0.18, 2.12, 0.18]} />
              <meshStandardMaterial color="#e2e8f0" roughness={0.18} metalness={0.12} />
            </mesh>
          ))}
          {[-1, 0, 1].map((x) => (
            <mesh key={`station-pump-${x}`} castShadow position={[x, 0.74, 0.4]}>
              <boxGeometry args={[0.42, 1.44, 0.46]} />
              <meshStandardMaterial color={x === 0 ? '#34d399' : '#f8fafc'} roughness={0.52} />
            </mesh>
          ))}
          <mesh castShadow position={[2.5, 1.26, -0.42]}>
            <boxGeometry args={[0.4, 2.38, 0.28]} />
            <meshStandardMaterial color="#334155" roughness={0.32} metalness={0.14} />
          </mesh>
          <mesh castShadow position={[2.5, 2.76, -0.42]}>
            <boxGeometry args={[0.78, 0.36, 0.14]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.26} />
          </mesh>
          {[-1.46, 1.46].map((x) => (
            <mesh key={`station-bollard-${x}`} castShadow position={[x, 0.4, 0.92]}>
              <cylinderGeometry args={[0.06, 0.06, 0.8, 12]} />
              <meshStandardMaterial color="#f59e0b" roughness={0.34} metalness={0.12} />
            </mesh>
          ))}
        </group>
      );
    case 'farmBarn':
      return (
        <group>
          <ActualCurrentAsset kind={kind} scale={scale} />
          <mesh castShadow receiveShadow position={[1.74, 1.28, 0]}>
            <boxGeometry args={[1.5, 2.58, 1.9]} />
            <meshStandardMaterial color="#7f1d1d" roughness={0.82} />
          </mesh>
          <mesh castShadow position={[-0.18, 2.04, 1.36]}>
            <boxGeometry args={[1.18, 1.98, 0.08]} />
            <meshStandardMaterial color="#5d4037" roughness={0.84} />
          </mesh>
          <mesh castShadow position={[-0.18, 3.24, 1.4]}>
            <boxGeometry args={[0.92, 0.92, 0.06]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.44} />
          </mesh>
          <mesh castShadow position={[-0.18, 4.36, 0]}>
            <boxGeometry args={[0.22, 0.48, 0.22]} />
            <meshStandardMaterial color="#4a4a4a" roughness={0.54} />
          </mesh>
          <mesh castShadow receiveShadow position={[-1.72, 0.84, -0.28]}>
            <boxGeometry args={[1.2, 1.66, 1.4]} />
            <meshStandardMaterial color="#92400e" roughness={0.82} />
          </mesh>
          <mesh castShadow position={[-1.72, 1.76, 0.46]}>
            <boxGeometry args={[0.82, 1.14, 0.08]} />
            <meshStandardMaterial color="#5d4037" roughness={0.8} />
          </mesh>
        </group>
      );
    case 'windmill':
      return (
        <group>
          <ActualCurrentAsset kind={kind} scale={scale} />
          <mesh position={[0, 5.2, 0.86]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.78, 0.04, 10, 24]} />
            <meshStandardMaterial color="#64748b" roughness={0.3} metalness={0.16} />
          </mesh>
          <mesh castShadow position={[0, 0.82, 0.74]}>
            <boxGeometry args={[0.52, 0.96, 0.08]} />
            <meshStandardMaterial color="#7c2d12" roughness={0.58} />
          </mesh>
          {[-0.3, 0.3].map((x) => (
            <mesh key={`windmill-post-${x}`} castShadow position={[x, 5.2, 0.86]}>
              <boxGeometry args={[0.04, 0.32, 0.04]} />
              <meshStandardMaterial color="#94a3b8" roughness={0.24} metalness={0.18} />
            </mesh>
          ))}
          <mesh receiveShadow position={[0, 0.06, 0]}>
            <cylinderGeometry args={[1.04, 1.12, 0.12, 18]} />
            <meshStandardMaterial color="#334155" roughness={0.88} metalness={0.08} />
          </mesh>
          {[-0.74, 0.74].map((x) => (
            <mesh key={`windmill-fence-${x}`} castShadow position={[x, 0.34, 0]}>
              <boxGeometry args={[0.06, 0.36, 1.42]} />
              <meshStandardMaterial color="#475569" roughness={0.28} metalness={0.22} />
            </mesh>
          ))}
        </group>
      );
    case 'villageHouse':
      return (
        <group>
          <ActualCurrentAsset kind={kind} scale={scale} />
          <mesh castShadow receiveShadow position={[1.16, 1.18, 0]}>
            <boxGeometry args={[1.16, 2.4, 1.52]} />
            <meshStandardMaterial color="#dbeafe" roughness={0.74} />
          </mesh>
          <mesh castShadow position={[0.24, 0.96, 1.0]}>
            <boxGeometry args={[1.98, 0.16, 0.6]} />
            <meshStandardMaterial color="#fda4af" roughness={0.28} />
          </mesh>
          {[-0.86, -0.24, 0.38].map((x) => (
            <mesh key={`house-window-${x}`} position={[x, 1.92, 0.94]}>
              <boxGeometry args={[0.34, 0.74, 0.08]} />
              <meshStandardMaterial color="#93c5fd" roughness={0.1} metalness={0.08} />
            </mesh>
          ))}
          {[-0.82, -0.2, 0.42].map((x) => (
            <mesh key={`house-shutter-${x}`} castShadow position={[x, 1.92, 0.98]}>
              <boxGeometry args={[0.04, 0.82, 0.02]} />
              <meshStandardMaterial color="#475569" roughness={0.4} />
            </mesh>
          ))}
          <mesh castShadow position={[-0.84, 0.44, 1.22]}>
            <boxGeometry args={[0.92, 0.12, 0.58]} />
            <meshStandardMaterial color="#475569" roughness={0.28} metalness={0.14} />
          </mesh>
          <mesh castShadow position={[0.84, 3.04, 0]}>
            <boxGeometry args={[0.22, 1.0, 0.22]} />
            <meshStandardMaterial color="#64748b" roughness={0.34} />
          </mesh>
        </group>
      );
    case 'townHall':
      return (
        <group>
          <ActualCurrentAsset kind={kind} scale={scale} />
          <mesh castShadow position={[0, 5.84, 0]}>
            <coneGeometry args={[0.98, 1.44, 8]} />
            <meshStandardMaterial color="#475569" roughness={0.5} />
          </mesh>
          <mesh position={[0, 4.56, 0.68]}>
            <cylinderGeometry args={[0.28, 0.28, 0.08, 18]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.18} metalness={0.06} />
          </mesh>
          {[-1.12, 0, 1.12].map((x) => (
            <mesh key={`hall-arcade-${x}`} position={[x, 0.92, 1.16]}>
              <boxGeometry args={[0.52, 1.64, 0.08]} />
              <meshStandardMaterial color="#0f172a" roughness={0.38} />
            </mesh>
          ))}
          <mesh castShadow position={[0, 0.18, 1.5]}>
            <boxGeometry args={[2.3, 0.22, 0.78]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.54} />
          </mesh>
          <mesh castShadow position={[0, 0.56, 1.78]}>
            <boxGeometry args={[1.6, 0.18, 0.42]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.32} metalness={0.1} />
          </mesh>
          {[-0.62, 0.62].map((x) => (
            <mesh key={`hall-column-${x}`} castShadow position={[x, 0.96, 1.48]}>
              <boxGeometry args={[0.12, 1.1, 0.12]} />
              <meshStandardMaterial color="#e2e8f0" roughness={0.22} metalness={0.08} />
            </mesh>
          ))}
        </group>
      );
    case 'canalBoat':
      return (
        <group>
          <ActualCurrentAsset kind={kind} scale={scale} />
          <mesh castShadow position={[0, 0.72, 0]}>
            <boxGeometry args={[4.02, 0.16, 1.16]} />
            <meshStandardMaterial color="#1e293b" roughness={0.32} metalness={0.16} />
          </mesh>
          <mesh castShadow position={[-0.78, 0.98, 0]}>
            <boxGeometry args={[1.68, 0.66, 0.92]} />
            <meshStandardMaterial color="#fef3c7" roughness={0.7} />
          </mesh>
          <mesh castShadow position={[1.38, 1.0, 0]}>
            <boxGeometry args={[1.16, 0.96, 0.96]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.38} metalness={0.08} />
          </mesh>
          <mesh castShadow position={[1.88, 1.56, 0]}>
            <cylinderGeometry args={[0.08, 0.08, 0.78, 10]} />
            <meshStandardMaterial color="#64748b" roughness={0.22} metalness={0.18} />
          </mesh>
          {[-1.4, -0.7, 0, 0.7, 1.4].map((x) => (
            <mesh key={`boat-rail-${x}`} castShadow position={[x, 1.02, 0.58]}>
              <boxGeometry args={[0.04, 0.28, 0.04]} />
              <meshStandardMaterial color="#94a3b8" roughness={0.24} metalness={0.18} />
            </mesh>
          ))}
          <mesh castShadow position={[-0.08, 1.18, 0]}>
            <boxGeometry args={[1.28, 0.12, 0.94]} />
            <meshStandardMaterial color="#8b5a2b" roughness={0.68} />
          </mesh>
          <mesh castShadow position={[1.72, 1.84, 0]}>
            <boxGeometry args={[0.12, 0.36, 0.12]} />
            <meshStandardMaterial color="#334155" roughness={0.28} metalness={0.2} />
          </mesh>
        </group>
      );
  }

  return <ActualCurrentAsset kind={kind} scale={scale} />;
};

const AssetModel: React.FC<AssetModelProps> = ({ kind, variant, detail, scale }) => {
  if (variant === 'current' && detail === 'hero') {
    return <ActualCurrentAsset kind={kind} scale={scale} />;
  }

  if (variant === 'prototype' && detail === 'hero') {
    return <ActualPrototypeAsset kind={kind} scale={scale} />;
  }

  return <ProceduralAssetModel kind={kind} variant={variant} detail={detail} scale={scale} />;
};

const ProceduralAssetModel: React.FC<AssetModelProps> = ({ kind, variant, detail, scale }) => {
  switch (kind) {
    case 'silo':
      return <SiloAsset variant={variant} detail={detail} scale={scale} />;
    case 'rollerMill':
      return <RollerMillAsset variant={variant} detail={detail} scale={scale} />;
    case 'plansifter':
      return <PlansifterAsset variant={variant} detail={detail} scale={scale} />;
    case 'packer':
      return <PackerAsset variant={variant} detail={detail} scale={scale} />;
    case 'conveyor':
      return <ConveyorAsset variant={variant} detail={detail} scale={scale} />;
    case 'spouting':
      return <SpoutingAsset variant={variant} detail={detail} scale={scale} />;
    case 'worker':
      return <WorkerAsset variant={variant} detail={detail} scale={scale} />;
    case 'forklift':
      return <ForkliftAsset variant={variant} detail={detail} scale={scale} />;
    case 'palletCargo':
      return <PalletCargoAsset variant={variant} detail={detail} scale={scale} />;
    case 'utilityTower':
      return <UtilityTowerAsset variant={variant} detail={detail} scale={scale} />;
    case 'factoryShell':
      return <FactoryShellAsset variant={variant} detail={detail} scale={scale} />;
    case 'grainElevator':
      return <GrainElevatorAsset variant={variant} detail={detail} scale={scale} />;
    case 'conveyorBridge':
      return <ConveyorBridgeAsset variant={variant} detail={detail} scale={scale} />;
    case 'truckBay':
      return <TruckBayAsset variant={variant} detail={detail} scale={scale} />;
    case 'freightTruck':
      return <FreightTruckAsset variant={variant} detail={detail} scale={scale} />;
    case 'supportOffice':
      return <SupportOfficeAsset variant={variant} detail={detail} scale={scale} />;
    case 'gasStation':
      return <GasStationAsset variant={variant} detail={detail} scale={scale} />;
    case 'farmBarn':
      return <FarmBarnAsset variant={variant} detail={detail} scale={scale} />;
    case 'windmill':
      return <WindmillAsset variant={variant} detail={detail} scale={scale} />;
    case 'villageHouse':
      return <VillageHouseAsset variant={variant} detail={detail} scale={scale} />;
    case 'townHall':
      return <TownHallAsset variant={variant} detail={detail} scale={scale} />;
    case 'canalBoat':
      return <CanalBoatAsset variant={variant} detail={detail} scale={scale} />;
  }
};

interface VariantAssetProps {
  variant: AssetVariant;
  detail: DetailLevel;
  scale: number;
}

const SiloAsset: React.FC<VariantAssetProps> = ({ variant, detail, scale }) => {
  const isHero = detail === 'hero';

  if (variant === 'current') {
    return (
      <group scale={scale}>
        <mesh castShadow receiveShadow position={[0, 2.2, 0]}>
          <cylinderGeometry args={[1.08, 1.08, 4.4, isHero ? 24 : 12]} />
          <meshStandardMaterial color="#8b98a8" metalness={0.58} roughness={0.42} />
        </mesh>
        <mesh castShadow position={[0, 4.88, 0]}>
          <coneGeometry args={[1.18, 1.1, isHero ? 24 : 12]} />
          <meshStandardMaterial color="#98a4b2" metalness={0.52} roughness={0.44} />
        </mesh>
        <mesh castShadow position={[0, 0.62, 0]}>
          <coneGeometry args={[0.96, 1.2, isHero ? 18 : 10]} />
          <meshStandardMaterial color="#8a96a3" metalness={0.52} roughness={0.46} />
        </mesh>
        {[0, 1, 2, 3].map((index) => {
          const angle = (index / 4) * Math.PI * 2;
          return (
            <mesh
              key={`silo-leg-${index}`}
              castShadow
              position={[Math.cos(angle) * 0.88, -0.1, Math.sin(angle) * 0.88]}
            >
              <cylinderGeometry args={[0.09, 0.09, 1.45, 8]} />
              <meshStandardMaterial color="#364152" metalness={0.7} roughness={0.32} />
            </mesh>
          );
        })}
        {isHero && (
          <mesh castShadow position={[0, 3.4, 1.08]}>
            <boxGeometry args={[0.58, 0.38, 0.12]} />
            <meshStandardMaterial color="#1f2937" metalness={0.32} roughness={0.58} />
          </mesh>
        )}
      </group>
    );
  }

  return (
    <group scale={scale}>
      <mesh castShadow receiveShadow position={[0, 2.3, 0]}>
        <cylinderGeometry args={[1.12, 1.22, 4.6, isHero ? 32 : 16]} />
        <meshStandardMaterial color="#c3ced8" metalness={0.72} roughness={0.28} />
      </mesh>
      <mesh castShadow position={[0, 4.95, 0]}>
        <coneGeometry args={[1.24, 1.15, isHero ? 32 : 16]} />
        <meshStandardMaterial color="#d5dce3" metalness={0.7} roughness={0.24} />
      </mesh>
      <mesh castShadow position={[0, 5.58, 0]}>
        <cylinderGeometry args={[0.28, 0.34, 0.46, 16]} />
        <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.32} />
      </mesh>
      <mesh castShadow position={[0, 0.56, 0]}>
        <coneGeometry args={[1.0, 1.5, isHero ? 24 : 12]} />
        <meshStandardMaterial color="#bcc7d1" metalness={0.66} roughness={0.28} />
      </mesh>
      {[0, 1, 2, 3, 4, 5].map((index) => {
        const angle = (index / 6) * Math.PI * 2;
        return (
          <mesh
            key={`silo-rib-${index}`}
            castShadow
            position={[Math.cos(angle) * 1.23, 2.3, Math.sin(angle) * 1.23]}
            rotation={[0, angle, 0]}
          >
            <boxGeometry args={[0.08, 4.4, 0.18]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.82} roughness={0.2} />
          </mesh>
        );
      })}
      {[0, 1, 2, 3].map((index) => {
        const angle = (index / 4) * Math.PI * 2 + Math.PI / 4;
        return (
          <mesh
            key={`silo-support-${index}`}
            castShadow
            position={[Math.cos(angle) * 0.98, -0.12, Math.sin(angle) * 0.98]}
          >
            <cylinderGeometry args={[0.1, 0.12, 1.7, 8]} />
            <meshStandardMaterial color="#1e293b" metalness={0.72} roughness={0.22} />
          </mesh>
        );
      })}
      <mesh position={[0, 3.92, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.38, 0.08, 12, 32]} />
        <meshStandardMaterial color="#7dd3fc" emissive="#7dd3fc" emissiveIntensity={0.35} />
      </mesh>
      <group position={[1.1, 1.7, 0]}>
        <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.09, 0.09, 3.1, 10]} />
          <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.26} />
        </mesh>
        {isHero &&
          Array.from({ length: 7 }, (_, index) => (
            <mesh key={`silo-rung-${index}`} position={[0, index * 0.4 - 1.2, 0.18]}>
              <boxGeometry args={[0.46, 0.05, 0.05]} />
              <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.28} />
            </mesh>
          ))}
      </group>
      {isHero && (
        <>
          <mesh castShadow position={[0.95, 4.5, 0]}>
            <boxGeometry args={[0.4, 0.5, 0.18]} />
            <meshStandardMaterial color="#0f172a" metalness={0.3} roughness={0.48} />
          </mesh>
          <mesh castShadow position={[-0.95, 3.15, 0.9]} rotation={[0, Math.PI / 2, 0]}>
            <cylinderGeometry args={[0.12, 0.12, 1.2, 12]} />
            <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.24} />
          </mesh>
        </>
      )}
    </group>
  );
};

const RollerMillAsset: React.FC<VariantAssetProps> = ({ variant, detail, scale }) => {
  const isHero = detail === 'hero';

  if (variant === 'current') {
    return (
      <group scale={scale}>
        <mesh castShadow receiveShadow position={[0, 1.45, 0]}>
          <boxGeometry args={[2.9, 2.8, 1.9]} />
          <meshStandardMaterial color="#3b82f6" metalness={0.32} roughness={0.62} />
        </mesh>
        <mesh castShadow position={[0, 3.15, 0]}>
          <boxGeometry args={[1.9, 0.9, 1.2]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.46} roughness={0.46} />
        </mesh>
        <mesh castShadow position={[1.56, 1.4, 0]}>
          <boxGeometry args={[0.14, 1.4, 0.95]} />
          <meshStandardMaterial color="#1f2937" roughness={0.52} />
        </mesh>
        <mesh castShadow position={[0, -0.05, 0]}>
          <boxGeometry args={[3.2, 0.16, 2.1]} />
          <meshStandardMaterial color="#374151" metalness={0.55} roughness={0.34} />
        </mesh>
      </group>
    );
  }

  return (
    <group scale={scale}>
      <mesh castShadow receiveShadow position={[0, 1.35, 0]}>
        <boxGeometry args={[2.4, 2.3, 1.5]} />
        <meshStandardMaterial color="#dbeafe" metalness={0.34} roughness={0.58} />
      </mesh>
      <mesh castShadow position={[0, 2.8, 0]}>
        <boxGeometry args={[1.7, 0.7, 1.05]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.45} roughness={0.36} />
      </mesh>
      <mesh castShadow position={[1.68, 1.2, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.42, 0.42, 1.1, isHero ? 18 : 12]} />
        <meshStandardMaterial color="#1e293b" metalness={0.76} roughness={0.18} />
      </mesh>
      <mesh castShadow position={[1.12, 1.18, 0]}>
        <boxGeometry args={[0.72, 0.86, 1.08]} />
        <meshStandardMaterial color="#0f172a" roughness={0.44} metalness={0.4} />
      </mesh>
      {[0, 1].map((index) => (
        <mesh key={`mill-door-${index}`} castShadow position={[-0.42 + index * 0.84, 1.35, 0.78]}>
          <boxGeometry args={[0.62, 1.45, 0.08]} />
          <meshStandardMaterial color="#93c5fd" metalness={0.28} roughness={0.55} />
        </mesh>
      ))}
      {isHero &&
        Array.from({ length: 5 }, (_, index) => (
          <mesh key={`mill-vent-${index}`} position={[-1.05 + index * 0.26, 2.05, 0.79]}>
            <boxGeometry args={[0.13, 0.6, 0.05]} />
            <meshStandardMaterial color="#0f172a" roughness={0.38} />
          </mesh>
        ))}
      {[0, 1].map((index) => (
        <mesh key={`mill-foot-${index}`} castShadow position={[-0.88 + index * 1.76, -0.02, 0.55]}>
          <boxGeometry args={[0.32, 0.24, 0.32]} />
          <meshStandardMaterial color="#334155" metalness={0.62} roughness={0.26} />
        </mesh>
      ))}
      {[0, 1].map((index) => (
        <mesh
          key={`mill-roller-${index}`}
          castShadow
          position={[-0.62 + index * 1.24, 0.55, -0.72]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[0.18, 0.18, 1.18, isHero ? 18 : 10]} />
          <meshStandardMaterial color="#64748b" metalness={0.76} roughness={0.14} />
        </mesh>
      ))}
      {isHero && (
        <>
          <mesh castShadow position={[-1.12, 2.45, -0.2]} rotation={[0.35, 0, 0]}>
            <cylinderGeometry args={[0.16, 0.24, 1.15, 14]} />
            <meshStandardMaterial color="#60a5fa" metalness={0.46} roughness={0.42} />
          </mesh>
          <mesh castShadow position={[0.88, 2.14, 0.82]}>
            <boxGeometry args={[0.42, 0.68, 0.1]} />
            <meshStandardMaterial color="#0f172a" roughness={0.38} />
          </mesh>
        </>
      )}
    </group>
  );
};

const PlansifterAsset: React.FC<VariantAssetProps> = ({ variant, detail, scale }) => {
  const isHero = detail === 'hero';

  if (variant === 'current') {
    return (
      <group scale={scale}>
        <mesh castShadow position={[0, 4.5, 0]}>
          <boxGeometry args={[3.4, 0.18, 1.8]} />
          <meshStandardMaterial color="#1f2937" metalness={0.68} roughness={0.22} />
        </mesh>
        {[-1.1, 1.1].map((x) =>
          [-0.62, 0.62].map((z) => (
            <mesh key={`sifter-hanger-${x}-${z}`} castShadow position={[x, 3.2, z]}>
              <cylinderGeometry args={[0.05, 0.05, 2.3, 8]} />
              <meshStandardMaterial color="#64748b" metalness={0.72} roughness={0.22} />
            </mesh>
          ))
        )}
        <mesh castShadow receiveShadow position={[0, 1.8, 0]}>
          <boxGeometry args={[2.8, 2.1, 1.9]} />
          <meshStandardMaterial color="#f5f0e6" roughness={0.78} metalness={0.12} />
        </mesh>
        <mesh castShadow position={[1.74, 1.7, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.3, 0.3, 0.44, isHero ? 16 : 10]} />
          <meshStandardMaterial color="#475569" metalness={0.78} roughness={0.16} />
        </mesh>
      </group>
    );
  }

  return (
    <group scale={scale}>
      <mesh castShadow position={[0, 5.02, 0]}>
        <boxGeometry args={[4.2, 0.22, 2.2]} />
        <meshStandardMaterial color="#0f172a" metalness={0.78} roughness={0.18} />
      </mesh>
      {[-1.35, 1.35].map((x) =>
        [-0.72, 0.72].map((z) => (
          <group key={`prototype-sifter-hanger-${x}-${z}`} position={[x, 0, z]}>
            <mesh castShadow position={[0, 4.2, 0]}>
              <cylinderGeometry args={[0.05, 0.05, 1.1, 8]} />
              <meshStandardMaterial color="#64748b" metalness={0.78} roughness={0.16} />
            </mesh>
            <mesh castShadow position={[0, 3.55, 0]}>
              <cylinderGeometry args={[0.12, 0.12, 0.3, 10]} />
              <meshStandardMaterial color="#93c5fd" metalness={0.35} roughness={0.42} />
            </mesh>
          </group>
        ))
      )}
      {[-0.86, 0.86].map((x) => (
        <mesh key={`sifter-body-${x}`} castShadow receiveShadow position={[x, 2.3, 0]}>
          <boxGeometry args={[1.45, 1.9, 1.8]} />
          <meshStandardMaterial color="#fef3c7" roughness={0.72} metalness={0.08} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 4.25, -0.9]}>
        <boxGeometry args={[3.1, 0.12, 0.4]} />
        <meshStandardMaterial color="#64748b" metalness={0.65} roughness={0.28} />
      </mesh>
      {isHero &&
        Array.from({ length: 4 }, (_, index) => (
          <mesh key={`sifter-rail-${index}`} position={[-1.2 + index * 0.8, 4.58, -0.9]}>
            <boxGeometry args={[0.08, 0.62, 0.08]} />
            <meshStandardMaterial color="#7dd3fc" metalness={0.55} roughness={0.22} />
          </mesh>
        ))}
      <mesh castShadow position={[1.78, 2.3, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.26, 0.26, 0.9, isHero ? 18 : 10]} />
        <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.16} />
      </mesh>
      <mesh castShadow position={[-1.9, 3.2, 0.45]} rotation={[0.4, 0, 0]}>
        <cylinderGeometry args={[0.12, 0.14, 1.5, 12]} />
        <meshStandardMaterial color="#60a5fa" metalness={0.5} roughness={0.34} />
      </mesh>
      <mesh castShadow position={[0, 1.18, 0.95]}>
        <boxGeometry args={[3.4, 0.15, 0.28]} />
        <meshStandardMaterial color="#334155" metalness={0.72} roughness={0.18} />
      </mesh>
      {isHero && (
        <mesh castShadow position={[0, 2.35, 0.92]}>
          <boxGeometry args={[1.2, 0.72, 0.08]} />
          <meshStandardMaterial color="#0f172a" roughness={0.4} />
        </mesh>
      )}
    </group>
  );
};

const PackerAsset: React.FC<VariantAssetProps> = ({ variant, detail, scale }) => {
  const isHero = detail === 'hero';

  if (variant === 'current') {
    return (
      <group scale={scale}>
        {[-1.05, 1.05].map((x) =>
          [-0.82, 0.82].map((z) => (
            <mesh key={`packer-post-${x}-${z}`} castShadow position={[x, 2.05, z]}>
              <boxGeometry args={[0.1, 4.1, 0.1]} />
              <meshStandardMaterial color="#f97316" metalness={0.35} roughness={0.48} />
            </mesh>
          ))
        )}
        <mesh castShadow position={[0, 4.2, 0]}>
          <boxGeometry args={[2.25, 0.16, 1.8]} />
          <meshStandardMaterial color="#f97316" metalness={0.35} roughness={0.48} />
        </mesh>
        <mesh castShadow position={[0, 2.95, 0]}>
          <boxGeometry args={[1.5, 1.15, 1.2]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.45} roughness={0.38} />
        </mesh>
        <mesh castShadow position={[0, 1.25, 0]}>
          <cylinderGeometry args={[0.16, 0.16, 1.8, 12]} />
          <meshStandardMaterial color="#64748b" metalness={0.68} roughness={0.22} />
        </mesh>
        <mesh castShadow position={[0, 0.32, 1.48]}>
          <boxGeometry args={[3.2, 0.16, 1.2]} />
          <meshStandardMaterial color="#1f2937" metalness={0.55} roughness={0.24} />
        </mesh>
        <mesh castShadow position={[-1.48, 1.78, 0]}>
          <boxGeometry args={[0.28, 2.1, 1.0]} />
          <meshStandardMaterial color="#0f172a" roughness={0.46} />
        </mesh>
      </group>
    );
  }

  return (
    <group scale={scale}>
      <mesh castShadow receiveShadow position={[0, 2.15, 0]}>
        <boxGeometry args={[2.45, 3.7, 1.65]} />
        <meshStandardMaterial color="#0f172a" roughness={0.44} metalness={0.28} />
      </mesh>
      <mesh castShadow position={[0, 3.55, 0]}>
        <boxGeometry args={[1.65, 1.0, 1.15]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.38} metalness={0.5} />
      </mesh>
      <mesh castShadow position={[0, 2.2, 0.84]}>
        <boxGeometry args={[1.25, 1.55, 0.08]} />
        <meshStandardMaterial color="#e0f2fe" roughness={0.2} metalness={0.2} />
      </mesh>
      <mesh castShadow position={[0, 1.15, 0.2]}>
        <boxGeometry args={[0.5, 0.2, 0.9]} />
        <meshStandardMaterial color="#fb923c" metalness={0.35} roughness={0.45} />
      </mesh>
      <mesh castShadow position={[0, 0.62, 1.62]}>
        <boxGeometry args={[3.6, 0.22, 1.15]} />
        <meshStandardMaterial color="#1f2937" metalness={0.58} roughness={0.22} />
      </mesh>
      {Array.from({ length: isHero ? 6 : 4 }, (_, index) => (
        <mesh
          key={`packer-roller-${index}`}
          castShadow
          position={[-1.25 + index * 0.5, 0.8, 1.62]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[0.12, 0.12, 0.86, 12]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.78} roughness={0.14} />
        </mesh>
      ))}
      <mesh castShadow position={[-1.58, 2.35, 0]}>
        <boxGeometry args={[0.35, 2.35, 1.0]} />
        <meshStandardMaterial color="#111827" roughness={0.36} />
      </mesh>
      {isHero && (
        <>
          <mesh castShadow position={[-1.58, 3.28, 0.25]}>
            <boxGeometry args={[0.18, 0.58, 0.54]} />
            <meshStandardMaterial color="#7dd3fc" emissive="#7dd3fc" emissiveIntensity={0.45} />
          </mesh>
          <mesh castShadow position={[0.98, 2.15, -0.94]}>
            <boxGeometry args={[0.08, 1.9, 0.08]} />
            <meshStandardMaterial color="#7dd3fc" metalness={0.56} roughness={0.22} />
          </mesh>
          <mesh castShadow position={[0, 3.8, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.08, 0.08, 2.5, 12]} />
            <meshStandardMaterial color="#fb923c" metalness={0.36} roughness={0.42} />
          </mesh>
        </>
      )}
    </group>
  );
};

const ConveyorAsset: React.FC<VariantAssetProps> = ({ variant, detail, scale }) => {
  const isHero = detail === 'hero';

  if (variant === 'current') {
    return (
      <group scale={scale}>
        <mesh castShadow receiveShadow position={[0, 0.78, 0]}>
          <boxGeometry args={[4.8, 0.24, 1.2]} />
          <meshStandardMaterial color="#1f2937" metalness={0.44} roughness={0.36} />
        </mesh>
        {[-1.85, -0.65, 0.65, 1.85].map((x) => (
          <mesh key={`conveyor-leg-${x}`} castShadow position={[x, 0.28, 0]}>
            <boxGeometry args={[0.12, 0.6, 0.12]} />
            <meshStandardMaterial color="#475569" metalness={0.62} roughness={0.24} />
          </mesh>
        ))}
        {[0, 1].map((index) => (
          <mesh
            key={`conveyor-drum-${index}`}
            castShadow
            position={[-2.35 + index * 4.7, 0.8, 0]}
            rotation={[0, 0, Math.PI / 2]}
          >
            <cylinderGeometry args={[0.22, 0.22, 1.18, 14]} />
            <meshStandardMaterial color="#6b7280" metalness={0.72} roughness={0.18} />
          </mesh>
        ))}
        {isHero &&
          [0, 1].map((index) => (
            <mesh key={`conveyor-bag-${index}`} castShadow position={[-1 + index * 2, 1.05, 0]}>
              <boxGeometry args={[0.76, 0.42, 0.56]} />
              <meshStandardMaterial color="#f8fafc" roughness={0.8} />
            </mesh>
          ))}
      </group>
    );
  }

  return (
    <group scale={scale}>
      <mesh castShadow receiveShadow position={[0, 0.82, 0]}>
        <boxGeometry args={[4.9, 0.18, 1.08]} />
        <meshStandardMaterial color="#111827" metalness={0.42} roughness={0.26} />
      </mesh>
      {[-2.35, 2.35].map((x) => (
        <mesh
          key={`prototype-conveyor-drum-${x}`}
          castShadow
          position={[x, 0.82, 0]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[0.26, 0.26, 1.08, 16]} />
          <meshStandardMaterial color="#475569" metalness={0.78} roughness={0.16} />
        </mesh>
      ))}
      {[-1.8, -0.9, 0, 0.9, 1.8].map((x) => (
        <mesh
          key={`conveyor-roller-${x}`}
          castShadow
          position={[x, 0.78, 0]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[0.1, 0.1, 0.96, 12]} />
          <meshStandardMaterial color="#64748b" metalness={0.82} roughness={0.12} />
        </mesh>
      ))}
      {[-1.92, -0.64, 0.64, 1.92].map((x) => (
        <mesh key={`conveyor-support-${x}`} castShadow position={[x, 0.3, 0]}>
          <boxGeometry args={[0.14, 0.64, 0.14]} />
          <meshStandardMaterial color="#1e293b" metalness={0.68} roughness={0.2} />
        </mesh>
      ))}
      {[-0.62, 0.62].map((z) => (
        <mesh key={`conveyor-rail-${z}`} castShadow position={[0, 1.1, z]}>
          <boxGeometry args={[4.6, 0.16, 0.08]} />
          <meshStandardMaterial color="#22c55e" metalness={0.42} roughness={0.34} />
        </mesh>
      ))}
      <mesh castShadow position={[0.7, 1.75, 0]}>
        <boxGeometry args={[0.16, 1.1, 1.4]} />
        <meshStandardMaterial color="#67e8f9" emissive="#67e8f9" emissiveIntensity={0.3} />
      </mesh>
      {isHero &&
        [0, 1, 2].map((index) => (
          <mesh
            key={`conveyor-product-${index}`}
            castShadow
            position={[-1.2 + index * 1.15, 1.03, 0]}
          >
            <boxGeometry args={[0.64, 0.38, 0.48]} />
            <meshStandardMaterial color={index === 1 ? '#f8fafc' : '#fef3c7'} roughness={0.76} />
          </mesh>
        ))}
    </group>
  );
};

const SpoutingAsset: React.FC<VariantAssetProps> = ({ variant, detail, scale }) => {
  const isHero = detail === 'hero';

  if (variant === 'current') {
    return (
      <group scale={scale}>
        <mesh castShadow position={[-1.15, 1.85, 0]}>
          <cylinderGeometry args={[0.18, 0.18, 3.2, 12]} />
          <meshStandardMaterial color="#64748b" metalness={0.82} roughness={0.14} />
        </mesh>
        <mesh castShadow position={[1.15, 2.25, 0]}>
          <cylinderGeometry args={[0.18, 0.18, 4.0, 12]} />
          <meshStandardMaterial color="#64748b" metalness={0.82} roughness={0.14} />
        </mesh>
        <mesh castShadow position={[0, 3.25, 0]} rotation={[0, 0, 1.04]}>
          <cylinderGeometry args={[0.18, 0.18, 2.9, 12]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.76} roughness={0.18} />
        </mesh>
      </group>
    );
  }

  return (
    <group scale={scale}>
      <mesh castShadow position={[-1.5, 2.0, 0]}>
        <cylinderGeometry args={[0.16, 0.16, 3.8, 12]} />
        <meshStandardMaterial color="#64748b" metalness={0.82} roughness={0.16} />
      </mesh>
      <mesh castShadow position={[1.4, 2.4, 0]}>
        <cylinderGeometry args={[0.16, 0.16, 4.6, 12]} />
        <meshStandardMaterial color="#64748b" metalness={0.82} roughness={0.16} />
      </mesh>
      <mesh castShadow position={[-0.15, 4.15, 0]} rotation={[0, 0, 0.98]}>
        <cylinderGeometry args={[0.14, 0.14, 3.8, 12]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.82} roughness={0.12} />
      </mesh>
      <mesh castShadow position={[0.92, 5.15, 0]} rotation={[0, 0, -0.68]}>
        <cylinderGeometry args={[0.14, 0.14, 2.4, 12]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.82} roughness={0.12} />
      </mesh>
      <mesh castShadow position={[0.05, 3.65, 0]}>
        <cylinderGeometry args={[0.62, 0.74, 1.7, isHero ? 20 : 12]} />
        <meshStandardMaterial color="#0f172a" metalness={0.34} roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0.05, 2.55, 0]}>
        <coneGeometry args={[0.64, 1.2, isHero ? 20 : 12]} />
        <meshStandardMaterial color="#334155" metalness={0.42} roughness={0.4} />
      </mesh>
      {[-0.7, 0.8].map((x) => (
        <mesh key={`spout-valve-${x}`} castShadow position={[x, 4.9, 0]}>
          <boxGeometry args={[0.38, 0.16, 0.38]} />
          <meshStandardMaterial color="#67e8f9" metalness={0.35} roughness={0.4} />
        </mesh>
      ))}
      {isHero &&
        [-1.5, 1.4].map((x) => (
          <mesh key={`spout-hanger-${x}`} castShadow position={[x, 5.55, 0]}>
            <boxGeometry args={[0.08, 0.9, 0.08]} />
            <meshStandardMaterial color="#475569" metalness={0.65} roughness={0.22} />
          </mesh>
        ))}
    </group>
  );
};

const WorkerAsset: React.FC<VariantAssetProps> = ({ variant, detail, scale }) => {
  const isHero = detail === 'hero';

  if (variant === 'current') {
    return (
      <group scale={scale}>
        <mesh castShadow position={[0, 1.1, 0]}>
          <boxGeometry args={[0.52, 0.92, 0.26]} />
          <meshStandardMaterial color="#2563eb" roughness={0.72} />
        </mesh>
        <mesh castShadow position={[0, 1.8, 0]}>
          <sphereGeometry args={[0.17, isHero ? 16 : 10, isHero ? 16 : 10]} />
          <meshStandardMaterial color="#f5d0c5" roughness={0.58} />
        </mesh>
        <mesh castShadow position={[0, 1.95, 0]}>
          <sphereGeometry args={[0.18, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#facc15" roughness={0.48} />
        </mesh>
        {[-0.28, 0.28].map((x) => (
          <mesh key={`worker-arm-${x}`} castShadow position={[x, 1.18, 0]}>
            <boxGeometry args={[0.12, 0.62, 0.12]} />
            <meshStandardMaterial color="#2563eb" roughness={0.74} />
          </mesh>
        ))}
        {[-0.14, 0.14].map((x) => (
          <mesh key={`worker-leg-${x}`} castShadow position={[x, 0.45, 0]}>
            <boxGeometry args={[0.14, 0.72, 0.14]} />
            <meshStandardMaterial color="#1e293b" roughness={0.82} />
          </mesh>
        ))}
      </group>
    );
  }

  return (
    <group scale={scale}>
      <mesh castShadow position={[0, 1.18, 0]}>
        <boxGeometry args={[0.5, 0.84, 0.3]} />
        <meshStandardMaterial color="#0f766e" roughness={0.62} metalness={0.18} />
      </mesh>
      <mesh castShadow position={[0, 0.72, 0]}>
        <boxGeometry args={[0.42, 0.28, 0.26]} />
        <meshStandardMaterial color="#1e293b" roughness={0.78} />
      </mesh>
      <mesh castShadow position={[0, 1.86, 0]}>
        <sphereGeometry args={[0.18, isHero ? 20 : 12, isHero ? 20 : 12]} />
        <meshStandardMaterial color="#f1c7b8" roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0, 2.02, 0]}>
        <sphereGeometry args={[0.2, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#f97316" roughness={0.4} />
      </mesh>
      <mesh castShadow position={[0, 1.25, 0.16]}>
        <boxGeometry args={[0.56, 0.56, 0.08]} />
        <meshStandardMaterial color="#fb923c" roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0.34, 1.26, 0]} rotation={[0, 0, -0.32]}>
        <boxGeometry args={[0.12, 0.68, 0.12]} />
        <meshStandardMaterial color="#0f766e" roughness={0.66} />
      </mesh>
      <mesh castShadow position={[-0.32, 1.22, 0]} rotation={[0, 0, 0.18]}>
        <boxGeometry args={[0.12, 0.68, 0.12]} />
        <meshStandardMaterial color="#0f766e" roughness={0.66} />
      </mesh>
      <mesh castShadow position={[0.44, 0.98, 0.1]} rotation={[0, 0, -0.2]}>
        <boxGeometry args={[0.24, 0.16, 0.1]} />
        <meshStandardMaterial color="#67e8f9" roughness={0.34} metalness={0.15} />
      </mesh>
      {[-0.14, 0.14].map((x) => (
        <group key={`worker-prototype-leg-${x}`} position={[x, 0.38, 0]}>
          <mesh castShadow position={[0, 0.22, 0]}>
            <boxGeometry args={[0.14, 0.72, 0.14]} />
            <meshStandardMaterial color="#1e293b" roughness={0.82} />
          </mesh>
          <mesh castShadow position={[0, -0.2, 0.05]}>
            <boxGeometry args={[0.2, 0.12, 0.28]} />
            <meshStandardMaterial color="#0f172a" roughness={0.72} />
          </mesh>
        </group>
      ))}
      {isHero && (
        <>
          <mesh castShadow position={[0, 1.62, 0.19]}>
            <boxGeometry args={[0.34, 0.1, 0.06]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.34} />
          </mesh>
          <mesh castShadow position={[-0.34, 1.02, 0]}>
            <boxGeometry args={[0.1, 0.34, 0.22]} />
            <meshStandardMaterial color="#1e293b" roughness={0.62} />
          </mesh>
        </>
      )}
    </group>
  );
};

const ForkliftAsset: React.FC<VariantAssetProps> = ({ variant, detail, scale }) => {
  const isHero = detail === 'hero';

  if (variant === 'current') {
    return (
      <group scale={scale}>
        <mesh castShadow receiveShadow position={[0, 0.68, 0]}>
          <boxGeometry args={[1.52, 1.02, 2.42]} />
          <meshStandardMaterial color="#f59e0b" metalness={0.36} roughness={0.54} />
        </mesh>
        <mesh castShadow position={[0, 1.44, -0.25]}>
          <boxGeometry args={[1.22, 0.84, 1.04]} />
          <meshStandardMaterial color="#1f2937" roughness={0.72} />
        </mesh>
        <mesh castShadow position={[0, 1.18, 1.28]}>
          <boxGeometry args={[0.82, 1.92, 0.16]} />
          <meshStandardMaterial color="#374151" metalness={0.7} roughness={0.26} />
        </mesh>
        {[-0.56, 0.56].flatMap((x) =>
          [-0.92, 0.92].map((z) => (
            <mesh
              key={`forklift-wheel-${x}-${z}`}
              castShadow
              position={[x, 0.16, z]}
              rotation={[0, 0, Math.PI / 2]}
            >
              <cylinderGeometry args={[0.28, 0.28, 0.28, 12]} />
              <meshStandardMaterial color="#111827" roughness={0.82} />
            </mesh>
          ))
        )}
      </group>
    );
  }

  return (
    <group scale={scale}>
      <mesh castShadow receiveShadow position={[0, 0.72, -0.08]}>
        <boxGeometry args={[1.64, 0.9, 2.24]} />
        <meshStandardMaterial color="#fb923c" metalness={0.32} roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0, 1.48, -0.45]}>
        <boxGeometry args={[1.24, 0.92, 1.08]} />
        <meshStandardMaterial color="#0f172a" roughness={0.6} />
      </mesh>
      <mesh castShadow position={[0, 2.02, -0.45]}>
        <boxGeometry args={[1.28, 0.12, 1.1]} />
        <meshStandardMaterial color="#334155" metalness={0.62} roughness={0.2} />
      </mesh>
      {[-0.46, 0.46].map((x) => (
        <mesh key={`forklift-mast-${x}`} castShadow position={[x, 1.35, 1.28]}>
          <boxGeometry args={[0.12, 2.32, 0.12]} />
          <meshStandardMaterial color="#1f2937" metalness={0.74} roughness={0.16} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 1.44, 1.2]}>
        <boxGeometry args={[0.98, 0.18, 0.12]} />
        <meshStandardMaterial color="#475569" metalness={0.74} roughness={0.16} />
      </mesh>
      {[-0.22, 0.22].map((x) => (
        <mesh key={`forklift-fork-${x}`} castShadow position={[x, 0.18, 1.92]}>
          <boxGeometry args={[0.14, 0.08, 1.32]} />
          <meshStandardMaterial color="#64748b" metalness={0.82} roughness={0.12} />
        </mesh>
      ))}
      {[-0.58, 0.58].flatMap((x) =>
        [-0.82, 0.88].map((z) => (
          <mesh
            key={`forklift-prototype-wheel-${x}-${z}`}
            castShadow
            position={[x, 0.18, z]}
            rotation={[0, 0, Math.PI / 2]}
          >
            <cylinderGeometry args={[0.3, 0.3, z < 0 ? 0.34 : 0.26, 14]} />
            <meshStandardMaterial color="#020617" roughness={0.85} />
          </mesh>
        ))
      )}
      {isHero && (
        <>
          <mesh castShadow position={[0, 1.06, -0.35]}>
            <boxGeometry args={[0.42, 0.16, 0.42]} />
            <meshStandardMaterial color="#1f2937" roughness={0.62} />
          </mesh>
          <mesh castShadow position={[-0.32, 1.32, -0.12]} rotation={[0.2, 0, -0.62]}>
            <boxGeometry args={[0.08, 0.54, 0.08]} />
            <meshStandardMaterial color="#334155" metalness={0.58} roughness={0.22} />
          </mesh>
          <mesh castShadow position={[0, 0.56, -1.08]}>
            <boxGeometry args={[1.18, 0.68, 0.34]} />
            <meshStandardMaterial color="#7c2d12" metalness={0.18} roughness={0.58} />
          </mesh>
          <mesh castShadow position={[0, 0.54, 1.9]}>
            <boxGeometry args={[1.2, 0.2, 1.18]} />
            <meshStandardMaterial color="#8b5a2b" roughness={0.8} />
          </mesh>
          <mesh castShadow position={[0, 1.04, 1.9]}>
            <boxGeometry args={[1.02, 0.82, 1.0]} />
            <meshStandardMaterial color="#fef3c7" roughness={0.72} />
          </mesh>
        </>
      )}
    </group>
  );
};

const PalletCargoAsset: React.FC<VariantAssetProps> = ({ variant, detail, scale }) => {
  const isHero = detail === 'hero';

  if (variant === 'current') {
    return (
      <group scale={scale}>
        <mesh castShadow receiveShadow position={[0, 0.18, 0]}>
          <boxGeometry args={[1.9, 0.22, 1.9]} />
          <meshStandardMaterial color="#8b5a2b" roughness={0.82} />
        </mesh>
        {[
          [-0.45, -0.45],
          [0.45, -0.45],
          [-0.45, 0.45],
          [0.45, 0.45],
        ].map(([x, z]) => (
          <mesh key={`bag-stack-${x}-${z}`} castShadow position={[x, 0.72, z]}>
            <boxGeometry args={[0.72, 0.58, 0.72]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.82} />
          </mesh>
        ))}
      </group>
    );
  }

  return (
    <group scale={scale}>
      <mesh castShadow receiveShadow position={[0, 0.18, 0]}>
        <boxGeometry args={[2.0, 0.22, 2.0]} />
        <meshStandardMaterial color="#8b5a2b" roughness={0.82} />
      </mesh>
      {[-0.64, 0, 0.64].map((x) => (
        <mesh key={`pallet-slat-${x}`} castShadow position={[x, 0.3, 0]}>
          <boxGeometry args={[0.18, 0.08, 1.92]} />
          <meshStandardMaterial color="#7c4a22" roughness={0.82} />
        </mesh>
      ))}
      {[
        [-0.42, 0.62, -0.42],
        [0.42, 0.62, -0.42],
        [-0.42, 0.62, 0.42],
        [0.42, 0.62, 0.42],
        [0, 1.14, 0],
      ].map(([x, y, z], index) => (
        <mesh key={`prototype-bag-${index}`} castShadow position={[x, y, z]}>
          <boxGeometry args={[0.76, 0.52, 0.76]} />
          <meshStandardMaterial color={index === 4 ? '#fef3c7' : '#f8fafc'} roughness={0.78} />
        </mesh>
      ))}
      {isHero && (
        <>
          <mesh position={[0, 0.82, 0]} rotation={[0, Math.PI / 4, 0]}>
            <boxGeometry args={[1.86, 1.34, 1.86]} />
            <meshPhysicalMaterial
              color="#ffffff"
              transparent
              opacity={0.12}
              roughness={0.08}
              transmission={0.14}
            />
          </mesh>
          {[-0.7, 0.7].map((x) => (
            <mesh key={`pallet-strap-${x}`} position={[x, 0.82, 0]}>
              <boxGeometry args={[0.06, 1.42, 1.9]} />
              <meshStandardMaterial color="#c084fc" metalness={0.2} roughness={0.42} />
            </mesh>
          ))}
        </>
      )}
    </group>
  );
};

const UtilityTowerAsset: React.FC<VariantAssetProps> = ({ variant, detail, scale }) => {
  const isHero = detail === 'hero';

  if (variant === 'current') {
    return (
      <group scale={scale}>
        <mesh castShadow receiveShadow position={[0, 2.1, 0]}>
          <boxGeometry args={[2.4, 4.2, 2.0]} />
          <meshStandardMaterial color="#334155" roughness={0.78} metalness={0.2} />
        </mesh>
        <mesh castShadow position={[0, 0.9, 1.02]}>
          <boxGeometry args={[0.86, 1.72, 0.08]} />
          <meshStandardMaterial color="#0f172a" roughness={0.48} />
        </mesh>
        <mesh castShadow position={[0, 4.42, 0]}>
          <boxGeometry args={[2.56, 0.2, 2.1]} />
          <meshStandardMaterial color="#1f2937" metalness={0.32} roughness={0.46} />
        </mesh>
      </group>
    );
  }

  return (
    <group scale={scale}>
      <mesh castShadow receiveShadow position={[0, 2.0, 0]}>
        <boxGeometry args={[2.08, 4.0, 1.72]} />
        <meshStandardMaterial color="#1e293b" roughness={0.68} metalness={0.22} />
      </mesh>
      <mesh castShadow position={[0, 4.18, 0]}>
        <boxGeometry args={[3.1, 0.18, 2.24]} />
        <meshStandardMaterial color="#334155" metalness={0.44} roughness={0.36} />
      </mesh>
      <mesh castShadow position={[0.92, 2.65, 1.05]}>
        <boxGeometry args={[0.24, 3.0, 0.12]} />
        <meshStandardMaterial color="#a3e635" metalness={0.28} roughness={0.5} />
      </mesh>
      {isHero &&
        Array.from({ length: 7 }, (_, index) => (
          <mesh key={`tower-rung-${index}`} position={[0.92, 1.35 + index * 0.34, 1.13]}>
            <boxGeometry args={[0.42, 0.05, 0.05]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.3} metalness={0.2} />
          </mesh>
        ))}
      <mesh castShadow position={[0, 5.08, -0.1]}>
        <cylinderGeometry args={[0.54, 0.6, 0.62, isHero ? 16 : 10]} />
        <meshStandardMaterial color="#0f172a" roughness={0.36} metalness={0.36} />
      </mesh>
      <mesh castShadow position={[-1.35, 2.55, 0]}>
        <boxGeometry args={[0.42, 2.4, 0.32]} />
        <meshStandardMaterial color="#334155" roughness={0.62} metalness={0.24} />
      </mesh>
      <mesh castShadow position={[-1.05, 3.25, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.12, 0.12, 1.6, 12]} />
        <meshStandardMaterial color="#67e8f9" metalness={0.55} roughness={0.26} />
      </mesh>
      {isHero && (
        <>
          <mesh castShadow position={[0, 3.55, 1.0]}>
            <boxGeometry args={[1.48, 0.16, 0.34]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.42} roughness={0.28} />
          </mesh>
          <mesh castShadow position={[0, 3.95, 1.0]}>
            <boxGeometry args={[0.08, 0.72, 0.08]} />
            <meshStandardMaterial color="#7dd3fc" metalness={0.42} roughness={0.26} />
          </mesh>
        </>
      )}
    </group>
  );
};

const FactoryShellAsset: React.FC<VariantAssetProps> = ({ variant, detail, scale }) => {
  const isHero = detail === 'hero';

  if (variant === 'current') {
    return (
      <group scale={scale}>
        <mesh castShadow receiveShadow position={[0, 2.4, 0]}>
          <boxGeometry args={[5.8, 4.8, 3.2]} />
          <meshStandardMaterial color="#334155" roughness={0.78} metalness={0.14} />
        </mesh>
        <mesh castShadow position={[0, 5.05, 0]}>
          <boxGeometry args={[6.1, 0.3, 3.4]} />
          <meshStandardMaterial color="#1e293b" roughness={0.48} metalness={0.3} />
        </mesh>
        <mesh castShadow position={[0, 1.3, 1.64]}>
          <boxGeometry args={[1.4, 2.3, 0.12]} />
          <meshStandardMaterial color="#0f172a" roughness={0.42} />
        </mesh>
      </group>
    );
  }

  return (
    <group scale={scale}>
      <mesh castShadow receiveShadow position={[0, 2.2, 0]}>
        <boxGeometry args={[5.2, 4.4, 2.9]} />
        <meshStandardMaterial color="#dbeafe" roughness={0.56} metalness={0.12} />
      </mesh>
      <mesh castShadow position={[-1.05, 4.15, 0]}>
        <boxGeometry args={[2.3, 1.25, 2.2]} />
        <meshStandardMaterial color="#bfdbfe" roughness={0.42} metalness={0.16} />
      </mesh>
      <mesh castShadow position={[1.9, 1.25, 1.56]}>
        <boxGeometry args={[1.15, 1.8, 0.22]} />
        <meshStandardMaterial color="#475569" roughness={0.34} metalness={0.26} />
      </mesh>
      <mesh castShadow position={[1.9, 2.22, 1.72]}>
        <boxGeometry args={[1.65, 0.16, 0.82]} />
        <meshStandardMaterial color="#60a5fa" roughness={0.22} metalness={0.24} />
      </mesh>
      {isHero &&
        [-1.6, -0.6, 0.4, 1.4].map((x) => (
          <mesh key={`factory-glass-${x}`} position={[x, 2.75, 1.48]}>
            <boxGeometry args={[0.62, 1.7, 0.08]} />
            <meshStandardMaterial color="#bae6fd" roughness={0.08} metalness={0.18} />
          </mesh>
        ))}
    </group>
  );
};

const GrainElevatorAsset: React.FC<VariantAssetProps> = ({ variant, detail, scale }) => {
  const isHero = detail === 'hero';

  if (variant === 'current') {
    return (
      <group scale={scale}>
        <mesh castShadow receiveShadow position={[0, 3.4, 0]}>
          <boxGeometry args={[1.8, 6.8, 1.9]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.66} metalness={0.22} />
        </mesh>
        {[-1.4, 1.4].map((x) => (
          <mesh key={`elevator-bin-${x}`} castShadow position={[x, 2.2, 0]}>
            <cylinderGeometry args={[0.82, 0.82, 4.4, isHero ? 18 : 10]} />
            <meshStandardMaterial color="#a3b1c6" roughness={0.52} metalness={0.26} />
          </mesh>
        ))}
      </group>
    );
  }

  return (
    <group scale={scale}>
      {[-1.8, -0.6, 0.6, 1.8].map((x) => (
        <mesh key={`elevator-prototype-bin-${x}`} castShadow position={[x, 2.1, 0]}>
          <cylinderGeometry args={[0.68, 0.74, 4.2, isHero ? 20 : 12]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.42} metalness={0.3} />
        </mesh>
      ))}
      <mesh castShadow receiveShadow position={[0, 4.45, -0.4]}>
        <boxGeometry args={[2.3, 4.1, 1.55]} />
        <meshStandardMaterial color="#1e293b" roughness={0.42} metalness={0.22} />
      </mesh>
      <mesh castShadow position={[0, 6.7, -0.4]}>
        <boxGeometry args={[2.8, 0.26, 1.72]} />
        <meshStandardMaterial color="#60a5fa" roughness={0.26} metalness={0.22} />
      </mesh>
      {isHero && (
        <>
          <mesh castShadow position={[1.25, 3.75, 0.72]}>
            <boxGeometry args={[0.18, 3.2, 0.12]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.3} metalness={0.2} />
          </mesh>
          <mesh castShadow position={[0, 5.35, 0.72]}>
            <boxGeometry args={[2.55, 0.14, 0.22]} />
            <meshStandardMaterial color="#475569" roughness={0.26} metalness={0.24} />
          </mesh>
        </>
      )}
    </group>
  );
};

const ConveyorBridgeAsset: React.FC<VariantAssetProps> = ({ variant, detail, scale }) => {
  const isHero = detail === 'hero';

  if (variant === 'current') {
    return (
      <group scale={scale}>
        <mesh castShadow receiveShadow position={[0, 1.8, 0]}>
          <boxGeometry args={[5.4, 0.54, 1.2]} />
          <meshStandardMaterial color="#374151" roughness={0.46} metalness={0.34} />
        </mesh>
        {[-2, 2].map((x) => (
          <mesh key={`bridge-support-${x}`} castShadow position={[x, 0.8, 0]}>
            <boxGeometry args={[0.22, 1.6, 0.22]} />
            <meshStandardMaterial color="#475569" roughness={0.42} metalness={0.3} />
          </mesh>
        ))}
      </group>
    );
  }

  return (
    <group scale={scale}>
      <mesh castShadow receiveShadow position={[0, 1.82, 0]}>
        <boxGeometry args={[5.1, 0.28, 0.96]} />
        <meshStandardMaterial color="#0f172a" roughness={0.34} metalness={0.38} />
      </mesh>
      {[-2.15, -1.05, 0, 1.05, 2.15].map((x) => (
        <mesh
          key={`bridge-truss-top-${x}`}
          castShadow
          position={[x, 2.35, 0.46]}
          rotation={[0, 0, Math.PI / 4]}
        >
          <boxGeometry args={[0.12, 0.76, 0.08]} />
          <meshStandardMaterial color="#67e8f9" roughness={0.24} metalness={0.34} />
        </mesh>
      ))}
      {[-2.15, -1.05, 0, 1.05, 2.15].map((x) => (
        <mesh
          key={`bridge-truss-bottom-${x}`}
          castShadow
          position={[x, 1.3, 0.46]}
          rotation={[0, 0, -Math.PI / 4]}
        >
          <boxGeometry args={[0.12, 0.76, 0.08]} />
          <meshStandardMaterial color="#67e8f9" roughness={0.24} metalness={0.34} />
        </mesh>
      ))}
      {[-2, 2].map((x) => (
        <mesh key={`bridge-prototype-support-${x}`} castShadow position={[x, 0.8, 0]}>
          <boxGeometry args={[0.24, 1.6, 0.24]} />
          <meshStandardMaterial color="#1e293b" roughness={0.3} metalness={0.34} />
        </mesh>
      ))}
      {isHero && (
        <mesh castShadow position={[0, 2.62, -0.54]}>
          <boxGeometry args={[4.8, 0.08, 0.16]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.24} metalness={0.18} />
        </mesh>
      )}
    </group>
  );
};

const TruckBayAsset: React.FC<VariantAssetProps> = ({ variant, detail, scale }) => {
  const isHero = detail === 'hero';

  if (variant === 'current') {
    return (
      <group scale={scale}>
        <mesh castShadow receiveShadow position={[0, 0.2, 0]}>
          <boxGeometry args={[5.2, 0.4, 3.2]} />
          <meshStandardMaterial color="#374151" roughness={0.74} metalness={0.12} />
        </mesh>
        <mesh castShadow position={[0, 2.2, -1.38]}>
          <boxGeometry args={[4.8, 4.0, 0.22]} />
          <meshStandardMaterial color="#475569" roughness={0.58} metalness={0.12} />
        </mesh>
      </group>
    );
  }

  return (
    <group scale={scale}>
      <mesh castShadow receiveShadow position={[0, 0.16, 0]}>
        <boxGeometry args={[5.6, 0.32, 3.4]} />
        <meshStandardMaterial color="#1f2937" roughness={0.7} metalness={0.12} />
      </mesh>
      <mesh castShadow position={[0, 2.15, -1.45]}>
        <boxGeometry args={[5.0, 3.9, 0.24]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.52} metalness={0.1} />
      </mesh>
      <mesh castShadow position={[0, 3.35, -0.28]}>
        <boxGeometry args={[3.2, 0.18, 2.3]} />
        <meshStandardMaterial color="#0f172a" roughness={0.28} metalness={0.26} />
      </mesh>
      {[-1.1, 1.1].map((x) => (
        <mesh key={`dock-bumper-${x}`} castShadow position={[x, 0.74, -1.18]}>
          <boxGeometry args={[0.36, 0.74, 0.24]} />
          <meshStandardMaterial color="#111827" roughness={0.42} />
        </mesh>
      ))}
      {isHero &&
        [-1.6, 0, 1.6].map((x) => (
          <mesh key={`dock-mark-${x}`} position={[x, 0.18, 0.92]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.32, 1.7]} />
            <meshBasicMaterial color="#fbbf24" transparent opacity={0.55} />
          </mesh>
        ))}
    </group>
  );
};

const FreightTruckAsset: React.FC<VariantAssetProps> = ({ variant, detail, scale }) => {
  const isHero = detail === 'hero';

  if (variant === 'current') {
    return (
      <group scale={scale}>
        <mesh castShadow receiveShadow position={[0, 0.78, 0]}>
          <boxGeometry args={[5.4, 1.56, 1.9]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.58} metalness={0.16} />
        </mesh>
        <mesh castShadow position={[-2.1, 0.92, 0]}>
          <boxGeometry args={[1.5, 1.82, 1.8]} />
          <meshStandardMaterial color="#fb923c" roughness={0.5} metalness={0.16} />
        </mesh>
        {[-2.2, -0.9, 1.1, 2.4].map((x) => (
          <mesh
            key={`truck-wheel-${x}`}
            castShadow
            position={[x, 0.2, 0]}
            rotation={[0, 0, Math.PI / 2]}
          >
            <cylinderGeometry args={[0.34, 0.34, 0.26, 14]} />
            <meshStandardMaterial color="#020617" roughness={0.82} />
          </mesh>
        ))}
      </group>
    );
  }

  return (
    <group scale={scale}>
      <mesh castShadow receiveShadow position={[0.55, 0.76, 0]}>
        <boxGeometry args={[5.0, 1.46, 1.78]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.42} metalness={0.14} />
      </mesh>
      <mesh castShadow position={[-2.35, 0.98, 0]}>
        <boxGeometry args={[1.7, 1.64, 1.72]} />
        <meshStandardMaterial color="#f59e0b" roughness={0.42} metalness={0.18} />
      </mesh>
      <mesh castShadow position={[-2.05, 1.52, 0.66]} rotation={[0.2, 0, 0]}>
        <boxGeometry args={[1.2, 0.42, 0.14]} />
        <meshStandardMaterial color="#0f172a" roughness={0.36} />
      </mesh>
      <mesh castShadow position={[-1.25, 0.56, 0]}>
        <boxGeometry args={[0.82, 0.18, 1.74]} />
        <meshStandardMaterial color="#1f2937" roughness={0.38} metalness={0.28} />
      </mesh>
      {[-2.35, -1.25, 0.4, 1.6, 2.8].map((x) => (
        <mesh
          key={`truck-prototype-wheel-${x}`}
          castShadow
          position={[x, 0.2, 0]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[0.34, 0.34, x > 0.9 ? 0.22 : 0.28, 14]} />
          <meshStandardMaterial color="#020617" roughness={0.82} />
        </mesh>
      ))}
      {isHero && (
        <>
          <mesh castShadow position={[1.7, 1.25, 0.92]}>
            <boxGeometry args={[0.14, 0.34, 0.14]} />
            <meshStandardMaterial color="#ef4444" roughness={0.2} metalness={0.12} />
          </mesh>
          <mesh castShadow position={[1.7, 1.25, -0.92]}>
            <boxGeometry args={[0.14, 0.34, 0.14]} />
            <meshStandardMaterial color="#ef4444" roughness={0.2} metalness={0.12} />
          </mesh>
        </>
      )}
    </group>
  );
};

const SupportOfficeAsset: React.FC<VariantAssetProps> = ({ variant, detail, scale }) => {
  const isHero = detail === 'hero';

  if (variant === 'current') {
    return (
      <group scale={scale}>
        <mesh castShadow receiveShadow position={[0, 1.9, 0]}>
          <boxGeometry args={[3.2, 3.8, 2.6]} />
          <meshStandardMaterial color="#78909c" roughness={0.74} />
        </mesh>
        <mesh castShadow position={[0, 4.0, 0]}>
          <boxGeometry args={[3.5, 0.24, 2.9]} />
          <meshStandardMaterial color="#546e7a" roughness={0.58} />
        </mesh>
      </group>
    );
  }

  return (
    <group scale={scale}>
      <mesh castShadow receiveShadow position={[-0.38, 2.0, 0]}>
        <boxGeometry args={[2.9, 4.0, 2.2]} />
        <meshStandardMaterial color="#dbeafe" roughness={0.62} metalness={0.08} />
      </mesh>
      <mesh castShadow position={[1.5, 1.3, 0]}>
        <boxGeometry args={[1.55, 2.6, 1.8]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.62} metalness={0.08} />
      </mesh>
      <mesh castShadow position={[0.84, 0.92, 1.16]}>
        <boxGeometry args={[1.9, 0.16, 0.76]} />
        <meshStandardMaterial color="#38bdf8" roughness={0.22} metalness={0.18} />
      </mesh>
      {isHero &&
        [-1.0, -0.2, 0.6].map((x) => (
          <mesh key={`office-window-${x}`} position={[x, 2.25, 1.12]}>
            <boxGeometry args={[0.52, 1.34, 0.08]} />
            <meshStandardMaterial color="#bae6fd" roughness={0.08} metalness={0.14} />
          </mesh>
        ))}
    </group>
  );
};

const GasStationAsset: React.FC<VariantAssetProps> = ({ variant, detail, scale }) => {
  const isHero = detail === 'hero';

  if (variant === 'current') {
    return (
      <group scale={scale}>
        <mesh castShadow receiveShadow position={[0, 2.1, 0]}>
          <boxGeometry args={[4.4, 0.24, 2.8]} />
          <meshStandardMaterial color="#475569" roughness={0.56} metalness={0.18} />
        </mesh>
        {[-1.0, 1.0].map((x) => (
          <mesh key={`pump-${x}`} castShadow position={[x, 0.7, 0]}>
            <boxGeometry args={[0.44, 1.4, 0.44]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.68} />
          </mesh>
        ))}
      </group>
    );
  }

  return (
    <group scale={scale}>
      <mesh castShadow receiveShadow position={[0, 2.3, 0]}>
        <boxGeometry args={[5.0, 0.22, 3.0]} />
        <meshStandardMaterial color="#0f172a" roughness={0.28} metalness={0.22} />
      </mesh>
      {[-1.8, 1.8].map((x) => (
        <mesh key={`station-column-${x}`} castShadow position={[x, 1.05, 0]}>
          <boxGeometry args={[0.18, 2.1, 0.18]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.18} metalness={0.16} />
        </mesh>
      ))}
      <mesh castShadow receiveShadow position={[0, 0.88, -1.45]}>
        <boxGeometry args={[2.0, 1.76, 0.9]} />
        <meshStandardMaterial color="#1e293b" roughness={0.48} metalness={0.16} />
      </mesh>
      {[-1.0, 0, 1.0].map((x) => (
        <mesh key={`station-pump-${x}`} castShadow position={[x, 0.72, 0.4]}>
          <boxGeometry args={[0.42, 1.44, 0.46]} />
          <meshStandardMaterial color={x === 0 ? '#34d399' : '#f8fafc'} roughness={0.54} />
        </mesh>
      ))}
      {isHero && (
        <mesh castShadow position={[0, 2.48, 1.18]}>
          <boxGeometry args={[4.6, 0.18, 0.3]} />
          <meshStandardMaterial color="#34d399" roughness={0.22} metalness={0.16} />
        </mesh>
      )}
    </group>
  );
};

const FarmBarnAsset: React.FC<VariantAssetProps> = ({ variant, detail, scale }) => {
  const isHero = detail === 'hero';

  if (variant === 'current') {
    return (
      <group scale={scale}>
        <mesh castShadow receiveShadow position={[0, 1.8, 0]}>
          <boxGeometry args={[3.4, 3.6, 2.8]} />
          <meshStandardMaterial color="#8b2323" roughness={0.86} />
        </mesh>
        <mesh castShadow position={[0, 4.0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.16, 0.16, 3.7, 3]} />
          <meshStandardMaterial color="#4a4a4a" roughness={0.72} />
        </mesh>
      </group>
    );
  }

  return (
    <group scale={scale}>
      <mesh castShadow receiveShadow position={[-0.18, 1.9, 0]}>
        <boxGeometry args={[3.3, 3.8, 2.6]} />
        <meshStandardMaterial color="#991b1b" roughness={0.8} />
      </mesh>
      <mesh castShadow position={[-0.18, 4.1, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.18, 0.18, 3.9, 3]} />
        <meshStandardMaterial color="#4a4a4a" roughness={0.62} />
      </mesh>
      <mesh castShadow receiveShadow position={[1.7, 1.25, 0]}>
        <boxGeometry args={[1.4, 2.5, 1.8]} />
        <meshStandardMaterial color="#7f1d1d" roughness={0.82} />
      </mesh>
      {isHero && (
        <>
          <mesh castShadow position={[-0.18, 2.0, 1.34]}>
            <boxGeometry args={[1.1, 1.9, 0.08]} />
            <meshStandardMaterial color="#5d4037" roughness={0.86} />
          </mesh>
          <mesh castShadow position={[-0.18, 3.2, 1.38]}>
            <boxGeometry args={[0.88, 0.88, 0.06]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.48} />
          </mesh>
        </>
      )}
    </group>
  );
};

const WindmillAsset: React.FC<VariantAssetProps> = ({ variant, detail, scale }) => {
  const isHero = detail === 'hero';

  if (variant === 'current') {
    return (
      <group scale={scale}>
        <mesh castShadow receiveShadow position={[0, 3.0, 0]}>
          <cylinderGeometry args={[0.7, 1.0, 6.0, 8]} />
          <meshStandardMaterial color="#d6d3d1" roughness={0.82} />
        </mesh>
        <mesh castShadow position={[0, 6.8, 0]}>
          <coneGeometry args={[0.92, 1.4, 8]} />
          <meshStandardMaterial color="#7c2d12" roughness={0.62} />
        </mesh>
        {['x', 'z'].map((axis) => (
          <mesh
            key={axis}
            castShadow
            position={[0, 6.6, 0]}
            rotation={[axis === 'x' ? Math.PI / 2 : 0, 0, axis === 'z' ? Math.PI / 2 : 0]}
          >
            <boxGeometry args={[0.12, 3.6, 0.12]} />
            <meshStandardMaterial color="#8b5a2b" roughness={0.78} />
          </mesh>
        ))}
      </group>
    );
  }

  return (
    <group scale={scale}>
      <mesh castShadow receiveShadow position={[0, 3.15, 0]}>
        <cylinderGeometry args={[0.58, 0.98, 6.3, 10]} />
        <meshStandardMaterial color="#f5f5f4" roughness={0.74} />
      </mesh>
      <mesh castShadow position={[0, 6.95, 0]}>
        <coneGeometry args={[0.96, 1.5, 10]} />
        <meshStandardMaterial color="#78350f" roughness={0.58} />
      </mesh>
      <mesh castShadow position={[0, 5.18, 0.86]}>
        <boxGeometry args={[1.4, 0.12, 0.28]} />
        <meshStandardMaterial color="#475569" roughness={0.34} metalness={0.18} />
      </mesh>
      {[
        [0, 0, 0],
        [0, 0, Math.PI / 2],
      ].map((rotation, index) => (
        <group
          key={`windmill-sail-${index}`}
          position={[0, 6.7, 0]}
          rotation={rotation as [number, number, number]}
        >
          <mesh castShadow>
            <boxGeometry args={[0.1, 4.2, 0.1]} />
            <meshStandardMaterial color="#8b5a2b" roughness={0.72} />
          </mesh>
          {isHero && (
            <mesh castShadow position={[0, 1.15, 0.04]}>
              <boxGeometry args={[0.62, 2.3, 0.04]} />
              <meshStandardMaterial color="#fef3c7" roughness={0.82} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
};

const VillageHouseAsset: React.FC<VariantAssetProps> = ({ variant, detail, scale }) => {
  const isHero = detail === 'hero';

  if (variant === 'current') {
    return (
      <group scale={scale}>
        <mesh castShadow receiveShadow position={[0, 1.55, 0]}>
          <boxGeometry args={[2.5, 3.1, 2.0]} />
          <meshStandardMaterial color="#fce7e7" roughness={0.82} />
        </mesh>
        <mesh castShadow position={[0, 3.5, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.16, 0.16, 2.7, 3]} />
          <meshStandardMaterial color="#c2410c" roughness={0.74} />
        </mesh>
      </group>
    );
  }

  return (
    <group scale={scale}>
      <mesh castShadow receiveShadow position={[-0.24, 1.65, 0]}>
        <boxGeometry args={[2.1, 3.3, 1.8]} />
        <meshStandardMaterial color="#fdf2f8" roughness={0.78} />
      </mesh>
      <mesh castShadow receiveShadow position={[1.12, 1.15, 0]}>
        <boxGeometry args={[1.1, 2.3, 1.44]} />
        <meshStandardMaterial color="#dbeafe" roughness={0.76} />
      </mesh>
      <mesh castShadow position={[-0.24, 3.68, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.18, 0.18, 2.38, 3]} />
        <meshStandardMaterial color="#ea580c" roughness={0.7} />
      </mesh>
      <mesh castShadow position={[1.12, 2.62, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.16, 0.16, 1.4, 3]} />
        <meshStandardMaterial color="#475569" roughness={0.62} />
      </mesh>
      {isHero &&
        [-0.7, 0, 0.7].map((x) => (
          <mesh key={`house-window-${x}`} position={[x, 1.9, 0.94]}>
            <boxGeometry args={[0.42, 0.78, 0.08]} />
            <meshStandardMaterial color="#93c5fd" roughness={0.12} metalness={0.12} />
          </mesh>
        ))}
    </group>
  );
};

const TownHallAsset: React.FC<VariantAssetProps> = ({ variant, detail, scale }) => {
  const isHero = detail === 'hero';

  if (variant === 'current') {
    return (
      <group scale={scale}>
        <mesh castShadow receiveShadow position={[0, 1.9, 0]}>
          <boxGeometry args={[3.8, 3.8, 2.5]} />
          <meshStandardMaterial color="#e5e7eb" roughness={0.78} />
        </mesh>
        <mesh castShadow position={[0, 4.4, 0]}>
          <boxGeometry args={[1.2, 1.8, 1.2]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.54} />
        </mesh>
      </group>
    );
  }

  return (
    <group scale={scale}>
      <mesh castShadow receiveShadow position={[0, 1.75, 0]}>
        <boxGeometry args={[3.6, 3.5, 2.3]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.72} />
      </mesh>
      <mesh castShadow position={[0, 4.28, 0]}>
        <boxGeometry args={[1.3, 2.2, 1.3]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.48} />
      </mesh>
      <mesh castShadow position={[0, 5.82, 0]}>
        <coneGeometry args={[0.96, 1.42, 8]} />
        <meshStandardMaterial color="#475569" roughness={0.52} />
      </mesh>
      {isHero && (
        <>
          <mesh position={[0, 4.56, 0.68]}>
            <cylinderGeometry args={[0.28, 0.28, 0.08, 18]} />
            <meshStandardMaterial color="#e0f2fe" roughness={0.18} metalness={0.08} />
          </mesh>
          {[-1.1, 0, 1.1].map((x) => (
            <mesh key={`hall-arcade-${x}`} position={[x, 0.9, 1.16]}>
              <boxGeometry args={[0.52, 1.6, 0.08]} />
              <meshStandardMaterial color="#0f172a" roughness={0.42} />
            </mesh>
          ))}
        </>
      )}
    </group>
  );
};

const CanalBoatAsset: React.FC<VariantAssetProps> = ({ variant, detail, scale }) => {
  const isHero = detail === 'hero';

  if (variant === 'current') {
    return (
      <group scale={scale}>
        <mesh castShadow receiveShadow position={[0, 0.4, 0]}>
          <boxGeometry args={[4.2, 0.5, 1.4]} />
          <meshStandardMaterial color="#475569" roughness={0.52} />
        </mesh>
      </group>
    );
  }

  return (
    <group scale={scale}>
      <mesh castShadow receiveShadow position={[0, 0.42, 0]}>
        <boxGeometry args={[4.4, 0.44, 1.34]} />
        <meshStandardMaterial color="#0f172a" roughness={0.34} metalness={0.2} />
      </mesh>
      <mesh castShadow position={[0, 0.72, 0]}>
        <boxGeometry args={[3.9, 0.16, 1.12]} />
        <meshStandardMaterial color="#1e293b" roughness={0.34} metalness={0.2} />
      </mesh>
      <mesh castShadow receiveShadow position={[1.32, 0.98, 0]}>
        <boxGeometry args={[1.1, 0.9, 0.9]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.42} metalness={0.12} />
      </mesh>
      {isHero && (
        <>
          <mesh castShadow position={[-0.78, 0.96, 0]}>
            <boxGeometry args={[1.6, 0.62, 0.86]} />
            <meshStandardMaterial color="#fef3c7" roughness={0.72} />
          </mesh>
          <mesh castShadow position={[1.82, 1.52, 0]}>
            <cylinderGeometry args={[0.08, 0.08, 0.72, 10]} />
            <meshStandardMaterial color="#64748b" roughness={0.24} metalness={0.22} />
          </mesh>
        </>
      )}
    </group>
  );
};

export default AssetPrototypePage;
