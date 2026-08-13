import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  MoreHorizontal,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useUIStore } from '../../../stores/uiStore';
import { useIsMultiplayerActive } from '../../../stores/multiplayerStore';
import { useMobileDetection } from '../../../hooks/useMobileDetection';
import { useMobileControlStore } from '../../../stores/mobileControlStore';
import type { DockMode } from './types';

export type { DockMode } from './types';

interface DockProps {
  activeMode: DockMode;
  onModeChange: (mode: DockMode) => void;
  onDatalinksOpen?: () => void;
}

export const Dock: React.FC<DockProps> = ({ activeMode, onModeChange, onDatalinksOpen }) => {
  const fpsMode = useUIStore((state) => state.fpsMode);
  const toggleFpsMode = useUIStore((state) => state.toggleFpsMode);
  const isMultiplayerActive = useIsMultiplayerActive();
  const { isMobile, isCompactLayout } = useMobileDetection();
  const openMobilePanel = useMobileControlStore((state) => state.openMobilePanel);

  // Fullscreen state (mobile only)
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuTriggerRef = useRef<HTMLButtonElement>(null);

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

  useEffect(() => {
    if (!moreOpen) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (!moreMenuRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMoreOpen(false);
      requestAnimationFrame(() => moreMenuTriggerRef.current?.focus());
    };
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [moreOpen]);

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
    if (isCompactLayout) {
      openMobilePanel(mode);
    } else {
      onModeChange(mode);
    }
  };

  const handleMoreModeChange = (mode: DockMode) => {
    moreMenuTriggerRef.current?.focus();
    handleModeChange(mode);
    setMoreOpen(false);
  };

  return (
    <nav
      id="navigation-dock"
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center shadow-2xl z-50 pointer-events-auto ${
        isCompactLayout ? 'px-2 py-2 gap-1 max-w-full' : 'px-3 py-2 gap-2'
      }`}
      aria-label="Main Navigation"
      role="navigation"
      style={
        isCompactLayout
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
        isMobile={isCompactLayout}
      />
      <DockItem
        mode="ai"
        icon={<Brain size={24} />}
        label="AI Partner"
        isActive={activeMode === 'ai'}
        onClick={() => handleModeChange('ai')}
        isMobile={isCompactLayout}
      />
      <DockItem
        mode="scada"
        icon={<Activity size={24} />}
        label="Simulated SCADA"
        isActive={activeMode === 'scada'}
        onClick={() => handleModeChange('scada')}
        isMobile={isCompactLayout}
      />
      {!isCompactLayout && (
        <DockItem
          mode="workforce"
          icon={<HardHat size={24} />}
          label="Workforce"
          isActive={activeMode === 'workforce'}
          onClick={() => handleModeChange('workforce')}
          isMobile={isCompactLayout}
        />
      )}
      {!isCompactLayout && (
        <DockItem
          mode="management"
          icon={<Heart size={24} />}
          label="Bilateral Autonomy System (BAS)"
          isActive={activeMode === 'management'}
          onClick={() => handleModeChange('management')}
          isMobile={isCompactLayout}
        />
      )}
      <DockItem
        mode="safety"
        icon={<Shield size={24} />}
        label="Safety & Emergency"
        isActive={activeMode === 'safety'}
        onClick={() => handleModeChange('safety')}
        isMobile={isCompactLayout}
      />
      <DockItem
        mode="settings"
        icon={<Settings size={24} />}
        label="Settings"
        isActive={activeMode === 'settings'}
        onClick={() => handleModeChange('settings')}
        isMobile={isCompactLayout}
      />

      <div className="relative border-l border-white/10 pl-2" ref={moreMenuRef}>
        <button
          ref={moreMenuTriggerRef}
          type="button"
          onClick={() => setMoreOpen((open) => !open)}
          aria-label="More workspaces and view controls"
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          className={`relative min-h-[44px] min-w-[44px] rounded-xl p-2 text-slate-300 transition-colors hover:bg-white/5 hover:text-white ${
            activeMode === 'multiplayer' || fpsMode ? 'bg-white/10 text-cyan-300' : ''
          }`}
        >
          <MoreHorizontal size={24} aria-hidden="true" />
          {isMultiplayerActive && (
            <span
              className="absolute right-1 top-1 h-2 w-2 rounded-full bg-green-500"
              aria-hidden="true"
            />
          )}
        </button>
        {moreOpen && (
          <div
            role="menu"
            aria-label="More workspaces and view controls"
            className="absolute bottom-full right-0 mb-2 w-60 overflow-hidden rounded-xl border border-white/10 bg-slate-950/98 p-1.5 shadow-2xl"
          >
            {isCompactLayout && (
              <>
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => handleMoreModeChange('workforce')}
                  className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-slate-200 transition-colors hover:bg-white/10"
                >
                  <HardHat size={18} aria-hidden="true" />
                  Workforce
                </button>
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => handleMoreModeChange('management')}
                  className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-slate-200 transition-colors hover:bg-white/10"
                >
                  <Heart size={18} aria-hidden="true" />
                  Bilateral Autonomy System
                </button>
              </>
            )}
            <button
              role="menuitem"
              type="button"
              onClick={() => handleMoreModeChange('multiplayer')}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-slate-200 transition-colors hover:bg-white/10"
            >
              <Users size={18} aria-hidden="true" />
              Multiplayer
              {isMultiplayerActive && (
                <span className="ml-auto text-[10px] font-semibold text-green-300">ACTIVE</span>
              )}
            </button>
            {onDatalinksOpen && (
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  moreMenuTriggerRef.current?.focus();
                  onDatalinksOpen();
                  setMoreOpen(false);
                }}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-slate-200 transition-colors hover:bg-white/10"
              >
                <Database size={18} aria-hidden="true" />
                Datalinks
                <kbd className="ml-auto text-[10px] text-slate-400">L</kbd>
              </button>
            )}
            <button
              role="menuitemcheckbox"
              type="button"
              aria-checked={fpsMode}
              onClick={() => {
                moreMenuTriggerRef.current?.focus();
                toggleFpsMode();
                setMoreOpen(false);
              }}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-slate-200 transition-colors hover:bg-white/10"
            >
              <Eye size={18} aria-hidden="true" />
              First-person view
              <kbd className="ml-auto text-[10px] text-slate-400">V</kbd>
            </button>
          </div>
        )}
      </div>

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
}> = ({ mode, icon, label, isActive, onClick, badge, isMobile }) => {
  return (
    <button
      onClick={onClick}
      data-dock-mode={mode}
      aria-label={label}
      aria-pressed={isActive}
      aria-current={isActive ? 'page' : undefined}
      title={label}
      className={`relative rounded-xl transition-colors ${
        isMobile ? 'p-2 min-w-[44px] min-h-[44px]' : 'p-3'
      } ${isActive ? 'bg-white/10 text-cyan-400' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
    >
      <span aria-hidden="true">{icon}</span>
      {badge && (
        <span
          className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full"
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
