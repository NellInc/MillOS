import type { PolygonOffsetPreset, RenderOrderLayer } from './renderLayers';

export type DepthClassification =
  | 'ground-layer'
  | 'decal'
  | 'transparent-overlay'
  | 'water-edge'
  | 'wall-label'
  | 'shadow-artifact'
  | 'camera-depth';

export type DepthValidationCamera =
  | 'overview'
  | 'interior'
  | 'shipping'
  | 'receiving'
  | 'yard'
  | 'high-angle'
  | 'water-level'
  | 'first-person';

export interface DepthRegistryEntry {
  readonly id: string;
  readonly owner: string;
  readonly classification: DepthClassification;
  readonly surfaces: readonly string[];
  readonly repair: string;
  readonly validationCameras: readonly DepthValidationCamera[];
  readonly polygonOffset?: PolygonOffsetPreset;
  readonly renderOrder?: RenderOrderLayer;
  readonly depthWrite: boolean;
  readonly status: 'resolved';
}

/**
 * Finite registry for the active low and medium scene.
 *
 * This is deliberately a list of confirmed overlap relationships, rather than
 * every small Y value in the repository. Detailed high-tier components remain
 * subject to the visual depth matrix when they mount.
 */
export const DEPTH_REGISTRY: readonly DepthRegistryEntry[] = [
  {
    id: 'interior-slab-and-markings',
    owner: 'OptimizedFactoryInfrastructure',
    classification: 'decal',
    surfaces: ['interior slab', 'safety lanes', 'portal threshold markings'],
    repair:
      'Physical slab at the interior datum, markings on named floor layers with standard bias.',
    validationCameras: ['interior', 'shipping', 'receiving', 'high-angle'],
    polygonOffset: 'standard',
    renderOrder: 'floorMarkings',
    depthWrite: false,
    status: 'resolved',
  },
  {
    id: 'exterior-ground-stack',
    // `exterior/OptimizedExterior.tsx` is imported by nothing; these are the
    // live owners of the coplanar ground surfaces.
    owner: 'TerrainGround, TruckBay (truckbay/yardSurfaces) and FactoryExterior',
    classification: 'ground-layer',
    surfaces: ['grass', 'yard asphalt', 'roads', 'farm plots', 'paths'],
    repair:
      'Coplanar solid surfaces share the ground datum and declare a named bias: terrain exteriorBase, turnaround exteriorMid, truck yard explicitly unbiased, apron and roads exteriorTop or moderate.',
    validationCameras: ['overview', 'yard', 'shipping', 'receiving', 'high-angle'],
    polygonOffset: 'exteriorBase',
    depthWrite: true,
    status: 'resolved',
  },
  {
    id: 'yard-road-markings',
    owner: 'TruckBay and FactoryExterior',
    classification: 'decal',
    surfaces: ['lane centres', 'parking guides', 'crossings', 'stop bars'],
    repair: 'Markings use the ground overlay datum, exteriorOverlay bias, and no depth writes.',
    validationCameras: ['yard', 'shipping', 'receiving', 'high-angle'],
    polygonOffset: 'exteriorOverlay',
    renderOrder: 'floorMarkings',
    depthWrite: false,
    status: 'resolved',
  },
  {
    id: 'dock-guides-and-apron',
    owner: 'TruckBay (truckbay/dockApronLayout)',
    classification: 'decal',
    surfaces: ['dock apron', 'bay guides', 'vehicle channel'],
    repair: 'Dock guides use the named truck marking layer and exterior overlay bias.',
    validationCameras: ['shipping', 'receiving', 'high-angle'],
    polygonOffset: 'exteriorOverlay',
    renderOrder: 'floorMarkings',
    depthWrite: false,
    status: 'resolved',
  },
  {
    id: 'water-bed-and-surface',
    owner: 'FactoryExterior water features (Canal, River, outlet) and TerrainGround',
    classification: 'water-edge',
    surfaces: ['canal bed', 'river bed', 'lake bed', 'water surfaces'],
    repair: 'Opaque beds use the terrain datum; transparent water uses the named water datum.',
    validationCameras: ['overview', 'yard', 'high-angle', 'water-level'],
    renderOrder: 'waterSurface',
    depthWrite: false,
    status: 'resolved',
  },
  {
    id: 'water-bank-intersections',
    owner: 'FactoryExterior water features (Canal, River, outlet) and TerrainGround',
    classification: 'water-edge',
    surfaces: ['canal walls', 'river banks', 'lake ring', 'water surfaces'],
    repair: 'Banks physically straddle the water datum while water remains one transparent layer.',
    validationCameras: ['overview', 'high-angle', 'water-level'],
    renderOrder: 'waterSurface',
    depthWrite: false,
    status: 'resolved',
  },
  {
    // Replaces the former `machine-status-rings` entry, which described a
    // relationship that no longer exists in the shipping scene. `StatusRing.tsx`
    // is reachable only from `Machines.tsx` and the `Instanced*.tsx` tree, and
    // nothing imports `Machines.tsx` - statically or through the lazy `import()`
    // chain in `MillScene.tsx`. `CompactMachines` renders the machines instead,
    // and its only ring (`siloRingRef`) is an OPAQUE shadow-casting stiffener
    // band, not an indicator. The live overlap on a machine body is the placard.
    id: 'machine-face-decals',
    owner: 'CompactMachines via machineDecals',
    classification: 'decal',
    surfaces: [
      'machine body faces',
      'recessed service panels',
      'silo hatch cover',
      'placard quads',
    ],
    repair:
      'Placards stand off the face they mark by the named machine surface layers and carry moderate bias. They stay in the OPAQUE pass via alphaTest, so they write depth and need no render order.',
    validationCameras: ['interior', 'high-angle', 'first-person'],
    polygonOffset: 'moderate',
    depthWrite: true,
    status: 'resolved',
  },
  {
    id: 'vehicle-glazing',
    owner: 'OptimizedTruckBay and ForkliftModel',
    classification: 'transparent-overlay',
    surfaces: ['cab interior meshes', 'windscreen', 'side panes', 'forklift canopy glass'],
    repair:
      'Panes use the named vehicle glass order so an animating cab cannot swap a pane against the interior behind it, and never write depth.',
    validationCameras: ['shipping', 'receiving', 'yard', 'first-person'],
    renderOrder: 'vehicleGlass',
    depthWrite: false,
    status: 'resolved',
  },
  {
    id: 'forklift-debug-routes',
    owner: 'ForkliftSystem',
    classification: 'transparent-overlay',
    surfaces: ['interior slab', 'route line', 'waypoint rings'],
    repair: 'Routes are opt-in, use the path preview height, and do not write depth.',
    validationCameras: ['interior', 'high-angle', 'first-person'],
    polygonOffset: 'standard',
    renderOrder: 'dynamicOverlay',
    depthWrite: false,
    status: 'resolved',
  },
  {
    id: 'fire-drill-exit-rings',
    owner: 'MillScene.FireDrillExitMarkers',
    classification: 'transparent-overlay',
    surfaces: ['floor or yard', 'exit ring', 'exit label'],
    repair: 'Exit rings use the exit indicator datum, named bias, and no depth writes.',
    validationCameras: ['interior', 'shipping', 'receiving', 'first-person'],
    polygonOffset: 'standard',
    renderOrder: 'exitIndicator',
    depthWrite: false,
    status: 'resolved',
  },
  {
    id: 'factory-upper-cladding',
    owner: 'OptimizedFactoryInfrastructure',
    classification: 'transparent-overlay',
    surfaces: ['structural frame', 'opaque cladding', 'large window glazing', 'portal openings'],
    repair:
      'Opaque wall bands and thin glazed bays occupy real openings; transparent glazing does not write depth or sit over solid wall faces.',
    validationCameras: ['overview', 'interior', 'shipping', 'receiving', 'yard'],
    depthWrite: false,
    status: 'resolved',
  },
  {
    id: 'horizon-depth',
    owner: 'OptimizedSkySystem',
    classification: 'camera-depth',
    surfaces: ['local world', 'mountain rings', 'camera-centred sky'],
    repair: 'Normal cameras use a 0.5 to 360 metre range; the sky is camera-centred and depthless.',
    validationCameras: ['overview', 'yard', 'shipping', 'receiving'],
    renderOrder: 'skyDome',
    depthWrite: false,
    status: 'resolved',
  },
] as const;
