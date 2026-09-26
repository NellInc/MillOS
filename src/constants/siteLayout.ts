export type Vec3Tuple = readonly [number, number, number];

/** The existing river footbridge deck, shared by rendering and collision. */
export const RIVER_FOOTBRIDGE_DECK = {
  centre: [0, 2, -145] as Vec3Tuple,
  size: [6.375, 0.8, 70] as Vec3Tuple,
} as const;

export interface SiteBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface SitePortal {
  readonly id: 'shipping-dock' | 'receiving-dock' | 'east-service' | 'west-service';
  readonly label: string;
  readonly centre: Vec3Tuple;
  readonly normal: Vec3Tuple;
  readonly halfWidth: number;
  readonly height: number;
  readonly transitionDepth: number;
}

export interface MachineAnchor {
  readonly id: string;
  readonly position: Vec3Tuple;
}

export interface ServiceAssetAnchor {
  readonly id: string;
  readonly position: Vec3Tuple;
  readonly rotation: number;
  readonly footprint: readonly [number, number];
  readonly height: number;
  readonly clearance: number;
}

export interface VehicleRouteAnchor {
  readonly id: string;
  readonly vehicle: 'forklift' | 'truck';
  readonly points: readonly Vec3Tuple[];
  /** Half of the swept X/Z corridor, including the vehicle body and a safety margin. */
  readonly halfWidth: number;
  readonly closed: boolean;
}

export interface RouteHazardAnchor {
  readonly id: string;
  readonly type: 'conveyor' | 'intersection';
  readonly bounds: Pick<SiteBounds, 'minX' | 'maxX' | 'minZ' | 'maxZ'>;
}

export interface LandmarkAnchor {
  readonly id: string;
  readonly position: Vec3Tuple;
  readonly rotation: Vec3Tuple;
  readonly scale: number;
  /** Conservative X/Z footprint used by placement and regression checks. */
  readonly footprint: readonly [number, number];
  readonly height: number;
}

/** Resolve authored local positions through the same yaw/scale as the landmark group. */
export function landmarkLocalToWorld(anchor: LandmarkAnchor, local: Vec3Tuple): Vec3Tuple {
  const cosine = Math.cos(anchor.rotation[1]);
  const sine = Math.sin(anchor.rotation[1]);
  return [
    anchor.position[0] + anchor.scale * (local[0] * cosine + local[2] * sine),
    anchor.position[1] + anchor.scale * local[1],
    anchor.position[2] + anchor.scale * (-local[0] * sine + local[2] * cosine),
  ];
}

// West of the canal, at grade, as in v0.30.
const VILLAGE_SITE = {
  id: 'village',
  position: [-190, 0, 0],
  rotation: [0, 0, 0],
  scale: 1,
  footprint: [70, 130],
  height: 26,
} as const satisfies LandmarkAnchor;

/** Physical plansifter stack, shared by geometry, pipe connections and bounds. */
export const SIFTER_LAYOUT = {
  trayCount: 7,
  trayPitch: 0.82,
  bodyCentreY: 3.05,
  bodyHeight: 5.81,
  capCentreY: 6.14,
  capHeight: 0.38,
  inletCentreY: 6.91,
  inletHeight: 1.3,
} as const;

export const PROCESS_GALLERY_POST_X = [-20, -10, 0, 10, 20] as const;

/** Physical feeder and pipe ports stay independent of the collision envelope. */
export const MILL_FEEDER_LAYOUT = {
  height: 5.78,
  scale: [2.7, 1.62, 2.45] as const,
} as const;
export const MILL_PROCESS_PORTS = {
  intake: [0, MILL_FEEDER_LAYOUT.height + MILL_FEEDER_LAYOUT.scale[1] / 2, 0],
  pneumatic: [0, 5, 0],
} as const;

