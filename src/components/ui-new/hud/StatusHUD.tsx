import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Database,
  ShieldCheck,
  ShieldAlert,
  Bell,
  Activity as ActivityIcon,
  X,
  CheckCircle,
  GripVertical,
} from 'lucide-react';
import { computeSafetyScore, useSafetyStore } from '../../../stores/safetyStore';
import { useFPSStore } from '../../FPSMonitor';
import { useUIStore } from '../../../stores/uiStore';
import { useProductionStore } from '../../../stores/productionStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useGraphicsStore } from '../../../stores/graphicsStore';
import { useShallow } from 'zustand/react/shallow';

export const StatusHUD: React.FC<{ workspace?: string }> = ({ workspace = 'Overview' }) => {
  const safetyMetrics = useSafetyStore((state) => state.safetyMetrics);
  const fps = useFPSStore((state) => state.fps);
  const alerts = useUIStore((state) => state.alerts);
  const showFPSCounter = useUIStore((state) => state.showFPSCounter);
  const acknowledgeAlert = useUIStore((state) => state.acknowledgeAlert);
  const removeAlert = useUIStore((state) => state.removeAlert);
  const { throughput, dailyBagsProduced, targetBags } = useProductionStore(
    useShallow((state) => ({
      throughput: state.metrics.throughput,
      dailyBagsProduced: state.dailyBagsProduced,
      targetBags: state.productionTarget?.targetBags ?? 0,
    }))
  );
  const { gameTime, currentShift } = useGameSimulationStore(
    useShallow((state) => ({
      gameTime: state.gameTime,
      currentShift: state.currentShift,
    }))
  );
  const scadaEnabled = useGraphicsStore((state) => state.graphics.enableSCADA);

  const [showNotifications, setShowNotifications] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const notificationsCloseRef = useRef<HTMLButtonElement>(null);
  const [notificationPosition, setNotificationPosition] = useState({ left: 16, top: 72 });

  // The default is a full-width header; dragging detaches the same controls.
  const [detached, setDetached] = useState(false);
  const [position, setPosition] = useState({ x: 16, y: 16 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const elementStartPos = useRef({ x: 0, y: 0 });

  // Count unacknowledged alerts
  const unacknowledgedCount = alerts.filter((a) => !a.acknowledged).length;

  // Handle mouse down on grip
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      setDetached(true);
      dragStartPos.current = { x: e.clientX, y: e.clientY };
      elementStartPos.current = { x: position.x, y: position.y };
    },
    [position]
  );

  // Handle keyboard repositioning on grip (WCAG 2.1.1 - keyboard operable)
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Home') {
      e.preventDefault();
      setDetached(false);
      setPosition({ x: 16, y: 16 });
      return;
    }
    const NUDGE = e.shiftKey ? 20 : 4;
    let dx = 0;
    let dy = 0;
    switch (e.key) {
      case 'ArrowLeft':
        dx = -NUDGE;
        break;
      case 'ArrowRight':
        dx = NUDGE;
        break;
      case 'ArrowUp':
        dy = -NUDGE;
        break;
      case 'ArrowDown':
        dy = NUDGE;
        break;
      default:
        return;
    }
    e.preventDefault();
    setDetached(true);
    const rect = hudRef.current?.getBoundingClientRect();
    const maxX = window.innerWidth - (rect?.width ?? 200) - 16;
    const maxY = window.innerHeight - (rect?.height ?? 50) - 16;
    setPosition((prev) => ({
      x: Math.max(16, Math.min(maxX, prev.x + dx)),
      y: Math.max(16, Math.min(maxY, prev.y + dy)),
    }));
  }, []);

  // Re-clamp when the window shrinks, or a HUD dragged to the right edge
  // ends up off-screen with no handle to drag it back.
  useEffect(() => {
    const clampToViewport = () => {
      const rect = hudRef.current?.getBoundingClientRect();
      const maxX = window.innerWidth - (rect?.width ?? 200) - 16;
      const maxY = window.innerHeight - (rect?.height ?? 50) - 16;
      setPosition((prev) => ({
        x: Math.max(16, Math.min(maxX, prev.x)),
        y: Math.max(16, Math.min(maxY, prev.y)),
      }));
    };
    window.addEventListener('resize', clampToViewport);
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(clampToViewport);
    if (hudRef.current) observer?.observe(hudRef.current);
    return () => {
      window.removeEventListener('resize', clampToViewport);
      observer?.disconnect();
    };
  }, []);

  // Handle mouse move while dragging
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartPos.current.x;
      const deltaY = e.clientY - dragStartPos.current.y;
      const newX = elementStartPos.current.x + deltaX;
      const newY = elementStartPos.current.y + deltaY;

      // Constrain to viewport
      const rect = hudRef.current?.getBoundingClientRect();
      const maxX = window.innerWidth - (rect?.width ?? 200) - 16;
      const maxY = window.innerHeight - (rect?.height ?? 50) - 16;
      setPosition({
        x: Math.max(16, Math.min(maxX, newX)),
        y: Math.max(16, Math.min(maxY, newY)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Keep the notification surface in the viewport even after the HUD is moved.
  useEffect(() => {
    if (!showNotifications) return;
    const placeNotifications = () => {
      const rect = bellRef.current?.getBoundingClientRect();
      if (!rect) return;
      setNotificationPosition({
        left: Math.max(16, Math.min(rect.right - 320, window.innerWidth - 336)),
        top: Math.max(16, Math.min(rect.bottom + 8, window.innerHeight - 384)),
      });
    };
    placeNotifications();
    window.addEventListener('resize', placeNotifications);
    return () => window.removeEventListener('resize', placeNotifications);
  }, [showNotifications, position]);

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setShowNotifications(false);
        bellRef.current?.focus();
      }
    };
    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape, true);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape, true);
    };
  }, [showNotifications]);

  // A dialog takes focus when it opens; Escape and Close hand it back to the bell.
  useEffect(() => {
    if (!showNotifications) return;
    const frame = requestAnimationFrame(() => notificationsCloseRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [showNotifications]);

  // Shared formula with OverviewPanel so both surfaces show the same number.
  const safetyScore = computeSafetyScore(safetyMetrics);

  // Determine safety color
  const safetyColor =
    safetyScore > 90 ? 'text-emerald-300' : safetyScore > 70 ? 'text-yellow-400' : 'text-red-500';
  const SafetyIcon = safetyScore > 90 ? ShieldCheck : ShieldAlert;

  return (
    <header
      ref={hudRef}
      style={detached ? { left: position.x, top: position.y } : { left: 0, top: 0 }}
      className={`fixed flex items-center bg-[#06141e]/98 backdrop-blur-md border-b border-cyan-100/15 pointer-events-auto z-30 ${detached ? 'max-w-[calc(100vw-32px)] rounded-md border shadow-lg' : 'w-full min-h-12'} ${isDragging ? 'cursor-grabbing' : ''}`}
      role="banner"
      aria-label="System status bar"
    >
      {/* System Status Bar */}
      <div className="flex min-w-0 flex-1 items-stretch overflow-hidden">
        {/* Drag Handle */}
        <div
          onMouseDown={handleMouseDown}
          onKeyDown={handleKeyDown}
          className="px-1 py-2 min-w-[28px] cursor-grab hover:bg-white/10 transition-colors flex items-center border-r border-white/10"
          role="button"
          aria-label="Reposition status bar. Drag with the mouse, or use the arrow keys to move it; hold Shift for larger steps. Press Home to dock it."
          tabIndex={0}
        >
          <GripVertical className="w-3 h-3 text-slate-500" aria-hidden="true" />
        </div>

        <div
          className="flex shrink-0 items-center border-r border-white/10 px-5"
          aria-label="MillOS"
        >
          <span className="text-xl font-semibold tracking-tight text-slate-100">
            Mill<span className="text-cyan-300">OS</span>
          </span>
        </div>
        <span className="hidden shrink-0 items-center border-r border-white/10 px-6 text-sm text-cyan-200 min-[1200px]:flex">
          {workspace}
        </span>
        <div
          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3"
          role="group"
          aria-label="Live operational metrics"
        >
          {/* Metrics remain readable in the accessibility tree without becoming
              live announcements every time the simulation updates. */}
          {showFPSCounter && (
            <>
              <div
                className="flex shrink-0 items-center gap-1.5 text-[12px] text-slate-300 font-mono"
                aria-label={`${fps} frames per second`}
              >
                <ActivityIcon size={12} aria-hidden="true" />
                <span>{fps} FPS</span>
              </div>
              <div
                className="hidden w-px h-3 bg-white/10 min-[1200px]:block"
                aria-hidden="true"
              ></div>
            </>
          )}

          <div
            className="flex shrink-0 items-center gap-1.5 text-[12px] text-cyan-300 font-mono"
            aria-label={`Final packer throughput ${throughput.toLocaleString()} bags per hour`}
            title="Measured from final-stage packer mass flow"
          >
            <span className="hidden text-slate-400 min-[1400px]:inline">Production</span>
            <span>{throughput.toLocaleString()} bags/h</span>
          </div>

          <div className="hidden w-px h-3 bg-white/10 min-[1200px]:block" aria-hidden="true"></div>

          <div
            className="flex shrink-0 items-center gap-1.5 text-[12px] text-slate-200 font-mono"
            aria-label={`Daily target ${dailyBagsProduced} of ${targetBags} bags`}
          >
            <span>
              Target {dailyBagsProduced.toLocaleString()} / {targetBags.toLocaleString()}
            </span>
          </div>

          <div className="hidden w-px h-3 bg-white/10 min-[1200px]:block" aria-hidden="true"></div>

          <div
            className="order-last ml-auto flex shrink-0 items-center gap-3 text-sm text-slate-200"
            aria-label={`${currentShift} run window, simulation time ${Math.floor(gameTime)
              .toString()
              .padStart(2, '0')}:${Math.floor((gameTime % 1) * 60)
              .toString()
              .padStart(2, '0')}`}
          >
            <span className="hidden uppercase text-xs text-slate-400 min-[1600px]:inline">
              {currentShift}
            </span>
            <time>
              {Math.floor(gameTime).toString().padStart(2, '0')}:
              {Math.floor((gameTime % 1) * 60)
                .toString()
                .padStart(2, '0')}
            </time>
          </div>

          <div className="hidden w-px h-3 bg-white/10 min-[1200px]:block" aria-hidden="true"></div>

          {/* Safety Score */}
          <div
            className={`flex shrink-0 items-center gap-1.5 text-[12px] font-bold ${safetyColor}`}
            aria-label={`Safety score: ${safetyScore} percent`}
          >
            <SafetyIcon size={12} aria-hidden="true" />
            <span>{safetyScore}% safety</span>
          </div>

          <div className="hidden w-px h-3 bg-white/10 min-[1200px]:block" aria-hidden="true"></div>

          {/* SCADA mode. Connection health lives in the SCADA workspace. */}
          <div
            className={`flex shrink-0 items-center gap-1.5 text-[12px] ${
              scadaEnabled ? 'text-cyan-300' : 'text-slate-400'
            }`}
            aria-label={
              scadaEnabled ? 'Simulated SCADA telemetry enabled' : 'SCADA telemetry disabled'
            }
          >
            <Database size={12} aria-hidden="true" />
            <span>{scadaEnabled ? 'SCADA SIMULATED' : 'SCADA DISABLED'}</span>
          </div>
        </div>
      </div>

      {/* Notifications Bell */}
      <div className="relative shrink-0" ref={panelRef}>
        <button
          ref={bellRef}
          onClick={() => setShowNotifications(!showNotifications)}
          className="w-12 h-12 border-l border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors pointer-events-auto relative"
          aria-label={`Notifications (${unacknowledgedCount} unread)`}
          aria-haspopup="dialog"
          aria-expanded={showNotifications}
        >
          <Bell size={14} />
          {unacknowledgedCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[20px] h-[20px] bg-red-700 rounded-full border-2 border-slate-950 flex items-center justify-center text-[12px] font-bold text-white">
              {unacknowledgedCount > 9 ? '9+' : unacknowledgedCount}
            </span>
          )}
        </button>

        {/* Notifications Panel */}
        {showNotifications && (
          <div
            role="dialog"
            aria-label="Notifications"
            style={{
              ...notificationPosition,
              maxHeight: `calc(100dvh - ${notificationPosition.top + 16}px)`,
            }}
            className="fixed flex w-[min(320px,calc(100vw-32px))] flex-col bg-[#071722]/98 backdrop-blur-xl border border-cyan-100/15 rounded-lg shadow-2xl overflow-hidden pointer-events-auto"
          >
            <div className="p-3 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Notifications</h3>
              <button
                ref={notificationsCloseRef}
                type="button"
                onClick={() => {
                  setShowNotifications(false);
                  bellRef.current?.focus();
                }}
                className="text-slate-400 hover:text-white p-2"
                aria-label="Close notifications"
                title="Close notifications"
              >
                <X size={14} />
              </button>
            </div>
            <div className="min-h-0 max-h-80 overflow-y-auto">
              {alerts.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-sm">All clear.</div>
              ) : (
                alerts.slice(0, 10).map((alert) => (
                  <div
                    key={alert.id}
                    className={`p-3 border-b border-white/5 last:border-0 ${
                      !alert.acknowledged ? 'bg-white/5' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div
                        className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                          alert.type === 'critical'
                            ? 'bg-red-500'
                            : alert.type === 'warning'
                              ? 'bg-amber-500'
                              : alert.type === 'safety'
                                ? 'bg-orange-500'
                                : alert.type === 'success'
                                  ? 'bg-green-500'
                                  : 'bg-blue-500'
                        }`}
                        aria-hidden="true"
                      />
                      {/* The dot is colour-only; name the type for screen readers. */}
                      <span className="sr-only">{alert.type}: </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-white truncate">{alert.title}</div>
                        <div className="text-[12px] text-slate-300 break-words">
                          {alert.message}
                        </div>
                        <div className="text-[12px] text-slate-400 mt-1">
                          {new Date(alert.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {!alert.acknowledged && (
                          <button
                            onClick={() => acknowledgeAlert(alert.id)}
                            className="p-2 text-slate-400 hover:text-green-400 transition-colors"
                            title="Acknowledge"
                            aria-label={`Acknowledge ${alert.title}`}
                          >
                            <CheckCircle size={12} />
                          </button>
                        )}
                        <button
                          onClick={() => removeAlert(alert.id)}
                          className="p-2 text-slate-400 hover:text-red-400 transition-colors"
                          title="Dismiss"
                          aria-label={`Dismiss ${alert.title}`}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            {alerts.length > 0 && (
              <div className="p-2 border-t border-white/10">
                <button
                  onClick={() => {
                    alerts.forEach((a) => {
                      if (!a.acknowledged) acknowledgeAlert(a.id);
                    });
                  }}
                  className="w-full text-[12px] text-cyan-400 hover:text-cyan-300 py-1"
                >
                  Mark all as read
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
