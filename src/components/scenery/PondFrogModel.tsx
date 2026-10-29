import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Point = [number, number, number];
export const FROG_SOLE_Y = -0.12;

/** A crouched pond frog, facing +X: broad low muzzle, folded haunches,
 * four front fingers and five webbed rear toes. Shared geometry stays in the
 * existing local hop frame and rests on the original lily datum.
 * Working if silhouette, foot contact and amber horizontal pupils read at pond scale.
 */
export function createPondFrogGeometry() {
  const skin: THREE.BufferGeometry[] = [],
    eyes: THREE.BufferGeometry[] = [];
  const dorsal = new THREE.Color('#597342'),
    flank = new THREE.Color('#819052'),
    belly = new THREE.Color('#c9bf88'),
    spot = new THREE.Color('#3c5539');
  function add(g: THREE.BufferGeometry, colour?: string, eye = false) {
    const p = g.getAttribute('position'),
      colors = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      if (colour) c.set(colour);
      else {
        const y = p.getY(i),
          x = p.getX(i),
          z = p.getZ(i);
        c.copy(flank).lerp(dorsal, THREE.MathUtils.smoothstep(y, -0.025, 0.075));
        c.lerp(belly, (1 - THREE.MathUtils.smoothstep(y, -0.07, -0.015)) * 0.8);
        const mottling = Math.sin(x * 165 + Math.sin(z * 120) * 1.8) * Math.sin(z * 141 - y * 71);
        c.lerp(spot, THREE.MathUtils.smoothstep(mottling, 0.38, 0.85) * 0.43);
      }
      c.toArray(colors, i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    (eye ? eyes : skin).push(g);
  }
  function oval(at: Point, scale: Point, colour?: string, segments = 12, rings = 8, eye = false) {
    add(new THREE.SphereGeometry(1, segments, rings).scale(...scale).translate(...at), colour, eye);
  }
  function limb(a: Point, b: Point, radius: number, colour?: string) {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b),
      d = end.clone().sub(start);
    const g = new THREE.CylinderGeometry(radius * 0.72, radius, d.length(), 6, 1, true);
    g.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())
    );
    add(g.translate(...start.add(end).multiplyScalar(0.5).toArray()), colour);
  }
  function curve(points: Point[], radius: number, colour: string) {
    add(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))),
        10,
        radius,
        4,
        false
      ),
      colour
    );
  }
  oval([-0.034, -0.012, 0], [0.139, 0.091, 0.096], undefined, 20, 12);
  oval([0.093, 0.017, 0], [0.108, 0.061, 0.096], undefined, 20, 12);
  oval([0.081, -0.032, 0], [0.095, 0.035, 0.079], '#c1bd83', 16, 8);
  // The seam is embedded into the actual head envelope, rather than drawn
  // across empty space in front of the muzzle.
  curve(
    [-0.078, -0.06, -0.028, 0, 0.028, 0.06, 0.078].map((z) => {
      const y = -0.008 + (Math.abs(z) / 0.078) * 0.008;
      return [
        0.093 + 0.108 * Math.sqrt(1 - ((y - 0.017) / 0.061) ** 2 - (z / 0.096) ** 2) - 0.0008,
        y,
        z,
      ] as Point;
    }),
    0.0018,
    '#536044'
  );
  for (const side of [-1, 1]) {
    oval([-0.093, -0.045, side * 0.102], [0.079, 0.055, 0.053]);
    limb([-0.127, -0.068, side * 0.121], [-0.012, -0.102, side * 0.151], 0.014);
    oval([-0.012, -0.103, side * 0.151], [0.018, 0.012, 0.022]);
    // Thin solid web between the five rounded toes, with no alpha/depth overlay.
    const web = new THREE.BufferGeometry();
    const p: number[] = [];
    const heel: Point = [-0.012, -0.112, side * 0.151];
    for (let toe = 0; toe < 5; toe++) {
      const end: Point = [
        0.046 + 0.013 * Math.sin((toe / 4) * Math.PI),
        -0.116,
        side * (0.12 + toe * 0.014),
      ];
      limb(heel, end, 0.0042, '#7e8952');
      oval(end, [0.006, 0.004, 0.0045], '#9d9e63', 6, 4);
      if (toe < 4)
        p.push(
          ...heel,
          ...end,
          0.046 + 0.013 * Math.sin(((toe + 1) / 4) * Math.PI),
          -0.116,
          side * (0.12 + (toe + 1) * 0.014)
        );
    }
    web.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    web.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute(new Array((p.length / 3) * 2).fill(0), 2)
    );
    // Reverse winding is explicit, so the thin web is lit from either side.
    const back = p.slice();
    for (let i = 0; i < back.length; i += 9)
      for (let k = 0; k < 3; k++)
        [back[i + 3 + k], back[i + 6 + k]] = [back[i + 6 + k], back[i + 3 + k]];
    web.setAttribute('position', new THREE.Float32BufferAttribute([...p, ...back], 3));
    web.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute(new Array((p.length / 3) * 4).fill(0), 2)
    );
    web.computeVertexNormals();
    add(web, '#77824e');
    limb([0.075, -0.022, side * 0.071], [0.095, -0.068, side * 0.096], 0.013);
    limb([0.095, -0.068, side * 0.096], [0.143, -0.107, side * 0.11], 0.01);
    oval([0.145, -0.11, side * 0.11], [0.019, 0.009, 0.018]);
    for (let finger = 0; finger < 4; finger++) {
      const tip: Point = [
        0.174 + 0.01 * Math.sin((finger / 3) * Math.PI),
        -0.116,
        side * (0.087 + finger * 0.014),
      ];
      limb([0.149, -0.11, side * 0.11], tip, 0.0037, '#87905b');
      oval(tip, [0.0055, 0.004, 0.004], '#b1ac74', 6, 4);
    }
    oval([0.116, 0.074, side * 0.073], [0.034, 0.038, 0.033]);
    oval([0.144, 0.08, side * 0.077], [0.009, 0.024, 0.025], '#bca35c', 14, 8, true);
    oval([0.151, 0.08, side * 0.077], [0.004, 0.0057, 0.019], '#172b24', 12, 6, true);
    oval([0.155, 0.09, side * 0.071], [0.0026, 0.003, 0.0027], '#e4dfbb', 6, 4, true);
    oval([0.189, 0.037, side * 0.036], [0.0035, 0.0024, 0.004], '#3d5136', 6, 4);
    const top = (
      x: number,
      z: number,
      cx: number,
      cy: number,
      rx: number,
      ry: number,
      rz: number
    ) => {
      const q = 1 - ((x - cx) / rx) ** 2 - (z / rz) ** 2;
      return q > 0 ? cy + ry * Math.sqrt(q) : -Infinity;
    };
    curve(
      [-0.118, -0.09, -0.055, -0.015, 0.025, 0.065].map((x, i) => {
        const z = side * (0.044 + i * 0.004);
        const y = Math.max(
          top(x, z, -0.034, -0.012, 0.139, 0.091, 0.096),
          top(x, z, 0.093, 0.017, 0.108, 0.061, 0.096)
        );
        return [x, y - 0.001, z] as Point;
      }),
      0.0028,
      '#a4a871'
    );
  }
  function finish(parts: THREE.BufferGeometry[]) {
    const nonIndexed = parts.map((g) => (g.index ? g.toNonIndexed() : g));
    const geometry = mergeGeometries(nonIndexed, false);
    new Set([...parts, ...nonIndexed]).forEach((g) => g.dispose());
    if (!geometry) throw Error('Cannot merge pond frog anatomy');
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
  return { skin: finish(skin), eyes: finish(eyes) };
}
const GEOMETRY = createPondFrogGeometry();
const SKIN = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.57 });
const EYES = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22 });
export function PondFrogModel() {
  return (
    <group
      name="crafted-pond-frog"
      userData={{ dynamic: true, noStaticBatch: true }}
      dispose={null}
    >
      <mesh
        name="pond-frog-skin"
        geometry={GEOMETRY.skin}
        material={SKIN}
        castShadow
        receiveShadow
      />
      <mesh
        name="pond-frog-eyes"
        geometry={GEOMETRY.eyes}
        material={EYES}
        castShadow
        receiveShadow
      />
    </group>
  );
}
