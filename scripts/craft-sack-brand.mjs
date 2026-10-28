import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { format, resolveConfig } from 'prettier';

const root = process.cwd();
const mark = 'public/textures/signage/millos-mark-v1.webp';
const font = 'public/fonts/Inter-Regular.ttf';
const directory = 'assets/source/textures';
const artwork = `${directory}/millos-sack-stamp.png`;
const receipt = `${directory}/millos-sack-stamp.json`;
const module = 'src/textures/sackBrandRaster.ts';
const size = 256;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const check = process.argv.includes('--check');

// Product-blind physical cargo cannot claim a particular commodity, weight or
// lot. Reuse the actual application mark and Inter as one printable ink stamp.
// Working if the source raster says MillOS, its line fits the retained side UV
// band, and no font/image loading is added to the runtime texture factory.
async function paint() {
  const { data, info } = await sharp(mark)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const alpha = Buffer.alloc(info.width * info.height);
  for (let p = 0; p < alpha.length; p++) {
    const value = Math.max(...data.subarray(p * info.channels, (p + 1) * info.channels));
    const t = Math.max(0, Math.min(1, (value - 28) / 56));
    alpha[p] = Math.round(t * t * (3 - 2 * t) * 255);
  }
  const maskedMark = await sharp({
    create: { width: info.width, height: info.height, channels: 3, background: '#ffffff' },
  })
    .joinChannel(alpha, { raw: { width: info.width, height: info.height, channels: 1 } })
    .png()
    .toBuffer();
  const symbol = await sharp(maskedMark)
    .trim({ threshold: 12 })
    .resize(124, 82, { fit: 'contain', background: '#00000000' })
    .png()
    .toBuffer();
  const word = await sharp({
    text: {
      text: '<span foreground="#ffffff" weight="bold">MillOS</span>',
      font: 'Inter 44',
      fontfile: path.join(root, font),
      rgba: true,
      dpi: 72,
    },
  })
    .resize(192, 44, { fit: 'contain', background: '#00000000' })
    .png()
    .toBuffer();
  const rule = await sharp({
    create: { width: 168, height: 5, channels: 4, background: '#ffffff' },
  })
    .png()
    .toBuffer();
  const composite = await sharp({
    create: { width: size, height: size, channels: 4, background: '#00000000' },
  })
    .composite([
      { input: symbol, left: 66, top: 14 },
      { input: word, left: 32, top: 108 },
      { input: rule, left: 44, top: 170 },
      { input: rule, left: 44, top: 194 },
    ])
    .png()
    .toBuffer();
  const painted = await sharp(composite).extractChannel(3).raw().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 3, background: '#2b4344' } })
    .joinChannel(painted, { raw: { width: size, height: size, channels: 1 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

// A dedicated alpha run list preserves the existing synchronous DataTexture
// contract. It is generated data, not an image loader or generic codec family.
function encode(alpha) {
  const runs = [];
  let start = 0;
  while (start < alpha.length) {
    const value = alpha[start];
    let end = start + 1;
    while (end < alpha.length && alpha[end] === value && end - start < 65535) end++;
    runs.push(end - start, value);
    start = end;
  }
  return runs;
}

// Fontconfig's system default is absent in this bundled libvips. Give this
// standalone authoring process only the shipped font directory and a task-owned
// disposable cache; restore the environment and remove that exact cache after.
const fontTemporary = check ? null : await fs.mkdtemp(path.join(os.tmpdir(), 'millos-sack-font-'));
const oldFontConfig = process.env.FONTCONFIG_FILE;
let png;
try {
  if (fontTemporary) {
    const config = path.join(fontTemporary, 'fonts.conf');
    await fs.writeFile(
      config,
      `<fontconfig><dir>${path.join(root, 'public/fonts')}</dir><cachedir>${fontTemporary}/cache</cachedir></fontconfig>`
    );
    process.env.FONTCONFIG_FILE = config;
  }
  png = check ? await fs.readFile(artwork) : await paint();
} finally {
  if (oldFontConfig === undefined) delete process.env.FONTCONFIG_FILE;
  else process.env.FONTCONFIG_FILE = oldFontConfig;
  if (fontTemporary) await fs.rm(fontTemporary, { recursive: true });
}
const { data, info } = await sharp(png)
  .flip()
  .extractChannel(3)
  .raw()
  .toBuffer({ resolveWithObject: true });
if (info.width !== size || info.height !== size) throw Error('Unexpected sack raster dimensions');
const runs = encode(data);
const provenance = {
  label: 'MillOS',
  kind: 'product-neutral single-ink brand stamp',
  artwork,
  size,
  artworkSha256: hash(png),
  alphaSha256: hash(data),
  inputs: { [mark]: hash(await fs.readFile(mark)), [font]: hash(await fs.readFile(font)) },
  wordmarkUV: [0.125, 52 / 128, 0.875, 80 / 128],
};
const rows = [];
for (let n = 0; n < runs.length; n += 28) rows.push(`  ${runs.slice(n, n + 28).join(', ')},`);
const generated = await format(
  `// Generated by scripts/craft-sack-brand.mjs from the retained authored PNG.
// Working if the decoded alpha exactly matches the flipped source raster.
export const SACK_BRAND_SIZE = ${size};
export const SACK_BRAND_LABEL = 'MillOS';
export const SACK_BRAND_ALPHA_SHA256 = '${provenance.alphaSha256}';
export const SACK_BRAND_ALPHA_RUNS = new Uint16Array([\n${rows.join('\n')}\n]);\n`,
  {
    ...(await resolveConfig(module)),
    parser: 'typescript',
  }
);
const metadata = JSON.stringify(provenance, null, 2) + '\n';
if (check) {
  if ((await fs.readFile(module, 'utf8')) !== generated) throw Error('Stale embedded sack raster');
  if ((await fs.readFile(receipt, 'utf8')) !== metadata)
    throw Error('Stale sack raster provenance');
  console.log('SACK_BRAND_SOURCE_CHECK_PASS', size, runs.length / 2, provenance.alphaSha256);
} else {
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(artwork, png);
  await fs.writeFile(receipt, metadata);
  await fs.writeFile(module, generated);
  console.log('SACK_BRAND_AUTHORED', png.length, 'PNG bytes;', runs.length / 2, 'alpha runs');
}
