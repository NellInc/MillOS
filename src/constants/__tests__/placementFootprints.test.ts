/**
 * PLACEMENT FOOTPRINTS DO NOT OVERLAP.
 *
 * The 2026-11-03 art review flagged five interpenetrations from screen space.
 * Top-down shots showed one was real: the village shuttle's U-turn, centred
 * on (20, 118), drove its nose into the weighbridge office at (30, 120) in the
 * 12:00 frame and swept under the checkpoint's closed inbound arm. The other four
 * (maintenance shed and office block, Nissen hut and office block, hay bale and
 * barn, fuel tank and elevator) were one object standing in front of another
 * along the camera's line of sight, with clear ground between them.
 *
 * Every footprint here is read from the real placement: the layout constants,
 * the JSX that places the inline buildings, the GLB files the bodies load and
 * the shuttle's own route function. A hand-copied table would test a copy.
 *
 * Working if: the shuttle's whole cycle keeps 1 m from every fixed object near
 * the gate, its paved apron stays off the weighbridge office, no two buildings
 * in the set stand within 1 m of each other, and no hay bale reaches the barn.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SITE_LAYOUT } from '../siteLayout';
import { BUS_SHELTER_SOLIDS, BUS_TURNAROUND, busShelterWorldBounds } from '../publicRealmLayout';
import { sampleCommunityBus } from '../../simulation/communityLife';
import { COMMUNITY_BUS_LAYOUT } from '../../components/scenery/CommunityTransit';
import { SERVICE_BUILDING_ENVELOPES } from '../../components/exterior/serviceBuildingCraft';
import {
  apartmentFacadeLayout,
  type ApartmentFloors,
} from '../../components/exterior/apartmentFacadeLayout';

const ROOT = resolve(__dirname, '../../..');
const source = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');
const EXTERIOR = source('src/components/FactoryExterior.tsx');

interface Box {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
const numbers = (text: string) => text.split(',').map((v) => Number(v.trim()));
const angle = (text: string) => {
  const t = text.replace(/\s/g, '');
  const m = /^(-)?(?:(\d*\.?\d+)\*?)?Math\.PI(?:\/(\d+))?$/.exec(t);
  if (m) return (m[1] ? -1 : 1) * Number(m[2] ?? 1) * (Math.PI / Number(m[3] ?? 1));
  const n = Number(t);
  if (!Number.isFinite(n)) throw new Error(`unparsed rotation ${text}`);
  return n;
};
/** World AABB of a local rectangle placed at (x, z) with a yaw (quarter turns stay exact). */
function placed(
  id: string,
  [x, z]: readonly [number, number],
  yaw: number,
  local: { minX: number; maxX: number; minZ: number; maxZ: number }
): Box {
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  const pts = [local.minX, local.maxX].flatMap((lx) =>
    [local.minZ, local.maxZ].map((lz) => [x + lx * c + lz * s, z - lx * s + lz * c])
  );
  return {
    id,
    minX: Math.min(...pts.map((p) => p[0])),
    maxX: Math.max(...pts.map((p) => p[0])),
    minZ: Math.min(...pts.map((p) => p[1])),
    maxZ: Math.max(...pts.map((p) => p[1])),
  };
}
const boxGap = (a: Box, b: Box) =>
  Math.hypot(
    Math.max(a.minX - b.maxX, 0, b.minX - a.maxX),
    Math.max(a.minZ - b.maxZ, 0, b.minZ - a.maxZ)
  );
const pointGap = (x: number, z: number, b: Box) =>
  Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ));

// ---- Inline placements, parsed from the JSX that renders them ----

function weighbridgeOffice(): Box {
  const m = /Weighbridge office \*\/\}\s*<group position=\{\[([^\]]+)\]\}>/.exec(EXTERIOR);
  expect(m, 'weighbridge office placement').not.toBeNull();
  const [x, , z] = numbers(m![1]);
  // Its roof slab is the widest part: boxGeometry [4.5, 0.4, 3.5].
  expect(EXTERIOR).toContain('<boxGeometry args={[4.5, 0.4, 3.5]} />');
  return placed('weighbridge-office', [x, z], 0, {
    minX: -2.25,
    maxX: 2.25,
    minZ: -1.75,
    maxZ: 1.75,
  });
}

