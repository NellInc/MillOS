import { describe, expect, it } from 'vitest';
import { EdgeDetectionMaterial } from 'postprocessing';
import { SMAA_EDGE_THRESHOLD, encodeSmaaEdgeInput, smaaEdgeDetected } from '../smaaPerceptualEdges';

// Pixels read from the integrated build's own frames (final3, 2560x1440).
// Each pair straddles an edge the judges called stair-stepped.
const TRUSS_AGAINST_CEILING = [
  [83, 82, 74],
  [0, 30, 41],
] as const; // med-12 interior, x=1050 y=248/251
const NIGHT_PALLET_AGAINST_FLOOR = [
  [16, 9, 0],
  [8, 17, 32],
] as const; // med-19 logistics-close, x=715/717 y=790

describe('SMAA edge detection space', () => {
  it('misses the reported edges when it compares linear values, as postprocessing does', () => {
    expect(smaaEdgeDetected(...TRUSS_AGAINST_CEILING, 'linear')).toBe(false);
    expect(smaaEdgeDetected(...NIGHT_PALLET_AGAINST_FLOOR, 'linear')).toBe(false);
  });

  it('finds them once the comparison is made on display-encoded values', () => {
    expect(smaaEdgeDetected(...TRUSS_AGAINST_CEILING, 'encoded')).toBe(true);
    expect(smaaEdgeDetected(...NIGHT_PALLET_AGAINST_FLOOR, 'encoded')).toBe(true);
  });

  it('uses the library threshold it is reasoning about', () => {
    const material = new EdgeDetectionMaterial();
    expect(material.edgeDetectionThreshold).toBe(SMAA_EDGE_THRESHOLD);
  });
});

describe('encodeSmaaEdgeInput', () => {
  it('routes every colour read of the installed edge shader through the encoder', () => {
    const material = new EdgeDetectionMaterial();
    const raw = material.fragmentShader.match(/texture2D\(inputBuffer,/g)?.length ?? 0;
    // Pins the library string this depends on: an upgrade that renames the
    // read fails here instead of silently shipping linear edge detection.
    expect(raw).toBeGreaterThan(0);

    expect(encodeSmaaEdgeInput(material)).toBe(true);
    // The only remaining raw read is the one inside the encoder itself.
    expect(material.fragmentShader.match(/texture2D\(inputBuffer,/g)?.length).toBe(1);
    expect(material.fragmentShader.match(/smaaEncodedTexel\(/g)?.length).toBe(raw + 1);
  });

  it('is idempotent, so a re-attached ref cannot double-encode', () => {
    const material = new EdgeDetectionMaterial();
    encodeSmaaEdgeInput(material);
    const once = material.fragmentShader;
    expect(encodeSmaaEdgeInput(material)).toBe(true);
    expect(material.fragmentShader).toBe(once);
  });

  it('declares the encoder after the uniform it samples', () => {
    const material = new EdgeDetectionMaterial();
    encodeSmaaEdgeInput(material);
    const shader = material.fragmentShader;
    expect(shader.indexOf('uniform sampler2D inputBuffer;')).toBeLessThan(
      shader.indexOf('vec4 smaaEncodedTexel(')
    );
  });
});
