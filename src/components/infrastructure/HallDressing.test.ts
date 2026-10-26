import React from 'react';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  MaintenanceCart,
  HALL_DUST_MATERIAL,
  HALL_DUST_RENDER_ORDER,
  HALL_TRUNKING_LID_MATERIAL,
  HALL_TRUNKING_MATERIAL,
  buildDustPatchGeometry,
  buildHallSackMatrices,
  createDustMask,
} from './HallDressing';
import { RENDER_ORDER } from '../../constants/renderLayers';
import { FACTORY_STRUCTURE_MATERIAL } from './OptimizedFactoryInfrastructure';
import { PROCESS_MACHINE_INSTALL_SCALE, SITE_LAYOUT } from '../../constants/siteLayout';
import { MILL_BASE_PLATE_SCALE, PACKER_BASE_PLATE_SCALE } from '../machines/CompactMachines';
import {
  HALL_DUST,
  HALL_PALLET_PILES,
  HALL_SACK_STACKS,
  hallDressingSolids,
} from './hallDressingLayout';
import { LOADED_PALLET_HEIGHT, LOADING_PROP_FOOTPRINT } from '../props/LoadingProps';
import { getFlourSackGeometry } from '../../utils/flourSacks';

describe('column riser finish', () => {
  const luminance = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

  /**
   * final5 med-1830 interior: a bright vertical sliver at the right-wall column
   * edge, lilac at dusk and pale blue at noon. A probe-by-projection put it on
   * the front-gable riser at x -20 (x 2286-2299 at row 919, the trunking's side
   * face). Galvanised at metalness 0.75, indoors it mirrored the PMREM SKY - the
   * only environment there is. And against the white silos behind the east
   * glazing a grey trunking vanished (rubric item 10). An orange PVC-coated
   * trunking is a dielectric that reads against both.
   */
  it('is a dielectric orange that stands off the column paint', () => {
    for (const material of [HALL_TRUNKING_MATERIAL, HALL_TRUNKING_LID_MATERIAL]) {
      const m = material as THREE.MeshStandardMaterial;
      expect(m.metalness).toBeLessThanOrEqual(0.05);
      expect(m.color.r).toBeGreaterThan(2 * m.color.g);
      expect(m.color.g).toBeGreaterThan(2 * m.color.b);
      const column = (FACTORY_STRUCTURE_MATERIAL as THREE.MeshStandardMaterial).color;
      expect(luminance(m.color) / luminance(column)).toBeGreaterThan(2.5);
    }
  });
});

