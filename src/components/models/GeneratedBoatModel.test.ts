import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco from 'draco3dgltf';
import {
  applyBoatPortholes,
  BOAT_GLAZING_STRENGTH,
  BOAT_REVEAL_STRENGTH,
} from './GeneratedBoatModel';

describe('retained narrowboat glazing', () => {
  it('adds pane-only roughness to the real standard shader without changing its atlas', () => {
    const map = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map });
    const night = { value: 0.7 };
    applyBoatPortholes(material, night);
    const source = THREE.ShaderLib.standard;
    const shader = {
      uniforms: THREE.UniformsUtils.clone(source.uniforms),
      vertexShader: source.vertexShader,
      fragmentShader: source.fragmentShader,
    } as Parameters<typeof material.onBeforeCompile>[0];
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(material.map).toBe(map);
    expect(shader.uniforms.boatNight).toBe(night);
    expect(shader.uniforms.boatGlazingStrength).toBe(BOAT_GLAZING_STRENGTH);
    expect(shader.uniforms.boatRevealStrength).toBe(BOAT_REVEAL_STRENGTH);
    expect(shader.fragmentShader).toContain('room * revealShade');
    expect(shader.fragmentShader).toContain('* boatNight * strength * revealShade');
    expect(shader.fragmentShader).toContain('max(abs(pane.x), abs(pane.y)), endPane');
    expect(shader.fragmentShader).toContain('abs(paintSlot - 6.0)');
    expect(shader.fragmentShader).toContain(
      'roughnessFactor, 0.18, boatGlass * clamp(boatGlazingStrength, 0.0, 1.0)'
    );
    expect(shader.fragmentShader).toContain('totalEmissiveRadiance += boatRoomLight');
    expect(material.customProgramCacheKey()).toBe('millos-authored-boat-portholes-v7');
    material.dispose();
    map.dispose();
  });
});

it('targets the actual delivered pane UVs, excluding every non-glass part', async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': await draco.createDecoderModule(),
  });
  const document = await io.read('public/models/world/canal-boat.glb');
  let glassVertices = 0;
  for (const mesh of document.getRoot().listMeshes())
    for (const primitive of mesh.listPrimitives()) {
      const positions = primitive.getAttribute('POSITION')!,
        uv = primitive.getAttribute('TEXCOORD_0')!;
      const p = [0, 0, 0],
        t = [0, 0];
      for (let i = 0; i < positions.getCount(); i++) {
        positions.getElement(i, p);
        uv.getElement(i, t);
        const slot = Math.floor(t[0] * 4) + Math.floor(t[1] * 4) * 4;
        if (slot !== 6) continue;
        const side = Math.abs(p[0]) >= 1.15 && Math.abs(p[0]) < 1.2 && p[1] >= 1.8 && p[1] < 2.26;
        const end =
          Math.abs(p[2]) >= 3.54 &&
          Math.abs(p[2]) < 4.14 &&
          p[1] >= 1.92 &&
          p[1] < 2.28 &&
          Math.abs(p[0]) < 0.44;
        expect(side || end).toBe(true);
        glassVertices++;
      }
    }
  expect(glassVertices).toBeGreaterThan(500);
});