/** Shared belt placement, including the return run along the milling aisle. */
export const CONVEYOR_LAYOUT = {
  main: { id: 'main-conveyor', position: [0, 0, -16], length: 60, width: 3, rotationY: 0 },
  roller: { id: 'roller-conveyor', position: [0, 0, -19], length: 30, width: 3, rotationY: 0 },
  transfer: {
    id: 'transfer-conveyor',
    position: [30, 0, 11],
    length: 54,
    width: 3.6,
    rotationY: -Math.PI / 2,
  },
  shipping: {
    id: 'shipping-conveyor',
    position: [8, 0, 38],
    length: 44,
    width: 3.6,
    rotationY: Math.PI,
  },
} as const;

export function conveyorBounds(conveyor: (typeof CONVEYOR_LAYOUT)[keyof typeof CONVEYOR_LAYOUT]) {
  const [x, , z] = conveyor.position;
  const longitudinal = Math.abs(Math.sin(conveyor.rotationY)) > 0.5;
  const halfX = (longitudinal ? conveyor.width : conveyor.length) / 2;
  const halfZ = (longitudinal ? conveyor.length : conveyor.width) / 2;
  return { minX: x - halfX, maxX: x + halfX, minZ: z - halfZ, maxZ: z + halfZ };
}

export const SITE_LAYOUT = {
  units: 'metres',
  axes: {
    east: '+X',
    up: '+Y',
    shipping: '+Z',
  },
  datum: {
    terrain: -0.02,
    yard: -0.02,
    interiorFloor: 0,
    dockPlatform: 1,
    mezzanine: 9,
    waterBed: 0.01,
    water: 0.08,
    groundOverlay: -0.01,
  },
  // The v0.30 valley: the foothills close in just beyond the walkable disc,
  // so the road tunnels bore into them and the village sits under the ridge.
  world: {
    radius: 255,
    horizonRadius: 260,
  },
  perimeter: {
    minX: -95,
    maxX: 95,
    minY: 0,
    maxY: 4,
    minZ: -85,
    maxZ: 85,
  } satisfies SiteBounds,
  factory: {
    bounds: {
      minX: -40,
      maxX: 40,
      minY: 0,
      maxY: 22,
      minZ: -50,
      maxZ: 50,
    } satisfies SiteBounds,
    floor: {
      width: 80,
      depth: 100,
    },
    zones: {
      silos: 33,
      milling: 30,
      sifting: 20,
      packing: -12,
    },
  },
  portals: {
    shipping: {
      id: 'shipping-dock',
      label: 'Shipping',
      centre: [0, 0, 50],
      normal: [0, 0, 1],
      halfWidth: 15,
      height: 14,
      transitionDepth: 18,
    },
    receiving: {
      id: 'receiving-dock',
      label: 'Receiving',
      centre: [0, 0, -50],
      normal: [0, 0, -1],
      halfWidth: 9,
      height: 14,
      transitionDepth: 18,
    },
    eastService: {
      id: 'east-service',
      label: 'East service exit',
      centre: [40, 0, -20],
      normal: [1, 0, 0],
      halfWidth: 2,
      height: 3,
      transitionDepth: 8,
    },
    westService: {
      id: 'west-service',
      label: 'West service exit',
      centre: [-40, 0, -20],
      normal: [-1, 0, 0],
      halfWidth: 2,
      height: 3,
      transitionDepth: 8,
    },
  } satisfies Record<string, SitePortal>,
  docks: {
    shipping: {
      bayCentre: [0, 0, 61] as Vec3Tuple,
      apron: {
        minX: -36,
        maxX: 36,
        minY: -0.02,
        maxY: 8,
        minZ: 48,
        maxZ: 92,
      } satisfies SiteBounds,
    },
    receiving: {
      bayCentre: [0, 0, -61] as Vec3Tuple,
      apron: {
        minX: -30,
        maxX: 10,
        minY: -0.02,
        maxY: 8,
        minZ: -92,
        maxZ: -48,
      } satisfies SiteBounds,
    },
  },
  bulkStorage: {
    siloPad: { position: [65, 0, 33], size: [16, 0.16, 66] },
    elevator: {
      id: 'grain-elevator',
      position: [65, 0, -46],
      rotation: 0,
      footprint: [18, 12],
      height: 55,
      clearance: 1,
    } satisfies ServiceAssetAnchor,
  },
  serviceYard: {
    maintenanceGarage: {
      id: 'maintenance-garage',
      position: [83.5, 0, 0],
      rotation: -Math.PI / 2,
      footprint: [12.3, 10.8],
      height: 8,
      clearance: 6,
    },
    propaneCompound: {
      id: 'propane-compound',
      position: [83.5, 0, -22],
      rotation: 0,
      footprint: [12, 9],
      height: 5,
      clearance: 4,
    },
    utilityTankFarm: {
      id: 'utility-tank-farm',
      position: [69, 0, -70],
      rotation: Math.PI / 2,
      footprint: [22, 42],
      height: 12,
      clearance: 2,
    },
    trailerDropYard: {
      id: 'trailer-drop-yard',
      position: [-78, 0, 35],
      rotation: 0,
      footprint: [20, 30],
      height: 5,
      clearance: 4,
    },
    fleetTelemetryHub: {
      id: 'fleet-telemetry-hub',
      position: [42, 0, 75],
      rotation: -Math.PI / 2,
      footprint: [12, 10],
      height: 6,
      clearance: 3,
    },
  } satisfies Record<string, ServiceAssetAnchor>,
  routes: {
    forklifts: {
      shipping: {
        id: 'forklift-shipping',
        vehicle: 'forklift',
        points: [
          [-16, 0, 42],
          [12, 0, 42],
          [25, 0, 42],
          [22.5, 0, 43],
          [22.5, 0, 48],
          [26, 0, 48],
          [26, 0, 42],
          [-16, 0, 42],
        ],
        halfWidth: 1.35,
        closed: true,
      },
      receiving: {
        id: 'forklift-receiving',
        vehicle: 'forklift',
        points: [
          [-28, 0, -43],
          [-28, 0, -38],
          [-28, 0, -30],
          [-28, 0, -22],
          [-35, 0, -22],
          [-35, 0, -38],
        ],
        halfWidth: 1.35,
        closed: true,
      },
    },
  } satisfies Record<string, Record<string, VehicleRouteAnchor>>,
  routeHazards: {
    mainConveyor: {
      id: 'main-conveyor',
      type: 'conveyor',
      bounds: conveyorBounds(CONVEYOR_LAYOUT.main),
    },
    rollerConveyor: {
      id: 'roller-conveyor',
      type: 'conveyor',
      bounds: conveyorBounds(CONVEYOR_LAYOUT.roller),
    },
    transferConveyor: {
      id: 'transfer-conveyor',
      type: 'conveyor',
      bounds: conveyorBounds(CONVEYOR_LAYOUT.transfer),
    },
    shippingConveyor: {
      id: 'shipping-conveyor',
      type: 'conveyor',
      bounds: conveyorBounds(CONVEYOR_LAYOUT.shipping),
    },
    shippingDock: {
      id: 'shipping-dock',
      type: 'intersection',
      bounds: { minX: -20, maxX: 20, minZ: 40, maxZ: 50 },
    },
    receivingDock: {
      id: 'receiving-dock',
      type: 'intersection',
      bounds: { minX: -20, maxX: 20, minZ: -50, maxZ: -40 },
    },
  } satisfies Record<string, RouteHazardAnchor>,
  /**
   * Truck road tunnels at each end of the valley. Local +Z of each faces the
   * yard; the 90 m bore runs away from it into the foothills. Mounted with the
   * continuous exterior so they exist at every graphics tier.
   */
  roadTunnels: {
    south: { id: 'road-tunnel-south', position: [20, 0, 220] as Vec3Tuple, rotation: Math.PI },
    north: { id: 'road-tunnel-north', position: [-20, 0, -220] as Vec3Tuple, rotation: 0 },
  },
  /**
   * Standing water and huts in the exterior. `FactoryExterior` mounts them from
   * here and the woodland filter keeps its trunks and crowns clear of the same
   * numbers, so a moved canal cannot leave a grove standing in it.
   */
  exteriorFeatures: {
    canal: { position: [-145, 0, -5] as Vec3Tuple, length: 220, width: 12, rotation: 0 },
    canalBranch: {
      position: [-145, 0, -110] as Vec3Tuple,
      length: 70,
      width: 8,
      rotation: Math.PI / 2,
    },
    lake: { position: [120, 0, 120] as Vec3Tuple, size: [40, 30] as const },
    ponds: [
      { position: [-125, 0, 105] as Vec3Tuple, radius: 10 },
      { position: [115, 0, -80] as Vec3Tuple, radius: 6 },
    ],
    nissenHuts: [
      { position: [-75, 0, -100] as Vec3Tuple, length: 14, rotation: 0 },
      { position: [85, 0, -100] as Vec3Tuple, length: 10, rotation: Math.PI / 2 },
    ],
  },
  landmarks: {
    castle: {
      id: 'castle',
      // v0.30's bearing across the river, set 19 m further back than v0.30's
      // z = -200 so the whole keep stands on level ground beyond the river's
      // outer bank (z ~ -190 here) rather than overhanging it.
      position: [45, -0.02, -219],
      rotation: [0, -Math.PI / 4, 0],
      scale: 1.5,
      // The generated castle.glb, rock included (asset-manifest bounds), not the
      // larger primitive fallback. Rotated 45 degrees, so exclusions that must
      // clear its corners use the half-diagonal rather than this box.
      footprint: [39, 39],
      height: 42,
    },
    farm: {
      id: 'farm',
      position: [75, 0, 120],
      rotation: [0, Math.PI, 0],
      scale: 1,
      footprint: [82, 78],
      height: 20,
    },
    village: VILLAGE_SITE,
  } satisfies Record<string, LandmarkAnchor>,
  machines: {
    silos: [
      { id: 'silo-0', position: [65, 0, 59] },
      { id: 'silo-1', position: [65, 0, 46] },
      { id: 'silo-2', position: [65, 0, 33] },
      { id: 'silo-3', position: [65, 0, 20] },
      { id: 'silo-4', position: [65, 0, 7] },
    ],
    rollerMills: [
      { id: 'rm-101', position: [-24, 0, 30] },
      { id: 'rm-102', position: [-10, 0, 30] },
      { id: 'rm-103', position: [4, 0, 30] },
      { id: 'rm-104', position: [18, 0, 30] },
    ],
    sifters: [
      { id: 'sifter-a', position: [-14, 9, 20] },
      { id: 'sifter-b', position: [0, 9, 20] },
      { id: 'sifter-c', position: [14, 9, 20] },
    ],
    packers: [
      { id: 'packer-0', position: [-8, 0, -12] },
      { id: 'packer-1', position: [0, 0, -12] },
      { id: 'packer-2', position: [8, 0, -12] },
    ],
  } satisfies Record<string, readonly MachineAnchor[]>,
  machineDimensions: {
    silo: [12, 32, 12],
    rollerMill: [7.8, 6.7, 5.7],
    sifter: [7, SIFTER_LAYOUT.inletCentreY + SIFTER_LAYOUT.inletHeight / 2, 7],
    packer: [4, 6, 4],
  } satisfies Record<string, Vec3Tuple>,
  cameras: {
    overview: { position: [-61, 32, 132], target: [14, 5, 0], fov: 45 },
    interior: { position: [-36, 14, 48], target: [0, 7, 25], fov: 55 },
    silos: { position: [95, 26, 74], target: [65, 13, 33], fov: 55 },
    milling: { position: [-36, 4.5, 42], target: [12, 5.5, 23], fov: 50 },
    sifting: { position: [30, 17, 36], target: [0, 13, 20], fov: 55 },
    packing: { position: [-34, 14, 0], target: [0, 3, -12] },
    processFloor: { position: [-36, 4.5, 42], target: [12, 5.5, 23], fov: 50 },
    tankFarm: { position: [69, 8.5, -97], target: [69, 3.5, -70], fov: 55 },
    logisticsClose: { position: [18, 3.8, 96], target: [14, 1.8, 82], fov: 45 },
    forklift: { position: [48, 3.8, 33], target: [40, 1.15, 24] },
    shipping: { position: [34, 9, 104], target: [5, 2.5, 82] },
    receiving: { position: [-34, 9, -104], target: [-5, 2.5, -82] },
    yard: { position: [110, 36, 58], target: [72, 1.5, 12] },
    water: { position: [158, 23, 154], target: [118, 0.08, 116] },
    village: {
      position: landmarkLocalToWorld(VILLAGE_SITE, [48, 28, 64]),
      target: landmarkLocalToWorld(VILLAGE_SITE, [0, 5, 0]),
    },
    farm: { position: [128, 26, 174], target: [75, 4, 120] },
    /**
     * Two close cameras for the generated farm and village assets.
     *
     * `village` and `farm` above frame the whole site, so a 1.3 m cow and a
     * 2.8 m market stall are a handful of pixels in them - the graded art
     * surface could not see the thirty-asset swap at all, which is exactly the
     * hole `cow-integration/REPORT.md` §6 recorded. These two sit at
     * conversational distance instead.
     *
     * Both are stated in world coordinates, so the landmark transform is
     * applied here rather than trusted to memory. That transform cost a full
     * debugging cycle once already (`FINDINGS.md`, "the farm sits at
     * SITE_LAYOUT.landmarks.farm with rotation [0, PI, 0]"):
     *   farm    local (x, z) -> world (75 - x, 120 - z)
     *   village local positions use landmarkLocalToWorld below.
     */
    // Paddock: the three rigged cows at farm-local (0,15) (5,18) (8,13), their
    // fence, the sheep and the hay bales, with the barn behind. Camera at
    // local (16.5, 4.0, 23.5), target the paddock centre at local (3.5, 1.2, 15).
    // The first framing sat 2.5 m further left and put a foreground trunk
    // across the left eighth of the frame, which a grading camera should not
    // spend pixels on.
    paddock: { position: [58.5, 4, 96.5], target: [71.5, 1.2, 105] },
    // Market square: fountain at village-local (0,6), the four stalls at
    // (+/-8, 2) and (+/-8, 10), wishing well at (-10,-5), town hall behind at
    // (0,20). Camera at local (12, 3.6, -4), target the fountain at
    // local (0, 2.0, 8). Near eye height and aimed slightly up: the first
    // framing stood at 5.5 m and gave half a frame of bare cobbles.
    square: {
      position: landmarkLocalToWorld(VILLAGE_SITE, [12, 3.6, -4]),
      target: landmarkLocalToWorld(VILLAGE_SITE, [0, 2, 8]),
    },
    garage: { position: [73, 9, 14], target: [83.5, 3, -2], fov: 55 },
    // Ground safety markings at the receiving apron. KEEP CLEAR sits at
    // (0, 0.09, -59) on its red zone plane and STAGING AREA at (-12, 0.02,
    // -57.5); both are inside `receiving`'s frustum and neither is legible from
    // it - 57 m away, and a parked truck stands in front of the first. This
    // camera looks DOWN on the apron, which is the framing a ground marking
    // needs. Two placements were discarded on the evidence: eye height at
    // (10, 4, -50) read the same paint at a grazing angle through the same
    // parked truck, and (2, 13, -44) put the dock's steel column and its
    // glazing straight down the middle of the frame. This one sits off the
    // dock centreline. At ~22 m a 0.4 m glyph is roughly 15 px tall.
    markings: { position: [-9, 12, -42], target: [-7, 0.1, -60] },
    // Gas station forecourt at (-85, 0, 140): the Dead Dino pylon sign, the
    // pumps, and the three CuteCars parked at x -75..-65, z 125.
    forecourt: { position: [-64, 9, 116], target: [-84, 4, 136] },
    // Employee parking lot at (120, 0, 50), two rows of six.
    // Near-plan view, deliberately. An oblique camera on a car park cannot
    // answer "is this car inside its bay" - the cars' own length foreshortens
    // and adjacent bays stack behind each other. Straight down does.
    carpark: { position: [120, 30, 51], target: [120, 0, 50] },
    // The river channel: centreline (0, -145), 280 m long, 20 m bed width, cut 4 m
    // into the terrain with 25 m sloped banks.
    river: { position: [34, 16, -118], target: [0, -2, -145] },
    // Exterior sweep cameras, one per feature that had never been framed.
    // Tunnel portal at (160, 0, 50), rotated a quarter turn, 15 m long.
    tunnel: { position: [132, 8, 36], target: [160, 3, 50] },
    // Nissen hut at (-75, 0, -100), 14 m long, with the modern path lamps.
    huts: { position: [-52, 8, -78], target: [-75, 3, -100] },
    // Four-floor office block at (-78, 0, 95).
    offices: { position: [-50, 14, 68], target: [-78, 8, 95] },
    // Canal at x -145 with the boat at z 15 and the lock gate at z 50.
    canal: { position: [-118, 10, 12], target: [-145, 1, 38] },
    // Lake at (120, 0, 120), 40 x 30 m, with the picnic tables and LAKE sign.
    lake: { position: [86, 14, 86], target: [120, 0, 120] },
    // Bus stop at (29, 0, 140) beside the front road.
    busstop: { position: [44, 5, 122], target: [29, 2, 140] },
    // South truck road tunnel: portal at (20, 0, 220), bore running out to +Z
    // into the foothills, framed from the approach road's verge.
    roadTunnel: { position: [44, 11, 178], target: [20, 4, 224], fov: 55 },
    // The castle across the river, from the near bank by the footbridge.
    castle: { position: [-30, 12, -112], target: [45, 14, -219], fov: 55 },
    // Kiosk cafe at (-108, 0, 105) with the pond at (-125, 0, 105).
    kiosk: { position: [-84, 8, 84], target: [-114, 2, 106] },
    celestial: { position: [90, 12, 72], target: [0, 12, 0] },
  },
  renderCells: {
    interior: {
      minX: -64,
      maxX: 64,
      minY: -1,
      maxY: 100,
      minZ: -54,
      maxZ: 54,
    },
    shipping: {
      minX: -48,
      maxX: 48,
      minY: -1,
      maxY: 100,
      minZ: 42,
      maxZ: 110,
    },
    receiving: {
      minX: -48,
      maxX: 48,
      minY: -1,
      maxY: 100,
      minZ: -110,
      maxZ: -42,
    },
    eastYard: {
      minX: 60,
      maxX: 150,
      minY: -4,
      maxY: 100,
      minZ: -100,
      maxZ: 100,
    },
    westYard: {
      minX: -150,
      maxX: -60,
      minY: -4,
      maxY: 100,
      minZ: -100,
      maxZ: 100,
    },
  } satisfies Record<string, SiteBounds>,
} as const;

