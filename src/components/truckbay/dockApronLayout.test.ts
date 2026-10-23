import { readFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DOCK_CANOPY } from '../../constants/dockLoading';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import {
  DOCK_DOOR_FRAME,
  DOCK_FACADE_BOARD,
  DOCK_FACADE_LINES,
  DOCK_FACADE_POSTS,
  DOCK_FACADE_TRIM,
  DOCK_FLOOD_HEADS,
  DOCK_FLOOD_POOLS,
  DOCK_FLOOR_MARKINGS,
  DOCK_GUIDE_LINES,
  DOCK_KEEP_CLEAR,
  DOCK_KEEP_CLEAR_OUTLINE,
  DOCK_PAINT_START_U,
  DOCK_SLAB_OUTBOARD_U,
  DOCK_STOP_BAR,
  DOCK_BUMPER_BLOCK,
  DOCK_PLATFORM_SECTION,
  DOCK_WEAR_BUMPER,
  YARD_MAST,
} from './dockApronLayout';

/**
 * Every piece of dock paint used to start at or inside the dock line, under the
 * 2 m platforms and the forklift channel slab that run from u -1.7 to u 4.1.
 * Paint under a solid that writes depth is either hidden or, at distance, wins
 * a bias fight it should never be in and stipples through. Working if no paint
 * begins before the stop bar and the stop bar begins beyond the slab.
 */
describe('dock apron paint layout', () => {
  it('derives the slab edge from the real platform and channel geometry', () => {
    const source = readFileSync('src/components/TruckBay.tsx', 'utf8');
    // Both docks: two platform sections and one channel slab, all centred at
    // u 1.2 and 5.8 m long.
    expect(source.match(/<DockPlatformSection side=\{-?1\}( castShadow)? \/>/g)).toHaveLength(4);
    expect(source.match(/<boxGeometry args=\{\[4, 0\.02, 5\.8\]\} \/>/g)).toHaveLength(2);
    expect(source.match(/position=\{\[0, 0\.01, 1\.2\]\}/g)).toHaveLength(2);
    expect(DOCK_PLATFORM_SECTION.u + DOCK_PLATFORM_SECTION.depth / 2).toBeCloseTo(
      DOCK_SLAB_OUTBOARD_U,
      6
    );
    expect(DOCK_SLAB_OUTBOARD_U).toBeCloseTo(1.2 + 5.8 / 2, 6);
    // The platform's inner face stays on the forklift channel's edge.
    expect(DOCK_PLATFORM_SECTION.x - DOCK_PLATFORM_SECTION.width / 2).toBeCloseTo(2, 6);
  });

  it('puts the stop bar wholly beyond the slab and every other mark beyond the bar', () => {
    expect(DOCK_STOP_BAR.u - DOCK_STOP_BAR.depth / 2).toBeGreaterThan(DOCK_SLAB_OUTBOARD_U);
    expect(DOCK_PAINT_START_U).toBeCloseTo(DOCK_STOP_BAR.u + DOCK_STOP_BAR.depth / 2, 6);
    for (const mark of [...DOCK_FLOOR_MARKINGS, ...DOCK_KEEP_CLEAR_OUTLINE, DOCK_KEEP_CLEAR]) {
      expect(mark.u0, mark.id).toBeGreaterThanOrEqual(DOCK_PAINT_START_U);
      expect(mark.u1, mark.id).toBeGreaterThan(mark.u0);
    }
    for (const run of [DOCK_GUIDE_LINES]) {
      expect(run.u0).toBeGreaterThanOrEqual(DOCK_PAINT_START_U);
      expect(run.u1).toBeGreaterThan(run.u0);
    }
  });

  it('keeps KEEP CLEAR at the outboard end of the dock markings', () => {
    const outboard = Math.max(...DOCK_FLOOR_MARKINGS.map((mark) => mark.u1));
    expect(DOCK_KEEP_CLEAR.u0).toBeGreaterThanOrEqual(outboard);
  });

  it('widens the guide lines past the aliasing width at review distance', () => {
    expect(DOCK_GUIDE_LINES.width).toBeGreaterThanOrEqual(0.25);
  });

  it('shares no face between the platforms and the roll-up door or the bumpers', () => {
    const source = readFileSync('src/components/TruckBay.tsx', 'utf8');
    const box = (name: string) =>
      new RegExp(`${name}: new THREE\\.BoxGeometry\\(([^)]*)\\)`)
        .exec(source)![1]
        .split(',')
        .map(Number);
    // The closed door reaches the ground and passes into the platforms' wall
    // end, so its end faces must lie inside the platform, not on its face.
    const [doorWidth] = box('door');
    const platformOuter = DOCK_PLATFORM_SECTION.x + DOCK_PLATFORM_SECTION.width / 2;
    expect(platformOuter - doorWidth / 2).toBeGreaterThanOrEqual(0.01);
    // The wear bumpers' rubber overlaps the blocks at x +/-1.75: their tops
    // must not coincide.
    const [, rubberHeight] = box('bumper');
    const blockTop = DOCK_BUMPER_BLOCK.y + DOCK_BUMPER_BLOCK.height / 2;
    const rubberTop = DOCK_WEAR_BUMPER.y + rubberHeight / 2;
    expect(Math.abs(rubberTop - blockTop)).toBeGreaterThanOrEqual(0.01);
    expect(
      source.match(
        /<DockBumperWithWear\s+position=\{\[-?DOCK_WEAR_BUMPER\.x, DOCK_WEAR_BUMPER\.y, 0\]\}/g
      )
    ).toHaveLength(4);
  });
});

