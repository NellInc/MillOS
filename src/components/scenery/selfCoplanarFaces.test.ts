import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { VILLAGE_HOMES } from './VillageGardens';
import { COMMUNITY_TRANSIT_GEOMETRY } from './CommunityTransit';
import { TRAVEL_STOP_GEOMETRY } from './StationTravelStop';
import { SHOP_KIT_GEOMETRY } from './StationSouvenirs';
import { createSleepingCatGeometry } from './SleepingCatCraft';
import { createCastleSetting } from './FairytaleCastle';
import { createWorldRealm, VILLAGE_REALM_GEOMETRY } from './WorldPublicRealm';
import { AUTHORED_MARKET_GOODS, MARKET_TRAY_FLOOR } from './AuthoredPropTrim';
import { createSpoutTubeGeometry, spoutRouteRadii } from '../SpoutingSystem';
import { buildSpoutRoutes, SPOUT_PIPE_RADIUS } from '../flow/spoutRoutes';
import { buildCeilingFixtures } from '../infrastructure/OptimizedFactoryInfrastructure';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { EXTERIOR_LAYERS } from '../../constants/renderLayers';
import { CANAL_FOOTBRIDGE_ACCESS } from '../../constants/publicRealmLayout';
import { MachineType, type MachineData } from '../../types';
vi.mock('../../utils/critterAudio', () => ({ playCritterSound: vi.fn() }));
vi.mock('../models/GeneratedModel', () => ({ GeneratedBody: () => null }));

/**
 * Faces of ONE draw call lying on each other in one plane, with different
 * vertex colours. Inside a single mesh the later triangle wins wherever its
 * interpolated depth is less-or-equal, and two triangulations of one plane
 * round depth differently, so the two colours stripe and sparkle as the camera
 * moves. The runtime sweep of 2026-10-20 found these in the village homes, the
 * village bus, the travel stop and its souvenir kit, the market cheeses, the
 * castle court seat, a cat's ears and the process spouting; each test below
 * builds the real merged geometry and asserts no differently shaded overlap
 * above 1 cm2 within `maxSep` (1.5 mm: the runtime guard fails 0.01-1 mm, and
 * the fixes move faces at least 3 mm apart rather than to just past it).
 */

type Face = {
  p: THREE.Vector3[];
  n: THREE.Vector3;
  /** Normal flipped so its dominant component is positive; `cd` is its offset. */
  cn: THREE.Vector3;
  cd: number;
  colour: THREE.Color;
};

type CoplanarPiece = {
  normal: number[];
  centre: number[];
  area: number;
  colours: string[];
  facing: 'same' | 'opposite';
};

function facesOf(geometry: THREE.BufferGeometry): Face[] {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = g.getAttribute('position');
  const colour = g.getAttribute('color') as THREE.BufferAttribute | undefined;
  const out: Face[] = [];
  for (let i = 0; i + 2 < position.count; i += 3) {
    const p = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(position, i + k));
    const n = new THREE.Vector3()
      .subVectors(p[1], p[0])
      .cross(new THREE.Vector3().subVectors(p[2], p[0]));
    if (n.length() < 1e-10) continue;
    n.normalize();
    const dominant = [0, 1, 2].reduce(
      (best, k) => (Math.abs(n.getComponent(k)) > Math.abs(n.getComponent(best)) ? k : best),
      0
    );
    const cn = n.clone().multiplyScalar(n.getComponent(dominant) < 0 ? -1 : 1);
    const c = new THREE.Color(0, 0, 0);
    if (colour)
      for (let k = 0; k < 3; k++) {
        c.r += colour.getX(i + k) / 3;
        c.g += colour.getY(i + k) / 3;
        c.b += colour.getZ(i + k) / 3;
      }
    out.push({ p, n, cn, cd: cn.dot(p[0]), colour: c });
  }
  if (g !== geometry) g.dispose();
  return out;
}

