import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const ASSET_ROOT = path.join(ROOT, 'public', 'assets', 'workers', 'idle');
const MANIFEST_PATH = path.join(ASSET_ROOT, 'manifest.json');
const REPORT_PATH = path.join(ROOT, 'test-results', 'assets', 'worker-idle-validation.json');
const EXPECTED_WORKER_IDS = Array.from({ length: 10 }, (_, index) => `w${index + 1}`);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function readUInt24LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function parseChunks(bytes, start, end) {
  const chunks = [];
  let offset = start;

  while (offset + 8 <= end) {
    const type = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + size;
    if (dataEnd > end) throw new Error(`Chunk ${type} exceeds its container`);
    chunks.push({ type, size, dataStart, dataEnd });
    offset = dataEnd + (size & 1);
  }

  if (offset !== end) throw new Error('WebP chunk padding is malformed');
  return chunks;
}

function parseDimensions(bytes, chunks) {
  const extended = chunks.find((chunk) => chunk.type === 'VP8X');
  if (extended) {
    if (extended.size !== 10) throw new Error('VP8X chunk has an invalid size');
    return {
      width: readUInt24LE(bytes, extended.dataStart + 4) + 1,
      height: readUInt24LE(bytes, extended.dataStart + 7) + 1,
      hasAlpha: Boolean(bytes[extended.dataStart] & 0x10),
    };
  }

  const lossless = chunks.find((chunk) => chunk.type === 'VP8L');
  if (lossless) {
    if (bytes[lossless.dataStart] !== 0x2f) throw new Error('VP8L signature is invalid');
    const bits = bytes.readUInt32LE(lossless.dataStart + 1);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1,
      hasAlpha: Boolean((bits >>> 28) & 1),
    };
  }

  const lossy = chunks.find((chunk) => chunk.type === 'VP8 ');
  if (lossy) {
    const header = lossy.dataStart;
    if (bytes[header + 3] !== 0x9d || bytes[header + 4] !== 0x01 || bytes[header + 5] !== 0x2a) {
      throw new Error('VP8 frame signature is invalid');
    }
    return {
      width: bytes.readUInt16LE(header + 6) & 0x3fff,
      height: bytes.readUInt16LE(header + 8) & 0x3fff,
      hasAlpha: false,
    };
  }

  throw new Error('WebP image payload is missing');
}

function parseWebP(bytes) {
  if (
    bytes.length < 20 ||
    bytes.toString('ascii', 0, 4) !== 'RIFF' ||
    bytes.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    throw new Error('Invalid WebP RIFF header');
  }

  if (bytes.readUInt32LE(4) + 8 !== bytes.length) {
    throw new Error('WebP RIFF size does not match the file length');
  }

  const chunks = parseChunks(bytes, 12, bytes.length);
  const dimensions = parseDimensions(bytes, chunks);
  const animation = chunks.find((chunk) => chunk.type === 'ANIM');
  const frameChunks = chunks.filter((chunk) => chunk.type === 'ANMF');
  const frames = frameChunks.map((chunk) => {
    if (chunk.size < 24) throw new Error('ANMF frame is too short');
    const nested = parseChunks(bytes, chunk.dataStart + 16, chunk.dataEnd);
    return {
      durationMs: readUInt24LE(bytes, chunk.dataStart + 12),
      hasAlpha: nested.some((nestedChunk) => nestedChunk.type === 'ALPH'),
    };
  });

  return {
    ...dimensions,
    animated: frames.length > 0,
    encodedFrames: frames.length,
    durationMs: frames.reduce((total, frame) => total + frame.durationMs, 0),
    loopCount: animation ? bytes.readUInt16LE(animation.dataStart + 4) : null,
    frameAlpha: frames.length > 0 && frames.every((frame) => frame.hasAlpha),
  };
}

function check(errors, condition, message) {
  if (!condition) errors.push(message);
}

