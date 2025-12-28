import React, { useCallback, useRef, useState } from 'react';
import { Move, Eye, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMobileControlStore, type DPadDirection } from '../../stores/mobileControlStore';
import { useUIStore } from '../../stores/uiStore';

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

  const handleTouchStart = useCallback(
    (direction: string) => (e: React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
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

  const handleTouchEnd = useCallback(
    (direction: string) => (e: React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      activeDirectionsRef.current.delete(direction);
      updateDirection();
    },
    [updateDirection]
  );

  const handleTouchCancel = useCallback(
    (direction: string) => (e: React.TouchEvent) => {
      e.preventDefault();
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
        disabled={disabled}
        aria-label="Move up"
      >
        <ChevronUp className={iconClass} />
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
        disabled={disabled}
        aria-label="Move down"
      >
        <ChevronDown className={iconClass} />
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
        disabled={disabled}
        aria-label="Move left"
      >
        <ChevronLeft className={iconClass} />
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
        disabled={disabled}
        aria-label="Move right"
      >
        <ChevronRight className={iconClass} />
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
        aria-label={`Switch to ${dpadMode === 'move' ? 'look' : 'move'} mode`}
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
