import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Factory,
  Brain,
  Activity,
  Shield,
  Settings,
  Eye,
  Maximize,
  Minimize,
  Heart,
  Database,
  MoreHorizontal,
  ChartColumn,
  ScrollText,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useUIStore } from '../../../stores/uiStore';
import { useMobileDetection } from '../../../hooks/useMobileDetection';
import { useMobileControlStore } from '../../../stores/mobileControlStore';
import { translate, useT } from '../../../i18n';
import { dockMessages } from './Dock.messages';

export type DockMode =
  | 'overview'
  | 'production'
  | 'ai'
  | 'scada'
  | 'management'
  | 'safety'
  | 'chronicle'
  | 'settings';

interface DockProps {
  activeMode: DockMode;
  onModeChange: (mode: DockMode, trigger?: HTMLElement) => void;
  onDatalinksOpen?: () => void;
  sidebarVisible?: boolean;
}

export const Dock: React.FC<DockProps> = ({
  activeMode,
  onModeChange,
  onDatalinksOpen,
  sidebarVisible = false,
}) => {
  const t = useT(dockMessages);
  const fpsMode = useUIStore((state) => state.fpsMode);
  const toggleFpsMode = useUIStore((state) => state.toggleFpsMode);
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
    const menuItems = () =>
      Array.from(moreMenuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        // role="menu" promises arrow-key movement; keep that promise.
        const items = menuItems();
        if (items.length === 0) return;
        event.preventDefault();
        const index = items.indexOf(document.activeElement as HTMLElement);
        const step = event.key === 'ArrowDown' ? 1 : items.length - 1;
        items[(Math.max(index, 0) + (index === -1 ? 0 : step)) % items.length]?.focus();
        return;
      }
      if (event.key !== 'Escape') return;
      // Capture phase + stopPropagation: Escape dismisses only the menu, not
      // the sidebar workspace or the selection underneath it.
      event.preventDefault();
      event.stopPropagation();
      setMoreOpen(false);
      requestAnimationFrame(() => moreMenuTriggerRef.current?.focus());
    };
    // Move focus into the menu on open, as a menu role implies.
    requestAnimationFrame(() => menuItems()[0]?.focus());
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape, true);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape, true);
    };
  }, [moreOpen]);

  const toggleFullscreen = useCallback(async () => {
    try {
      // Tracked state covers prefixed WebKit, where fullscreenElement is absent.
      if (!isFullscreen) {
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
  }, [isFullscreen]);

  // AI Partner lives only in the More menu, so its trigger carries the highlight.
  const moreActive =
    fpsMode || activeMode === 'ai' || (isCompactLayout && activeMode === 'chronicle');

  // On mobile, clicking a dock item opens the mobile panel instead of sidebar
  const handleModeChange = (mode: DockMode, trigger?: HTMLElement) => {
    if (isCompactLayout) {
      openMobilePanel(mode);
    } else {
      onModeChange(mode, trigger);
    }
  };

  const handleMoreModeChange = (mode: DockMode) => {
    moreMenuTriggerRef.current?.focus();
    handleModeChange(mode, moreMenuTriggerRef.current ?? undefined);
    setMoreOpen(false);
  };

  // Stay centred in the viewport until the panel requires us to move left.
  // When the remaining workspace is narrower than the dock, centre in that space.
  const workspaceWidth = 'calc(100vw - var(--millos-sidebar-width, min(24rem, 42vw)))';

  return (
    <nav
      id="navigation-dock"
      data-dock-layout={isCompactLayout ? 'compact' : 'wide'}
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#071722]/95 backdrop-blur-xl border border-cyan-100/15 rounded-md flex items-center shadow-2xl z-50 pointer-events-auto ${
        isCompactLayout
          ? 'p-1 gap-0.5 max-w-[calc(100vw-1rem)]'
          : 'p-0 gap-0 w-[min(48rem,calc(100vw-2rem))]'
      }`}
      aria-label={t('navLabel')}
      role="navigation"
      style={
        isCompactLayout
          ? {
              paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
              marginLeft: 'env(safe-area-inset-left)',
              marginRight: 'env(safe-area-inset-right)',
            }
          : sidebarVisible
            ? {
                left: `min(50vw, max(calc(${workspaceWidth} / 2), calc(${workspaceWidth} - 25rem)))`,
                maxWidth: `calc(${workspaceWidth} - 2rem)`,
              }
            : undefined
      }
    >
      <DockItem
        mode="overview"
        icon={<Factory size={24} />}
        label={t('itemOverview')}
        isActive={activeMode === 'overview'}
        onClick={(trigger) => handleModeChange('overview', trigger)}
        isMobile={isCompactLayout}
      />
      <DockItem
        mode="production"
        icon={<ChartColumn size={26} />}
        label={t('itemProduction')}
        isActive={activeMode === 'production'}
        onClick={(trigger) => handleModeChange('production', trigger)}
        isMobile={isCompactLayout}
      />
      {!isCompactLayout && (
        <DockItem
          mode="management"
          icon={<Heart size={24} />}
          label={t('itemManagement')}
          isActive={activeMode === 'management'}
          onClick={(trigger) => handleModeChange('management', trigger)}
          isMobile={isCompactLayout}
        />
      )}
      {!isCompactLayout && (
        <DockItem
          mode="chronicle"
          icon={<ScrollText size={24} />}
          label={t('itemChronicle')}
          isActive={activeMode === 'chronicle'}
          onClick={(trigger) => handleModeChange('chronicle', trigger)}
          isMobile={isCompactLayout}
        />
      )}
      <DockItem
        mode="safety"
        icon={<Shield size={24} />}
        label={t('itemSafety')}
        isActive={activeMode === 'safety'}
        onClick={(trigger) => handleModeChange('safety', trigger)}
        isMobile={isCompactLayout}
      />
      <DockItem
        mode="scada"
        icon={<Activity size={26} />}
        label={t('itemScada')}
        isActive={activeMode === 'scada'}
        onClick={(trigger) => handleModeChange('scada', trigger)}
        isMobile={isCompactLayout}
      />
      <DockItem
        mode="settings"
        icon={<Settings size={24} />}
        label={t('itemSettings')}
        isActive={activeMode === 'settings'}
        onClick={(trigger) => handleModeChange('settings', trigger)}
        isMobile={isCompactLayout}
      />

      <div className="relative shrink-0 border-l border-white/10 pl-1" ref={moreMenuRef}>
        <button
          ref={moreMenuTriggerRef}
          type="button"
          onClick={() => setMoreOpen((open) => !open)}
          aria-label={t('moreLabel')}
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          className={`relative min-h-[44px] min-w-[44px] rounded-xl p-2 text-slate-300 transition-colors hover:bg-white/5 hover:text-white ${
            moreActive ? 'bg-white/10 text-cyan-300' : ''
          }`}
        >
          <MoreHorizontal size={24} aria-hidden="true" />
        </button>
        {moreOpen && (
          <div
            role="menu"
            aria-label={t('moreLabel')}
            className="absolute bottom-full right-0 mb-2 w-60 overflow-hidden rounded-xl border border-white/10 bg-slate-950/98 p-1.5 shadow-2xl"
          >
            <button
              role="menuitem"
              type="button"
              data-dock-mode="ai"
              aria-current={activeMode === 'ai' ? 'page' : undefined}
              onClick={() => handleMoreModeChange('ai')}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-slate-200 transition-colors hover:bg-white/10"
            >
              <Brain size={18} aria-hidden="true" />
              {t('menuAiPartner')}
              <kbd className="ml-auto text-[10px] text-slate-400">I</kbd>
            </button>
            {isCompactLayout && (
              <>
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => handleMoreModeChange('management')}
                  className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-slate-200 transition-colors hover:bg-white/10"
                >
                  <Heart size={18} aria-hidden="true" />
                  {t('menuManagement')}
                </button>
                <button
                  role="menuitem"
                  type="button"
                  data-dock-mode="chronicle"
                  aria-current={activeMode === 'chronicle' ? 'page' : undefined}
                  onClick={() => handleMoreModeChange('chronicle')}
                  className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-slate-200 transition-colors hover:bg-white/10"
                >
                  <ScrollText size={18} aria-hidden="true" />
                  {t('itemChronicle')}
                </button>
              </>
            )}
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
                {t('menuDatalinks')}
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
              {t('menuFirstPerson')}
              <kbd className="ml-auto text-[10px] text-slate-400">V</kbd>
            </button>
          </div>
        )}
      </div>

      {/* Fullscreen Toggle (mobile only, when supported) */}
      {isMobile && fullscreenSupported && (
        <button
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? t('exitFullscreen') : t('enterFullscreen')}
          title={isFullscreen ? t('exitFullscreen') : t('enterFullscreen')}
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

const DOCK_LABEL_KEYS = {
  overview: 'labelOverview',
  production: 'labelProduction',
  ai: 'labelAi',
  scada: 'labelScada',
  management: 'labelManagement',
  safety: 'labelSafety',
  chronicle: 'labelChronicle',
  settings: 'labelSettings',
} as const satisfies Record<DockMode, keyof (typeof dockMessages)['en']>;

// Getters, not constants: each read resolves in the language active now, so
// importers that index DOCK_LABELS during render follow a language change.
export const DOCK_LABELS: Record<DockMode, string> = {
  get overview() {
    return translate(dockMessages, DOCK_LABEL_KEYS.overview);
  },
  get production() {
    return translate(dockMessages, DOCK_LABEL_KEYS.production);
  },
  get ai() {
    return translate(dockMessages, DOCK_LABEL_KEYS.ai);
  },
  get scada() {
    return translate(dockMessages, DOCK_LABEL_KEYS.scada);
  },
  get management() {
    return translate(dockMessages, DOCK_LABEL_KEYS.management);
  },
  get safety() {
    return translate(dockMessages, DOCK_LABEL_KEYS.safety);
  },
  get chronicle() {
    return translate(dockMessages, DOCK_LABEL_KEYS.chronicle);
  },
  get settings() {
    return translate(dockMessages, DOCK_LABEL_KEYS.settings);
  },
};

const DockItem: React.FC<{
  mode: DockMode;
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: (trigger: HTMLButtonElement) => void;
  isMobile?: boolean;
}> = ({ mode, icon, label, isActive, onClick, isMobile }) => {
  const t = useT(dockMessages);
  return (
    <button
      onClick={(event) => onClick(event.currentTarget)}
      data-dock-mode={mode}
      aria-label={label}
      aria-pressed={isActive}
      aria-current={isActive ? 'page' : undefined}
      title={label}
      className={`relative border-r border-white/10 last:border-r-0 transition-colors ${
        isMobile
          ? 'p-2 min-w-[44px] min-h-[44px]'
          : 'flex min-w-0 flex-1 h-[82px] flex-col items-center justify-center gap-2 px-1'
      } ${isActive ? 'bg-cyan-300/10 text-cyan-200' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}
    >
      <span aria-hidden="true">{icon}</span>
      {!isMobile && (
        <span data-dock-label="" className="text-[12px] leading-4 whitespace-nowrap">
          {t(DOCK_LABEL_KEYS[mode])}
        </span>
      )}
      {isActive && (
        <motion.div
          layoutId="dock-active"
          className="absolute bottom-0 left-2 right-2 h-px bg-cyan-300"
          aria-hidden="true"
        />
      )}
    </button>
  );
};
