#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveArchiveOutput } from './lib/archive-output.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDirectory = path.join(projectRoot, 'public');
const outputArgumentIndex = process.argv.indexOf('--output');
if (outputArgumentIndex >= 0 && !process.argv[outputArgumentIndex + 1]) {
  throw new Error('--output requires a path');
}
const unknownArguments = process.argv
  .slice(2)
  .filter(
    (argument, index, argumentsList) =>
      argument !== '--output' && argumentsList[index - 1] !== '--output'
  );
if (unknownArguments.length > 0) {
  throw new Error(`Unknown argument(s): ${unknownArguments.join(', ')}`);
}
const outputDirectory = resolveArchiveOutput(
  projectRoot,
  outputArgumentIndex >= 0 && process.argv[outputArgumentIndex + 1]
    ? process.argv[outputArgumentIndex + 1]
    : 'dist-archives'
);

function assertRegularTree(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Static archives may not contain symbolic links: ${absolutePath}`);
    }
    if (entry.isDirectory()) {
      assertRegularTree(absolutePath);
    } else if (!entry.isFile()) {
      throw new Error(`Static archives may contain only regular files: ${absolutePath}`);
    }
  }
}

const versions = fs
  .readdirSync(publicDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^v\d+\.\d+$/.test(entry.name))
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

if (versions.length === 0) {
  throw new Error('No static version archives were found in public.');
}

fs.rmSync(outputDirectory, { recursive: true, force: true });
fs.mkdirSync(outputDirectory, { recursive: true });

const manifest = {
  schemaVersion: 1,
  versions: [],
};

for (const version of versions) {
  const source = path.join(publicDirectory, version);
  const destination = path.join(outputDirectory, version);
  assertRegularTree(source);
  fs.cpSync(source, destination, {
    recursive: true,
    filter: (entry) => path.basename(entry) !== '.DS_Store',
  });

  const files = [];
  const pending = [destination];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(absolutePath);
        continue;
      }
      const content = fs.readFileSync(absolutePath);
      files.push({
        path: path.relative(outputDirectory, absolutePath).split(path.sep).join('/'),
        bytes: content.byteLength,
        sha256: createHash('sha256').update(content).digest('hex'),
      });
    }
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  manifest.versions.push({
    version,
    files,
    bytes: files.reduce((total, file) => total + file.bytes, 0),
  });
}

fs.writeFileSync(
  path.join(outputDirectory, 'archive-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`
);

console.log(
  `Packaged ${versions.length} isolated static archives in ${path.relative(projectRoot, outputDirectory)}.`
);
