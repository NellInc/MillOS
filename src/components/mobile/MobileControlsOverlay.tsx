import React, { useCallback, useEffect } from 'react';
import { Footprints, Zap } from 'lucide-react';
import { DPad } from './DPad';
import { MobilePanel } from './MobilePanel';
import { CameraPresetMenu } from './CameraPresetMenu';
import { useMobileControlStore } from '../../stores/mobileControlStore';
import { useUIStore } from '../../stores/uiStore';

/**
 * Sprint button for mobile FPS mode.
 * Hold to sprint, release to walk.
 */
const SprintButton: React.FC = () => {
  const setIsSprinting = useMobileControlStore((s) => s.setIsSprinting);
  const isSprinting = useMobileControlStore((s) => s.isSprinting);

  // The button unmounts when first-person ends, possibly mid-press, and a
  // touchend never reaches an unmounted node. Without this the next walk
  // session would sprint permanently.
  useEffect(() => () => setIsSprinting(false), [setIsSprinting]);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsSprinting(true);
      // Haptic feedback
      if (navigator.vibrate) {
        navigator.vibrate(20);
      }
    },
    [setIsSprinting]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsSprinting(false);
    },
    [setIsSprinting]
  );

  return (
    <button
      type="button"
      className={`
        w-14 h-14 rounded-full
        flex items-center justify-center
        transition-all duration-100
        touch-none select-none
        pointer-events-auto
        backdrop-blur-sm
        ${
          isSprinting
            ? 'bg-amber-500/80 border-amber-400 scale-95'
            : 'bg-slate-800/60 border-slate-600/50 hover:bg-slate-700/60'
        }
        border-2
      `}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      aria-label="Sprint"
      aria-pressed={isSprinting}
    >
      <Zap className={`w-6 h-6 ${isSprinting ? 'text-white' : 'text-amber-400'}`} />
    </button>
  );
};

/**
 * Switches between walking the floor and the orbit view. Phones have no V key,
 * and without this the orbit presets and touch-orbit were unreachable.
 */
const ViewModeToggle: React.FC<{ fpsMode: boolean }> = ({ fpsMode }) => (
  <button
    type="button"
    className={`
      w-11 h-11 rounded-full
      flex items-center justify-center
      transition-colors duration-100
      select-none
      pointer-events-auto
      backdrop-blur-sm
      ${
        fpsMode
          ? 'bg-cyan-500/80 border-cyan-400'
          : 'bg-slate-800/70 border-slate-600/50 hover:bg-slate-700/70'
      }
      border-2
    `}
    onClick={() => useUIStore.getState().toggleFpsMode()}
    aria-pressed={fpsMode}
    aria-label="Walk mode"
  >
    <Footprints
      className={`w-5 h-5 ${fpsMode ? 'text-white' : 'text-cyan-400'}`}
      aria-hidden="true"
    />
  </button>
);

/**
 * Main overlay container for mobile controls.
 * Contains the D-pad, sprint button (in FPS mode), and mobile panel.
 * Should only be rendered on mobile/touch devices.
 */
interface MobileControlsOverlayProps {
  showTouchControls?: boolean;
}

export const MobileControlsOverlay: React.FC<MobileControlsOverlayProps> = ({
  showTouchControls = true,
}) => {
  const { mobilePanelVisible, mobilePanelContent, closeMobilePanel } = useMobileControlStore();
  const fpsMode = useUIStore((s) => s.fpsMode);

  return (
    <div className="fixed inset-0 pointer-events-none z-30">
      <div
        className="contents"
        aria-hidden={mobilePanelVisible ? true : undefined}
        inert={mobilePanelVisible ? true : undefined}
      >
        {/* View toggle and, in orbit mode, the camera preset menu - top right */}
        {showTouchControls && (
          <div className="absolute top-4 right-4 flex items-start gap-2">
            <div
              style={{
                marginTop: 'max(8px, env(safe-area-inset-top))',
                marginRight: fpsMode ? 'max(8px, env(safe-area-inset-right))' : undefined,
              }}
            >
              <ViewModeToggle fpsMode={fpsMode} />
            </div>
            {!fpsMode && <CameraPresetMenu />}
          </div>
        )}

        {/* D-Pad - bottom left */}
        {showTouchControls && (
          <div className="absolute bottom-24 left-4">
            <DPad />
          </div>
        )}

        {/* Sprint button - bottom right, only in FPS mode */}
        {showTouchControls && fpsMode && (
          <div
            className="absolute bottom-28 right-4"
            style={{
              marginBottom: 'max(16px, env(safe-area-inset-bottom))',
              marginRight: 'max(16px, env(safe-area-inset-right))',
            }}
          >
            <SprintButton />
          </div>
        )}
      </div>

      {/* Mobile Panel */}
      <MobilePanel
        isVisible={mobilePanelVisible}
        content={mobilePanelContent}
        onClose={closeMobilePanel}
      />
    </div>
  );
};

// Export all mobile components for easy importing
export { DPad } from './DPad';
export { MobilePanel } from './MobilePanel';
export { TouchLookHandler } from './TouchLookHandler';
export { MobileFirstPersonController, MobileFPSInstructions } from './MobileFirstPersonController';
export { RotateDeviceOverlay } from './RotateDeviceOverlay';
export { CameraPresetMenu } from './CameraPresetMenu';
