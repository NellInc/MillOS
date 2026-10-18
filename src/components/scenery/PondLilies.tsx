import * as THREE from 'three';
import { PlotGeometry } from '../../utils/authoredPlotGeometry';

type Point = [number, number, number];
export const POND_LILY_SITES: ReadonlyArray<{
  position: Point;
  radius: number;
  depth: number;
  yaw: number;
  bloom: 'open' | 'bud' | 'none';
}> = [
  { position: [-2, 0.395, 0], radius: 0.36, depth: 0.86, yaw: 0, bloom: 'open' },
  { position: [1, 0.395, -1.5], radius: 0.42, depth: 0.92, yaw: 1, bloom: 'none' },
  { position: [-0.5, 0.395, 2.5], radius: 0.36, depth: 0.98, yaw: 2, bloom: 'bud' },
];

/** Thin closed laminae retain both faces at low viewpoints without transparent
 * sorting or double-sided lighting. Working if reverse views remain solid and
 * the three original plant draws contain finite, attached botanical detail. */
function lamina(
  rows: number,
  columns: number,
  point: (u: number, v: number) => Point,
  shade: (u: number, v: number) => THREE.Color,
  thickness = 0.0012
) {
  const positions: number[] = [],
    colors: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  const count = (rows + 1) * (columns + 1);
  for (let side = 0; side < 2; side++)
    for (let i = 0; i <= rows; i++)
      for (let j = 0; j <= columns; j++) {
        const u = j / columns,
          v = i / rows,
          p = point(u, v);
        positions.push(p[0], p[1] - side * thickness, p[2]);
        const c = shade(u, v);
        if (side) c.multiplyScalar(0.8);
        colors.push(c.r, c.g, c.b);
        uv.push(u, v);
      }
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < columns; j++) {
      const a = i * (columns + 1) + j,
        b = a + 1,
        c = a + columns + 1,
        d = c + 1;
      indices.push(
        a,
        b,
        c,
        b,
        d,
        c,
        a + count,
        c + count,
        b + count,
        b + count,
        c + count,
        d + count
      );
    }
  const edge: number[] = [];
  for (let j = 0; j <= columns; j++) edge.push(j);
  for (let i = 1; i <= rows; i++) edge.push(i * (columns + 1) + columns);
  for (let j = columns - 1; j >= 0; j--) edge.push(rows * (columns + 1) + j);
  for (let i = rows - 1; i > 0; i--) edge.push(i * (columns + 1));
  for (let i = 0; i < edge.length; i++) {
    const a = edge[i],
      b = edge[(i + 1) % edge.length];
    indices.push(a, a + count, b, b, a + count, b + count);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

export function createPondLilyGeometry(index: number): THREE.BufferGeometry {
  const site = POND_LILY_SITES[index],
    build = new PlotGeometry();
  const leaf = new THREE.Color(['#466c39', '#577340', '#3d6544'][index]);
  const edge = new THREE.Color('#799257');
  const leafPoint = (u: number, v: number): Point => {
    const angle = 0.22 + u * (Math.PI * 2 - 0.44);
    const radius =
      site.radius *
      (0.018 + 0.982 * v) *
      (0.96 + 0.025 * Math.sin(angle * 3 + index) + 0.012 * Math.sin(angle * 5));
    return [
      Math.cos(angle) * radius,
      0.002 + Math.sin(v * Math.PI) * 0.008 + Math.sin(angle * 5 + index) * v ** 6 * 0.003,
      Math.sin(angle) * radius * site.depth,
    ];
  };
  build.parts.push(
    lamina(5, 40, leafPoint, (u, v) =>
      leaf.clone().lerp(edge, 0.05 + v ** 3 * 0.22 + Math.sin(u * Math.PI * 10) ** 2 * 0.025)
    )
  );
  // Fine veins sit on the measured curved leaf, rather than on a coplanar disc.
  for (let i = 0; i < 7; i++) {
    const u = 0.055 + i * 0.145;
    const points = Array.from({ length: 7 }, (_, j) => {
      const p = leafPoint(u, 0.1 + j * 0.13);
      return new THREE.Vector3(p[0], p[1] + 0.001, p[2]);
    });
    build.add(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 6, 0.0011, 4, false),
      '#718448'
    );
  }
  if (site.bloom === 'open') {
    const x = -0.06,
      z = 0.04;
    build.add(new THREE.CylinderGeometry(0.008, 0.009, 0.045, 8).translate(x, 0.028, z), '#466b38');
    build.add(
      new THREE.SphereGeometry(0.033, 12, 8).scale(1, 0.48, 1).translate(x, 0.045, z),
      '#668b45'
    );
    const base = new THREE.Color('#dcaeb7'),
      tip = new THREE.Color('#fff1df');
    for (let ring = 0; ring < 3; ring++) {
      const petals = 12 - ring * 2,
        length = 0.155 - ring * 0.028;
      for (let i = 0; i < petals; i++) {
        const angle = (i / petals) * Math.PI * 2 + ring * 0.24;
        build.parts.push(
          lamina(
            6,
            4,
            (u, v) => {
              const progress = 0.5 - 0.5 * Math.cos(v * Math.PI);
              const radius = 0.014 + length * progress;
              const width =
                (Math.sin(v * Math.PI) ** 0.55 * (0.043 - ring * 0.007) + 0.0007) * (u * 2 - 1);
              return [
                x + Math.cos(angle) * radius - Math.sin(angle) * width,
                0.035 +
                  ring * 0.009 +
                  progress * progress * (0.045 + ring * 0.008) +
                  Math.sin(v * Math.PI) * (u * 2 - 1) ** 2 * 0.008,
                z + Math.sin(angle) * radius + Math.cos(angle) * width,
              ];
            },
            (_, v) => base.clone().lerp(tip, 0.25 + v * 0.75)
          )
        );
      }
    }
    build.add(
      new THREE.SphereGeometry(0.028, 12, 8).scale(1, 0.42, 1).translate(x, 0.063, z),
      '#d79c2f'
    );
    for (let i = 0; i < 14; i++) {
      const a = (i * Math.PI * 2) / 14,
        r = 0.017,
        y = 0.08 + Math.sin(i * 1.7) * 0.003;
      const px = x + Math.cos(a) * r,
        pz = z + Math.sin(a) * r;
      build.add(
        new THREE.CylinderGeometry(0.002, 0.0025, 0.024, 5).translate(px, y - 0.01, pz),
        '#e6bf55'
      );
      build.add(new THREE.SphereGeometry(0.0038, 6, 4).translate(px, y + 0.002, pz), '#efcb6b');
    }
  } else if (site.bloom === 'bud') {
    const x = -0.06,
      z = 0.04;
    build.add(new THREE.CylinderGeometry(0.006, 0.008, 0.048, 8).translate(x, 0.027, z), '#4e723c');
    build.add(
      new THREE.SphereGeometry(0.03, 12, 10).scale(0.9, 1.6, 0.9).translate(x, 0.083, z),
      '#f0d0d0'
    );
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5;
      build.parts.push(
        lamina(
          5,
          3,
          (u, v) => {
            const r = 0.008 + Math.sin(v * Math.PI * 0.88) * 0.025;
            const theta = a + (u - 0.5) * Math.sin(v * Math.PI) * 0.95;
            return [x + Math.cos(theta) * r, 0.036 + v * 0.067, z + Math.sin(theta) * r];
          },
          (_, v) => new THREE.Color('#51713c').lerp(new THREE.Color('#7e9850'), v * 0.5)
        )
      );
    }
  }
  return build.finish();
}

export const POND_LILY_GEOMETRIES = POND_LILY_SITES.map((_, index) =>
  createPondLilyGeometry(index)
);
export const POND_LILY_MATERIAL = new THREE.MeshStandardMaterial({
  name: 'pond-lily-wet-leaf-and-petals',
  vertexColors: true,
  roughness: 0.57,
  metalness: 0,
});

/** Shared static planting, in the original three footprints. No animation,
 * textures or shadows. The group follows the delivered or fallback water datum.
 * Working if leaves meet the water and authored detail stays in three draws. */
export function PondLilies({ waterLevel = 0.35 }: { waterLevel?: number } = {}) {
  return (
    <group name="pond-floating-planting" position={[0, waterLevel - 0.395, 0]} dispose={null}>
      {POND_LILY_SITES.map((site, i) => (
        <mesh
          key={i}
          name={`pond-lily-pad-${i}`}
          position={site.position}
          rotation={[0, site.yaw, 0]}
          geometry={POND_LILY_GEOMETRIES[i]}
          material={POND_LILY_MATERIAL}
        />
      ))}
    </group>
  );
}
