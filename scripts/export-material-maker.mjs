import { spawn } from 'node:child_process';
import { mkdir, open } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { acquireCaptureLock } from './lib/capture-lock.mjs';

const root = process.cwd();
const tool =
  process.env.MILLOS_MATERIAL_MAKER ??
  path.join(
    root,
    '.cache/tools/material-maker-1.8/Material Maker.app/Contents/MacOS/Material Maker'
  );
const output = path.join(root, 'test-results/eq-tool-pilots-20261029/materials/export');
await mkdir(output, { recursive: true });
const lock = await acquireCaptureLock('EQ-material-maker-export');
try {
  const log = await open(path.join(output, 'export.log'), 'w');
  const args = [
    '--audio-driver',
    'Dummy',
    '--export-material',
    '--target',
    'Blender',
    '--size',
    '512',
    '-o',
    output,
    ...['fieldstone', 'dampstone', 'limestone'].map((name) =>
      path.join(root, 'assets/source/textures/material-maker', `${name}.ptex`)
    ),
  ];
  const code = await new Promise((resolve, reject) => {
    const child = spawn(tool, args, { stdio: ['ignore', log.fd, log.fd] });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  await log.close();
  if (code.code !== 0) throw new Error(`Material Maker exited ${JSON.stringify(code)}`);
  console.log('MATERIAL_MAKER_EXPORT_PASS', output);
} finally {
  await lock.release();
}
