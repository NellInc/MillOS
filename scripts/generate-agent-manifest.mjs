#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';
import {
  canonicalStringify,
  validateSystemRegistry,
} from '../src/agent/contracts/registryValidation.js';
import { SYSTEM_REGISTRY_SOURCE } from '../src/agent/registry/systemRegistrySource.js';
import { buildDirectStoreCallInventory } from './lib/agent-mutation-inventory.mjs';

const root = resolve(import.meta.dirname, '..');
const outputDirectory = resolve(root, 'build/generated/agent');
const checkOnly = process.argv.includes('--check');
const registryPath = 'src/agent/registry/systemRegistrySource.js';
const infrastructurePaths = [
  'package.json',
  'scripts/agent-brief.mjs',
  'scripts/generate-agent-manifest.mjs',
  'scripts/measure-agent-query-plane.mjs',
  'scripts/lib/agent-engineering-brief.mjs',
  'scripts/lib/agent-mutation-inventory.mjs',
  'src/agent/adapters/runtime/installAgentRuntime.ts',
  'src/agent/adapters/runtime/runtimeProjection.ts',
  'src/agent/contracts/queryContracts.ts',
  'src/agent/contracts/systemManifest.ts',
  'src/agent/contracts/registryValidation.js',
  'src/agent/ontology/semanticUri.js',
  'src/agent/query/queryService.d.ts',
  'src/agent/query/queryService.js',
  'src/agent/registry/systemRegistrySource.d.ts',
  registryPath,
  'tsconfig.agent.json',
];

const validation = validateSystemRegistry(SYSTEM_REGISTRY_SOURCE);
if (!validation.valid) {
  console.error('Agent registry validation failed:');
  for (const problem of validation.problems) {
    console.error(`  ${problem.code} ${problem.path}: ${problem.message}`);
  }
  process.exit(1);
}

const packageMetadata = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
if (packageMetadata.version !== SYSTEM_REGISTRY_SOURCE.product.version) {
  console.error(
    `Registry product version ${SYSTEM_REGISTRY_SOURCE.product.version} does not match package ${packageMetadata.version}.`
  );
  process.exit(1);
}

const referencedPaths = collectReferencedPaths(SYSTEM_REGISTRY_SOURCE);
const sourceFiles = [...new Set([...infrastructurePaths, ...referencedPaths])].sort();
for (const sourcePath of sourceFiles) {
  if (!existsSync(resolve(root, sourcePath))) {
    console.error(`Agent registry references missing path: ${sourcePath}`);
    process.exit(1);
  }
}

const sourceFingerprint = fingerprintFiles(sourceFiles);
const manifest = {
  ...SYSTEM_REGISTRY_SOURCE,
  generation: {
    generatorVersion: 1,
    sourceFingerprint,
    sourceFiles,
  },
};

const mutationInventory = buildDirectStoreCallInventory(root);
const eventMeasurement = measureEventContract();
const artifacts = new Map([
  ['system-manifest.json', `${canonicalStringify(manifest, 2)}\n`],
  ['capabilities.md', renderCapabilityCards(manifest)],
  ['mutation-inventory.json', `${canonicalStringify(mutationInventory, 2)}\n`],
  ['event-contract-measurement.json', `${canonicalStringify(eventMeasurement, 2)}\n`],
]);

let failed = false;
for (const [name, content] of artifacts) {
  const outputPath = resolve(outputDirectory, name);
  if (checkOnly) {
    if (!existsSync(outputPath) || readFileSync(outputPath, 'utf8') !== content) {
      console.error(`Generated agent artifact is stale or missing: ${relative(root, outputPath)}`);
      failed = true;
    }
  } else {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, content);
    console.log(`wrote ${relative(root, outputPath)}`);
  }
}

if (failed) process.exit(1);
if (checkOnly) console.log(`Agent manifest check passed (${sourceFingerprint}).`);

function collectReferencedPaths(registry) {
  const paths = [];
  for (const group of [
    registry.domains,
    registry.invariants,
    registry.entities,
    registry.capabilities,
  ]) {
    for (const descriptor of group) {
      for (const sourceRef of descriptor.sourceRefs) paths.push(sourceRef.path);
    }
  }
  return paths;
}

