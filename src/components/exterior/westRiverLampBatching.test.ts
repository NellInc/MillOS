import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as THREE from 'three';
import type React from 'react';
import { CAFE_COURT_LANTERN } from '../../constants/publicRealmLayout';
import {
  collectStaticBatchCandidates,
  createStaticMeshBatches,
} from '../performance/StaticMeshBatch';
import {
  ExteriorLampPool,
  CANAL_CROSSING_LAMPS,
  CANAL_CROSSING_LIGHT,
  WEST_FACTORY_PATH_LAMPS,
  WEST_FACTORY_PATH_POOL_RADIUS,
} from './ExteriorLighting';
import { createWestRiverLampGrounding } from './westRiverLampGrounding';
import { getTerrainGridSegments } from '../terrain/terrainTypes';

type Placement = { position: [number, number, number]; radius: number; selected?: boolean };

function actualExteriorPoolPlacements(): Placement[] {
  const text = readFileSync('src/components/FactoryExterior.tsx', 'utf8');
  const ast = ts.createSourceFile(
    'FactoryExterior.tsx',
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const placements: Placement[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'PathLamp') {
      const attributes = node.attributes.properties;
      const position = attributes.find(
        (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(ast) === 'position'
      );
      const init = position?.initializer;
      if (
        init &&
        ts.isJsxExpression(init) &&
        init.expression &&
        ts.isArrayLiteralExpression(init.expression)
      ) {
        const coordinates = init.expression.elements.flatMap((coordinate) => {
          if (ts.isSpreadElement(coordinate)) {
            if (coordinate.expression.getText(ast) !== 'CAFE_COURT_LANTERN')
              throw new Error('Unknown lamp position spread');
            return [...CAFE_COURT_LANTERN];
          }
          const value = Number(coordinate.getText(ast));
          if (!Number.isFinite(value)) throw new Error('Unknown lamp position coordinate');
          return [value];
        });
        expect(coordinates).toHaveLength(3);
        expect(coordinates.every(Number.isFinite)).toBe(true);
        const style = attributes.find(
          (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(ast) === 'style'
        );
        placements.push({
          position: coordinates as [number, number, number],
          radius:
            style?.initializer &&
            ts.isStringLiteral(style.initializer) &&
            style.initializer.text === 'victorian'
              ? 5.5
              : 4.8,
        });
      } else if (
        !init ||
        !ts.isJsxExpression(init) ||
        !init.expression ||
        !['position', 'grounding.position', 'lamp.position'].includes(init.expression.getText(ast))
      ) {
        throw new Error('Unknown PathLamp position expression');
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  // The real exported path array drives the one mapped PathLamp call.
  expect(text).toContain('WEST_FACTORY_PATH_LAMPS.map((position) => (');
  placements.push(
    ...WEST_FACTORY_PATH_LAMPS.map((position) => ({
      position,
      radius: WEST_FACTORY_PATH_POOL_RADIUS,
    }))
  );
  expect(text.match(/<WestRiverPathLamp\s*\/>/g)).toHaveLength(1);
  expect(text).toContain('CANAL_CROSSING_LAMPS.map((lamp) => (');
  placements.push(
    ...CANAL_CROSSING_LAMPS.map((lamp) => ({
      position: lamp.position,
      radius: CANAL_CROSSING_LIGHT.poolRadius,
    }))
  );
  placements.push({ position: [-60, 0, -110], radius: 4.8, selected: true });
  expect(placements).toHaveLength(22);
  return placements;
}

/** Source potential draws when the shared night driver makes its material visible.
 * This uses the real batching implementation, without a renderer or GPU claim.
 */
function batchedPoolFixture(quality: string, after: boolean) {
  const root = new THREE.Group();
  const grounding = after ? createWestRiverLampGrounding(getTerrainGridSegments(quality)) : null;
  for (const placement of actualExteriorPoolPlacements()) {
    const element = (
      ExteriorLampPool as (props: {
        radius: number;
        geometry?: THREE.BufferGeometry;
      }) => React.ReactElement<any>
    )({
      radius: placement.radius,
      geometry: placement.selected ? grounding?.poolGeometry : undefined,
    });
    const parent = new THREE.Group();
    parent.position.fromArray(
      placement.selected && grounding ? grounding.position : placement.position
    );
    const p = element.props;
    const mesh = new THREE.Mesh(p.geometry, p.material);
    mesh.position.fromArray(p.position);
    mesh.rotation.fromArray(p.rotation);
    mesh.scale.fromArray(p.scale);
    mesh.renderOrder = p.renderOrder;
    parent.add(mesh);
    root.add(parent);
  }
  root.updateMatrixWorld(true);
  const candidates = collectStaticBatchCandidates(root);
  expect(candidates).toHaveLength(22);
  const batches = createStaticMeshBatches(root, candidates, 'west-lamp-contract', 2);
  const submissions: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && object.visible) submissions.push(object);
  });
  const triangles = submissions.reduce(
    (sum, mesh) =>
      sum +
      (mesh.geometry.index!.count / 3) * (mesh instanceof THREE.InstancedMesh ? mesh.count : 1),
    0
  );
  return {
    submissions,
    triangles,
    root,
    dispose() {
      for (const batch of batches) {
        if (batch.mesh instanceof THREE.InstancedMesh) batch.mesh.dispose();
        if (batch.ownsGeometry) batch.mesh.geometry.dispose();
        if (batch.ownsMaterial)
          (Array.isArray(batch.mesh.material)
            ? batch.mesh.material
            : [batch.mesh.material]
          ).forEach((material) => material.dispose());
      }
      grounding?.poolGeometry.dispose();
    },
  };
}

describe.each(['low', 'medium', 'high', 'ultra'])(
  'west lamp real static batching at %s',
  (quality) => {
    it('records the explicit +1 potential pool submission and +6 triangles, with one shared material/map', () => {
      const before = batchedPoolFixture(quality, false);
      const after = batchedPoolFixture(quality, true);
      try {
        expect(before.submissions).toHaveLength(1);
        expect(after.submissions).toHaveLength(2);
        expect(before.triangles).toBe(22 * 28);
        expect(after.triangles).toBe(before.triangles + 6);
        expect(before.root.userData.staticBatchStats.instancedOriginals).toBe(22);
        expect(after.root.userData.staticBatchStats.instancedOriginals).toBe(21);
        const materials = [...before.submissions, ...after.submissions].map(
          (mesh) => mesh.material
        );
        expect(new Set(materials).size).toBe(1);
        const maps = materials.map((material) => (material as THREE.MeshBasicMaterial).map);
        expect(new Set(maps).size).toBe(1);
        expect(
          after.submissions.filter((mesh) => !(mesh instanceof THREE.InstancedMesh))
        ).toHaveLength(1);
      } finally {
        before.dispose();
        after.dispose();
      }
    });
  }
);
