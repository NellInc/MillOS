import { InteriorLightRig } from './InteriorLightRig';
import { OptimizedSkySystem } from './OptimizedSkySystem';
import { SceneEnvironmentIBL } from './SceneEnvironmentIBL';
import { SunShadowRig } from './SunShadowRig';
import { NearHorizonCity } from './NearHorizonCity';
import { SiloFloodlights } from '../exterior/SiloFloodlights';

/**
 * Default-quality environment. The shell belongs to
 * OptimizedFactoryInfrastructure, so this component only owns sky and light.
 * That removes the previous duplicate wall and roof systems.
 *
 * THE ORDER OF THESE CHILDREN IS LOAD-BEARING. `OptimizedSkySystem` writes
 * `sun-key-light.position` from the solar direction in its own `useFrame`, and
 * `SunShadowRig` has to read that and then overwrite the position with a fitted
 * one. R3F sorts frame subscribers by render priority with a stable sort, so
 * equal priorities run in subscription order, which is mount order, which is
 * this order. Raising the rig's priority instead is not an option: R3F reads any
 * non-zero priority as "the app renders manually" and stops calling `gl.render`.
 *
 * WHAT WAS REMOVED HERE, AND WHY: a second, unshadowed `directionalLight` named
 * `factory-window-bounce` at intensity 0.34, and a hemisphere fill at 0.7. Both
 * predate there being any shadow pass at the default preset. A second
 * directional light with no shadow map fills in exactly the regions the first
 * one's shadow map just carved out - it erases shadow interiors, which is the
 * single most effective way to make a scene with shadows look like a scene
 * without them. CLAUDE.md also mandates exactly one shadow-casting directional,
 * and this was the second directional of any kind. Its job - window and slab
 * bounce - is what `SceneEnvironmentIBL` actually does, from the correct
 * directions, with the sky's own colours.
 */
export function OptimizedFactoryEnvironment() {
  return (
    <group name="optimized-factory-environment">
      <OptimizedSkySystem />
      <NearHorizonCity />
      <SunShadowRig />
      {/* Owns the hemisphere fill as well as `scene.environment`, so the two
          cannot drift: both are driven from the sky's live band colours. */}
      <SceneEnvironmentIBL />
      <InteriorLightRig />
      {/* Floodlit silo battery: lamp heads plus an additive shell wash on the
          shared lamp clock. No light and no shadow caster. */}
      <SiloFloodlights />
    </group>
  );
}