async function validateFile(definition, contract, kind) {
  const errors = [];
  const filePath = path.join(ASSET_ROOT, definition.file);
  const bytes = await readFile(filePath);
  const parsed = parseWebP(bytes);
  const expectedMaxBytes =
    kind === 'animation' ? contract.maxAnimationBytes : contract.maxRestBytes;

  check(errors, bytes.length === definition.bytes, `${kind} byte count changed`);
  check(errors, bytes.length <= expectedMaxBytes, `${kind} exceeds ${expectedMaxBytes} bytes`);
  check(errors, sha256(bytes) === definition.sha256, `${kind} SHA-256 changed`);
  check(errors, parsed.width === contract.width, `${kind} width is ${parsed.width}`);
  check(errors, parsed.height === contract.height, `${kind} height is ${parsed.height}`);
  check(errors, parsed.hasAlpha, `${kind} does not declare alpha`);

  if (kind === 'animation') {
    check(errors, parsed.animated, 'animation contains no frames');
    check(
      errors,
      parsed.encodedFrames === definition.encodedFrames,
      `encoded frame count is ${parsed.encodedFrames}`
    );
    check(errors, parsed.frameAlpha, 'one or more animation frames lacks alpha');
    check(errors, parsed.durationMs === contract.durationMs, `duration is ${parsed.durationMs}ms`);
    check(errors, parsed.loopCount === contract.loopCount, `loop count is ${parsed.loopCount}`);
  } else {
    check(errors, !parsed.animated, 'rest image is unexpectedly animated');
  }

  return {
    file: definition.file,
    kind,
    bytes: bytes.length,
    sha256: sha256(bytes),
    parsed,
    passed: errors.length === 0,
    errors,
  };
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.assets)) {
    throw new Error('Worker idle manifest is malformed or unsupported');
  }

  const errors = [];
  const workerIds = manifest.assets.map((asset) => asset.workerId);
  check(
    errors,
    JSON.stringify(workerIds) === JSON.stringify(EXPECTED_WORKER_IDS),
    `worker IDs are ${workerIds.join(', ')}`
  );
  check(errors, manifest.sourceCandidate === 'cast-polish-v9', 'source candidate is not v9');
  check(errors, manifest.sourceContract?.frames === 70, 'source frame contract changed');
  check(errors, manifest.sourceContract?.frameRate === 16, 'source frame rate contract changed');
  check(
    errors,
    manifest.productionContract?.format === 'animated WebP',
    'production format changed'
  );

  const expectedFiles = new Set(['manifest.json']);
  const results = [];
  for (const asset of manifest.assets) {
    check(errors, asset.sourceFrames === 70, `${asset.workerId} source frame count changed`);
    check(
      errors,
      /^[a-f0-9]{64}$/.test(asset.sourceSha256),
      `${asset.workerId} source SHA-256 is malformed`
    );
    expectedFiles.add(asset.animation.file);
    expectedFiles.add(asset.rest.file);
    results.push(
      await validateFile(asset.animation, manifest.productionContract, 'animation'),
      await validateFile(asset.rest, manifest.productionContract, 'rest')
    );
  }

  const actualFiles = new Set(await readdir(ASSET_ROOT));
  const undeclared = [...actualFiles].filter((file) => !expectedFiles.has(file));
  const missing = [...expectedFiles].filter((file) => !actualFiles.has(file));
  check(errors, undeclared.length === 0, `undeclared files: ${undeclared.join(', ')}`);
  check(errors, missing.length === 0, `missing files: ${missing.join(', ')}`);

  const animatedBytes = results
    .filter((result) => result.kind === 'animation')
    .reduce((total, result) => total + result.bytes, 0);
  check(errors, animatedBytes <= 20_000_000, `animated set is ${animatedBytes} bytes`);

  for (const result of results) {
    errors.push(...result.errors.map((error) => `${result.file}: ${error}`));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    manifest: path.relative(ROOT, MANIFEST_PATH),
    sourceCandidate: manifest.sourceCandidate,
    animatedBytes,
    files: results,
    passed: errors.length === 0,
    errors,
  };
  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

  if (!report.passed) {
    console.error('Worker idle asset validation failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Worker idle assets passed: ${manifest.assets.length} workers, ${animatedBytes} animated bytes.`
  );
  console.log(`Report: ${path.relative(ROOT, REPORT_PATH)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
