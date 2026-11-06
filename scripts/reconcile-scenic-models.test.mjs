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
import { NodeIO, getBounds } from '@gltf-transform/core';
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

it('seats the rebuilt Cupid figure on the unchanged pedestal inside the delivered envelope', async () => {
  // D-034 (2026-11-06): the figure is authored geometry from
  // scripts/blender/authored/cupid-authored-body.py, seated at source, so the
  // retired figure-contact shift no longer applies. Its invariants stay: the
  // pedestal keeps the 1.4 x 1.3 x 1.4 m block it had, the figure sits on its
  // top (sunk at most 3 mm, never floating) and inside its footprint, and the
  // whole statue keeps its manifest envelope.
  const doc = await new NodeIO().read('public/models/world/cupid-authored-body.glb');
  const parts = Object.fromEntries(
    doc
      .getRoot()
      .listNodes()
      .filter((node) => node.getMesh())
      .map((node) => [node.getName(), getBounds(node)])
  );
  const figure = parts['Cupid-authored-bodyBody'],
    pedestal = parts['Cupid-authored-bodyPedestal'];
  expect(Object.keys(parts)).toHaveLength(2);
  [-0.7, 0, -0.7].forEach((v, k) => expect(pedestal.min[k]).toBeCloseTo(v, 6));
  [0.7, 1.3, 0.7].forEach((v, k) => expect(pedestal.max[k]).toBeCloseTo(v, 6));
  expect(figure.min[1]).toBeLessThanOrEqual(pedestal.max[1] + 1e-6);
  expect(pedestal.max[1] - figure.min[1]).toBeLessThanOrEqual(0.003);
  for (const k of [0, 2]) {
    expect(figure.min[k]).toBeGreaterThan(pedestal.min[k]);
    expect(figure.max[k]).toBeLessThan(pedestal.max[k]);
  }
  const manifest = JSON.parse(await readFile('public/models/asset-manifest.json', 'utf8'));
  const contract = manifest.assets.find((asset) => asset.id === 'world-cupid-authored-body');
  const whole = getBounds(doc.getRoot().listScenes()[0]);
  const size = [0, 1, 2].map((k) => whole.max[k] - whole.min[k]);
  for (const [k, axis] of [
    [0, 'width'],
    [1, 'height'],
    [2, 'length'],
  ]) {
    expect(size[k]).toBeGreaterThanOrEqual(contract.bounds[axis][0]);
    expect(size[k]).toBeLessThanOrEqual(contract.bounds[axis][1]);
  }
  expect(Math.abs(whole.min[1])).toBeLessThanOrEqual(contract.bounds.groundTolerance);
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
  const lockInputs = await inputs(lock.SPEC.id);
  const [baseline, , , current] = lockInputs;
  const before = lock.inspect(baseline),
    after = lock.inspect(current, true);
  const { receipt } = deriveScenicModel(lock.SPEC.id, ...lockInputs);
  const retained = before.indices.slice(0, 150).concat(before.indices.slice(186));
  // v7 rebuilds the leaves into the freed rows; the deck and post faces it keeps
  // lead the index buffer in baseline order, and none of them is the beam.
  expect(receipt.removedTriangleIds).toEqual(Array.from({ length: 12 }, (_, i) => 50 + i));
  expect(receipt.keptTriangleIds.every((t) => t < 50 || t > 61)).toBe(true);
  const kept = receipt.keptTriangleIds.flatMap((t) => before.indices.slice(t * 3, t * 3 + 3));
  expect(kept.every((row) => retained.includes(row))).toBe(true);
  expect(after.indices.slice(0, kept.length)).toEqual(kept);
  expect(after.indices).toHaveLength(216);
  // Kept rows are byte-exact apart from the post footings' seated y word.
  const footings = new Set(receipt.seatedPosts.postRows);
  for (const row of new Set(kept)) {
    const at = 432 + row * 44;
    if (footings.has(row)) {
      expect(after.binary.subarray(at, at + 4)).toEqual(before.binary.subarray(at, at + 4));
      expect(after.binary.subarray(at + 8, at + 44)).toEqual(
        before.binary.subarray(at + 8, at + 44)
      );
    } else expect(after.binary.subarray(at, at + 44)).toEqual(before.binary.subarray(at, at + 44));
  }
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
  for (const index of new Set(kept)) {
    const old = new Vector3(...before.points[index]).add(new Vector3(0, -0.75, -1.748748));
    const next = new Vector3(...after.points[index]).add(new Vector3(...wrapper));
    // A seated footing lands on its stated target height; x and z stay put.
    if (footings.has(index)) {
      expect(next.y).toBeCloseTo(receipt.seatedPosts.postFooting.after - 0.75, 5);
      next.y = old.y;
    }
    expect(next.applyMatrix4(parent).toArray()).toEqual(old.applyMatrix4(parent).toArray());
  }
});
