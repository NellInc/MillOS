/**
 * Shader Index
 *
 * Re-exports all procedural shaders for the digital twin visual upgrade.
 */

// Edge enhancement
export { createFresnelRimMaterial, createMachineHousingMaterial } from './fresnelRim';
export { createEdgeHighlightMaterial, createPanelMaterial } from './edgeHighlight';

// Status visualization
export {
  createStatusPulseMaterial,
  updateStatusMaterialTime,
  updateStatusMaterialColor,
} from './statusPulse';

// Surface detail
export { createProceduralSurfaceMaterial, createFloorMaterial } from './proceduralSurface';
export { createPanelGridMaterial, createWallPanelMaterial } from './panelGrid';
export { createGroundPlaneMaterial, createDigitalTwinGround } from './groundPlane';

// Types
export type { FresnelRimMaterialOptions } from './fresnelRim';
export type { EdgeHighlightMaterialOptions } from './edgeHighlight';
export type { StatusPulseMaterialOptions } from './statusPulse';
export type { ProceduralSurfaceMaterialOptions } from './proceduralSurface';
export type { PanelGridMaterialOptions } from './panelGrid';
export type { GroundPlaneMaterialOptions } from './groundPlane';