/** Conveyor ports are derived from the actual elevator and end bins.
 * Working if both rendered spans meet those ports after a site-layout change.
 */
export const BULK_STORAGE_GALLERY = {
  head: [
    SITE_LAYOUT.bulkStorage.elevator.position[0],
    SITE_LAYOUT.bulkStorage.elevator.position[1] + 43,
    SITE_LAYOUT.bulkStorage.elevator.position[2],
  ] as Vec3Tuple,
  nearBin: [
    SITE_LAYOUT.machines.silos[4].position[0],
    34.4,
    SITE_LAYOUT.machines.silos[4].position[2],
  ] as Vec3Tuple,
  farBin: [
    SITE_LAYOUT.machines.silos[0].position[0],
    34.4,
    SITE_LAYOUT.machines.silos[0].position[2],
  ] as Vec3Tuple,
};

export const FACTORY_ZONE_Z = SITE_LAYOUT.factory.zones;
/**
 * Normal-atlas geometry stays in its authored local metres. Instance matrices,
 * placards and ladder access share this scale when the working bins change size.
 * Working if those three surfaces remain coincident at every configured size.
 */
export const SILO_ASSEMBLY_SIZE: Vec3Tuple = [4.5, 16, 4.5];
/** Local assembly metres, shared by the enclosure, ladder and access placards.
 * Working if the 12 m bins have 30 cm rung pitch and a ground-level hatch.
 */
