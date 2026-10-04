import { SITE_LAYOUT, landmarkLocalToWorld } from './siteLayout';

type Point = [number, number, number];
// Actual runtime triangles and mounted origins are baked into the retained assets.
// Version both requests together so stale-cache recovery cannot mix revisions.
export const CIVIC_SHADOW_BAKE_READY = true;
export const CIVIC_SHADOW_ASSET_VERSION =
  '345c4f90178dca328eb87616db253157d6a5fe49cf77a84dc4da0a3050c86219';
export type CivicLamp = {
  id: string;
  kind: 'post' | 'garden' | 'wall' | 'window' | 'sign';
  position: Point;
  intensity: number;
  distance: number;
  reference: [number, number];
};

// Located apertures in the approved blue-hour artwork. Coordinates are village
// metres: hall [0,20], fountain [0,6], allotment [-25,9]. The lower
// 3.3 m civic posts keep their apertures beside the planting, above walking space.
// Reflected patches are not counted as extra lamps. Working if each aperture
// has a fitting and each source lights actual stone, wood or planting.
export const CIVIC_LAMPS: readonly CivicLamp[] = [
  {
    id: 'hall-west',
    kind: 'wall',
    position: [1.85, 3.525, 14.47],
    intensity: 19,
    distance: 9,
    reference: [0.29, 0.375],
  },
  {
    id: 'hall-east',
    kind: 'wall',
    position: [-1.85, 3.525, 14.47],
    intensity: 19,
    distance: 9,
    reference: [0.407, 0.375],
  },
  {
    id: 'hall-sign',
    kind: 'sign',
    position: [0, 6.65, 14.3],
    intensity: 3.85,
    distance: 4,
    reference: [0.338, 0.227],
  },
  {
    id: 'post-left',
    kind: 'post',
    position: [10.2, 3.3, 7.08],
    intensity: 78,
    distance: 24,
    reference: [0.019, 0.386],
  },
  {
    id: 'post-fountain',
    kind: 'post',
    position: [-4, 3.3, 12.08],
    intensity: 70,
    distance: 24,
    reference: [0.546, 0.368],
  },
  {
    id: 'post-garden',
    kind: 'post',
    position: [-22, 3.3, 18.08],
    intensity: 68,
    distance: 20,
    reference: [0.662, 0.402],
  },
  {
    id: 'post-right',
    kind: 'post',
    position: [-29, 3.3, 5.08],
    intensity: 68,
    distance: 20,
    reference: [0.965, 0.373],
  },
  {
    id: 'shed-wall',
    kind: 'wall',
    position: [-27.65, 1.7, 5.95],
    intensity: 8,
    distance: 7,
    reference: [0.804, 0.44],
  },
  {
    id: 'hall-verge',
    kind: 'garden',
    position: [6.7, 0.44, 15.5],
    intensity: 12,
    distance: 9,
    reference: [0.025, 0.563],
  },
  {
    id: 'hall-front-west',
    kind: 'garden',
    position: [4.7, 0.44, 13.1],
    intensity: 12,
    distance: 9,
    reference: [0.176, 0.604],
  },
  {
    id: 'hall-front-east',
    kind: 'garden',
    position: [-4.7, 0.44, 13.1],
    intensity: 12,
    distance: 9,
    reference: [0.48, 0.539],
  },
  {
    id: 'hall-side-near',
    kind: 'garden',
    position: [6.8, 0.44, 20],
    intensity: 12,
    distance: 9,
    reference: [0.04, 0.478],
  },
  {
    id: 'hall-side-far',
    kind: 'garden',
    position: [6.8, 0.44, 24],
    intensity: 12,
    distance: 9,
    reference: [0.074, 0.472],
  },
  {
    id: 'fountain-border',
    kind: 'garden',
    position: [-5.7, 0.44, 10.5],
    intensity: 13,
    distance: 9,
    reference: [0.552, 0.505],
  },
  {
    id: 'tree-inner',
    kind: 'garden',
    position: [-43.3, 0.44, 27.15],
    intensity: 48,
    distance: 12,
    reference: [0.631, 0.45],
  },
  {
    id: 'gate-inner',
    kind: 'garden',
    position: [-19.15, 0.44, 10.5],
    intensity: 12,
    distance: 9,
    reference: [0.687, 0.507],
  },
  {
    id: 'gate-outer',
    kind: 'garden',
    position: [-19.15, 0.44, 7.5],
    intensity: 12,
    distance: 9,
    reference: [0.737, 0.532],
  },
  {
    id: 'shed-bed-west',
    kind: 'garden',
    position: [-24.2, 0.44, 13.8],
    intensity: 12,
    distance: 9,
    reference: [0.776, 0.529],
  },
  {
    id: 'shed-bed-east',
    kind: 'garden',
    position: [-29.8, 0.44, 9.2],
    intensity: 12,
    distance: 9,
    reference: [0.817, 0.529],
  },
  {
    id: 'tree-middle',
    kind: 'garden',
    position: [-41.3, 0.44, 11.4],
    intensity: 50,
    distance: 12,
    reference: [0.872, 0.481],
  },
  {
    id: 'tree-near',
    kind: 'garden',
    position: [-43, 0.44, 5.2],
    intensity: 46,
    distance: 12,
    reference: [0.928, 0.509],
  },
  {
    id: 'verge-near',
    kind: 'garden',
    position: [-28, 0.44, -1.2],
    intensity: 13,
    distance: 9,
    reference: [0.984, 0.572],
  },
  ...[-4.3, 4.3].map((x) => ({
    id: `hall-front-window-${x}`,
    kind: 'window' as const,
    position: [x, 3.35, 13.9] as Point,
    intensity: 3.3,
    distance: 7,
    reference: [x > 0 ? 0.21 : 0.44, 0.4] as [number, number],
  })),
  ...[16.8, 20, 23.2].map((z) => ({
    id: `hall-side-window-${z}`,
    kind: 'window' as const,
    position: [7.1, 3.35, z] as Point,
    intensity: 3.3,
    distance: 7,
    reference: [0.08, 0.4] as [number, number],
  })),
];

