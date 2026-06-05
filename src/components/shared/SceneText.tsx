import { Text } from '@react-three/drei';
import { forwardRef } from 'react';
import type { ComponentProps, ComponentRef } from 'react';

/**
 * Drop-in replacement for drei's <Text> that defaults to a SELF-HOSTED font.
 *
 * Without an explicit `font`, troika-three-text resolves glyphs via
 * @unicode-font-resolver, which fetches font metadata + .woff files from
 * cdn.jsdelivr.net on first render — the last unconditional third-party
 * connection MillOS makes on load. Defaulting `font` to a local OTF keeps all
 * Latin UI text on-device (GDPR), so no third-party IP transfer occurs.
 *
 * Callers may still pass their own `font` to override. If the local font ever
 * fails to load, troika falls back to the resolver (the app keeps working; only
 * the privacy benefit is lost) — a safe failure mode.
 */
const DEFAULT_3D_FONT = `${import.meta.env.BASE_URL}fonts/Inter-Regular.otf`;

type SceneTextProps = ComponentProps<typeof Text>;

export const SceneText = forwardRef<ComponentRef<typeof Text>, SceneTextProps>(
  function SceneText(props, ref) {
    return <Text ref={ref} {...props} font={props.font ?? DEFAULT_3D_FONT} />;
  }
);
