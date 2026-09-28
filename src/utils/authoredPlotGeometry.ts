import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
type Point = readonly [number, number, number];

// Same vertex-colour / premerge construction as AuthoredPropTrim. All static
// detail enters the existing village batch; only live glazing stays separate.
export class PlotGeometry {
  parts: THREE.BufferGeometry[] = [];
  add(geometry: THREE.BufferGeometry, colour: string) {
    const c = new THREE.Color(colour);
    const values = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let i = 0; i < values.length; i += 3) c.toArray(values, i);
    geometry.setAttribute('color', new THREE.BufferAttribute(values, 3));
    this.parts.push(geometry);
  }
  box(size: Point, at: Point, colour: string, yaw = 0) {
    this.add(new THREE.BoxGeometry(...size).rotateY(yaw).translate(...at), colour);
  }
  round(at: Point, scale: Point, colour: string) {
    this.add(new THREE.IcosahedronGeometry(1, 0).scale(...scale).translate(...at), colour);
  }
  beam(a: Point, b: Point, width: number, colour: string) {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b);
    const direction = end.clone().sub(start);
    const g = new THREE.BoxGeometry(width, direction.length(), width);
    g.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
    );
    this.add(g.translate(...start.add(end).multiplyScalar(0.5).toArray()), colour);
  }
  finish() {
    const plain = this.parts.map((g) => (g.index ? g.toNonIndexed() : g));
    const merged = mergeGeometries(plain);
    new Set([...this.parts, ...plain]).forEach((g) => g.dispose());
    if (!merged) throw new Error('Village plot geometry must have matching attributes');
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    return merged;
  }
}
