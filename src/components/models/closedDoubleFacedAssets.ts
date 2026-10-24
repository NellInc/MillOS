import type { GeneratedAssetId } from '../../utils/modelLoader';

/**
 * Generated assets whose thin parts are modelled with BOTH faces - a front
 * sheet and a back sheet in the same plane - but which ship with a
 * `doubleSided` material. GLTFLoader turns that into `THREE.DoubleSide`, so
 * each sheet draws its back face too, coplanar with its partner's front, and
 * the pair z-fights wherever it is seen (the dock canopy over the shipping
 * dock, 39.6 m^2 at y 6.1; the station canopy, 384 m^2).
 *
 * Membership is a claim about the geometry: every directed edge in the asset
 * has its reverse, so every visible side of every part has its own front face
 * and `FrontSide` hides nothing. `closedDoubleFacedAssets.test.ts` checks that
 * claim against the real GLBs. The brick carport (35 unpaired edges) and the
 * fountain (500) fail it - they have genuinely single-sheet parts that would
 * vanish from behind - and are deliberately absent.
 */
export const CLOSED_DOUBLE_FACED_ASSETS: ReadonlySet<GeneratedAssetId> = new Set<GeneratedAssetId>([
  'dockCanopyStructure',
  'stationCanopy',
  'busShelter',
  'checkpointBooth',
]);
