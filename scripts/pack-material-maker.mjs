/** Convert the authoring tool's linear EXR roughness without a colour transfer.
 * Working if the runtime PNG writes equal RGB channels and preserves the EXR range.
 */
import { Buffer } from 'node:buffer';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { FloatType } from 'three';
import { encodeRGB, decodeRGB } from './refine-authored-png.mjs';

import { pathToFileURL } from 'node:url';
import process from 'node:process';

/** EXRLoader data is bottom-up; PNG rows are top-down, like the tool's PNGs.
 * Working if the packed roughness registers with albedo, including across Y.
 */
export function packLinearRoughness(data, width, height) {
  const w = width / 2,
    h = height / 2;
  const raw = Buffer.alloc(w * h * 3);
  let min = Infinity,
    max = -Infinity;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++)
          sum += data[((height - 1 - (y * 2 + dy)) * width + x * 2 + dx) * 4];
      const value = sum / 4;
      if (!Number.isFinite(value) || value < 0 || value > 1)
        throw Error('Invalid linear roughness');
      min = Math.min(min, value);
      max = Math.max(max, value);
      raw.fill(Math.round(value * 255), (y * w + x) * 3, (y * w + x + 1) * 3);
    }
  return { raw, min, max };
}
async function main() {
  const source = 'test-results/eq-tool-pilots-20261029/materials/export';
  const runtime = 'public/textures/material-maker';
  const records = [];
  for (const name of ['fieldstone', 'dampstone', 'limestone']) {
    const out = name === 'dampstone' ? `${source}/packed-preview` : runtime;
    await mkdir(out, { recursive: true });
    for (const role of ['albedo', 'normal']) {
      const bytes = await readFile(`${source}/${name}_${role}.png`);
      const image = decodeRGB(bytes);
      if (image.width !== 512 || image.height !== 512)
        throw Error('Unexpected material dimensions');
      await writeFile(`${out}/${name}-${role}.png`, bytes);
    }
    const bytes = await readFile(`${source}/${name}_rough.exr`);
    const exr = new EXRLoader()
      .setDataType(FloatType)
      .parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const { raw, min, max } = packLinearRoughness(exr.data, 512, 512);
    await writeFile(`${out}/${name}-roughness.png`, encodeRGB(raw, 256, 256));
    const files = {};
    for (const role of ['albedo', 'normal', 'roughness']) {
      const file = `${out}/${name}-${role}.png`,
        data = await readFile(file);
      files[role] = {
        file,
        bytes: data.length,
        sha256: createHash('sha256').update(data).digest('hex'),
      };
    }
    records.push({ name, roughnessRange: [min, max], files });
  }
  await writeFile(
    'assets/source/textures/material-maker/PROVENANCE.json',
    JSON.stringify(
      {
        tool: 'Material Maker1.8',
        release: 'https://github.com/RodZill4/material-maker/releases/tag/1.8',
        releaseSHA256: '2549aa9c18b71550355b752e03a1afd5a199dc7f56eafb371c06b721182ef3d8',
        source: 'Original MillOS seeded perlin/gradient/normal graphs',
        seed: 1729,
        graphHashes: Object.fromEntries(
          await Promise.all(
            ['fieldstone', 'dampstone', 'limestone'].map(async (name) => [
              `${name}.ptex`,
              createHash('sha256')
                .update(await readFile(`assets/source/textures/material-maker/${name}.ptex`))
                .digest('hex'),
            ])
          )
        ),
        upstreamLicense: 'MIT authoring tool; original MillOS graphs and outputs',
        export: 'node scripts/export-material-maker.mjs',
        pack: 'node scripts/pack-material-maker.mjs',
        normalConvention: 'Blender export, OpenGL tangent-space',
        colourSpace: { albedo: 'sRGB', normal: 'linear', roughness: 'linear' },
        records,
      },
      null,
      2
    ) + '\n'
  );
  console.log(
    'MATERIAL_PACK_PASS',
    JSON.stringify(
      records.map((r) => ({
        name: r.name,
        roughness: r.roughnessRange,
        bytes: Object.values(r.files).reduce((n, f) => n + f.bytes, 0),
      }))
    )
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
