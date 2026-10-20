/**
 * Painted-ground labels must reach the GPU with the overlay bias.
 *
 * troika's `_prepareForRender` writes `polygonOffset = !!depthOffset` and both
 * offsets from `depthOffset` onto the derived material on every draw, so the
 * bias set on the base material was overwritten with "off" before each frame.
 * The KEEP CLEAR label, 1 cm over an apron biased -1, lost half its glyphs to
 * the apron in the oblique dock view ("KEEP" missing, "CLEAR" kept).
 */
import { describe, expect, it } from 'vitest';
import { Text as TroikaText } from 'troika-three-text';
import * as THREE from 'three';
import { POLYGON_OFFSET } from '../../constants/renderLayers';
import { SCENE_TEXT_MATERIALS, sceneTextDepthOffset } from './SceneText';

describe('painted-ground scene text', () => {
  it('keeps the exterior overlay bias through troika’s per-draw material setup', () => {
    const mesh = new TroikaText() as TroikaText & {
      _prepareForRender: (material: THREE.Material) => void;
    };
    mesh.material = SCENE_TEXT_MATERIALS['painted-ground'];
    mesh.depthOffset = sceneTextDepthOffset('painted-ground') ?? 0;
    const material = mesh.material as THREE.Material;
    mesh._prepareForRender(material);
    expect(material.polygonOffset).toBe(true);
    expect(material.polygonOffsetFactor).toBe(POLYGON_OFFSET.exteriorOverlay.factor);
    expect(material.polygonOffsetUnits).toBe(POLYGON_OFFSET.exteriorOverlay.units);
  });

  it('loses the bias without depthOffset, which is what hid "KEEP"', () => {
    const mesh = new TroikaText() as TroikaText & {
      _prepareForRender: (material: THREE.Material) => void;
    };
    mesh.material = SCENE_TEXT_MATERIALS['painted-ground'];
    const material = mesh.material as THREE.Material;
    mesh._prepareForRender(material);
    expect(material.polygonOffset).toBe(false);
  });

  it('leaves unlit and painted labels unbiased', () => {
    expect(sceneTextDepthOffset('unlit')).toBeUndefined();
    expect(sceneTextDepthOffset('painted')).toBeUndefined();
  });
});
