import { Text } from '@react-three/drei';
import { forwardRef } from 'react';
import type { ComponentProps, ComponentRef } from 'react';

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

type SceneTextProps = ComponentProps<typeof Text>;

export const SceneText = forwardRef<ComponentRef<typeof Text>, SceneTextProps>(
  function SceneText(props, ref) {
    return <Text ref={ref} {...props} font={props.font ?? DEFAULT_3D_FONT} />;
  }
);