export const SILO_ACCESS_LAYOUT = {
  baseCentreY: 1.27,
  baseHeight: 2.46,
  baseRadius: 2.25,
  supportOffset: 1.59,
  supportWidth: 0.07,
  ladderHalfWidth: 0.135,
  ladderZ: 2.34,
  railCentreY: 7.925,
  railHeight: 15.35,
  railWidth: 0.015,
  firstRungY: 0.25,
  rungPitch: 0.15,
  rungCount: 98,
  rungHeight: 0.015,
  hatchAngle: 0.36,
  hatchRadius: 2.27,
  hatchCentreY: 1,
  hatchSize: [0.4, 0.6, 0.04] as Vec3Tuple,
  nameplateY: 1.55,
} as const;
export function getSiloAssemblyScale(size: Vec3Tuple): [number, number, number] {
  return size.map((dimension, axis) =>
    Number.isFinite(dimension) && dimension > 0 ? dimension / SILO_ASSEMBLY_SIZE[axis] : 1
  ) as [number, number, number];
}

export const FACTORY_BOUNDS = SITE_LAYOUT.factory.bounds;
export const WORLD_RADIUS = SITE_LAYOUT.world.radius;

export function containsPoint(
  bounds: SiteBounds,
  x: number,
  y: number,
  z: number,
  inset: number = 0
): boolean {
  return (
    x >= bounds.minX + inset &&
    x <= bounds.maxX - inset &&
    y >= bounds.minY + inset &&
    y <= bounds.maxY - inset &&
    z >= bounds.minZ + inset &&
    z <= bounds.maxZ - inset
  );
}

