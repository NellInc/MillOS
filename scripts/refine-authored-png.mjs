/** Narrow lossless RGB8 PNG codec for the authored surface baker.
 * No image dependencies. Working if RGB8 encode/decode is byte-exact and
 * unsupported PNG modes fail instead of silently changing normal samples.
 */
import { Buffer } from 'node:buffer';
import { deflateSync, inflateSync } from 'node:zlib';
const table = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (bytes) => {
  let c = 0xffffffff;
  for (const b of bytes) c = table[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data]),
    out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length);
  body.copy(out, 4);
  out.writeUInt32BE(crc(body), out.length - 4);
  return out;
};
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
export function encodeRGB(raw, width, height) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    raw.length !== width * height * 3
  )
    throw Error('Invalid RGB raster');
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const scan = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++)
    raw.copy(scan, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  return Buffer.concat([
    signature,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(scan, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
export function decodeRGB(image) {
  const bytes = Buffer.from(image);
  if (!bytes.subarray(0, 8).equals(signature)) throw Error('Expected PNG');
  let width, height, channels;
  const pieces = [];
  for (let i = 8; i < bytes.length; ) {
    const size = bytes.readUInt32BE(i),
      type = bytes.toString('ascii', i + 4, i + 8),
      data = bytes.subarray(i + 8, i + 8 + size);
    if (
      i + 12 + size > bytes.length ||
      crc(bytes.subarray(i + 4, i + 8 + size)) !== bytes.readUInt32BE(i + 8 + size)
    )
      throw Error('Invalid PNG chunk');
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      channels = data[9] === 2 ? 3 : data[9] === 6 ? 4 : 0;
      if (data[8] !== 8 || !channels || data[10] || data[11] || data[12])
        throw Error('Unsupported PNG mode');
    }
    if (type === 'IDAT') pieces.push(data);
    i += size + 12;
  }
  if (!width || !height || width * height > 16777216) throw Error('Invalid PNG dimensions');
  const stride = width * channels,
    scan = inflateSync(Buffer.concat(pieces)),
    out = Buffer.alloc(height * stride);
  if (scan.length !== height * (stride + 1)) throw Error('Invalid PNG raster length');
  const paeth = (a, b, c) => {
    const p = a + b - c,
      pa = Math.abs(p - a),
      pb = Math.abs(p - b),
      pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const f = scan[y * (stride + 1)];
    if (f > 4) throw Error('Invalid PNG filter');
    for (let x = 0; x < stride; x++) {
      const k = y * stride + x,
        a = x >= channels ? out[k - channels] : 0,
        b = y ? out[k - stride] : 0,
        c = y && x >= channels ? out[k - stride - channels] : 0;
      out[k] =
        (scan[y * (stride + 1) + x + 1] + [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][f]) &
        255;
    }
  }
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) out.copy(raw, i * 3, i * channels, i * channels + 3);
  return { raw, width, height };
}
