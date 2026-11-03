import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Move, Eye, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMobileControlStore, type DPadDirection } from '../../stores/mobileControlStore';
import { useUIStore } from '../../stores/uiStore';
import { useT } from '../../i18n';
import { dPadMessages } from './DPad.messages';

/** How long a click (screen reader or keyboard) moves the camera. */
const NUDGE_MS = 400;

interface DPadProps {
  disabled?: boolean;
  idleOpacity?: number;
  activeOpacity?: number;
}

/**
 * Virtual D-Pad for mobile camera controls.
 * - 4 directional buttons for movement/look
 * - Center button toggles between move and look modes (disabled in FPS mode)
 * - Outputs normalized direction vector to mobileControlStore
 * - Fades to lower opacity when idle for less visual clutter
 */
export const DPad: React.FC<DPadProps> = ({
  disabled = false,
  idleOpacity = 0.4,
  activeOpacity = 1,
}) => {
  const t = useT(dPadMessages);
  // Optimize selectors to avoid re-renders
  const dpadMode = useMobileControlStore((state) => state.dpadMode);
  const toggleDpadMode = useMobileControlStore((state) => state.toggleDpadMode);
  const setDpadDirection = useMobileControlStore((state) => state.setDpadDirection);
  const fpsMode = useUIStore((state) => state.fpsMode);
  const activeDirectionsRef = useRef<Set<string>>(new Set());
  const [isActive, setIsActive] = useState(false);

  const updateDirection = useCallback(() => {
    const active = activeDirectionsRef.current;

    // Update active state for opacity
    setIsActive(active.size > 0);

    if (active.size === 0) {
      setDpadDirection(null);
      return;
    }

    let x = 0;
    let y = 0;

    if (active.has('left')) x -= 1;
    if (active.has('right')) x += 1;
    if (active.has('up')) y -= 1;
    if (active.has('down')) y += 1;

    // Normalize diagonal movement
    if (x !== 0 && y !== 0) {
      const magnitude = Math.sqrt(x * x + y * y);
      x /= magnitude;
      y /= magnitude;
    }

    const direction: DPadDirection = { x, y };
    setDpadDirection(direction);
  }, [setDpadDirection]);

  // This is the only writer of dpadDirection. Unmounting mid-press never
  // delivers touchend, so clear it here or the camera keeps drifting.
  useEffect(() => {
    const active = activeDirectionsRef.current;
    return () => {
      active.clear();
      setDpadDirection(null);
    };
  }, [setDpadDirection]);

  // A sheet opening makes the pad inert, and a thumb still on a direction may
  // never deliver its touchend there: release the hold, or the camera drifts.
  const panelOpen = useMobileControlStore((state) => state.mobilePanelVisible);
  useEffect(() => {
    if (!panelOpen && !disabled) return;
    if (activeDirectionsRef.current.size === 0) return;
    activeDirectionsRef.current.clear();
    updateDirection();
  }, [panelOpen, disabled, updateDirection]);

  // Accessible names follow what the buttons actually do in each mode.
  const labels =
    dpadMode === 'move' || fpsMode
      ? {
          up: t('moveForward'),
          down: t('moveBack'),
          left: t('strafeLeft'),
          right: t('strafeRight'),
        }
      : {
          up: t('orbitUp'),
          down: t('orbitDown'),
          left: t('orbitLeft'),
          right: t('orbitRight'),
        };

  // A screen reader's double tap (or a keyboard Enter) arrives as a click with
  // no touch behind it: give that a short nudge. A real touch is followed by a
  // synthesized click, which must not move the camera a second time.
  const lastTouchAtRef = useRef(0);
  // One release per direction: a shared timer let a second nudge cancel the
  // first one's release, and that direction stayed held with nothing pressed.
  const nudgeTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const handleClick = useCallback(
    (direction: string) => () => {
      if (disabled || Date.now() - lastTouchAtRef.current < 1000) return;
      activeDirectionsRef.current.add(direction);
      updateDirection();
      const timers = nudgeTimersRef.current;
      const pending = timers.get(direction);
      if (pending) clearTimeout(pending);
      timers.set(
        direction,
        setTimeout(() => {
          timers.delete(direction);
          activeDirectionsRef.current.delete(direction);
          updateDirection();
        }, NUDGE_MS)
      );
    },
    [disabled, updateDirection]
  );
  useEffect(() => {
    const timers = nudgeTimersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  // touch-action below owns scroll suppression; React's touch listeners are
  // passive, so preventDefault here would only produce a browser warning.
  const handleTouchStart = useCallback(
    (direction: string) => (e: React.TouchEvent) => {
      e.stopPropagation();
      lastTouchAtRef.current = Date.now();
      if (disabled) return;
      activeDirectionsRef.current.add(direction);
      updateDirection();
      // Haptic feedback on button press
      if (navigator.vibrate) {
        navigator.vibrate(10);
      }
    },
    [disabled, updateDirection]
  );

  // The synthesized click follows the touchend, however long the hold was, so
  // the end restarts the window that keeps it from nudging a second time.
  const handleTouchEnd = useCallback(
    (direction: string) => (e: React.TouchEvent) => {
      e.stopPropagation();
      lastTouchAtRef.current = Date.now();
      activeDirectionsRef.current.delete(direction);
      updateDirection();
    },
    [updateDirection]
  );

  const handleTouchCancel = useCallback(
    (direction: string) => (e: React.TouchEvent) => {
      e.stopPropagation();
      lastTouchAtRef.current = Date.now();
      activeDirectionsRef.current.delete(direction);
      updateDirection();
    },
    [updateDirection]
  );

  // Button styling
  const buttonBaseClass = `
    absolute flex items-center justify-center
    w-11 h-11 rounded-xl
    transition-colors duration-100
    touch-none select-none
    backdrop-blur-sm
  `;

  // Prevent long-press context menus and selection on mobile
  const noCalloutStyle = {
    WebkitTouchCallout: 'none',
    WebkitUserSelect: 'none',
    userSelect: 'none',
    touchAction: 'none',
  } as React.CSSProperties;

  const iconClass = 'w-5 h-5 text-slate-200';

  return (
    <div
      className="relative w-36 h-36 pointer-events-auto transition-opacity duration-300"
      style={{
        // Safe area padding for notched devices
        marginBottom: 'max(16px, env(safe-area-inset-bottom))',
        marginLeft: 'max(16px, env(safe-area-inset-left))',
        opacity: isActive ? activeOpacity : idleOpacity,
        ...noCalloutStyle,
      }}
    >
      {/* Background circle */}
      <div className="absolute inset-0 rounded-full bg-slate-900/60 backdrop-blur-md border border-slate-700/50" />

      {/* Up button */}
      <button
        type="button"
        className={`${buttonBaseClass} top-0 left-1/2 -translate-x-1/2 ${
          dpadMode === 'move' ? 'bg-cyan-500/30' : 'bg-violet-500/30'
        } border border-slate-600/50 active:bg-opacity-60`}
        style={noCalloutStyle}
        onTouchStart={handleTouchStart('up')}
        onTouchEnd={handleTouchEnd('up')}
        onTouchCancel={handleTouchCancel('up')}
        onClick={handleClick('up')}
        disabled={disabled}
        aria-label={labels.up}
      >
        <ChevronUp className={iconClass} aria-hidden="true" />
      </button>

      {/* Down button */}
      <button
        type="button"
        className={`${buttonBaseClass} bottom-0 left-1/2 -translate-x-1/2 ${
          dpadMode === 'move' ? 'bg-cyan-500/30' : 'bg-violet-500/30'
        } border border-slate-600/50 active:bg-opacity-60`}
        style={noCalloutStyle}
        onTouchStart={handleTouchStart('down')}
        onTouchEnd={handleTouchEnd('down')}
        onTouchCancel={handleTouchCancel('down')}
        onClick={handleClick('down')}
        disabled={disabled}
        aria-label={labels.down}
      >
        <ChevronDown className={iconClass} aria-hidden="true" />
      </button>

      {/* Left button */}
      <button
        type="button"
        className={`${buttonBaseClass} left-0 top-1/2 -translate-y-1/2 ${
          dpadMode === 'move' ? 'bg-cyan-500/30' : 'bg-violet-500/30'
        } border border-slate-600/50 active:bg-opacity-60`}
        style={noCalloutStyle}
        onTouchStart={handleTouchStart('left')}
        onTouchEnd={handleTouchEnd('left')}
        onTouchCancel={handleTouchCancel('left')}
        onClick={handleClick('left')}
        disabled={disabled}
        aria-label={labels.left}
      >
        <ChevronLeft className={iconClass} aria-hidden="true" />
      </button>

      {/* Right button */}
      <button
        type="button"
        className={`${buttonBaseClass} right-0 top-1/2 -translate-y-1/2 ${
          dpadMode === 'move' ? 'bg-cyan-500/30' : 'bg-violet-500/30'
        } border border-slate-600/50 active:bg-opacity-60`}
        style={noCalloutStyle}
        onTouchStart={handleTouchStart('right')}
        onTouchEnd={handleTouchEnd('right')}
        onTouchCancel={handleTouchCancel('right')}
        onClick={handleClick('right')}
        disabled={disabled}
        aria-label={labels.right}
      >
        <ChevronRight className={iconClass} aria-hidden="true" />
      </button>

      {/* Center mode toggle button - disabled in FPS mode (always move) */}
      <button
        type="button"
        className={`
          absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
          w-12 h-12 rounded-full
          flex items-center justify-center
          transition-all duration-200
          touch-none select-none
          ${
            fpsMode
              ? 'bg-cyan-600/80 border-cyan-400' // Always cyan in FPS mode
              : dpadMode === 'move'
                ? 'bg-cyan-600/80 border-cyan-400'
                : 'bg-violet-600/80 border-violet-400'
          }
          border-2
          ${fpsMode ? 'opacity-60' : 'active:scale-95'}
        `}
        style={noCalloutStyle}
        onClick={() => !fpsMode && toggleDpadMode()}
        onTouchStart={(e) => e.stopPropagation()}
        disabled={disabled || fpsMode}
        aria-label={dpadMode === 'move' ? t('switchToLook') : t('switchToMove')}
      >
        {fpsMode || dpadMode === 'move' ? (
          <Move className="w-5 h-5 text-white" />
        ) : (
          <Eye className="w-5 h-5 text-white" />
        )}
      </button>
    </div>
  );
};
