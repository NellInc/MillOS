import { Text } from '@react-three/drei';
import { forwardRef, useCallback } from 'react';
import type { ComponentProps, ComponentRef } from 'react';
import * as THREE from 'three';
import { POLYGON_OFFSET } from '../../constants/renderLayers';

/**
 * Drop-in replacement for drei's <Text> that defaults to a SELF-HOSTED font.
 *
 * Without an explicit `font`, troika-three-text resolves glyphs via
 * @unicode-font-resolver, which fetches font metadata + .woff files from
 * cdn.jsdelivr.net on first render — the last unconditional third-party
 * connection MillOS makes on load. Defaulting `font` to a local font keeps all
 * Latin UI text on-device (GDPR), so no third-party IP transfer occurs.
 *
 * IMPORTANT: this MUST be a TrueType (`glyf`) font, NOT a CFF/PostScript OTF.
 * troika's font parser throws on certain CFF encodings ("unknown encoding
 * format"), and — critically — drei's <Text> SUSPENDS on the font load via
 * suspend-react and troika never resolves that promise on a parse error. A bad
 * font therefore suspends every <Text> forever, which leaves the scene's
 * <Suspense fallback={null}> unresolved and blanks the ENTIRE 3D scene (the DOM
 * UI still renders). There is no graceful fallback when `font` is set
 * explicitly. The bundled Inter-Regular.ttf is a cu2qu glyf conversion of
 * Inter (the original .otf was CFF and triggered exactly this hang).
 */
const DEFAULT_3D_FONT = `${import.meta.env.BASE_URL}fonts/Inter-Regular.ttf`;

type GlyphsGeometry = THREE.BufferGeometry & {
  isInstancedBufferGeometry?: boolean;
  instanceCount?: number;
};

/**
 * Give the glyph geometry a finite instance count before its first draw.
 *
 * troika's `GlyphsGeometry` (0.52.4, `src/GlyphsGeometry.js`) never assigns
 * `instanceCount` in its constructor, so it inherits `InstancedBufferGeometry`'s
 * default of **Infinity** and only takes a real value in `updateGlyphs()`, which
 * runs asynchronously after layout. Between mount and that callback the mesh is
 * a bare quad — `[position, normal, uv]`, 4 vertices, 6 indices — with no
 * instanced attribute of any kind.
 *
 * That combination is the trap. `WebGLBindingStates` only sets
 * `geometry._maxInstanceCount` when it binds an instanced attribute
 * (`WebGLBindingStates.js:361,403`), so with none present it stays `undefined`,
 * and `WebGLRenderer.js:1316-1317` resolves the draw as
 * `Math.min(Infinity, Infinity)`. The GL call itself is harmless — `primcount`
 * converts to 0, so nothing is drawn — but `WebGLInfo.update` runs first and
 * does `render.triangles += Infinity * (6 / 3)`.
 *
 * `render.calls` increments before the switch, `render.triangles` inside it, so
 * the accumulator is poisoned while draw calls keep counting correctly. In
 * benchmark mode `info.autoReset` is off for the whole measured window, which
 * makes one transient frame permanent: the app reported `triangles: 0` for
 * every scene, and `forklift` reported it on EVERY run because that scene
 * streams labels in and out and so re-poisons the counter after the post-warmup
 * `reset()`.
 *
 * Setting 0 rather than any other value is what stops the draw entirely:
 * `WebGLIndexedBufferRenderer.renderInstances` returns early on `primcount === 0`
 * before calling `info.update`. troika overwrites it in `updateGlyphs()` and
 * `applyClipRect()`, neither of which reads the previous value, so nothing here
 * survives into a laid-out text.
 */
export function initialiseGlyphInstanceCount(mesh: THREE.Mesh | null): void {
  const geometry = mesh?.geometry as GlyphsGeometry | undefined;
  if (!geometry?.isInstancedBufferGeometry) return;
  if (Number.isFinite(geometry.instanceCount)) return;
  geometry.instanceCount = 0;
}

