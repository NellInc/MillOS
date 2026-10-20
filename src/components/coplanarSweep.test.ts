import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RIVER_FOOTBRIDGE_DECK } from '../constants/siteLayout';
import {
  createRiverFootbridgeAccessGeometry,
  createRiverFootbridgeFrameGeometry,
} from './exterior/riverGeometry';
import { WORKER_TOOL_GEOMETRIES } from './workers/WorkerTools';

/**
 * Coplanar faces of different colour found by the colour-aware triangle sweep
 * over every benchmark scene (2026-10-20). Each test pins the relationship the
 * fix established, on the real geometry or the real source.
 */

type Tri = { p: THREE.Vector3[]; colour: string };

/** Axis-aligned triangles of a geometry whose normal lies along `axis` (0, 1, 2). */
function axisFaces(geometry: THREE.BufferGeometry, axis: number, offset = new THREE.Vector3()) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = g.getAttribute('position');
  const colour = g.getAttribute('color');
  const out: Tri[] = [];
  for (let i = 0; i < position.count; i += 3) {
    const p = [0, 1, 2].map((k) =>
      new THREE.Vector3().fromBufferAttribute(position, i + k).add(offset)
    );
    const n = new THREE.Vector3()
      .subVectors(p[1], p[0])
      .cross(new THREE.Vector3().subVectors(p[2], p[0]));
    if (n.length() < 1e-12) continue;
    n.normalize();
    if (Math.abs(n.getComponent(axis)) < 0.9999) continue;
    out.push({
      p,
      colour: colour
        ? new THREE.Color().fromBufferAttribute(colour as THREE.BufferAttribute, i).getHexString()
        : '',
    });
  }
  return out;
}

const area2 = (poly: number[][]) =>
  poly.reduce((a, [x1, y1], i) => {
    const [x2, y2] = poly[(i + 1) % poly.length];
    return a + x1 * y2 - x2 * y1;
  }, 0) / 2;
function clipArea(a: number[][], b: number[][]) {
  const ccw = (p: number[][]) => (area2(p) < 0 ? [...p].reverse() : p);
  let out = ccw(a);
  const clipper = ccw(b);
  for (let i = 0; i < clipper.length && out.length; i++) {
    const [ax, ay] = clipper[i];
    const [bx, by] = clipper[(i + 1) % clipper.length];
    const side = ([px, py]: number[]) => (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    const input = out;
    out = [];
    for (let k = 0; k < input.length; k++) {
      const cur = input[k];
      const prev = input[(k + input.length - 1) % input.length];
      const sc = side(cur);
      const sp = side(prev);
      const at = () => {
        const t = sp / (sp - sc);
        return [prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t];
      };
      if (sc >= 0) {
        if (sp < 0) out.push(at());
        out.push(cur);
      } else if (sp >= 0) out.push(at());
    }
  }
  return out.length >= 3 ? Math.abs(area2(out)) : 0;
}

/** Overlapping area of same-plane faces of different colour, along `axis`. */
function conflictArea(a: Tri[], b: Tri[], axis: number, tolerance = 1e-5) {
  const [u, v] = [0, 1, 2].filter((k) => k !== axis);
  let total = 0;
  for (const s of a)
    for (const t of b) {
      if (s.colour === t.colour && s.colour !== '') continue;
      const ds = s.p.map((q) => q.getComponent(axis));
      const dt = t.p.map((q) => q.getComponent(axis));
      if (Math.max(...ds, ...dt) - Math.min(...ds, ...dt) > tolerance) continue;
      total += clipArea(
        s.p.map((q) => [q.getComponent(u), q.getComponent(v)]),
        t.p.map((q) => [q.getComponent(u), q.getComponent(v)])
      );
    }
  return total;
}

describe('colour-aware coplanar sweep fixes', () => {
  it('keeps footbridge post tops under the handrail tops they meet', () => {
    // Approach stair posts and the frame's bay posts both topped out at the
    // handrail top (3.5 m), steel against the trim colour on every post.
    const access = createRiverFootbridgeAccessGeometry();
    const frame = createRiverFootbridgeFrameGeometry();
    const frameFaces = axisFaces(
      frame,
      1,
      new THREE.Vector3(0, 0, RIVER_FOOTBRIDGE_DECK.centre[2])
    );
    const accessFaces = axisFaces(access, 1);
    expect(conflictArea(accessFaces, frameFaces, 1)).toBe(0);
    expect(conflictArea(frameFaces, frameFaces, 1)).toBe(0);
    expect(conflictArea(accessFaces, accessFaces, 1)).toBe(0);
    access.dispose();
    frame.dispose();
  });

  it('stands the clipboard hinge proud of the board top', () => {
    // The clip sits at y 0.07 on the board; its hinge bar's top lay on the
    // board's top face (chrome against brown at 0 mm).
    const board = axisFaces(WORKER_TOOL_GEOMETRIES.clipboard.board, 1);
    const clip = axisFaces(
      WORKER_TOOL_GEOMETRIES.clipboard.clip,
      1,
      new THREE.Vector3(0, 0.07, 0.01)
    );
    board.forEach((face) => (face.colour = 'board'));
    clip.forEach((face) => (face.colour = 'clip'));
    expect(conflictArea(board, clip, 1, 5e-4)).toBe(0);
  });

  it('stands the pond statue in the water rather than on its surface', () => {
    const source = readFileSync('src/components/FactoryExterior.tsx', 'utf8');
    const pond = source.slice(source.indexOf('const Pond: React.FC'));
    const water =
      /<mesh\s+position=\{\[0, ([\d.]+), 0\]\}\s+rotation=\{\[-Math\.PI \/ 2, 0, 0\]\}\s+receiveShadow\s+renderOrder=\{RENDER_ORDER\.waterSurface\}/.exec(
        pond
      )!;
    const statue = /<CupidStatue position=\{\[0, ([\d.]+), 0\]\}/.exec(pond)!;
    expect(Number(water[1]) - Number(statue[1])).toBeGreaterThanOrEqual(0.01);
  });

  it('ends the conveyor side rails inside the frame ends', () => {
    const source = readFileSync('src/components/ConveyorSystem.tsx', 'utf8');
    const frame = /<boxGeometry args=\{\[([\d.]+), 0\.2, 2\.5\]\} \/>/.exec(source)!;
    const rails = [...source.matchAll(/<boxGeometry args=\{\[([\d.]+), 0\.35, 0\.1\]\} \/>/g)];
    expect(rails).toHaveLength(2);
    for (const rail of rails) expect(Number(frame[1]) - Number(rail[1])).toBeGreaterThan(0.0199);
  });
});
