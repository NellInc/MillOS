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
import { RAILWAY_LAMPS } from '../scenery/RailwayStation';

/** Every exterior pool: 21 park, path and canal lamps (the silo-yard lamp at z 30,
 * which stood inside a silo, is gone) plus the railway's platform and forecourt lamps. */
const POOL_COUNT = 21 + RAILWAY_LAMPS.length;

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
      const name = attributes.find(
        (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(ast) === 'name'
      )?.initializer;
      if (name && ts.isStringLiteral(name) && name.text === 'railway-lamp') {
        // Destructured from the real RAILWAY_LAMPS rows; placed from them below.
        expect(init?.getText(ast)).toBe('{[x, y, z]}');
      } else if (
        init &&
        ts.isJsxExpression(init) &&
        init.expression &&
        ts.isArrayLiteralExpression(init.expression)
      ) {
        // A coordinate may be the parameter of an enclosing `[...literals].map((v) =>`,
        // as the towpath row is; that call places one lamp per literal.
        const mapped = (identifier: string) => {
          for (let up: ts.Node | undefined = node.parent; up; up = up.parent) {
            if (
              ts.isArrowFunction(up) &&
              up.parameters.length === 1 &&
              up.parameters[0].name.getText(ast) === identifier &&
              ts.isCallExpression(up.parent) &&
              ts.isPropertyAccessExpression(up.parent.expression) &&
              up.parent.expression.name.getText(ast) === 'map' &&
              ts.isArrayLiteralExpression(up.parent.expression.expression)
            ) {
              const values = up.parent.expression.expression.elements.map((e) =>
                Number(e.getText(ast))
              );
              if (!values.every(Number.isFinite)) break;
              return values;
            }
          }
          throw new Error('Unknown lamp position coordinate');
        };
        const axes = init.expression.elements.flatMap((coordinate) => {
          if (ts.isSpreadElement(coordinate)) {
            if (coordinate.expression.getText(ast) !== 'CAFE_COURT_LANTERN')
              throw new Error('Unknown lamp position spread');
            return CAFE_COURT_LANTERN.map((value) => [value]);
          }
          const value = Number(coordinate.getText(ast));
          if (Number.isFinite(value)) return [[value]];
          if (!ts.isIdentifier(coordinate)) throw new Error('Unknown lamp position coordinate');
          return [mapped(coordinate.getText(ast))];
        });
        expect(axes).toHaveLength(3);
        expect(axes.filter((values) => values.length > 1).length).toBeLessThanOrEqual(1);
        const count = Math.max(...axes.map((values) => values.length));
        const style = attributes.find(
          (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(ast) === 'style'
        );
        for (let i = 0; i < count; i++) {
          const coordinates = axes.map((values) => values[values.length > 1 ? i : 0]);
          expect(coordinates.every(Number.isFinite)).toBe(true);
          placements.push({
            position: coordinates as [number, number, number],
            radius:
              style?.initializer &&
              ts.isStringLiteral(style.initializer) &&
              style.initializer.text === 'victorian'
                ? 5.5
                : 4.8,
          });
        }
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
  // The railway's platform and forecourt lamps share the same pool material and
  // batch with every other exterior pool, at their own per-lamp radius.
  expect(text).toContain('RAILWAY_LAMPS.map(([x, y, z, pool]) => (');
  expect(text).toContain('poolRadius={pool}');
  placements.push(
    ...RAILWAY_LAMPS.map(([x, y, z, pool]) => ({
      position: [x, y, z] as [number, number, number],
      radius: pool,
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
  expect(placements).toHaveLength(POOL_COUNT);
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
  expect(candidates).toHaveLength(POOL_COUNT);
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
        expect(before.triangles).toBe(POOL_COUNT * 28);
        expect(after.triangles).toBe(before.triangles + 6);
        expect(before.root.userData.staticBatchStats.instancedOriginals).toBe(POOL_COUNT);
        expect(after.root.userData.staticBatchStats.instancedOriginals).toBe(POOL_COUNT - 1);
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