describe('hall dressing render', () => {
  it('declares footprints that cover the shared load props', () => {
    const pallet = hallDressingSolids().find((s) => s.id === HALL_SACK_STACKS[0].id)!;
    expect(pallet.maxX - pallet.minX).toBeGreaterThanOrEqual(
      2 * LOADING_PROP_FOOTPRINT.pallet[0] - 1e-9
    );
    expect(pallet.maxZ - pallet.minZ).toBeGreaterThanOrEqual(
      2 * LOADING_PROP_FOOTPRINT.pallet[1] - 1e-9
    );
    expect(pallet.maxY - pallet.minY).toBeGreaterThanOrEqual(LOADED_PALLET_HEIGHT);
  });

  it('puts every sack of every stack inside its declared box', () => {
    const { pallets, sacks } = buildHallSackMatrices();
    expect(pallets.length).toBe(
      HALL_SACK_STACKS.length + HALL_PALLET_PILES.reduce((n, p) => n + p.count, 0)
    );
    expect(sacks.length).toBe(HALL_SACK_STACKS.reduce((n, s) => n + s.courses * 2, 0));
    const geometry = getFlourSackGeometry();
    geometry.computeBoundingBox();
    const solids = hallDressingSolids();
    for (const matrix of sacks) {
      const box = geometry.boundingBox!.clone().applyMatrix4(matrix);
      const owner = solids.find(
        (s) =>
          box.min.x >= s.minX - 1e-3 &&
          box.max.x <= s.maxX + 1e-3 &&
          box.min.z >= s.minZ - 1e-3 &&
          box.max.z <= s.maxZ + 1e-3 &&
          box.min.y >= s.minY - 1e-3 &&
          box.max.y <= s.maxY + 1e-3
      );
      expect(owner, `sack at ${box.min.toArray().map((v) => v.toFixed(2))}`).toBeDefined();
    }
  });

  it('draws a lit dust decal whose mask reaches three through the green channel', () => {
    expect(HALL_DUST_MATERIAL).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(HALL_DUST_MATERIAL.depthWrite).toBe(false);
    expect(HALL_DUST_MATERIAL.polygonOffset).toBe(true);
    const mask = createDustMask(32);
    let green = 0;
    let centre = 0;
    for (let i = 0; i < mask.length; i += 4) {
      expect(mask[i + 1]).toBe(mask[i]);
      green += mask[i + 1];
    }
    centre = mask[(16 * 32 + 16) * 4 + 1];
    expect(green).toBeGreaterThan(0);
    expect(centre).toBeGreaterThan(mask[1]); // thicker in the middle than at the corner
    // No straight quad edge: the whole border ring is empty.
    for (let k = 0; k < 32; k += 1)
      for (const [x, y] of [
        [k, 0],
        [k, 31],
        [0, k],
        [31, k],
      ])
        expect(mask[(y * 32 + x) * 4 + 1], `${x},${y}`).toBeLessThan(40);
  });

  it('breaks the dust edge into drift and streaks, not an oval falloff', () => {
    const size = 128;
    const mask = createDustMask(size);
    // Walk the band where an oval falloff would be a smooth grey ring.
    const ring: number[] = [];
    for (let y = 0; y < size; y += 1)
      for (let x = 0; x < size; x += 1) {
        const r = Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5) * 2;
        if (r > 0.55 && r < 0.8) ring.push(mask[(y * size + x) * 4 + 1]);
      }
    const bare = ring.filter((v) => v < 10).length / ring.length;
    const dense = ring.filter((v) => v > 140).length / ring.length;
    // Both bare floor and dense drift in the same band: ragged, not graded.
    expect(bare).toBeGreaterThan(0.2);
    expect(dense).toBeGreaterThan(0.12);
    // And the transition is short: few pixels sit in the soft middle.
    const soft = ring.filter((v) => v >= 40 && v <= 110).length / ring.length;
    expect(soft).toBeLessThan(0.3);
  });

  it('shades the dust as matter under the hall lights, never as light', () => {
    const material = HALL_DUST_MATERIAL;
    expect(material.emissive.getHex()).toBe(0);
    expect(material.toneMapped).toBe(true);
    expect(material.blending).toBe(THREE.NormalBlending);
    expect(material.map).toBeNull();
    // Flour on concrete: at full cover it may lift the slab's albedo, never
    // approach white (linear luminance of the blend at full coverage).
    const c = material.color;
    const luminance = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    expect(luminance).toBeLessThan(0.5);
    // A faint film, not a light patch. Measured on a35d5b7e (one page load,
    // decal on/off): the old 0.66 x #c0b9aa lifted the pad 1.47x at noon and
    // 1.51x at 22:00, which the even night fill shows as pale blotches. Over
    // the pad's ~0.27 linear concrete, full cover may lift it a fifth at most.
    const pad = 0.27;
    const blend = pad * (1 - material.opacity) + luminance * material.opacity;
    expect(blend / pad).toBeLessThanOrEqual(1.2);
    // Drawn before the additive floor light pools, so a pool lights dust and
    // slab alike instead of being hidden under one and stacked on the other.
    expect(HALL_DUST_RENDER_ORDER).toBeLessThan(RENDER_ORDER.floorEffects);
  });

  it('lays no dust under a machine base, so the decal never climbs its plate', () => {
    // The decal sits 1 cm over the pad with a polygon offset; centred under a
    // mill it drew a ragged pale fringe over the foot of the base plate
    // (a35d5b7e milling 22:00: 3,612 px lifted more than 2x).
    const plates: Record<string, { halfX: number; halfZ: number }> = {};
    for (const mill of SITE_LAYOUT.machines.rollerMills)
      plates[mill.id] = {
        halfX: (MILL_BASE_PLATE_SCALE[0] * PROCESS_MACHINE_INSTALL_SCALE.rollerMill) / 2,
        halfZ: (MILL_BASE_PLATE_SCALE[2] * PROCESS_MACHINE_INSTALL_SCALE.rollerMill) / 2,
      };
    for (const packer of SITE_LAYOUT.machines.packers)
      plates[packer.id] = {
        halfX: (PACKER_BASE_PLATE_SCALE[0] * PROCESS_MACHINE_INSTALL_SCALE.packer) / 2,
        halfZ: (PACKER_BASE_PLATE_SCALE[2] * PROCESS_MACHINE_INSTALL_SCALE.packer) / 2,
      };
    const machines = [...SITE_LAYOUT.machines.rollerMills, ...SITE_LAYOUT.machines.packers];
    let checked = 0;
    for (const patch of HALL_DUST) {
      const geometry = buildDustPatchGeometry(patch);
      const position = geometry.getAttribute('position');
      const index = geometry.getIndex();
      const triangles: THREE.Triangle[] = [];
      const count = index ? index.count : position.count;
      const at = (i: number) => (index ? index.getX(i) : i);
      const world = new THREE.Matrix4().compose(
        new THREE.Vector3(patch.x, 0, patch.z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), patch.rotation),
        new THREE.Vector3(1, 1, 1)
      );
      const vertex = (i: number) =>
        new THREE.Vector3().fromBufferAttribute(position, at(i)).applyMatrix4(world).setY(0);
      for (let i = 0; i < count; i += 3)
        triangles.push(new THREE.Triangle(vertex(i), vertex(i + 1), vertex(i + 2)));
      for (const machine of machines) {
        const plate = plates[machine.id];
        const [mx, , mz] = machine.position;
        // Sample the plate grown by 5 cm on every side.
        for (let sx = -1; sx <= 1; sx += 0.1)
          for (let sz = -1; sz <= 1; sz += 0.1) {
            const p = new THREE.Vector3(
              mx + sx * (plate.halfX + 0.05),
              0,
              mz + sz * (plate.halfZ + 0.05)
            );
            checked += 1;
            expect(
              triangles.some((t) => t.containsPoint(p)),
              `${patch.id} covers ${machine.id} at ${p.x.toFixed(2)}, ${p.z.toFixed(2)}`
            ).toBe(false);
          }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('settles a machine dust ring thickest at the foot of the machine', () => {
    const mill = HALL_DUST.find((patch) => patch.source === 'rm-101' && patch.hole)!;
    expect(mill).toBeDefined();
    const size = 128;
    const mask = createDustMask(size, mill);
    // Mean cover in bands by distance from the hole edge, in metres.
    const bands = [0, 0, 0];
    const counts = [0, 0, 0];
    for (let y = 0; y < size; y += 1)
      for (let x = 0; x < size; x += 1) {
        const px = ((x + 0.5) / size - 0.5) * mill.width;
        const pz = ((y + 0.5) / size - 0.5) * mill.depth;
        const dx = Math.max(Math.abs(px) - mill.hole!.halfX, 0);
        const dz = Math.max(Math.abs(pz) - mill.hole!.halfZ, 0);
        const d = Math.hypot(dx, dz);
        if (dx === 0 && dz === 0) {
          expect(mask[(y * size + x) * 4 + 1], 'inside the hole').toBe(0);
          continue;
        }
        const band = d < 0.3 ? 0 : d < 0.6 ? 1 : d < 0.9 ? 2 : -1;
        if (band < 0) continue;
        bands[band] += mask[(y * size + x) * 4 + 1];
        counts[band] += 1;
      }
    const mean = bands.map((sum, i) => sum / counts[i]);
    expect(mean[0]).toBeGreaterThan(mean[1]);
    expect(mean[1]).toBeGreaterThan(mean[2]);
    expect(mean[0]).toBeGreaterThan(90);
  });
});

describe('live maintenance cart craft', () => {
  const assembly = () => {
    type Props = {
      children?: React.ReactNode;
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material;
      position?: [number, number, number];
      scale?: [number, number, number];
      rotation?: [number, number, number];
    };
    const root = new THREE.Group();
    const visit = (node: React.ReactNode, parent: THREE.Object3D) =>
      React.Children.forEach(node, (child) => {
        if (!React.isValidElement<Props>(child)) return;
        if (typeof child.type === 'function') {
          visit((child.type as (props: Props) => React.ReactNode)(child.props), parent);
          return;
        }
        if (child.type === React.Fragment) {
          visit(child.props.children, parent);
          return;
        }
        if (child.type !== 'mesh' && child.type !== 'group')
          throw new Error('Unexpected cart assembly node');
        const object =
          child.type === 'mesh'
            ? new THREE.Mesh(child.props.geometry, child.props.material)
            : new THREE.Group();
        if (child.props.position) object.position.set(...child.props.position);
        if (child.props.scale) object.scale.set(...child.props.scale);
        if (child.props.rotation) object.rotation.set(...child.props.rotation);
        parent.add(object);
        visit(child.props.children, object);
      });
    visit(MaintenanceCart({}) as React.ReactNode, root);
    root.updateMatrixWorld(true);
    const meshes: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
    root.traverse((node) => {
      if (node instanceof THREE.Mesh) meshes.push(node);
    });
    return { root, meshes };
  };
  const cast = (
    mesh: THREE.Mesh,
    point: [number, number, number],
    direction: [number, number, number]
  ) =>
    new THREE.Raycaster(
      new THREE.Vector3(...point),
      new THREE.Vector3(...direction),
      0,
      2
    ).intersectObject(mesh)[0];

  it('connects all four actual caster mounts to the chassis while retaining wheel and floor contact', () => {
    const { meshes } = assembly();
    const chassis = meshes.find(
      (m) => m.material.name === 'hall-cart-paint' && m.position.y === 0.2
    )!;
    const mounts = meshes.filter(
      (m) => m.material.name === 'hall-dark-steel' && m.position.y < 0.3
    );
    const wheels = meshes.filter(
      (m) => m.material.name === 'hall-rubber' && m.geometry.type === 'CylinderGeometry'
    );
    expect(mounts).toHaveLength(4);
    expect(wheels).toHaveLength(4);
    for (const mount of mounts) {
      const { x, z } = mount.position;
      const top = cast(mount, [x, 0.3, z], [0, -1, 0]);
      const shelf = cast(chassis, [x, 0.13, z], [0, 1, 0]);
      expect(top.point.y).toBeCloseTo(shelf.point.y, 6);
      const bottom = cast(mount, [x, 0, z], [0, 1, 0]);
      expect(bottom.point.y).toBeCloseTo(0.11, 6);
      const wheel = wheels.find((m) => m.position.x === x && m.position.z === z)!;
      expect(new THREE.Box3().setFromObject(wheel).min.y).toBeCloseTo(0, 6);
      expect(cast(wheel, [x, 0.2, z], [0, -1, 0]).point.y).toBeGreaterThan(bottom.point.y);
    }
  });

  it('forms a seated two-slot toolbox with a real carry opening, lid and catches within the existing cart envelope', () => {
    const { root, meshes } = assembly();
    const body = meshes.find((m) => m.material.name === 'hall-toolbox')!;
    const fittings = meshes.find(
      (m) => m.material.name === 'hall-dark-steel' && m.position.y > 0.7
    )!;
    expect(cast(fittings, [-0.15, 1.065, 0.3], [0, 0, -1])).toBeUndefined();
    expect(cast(fittings, [-0.15, 1.092, 0.3], [0, 0, -1])).toBeDefined();
    for (const x of [-0.222, -0.078])
      expect(cast(fittings, [x, 1.065, 0.3], [0, 0, -1])).toBeDefined();
    const handleBase = cast(fittings, [-0.15, 1.015, 0], [0, 1, 0]).point.y;
    const lidTop = cast(fittings, [-0.35, 1.04, 0], [0, -1, 0]).point.y;
    expect(handleBase).toBeLessThan(lidTop);
    const bodyTop = cast(body, [-0.15, 1.03, 0], [0, -1, 0]).point.y;
    expect(cast(fittings, [-0.15, 0.99, 0], [0, 1, 0]).point.y).toBeCloseTo(bodyTop, 6);
    for (const x of [-0.32, 0.02])
      for (const z of [-0.08, 0.08])
        expect(cast(body, [x, 0.83, z], [0, 1, 0]).point.y).toBeCloseTo(0.8375, 6);
    for (const x of [-0.31, 0.01]) {
      expect(cast(fittings, [x, 1.0035, 0.2], [0, 0, -1]).point.z).toBeCloseTo(0.13, 6);
      const catchBack = cast(fittings, [x, 1.0035, 0], [0, 0, 1]).point.z;
      const caseFront = cast(body, [x, 1.0035, 0.2], [0, 0, -1]).point.z;
      expect(catchBack).toBeLessThan(caseFront);
    }
    const bounds = new THREE.Box3().setFromObject(root);
    bounds.min
      .toArray()
      .forEach((value, axis) => expect(value).toBeCloseTo([-0.5, 0, -0.275][axis], 6));
    expect(bounds.max.x).toBeCloseTo(0.565, 6);
    expect(bounds.max.y).toBeCloseTo(1.1, 6);
    expect(bounds.max.z).toBeCloseTo(0.275, 6);
    expect(meshes).toHaveLength(25);
    expect([...new Set(meshes.map((m) => m.material.name))].sort()).toEqual([
      'hall-cardboard',
      'hall-cart-paint',
      'hall-dark-steel',
      'hall-parts-bin-yellow',
      'hall-rubber',
      'hall-toolbox',
    ]);
    let triangles = 0;
    for (const { geometry } of meshes) {
      triangles += (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
      const p = geometry.getAttribute('position'),
        n = geometry.getAttribute('normal');
      expect([...p.array].every(Number.isFinite)).toBe(true);
      for (let i = 0; i < n.count; i++)
        expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 4);
    }
    expect(triangles).toBeLessThanOrEqual(444 + 500);
  });
});
