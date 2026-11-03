/**
 * A large touch screen with no hovering pointer (an iPad without a trackpad):
 * too large for the phone layout, so it gets the desktop one, but it has
 * neither keys nor the phone's D-pad. Copy that names keys must not reach it.
 */
export function isKeyboardlessTouch(isTouchDevice: boolean | undefined): boolean {
  return (
    Boolean(isTouchDevice) &&
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: none)').matches
  );
}
