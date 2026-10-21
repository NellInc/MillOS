import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * A 1 m concrete plinth standing on the yard with nothing darkening the ground
 * at its foot reads as lifted. The art judge found exactly that under the
 * grain elevator in `yard` (1640,320)-(1900,440); the silos and tanks beside it
 * already carry the `GroundBlob` contact annulus.
 */
describe('grain elevator plinth', () => {
  it('carries contact darkening that reaches past every side of its foundation', () => {
    const source = readFileSync('src/components/FactoryExterior.tsx', 'utf8');
    const start = source.indexOf('export const GrainElevator: React.FC');
    const end = source.indexOf('\n};\n', start);
    const body = source.slice(start, end);
    const foundation = body.match(
      /asset="factoryConcreteUnit"\s+position=\{\[0, [\d.]+, 0\]\}\s+size=\{\[([\d.]+), [\d.]+, ([\d.]+)\]\}/
    );
    expect(foundation).not.toBeNull();
    const [width, depth] = [Number(foundation![1]), Number(foundation![2])];
    const blob = body.match(
      /<GroundBlob position=\{\[0, 0\]\} scale=\{([\d.]+)\} scaleZ=\{([\d.]+)\}/
    );
    expect(blob).not.toBeNull();
    // The silo rule: the soft annulus spreads ~1.5x the footprint's half-size.
    expect(Number(blob![1])).toBeGreaterThanOrEqual(width * 1.45);
    expect(Number(blob![2])).toBeGreaterThanOrEqual(depth * 1.45);
  });
});