/**
 * PAINTED TEXT IS LIT. Everything else here is not, and that is deliberate.
 *
 * troika's `Text` renders through a `MeshBasicMaterial` by default, which is
 * correct for the overwhelming majority of this repo's in-scene labels: machine
 * status readouts, holographic displays, worker thought bubbles and HUD-like
 * annotations are meant to stay legible whatever the sun is doing. Changing the
 * shared wrapper would take all of them with it.
 *
 * But a label PAINTED ON THE GROUND is paint. Pass 4 converted 59 painted
 * marking sites from `meshBasicMaterial` to `meshStandardMaterial` and took a
 * `shipping` capture at midnight from 20,203 bright ground pixels to zero -
 * and the ground-painted `<Text>` labels were the one thing left glowing,
 * because they are unlit by construction. This is the opt-in for those.
 *
 * troika derives its text material from whatever base it is given
 * (`createTextDerivedMaterial`, `chained: true`) and sets `transparent` on the
 * DERIVED material, so a shared opaque-ish standard base is safe. It also
 * applies the `color` prop to the derived material rather than the base
 * ("applied only to the derived material to avoid mutating a shared base
 * material"), which is why one module-level instance can serve every call site
 * while each keeps its own colour.
 *
 * The values track `ROAD_PAINT_WHITE` in `FactoryExterior.tsx`: chalky
 * thermoplastic, and a small emissive floor so markings stay readable under the
 * night ambient instead of going fully black.
 */
const PAINTED_TEXT_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  roughness: 0.78,
  metalness: 0,
  emissive: new THREE.Color('#141310'),
  emissiveIntensity: 0.2,
  side: THREE.DoubleSide,
  transparent: true,
  depthWrite: false,
});

/**
 * The same paint, biased like the yard markings it sits among
 * (`POLYGON_OFFSET.exteriorOverlay`). A ground label at
 * `EXTERIOR_LAYERS.groundOverlay` is only 1 cm above the ground datum, and with
 * no bias of its own it loses to a biased surface such as the dock apron
 * (`exteriorTop` -1) beyond about 5.5 m on medium. troika derives its text
 * material with `Object.create(base)`, so the offset is inherited.
 */
const PAINTED_GROUND_TEXT_MATERIAL = PAINTED_TEXT_MATERIAL.clone();
PAINTED_GROUND_TEXT_MATERIAL.polygonOffset = true;
PAINTED_GROUND_TEXT_MATERIAL.polygonOffsetFactor = POLYGON_OFFSET.exteriorOverlay.factor;
PAINTED_GROUND_TEXT_MATERIAL.polygonOffsetUnits = POLYGON_OFFSET.exteriorOverlay.units;

const SURFACE_MATERIALS: Record<SceneTextSurface, THREE.Material | undefined> = {
  unlit: undefined,
  painted: PAINTED_TEXT_MATERIAL,
  'painted-ground': PAINTED_GROUND_TEXT_MATERIAL,
};

/**
 * `unlit` (default) keeps troika's basic material - status readouts, signage
 * that is internally illuminated, anything that must stay legible after dark.
 * `painted` is for text that represents PAINT on a surface.
 * `painted-ground` is paint on a biased exterior ground surface (the dock
 * apron, the approach road): painted, plus the overlay bias.
 */
export type SceneTextSurface = 'unlit' | 'painted' | 'painted-ground';

type SceneTextProps = ComponentProps<typeof Text> & {
  surface?: SceneTextSurface;
};

export const SceneText = forwardRef<ComponentRef<typeof Text>, SceneTextProps>(function SceneText(
  { font, surface = 'unlit', material, ...props },
  ref
) {
  const attachRef = useCallback(
    (mesh: ComponentRef<typeof Text> | null) => {
      initialiseGlyphInstanceCount(mesh as THREE.Mesh | null);
      if (typeof ref === 'function') ref(mesh);
      else if (ref) ref.current = mesh;
    },
    [ref]
  );

  return (
    <Text
      ref={attachRef}
      {...props}
      material={material ?? SURFACE_MATERIALS[surface]}
      font={font ?? DEFAULT_3D_FONT}
    />
  );
});
