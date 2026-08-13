#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputArgumentIndex = process.argv.indexOf('--dist');
const distDirectory = path.resolve(
  projectRoot,
  outputArgumentIndex >= 0 && process.argv[outputArgumentIndex + 1]
    ? process.argv[outputArgumentIndex + 1]
    : 'dist'
);
const reportDirectory = path.join(projectRoot, 'test-results');
const reportPath = path.join(reportDirectory, 'bundle-budget.json');
const MAX_INITIAL_GZIP_BYTES = 2.5 * 1024 * 1024;
const MAX_CURRENT_DIST_BYTES = 170 * 1024 * 1024;
const OPTIONAL_CHUNK_PATTERN =
  /(rapier|recharts|charts?|peerjs|multiplayer|postprocessing|web[._-]?llm|webgpu|scadapanel|scada-workspace)/i;
const musicCredits = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'music-credits.json'), 'utf8')
);
const REQUIRED_AUDIO = new Set(
  musicCredits.tracks.filter((track) => track.currentRole !== null).map((track) => track.file)
);

if (!fs.existsSync(distDirectory)) {
  throw new Error(`Build output does not exist: ${distDirectory}`);
}

const failures = [];
const warnings = [];
const manifestPath = path.join(distDirectory, '.vite', 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  failures.push('Vite manifest is missing.');
}

const manifest = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  : {};
const entryRecords = Object.values(manifest).filter((record) => record.isEntry);
if (entryRecords.length !== 1) {
  failures.push(`Expected one application entry, found ${entryRecords.length}.`);
}

const initialFiles = new Set();
const visitedRecords = new Set();
function visitRecord(key) {
  if (!key || visitedRecords.has(key)) return;
  visitedRecords.add(key);
  const record = manifest[key];
  if (!record) {
    failures.push(`Manifest import is missing: ${key}`);
    return;
  }
  if (record.file?.endsWith('.js')) initialFiles.add(record.file);
  for (const cssFile of record.css ?? []) initialFiles.add(cssFile);
  for (const importedKey of record.imports ?? []) visitRecord(importedKey);
}

for (const [key, record] of Object.entries(manifest)) {
  if (record.isEntry) visitRecord(key);
}

const initialJavaScript = [...initialFiles]
  .filter((file) => file.endsWith('.js'))
  .sort()
  .map((file) => {
    const absolutePath = path.join(distDirectory, file);
    if (!fs.existsSync(absolutePath)) {
      failures.push(`Initial asset is missing: ${file}`);
      return { file, bytes: 0, gzipBytes: 0 };
    }
    const content = fs.readFileSync(absolutePath);
    return {
      file,
      bytes: content.byteLength,
      gzipBytes: gzipSync(content, { level: 9 }).byteLength,
    };
  });

const initialGzipBytes = initialJavaScript.reduce((total, file) => total + file.gzipBytes, 0);
if (initialGzipBytes > MAX_INITIAL_GZIP_BYTES) {
  failures.push(
    `Initial JavaScript is ${(initialGzipBytes / 1024 / 1024).toFixed(2)} MiB gzip, above the 2.50 MiB budget.`
  );
}

const preloadedOptionalChunks = initialJavaScript
  .map((file) => file.file)
  .filter((file) => OPTIONAL_CHUNK_PATTERN.test(file));
if (preloadedOptionalChunks.length > 0) {
  failures.push(`Optional chunks are in the initial graph: ${preloadedOptionalChunks.join(', ')}`);
}

const archiveDirectories = fs
  .readdirSync(distDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^v\d+\.\d+$/.test(entry.name))
  .map((entry) => entry.name);
if (archiveDirectories.length > 0) {
  failures.push(`Current build contains static archives: ${archiveDirectories.join(', ')}`);
}

const topLevelAudio = fs
  .readdirSync(distDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.toLocaleLowerCase().endsWith('.mp3'))
  .map((entry) => entry.name)
  .sort();
const unexpectedAudio = topLevelAudio.filter((file) => !REQUIRED_AUDIO.has(file));
const missingAudio = [...REQUIRED_AUDIO].filter((file) => !topLevelAudio.includes(file));
if (unexpectedAudio.length > 0) {
  failures.push(`Current build contains unused audio: ${unexpectedAudio.join(', ')}`);
}
if (missingAudio.length > 0) {
  failures.push(`Current build is missing referenced audio: ${missingAudio.join(', ')}`);
}

let totalDistBytes = 0;
const prohibitedBuildMetadata = [];
const pendingDirectories = [distDirectory];
while (pendingDirectories.length > 0) {
  const directory = pendingDirectories.pop();
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      pendingDirectories.push(absolutePath);
    } else {
      totalDistBytes += fs.statSync(absolutePath).size;
      if (entry.name === '.DS_Store' || entry.name === 'blocked_commands.log') {
        prohibitedBuildMetadata.push(path.relative(distDirectory, absolutePath));
      }
    }
  }
}
if (prohibitedBuildMetadata.length > 0) {
  failures.push(
    `Current build contains development metadata: ${prohibitedBuildMetadata.sort().join(', ')}`
  );
}
if (totalDistBytes > MAX_CURRENT_DIST_BYTES) {
  failures.push(
    `Current build is ${(totalDistBytes / 1024 / 1024).toFixed(2)} MiB, above the 170 MiB budget.`
  );
}

const serviceWorkerPath = path.join(distDirectory, 'sw.js');
if (!fs.existsSync(serviceWorkerPath)) {
  failures.push('Service worker is missing.');
} else {
  const serviceWorker = fs.readFileSync(serviceWorkerPath, 'utf8');
  if (
    serviceWorker.includes('__MILLOS_BUILD_ID__') ||
    serviceWorker.includes('__MILLOS_CACHE_VERSION__')
  ) {
    failures.push('Service worker build placeholders were not finalized.');
  }
}
if (!fs.existsSync(path.join(distDirectory, 'build-info.json'))) {
  failures.push('Build diagnostics manifest is missing.');
}

if (initialJavaScript.some((file) => file.bytes === 0)) {
  warnings.push('One or more initial assets could not be measured.');
}

const report = {
  schemaVersion: 1,
  passed: failures.length === 0,
  budgets: {
    initialJavaScriptGzipBytes: MAX_INITIAL_GZIP_BYTES,
    currentDistBytes: MAX_CURRENT_DIST_BYTES,
  },
  measured: {
    initialJavaScript,
    initialGzipBytes,
    totalDistBytes,
    topLevelAudio,
    archiveDirectories,
    prohibitedBuildMetadata,
  },
  failures,
  warnings,
};

fs.mkdirSync(reportDirectory, { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(
  `Initial JavaScript: ${(initialGzipBytes / 1024 / 1024).toFixed(2)} MiB gzip across ${initialJavaScript.length} files.`
);
console.log(`Current build: ${(totalDistBytes / 1024 / 1024).toFixed(2)} MiB.`);
console.log(`Report: ${path.relative(projectRoot, reportPath)}`);

if (failures.length > 0) {
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Bundle budget passed.');
}