export function isPointInPortalTransition(portal: SitePortal, x: number, z: number): boolean {
  const [portalX, , portalZ] = portal.centre;
  const alongX = Math.abs(portal.normal[0]) > 0.5;
  const lateralDistance = alongX ? Math.abs(z - portalZ) : Math.abs(x - portalX);
  const normalDistance = alongX ? Math.abs(x - portalX) : Math.abs(z - portalZ);
  return lateralDistance <= portal.halfWidth + 2 && normalDistance <= portal.transitionDepth;
}

export function getVisibleSiteCells(
  x: number,
  y: number,
  z: number,
  preloadMargin: number = 16
): string[] {
  return Object.entries(SITE_LAYOUT.renderCells)
    .filter(([, bounds]) => containsPoint(bounds, x, y, z, -preloadMargin))
    .map(([id]) => id);
}

/**
 * Returns cells intersected by the camera's forward view corridor.
 * Position-only culling can hide the factory from exterior overview cameras, so
 * this samples a bounded ray toward the subject as well as the camera position.
 */
export function getVisibleSiteCellsForView(
  position: Vec3Tuple,
  direction: Vec3Tuple,
  viewDistance: number = 240,
  sampleStep: number = 32
): string[] {
  const length = Math.hypot(direction[0], direction[1], direction[2]);
  const safeDirection =
    length > 0.0001
      ? ([direction[0] / length, direction[1] / length, direction[2] / length] as Vec3Tuple)
      : ([0, 0, -1] as Vec3Tuple);
  const cells = new Set<string>();

  for (let distance = 0; distance <= viewDistance; distance += sampleStep) {
    getVisibleSiteCells(
      position[0] + safeDirection[0] * distance,
      position[1] + safeDirection[1] * distance,
      position[2] + safeDirection[2] * distance
    ).forEach((cell) => cells.add(cell));
  }

  return Object.keys(SITE_LAYOUT.renderCells).filter((cell) => cells.has(cell));
}

