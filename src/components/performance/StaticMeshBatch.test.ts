import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  collectStaticBatchCandidates,
  createStaticMeshBatches,
  orderStaticBatchCandidatesForChunking,
} from './StaticMeshBatch';
import { applyBatchWorldSurface, hasWorldSurface } from '../../utils/worldSurface';

const makeBox = (x: number, color: string = '#778899'): THREE.Mesh => {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 2, 3),
    new THREE.MeshStandardMaterial({ color, roughness: 0.7 })
  );
  mesh.position.x = x;
  return mesh;
};

describe('StaticMeshBatch', () => {
  it('ignores R3F ownership graphs when comparing identical rendered materials', () => {
    const root = new THREE.Group();
    const left = makeBox(-2);
    const right = makeBox(3);
    for (const [index, mesh] of [left, right].entries()) {
      // R3F attaches this enumerable metadata to mounted materials. Its parent
      // and children describe the React scene, not the material's appearance.
      Object.assign(mesh.material, {
        __r3f: { type: 'meshStandardMaterial', parent: { key: index }, children: [] },
      });
    }
    root.add(left, right);
    const candidates = collectStaticBatchCandidates(root);
    expect(candidates[0]?.materialSignature).toBe(candidates[1]?.materialSignature);
    expect(candidates[0]?.materialSignature).not.toContain('__r3f');
    expect(createStaticMeshBatches(root, candidates, 'mounted', 2)).toHaveLength(1);
  });

  it('never traverses a mounted material ownership graph', () => {
    const root = new THREE.Group();
    const mesh = makeBox(0);
    Object.assign(mesh.material, {
      __r3f: {
        get parent() {
          throw new Error('Material signing traversed the R3F scene graph');
        },
      },
    });
    root.add(mesh);
    expect(() => collectStaticBatchCandidates(root)).not.toThrow();
  });

  it('instances transform-stable opaque duplicates without changing their world transforms', () => {
    const root = new THREE.Group();
    const left = makeBox(-2);
    const right = makeBox(3);
    root.add(left, right);

    const candidates = collectStaticBatchCandidates(root);
    const batches = createStaticMeshBatches(root, candidates, 'test', 2);

    expect(batches).toHaveLength(1);
    const batchMesh = batches[0]?.mesh;
    expect(batchMesh).toBeInstanceOf(THREE.InstancedMesh);
    if (!(batchMesh instanceof THREE.InstancedMesh)) {
      throw new Error('Expected transform-compatible duplicates to produce an InstancedMesh');
    }
    expect(batchMesh.count).toBe(2);
    expect(left.parent).toBeNull();
    expect(right.parent).toBeNull();

    const matrix = new THREE.Matrix4();
    batchMesh.getMatrixAt(0, matrix);
    expect(new THREE.Vector3().setFromMatrixPosition(matrix).x).toBeCloseTo(-2);
    batchMesh.getMatrixAt(1, matrix);
    expect(new THREE.Vector3().setFromMatrixPosition(matrix).x).toBeCloseTo(3);
  });

  it('keeps interactive and explicitly dynamic meshes out of static batching', () => {
    const root = new THREE.Group();
    const transparent = makeBox(0);
    (transparent.material as THREE.MeshStandardMaterial).transparent = true;
    const interactive = makeBox(1);
    interactive.userData.noStaticBatch = true;
    const dynamicParent = new THREE.Group();
    dynamicParent.userData.dynamic = true;
    dynamicParent.add(makeBox(2));
    root.add(transparent, interactive, dynamicParent);

    expect(collectStaticBatchCandidates(root)).toEqual([
      expect.objectContaining({ mesh: transparent }),
    ]);
  });

  it('keeps descendants of hidden groups out of visible root-level batches', () => {
    const root = new THREE.Group();
    const hidden = new THREE.Group();
    hidden.visible = false;
    hidden.add(makeBox(-1), makeBox(1));
    root.add(hidden);

    const candidates = collectStaticBatchCandidates(root);
    const batches = createStaticMeshBatches(root, candidates, 'hidden', 2);

    expect(candidates).toHaveLength(0);
    expect(batches).toHaveLength(0);
    expect(root.children).toEqual([hidden]);
  });

  it('rechecks ancestor eligibility before replacing collected meshes', () => {
    const root = new THREE.Group();
    const parent = new THREE.Group();
    const left = makeBox(-1);
    const right = makeBox(1);
    parent.add(left, right);
    root.add(parent);

    const candidates = collectStaticBatchCandidates(root);
    expect(candidates).toHaveLength(2);

    parent.visible = false;
    const batches = createStaticMeshBatches(root, candidates, 'newly-hidden', 2);

    expect(batches).toHaveLength(0);
    expect(parent.children).toEqual([left, right]);
  });

  it('does not instance geometries with different render attributes', () => {
    const root = new THREE.Group();
    const firstGeometry = new THREE.BoxGeometry(1, 1, 1);
    const secondGeometry = firstGeometry.clone();
    secondGeometry.getAttribute('uv').setX(0, 0.375);
    const material = new THREE.MeshStandardMaterial({ color: '#778899' });
    const first = new THREE.Mesh(firstGeometry, material);
    const second = new THREE.Mesh(secondGeometry, material.clone());
    second.position.x = 2;
    root.add(first, second);

    const candidates = collectStaticBatchCandidates(root);
    const batches = createStaticMeshBatches(root, candidates, 'attributes', 2);

    expect(batches).toHaveLength(0);
    expect(first.parent).toBe(root);
    expect(second.parent).toBe(root);
  });

  it('does not instance materials with different rendered properties', () => {
    const root = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const aoMap = new THREE.Texture();
    const dim = new THREE.MeshStandardMaterial({ color: '#778899', aoMap, aoMapIntensity: 0 });
    const strong = new THREE.MeshStandardMaterial({
      color: '#778899',
      aoMap,
      aoMapIntensity: 1,
    });
    const first = new THREE.Mesh(geometry, dim);
    const second = new THREE.Mesh(geometry, strong);
    second.position.x = 2;
    root.add(first, second);

    const candidates = collectStaticBatchCandidates(root);
    const batches = createStaticMeshBatches(root, candidates, 'material-properties', 2);

    expect(batches).toHaveLength(0);
    expect(first.parent).toBe(root);
    expect(second.parent).toBe(root);
  });

  it.each([
    {
      property: 'channel',
      configure: (texture: THREE.Texture) => {
        texture.channel = 1;
      },
    },
    {
      property: 'minFilter',
      configure: (texture: THREE.Texture) => {
        texture.minFilter = THREE.NearestFilter;
      },
    },
  ])('does not instance textures with different $property settings', ({ configure }) => {
    const root = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const firstMap = new THREE.Texture({ width: 1, height: 1 });
    const secondMap = firstMap.clone();
    configure(secondMap);
    const first = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: '#778899', map: firstMap })
    );
    const second = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: '#778899', map: secondMap })
    );
    second.position.x = 2;
    root.add(first, second);

    const candidates = collectStaticBatchCandidates(root);
    const batches = createStaticMeshBatches(root, candidates, 'texture-settings', 2);

    expect(batches).toHaveLength(0);
    expect(first.parent).toBe(root);
    expect(second.parent).toBe(root);
  });

  it('handles cyclic custom material data conservatively', () => {
    const root = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const firstDefines: Record<string, unknown> = {};
    const secondDefines: Record<string, unknown> = {};
    firstDefines.self = firstDefines;
    secondDefines.self = secondDefines;
    const firstMaterial = new THREE.MeshStandardMaterial({ color: '#778899' });
    const secondMaterial = firstMaterial.clone();
    firstMaterial.defines = firstDefines as Record<string, string>;
    secondMaterial.defines = secondDefines as Record<string, string>;
    const first = new THREE.Mesh(geometry, firstMaterial);
    const second = new THREE.Mesh(geometry, secondMaterial);
    second.position.x = 2;
    root.add(first, second);

    const candidates = collectStaticBatchCandidates(root);
    const batches = createStaticMeshBatches(root, candidates, 'cyclic-material', 2);

    expect(candidates).toHaveLength(2);
    expect(batches).toHaveLength(0);
    expect(root.children).toEqual([first, second]);
  });

  it('partitions coarse geometry collisions without repeatedly rescanning every buffer', () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color: '#778899',
      transparent: true,
      opacity: 0.5,
    });
    const geometryCount = 24;
    let arrayReads = 0;

    for (let geometryIndex = 0; geometryIndex < geometryCount; geometryIndex += 1) {
      const values = new Float32Array(48 * 3);
      values.set([-1, -1, -1, 1, 1, 1]);
      values[24 * 3] = geometryIndex / geometryCount;
      const position = new THREE.BufferAttribute(values, 3);
      Object.defineProperty(position, 'array', {
        configurable: true,
        get: () => {
          arrayReads += 1;
          return values;
        },
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', position);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.x = geometryIndex * 2;
      root.add(mesh);
    }

    const candidates = collectStaticBatchCandidates(root);
    arrayReads = 0;
    const batches = createStaticMeshBatches(root, candidates, 'geometry-collisions', 2);

    expect(batches).toHaveLength(0);
    expect(root.children).toHaveLength(geometryCount);
    expect(arrayReads).toBeLessThan(geometryCount * 10);
  });

  it('instances exact transparent duplicates without merging their draw order', () => {
    const root = new THREE.Group();
    const left = makeBox(-1);
    const right = makeBox(1);
    for (const mesh of [left, right]) {
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.transparent = true;
      material.opacity = 0.45;
      material.depthWrite = false;
    }
    root.add(left, right);

    const candidates = collectStaticBatchCandidates(root);
    const batches = createStaticMeshBatches(root, candidates, 'transparent', 2);

    expect(batches).toHaveLength(1);
    expect(batches[0]?.mesh).toBeInstanceOf(THREE.InstancedMesh);
    expect((batches[0]?.mesh.material as THREE.Material).transparent).toBe(true);
  });

  it('rejects candidates whose transforms change during the sample window', () => {
    const root = new THREE.Group();
    const left = makeBox(-1);
    const right = makeBox(1);
    root.add(left, right);
    const candidates = collectStaticBatchCandidates(root);

    right.position.x = 4;
    right.updateMatrixWorld(true);
    const batches = createStaticMeshBatches(root, candidates, 'test', 2);

    expect(batches).toHaveLength(0);
    expect(left.visible).toBe(true);
    expect(right.visible).toBe(true);
  });

  it('does not merge different geometries at startup', () => {
    const root = new THREE.Group();
    const materialA = new THREE.MeshStandardMaterial({ color: '#445566', roughness: 0.8 });
    const materialB = new THREE.MeshStandardMaterial({ color: '#445566', roughness: 0.8 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), materialA);
    const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2, 8), materialB);
    cylinder.position.x = 3;
    root.add(box, cylinder);

    const candidates = collectStaticBatchCandidates(root);
    const batches = createStaticMeshBatches(root, candidates, 'test', 2);

    expect(batches).toHaveLength(0);
    expect(box.parent).toBe(root);
    expect(cylinder.parent).toBe(root);
  });

  it('does not merge colour variants when their geometry differs', () => {
    const root = new THREE.Group();
    const red = makeBox(-2, '#ff0000');
    const blue = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 2, 8),
      new THREE.MeshStandardMaterial({ color: '#0000ff', roughness: 0.7 })
    );
    blue.position.x = 2;
    root.add(red, blue);

    const candidates = collectStaticBatchCandidates(root);
    const batches = createStaticMeshBatches(root, candidates, 'test', 2);

    expect(batches).toHaveLength(0);
    expect(red.parent).toBe(root);
    expect(blue.parent).toBe(root);
  });

  it('preserves opaque colour variants with per-instance colours', () => {
    const root = new THREE.Group();
    const red = makeBox(-2, '#ff0000');
    const blue = makeBox(2, '#0000ff');
    root.add(red, blue);

    const candidates = collectStaticBatchCandidates(root);
    const batches = createStaticMeshBatches(root, candidates, 'colour', 2);

    expect(batches).toHaveLength(1);
    const instance = batches[0]?.mesh as THREE.InstancedMesh;
    expect(instance.count).toBe(2);
    const color = new THREE.Color();
    instance.getColorAt(0, color);
    expect(color.getHexString()).toBe('ff0000');
    instance.getColorAt(1, color);
    expect(color.getHexString()).toBe('0000ff');
    expect((instance.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('ffffff');

    // NOT `vertexColors`. This assertion used to require `true`, which is how a
    // green suite shipped 122 meshes that rendered with zero diffuse - three
    // shops, two cottages, the whole truck yard, the dock openings and every
    // machine status beacon.
    //
    // `instanceColor` does not need it: three defines `USE_INSTANCING_COLOR`
    // from `object.instanceColor !== null`, and that alone declares `vColor`,
    // initialises it to 1.0 and multiplies by the instance tint, while the
    // fragment side defines `USE_COLOR` from `vertexColors || instancingColor`
    // so the tint still reaches `diffuseColor`. Setting `vertexColors` ALSO
    // defines `USE_COLOR` in the vertex shader, which inserts `vColor *= color`
    // against a `color` attribute these geometries do not have - and an unbound
    // attribute reads as the WebGL generic default `(0, 0, 0, 1)`.
    //
    // Asserted against the geometry rather than hardcoded false, so a source
    // material that genuinely paints from vertex colours still passes.
    const batchMaterial = instance.material as THREE.MeshStandardMaterial;
    expect(batchMaterial.vertexColors).toBe(Boolean(instance.geometry.getAttribute('color')));
    expect(instance.instanceColor).not.toBeNull();
  });

  it('never leaves a batch material reading a vertex colour its geometry lacks', () => {
    // The general form of the defect above, over every batch this module can
    // produce - merged and instanced alike. `createMergedGeometry` writes a
    // `color` attribute into everything it builds, so the merge path may
    // legitimately set `vertexColors`; the instanced path reuses the
    // representative's geometry untouched and may not.
    const root = new THREE.Group();
    for (let i = 0; i < 6; i += 1) {
      root.add(makeBox(i * 2 - 6, i % 2 === 0 ? '#ff0000' : '#0000ff'));
    }

    const candidates = collectStaticBatchCandidates(root);
    const batches = createStaticMeshBatches(root, candidates, 'guard', 2);

    expect(batches.length).toBeGreaterThan(0);
    for (const batch of batches) {
      const material = batch.mesh.material as THREE.MeshStandardMaterial;
      if (!material.vertexColors) continue;
      expect(batch.mesh.geometry.getAttribute('color')).toBeDefined();
    }
  });

  it('keeps transparent colour variants in separate draw-order groups', () => {
    const root = new THREE.Group();
    const red = makeBox(-2, '#ff0000');
    const blue = makeBox(2, '#0000ff');
    for (const mesh of [red, blue]) {
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.transparent = true;
      material.opacity = 0.5;
      material.depthWrite = false;
    }
    root.add(red, blue);

    const candidates = collectStaticBatchCandidates(root);
    const batches = createStaticMeshBatches(root, candidates, 'transparent-colour', 2);

    expect(batches).toHaveLength(0);
    expect(red.parent).toBe(root);
    expect(blue.parent).toBe(root);
  });

  it('merges stable opaque singletons by material and spatial cell', () => {
    const root = new THREE.Group();
    const meshes = [
      new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: '#d97706', roughness: 0.7 })
      ),
      new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 2, 8),
        new THREE.MeshStandardMaterial({ color: '#2563eb', roughness: 0.7 })
      ),
      new THREE.Mesh(
        new THREE.SphereGeometry(0.65, 8, 6),
        new THREE.MeshStandardMaterial({ color: '#16a34a', roughness: 0.7 })
      ),
      new THREE.Mesh(
        new THREE.ConeGeometry(0.6, 1.5, 8),
        new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.7 })
      ),
    ];
    meshes.forEach((mesh, index) => {
      mesh.position.x = index * 2;
      root.add(mesh);
    });

    const candidates = collectStaticBatchCandidates(root);
    const batches = createStaticMeshBatches(root, candidates, 'merge', 2);

    expect(batches).toHaveLength(1);
    expect(batches[0]?.mesh).not.toBeInstanceOf(THREE.InstancedMesh);
    expect(batches[0]?.originals).toHaveLength(4);
    expect(batches[0]?.mesh.geometry.getAttribute('color')).toBeDefined();
    expect(root.userData.staticBatchStats).toMatchObject({
      mergedOriginals: 4,
      mergedMeshes: 1,
    });
  });

  it('accumulates diagnostics when candidates are processed in startup slices', () => {
    const root = new THREE.Group();
    const firstPair = [makeBox(-4), makeBox(-2)];
    const secondPair = [makeBox(2), makeBox(4)];
    root.add(...firstPair, ...secondPair);

    const candidates = collectStaticBatchCandidates(root);
    createStaticMeshBatches(root, candidates.slice(0, 2), 'slice:0', 2);
    createStaticMeshBatches(root, candidates.slice(2), 'slice:1', 2);

    expect(root.userData.staticBatchStats).toMatchObject({
      optimizedOriginals: 4,
      batches: 2,
      instancedOriginals: 4,
      instancedBatches: 2,
    });
  });

  it('orders lazy traversal results by batching affinity before startup slicing', () => {
    const root = new THREE.Group();
    const standardLeft = makeBox(1);
    const basicLeft = new THREE.Mesh(
      new THREE.BoxGeometry(1, 2, 3),
      new THREE.MeshBasicMaterial({ color: '#778899' })
    );
    basicLeft.position.x = 2;
    const standardRight = makeBox(3);
    const basicRight = new THREE.Mesh(
      new THREE.BoxGeometry(1, 2, 3),
      new THREE.MeshBasicMaterial({ color: '#778899' })
    );
    basicRight.position.x = 4;
    root.add(standardLeft, basicLeft, standardRight, basicRight);

    const candidates = collectStaticBatchCandidates(root);
    const ordered = orderStaticBatchCandidatesForChunking(root, candidates);
    const materialTypes = ordered.map(({ mesh }) => (mesh.material as THREE.Material).type);

    expect(materialTypes[0]).toBe(materialTypes[1]);
    expect(materialTypes[2]).toBe(materialTypes[3]);
    expect(new Set(materialTypes)).toEqual(new Set(['MeshBasicMaterial', 'MeshStandardMaterial']));
  });
});

