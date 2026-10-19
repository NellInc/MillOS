import { describe, expect, it } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { GENERATED_ASSET_PATHS } from '../../utils/modelLoader';
import { CLOSED_DOUBLE_FACED_ASSETS } from './closedDoubleFacedAssets';

const fileOf = (url: string) => `public/${url.slice(url.indexOf('models/'))}`;
const key = (p: number[]) => p.map((v) => Math.round(v * 1e4)).join(',');

/**
 * FrontSide is only safe on an asset whose every directed edge A->B has a
 * matching B->A: then every part is either a closed solid or a sheet modelled
 * with both faces, and nothing is left showing only a back face.
 */
describe('closed double-faced generated assets', () => {
  it.each([...CLOSED_DOUBLE_FACED_ASSETS])(
    '%s pairs every directed edge and ships a doubleSided material',
    async (asset) => {
      const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
        'draco3d.decoder': await draco3d.createDecoderModule(),
      });
      const document = await io.read(fileOf(GENERATED_ASSET_PATHS[asset]));
      let triangles = 0;
      let unpaired = 0;
      for (const mesh of document.getRoot().listMeshes()) {
        for (const primitive of mesh.listPrimitives()) {
          expect(primitive.getMaterial()?.getDoubleSided()).toBe(true);
          const position = primitive.getAttribute('POSITION')!;
          const indices = primitive.getIndices();
          const count = indices ? indices.getCount() : position.getCount();
          const vertex = (k: number) =>
            key(position.getElement(indices ? indices.getScalar(k) : k, []));
          const directed = new Map<string, number>();
          for (let t = 0; t < count; t += 3) {
            const [a, b, c] = [vertex(t), vertex(t + 1), vertex(t + 2)];
            if (a === b || b === c || a === c) continue;
            triangles++;
            for (const edge of [`${a}|${b}`, `${b}|${c}`, `${c}|${a}`]) {
              directed.set(edge, (directed.get(edge) ?? 0) + 1);
            }
          }
          for (const [edge, n] of directed) {
            const [u, v] = edge.split('|');
            unpaired += Math.max(0, n - (directed.get(`${v}|${u}`) ?? 0));
          }
        }
      }
      expect(triangles).toBeGreaterThan(0);
      expect(unpaired).toBe(0);
    },
    60_000
  );
});
