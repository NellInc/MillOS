import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({
  gltf: [] as unknown[][],
  loader: [] as unknown[][],
}));
vi.mock('@react-three/drei', () => ({
  useGLTF: Object.assign(() => undefined, {
    preload: (...args: unknown[]) => calls.gltf.push(args),
  }),
}));
vi.mock('@react-three/fiber', () => ({
  useLoader: Object.assign(() => undefined, {
    preload: (...args: unknown[]) => calls.loader.push(args),
  }),
}));

import {
  preloadStartupWorldAssets,
  resetStartupWorldAssetPreloadForTests,
  startupAssetManifest,
} from './startupAssetPreload';
import { GENERATED_ASSET_PATHS, MODEL_PATHS } from './modelLoader';
import { BUSINESS_BRANDS, WORKER_ASSET_PATHS } from '../constants/worldAssetUrls';
import {
  CIVIC_SHADOW_DEPTH_URL,
  CIVIC_SHADOW_METADATA_URL,
} from '../constants/civicSquareLighting';

const BASE = import.meta.env.BASE_URL;
const everyUrl = (quality: 'low' | 'medium') => {
  const manifest = startupAssetManifest(quality);
  return [...manifest.models, ...manifest.textures, ...manifest.files];
};

beforeEach(() => {
  calls.gltf.length = 0;
  calls.loader.length = 0;
  resetStartupWorldAssetPreloadForTests();
});

describe('startup world asset preload', () => {
  // A preloaded URL that 404s would raise a startup error through the
  // DefaultLoadingManager even if no mounted component asks for it.
  it('names only files that ship in public/', () => {
    for (const url of everyUrl('medium')) {
      expect(url.startsWith(BASE)).toBe(true);
      const file = `public/${url.slice(BASE.length).split('?')[0]}`;
      expect(existsSync(file), file).toBe(true);
    }
  });

  it('names each asset once', () => {
    const urls = everyUrl('medium');
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('does not download the retired frog body now authored as shared scene geometry', () => {
    for (const quality of ['low', 'medium'] as const)
      expect(startupAssetManifest(quality).models).not.toContain(
        GENERATED_ASSET_PATHS.frogAuthoredBody
      );
  });

  it('covers the late village waves the cold-load trace discovered one re-render at a time', () => {
    const manifest = startupAssetManifest('medium');
    for (const id of [
      'pub',
      'school',
      'forge',
      'shop',
      'postbox',
      'duckpond',
      'birchTrunkUnit',
    ] as const)
      expect(manifest.models).toContain(GENERATED_ASSET_PATHS[id]);
    expect(manifest.models).toContain(WORKER_ASSET_PATHS.masculine);
    for (const url of [
      BUSINESS_BRANDS.inn.fascia,
      BUSINESS_BRANDS.townHall.primary,
      BUSINESS_BRANDS.harvest.primary,
      CIVIC_SHADOW_DEPTH_URL,
    ])
      expect(manifest.textures).toContain(url);
    expect(manifest.files).toEqual([CIVIC_SHADOW_METADATA_URL]);
  });

  it('uses the exact cache keys the scene hooks read, so nothing is fetched twice', () => {
    expect(preloadStartupWorldAssets('medium')).toBe(true);
    const manifest = startupAssetManifest('medium');
    // useDracoGLTF(path) is useGLTF(path, DRACO path): key [GLTFLoader, path].
    expect(calls.gltf).toEqual(manifest.models.map((path) => [path, `${BASE}draco/`]));
    // useTexture(url) and useLoader(TextureLoader, url) share [TextureLoader, url].
    expect(calls.loader).toEqual([
      ...manifest.textures.map((url) => [THREE.TextureLoader, url]),
      ...manifest.files.map((url) => [THREE.FileLoader, url]),
    ]);
  });

  it('skips on Low only the models the Low tier never mounts', () => {
    const medium = startupAssetManifest('medium').models;
    const low = startupAssetManifest('low').models;
    const detailOnly = [
      MODEL_PATHS.forklift,
      GENERATED_ASSET_PATHS.forkliftChassisUnit,
      GENERATED_ASSET_PATHS.spoutingFlangeUnit,
      GENERATED_ASSET_PATHS.spoutingColumnUnit,
      GENERATED_ASSET_PATHS.spoutingCrossbeamUnit,
    ];
    for (const path of detailOnly) {
      expect(medium).toContain(path);
      expect(low).not.toContain(path);
    }
    expect(low).toEqual(medium.filter((path) => !detailOnly.includes(path)));
  });

  it('starts once per page load', () => {
    expect(preloadStartupWorldAssets('medium')).toBe(true);
    const made = calls.gltf.length + calls.loader.length;
    expect(made).toBeGreaterThan(100);
    expect(preloadStartupWorldAssets('medium')).toBe(false);
    expect(calls.gltf.length + calls.loader.length).toBe(made);
  });

  it('is started from App module scope, before the scene chunk can evaluate', () => {
    const app = readFileSync('src/App.tsx', 'utf8');
    expect(app).toMatch(
      /^applyFirstVisitQuality\(\);\n(?:\/\/.*\n)*preloadStartupWorldAssets\(useGraphicsStore\.getState\(\)\.graphics\.quality\);$/m
    );
    // The module must stay out of the scene graph's heavy imports.
    const source = readFileSync('src/utils/startupAssetPreload.ts', 'utf8');
    const imports = [...source.matchAll(/^import[^;]*from '([^']+)';$/gm)].map((m) => m[1]);
    expect(imports.sort()).toEqual(
      [
        '../constants/civicSquareLighting',
        '../constants/worldAssetUrls',
        './dracoLoader',
        './modelLoader',
        '@react-three/fiber',
        'three',
      ].sort()
    );
  });
});
