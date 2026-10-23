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
import {
  SCENE_TEXT_MATERIALS,
  SCENE_TEXT_MIN_EM_PIXELS,
  sceneTextDepthOffset,
  sceneTextEmPixels,
  sceneTextLegible,
} from './SceneText';

/**
 * final4 med-12 milling: the shipping forklift's tag read "F.T01 SHIPP NS". A
 * 0.17 m label ~50 m out is three drawing-buffer rows an em on Medium (864 rows,
 * fov 50), and troika's SDF glyphs break apart that small. A label hides once
 * it cannot be read and comes back with hysteresis.
 */
describe('scene text screen size', () => {
  const MEDIUM_ROWS = 720 * 2 * 0.6;
  it('measures an em in drawing-buffer rows', () => {
    expect(sceneTextEmPixels(0.17, 50, MEDIUM_ROWS, 50)).toBeCloseTo(3.15, 1);
    expect(sceneTextEmPixels(0.17, 0, MEDIUM_ROWS, 50)).toBeGreaterThan(1e3);
  });
  it('hides the milling forklift tag and keeps it at a few metres', () => {
    expect(sceneTextLegible(0.17, 50, MEDIUM_ROWS, 50, true)).toBe(false);
    expect(sceneTextLegible(0.17, 8, MEDIUM_ROWS, 50, false)).toBe(true);
  });
  it('holds its state inside the hysteresis band', () => {
    const at = (em: number) => (0.17 * MEDIUM_ROWS) / (2 * Math.tan((50 * Math.PI) / 360) * em);
    const edge = at(SCENE_TEXT_MIN_EM_PIXELS * 0.93);
    expect(sceneTextLegible(0.17, edge, MEDIUM_ROWS, 50, true)).toBe(true);
    expect(sceneTextLegible(0.17, edge, MEDIUM_ROWS, 50, false)).toBe(false);
  });
});

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