/** Shipping checkpoint: booth, both posts and both arms CLOSED (they open for trucks only). */
function shippingCheckpoint(): Box[] {
  const m =
    /<CheckpointBarrier\s+position=\{\[([^\]]+)\]\}\s+rotation=\{([^}]+)\}\s+label="SHIPPING"/.exec(
      EXTERIOR
    );
  expect(m, 'shipping checkpoint placement').not.toBeNull();
  const [x, , z] = numbers(m![1]);
  const yaw = angle(m![2]);
  const road = /roadWidth = (\d+), checkpointType/.exec(EXTERIOR);
  expect(road, 'checkpoint road width default').not.toBeNull();
  const half = Number(road![1]) / 2;
  const arm = half + 1;
  const booth = half + 2 + 3.5 / 2;
  const at = (id: string, r: { minX: number; maxX: number; minZ: number; maxZ: number }) =>
    placed(`checkpoint-${id}`, [x, z], yaw, r);
  // Traffic keeps right: the inbound post and arm are on the +x kerb, the
  // outbound pair on the -x kerb, each arm over its own lane.
  return [
    at('booth-platform', { minX: -booth - 2.25, maxX: -booth + 2.25, minZ: -2, maxZ: 2 }),
    at('inbound-post', { minX: half + 0.25, maxX: half + 0.75, minZ: 2.75, maxZ: 3.25 }),
    at('inbound-arm', { minX: half + 0.5 - arm - 0.3, maxX: half + 1.2, minZ: 2.85, maxZ: 3.15 }),
    at('outbound-post', { minX: -half - 0.75, maxX: -half - 0.25, minZ: -3.25, maxZ: -2.75 }),
    at('outbound-arm', {
      minX: -half - 1.2,
      maxX: -half - 0.5 + arm + 0.3,
      minZ: -3.15,
      maxZ: -2.85,
    }),
  ];
}

function officeApartments(): Box[] {
  const found = [
    ...EXTERIOR.matchAll(
      /<OfficeApartment position=\{\[([^\]]+)\]\} floors=\{(\d)\} rotation=\{([^}]+)\} \/>/g
    ),
  ];
  expect(found.length, 'office apartment placements').toBeGreaterThanOrEqual(2);
  return found.map((m, i) => {
    const [x, , z] = numbers(m[1]);
    const { shell, stairTower, gallery } = apartmentFacadeLayout(Number(m[2]) as ApartmentFloors);
    return placed(`office-apartment-${i}`, [x, z], angle(m[3]), {
      minX: -shell.halfX,
      maxX: Math.max(stairTower.maxX, shell.halfX + gallery.depth),
      minZ: shell.minZ,
      maxZ: shell.maxZ,
    });
  });
}

/** `nissen-hut.glb` is 5.2 m wide; the component scales its 12.4 m length to `length + 0.4`. */
const nissenHuts = (): Box[] =>
  SITE_LAYOUT.exteriorFeatures.nissenHuts.map((hut, i) =>
    placed(`nissen-hut-${i}`, [hut.position[0], hut.position[2]], hut.rotation, {
      minX: -2.6,
      maxX: 2.6,
      minZ: -(hut.length + 0.4) / 2,
      maxZ: (hut.length + 0.4) / 2,
    })
  );

const serviceBuildings = (): Box[] =>
  Object.entries(SERVICE_BUILDING_ENVELOPES).map(([id, e]) =>
    placed(`service-${id}`, [e.position[0], e.position[2]], 0, {
      minX: e.min[0],
      maxX: e.max[0],
      minZ: e.min[2],
      maxZ: e.max[2],
    })
  );

function busShelter(): Box {
  const parts = BUS_SHELTER_SOLIDS.map(busShelterWorldBounds);
  return {
    id: 'bus-shelter',
    minX: Math.min(...parts.map((p) => p.minX)),
    maxX: Math.max(...parts.map((p) => p.maxX)),
    minZ: Math.min(...parts.map((p) => p.minZ)),
    maxZ: Math.max(...parts.map((p) => p.maxZ)),
  };
}

// ---- GLB bounds, read from the shipped asset ----

function glbBounds(path: string) {
  const bytes = readFileSync(resolve(ROOT, path));
  const length = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + length).toString('utf8'));
  const node = json.nodes.find((n: { mesh?: number }) => n.mesh !== undefined);
  const scale: number[] = node.scale ?? [1, 1, 1];
  const shift: number[] = node.translation ?? [0, 0, 0];
  expect(node.rotation, `${path} body is unrotated`).toBeUndefined();
  const accessor = json.accessors[json.meshes[node.mesh].primitives[0].attributes.POSITION];
  return {
    minX: accessor.min[0] * scale[0] + shift[0],
    maxX: accessor.max[0] * scale[0] + shift[0],
    minZ: accessor.min[2] * scale[2] + shift[2],
    maxZ: accessor.max[2] * scale[2] + shift[2],
  };
}

