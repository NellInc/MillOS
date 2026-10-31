import * as THREE from 'three';

export const NISSEN_HUT_FALLBACK_RADIUS = 2.5;

/**
 * Keep the existing 24-segment extruded shell, including its own end triangles.
 * The old additional 16-segment circles overlapped those caps and protruded by
 * up to 5.35 mm between shell chords. One matched boundary removes that defect.
 */
export function createNissenHutFallbackGeometries(length: number) {
  if (!Number.isFinite(length) || length <= 0)
    throw new RangeError('Nissen fallback length must be finite and positive');
  const radius = NISSEN_HUT_FALLBACK_RADIUS;
  const shape = new THREE.Shape();
  shape.moveTo(-radius, 0);
  shape.absarc(0, 0, radius, Math.PI, 0, true);
  shape.lineTo(-radius, 0);
  const extrusion = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: length,
    bevelEnabled: false,
  }).translate(0, 0, -length / 2);

  // Three's material group 0 is the pair of lids, group 1 the side walls.
  // Split their real attributes so each remains a batchable single-material
  // mesh. No overlapping faces, independently sampled circle, or sidedness fix.
  const takeGroup = (materialIndex: number) => {
    const group = extrusion.groups.find((entry) => entry.materialIndex === materialIndex);
    if (!group || extrusion.index)
      throw new Error('Nissen extrusion must expose non-indexed lids and walls');
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(extrusion.attributes)) {
      const start = group.start * attribute.itemSize;
      const end = (group.start + group.count) * attribute.itemSize;
      geometry.setAttribute(
        name,
        new THREE.Float32BufferAttribute(attribute.array.slice(start, end), attribute.itemSize)
      );
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  };
  let shell: THREE.BufferGeometry | undefined;
  try {
    shell = takeGroup(1);
    return { shell, caps: takeGroup(0) };
  } catch (error) {
    shell?.dispose();
    throw error;
  } finally {
    extrusion.dispose();
  }
}
