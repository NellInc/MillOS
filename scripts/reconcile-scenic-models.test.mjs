// @vitest-environment node
import { readFile } from 'node:fs/promises';
import React from 'react';
import ts from 'typescript';
import { CapsuleGeometry, Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  RECONCILED_SCENIC_MODELS,
  deriveScenicModel,
  assertScenicNormalization,
} from './reconcile-scenic-models.mjs';
import * as cupid from './refine-cupid-figure-contact.mjs';
import * as lock from './refine-lock-gate-body.mjs';

const provenance = JSON.parse(await readFile('assets/source/models/world/PROVENANCE.json'));
const source = await readFile('src/components/FactoryExterior.tsx', 'utf8');
const ast = ts.createSourceFile(
  'FactoryExterior.tsx',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);
const GeneratedBoundary = () => null;
const GeneratedModel = () => null;
const LockGateJoinery = () => null;
const LockGateLighting = () => null;

function component(name) {
  const statement = ast.statements.find(
    (node) =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some(
        (declaration) => declaration.name.getText(ast) === name
      )
  );
  expect(statement, `Missing live ${name} declaration`).toBeDefined();
  const compiled = ts.transpileModule(`${statement.getText(ast)}\nreturn ${name};`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(
    'React',
    'THREE',
    'GeneratedBoundary',
    'GeneratedModel',
    'LockGateJoinery',
    'LockGateLighting',
    compiled
  )(React, { DoubleSide: 2 }, GeneratedBoundary, GeneratedModel, LockGateJoinery, LockGateLighting);
}

function elements(tree) {
  return React.Children.toArray(tree).flatMap((element) =>
    React.isValidElement(element) ? [element, ...elements(element.props.children)] : []
  );
}

async function inputs(id) {
  const slug = id.slice('world-'.length);
  return Promise.all([
    readFile(`src/test/fixtures/${slug}.baseline.glb`),
    readFile(`assets/source/models/world/${slug}-tripo-original.glb`),
    readFile(`assets/source/models/world/${slug}-authored-vertex-colour-tripo-finish.glb`),
    readFile(`public/models/world/${slug}.glb`),
  ]);
}

describe.each(Object.keys(RECONCILED_SCENIC_MODELS))('%s current-source replay', (id) => {
  it('reproduces the installed bytes and refuses changed baselines, sources and deliveries', async () => {
    const args = await inputs(id);
    const result = deriveScenicModel(id, ...args);
    expect(result.bytes.equals(args[3])).toBe(true);
    for (let index = 0; index < 4; index++) {
      const changed = [...args];
      changed[index] = Buffer.from(changed[index]);
      changed[index][changed[index].length - 1] ^= 1;
      expect(() => deriveScenicModel(id, ...changed)).toThrow();
    }
    expect(() => deriveScenicModel(id, args[3], ...args.slice(1))).toThrow(
      'normalized input changed'
    );
    const pack = provenance.sourcePacks.find((entry) => entry.id === id);
    const row = {
      id,
      file: pack.runtimeDerivative.file.replace('public/models/', ''),
      ...pack.normalization,
      sourceSha256: pack.sha256,
      outputSha256: pack.runtimeDerivative.sha256,
      outputBytes: pack.runtimeDerivative.bytes,
      blenderPreparation: pack.blenderPreparation,
      geometryRefinement: pack.geometryRefinement,
    };
    await assertScenicNormalization(id, row, args[3], ...args.slice(0, 3));
    for (const mutate of [
      (stale) => {
        stale.bounds.height += 1;
      },
      (stale) => {
        stale.geometryRefinement.outputSha256 = 'stale';
      },
      (stale) => {
        stale.outputSha256 = 'stale';
      },
      (stale) => {
        stale.blenderPreparation.sha256 = 'stale';
      },
      (stale) => {
        stale.renderVertices += 3;
      },
    ]) {
      const stale = structuredClone(row);
      mutate(stale);
      await expect(
        assertScenicNormalization(id, stale, args[3], ...args.slice(0, 3))
      ).rejects.toThrow();
    }
  });
});

it('seats the complete Cupid figure while preserving pedestal, other attributes and embedded maps', async () => {
  const [baseline, , , current] = await inputs(cupid.SPEC.id);
  const before = cupid.inspect(baseline),
    after = cupid.inspect(current);
  expect(before.meshes[0].bounds.min[1] - before.meshes[1].bounds.max[1]).toBeCloseTo(0.0507494, 6);
  expect(after.meshes[0].bounds.min[1]).toBeCloseTo(after.meshes[1].bounds.max[1], 6);
  expect(after.meshes[1].points).toEqual(before.meshes[1].points);
  expect(after.images).toEqual(before.images);
  expect(after.json.materials).toEqual(before.json.materials);
  for (let mesh = 0; mesh < 2; mesh++) {
    expect(after.meshes[mesh].triangles).toEqual(before.meshes[mesh].triangles);
    for (const [semantic, accessor] of Object.entries(before.meshes[mesh].primitive.attributes)) {
      if (semantic === 'POSITION' && mesh === 0) continue;
      const a = before.accessor(accessor),
        b = after.accessor(accessor);
      for (let i = 0; i < a.definition.count; i++) expect(b.read(i)).toEqual(a.read(i));
    }
  }
  for (let i = 0; i < before.meshes[0].points.length; i++) {
    const a = before.meshes[0].points[i],
      b = after.meshes[0].points[i];
    expect(b[0]).toBe(a[0]);
    expect(b[2]).toBe(a[2]);
    expect(b[1] - a[1]).toBeCloseTo(-0.0507494, 7);
  }
});

it('keeps the live Cupid fallback legs in contact with the unchanged pedestal', () => {
  const tree = component('CupidStatue')({ position: [0, 0, 0] });
  const boundary = elements(tree).find((element) => element.type === GeneratedBoundary);
  const figure = elements(boundary.props.fallback).find((element) => element.type === 'group');
  const legs = elements(figure).filter(
    (element) => element.type === 'mesh' && element.props.position?.[1] === 0
  );
  expect(legs).toHaveLength(2);
  for (const leg of legs) {
    const geometry = new CapsuleGeometry(...leg.props.children[0].props.args);
    try {
      geometry.applyMatrix4(new Matrix4().makeRotationZ(leg.props.rotation[2]));
      geometry.computeBoundingBox();
      const foot = geometry.boundingBox.min.y + figure.props.position[1];
      expect(Math.abs(foot - 1.3)).toBeLessThan(0.001);
    } finally {
      geometry.dispose();
    }
  }
});

it('removes only the isolated beam and pairs the actual live wrapper with the new local origin', async () => {
  const [baseline, , , current] = await inputs(lock.SPEC.id);
  const before = lock.inspect(baseline),
    after = lock.inspect(current, true);
  const retained = before.indices.slice(0, 150).concat(before.indices.slice(186));
  expect(after.indices).toEqual(retained);
  expect(after.indices).toHaveLength(180);
  expect(after.localPoints).toEqual(before.localPoints);
  expect(after.binary.subarray(432).equals(before.binary.subarray(432))).toBe(true);
  expect(after.images).toEqual(before.images);
  expect(after.json.materials).toEqual(before.json.materials);
  const tree = component('LockGate')({ position: [11, 2, -7], width: 10, rotation: 0.3 });
  const nodes = elements(tree);
  const boundary = nodes.find((element) => element.type === GeneratedBoundary);
  const wrapper = boundary.props.children.props.position;
  expect(wrapper).toEqual([0, -0.75, 0]);
  expect(boundary.props.children.props.children.type).toBe(GeneratedModel);
  expect(nodes.filter((element) => element.type === LockGateJoinery)).toHaveLength(1);
  expect(nodes.filter((element) => element.type === LockGateLighting)).toHaveLength(1);
  const parent = new Matrix4().makeRotationY(0.3).setPosition(11, 2, -7);
  for (const index of new Set(retained)) {
    const old = new Vector3(...before.points[index])
      .add(new Vector3(0, -0.75, -1.748748))
      .applyMatrix4(parent);
    const next = new Vector3(...after.points[index])
      .add(new Vector3(...wrapper))
      .applyMatrix4(parent);
    expect(next.toArray()).toEqual(old.toArray());
  }
});