describe('village shuttle turnaround', () => {
  const obstacles = [weighbridgeOffice(), ...shippingCheckpoint(), busShelter()];
  const halfW = COMMUNITY_BUS_LAYOUT.width / 2,
    halfL = COMMUNITY_BUS_LAYOUT.length / 2 + 0.02;

  it('keeps the bus body 1 m from the weighbridge office, checkpoint and shelter all cycle', () => {
    const nearest = new Map<string, number>();
    // One full four-hour cycle; the route repeats from 06:00.
    for (let hour = 6; hour < 10; hour += 0.0002) {
      const bus = sampleCommunityBus(hour);
      if (!bus.visible || bus.z > 160) continue;
      const c = Math.cos(bus.rotation),
        s = Math.sin(bus.rotation);
      for (let lx = -halfW; lx <= halfW + 1e-9; lx += halfW / 4)
        for (let lz = -halfL; lz <= halfL + 1e-9; lz += halfL / 16) {
          const x = bus.x + lx * c + lz * s,
            z = bus.z - lx * s + lz * c;
          for (const b of obstacles)
            nearest.set(b.id, Math.min(nearest.get(b.id) ?? Infinity, pointGap(x, z, b)));
        }
    }
    for (const b of obstacles) expect(nearest.get(b.id), b.id).toBeGreaterThanOrEqual(1);
  });

  it('paves only ground clear of the weighbridge office', () => {
    const [cx, cz] = BUS_TURNAROUND.centre;
    expect(pointGap(cx, cz, weighbridgeOffice())).toBeGreaterThan(BUS_TURNAROUND.apronRadius);
  });

  it('paves the whole swept U-turn', () => {
    // Body corners sit sqrt((r + w/2)^2 + (l/2)^2) from the centre at most.
    const sweep = Math.hypot(BUS_TURNAROUND.radius + halfW, halfL);
    expect(BUS_TURNAROUND.apronRadius).toBeGreaterThan(sweep + 1);
  });
});

describe('building footprints', () => {
  it('keeps every building near the reviewed overlaps 1 m from every other', () => {
    const boxes = [
      ...officeApartments(),
      ...nissenHuts(),
      ...serviceBuildings(),
      weighbridgeOffice(),
      busShelter(),
      shippingCheckpoint()[0],
    ];
    const tight: string[] = [];
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const gap = boxGap(boxes[i], boxes[j]);
        if (gap < 1) tight.push(`${boxes[i].id} / ${boxes[j].id}: ${gap.toFixed(2)} m`);
      }
    expect(tight).toEqual([]);
  });
});

describe('farmyard hay bales', () => {
  it('stand clear of the generated barn, at any instance yaw and scale', () => {
    const farm = source('src/components/FarmArea.tsx');
    const barnAt = /<Barn position=\{\[([^\]]+)\]\} \/>/.exec(farm);
    expect(barnAt, 'barn placement').not.toBeNull();
    const [bx, , bz] = numbers(barnAt![1]);
    const barnLocal = glbBounds('public/models/farm/barn.glb');
    const barn: Box = {
      id: 'barn',
      minX: bx + barnLocal.minX,
      maxX: bx + barnLocal.maxX,
      minZ: bz + barnLocal.minZ,
      maxZ: bz + barnLocal.maxZ,
    };
    const bale = glbBounds('public/models/farm/haybale.glb');
    const bales = [
      ...farm.matchAll(/<HayBale position=\{\[([^\]]+)\]\} rotation=\{([^}]+)\} \/>/g),
    ];
    expect(bales.length).toBeGreaterThanOrEqual(4);
    for (const m of bales) {
      const [x, , z] = numbers(m[1]);
      // instanceYaw adds at most +-0.06 rad and instanceScale at most 4%.
      for (const yaw of [-0.06, 0, 0.06]) {
        const b = placed(`bale ${m[1]}`, [x, z], angle(m[2]) + yaw, {
          minX: bale.minX * 1.04,
          maxX: bale.maxX * 1.04,
          minZ: bale.minZ * 1.04,
          maxZ: bale.maxZ * 1.04,
        });
        expect(boxGap(b, barn), b.id).toBeGreaterThan(0.2);
      }
    }
  });
});