function clip(a: number[][], b: number[][]) {
  const area2 = (poly: number[][]) =>
    poly.reduce((s, [x1, y1], i) => {
      const [x2, y2] = poly[(i + 1) % poly.length];
      return s + x1 * y2 - x2 * y1;
    }, 0);
  const ccw = (p: number[][]) => (area2(p) < 0 ? [...p].reverse() : p);
  let out = ccw(a);
  const clipper = ccw(b);
  for (let i = 0; i < clipper.length && out.length; i++) {
    const [ax, ay] = clipper[i];
    const [bx, by] = clipper[(i + 1) % clipper.length];
    const side = ([px, py]: number[]) => (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    const input = out;
    out = [];
    for (let k = 0; k < input.length; k++) {
      const cur = input[k];
      const prev = input[(k + input.length - 1) % input.length];
      const sc = side(cur);
      const sp = side(prev);
      const at = () => {
        const t = sp / (sp - sc);
        return [prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t];
      };
      if (sc >= 0) {
        if (sp < 0) out.push(at());
        out.push(cur);
      } else if (sp >= 0) out.push(at());
    }
  }
  return out.length >= 3 ? { poly: out, area: Math.abs(area2(out)) / 2 } : { poly: [], area: 0 };
}

/**
 * Differently coloured faces of one geometry that overlap within `maxSep` of
 * one plane, facing the same way (or either way when `doubleSided`). Pieces
 * are aggregated per plane and half-metre cell, and only those above
 * `minArea` (m2) are returned.
 */
function selfCoplanarPieces(
  geometry: THREE.BufferGeometry,
  {
    maxSep = 0.0015,
    minArea = 1e-4,
    doubleSided = false,
    // Per-vertex tints of one finish (realm stone, kiln clay) differ by a few
    // levels; a fight between them is invisible.
    colourTolerance = 8 / 255,
  }: {
    maxSep?: number;
    minArea?: number;
    doubleSided?: boolean;
    colourTolerance?: number;
  } = {}
): CoplanarPiece[] {
  const faces = facesOf(geometry).sort((a, b) => a.cd - b.cd);
  const pieces = new Map<string, CoplanarPiece & { weighted: THREE.Vector3 }>();
  for (let i = 0; i < faces.length; i++) {
    const s = faces[i];
    for (let j = i + 1; j < faces.length && faces[j].cd - s.cd <= maxSep; j++) {
      const t = faces[j];
      if (s.cn.dot(t.cn) < 0.99985) continue;
      const same = s.n.dot(t.n) > 0;
      if (!same && !doubleSided) continue;
      const delta = Math.max(
        Math.abs(s.colour.r - t.colour.r),
        Math.abs(s.colour.g - t.colour.g),
        Math.abs(s.colour.b - t.colour.b)
      );
      if (delta <= colourTolerance) continue;
      if (t.p.some((q) => Math.abs(s.cn.dot(q) - s.cd) > maxSep)) continue;
      if (s.p.some((q) => Math.abs(t.cn.dot(q) - t.cd) > maxSep)) continue;
      const u = new THREE.Vector3()
        .crossVectors(
          s.cn,
          Math.abs(s.cn.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
        )
        .normalize();
      const v = new THREE.Vector3().crossVectors(s.cn, u);
      const flat = (f: Face) => f.p.map((q) => [q.dot(u), q.dot(v)]);
      const { poly, area } = clip(flat(s), flat(t));
      if (area < 1e-8) continue;
      const [cu, cv] = poly
        .reduce(([x, y], [px, py]) => [x + px, y + py], [0, 0])
        .map((k) => k / poly.length);
      const centre = s.cn
        .clone()
        .multiplyScalar(s.cd)
        .addScaledVector(u, cu)
        .addScaledVector(v, cv);
      const colours = [s.colour.getHexString(), t.colour.getHexString()].sort();
      const key = [
        ...s.cn.toArray().map((k) => k.toFixed(3)),
        (Math.round(s.cd / 0.01) * 0.01).toFixed(2),
        same ? 'S' : 'O',
        // Half-metre cells: vertex-colour gradients split one fight into many
        // colour pairs, so pieces aggregate by place rather than by colour.
        Math.floor(cu / 0.5),
        Math.floor(cv / 0.5),
      ].join('|');
      const piece = pieces.get(key) ?? {
        normal: s.n.toArray().map((k) => Number(k.toFixed(4))),
        centre: [],
        area: 0,
        colours,
        facing: same ? ('same' as const) : ('opposite' as const),
        weighted: new THREE.Vector3(),
      };
      piece.area += area;
      piece.weighted.addScaledVector(centre, area);
      pieces.set(key, piece);
    }
  }
  return [...pieces.values()]
    .filter((p) => p.area > minArea)
    .map(({ weighted, ...p }) => ({
      ...p,
      area: Number(p.area.toFixed(5)),
      centre: weighted
        .divideScalar(p.area)
        .toArray()
        .map((k) => Number(k.toFixed(3))),
    }))
    .sort((a, b) => b.area - a.area);
}

describe('self-coplanar detector', () => {
  it('finds a flush trim on a wall and ignores the same trim stood proud', () => {
    const wall = new THREE.BoxGeometry(2, 2, 0.2);
    const trim = (z: number) => new THREE.BoxGeometry(0.2, 1.9, 0.1).translate(0.85, 0, z);
    const paint = (g: THREE.BufferGeometry, c: string) => {
      const colour = new THREE.Color(c);
      const values = new Float32Array(g.getAttribute('position').count * 3);
      for (let i = 0; i < values.length; i += 3) colour.toArray(values, i);
      g.setAttribute('color', new THREE.BufferAttribute(values, 3));
      return g.toNonIndexed();
    };
    const merge = (z: number) => {
      const parts = [paint(wall.clone(), '#ffffff'), paint(trim(z), '#000000')];
      const g = new THREE.BufferGeometry();
      for (const name of ['position', 'color']) {
        const arrays = parts.map((p) => p.getAttribute(name).array as Float32Array);
        const joined = new Float32Array(arrays.reduce((s, a) => s + a.length, 0));
        let offset = 0;
        for (const a of arrays) {
          joined.set(a, offset);
          offset += a.length;
        }
        g.setAttribute(name, new THREE.BufferAttribute(joined, 3));
      }
      return g;
    };
    expect(selfCoplanarPieces(merge(0.05)).length).toBeGreaterThan(0);
    expect(selfCoplanarPieces(merge(0.06))).toEqual([]);
  });
});

const report = (pieces: CoplanarPiece[]) =>
  pieces.map(
    (p) =>
      `${p.facing} n(${p.normal.join(' ')}) at (${p.centre.join(' ')}) ${p.area} m2 ${p.colours.join('/')}`
  );
const merged = (...parts: THREE.BufferGeometry[]) => {
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  if (!g) throw new Error('parts must share attributes');
  return g;
};

describe('village homes', () => {
  it.each(VILLAGE_HOMES.map((home, index) => [index, home] as const))(
    'home %i keeps differently coloured body and garden faces out of each other’s planes',
    (_index, home) => {
      const g = merged(home.body, home.garden);
      // Downward faces on the ground plane are against the terrain.
      const pieces = selfCoplanarPieces(g).filter(
        (p) => !(p.normal[1] < -0.999 && Math.abs(p.centre[1]) < 0.01)
      );
      expect(report(pieces)).toEqual([]);
    }
  );
});

describe('village bus', () => {
  it('keeps the bus body and door panels out of their trims’ planes', () => {
    expect(report(selfCoplanarPieces(COMMUNITY_TRANSIT_GEOMETRY.bus))).toEqual([]);
    expect(report(selfCoplanarPieces(COMMUNITY_TRANSIT_GEOMETRY.door))).toEqual([]);
  });
});

describe('travel stop', () => {
  it('keeps the double-sided dressing free of same-facing coplanar colour fights', () => {
    // Opposite-facing pairs remain, and are all resting contacts between closed
    // solids: stock on decks, decks on posts, the bin's band and mouth walls,
    // the plaque backing 1 mm into its plinth. Each shared plane is enclosed on
    // both sides, so no view ray reaches it even on this double-sided material.
    expect(report(selfCoplanarPieces(TRAVEL_STOP_GEOMETRY.opaque))).toEqual([]);
    const contacts = selfCoplanarPieces(TRAVEL_STOP_GEOMETRY.opaque, { doubleSided: true });
    expect(contacts.length).toBeGreaterThan(0);
    for (const p of contacts) {
      const seat =
        Math.abs(p.normal[1]) > 0.999 &&
        [0.455, 0.485, 0.62, 0.645, 0.885, 1.285].some((y) => Math.abs(p.centre[1] - y) < 0.002);
      const plaque = Math.abs(p.normal[2]) > 0.999 && Math.abs(p.centre[2] - 8.2) < 0.002;
      expect(p.facing === 'opposite' && (seat || plaque), report([p])[0]).toBe(true);
    }
  });
  it('keeps the souvenir kit free of coplanar colour fights', () => {
    expect(
      Object.entries(SHOP_KIT_GEOMETRY).flatMap(([key, g]) =>
        report(
          // Cup and tray-foot bottoms rest on the 2.1 mm linen stack, so they
          // lie within 1.5 mm of its buried lower faces; the stack and counter
          // below hide both from every view.
          selfCoplanarPieces(g).filter(
            (p) => !(p.normal[1] < -0.999 && p.centre[1] > 1.0145 && p.centre[1] < 1.0185)
          )
        ).map((line) => `${key}: ${line}`)
      )
    ).toEqual([]);
  });
});

describe('small props', () => {
  it('fills the sleeping cat’s ear shell around its inset instead of under it', () => {
    const cat = createSleepingCatGeometry('#f97316');
    for (const ear of [cat.leftEar, cat.rightEar])
      expect(report(selfCoplanarPieces(ear, { minArea: 1e-6 }))).toEqual([]);
  });
  it('keeps the castle court seat slats off the iron uprights’ face', () => {
    const { position, rotation, scale } = SITE_LAYOUT.landmarks.castle;
    const g = createCastleSetting([...position], [...rotation], scale, 128);
    expect(report(selfCoplanarPieces(g))).toEqual([]);
  });
  it('leaves only seated joinery feet in shared planes', () => {
    // Down-facing post and wall feet on the terrain datum or the bridge deck
    // are against the surface they stand on.
    const seated = (p: CoplanarPiece) =>
      p.normal[1] < -0.999 &&
      [EXTERIOR_LAYERS.ground, CANAL_FOOTBRIDGE_ACCESS.deckY].some(
        (y) => Math.abs(p.centre[1] - y) < 0.005
      );
    for (const g of [createWorldRealm(128).solid, VILLAGE_REALM_GEOMETRY.solid])
      expect(report(selfCoplanarPieces(g).filter((p) => !seated(p)))).toEqual([]);
  });
  it('keeps cheese bands, wedges and eyes out of the rind planes they cover', () => {
    // Bottoms resting on the tray floor are against the delivered stall.
    expect(
      AUTHORED_MARKET_GOODS.flatMap((g, trade) =>
        report(
          selfCoplanarPieces(g).filter(
            (p) => !(p.normal[1] < -0.999 && Math.abs(p.centre[1] - MARKET_TRAY_FLOOR) < 0.002)
          )
        ).map((line) => `trade ${trade}: ${line}`)
      )
    ).toEqual([]);
  });
});

describe('process spouting', () => {
  const machines = (
    [
      [SITE_LAYOUT.machines.silos, MachineType.SILO, SITE_LAYOUT.machineDimensions.silo],
      [
        SITE_LAYOUT.machines.rollerMills,
        MachineType.ROLLER_MILL,
        SITE_LAYOUT.machineDimensions.rollerMill,
      ],
      [SITE_LAYOUT.machines.sifters, MachineType.PLANSIFTER, SITE_LAYOUT.machineDimensions.sifter],
      [SITE_LAYOUT.machines.packers, MachineType.PACKER, SITE_LAYOUT.machineDimensions.packer],
    ] as const
  ).flatMap(([anchors, type, size]) =>
    anchors.map((anchor) => ({ ...anchor, position: [...anchor.position], type, size: [...size] }))
  ) as unknown as MachineData[];
  /** Each family merged as the component merges it, one colour per route. */
  const families = (radii: number[], radial: number) => {
    const routes = buildSpoutRoutes(machines);
    return (['intake', 'pneumatic', 'finished'] as const).map((family) =>
      merged(
        ...routes.flatMap((route, index) => {
          if (route.family !== family) return [];
          const tube = createSpoutTubeGeometry(route.curve, radial, radii[index]);
          const colour = new THREE.Color().setHSL(index / routes.length, 0.6, 0.5);
          const values = new Float32Array(tube.getAttribute('position').count * 3);
          for (let i = 0; i < values.length; i += 3) colour.toArray(values, i);
          tube.setAttribute('color', new THREE.BufferAttribute(values, 3));
          return [tube];
        })
      )
    );
  };
  it.each([6, 8, 12])('keeps the shared lift-line drop to one sleeve at %i sides', (radial) => {
    const routes = buildSpoutRoutes(machines);
    // Control: equal tubes lie face on face on the silo-side intake run and
    // the shared lift-line drop, which is what the component built before.
    const equal = families(
      routes.map(() => SPOUT_PIPE_RADIUS),
      radial
    );
    expect(selfCoplanarPieces(equal[0]).length).toBeGreaterThan(0);
    expect(selfCoplanarPieces(equal[1]).length).toBeGreaterThan(0);
    for (const g of families(spoutRouteRadii(routes), radial))
      expect(report(selfCoplanarPieces(g))).toEqual([]);
  });
  it('keeps every widened sleeve clear of the ceiling fixtures', () => {
    const routes = buildSpoutRoutes(machines);
    const radii = spoutRouteRadii(routes);
    expect(Math.max(...radii)).toBeGreaterThan(SPOUT_PIPE_RADIUS);
    const fixtures = buildCeilingFixtures();
    const boxes = [...fixtures.housings, ...fixtures.emitters].map((part) =>
      new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(...part.position),
        new THREE.Vector3(...part.scale)
      )
    );
    routes.forEach((route, index) => {
      const nearest = Math.min(
        ...route.curve
          .getSpacedPoints(1600)
          .flatMap((point) => boxes.map((box) => box.distanceToPoint(point)))
      );
      expect(nearest, `${route.fromMachineId}-${route.toMachineId}`).toBeGreaterThan(radii[index]);
    });
  });
});
