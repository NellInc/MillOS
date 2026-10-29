import { expect, it, vi } from 'vitest';
const loaders = vi.hoisted(() => ({ setDRACOLoader: vi.fn(), setMeshoptDecoder: vi.fn() }));
vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    setDRACOLoader = loaders.setDRACOLoader;
    setMeshoptDecoder = loaders.setMeshoptDecoder;
  },
}));
vi.mock('three/addons/loaders/DRACOLoader.js', () => ({
  DRACOLoader: class {
    setDecoderPath() {}
    setDecoderConfig() {}
    preload() {}
  },
}));
import { createDracoGLTFLoader } from './dracoLoader';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
it('wires bundled meshopt for manual loaders as well as the existing local Draco decoder', () => {
  createDracoGLTFLoader();
  expect(loaders.setDRACOLoader).toHaveBeenCalledOnce();
  expect(loaders.setMeshoptDecoder).toHaveBeenCalledWith(MeshoptDecoder);
});