describe('dock apron night floods', () => {
  it('mounts the heads beside the door frame and above the status lamps', () => {
    for (const x of DOCK_FLOOD_HEADS.xs) expect(Math.abs(x)).toBeGreaterThan(4.85 + 0.3);
    expect(DOCK_FLOOD_HEADS.y).toBeGreaterThan(4.3);
    expect(DOCK_FLOOD_HEADS.u).toBeGreaterThan(-1.8);
  });

  it('lights the truck lane from the stop bar to the end of KEEP CLEAR', () => {
    for (const u of [
      DOCK_STOP_BAR.u,
      (DOCK_STOP_BAR.u + DOCK_KEEP_CLEAR.u1) / 2,
      DOCK_KEEP_CLEAR.u1,
    ]) {
      const reach = Math.max(
        ...DOCK_FLOOD_POOLS.map((pool) => 1 - Math.hypot(pool.x, pool.u - u) / pool.radius)
      );
      expect(reach, `u ${u}`).toBeGreaterThan(0.1);
    }
  });

  it('is mounted at both docks', () => {
    const source = readFileSync('src/components/TruckBay.tsx', 'utf8');
    expect(source.match(/<DockApronFloods \/>/g)).toHaveLength(2);
  });
});

describe('yard mast pools', () => {
  it('throw as far as a 14 m mast does, not as far as a 4 m post', () => {
    // The four masts stand on the yard perimeter; with a 10 m pool the middle
    // of the 60 m yard got nothing at 22:00 and read as flat navy.
    expect(YARD_MAST.poolRadius).toBeGreaterThanOrEqual(YARD_MAST.height * 1.25);
    const source = readFileSync('src/components/TruckBay.tsx', 'utf8');
    expect(source.match(/<ExteriorLampPool radius=\{YARD_MAST\.poolRadius\} \/>/g)).toHaveLength(2);
    expect(source.match(/<cylinderGeometry args=\{\[0\.12, 0\.15, 14, 8\]\} \/>/g)).toHaveLength(2);
  });
});

describe('KEEP CLEAR against the docked truck', () => {
  it('lies beyond the docked tractor, on its pull-out path, with no guide line through it', async () => {
    // It sat at u 14.6-16.6, under the docked tractor's engine (u ~15.5): a
    // keep-clear box under a parking position protects nothing. It now keeps
    // the pull-out path in front of the docked tractor's nose clear.
    const { DOCK_BUMPER_FACE_Z, TRAILER_REAR_OVERHANG, TRACTOR_FRONT_OVERHANG } =
      await import('./truckController');
    const dockedNoseU =
      DOCK_BUMPER_FACE_Z + TRAILER_REAR_OVERHANG + 0.02 + TRACTOR_FRONT_OVERHANG - 50;
    expect(DOCK_KEEP_CLEAR.u0).toBeGreaterThan(dockedNoseU);
    expect(DOCK_KEEP_CLEAR.u0 - dockedNoseU).toBeLessThan(1.5);
    for (const run of [DOCK_GUIDE_LINES]) {
      expect(run.u1).toBeLessThan(DOCK_KEEP_CLEAR.u0);
    }
  });
});