function fingerprintFiles(paths) {
  const hash = createHash('sha256');
  for (const sourcePath of paths) {
    hash.update(sourcePath);
    hash.update('\0');
    hash.update(readFileSync(resolve(root, sourcePath)));
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

function renderCapabilityCards(manifestValue) {
  const lines = [
    '# MillOS Generated Capability Cards',
    '',
    '**Status:** generated from `src/agent/registry/systemRegistrySource.js`',
    '',
    `**Source fingerprint:** \`${manifestValue.generation.sourceFingerprint}\``,
    '',
    'These cards are discovery evidence. A `candidate` status grants no execution authority.',
    '',
  ];
  for (const capability of [...manifestValue.capabilities].sort((left, right) =>
    left.id.localeCompare(right.id)
  )) {
    const targetKinds = capability.targetKinds.map((kind) => `\`${kind}\``).join(', ');
    lines.push(
      `## ${capability.id} v${capability.version}`,
      '',
      `**${capability.title}**`,
      '',
      `Status: \`${capability.status}\`. Owner: \`${capability.ownerDomainId}\`. Risk: \`${capability.risk}\`.`,
      '',
      `Modes: ${capability.modes.map((mode) => `\`${mode}\``).join(', ')}. Targets: ${targetKinds}.`,
      '',
      `Preview: \`${capability.supportsPreview}\`. Reversible: \`${capability.reversible}\`. Expected local latency: \`${capability.expectedLatencyMs} ms\`.`,
      '',
      '### Preconditions',
      '',
      ...capability.preconditions.map((item) => `1. ${item}`),
      '',
      '### Reads',
      '',
      ...capability.reads.map((item) => `1. \`${item}\``),
      '',
      '### Writes',
      '',
      ...capability.writes.map((item) => `1. \`${item}\``),
      '',
      '### Invariants',
      '',
      ...capability.invariantIds.map((item) => `1. \`${item}\``),
      '',
      '### Verification',
      '',
      capability.verifier,
      '',
      `Current callers: ${capability.currentCallers.length === 0 ? 'none found in the Phase 0 source inventory' : capability.currentCallers.map((item) => `\`${item}\``).join(', ')}.`,
      ''
    );
  }
  return `${lines.join('\n')}\n`;
}

function measureEventContract() {
  const eventCount = 1000;
  const events = Array.from({ length: eventCount }, (_, index) => ({
    eventId: `evt-${String(index + 1).padStart(6, '0')}`,
    schemaVersion: 1,
    correlationId: `corr-${String(Math.floor(index / 8) + 1).padStart(5, '0')}`,
    causationId: index % 8 === 0 ? null : `evt-${String(index).padStart(6, '0')}`,
    commandId: `cmd-${String(Math.floor(index / 8) + 1).padStart(5, '0')}`,
    actorId: 'deterministic-scenario-controller',
    domain: ['campaign', 'production', 'material', 'quality'][index % 4],
    kind: 'prototype.state-transition',
    wallTime: '2026-08-31T00:00:00.000Z',
    simulationTime: { day: 1, hour: (index % 240) / 10 },
    beforeRevision: `r${index}`,
    afterRevision: `r${index + 1}`,
    payload: { targetUri: 'millos://order/order-001', changed: true },
    provenance: [{ kind: 'simulation', source: 'phase-0-structural-prototype' }],
  }));
  const exportText = canonicalStringify({ schemaVersion: 1, events });
  const bytes = Buffer.byteLength(exportText);
  return {
    schemaVersion: 1,
    measurementKind: 'synthetic-structural-prototype',
    eventCount,
    uncompressedBytes: bytes,
    meanBytesPerEvent: Number((bytes / eventCount).toFixed(2)),
    proposedInMemoryEventBound: 1000,
    persistenceDecision: 'bounded-memory-first',
    decisionReason:
      'The initial command slices need bounded diagnostic replay, and this measured prototype remains small enough to export directly. Reassess IndexedDB after a full-shift causal scenario.',
  };
}
