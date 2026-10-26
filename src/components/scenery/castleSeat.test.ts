import { describe, expect, it } from 'vitest';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import {
  CASTLE_COURT_HEIGHT,
  CASTLE_WALLS,
  CASTLE_ROCK_OUTLINE,
  CASTLE_ROCK_SINK,
  CASTLE_STAIR_END,
  CASTLE_STAIR_X,
} from '../../constants/castleAccess';
import { sampleFoothillGroundHeight } from '../environment/foothillGround';
import { CASTLE_PLINTH_DEPTH } from './FairytaleCastle';

const castle = SITE_LAYOUT.landmarks.castle;
const cos = Math.cos(castle.rotation[1]),
  sin = Math.sin(castle.rotation[1]);
const toWorld = (x: number, z: number): [number, number] => [
  castle.position[0] + castle.scale * (x * cos + z * sin),
  castle.position[2] + castle.scale * (-x * sin + z * cos),
];
const insideRock = (x: number, z: number) => {
  let inside = false;
  for (let i = 0, j = CASTLE_ROCK_OUTLINE.length - 1; i < CASTLE_ROCK_OUTLINE.length; j = i++) {
    const [xi, zi] = CASTLE_ROCK_OUTLINE[i];
    const [xj, zj] = CASTLE_ROCK_OUTLINE[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
};

/** Ground under the rock: every outline vertex plus a 2 m local grid inside it. */
function groundUnderRock(): number[] {
  const heights = CASTLE_ROCK_OUTLINE.map(([x, z]) => sampleFoothillGroundHeight(...toWorld(x, z)));
  for (let x = -20; x <= 20; x += 2)
    for (let z = -20; z <= 20; z += 2)
      if (insideRock(x, z)) heights.push(sampleFoothillGroundHeight(...toWorld(x, z)));
  return heights;
}

describe('castle seat on the foothills', () => {
  // Re-derived from the shipped ridge meshes, so regenerating the foothills
  // cannot silently leave the castle floating or swallowed.
  const base = castle.position[1] - CASTLE_ROCK_SINK * castle.scale;
  const ground = groundUnderRock();

  it('never shows air under the rock: dips stay within the buried plinth', () => {
    const lowest = Math.min(...ground);
    expect(lowest).toBeGreaterThan(base - CASTLE_PLINTH_DEPTH * castle.scale);
    // And no more than a low footing shows where the hill falls away.
    expect(base - lowest).toBeLessThan(3);
  });

  it('keeps the hill under the open court', () => {
    // Inside the palas and towers the hill is walled off; the open court is not.
    // The first ridge seat let the slope stand up to 7 m above it.
    const floor = castle.position[1] + (CASTLE_COURT_HEIGHT - CASTLE_ROCK_SINK) * castle.scale;
    const above: string[] = [];
    for (let x = -15.5; x <= 15.5; x += 1)
      for (let z = -15.5; z <= 15.5; z += 1) {
        if (CASTLE_WALLS.some(([a, b, c, d]) => x > a && x < b && z > c && z < d)) continue;
        const hill = sampleFoothillGroundHeight(...toWorld(x, z));
        if (hill > floor) above.push(`${x},${z}: ${(hill - floor).toFixed(2)} m`);
      }
    expect(above).toEqual([]);
  });

  it('meets the ground at the foot of its steps, facing the mill', () => {
    const foot = sampleFoothillGroundHeight(...toWorld(CASTLE_STAIR_X, CASTLE_STAIR_END));
    expect(Math.abs(foot - castle.position[1])).toBeLessThan(1);
    // The steps lead somewhere visible: the court stands above the hill there.
    expect(castle.position[1] + CASTLE_COURT_HEIGHT * castle.scale).toBeGreaterThan(foot + 3);
    // The steps face the mill: local +z points back toward the origin.
    const [fx, fz] = toWorld(0, 1);
    const facing = [fx - castle.position[0], fz - castle.position[2]];
    const toMill = [-castle.position[0], -castle.position[2]];
    const alignment =
      (facing[0] * toMill[0] + facing[1] * toMill[1]) /
      (Math.hypot(facing[0], facing[1]) * Math.hypot(toMill[0], toMill[1]));
    expect(alignment).toBeGreaterThan(0.95);
  });
});