export function getServiceAssetBounds(
  anchor: ServiceAssetAnchor,
  includeClearance: boolean = false
): SiteBounds {
  const quarterTurn = Math.abs(Math.sin(anchor.rotation)) > 0.5;
  const width = quarterTurn ? anchor.footprint[1] : anchor.footprint[0];
  const depth = quarterTurn ? anchor.footprint[0] : anchor.footprint[1];
  const clearance = includeClearance ? anchor.clearance : 0;

  return {
    minX: anchor.position[0] - width / 2 - clearance,
    maxX: anchor.position[0] + width / 2 + clearance,
    minY: anchor.position[1],
    maxY: anchor.position[1] + anchor.height,
    minZ: anchor.position[2] - depth / 2 - clearance,
    maxZ: anchor.position[2] + depth / 2 + clearance,
  };
}

export function getLandmarkBounds(anchor: LandmarkAnchor): SiteBounds {
  const quarterTurn = Math.abs(Math.sin(anchor.rotation[1])) > 0.5;
  const scaledWidth = anchor.footprint[0] * anchor.scale;
  const scaledDepth = anchor.footprint[1] * anchor.scale;
  const width = quarterTurn ? scaledDepth : scaledWidth;
  const depth = quarterTurn ? scaledWidth : scaledDepth;

  return {
    minX: anchor.position[0] - width / 2,
    maxX: anchor.position[0] + width / 2,
    minY: anchor.position[1],
    maxY: anchor.position[1] + anchor.height * anchor.scale,
    minZ: anchor.position[2] - depth / 2,
    maxZ: anchor.position[2] + depth / 2,
  };
}

