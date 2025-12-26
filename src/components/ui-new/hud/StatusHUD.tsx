import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Wifi,
  ShieldCheck,
  ShieldAlert,
  Bell,
  Activity as ActivityIcon,
  X,
  CheckCircle,
  GripVertical,
} from 'lucide-react';
import { useSafetyStore } from '../../../stores/safetyStore';
import { useFPSStore } from '../../FPSMonitor';
import { useUIStore } from '../../../stores/uiStore';

export const StatusHUD: React.FC = () => {
  const safetyMetrics = useSafetyStore((state) => state.safetyMetrics);
  const fps = useFPSStore((state) => state.fps);
  const alerts = useUIStore((state) => state.alerts);
  const acknowledgeAlert = useUIStore((state) => state.acknowledgeAlert);
  const removeAlert = useUIStore((state) => state.removeAlert);

  const [showNotifications, setShowNotifications] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);

  // Draggable position state - default to top-left
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
      dragStartPos.current = { x: e.clientX, y: e.clientY };
      elementStartPos.current = { x: position.x, y: position.y };
    },
    [position]
  );

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

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showNotifications]);

  // Compute safety score from metrics (100 baseline minus penalties)
  const safetyScore = Math.max(
    0,
    Math.min(
      100,
      100 -
        (safetyMetrics?.nearMisses ?? 0) * 5 -
        (safetyMetrics?.safetyStops ?? 0) * 2 -
        (safetyMetrics?.workerEvasions ?? 0)
    )
  );

  // Determine safety color
  const safetyColor =
    safetyScore > 90 ? 'text-green-400' : safetyScore > 70 ? 'text-yellow-400' : 'text-red-500';
  const SafetyIcon = safetyScore > 80 ? ShieldCheck : ShieldAlert;

  return (
    <header
      ref={hudRef}
      style={{ left: position.x, top: position.y }}
      className={`fixed flex items-center gap-2 pointer-events-auto z-30 ${isDragging ? 'cursor-grabbing' : ''}`}
      role="banner"
      aria-label="System status bar"
    >
      {/* System Status Bar */}
      <div className="flex items-center bg-slate-900/50 backdrop-blur-md border border-white/5 rounded-full overflow-hidden">
        {/* Drag Handle */}
        <div
          onMouseDown={handleMouseDown}
          className="px-2 py-1.5 cursor-grab hover:bg-white/10 transition-colors flex items-center border-r border-white/10"
          role="button"
          aria-label="Drag to reposition status bar"
          tabIndex={0}
        >
          <GripVertical className="w-3 h-3 text-slate-500" aria-hidden="true" />
        </div>

        <div className="flex items-center gap-4 px-3 py-1.5" role="status" aria-live="polite">
          {/* FPS */}
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono" aria-label={`Frame rate: ${fps} FPS`}>
            <ActivityIcon size={12} aria-hidden="true" />
            <span>{fps} FPS</span>
          </div>

          <div className="w-px h-3 bg-white/10" aria-hidden="true"></div>

          {/* Safety Score */}
          <div className={`flex items-center gap-1.5 text-[10px] font-bold ${safetyColor}`} aria-label={`Safety score: ${safetyScore} percent`}>
            <SafetyIcon size={12} aria-hidden="true" />
            <span>{safetyScore}% SAFETY</span>
          </div>

          <div className="w-px h-3 bg-white/10" aria-hidden="true"></div>

          {/* Network / Connectivity */}
          <div className="flex items-center gap-1.5 text-[10px] text-cyan-400" aria-label="Network status: Connected">
            <Wifi size={12} aria-hidden="true" />
            <span>LINKED</span>
          </div>
        </div>
      </div>

      {/* Notifications Bell */}
      <div className="relative" ref={panelRef}>
        <button
          onClick={() => setShowNotifications(!showNotifications)}
          className="w-8 h-8 rounded-full bg-slate-900/50 backdrop-blur border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors pointer-events-auto relative"
          aria-label={`Notifications (${unacknowledgedCount} unread)`}
        >
          <Bell size={14} />
          {unacknowledgedCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 rounded-full border-2 border-slate-950 flex items-center justify-center text-[9px] font-bold text-white">
              {unacknowledgedCount > 9 ? '9+' : unacknowledgedCount}
            </span>
          )}
        </button>

        {/* Notifications Panel */}
        {showNotifications && (
          <div className="absolute top-full right-0 mt-2 w-80 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden pointer-events-auto">
            <div className="p-3 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Notifications</h3>
              <button
                onClick={() => setShowNotifications(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X size={14} />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {alerts.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-sm">No notifications</div>
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
                              : alert.type === 'success'
                                ? 'bg-green-500'
                                : 'bg-blue-500'
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-white truncate">{alert.title}</div>
                        <div className="text-[10px] text-slate-400 truncate">{alert.message}</div>
                        <div className="text-[9px] text-slate-500 mt-1">
                          {new Date(alert.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {!alert.acknowledged && (
                          <button
                            onClick={() => acknowledgeAlert(alert.id)}
                            className="p-1 text-slate-500 hover:text-green-400 transition-colors"
                            title="Acknowledge"
                          >
                            <CheckCircle size={12} />
                          </button>
                        )}
                        <button
                          onClick={() => removeAlert(alert.id)}
                          className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                          title="Dismiss"
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
                  className="w-full text-[10px] text-cyan-400 hover:text-cyan-300 py-1"
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