describe('dock facade sign', () => {
  it('paints both lines on a board carried on posts off the door frame', () => {
    const board = DOCK_FACADE_BOARD;
    const posts = DOCK_FACADE_POSTS;
    // The posts stand on the frame head (sunk no more than 3 cm) and run up
    // into the board; the board is within the frame's width and depth.
    expect(posts.bottom).toBeLessThanOrEqual(DOCK_DOOR_FRAME.top);
    expect(posts.bottom).toBeGreaterThan(DOCK_DOOR_FRAME.top - 0.03);
    expect(posts.top).toBeGreaterThan(board.bottom);
    expect(posts.top).toBeLessThan(board.top);
    for (const x of posts.xs) expect(Math.abs(x) + posts.width / 2).toBeLessThan(board.width / 2);
    // Inside the board's and the trim's depth, so no post face is coplanar.
    expect(posts.z).toBe(board.z);
    expect(posts.depth).toBeLessThan(DOCK_FACADE_TRIM.depth - 0.01);
    expect(board.width / 2).toBeLessThan(DOCK_DOOR_FRAME.halfWidth);
    expect(Math.abs(board.z - DOCK_DOOR_FRAME.z)).toBeLessThan(DOCK_DOOR_FRAME.depth / 2);
    // Every line sits on the board, a centimetre or two proud of its face.
    const face = board.z + board.depth / 2;
    expect(DOCK_FACADE_LINES.z).toBeGreaterThan(face);
    expect(DOCK_FACADE_LINES.z - face).toBeLessThan(0.03);
    for (const line of [DOCK_FACADE_LINES.title, DOCK_FACADE_LINES.subtitle]) {
      expect(line.y - line.fontSize / 2).toBeGreaterThan(board.bottom + 0.1);
      expect(line.y + line.fontSize / 2).toBeLessThan(board.top - 0.1);
    }
    // The edge trim stands proud of the board's rim but is inset behind BOTH of
    // its faces. It was offset 1 cm toward the hall and made 2 cm shallower,
    // which left its hall-side face exactly on the board's: a dark and a
    // metal face z-fighting into a jagged fringe seen from inside the hall
    // (final-med-12 milling (2180,470)-(2290,580), packing (0,430)-(210,540)).
    const trim = DOCK_FACADE_TRIM;
    const boardFaces = [board.z - board.depth / 2, board.z + board.depth / 2];
    const trimFaces = [trim.z - trim.depth / 2, trim.z + trim.depth / 2];
    expect(trimFaces[0] - boardFaces[0]).toBeGreaterThanOrEqual(0.005);
    expect(boardFaces[1] - trimFaces[1]).toBeGreaterThanOrEqual(0.005);
    expect(trim.width).toBeGreaterThan(board.width);
    expect(trim.height).toBeGreaterThan(board.top - board.bottom);
    // The open door rolls up to 4.1-4.9 m: no lettering may lie across it.
    expect(DOCK_FACADE_LINES.subtitle.y - DOCK_FACADE_LINES.subtitle.fontSize / 2).toBeGreaterThan(
      4.9
    );
  });
});

/**
 * The truck canopy's front edge beam crossed the board's lettering from the
 * yard: at logistics-close (18:30 most plainly) "SHIPPING" lost its lower half
 * behind the beam, and from the shipping camera the roof hid the subtitle.
 * Every line on both boards must be in clear sight of the cameras that frame
 * it, ray-cast against the canopy model itself.
 */