export function boundsOverlapXZ(a: SiteBounds, b: SiteBounds): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

const segmentIntersectsBoundsXZ = (
  start: Vec3Tuple,
  end: Vec3Tuple,
  bounds: Pick<SiteBounds, 'minX' | 'maxX' | 'minZ' | 'maxZ'>
): boolean => {
  const deltaX = end[0] - start[0];
  const deltaZ = end[2] - start[2];
  let minimumT = 0;
  let maximumT = 1;

  const clip = (origin: number, delta: number, minimum: number, maximum: number): boolean => {
    if (Math.abs(delta) < 1e-9) return origin >= minimum && origin <= maximum;
    const first = (minimum - origin) / delta;
    const second = (maximum - origin) / delta;
    const entry = Math.min(first, second);
    const exit = Math.max(first, second);
    minimumT = Math.max(minimumT, entry);
    maximumT = Math.min(maximumT, exit);
    return minimumT <= maximumT;
  };

  return (
    clip(start[0], deltaX, bounds.minX, bounds.maxX) &&
    clip(start[2], deltaZ, bounds.minZ, bounds.maxZ)
  );
};

/**
 * Tests a vehicle's complete swept corridor against an X/Z footprint. The
 * route data is the same data rendered by the vehicle controller, so a passing
 * check protects the visible path rather than a hand-maintained proxy.
 */
export function routeIntersectsBoundsXZ(
  route: VehicleRouteAnchor,
  bounds: Pick<SiteBounds, 'minX' | 'maxX' | 'minZ' | 'maxZ'>,
  additionalMargin: number = 0
): boolean {
  const padding = Math.max(0, route.halfWidth + additionalMargin);
  const expanded = {
    minX: bounds.minX - padding,
    maxX: bounds.maxX + padding,
    minZ: bounds.minZ - padding,
    maxZ: bounds.maxZ + padding,
  };
  const segmentCount = route.closed ? route.points.length : Math.max(0, route.points.length - 1);

  for (let index = 0; index < segmentCount; index += 1) {
    const start = route.points[index];
    const end = route.points[(index + 1) % route.points.length];
    if (segmentIntersectsBoundsXZ(start, end, expanded)) return true;
  }
  return false;
}