export const CIVIC_POST_POSITIONS: Point[] = CIVIC_LAMPS.filter((l) => l.kind === 'post').map(
  // Source clears the solid central burner while remaining inside the glass.
  ({ position: [x, , z] }) => [x, 0, z - 0.08]
);
export const CIVIC_POST_HEIGHT_SCALES = CIVIC_LAMPS.filter((l) => l.kind === 'post').map(
  (lamp) => lamp.position[1] / 4.3
);
export const CIVIC_LIGHT_COLOR = '#ffcf83';
export const CIVIC_SHADOW_FACE_SIZE = 128;
export const CIVIC_SHADOW_ATLAS_SIZE = [1024, 4096] as const;
export const CIVIC_SHADOW_CONVENTION =
  'world-Y-up radial-RG16; +X,-X,+Y,-Y,+Z,-Z; rows follow face v';
// Normal, horizontal and vertical axes, consumed by BOTH baker and sampler.
export const CIVIC_CUBE_FACE_BASES = [
  [
    [1, 0, 0],
    [0, 0, -1],
    [0, -1, 0],
  ],
  [
    [-1, 0, 0],
    [0, 0, 1],
    [0, -1, 0],
  ],
  [
    [0, 1, 0],
    [1, 0, 0],
    [0, 0, 1],
  ],
  [
    [0, -1, 0],
    [1, 0, 0],
    [0, 0, -1],
  ],
  [
    [0, 0, 1],
    [1, 0, 0],
    [0, -1, 0],
  ],
  [
    [0, 0, -1],
    [-1, 0, 0],
    [0, -1, 0],
  ],
] as const;
export const CIVIC_WORLD_LIGHTS = CIVIC_LAMPS.map((lamp) => ({
  ...lamp,
  position: landmarkLocalToWorld(SITE_LAYOUT.landmarks.village, lamp.position),
}));

// Collision-free 5 cm source cells, stored in the unused atlas margin. The
// position check after lookup keeps unrelated lights in colliding cells intact.
// Working if all actual mounted origins select unique rows across camera poses.
export const CIVIC_SOURCE_LOOKUP = {
  quantization: 20,
  bias: 0.31,
  coefficients: [1, 1, 2],
  slots: 512,
  width: 256,
  origin: [768, 0],
} as const;
export function civicSourceSlot(position: readonly number[]): number {
  const hash = position.reduce(
    (sum, value, axis) =>
      sum +
      Math.floor(value * CIVIC_SOURCE_LOOKUP.quantization + CIVIC_SOURCE_LOOKUP.bias) *
        CIVIC_SOURCE_LOOKUP.coefficients[axis],
    0
  );
  return (
    ((hash % CIVIC_SOURCE_LOOKUP.slots) + CIVIC_SOURCE_LOOKUP.slots) % CIVIC_SOURCE_LOOKUP.slots
  );
}
