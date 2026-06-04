import React from 'react';
import { RotateCcw, Factory } from 'lucide-react';

interface RotateDeviceOverlayProps {
  visible: boolean;
}

/**
 * Full-screen overlay prompting users to rotate their device to landscape.
 * Shown on mobile devices in portrait orientation.
 */
export const RotateDeviceOverlay: React.FC<RotateDeviceOverlayProps> = ({ visible }) => {
  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] bg-slate-950 flex flex-col items-center justify-center"
      style={{
        padding:
          'max(32px, env(safe-area-inset-top)) max(32px, env(safe-area-inset-right)) max(32px, env(safe-area-inset-bottom)) max(32px, env(safe-area-inset-left))',
      }}
    >
      {/* Animated rotating phone icon */}
      <div className="relative mb-8">
        <div className="w-24 h-36 border-4 border-cyan-400 rounded-2xl relative animate-pulse motion-reduce:animate-none">
          {/* Phone notch */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-8 h-1 bg-cyan-400 rounded-full" />
          {/* Screen content indicator */}
          <div className="absolute inset-4 top-6 bg-cyan-400/20 rounded-lg" />
        </div>
        {/* Rotation arrow */}
        <div className="absolute -right-8 top-1/2 -translate-y-1/2 text-cyan-400 animate-bounce motion-reduce:animate-none">
          <RotateCcw className="w-8 h-8" style={{ transform: 'rotate(-90deg)' }} />
        </div>
      </div>

      {/* Text prompt */}
      <h2 className="text-2xl font-bold text-white mb-2 text-center">Rotate Your Device</h2>
      <p className="text-slate-400 text-center max-w-xs">
        MillOS works best in landscape mode. Please rotate your device for the full experience.
      </p>

      {/* Mill branding */}
      <div
        className="absolute text-slate-600 text-sm flex items-center gap-2"
        style={{ bottom: 'max(32px, env(safe-area-inset-bottom))' }}
      >
        <Factory className="w-4 h-4" aria-hidden="true" />
        <span>MillOS Digital Twin</span>
      </div>
    </div>
  );
};