describe('StaticMeshBatch surface callback', () => {
  /**
   * The finish has to reach the OUTPUT material, never the source. Assigning an
   * `onBeforeCompile` to a source material is what `isSupportedMaterial`
   * rejects, so doing it there would evict the mesh from batching for good -
   * a silent draw-call regression that would surface passes later.
   */
  it('treats the merged output and leaves the sources untouched', () => {
    const root = new THREE.Group();
    // Four distinct geometries so they merge rather than instance, all sharing
    // one merge-compatible material description.
    const sources: THREE.Mesh[] = [];
    for (let index = 0; index < 5; index += 1) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1 + index * 0.5, 2, 3),
        new THREE.MeshStandardMaterial({ color: '#8899aa', roughness: 0.9 })
      );
      mesh.position.set(index * 2, 0, 0);
      sources.push(mesh);
      root.add(mesh);
    }

    const candidates = collectStaticBatchCandidates(root);
    const batches = createStaticMeshBatches(root, candidates, 'test', 2, applyBatchWorldSurface);

    expect(batches.length).toBeGreaterThan(0);
    for (const batch of batches) {
      const material = batch.mesh.material as THREE.Material;
      expect(hasWorldSurface(material)).toBe(true);
    }
    for (const source of sources) {
      expect(hasWorldSurface(source.material as THREE.Material)).toBe(false);
    }
    const stats = root.userData.staticBatchStats as { surfaceProfiles: Record<string, number> };
    expect(stats.surfaceProfiles.masonry).toBeGreaterThan(0);
  });

  /**
   * A candidate the batcher declined to optimise must still be finished, and
   * finishing it must not disqualify it next time. `isSupportedMaterial` exempts
   * this module's own injection precisely so the second collection still sees it.
   */
  it('finishes leftovers, and a finished leftover is still a candidate', () => {
    const root = new THREE.Group();
    const lonely = new THREE.Mesh(
      new THREE.BoxGeometry(4, 1, 1),
      new THREE.MeshStandardMaterial({ color: '#445566', roughness: 0.4 })
    );
    root.add(lonely);

    const first = collectStaticBatchCandidates(root);
    expect(first).toHaveLength(1);
    const batches = createStaticMeshBatches(root, first, 'test', 2, applyBatchWorldSurface);
    expect(batches).toHaveLength(0);
    expect(hasWorldSurface(lonely.material as THREE.Material)).toBe(true);

    const second = collectStaticBatchCandidates(root);
    expect(second).toHaveLength(1);
  });

  /**
   * THE DECLINED SWEEP IS OPT-IN, and this is the test that made it so.
   *
   * `collectStaticBatchCandidates` finishes the materials of meshes it will
   * never batch - `InstancedMesh`, and anything under a dynamic ancestor - which
   * is the only pass that reaches the several hundred inline JSX materials in
   * `FactoryExterior` and `TruckBay`. But mounting `StaticMeshBatch` WITHOUT a
   * `surface` prop says "batch this, do not restyle it", and the first cut of
   * the sweep overruled that silently. It also kept its tally on the module, so
   * the counts accumulated across every root and every re-run and described no
   * tree in particular. Both were caught here rather than by reading.
   */
  it('sweeps declined meshes only when the caller asked for a finish', () => {
    const build = () => {
      const root = new THREE.Group();
      const instanced = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: '#8d8d88', roughness: 0.95 }),
        3
      );
      root.add(instanced);
      return { root, instanced };
    };

    const off = build();
    collectStaticBatchCandidates(off.root);
    expect(hasWorldSurface(off.instanced.material as THREE.Material)).toBe(false);
    expect(off.root.userData.staticBatchStats.surfaceProfiles).toEqual({});

    const on = build();
    collectStaticBatchCandidates(on.root, true);
    expect(hasWorldSurface(on.instanced.material as THREE.Material)).toBe(true);
    expect(on.root.userData.staticBatchStats.surfaceProfiles).toEqual({ 'declined:masonry': 1 });

    // Per-collection, not per-module: a second root reports its own count.
    const second = build();
    collectStaticBatchCandidates(second.root, true);
    expect(second.root.userData.staticBatchStats.surfaceProfiles).toEqual({
      'declined:masonry': 1,
    });
  });

  it('leaves the surface callback optional, and reports nothing when absent', () => {
    const root = new THREE.Group();
    root.add(makeBox(-2), makeBox(3));
    const candidates = collectStaticBatchCandidates(root);
    createStaticMeshBatches(root, candidates, 'test', 2);
    const stats = root.userData.staticBatchStats as { surfaceProfiles: Record<string, number> };
    expect(stats.surfaceProfiles).toEqual({});
  });
});