describe('dock facade sign against the canopy', () => {
  const loadCanopy = async () => {
    const document = await new NodeIO().read('public/models/world/dock-canopy-structure.glb');
    const meshes: THREE.Mesh[] = [];
    for (const node of document.getRoot().listNodes()) {
      const mesh = node.getMesh();
      if (!mesh) continue;
      for (const primitive of mesh.listPrimitives()) {
        const geometry = new THREE.BufferGeometry();
        const position = primitive.getAttribute('POSITION')!;
        geometry.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(position.getArray()!, position.getElementSize())
        );
        const indices = primitive.getIndices();
        if (indices) geometry.setIndex(Array.from(indices.getArray()!));
        geometry.applyMatrix4(new THREE.Matrix4().fromArray(node.getWorldMatrix()));
        meshes.push(
          new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
        );
      }
    }
    return meshes;
  };
  /** The canopy as mounted at a dock: shipping, or receiving under a half turn. */
  const mount = (meshes: THREE.Mesh[], dock: 'shipping' | 'receiving') => {
    const group = new THREE.Group();
    const inner = new THREE.Group();
    inner.position.z = DOCK_CANOPY.modelOffsetU;
    meshes.forEach((mesh) => inner.add(mesh.clone()));
    group.add(inner);
    group.position.z = dock === 'shipping' ? 50 + DOCK_CANOPY.u : -(50 + DOCK_CANOPY.u);
    group.rotation.y = dock === 'shipping' ? 0 : Math.PI;
    group.updateMatrixWorld(true);
    return group;
  };
  /** Sample points over one painted line, world metres (0.7 em per glyph, cap height 0.7 em). */
  const lineSamples = (dock: 'shipping' | 'receiving', text: string, y: number, size: number) => {
    const half = (text.length * 0.7 * size) / 2;
    const out: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i += 1)
      for (const dy of [-0.35, 0, 0.35]) {
        const x = -half + (2 * half * i) / 8;
        const local = new THREE.Vector3(x, y + dy * size, DOCK_FACADE_LINES.z);
        out.push(
          dock === 'shipping'
            ? new THREE.Vector3(local.x, local.y, 50 + local.z)
            : new THREE.Vector3(-local.x, local.y, -50 - local.z)
        );
      }
    return out;
  };
  const signs = [
    {
      dock: 'shipping',
      lines: ['SHIPPING', 'DOCK 1 - OUTBOUND'],
      cameras: ['logisticsClose', 'shipping'],
    },
    { dock: 'receiving', lines: ['RECEIVING', 'DOCK 2 - INBOUND'], cameras: ['receiving'] },
  ] as const;

  it('keeps every line of lettering clear of the canopy from each camera that frames it', async () => {
    const meshes = await loadCanopy();
    const failures: string[] = [];
    for (const { dock, lines, cameras } of signs) {
      const canopy = mount(meshes, dock);
      const [title, subtitle] = lines;
      const samples = [
        ...lineSamples(dock, title, DOCK_FACADE_LINES.title.y, DOCK_FACADE_LINES.title.fontSize),
        ...lineSamples(
          dock,
          subtitle,
          DOCK_FACADE_LINES.subtitle.y,
          DOCK_FACADE_LINES.subtitle.fontSize
        ),
      ];
      for (const name of cameras) {
        const view = SITE_LAYOUT.cameras[name];
        const eye = new THREE.Vector3(...view.position);
        let hidden = 0;
        for (const point of samples) {
          const direction = point.clone().sub(eye);
          const far = direction.length();
          const ray = new THREE.Raycaster(eye, direction.normalize(), 0, far - 0.05);
          if (ray.intersectObject(canopy, true).length) hidden += 1;
        }
        if (hidden) failures.push(`${dock} from ${name}: ${hidden}/${samples.length} hidden`);
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('dock apron paint is paint', () => {
  // Every mark on the apron in plan: x across, u outward, as [minX, maxX, minU, maxU].
  const rects = () => {
    const out: { id: string; r: [number, number, number, number]; mark: object }[] = [];
    for (const m of [...DOCK_FLOOR_MARKINGS, ...DOCK_KEEP_CLEAR_OUTLINE])
      out.push({ id: m.id, r: [m.x - m.width / 2, m.x + m.width / 2, m.u0, m.u1], mark: m });
    for (const x of DOCK_GUIDE_LINES.xs)
      out.push({
        id: `guide${x}`,
        r: [
          x - DOCK_GUIDE_LINES.width / 2,
          x + DOCK_GUIDE_LINES.width / 2,
          DOCK_GUIDE_LINES.u0,
          DOCK_GUIDE_LINES.u1,
        ],
        mark: DOCK_GUIDE_LINES,
      });
    out.push({
      id: 'stop-bar',
      r: [
        -DOCK_STOP_BAR.width / 2,
        DOCK_STOP_BAR.width / 2,
        DOCK_STOP_BAR.u - DOCK_STOP_BAR.depth / 2,
        DOCK_STOP_BAR.u + DOCK_STOP_BAR.depth / 2,
      ],
      mark: DOCK_STOP_BAR,
    });
    return out;
  };

  it('is opaque: no tinted see-through fills', () => {
    // The 0.2-0.3 opacity bay, lane, staging and KEEP CLEAR fills overlapped
    // into a translucent rainbow that read as an AR overlay on the apron.
    for (const { id, mark } of rects()) expect('opacity' in mark, id).toBe(false);
    // Every mark is a line: narrow across its run, never a filled area.
    for (const { id, r } of rects())
      expect(Math.min(r[1] - r[0], r[3] - r[2]), id).toBeLessThanOrEqual(0.4 + 1e-9);
    const source = readFileSync('src/components/TruckBay.tsx', 'utf8');
    const paint = source.slice(source.indexOf('const DockPaintLine'));
    expect(paint.slice(0, 1600)).not.toMatch(/opacity|emissive/);
  });

  it('never lays one mark over another', () => {
    const all = rects();
    for (let i = 0; i < all.length; i += 1)
      for (let j = i + 1; j < all.length; j += 1) {
        const [a, b] = [all[i].r, all[j].r];
        const overlap = a[0] < b[1] && b[0] < a[1] && a[2] < b[3] && b[2] < a[3];
        expect(overlap, all[i].id + ' over ' + all[j].id).toBe(false);
      }
  });
});
