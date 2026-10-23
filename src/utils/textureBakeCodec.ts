/**
 * Moves a generated DataTexture across a worker boundary without changing it.
 *
 * A `THREE.DataTexture` does not survive `postMessage` (its prototype and its
 * Vector2 fields are lost), so the worker sends the texel bytes plus every
 * texture field a generator could have set, and the main thread rebuilds an
 * equivalent texture. `textureBake.test.ts` compares the rebuilt texture to a
 * directly generated one field by field and byte by byte; colour space rides
 * along explicitly, because byte-identical data in the wrong colour space is
 * exactly the washed-out-albedo bug recorded in CLAUDE.md.
 */
import * as THREE from 'three';

export interface BakedTexture {
  key: string;
  data: Uint8Array;
  width: number;
  height: number;
  name: string;
  mapping: THREE.AnyMapping;
  channel: number;
  wrapS: THREE.Wrapping;
  wrapT: THREE.Wrapping;
  magFilter: THREE.MagnificationTextureFilter;
  minFilter: THREE.MinificationTextureFilter;
  anisotropy: number;
  format: THREE.AnyPixelFormat;
  internalFormat: THREE.PixelFormatGPU | null;
  type: THREE.TextureDataType;
  offset: [number, number];
  repeat: [number, number];
  center: [number, number];
  rotation: number;
  matrixAutoUpdate: boolean;
  generateMipmaps: boolean;
  premultiplyAlpha: boolean;
  flipY: boolean;
  unpackAlignment: number;
  colorSpace: string;
  userData: Record<string, unknown>;
  /**
   * Hand-built mip levels (the leaf atlases filter their own coverage). Level 0
   * is normally the very `data` array; a structured clone keeps that sharing.
   */
  mipmaps: BakedMipLevel[];
}

export interface BakedMipLevel {
  data: Uint8Array;
  width: number;
  height: number;
}

export const snapshotGeneratedTexture = (key: string, texture: THREE.DataTexture): BakedTexture => {
  const image = texture.image as { data: Uint8Array; width: number; height: number };
  return {
    key,
    data: image.data,
    width: image.width,
    height: image.height,
    name: texture.name,
    mapping: texture.mapping,
    channel: texture.channel,
    wrapS: texture.wrapS,
    wrapT: texture.wrapT,
    magFilter: texture.magFilter,
    minFilter: texture.minFilter,
    anisotropy: texture.anisotropy,
    format: texture.format,
    internalFormat: texture.internalFormat,
    type: texture.type,
    offset: [texture.offset.x, texture.offset.y],
    repeat: [texture.repeat.x, texture.repeat.y],
    center: [texture.center.x, texture.center.y],
    rotation: texture.rotation,
    matrixAutoUpdate: texture.matrixAutoUpdate,
    generateMipmaps: texture.generateMipmaps,
    premultiplyAlpha: texture.premultiplyAlpha,
    flipY: texture.flipY,
    unpackAlignment: texture.unpackAlignment,
    colorSpace: texture.colorSpace,
    userData: { ...texture.userData },
    mipmaps: ((texture.mipmaps ?? []) as BakedMipLevel[]).map((level) => ({
      data: level.data,
      width: level.width,
      height: level.height,
    })),
  };
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Shape check for data arriving from a worker; a malformed entry is dropped. */
export const isBakedTexture = (value: unknown): value is BakedTexture => {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<BakedTexture>;
  return (
    typeof v.key === 'string' &&
    // Tag check rather than `instanceof`: a cloned array may come from another realm.
    Object.prototype.toString.call(v.data) === '[object Uint8Array]' &&
    isFiniteNumber(v.width) &&
    isFiniteNumber(v.height) &&
    v.width > 0 &&
    v.height > 0 &&
    (v.data as Uint8Array).length === v.width * v.height * 4 &&
    typeof v.colorSpace === 'string' &&
    Array.isArray(v.mipmaps) &&
    v.mipmaps.every(
      (level) =>
        Object.prototype.toString.call(level?.data) === '[object Uint8Array]' &&
        isFiniteNumber(level.width) &&
        isFiniteNumber(level.height) &&
        level.data.length === level.width * level.height * 4
    )
  );
};

/** Every buffer a snapshot owns, once each: what the worker transfers. */
export const bakedTextureBuffers = (textures: readonly BakedTexture[]): ArrayBuffer[] => [
  ...new Set(
    textures.flatMap((texture) => [
      texture.data.buffer as ArrayBuffer,
      ...texture.mipmaps.map((level) => level.data.buffer as ArrayBuffer),
    ])
  ),
];

export const restoreGeneratedTexture = (baked: BakedTexture): THREE.DataTexture => {
  const texture = new THREE.DataTexture(baked.data, baked.width, baked.height);
  texture.format = baked.format;
  texture.type = baked.type;
  texture.name = baked.name;
  texture.mapping = baked.mapping;
  texture.channel = baked.channel;
  texture.wrapS = baked.wrapS;
  texture.wrapT = baked.wrapT;
  texture.magFilter = baked.magFilter;
  texture.minFilter = baked.minFilter;
  texture.anisotropy = baked.anisotropy;
  texture.internalFormat = baked.internalFormat;
  texture.offset.set(baked.offset[0], baked.offset[1]);
  texture.repeat.set(baked.repeat[0], baked.repeat[1]);
  texture.center.set(baked.center[0], baked.center[1]);
  texture.rotation = baked.rotation;
  texture.matrixAutoUpdate = baked.matrixAutoUpdate;
  texture.generateMipmaps = baked.generateMipmaps;
  texture.premultiplyAlpha = baked.premultiplyAlpha;
  texture.flipY = baked.flipY;
  texture.unpackAlignment = baked.unpackAlignment;
  texture.colorSpace = baked.colorSpace as THREE.ColorSpace;
  texture.userData = { ...baked.userData };
  texture.mipmaps = baked.mipmaps.map((level) => ({
    data: level.data,
    width: level.width,
    height: level.height,
  }));
  // `createDataTexture` sets this once on the original; match its version.
  texture.needsUpdate = true;
  return texture;
};
