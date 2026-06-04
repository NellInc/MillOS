import React, { useState, useEffect, useCallback } from 'react';
import {
  Factory,
  Brain,
  Activity,
  Users,
  HardHat,
  Shield,
  Settings,
  Eye,
  Maximize,
  Minimize,
  Heart,
  Database,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useUIStore } from '../../../stores/uiStore';
import { useIsMultiplayerActive } from '../../../stores/multiplayerStore';
import { useMobileDetection } from '../../../hooks/useMobileDetection';
import { useMobileControlStore } from '../../../stores/mobileControlStore';

export type DockMode =
  | 'overview'
  | 'ai'
  | 'scada'
  | 'workforce'
  | 'management'
  | 'safety'
  | 'settings'
  | 'multiplayer';

interface DockProps {
  activeMode: DockMode;
  onModeChange: (mode: DockMode) => void;
  onDatalinksOpen?: () => void;
}

export const Dock: React.FC<DockProps> = ({ activeMode, onModeChange, onDatalinksOpen }) => {
  const fpsMode = useUIStore((state) => state.fpsMode);
  const toggleFpsMode = useUIStore((state) => state.toggleFpsMode);
  const isMultiplayerActive = useIsMultiplayerActive();
  const { isMobile } = useMobileDetection();
  const openMobilePanel = useMobileControlStore((state) => state.openMobilePanel);

  // Fullscreen state (mobile only)
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);

  useEffect(() => {
    // Check if fullscreen is actually supported (iOS Safari doesn't support it)
    const docEl = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    };
    const isSupported = !!(docEl.requestFullscreen || docEl.webkitRequestFullscreen);
    setFullscreenSupported(isSupported);

    const handleFullscreenChange = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element };
      setIsFullscreen(!!(document.fullscreenElement || doc.webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        const docEl = document.documentElement as HTMLElement & {
          webkitRequestFullscreen?: () => Promise<void>;
        };
        if (docEl.requestFullscreen) {
          await docEl.requestFullscreen();
        } else if (docEl.webkitRequestFullscreen) {
          await docEl.webkitRequestFullscreen();
        }
      } else {
        const doc = document as Document & {
          webkitExitFullscreen?: () => Promise<void>;
        };
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        }
      }
      if (navigator.vibrate) navigator.vibrate(15);
    } catch {
      // Fullscreen request failed - silently continue
    }
  }, []);

  // On mobile, clicking a dock item opens the mobile panel instead of sidebar
  const handleModeChange = (mode: DockMode) => {
    if (isMobile) {
      openMobilePanel(mode);
    } else {
      onModeChange(mode);
    }
  };

  return (
    <nav
      id="navigation-dock"
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center shadow-2xl z-50 pointer-events-auto ${
        isMobile ? 'px-2 py-2 gap-1 max-w-full overflow-x-auto' : 'px-4 py-3 gap-4'
      }`}
      aria-label="Main Navigation"
      role="navigation"
      style={
        isMobile
          ? {
              paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
              marginLeft: 'env(safe-area-inset-left)',
              marginRight: 'env(safe-area-inset-right)',
            }
          : undefined
      }
    >
      <DockItem
        mode="overview"
        icon={<Factory size={24} />}
        label="Mill Overview"
        isActive={activeMode === 'overview'}
        onClick={() => handleModeChange('overview')}
        isMobile={isMobile}
      />
      <DockItem
        mode="ai"
        icon={<Brain size={24} />}
        label="AI Command"
        isActive={activeMode === 'ai'}
        onClick={() => handleModeChange('ai')}
        isMobile={isMobile}
      />
      <DockItem
        mode="scada"
        icon={<Activity size={24} />}
        label="SCADA System"
        isActive={activeMode === 'scada'}
        onClick={() => handleModeChange('scada')}
        isMobile={isMobile}
      />
      <DockItem
        mode="workforce"
        icon={<HardHat size={24} />}
        label="Workforce"
        isActive={activeMode === 'workforce'}
        onClick={() => handleModeChange('workforce')}
        isMobile={isMobile}
      />
      <DockItem
        mode="management"
        icon={<Heart size={24} />}
        label="BAMS"
        isActive={activeMode === 'management'}
        onClick={() => handleModeChange('management')}
        isMobile={isMobile}
      />
      <DockItem
        mode="multiplayer"
        icon={<Users size={24} />}
        label="Multiplayer"
        isActive={activeMode === 'multiplayer'}
        onClick={() => handleModeChange('multiplayer')}
        badge={isMultiplayerActive}
        isMobile={isMobile}
      />
      <DockItem
        mode="safety"
        icon={<Shield size={24} />}
        label="Safety & Emergency"
        isActive={activeMode === 'safety'}
        onClick={() => handleModeChange('safety')}
        isMobile={isMobile}
      />
      <DockItem
        mode="settings"
        icon={<Settings size={24} />}
        label="Settings"
        isActive={activeMode === 'settings'}
        onClick={() => handleModeChange('settings')}
        isMobile={isMobile}
      />

      {/* Divider */}
      <div className="w-px h-6 bg-white/10" />

      {/* Datalinks Button */}
      {onDatalinksOpen && (
        <button
          onClick={onDatalinksOpen}
          aria-label="Datalinks (L)"
          title="Datalinks (L)"
          className={`relative rounded-xl transition-all ${
            isMobile ? 'p-2 min-w-[44px] min-h-[44px]' : 'p-3'
          } text-slate-400 hover:text-white hover:bg-white/5`}
        >
          <Database size={24} />
        </button>
      )}

      {/* First Person Mode Toggle */}
      <button
        onClick={toggleFpsMode}
        aria-label="First Person Mode (V)"
        aria-pressed={fpsMode}
        title="First Person Mode (V)"
        className={`relative rounded-xl transition-all ${
          isMobile ? 'p-2 min-w-[44px] min-h-[44px]' : 'p-3'
        } ${
          fpsMode
            ? 'bg-violet-500/20 text-violet-400'
            : 'text-slate-400 hover:text-white hover:bg-white/5'
        }`}
      >
        <Eye size={24} />
        {fpsMode && (
          <motion.div
            layoutId="fps-active"
            className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-violet-400 rounded-full"
          />
        )}
      </button>

      {/* Fullscreen Toggle (mobile only, when supported) */}
      {isMobile && fullscreenSupported && (
        <button
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          className={`relative rounded-xl transition-all p-2 min-w-[44px] min-h-[44px] ${
            isFullscreen
              ? 'bg-cyan-500/20 text-cyan-400'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          {isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
        </button>
      )}
    </nav>
  );
};

const DockItem: React.FC<{
  mode: DockMode;
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
  badge?: boolean;
  isMobile?: boolean;
}> = ({ icon, label, isActive, onClick, badge, isMobile }) => {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={isActive}
      aria-current={isActive ? 'page' : undefined}
      className={`relative rounded-xl transition-all ${
        isMobile ? 'p-2 min-w-[44px] min-h-[44px]' : 'p-3'
      } ${isActive ? 'bg-white/10 text-cyan-400' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
    >
      <span aria-hidden="true">{icon}</span>
      {badge && (
        <span
          className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse"
          aria-label="Active session"
        />
      )}
      {isActive && (
        <motion.div
          layoutId="dock-active"
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-cyan-400 rounded-full"
          aria-hidden="true"
        />
      )}
    </button>
  );
};
