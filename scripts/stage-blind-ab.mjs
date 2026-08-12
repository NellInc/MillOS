/**
 * Stage a blind A/B art comparison between two capture runs.
 *
 * Art critique that knows which image is "the new one" grades the intent rather
 * than the pixels. This copies each scene from two capture directories into
 * neutral `<scene>-A.png` / `<scene>-B.png` pairs, with the side assignment
 * varied per scene so a reviewer cannot learn "A is always the old build".
 *
 * The mapping is written to key.json for the caller. Reviewers must not read it.
 *
 * Usage:
 *   node scripts/stage-blind-ab.mjs --before=<dir> --after=<dir> --output=<dir> [--salt=<string>]
 */
import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function readArgument(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

const options = {
  before: readArgument('before', ''),
  after: readArgument('after', ''),
  output: readArgument('output', ''),
  salt: readArgument('salt', 'millos'),
};

for (const required of ['before', 'after', 'output']) {
  if (!options[required]) {
    console.error(`Missing --${required}=<dir>`);
    process.exitCode = 1;
    process.exit();
  }
}

/**
 * Deterministic per-scene side assignment. Deterministic keeps the staging
 * reproducible and re-runnable; the salt keeps it from being guessable across
 * iterations, so a reviewer cannot carry an inferred mapping from one round to
 * the next.
 */
function assignsAfterToA(scene, salt) {
  const source = `${salt}:${scene}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) & 1) === 1;
}

async function scenesIn(directory) {
  const entries = await readdir(directory).catch(() => []);
  return entries
    .filter(
      (entry) =>
        entry.endsWith('.png') &&
        entry !== 'contact-sheet.png' &&
        !entry.endsWith('-failure.png') &&
        !entry.includes('-motion-start')
    )
    .map((entry) => entry.replace(/\.png$/, ''));
}

async function main() {
  const beforeScenes = new Set(await scenesIn(options.before));
  const afterScenes = await scenesIn(options.after);
  const shared = afterScenes.filter((scene) => beforeScenes.has(scene)).sort();

  if (shared.length === 0) {
    throw new Error(
      `No scene names are present in both ${options.before} and ${options.after}. Nothing to compare.`
    );
  }

  const skipped = afterScenes.filter((scene) => !beforeScenes.has(scene)).sort();
  await mkdir(options.output, { recursive: true });

  const key = [];
  for (const scene of shared) {
    const afterIsA = assignsAfterToA(scene, options.salt);
    const sideA = afterIsA ? options.after : options.before;
    const sideB = afterIsA ? options.before : options.after;
    await copyFile(path.join(sideA, `${scene}.png`), path.join(options.output, `${scene}-A.png`));
    await copyFile(path.join(sideB, `${scene}.png`), path.join(options.output, `${scene}-B.png`));
    key.push({ scene, A: afterIsA ? 'after' : 'before', B: afterIsA ? 'before' : 'after' });
  }

  await writeFile(
    path.join(options.output, 'key.json'),
    `${JSON.stringify({ before: options.before, after: options.after, salt: options.salt, skipped, key }, null, 2)}\n`
  );

  console.log(`Staged ${shared.length} blind pairs in ${options.output}`);
  // A silently dropped scene reads as "everything was compared" when it was
  // not, so name the gap rather than only the successes.
  if (skipped.length > 0) {
    console.log(`Not compared (absent from --before): ${skipped.join(', ')}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
