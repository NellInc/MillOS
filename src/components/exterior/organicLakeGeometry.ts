import * as THREE from 'three';

const DEFAULT_SEGMENTS = 72;

function shorelineFactor(angle: number, seed: number): number {
  return (
    1 +
    Math.sin(angle * 3 + seed) * 0.055 +
    Math.sin(angle * 5 - seed * 1.7) * 0.035 +
    Math.sin(angle * 11 + seed * 0.6) * 0.015
  );
}

/**
 * Build a softly irregular lake with concentric radial subdivisions. The extra
 * rings let vertex waves bend continuously across the surface instead of
 * stretching one centre-to-shore triangle over the full lake radius.
 */
export function createOrganicLakeSurfaceGeometry(
  radiusX: number,
  radiusZ: number,
  segments = DEFAULT_SEGMENTS,
  seed = 0.74,
  radialSegments = 6
): THREE.BufferGeometry {
  const safeRadiusX = Math.max(0.1, radiusX);
  const safeRadiusZ = Math.max(0.1, radiusZ);
  const safeSegments = Math.max(12, Math.floor(segments));
  const safeRadialSegments = Math.max(2, Math.floor(radialSegments));
  const positions: number[] = [0, 0, 0];
  const uvs: number[] = [0.5, 0.5];
  const indices: number[] = [];

  for (let ring = 1; ring <= safeRadialSegments; ring += 1) {
    const radialRatio = ring / safeRadialSegments;
    for (let segment = 0; segment <= safeSegments; segment += 1) {
      const progress = segment === safeSegments ? 0 : segment / safeSegments;
      const angle = progress * Math.PI * 2;
      const edgeFactor = shorelineFactor(angle, seed);
      const factor = THREE.MathUtils.lerp(1, edgeFactor, radialRatio * radialRatio);
      const x = Math.cos(angle) * safeRadiusX * radialRatio * factor;
      const z = Math.sin(angle) * safeRadiusZ * radialRatio * factor;
      positions.push(x, z, 0);
      uvs.push(
        0.5 + Math.cos(angle) * radialRatio * 0.5,
        0.5 + Math.sin(angle) * radialRatio * 0.5
      );
    }
  }

  for (let segment = 0; segment < safeSegments; segment += 1) {
    indices.push(0, 1 + segment, 2 + segment);
  }
  const ringStride = safeSegments + 1;
  for (let ring = 1; ring < safeRadialSegments; ring += 1) {
    const innerStart = 1 + (ring - 1) * ringStride;
    const outerStart = innerStart + ringStride;
    for (let segment = 0; segment < safeSegments; segment += 1) {
      const innerLeft = innerStart + segment;
      const innerRight = innerLeft + 1;
      const outerLeft = outerStart + segment;
      const outerRight = outerLeft + 1;
      indices.push(innerLeft, outerLeft, innerRight, innerRight, outerLeft, outerRight);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Build one non-overlapping bank mesh with a damp inner edge, aggregate
 * middle, and grass-tinted outer transition.
 */
export function createOrganicLakeBankGeometry(
  waterRadiusX: number,
  waterRadiusZ: number,
  shoreRadiusX: number,
  shoreRadiusZ: number,
  segments = DEFAULT_SEGMENTS,
  seed = 0.74
): THREE.BufferGeometry {
  const safeSegments = Math.max(12, Math.floor(segments));
  const rows = 5;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const rowColors = [
    new THREE.Color('#425750'),
    new THREE.Color('#6e7366'),
    new THREE.Color('#928a70'),
    new THREE.Color('#6f7759'),
    new THREE.Color('#526c49'),
  ];
  // The bank is placed at world y=0.08. Sink its outside edge through the
  // ground datum (-0.02), rather than leaving a raised cut edge above the lawn.
  const rowHeights = [-0.05, 0.015, 0.105, 0.035, -0.12] as const;

  for (let segment = 0; segment <= safeSegments; segment += 1) {
    const progress = segment === safeSegments ? 0 : segment / safeSegments;
    const angle = progress * Math.PI * 2;
    const innerFactor = shorelineFactor(angle, seed);
    const outerFactor =
      innerFactor + Math.sin(angle * 7 - seed * 2.1) * 0.01 + Math.sin(angle * 13 + seed) * 0.006;

    for (let row = 0; row < rows; row += 1) {
      const baseRatio = row / (rows - 1);
      // Vary the width of each band without moving either boundary or adding
      // vertices. The bounded derivative stays positive, so rows cannot fold.
      const sweep = Math.sin(angle * 3 + seed) * 0.08 + Math.sin(angle * 7 - seed) * 0.035;
      const ratio = baseRatio + sweep * Math.sin(Math.PI * baseRatio);
      const radiusX = THREE.MathUtils.lerp(waterRadiusX * 0.985, shoreRadiusX, ratio);
      const radiusZ = THREE.MathUtils.lerp(waterRadiusZ * 0.985, shoreRadiusZ, ratio);
      const factor = THREE.MathUtils.lerp(innerFactor, outerFactor, ratio);
      positions.push(
        Math.cos(angle) * radiusX * factor,
        Math.sin(angle) * radiusZ * factor,
        rowHeights[row] + Math.sin(angle * 5 + seed) * 0.02 * Math.sin(Math.PI * baseRatio)
      );
      const color = rowColors[row];
      const shade = 0.96 + 0.04 * Math.sin(angle * 4 + seed + baseRatio * 2);
      colors.push(color.r * shade, color.g * shade, color.b * shade);
    }
  }

  for (let segment = 0; segment < safeSegments; segment += 1) {
    for (let row = 0; row < rows - 1; row += 1) {
      const innerLeft = segment * rows + row;
      const innerRight = (segment + 1) * rows + row;
      const outerLeft = innerLeft + 1;
      const outerRight = innerRight + 1;
      indices.push(innerLeft, outerLeft, innerRight, innerRight, outerLeft, outerRight);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
