import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type V3 = readonly [number, number, number];

/**
 * Authored railway geometry, merged into one batch per material.
 *
 * Same vertex-colour premerge as `PlotGeometry`, plus metre UVs: each part is
 * placed in world metres, then box-projected by its dominant normal axis, so a
 * tiled brick, render or paving map keeps one real scale on every face however
 * the part is sized. Parts that carry their own UVs (roof slopes, swept
 * profiles) opt out of the projection.
 * Working if a 0.225 m brick reads 0.225 m on a plinth, a chimney and a
 * platform wall alike.
 */
export class RailwayGeometry {
  private parts: { geometry: THREE.BufferGeometry; project: boolean }[] = [];

  add(geometry: THREE.BufferGeometry, colour: string, project = true): this {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    if (!flat.getAttribute('normal')) flat.computeVertexNormals();
    if (!flat.getAttribute('uv'))
      flat.setAttribute(
        'uv',
        new THREE.Float32BufferAttribute(
          new Float32Array(flat.getAttribute('position').count * 2),
          2
        )
      );
    const c = new THREE.Color(colour);
    const values = new Float32Array(flat.getAttribute('position').count * 3);
    for (let i = 0; i < values.length; i += 3) c.toArray(values, i);
    flat.setAttribute('color', new THREE.BufferAttribute(values, 3));
    this.parts.push({ geometry: flat, project });
    return this;
  }

  /** Axis-aligned box from its two corners. */
  span(min: V3, max: V3, colour: string): this {
    return this.box(
      [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
      [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
      colour
    );
  }

  box(size: V3, at: V3, colour: string, yaw = 0): this {
    return this.add(new THREE.BoxGeometry(...size).rotateY(yaw).translate(...at), colour);
  }

  /** Upright cylinder; `axis` turns it to lie along X or Z. */
  cylinder(
    radiusTop: number,
    radiusBottom: number,
    height: number,
    at: V3,
    colour: string,
    segments = 12,
    axis: 'x' | 'y' | 'z' = 'y'
  ): this {
    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
    if (axis === 'x') geometry.rotateZ(Math.PI / 2);
    if (axis === 'z') geometry.rotateX(Math.PI / 2);
    return this.add(geometry.translate(...at), colour);
  }

  sphere(radius: number, at: V3, colour: string, scale: V3 = [1, 1, 1], detail = 1): this {
    return this.add(
      new THREE.IcosahedronGeometry(radius, detail).scale(...scale).translate(...at),
      colour
    );
  }

  /** A 2D shape in the local XY plane, extruded `depth` along +Z, then placed. */
  extrude(shape: THREE.Shape, depth: number, matrix: THREE.Matrix4, colour: string): this {
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: false,
      curveSegments: 8,
    });
    return this.add(geometry.applyMatrix4(matrix), colour);
  }

  /** A flat quad or triangle fan with UVs measured in metres across its own plane. */
  polygon(points: readonly V3[], colour: string, uvAxisU: V3, origin: V3 = points[0]): this {
    const u = new THREE.Vector3(...uvAxisU).normalize();
    const a = new THREE.Vector3(...points[0]);
    const normal = new THREE.Vector3()
      .subVectors(new THREE.Vector3(...points[1]), a)
      .cross(new THREE.Vector3().subVectors(new THREE.Vector3(...points[2]), a))
      .normalize();
    const v = new THREE.Vector3().crossVectors(normal, u).normalize();
    const o = new THREE.Vector3(...origin);
    const positions: number[] = [];
    const uvs: number[] = [];
    const normals: number[] = [];
    const push = (point: V3) => {
      const p = new THREE.Vector3(...point);
      positions.push(p.x, p.y, p.z);
      const d = p.sub(o);
      uvs.push(d.dot(u), d.dot(v));
      normals.push(normal.x, normal.y, normal.z);
    };
    for (let i = 1; i < points.length - 1; i++) {
      push(points[0]);
      push(points[i]);
      push(points[i + 1]);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    return this.add(geometry, colour, false);
  }

  get empty(): boolean {
    return this.parts.length === 0;
  }

  finish(name: string): THREE.BufferGeometry {
    for (const { geometry, project } of this.parts) if (project) projectMetreUVs(geometry);
    const merged = mergeGeometries(this.parts.map((part) => part.geometry));
    this.parts.forEach((part) => part.geometry.dispose());
    this.parts = [];
    if (!merged) throw new Error(`Railway geometry "${name}" has mismatched attributes`);
    merged.name = name;
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    return merged;
  }
}

/** Box-project world-metre UVs from each vertex's dominant normal axis. */
export function projectMetreUVs(geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const nz = Math.abs(normal.getZ(i));
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    if (ny >= nx && ny >= nz) uv.setXY(i, x, z);
    else if (nx >= nz) uv.setXY(i, z, y);
    else uv.setXY(i, x, y);
  }
  uv.needsUpdate = true;
}

/** A cloned, repeat-wrapped map whose UV unit is `metres` per tile. */
export function metreTiled(
  source: THREE.Texture,
  metresU: number,
  metresV = metresU
): THREE.Texture {
  const texture = source.clone();
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1 / metresU, 1 / metresV);
  return texture;
}
