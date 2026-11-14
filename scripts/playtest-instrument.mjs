#!/usr/bin/env node
/**
 * Runs one of the two tick-in-the-loop playtest instruments by name (plan
 * items 0.3 and 0.4), so nobody has to remember their environment variables.
 * Both are vitest files that skip unless their output variable is set, which
 * keeps `npm test` free of them; this sets it and runs the one file.
 *
 *   npm run playtest:plant -- [--out=<file.json>] [--suite=measure] [--shifts=10] [--<name>=<value>]
 *   npm run playtest:chronicle -- [--out=<dir>] [--seeds=8] [--styles=a,b] [--lengths=short,full]
 *                                 [--shard=i/n] [--take=always] [--gates=<dir>] [--control=1]
 *
 * plant: src/systems/__tests__/plantMeasure.playtest.test.ts. `--suite` picks
 *   the arm set whose output variable is set: measure (the default, ten
 *   shifts), levers, demand, packer, shipment, partner, grade, maintenance,
 *   ask. Default output test-results/playtest/plant-<suite>.json. `--shifts`
 *   sets MILLOS_PLANT_MEASURE_SHIFTS; any other `--name=value` sets
 *   MILLOS_PLANT_<NAME> (for example --commit-policy=priced).
 * chronicle: src/systems/__tests__/chronicleProbe.playtest.test.ts. Default
 *   output directory test-results/playtest/chronicle-probe (one JSON per run).
 *   `--name=value` sets MILLOS_CHRONICLE_PROBE_<NAME>. With `--gates` or
 *   `--control` and no `--out`, no plant run is played.
 *
 * No browser and no renderer: nothing here opens a window or takes the capture
 * lock. The capture tool is `npm run playtest:surfaces` (playtest-surfaces.mjs).
 */
import { mkdirSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const envName = (key) => key.replace(/-/g, '_').toUpperCase();

const INSTRUMENTS = {
  plant: {
    file: 'src/systems/__tests__/plantMeasure.playtest.test.ts',
    outVar: (options) => `MILLOS_PLANT_${envName(options.suite ?? 'measure')}_OUT`,
    defaultOut: (options) => `test-results/playtest/plant-${options.suite ?? 'measure'}.json`,
    outIsDir: false,
    optionVar: (key) =>
      key === 'shifts' ? 'MILLOS_PLANT_MEASURE_SHIFTS' : `MILLOS_PLANT_${envName(key)}`,
    reserved: ['suite'],
    plays: () => true,
  },
  chronicle: {
    file: 'src/systems/__tests__/chronicleProbe.playtest.test.ts',
    outVar: () => 'MILLOS_CHRONICLE_PROBE_OUT',
    defaultOut: () => 'test-results/playtest/chronicle-probe',
    outIsDir: true,
    optionVar: (key) => `MILLOS_CHRONICLE_PROBE_${envName(key)}`,
    reserved: [],
    // Reading earlier runs (gates) or the paired control plays no sweep.
    plays: (options) => options.out !== undefined || (!options.gates && !options.control),
  },
};

const [name, ...rest] = process.argv.slice(2);
const instrument = INSTRUMENTS[name];
if (!instrument) {
  console.error(
    `Usage: playtest-instrument.mjs <${Object.keys(INSTRUMENTS).join('|')}> [--out=<path>] [--name=value ...]`
  );
  process.exit(2);
}
const options = {};
for (const argument of rest) {
  const match = /^--([a-z][a-z0-9-]*)(?:=(.*))?$/i.exec(argument);
  if (!match) {
    console.error(`Unrecognised argument "${argument}": use --name=value.`);
    process.exit(2);
  }
  options[match[1]] = match[2] ?? '1';
}

const env = { ...process.env };
for (const [key, value] of Object.entries(options)) {
  if (key === 'out' || instrument.reserved.includes(key)) continue;
  env[instrument.optionVar(key)] = value;
}
let out = null;
if (instrument.plays(options)) {
  out = path.resolve(ROOT, options.out ?? instrument.defaultOut(options));
  mkdirSync(instrument.outIsDir ? out : path.dirname(out), { recursive: true });
  env[instrument.outVar(options)] = out;
}

const vitest = path.join(ROOT, 'node_modules', 'vitest', 'vitest.mjs');
const [command, args] = existsSync(vitest)
  ? [process.execPath, [vitest, 'run', instrument.file]]
  : ['npx', ['vitest', 'run', instrument.file]];
const startedAt = Date.now();
const child = spawn(command, args, { cwd: ROOT, env, stdio: 'inherit' });
child.on('exit', (code, signal) => {
  const minutes = ((Date.now() - startedAt) / 60_000).toFixed(1);
  if (out) console.log(`\n${name}: ${minutes} min; output ${out}`);
  else console.log(`\n${name}: ${minutes} min`);
  process.exit(code ?? (signal ? 1 : 0));
});
