import React, { useRef, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { GraphicsQuality } from '../stores/graphicsStore';
import { useGraphicsStore } from '../stores/graphicsStore';
import { ChevronUp, ChevronDown, X } from 'lucide-react';

// FPS store for sharing FPS data between 3D scene and UI
interface FPSStore {
  fps: number;
  avgFps: number;
  minFps: number;
  maxFps: number;
  frameTime: number;
  memoryUsage: number;
  triangles: number;
  drawCalls: number;
  geometries: number;
  textures: number;
  programs: number;
  // Profiling data
  profilingEnabled: boolean;
  profileData: {
    render: number;
    scripts: number;
    physics: number;
    other: number;
  };
  // Quality suggestions
  qualitySuggestionsEnabled: boolean;
  pendingSuggestion: { type: 'lower' | 'raise'; targetQuality: GraphicsQuality } | null;
  suggestionDismissedAt: number;
  lowFpsStartTime: number;
  highFpsStartTime: number;
  setFPS: (fps: number, frameTime: number) => void;
  setRendererStats: (stats: {
    triangles: number;
    drawCalls: number;
    geometries: number;
    textures: number;
    programs: number;
  }) => void;
  setProfilingEnabled: (enabled: boolean) => void;
  setQualitySuggestionsEnabled: (enabled: boolean) => void;
  setPendingSuggestion: (
    suggestion: { type: 'lower' | 'raise'; targetQuality: GraphicsQuality } | null
  ) => void;
  setSuggestionDismissedAt: (time: number) => void;
  setProfileData: (data: {
    render: number;
    scripts: number;
    physics: number;
    other: number;
  }) => void;
  setLowFpsStartTime: (time: number) => void;
  setHighFpsStartTime: (time: number) => void;
}

const fpsHistory: number[] = [];
const HISTORY_SIZE = 60; // 1 second at 60fps

const _useFPSStore = create<FPSStore>((set) => ({
  fps: 60,
  avgFps: 60,
  minFps: 60,
  maxFps: 60,
  frameTime: 16.67,
  memoryUsage: 0,
  triangles: 0,
  drawCalls: 0,
  geometries: 0,
  textures: 0,
  programs: 0,
  profilingEnabled: false,
  profileData: { render: 0, scripts: 0, physics: 0, other: 0 },
  qualitySuggestionsEnabled: true,
  pendingSuggestion: null,
  suggestionDismissedAt: 0,
  lowFpsStartTime: 0,
  highFpsStartTime: 0,
  setFPS: (fps, frameTime) => {
    fpsHistory.push(fps);
    if (fpsHistory.length > HISTORY_SIZE) {
      fpsHistory.shift();
    }
    const avgFps = fpsHistory.reduce((a, b) => a + b, 0) / fpsHistory.length;
    const minFps = Math.min(...fpsHistory);
    const maxFps = Math.max(...fpsHistory);

    // Try to get memory usage if available
    let memoryUsage = 0;
    if ((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory) {
      memoryUsage =
        (performance as unknown as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize /
        (1024 * 1024);
    }

    set({ fps, avgFps, minFps, maxFps, frameTime, memoryUsage });
  },
  setRendererStats: (stats) =>
    set({
      triangles: stats.triangles,
      drawCalls: stats.drawCalls,
      geometries: stats.geometries,
      textures: stats.textures,
      programs: stats.programs,
    }),
  setProfilingEnabled: (enabled) => set({ profilingEnabled: enabled }),
  setQualitySuggestionsEnabled: (enabled) => set({ qualitySuggestionsEnabled: enabled }),
  setPendingSuggestion: (suggestion) => set({ pendingSuggestion: suggestion }),
  setSuggestionDismissedAt: (time) => set({ suggestionDismissedAt: time }),
  setProfileData: (data) => set({ profileData: data }),
  setLowFpsStartTime: (time) => set({ lowFpsStartTime: time }),
  setHighFpsStartTime: (time) => set({ highFpsStartTime: time }),
}));

// Export the store with window exposure for perf testing
export const useFPSStore = _useFPSStore;

// Expose to window for performance testing (dev mode only)
if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  (window as unknown as Record<string, unknown>).useFPSStore = _useFPSStore;
}

// Quality order for suggestions
const QUALITY_ORDER: GraphicsQuality[] = ['ultra', 'high', 'medium', 'low'];

// 3D component to track FPS (must be inside Canvas)
export const FPSTracker: React.FC = () => {
  const frameCount = useRef(0);
  const frameAccumulator = useRef(0);
  const { gl } = useThree();

  const {
    setFPS,
    setRendererStats,
    setProfileData,
    profilingEnabled,
    qualitySuggestionsEnabled,
    pendingSuggestion,
    suggestionDismissedAt,
    lowFpsStartTime,
    highFpsStartTime,
    setPendingSuggestion,
    setLowFpsStartTime,
    setHighFpsStartTime,
  } = useFPSStore(
    useShallow((state) => ({
      setFPS: state.setFPS,
      setRendererStats: state.setRendererStats,
      setProfileData: state.setProfileData,
      profilingEnabled: state.profilingEnabled,
      qualitySuggestionsEnabled: state.qualitySuggestionsEnabled,
      pendingSuggestion: state.pendingSuggestion,
      suggestionDismissedAt: state.suggestionDismissedAt,
      lowFpsStartTime: state.lowFpsStartTime,
      highFpsStartTime: state.highFpsStartTime,
      setPendingSuggestion: state.setPendingSuggestion,
      setLowFpsStartTime: state.setLowFpsStartTime,
      setHighFpsStartTime: state.setHighFpsStartTime,
    }))
  );

  const currentQuality = useGraphicsStore((state) => state.graphics.quality);

  // Track frame times for profiling
  const frameTimes = useRef<number[]>([]);
  const SAMPLE_INTERVAL_DEFAULT = 0.5; // seconds
  const SAMPLE_INTERVAL_PROFILING = 0.1; // seconds

  useFrame((_, delta) => {
    const sampleInterval = profilingEnabled ? SAMPLE_INTERVAL_PROFILING : SAMPLE_INTERVAL_DEFAULT;

    frameCount.current++;
    frameAccumulator.current += delta;

    if (profilingEnabled) {
      frameTimes.current.push(delta * 1000);
      if (frameTimes.current.length > 120) {
        frameTimes.current.shift();
      }
    }

    if (frameAccumulator.current >= sampleInterval) {
      const elapsedSeconds = frameAccumulator.current;
      const fps = Math.round(frameCount.current / elapsedSeconds);
      const frameTime = (elapsedSeconds * 1000) / frameCount.current;
      setFPS(fps, frameTime);

      // Get renderer stats
      const info = gl.info;
      setRendererStats({
        triangles: info.render.triangles,
        drawCalls: info.render.calls,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        programs: info.programs?.length || 0,
      });

      // Profiling data estimation
      if (profilingEnabled && frameTimes.current.length > 0) {
        const avgFrameTime =
          frameTimes.current.reduce((a, b) => a + b, 0) / frameTimes.current.length;
        const renderTime = avgFrameTime * 0.6;
        const scriptsTime = avgFrameTime * 0.25;
        const physicsTime = avgFrameTime * 0.05;
        const otherTime = avgFrameTime * 0.1;

        setProfileData({
          render: renderTime,
          scripts: scriptsTime,
          physics: physicsTime,
          other: otherTime,
        });
        frameTimes.current = [];
      }

      // Quality suggestions (not automatic)
      if (qualitySuggestionsEnabled && !pendingSuggestion) {
        const now = Date.now();
        const timeSinceDismiss = now - suggestionDismissedAt;
        const currentIndex = QUALITY_ORDER.indexOf(currentQuality);

        // Don't suggest if user dismissed recently (30 seconds)
        if (timeSinceDismiss > 30000) {
          // Low FPS - suggest lowering quality after 3 seconds
          if (fps < 25 && currentIndex < QUALITY_ORDER.length - 1) {
            if (lowFpsStartTime === 0) {
              setLowFpsStartTime(now);
            } else if (now - lowFpsStartTime > 3000) {
              setPendingSuggestion({
                type: 'lower',
                targetQuality: QUALITY_ORDER[currentIndex + 1],
              });
              setLowFpsStartTime(0);
            }
          } else {
            setLowFpsStartTime(0);
          }

          // High FPS - suggest raising quality after 10 seconds of stability
          if (fps > 55 && currentIndex > 0) {
            if (highFpsStartTime === 0) {
              setHighFpsStartTime(now);
            } else if (now - highFpsStartTime > 10000) {
              setPendingSuggestion({
                type: 'raise',
                targetQuality: QUALITY_ORDER[currentIndex - 1],
              });
              setHighFpsStartTime(0);
            }
          } else {
            setHighFpsStartTime(0);
          }
        }
      }

      frameCount.current = 0;
      frameAccumulator.current = 0;
    }
  });

  return null;
};

// FPS Graph mini visualization
const FPSGraph: React.FC<{ history: number[] }> = ({ history }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.5)';
    ctx.fillRect(0, 0, width, height);

    // Draw 60fps and 30fps lines
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.3)';
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(0, height - (60 / 120) * height);
    ctx.lineTo(width, height - (60 / 120) * height);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(251, 191, 36, 0.3)';
    ctx.beginPath();
    ctx.moveTo(0, height - (30 / 120) * height);
    ctx.lineTo(width, height - (30 / 120) * height);
    ctx.stroke();

    ctx.setLineDash([]);

    if (history.length > 1) {
      ctx.beginPath();
      ctx.moveTo(0, height - (Math.min(history[0], 120) / 120) * height);

      for (let i = 1; i < history.length; i++) {
        const x = (i / (HISTORY_SIZE - 1)) * width;
        const y = height - (Math.min(history[i], 120) / 120) * height;
        ctx.lineTo(x, y);
      }

      const avgFps = history.reduce((a, b) => a + b, 0) / history.length;
      if (avgFps >= 55) {
        ctx.strokeStyle = '#4ade80';
      } else if (avgFps >= 30) {
        ctx.strokeStyle = '#fbbf24';
      } else {
        ctx.strokeStyle = '#f87171';
      }
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }, [history]);

  return <canvas ref={canvasRef} width={80} height={30} className="rounded" />;
};

// Profile bar component
const ProfileBar: React.FC<{ label: string; value: number; max: number; color: string }> = ({
  label,
  value,
  max,
  color,
}) => {
  const percentage = Math.min((value / max) * 100, 100);
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="text-slate-500 w-12">{label}</span>
      <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-200`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-slate-400 font-mono w-12 text-right">{value.toFixed(1)}ms</span>
    </div>
  );
};

// Quality suggestion popup component
const QualitySuggestion: React.FC = () => {
  const { pendingSuggestion, setPendingSuggestion, setSuggestionDismissedAt, fps } = useFPSStore(
    useShallow((state) => ({
      pendingSuggestion: state.pendingSuggestion,
      setPendingSuggestion: state.setPendingSuggestion,
      setSuggestionDismissedAt: state.setSuggestionDismissedAt,
      fps: state.fps,
    }))
  );
  const setGraphicsQuality = useGraphicsStore((state) => state.setGraphicsQuality);

  if (!pendingSuggestion) return null;

  const handleAccept = () => {
    setGraphicsQuality(pendingSuggestion.targetQuality);
    setPendingSuggestion(null);
  };

  const handleDismiss = () => {
    setPendingSuggestion(null);
    setSuggestionDismissedAt(Date.now());
  };

  const isLowering = pendingSuggestion.type === 'lower';

  return (
    <div
      className={`mt-2 p-2 rounded-lg border ${
        isLowering ? 'bg-red-900/30 border-red-500/50' : 'bg-green-900/30 border-green-500/50'
      }`}
    >
      <div className="flex items-start gap-2">
        <div className={`mt-0.5 ${isLowering ? 'text-red-400' : 'text-green-400'}`}>
          {isLowering ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </div>
        <div className="flex-1">
          <div
            className={`text-[10px] font-bold ${isLowering ? 'text-red-300' : 'text-green-300'}`}
          >
            {isLowering ? 'Performance Issue Detected' : 'Room for Better Quality'}
          </div>
          <div className="text-[9px] text-slate-400 mt-0.5">
            {isLowering
              ? `FPS is ${fps}. Switch to ${pendingSuggestion.targetQuality.toUpperCase()} for better performance?`
              : `FPS is stable at ${fps}. Try ${pendingSuggestion.targetQuality.toUpperCase()} for better visuals?`}
          </div>
          <div className="flex gap-1.5 mt-2">
            <button
              onClick={handleAccept}
              className={`flex-1 py-1 px-2 rounded text-[9px] font-bold transition-all ${
                isLowering
                  ? 'bg-red-600 hover:bg-red-500 text-white'
                  : 'bg-green-600 hover:bg-green-500 text-white'
              }`}
            >
              Switch to {pendingSuggestion.targetQuality.toUpperCase()}
            </button>
            <button
              onClick={handleDismiss}
              className="py-1 px-2 rounded text-[9px] font-bold bg-slate-700 hover:bg-slate-600 text-slate-300 transition-all"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// FPS Display Component (UI overlay)
interface FPSDisplayProps {
  showDetailed?: boolean;
}

export const FPSDisplay: React.FC<FPSDisplayProps> = ({ showDetailed = false }) => {
  const {
    fps,
    avgFps,
    minFps,
    maxFps,
    frameTime,
    triangles,
    drawCalls,
    geometries,
    textures,
    programs,
    memoryUsage,
    profilingEnabled,
    profileData,
    qualitySuggestionsEnabled,
    setProfilingEnabled,
    setQualitySuggestionsEnabled,
  } = useFPSStore();
  const [history, setHistory] = useState<number[]>([]);
  const currentQuality = useGraphicsStore((state) => state.graphics.quality);

  useEffect(() => {
    setHistory((prev) => {
      const newHistory = [...prev, fps];
      if (newHistory.length > HISTORY_SIZE) {
        newHistory.shift();
      }
      return newHistory;
    });
  }, [fps]);

  const fpsColor = fps >= 55 ? 'text-green-400' : fps >= 30 ? 'text-yellow-400' : 'text-red-400';
  const fpsColorBg =
    fps >= 55 ? 'bg-green-500/20' : fps >= 30 ? 'bg-yellow-500/20' : 'bg-red-500/20';

  if (!showDetailed) {
    return (
      <div className={`flex items-center gap-1.5 px-2 py-1 rounded ${fpsColorBg}`}>
        <span className={`text-xs font-mono font-bold ${fpsColor}`}>{fps}</span>
        <span className="text-[9px] text-slate-500">FPS</span>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/80 rounded-lg p-2 border border-slate-700/50 space-y-2">
      {/* Main FPS Display */}
      <div className="flex items-center gap-3">
        <div className={`text-2xl font-mono font-bold ${fpsColor}`}>{fps}</div>
        <div className="flex-1">
          <div className="text-[9px] text-slate-500 uppercase tracking-wider">Frames/sec</div>
          <FPSGraph history={history} />
        </div>
      </div>

      {/* Quality suggestions toggle */}
      <div className="flex items-center justify-between text-[10px] border-t border-slate-700/50 pt-2">
        <span className="text-slate-400">Quality Hints</span>
        <button
          onClick={() => setQualitySuggestionsEnabled(!qualitySuggestionsEnabled)}
          className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all ${
            qualitySuggestionsEnabled
              ? 'bg-cyan-600 text-white'
              : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
          }`}
        >
          {qualitySuggestionsEnabled ? 'ON' : 'OFF'}
        </button>
      </div>
      <div className="text-[9px] text-slate-500">
        Currently: <span className="font-bold uppercase text-slate-300">{currentQuality}</span>
      </div>

      {/* Quality suggestion popup */}
      {qualitySuggestionsEnabled && <QualitySuggestion />}

      {/* Detailed Stats */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] border-t border-slate-700/50 pt-2">
        <div className="flex justify-between">
          <span className="text-slate-500">Avg:</span>
          <span className="text-slate-300 font-mono">{avgFps.toFixed(0)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Frame:</span>
          <span className="text-slate-300 font-mono">{frameTime.toFixed(1)}ms</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Min:</span>
          <span className="text-red-400 font-mono">{minFps}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Max:</span>
          <span className="text-green-400 font-mono">{maxFps}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Tris:</span>
          <span className="text-cyan-400 font-mono">{(triangles / 1000).toFixed(1)}k</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Draws:</span>
          <span className="text-purple-400 font-mono">{drawCalls}</span>
        </div>
      </div>

      {/* Profiling toggle */}
      <div className="flex items-center justify-between text-[10px] border-t border-slate-700/50 pt-2">
        <span className="text-slate-400">Profiler</span>
        <button
          onClick={() => setProfilingEnabled(!profilingEnabled)}
          className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all ${
            profilingEnabled
              ? 'bg-orange-600 text-white'
              : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
          }`}
        >
          {profilingEnabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Profiling breakdown */}
      {profilingEnabled && (
        <div className="space-y-1.5 border-t border-slate-700/50 pt-2">
          <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">
            Frame Breakdown
          </div>
          <ProfileBar
            label="Render"
            value={profileData.render}
            max={frameTime}
            color="bg-cyan-500"
          />
          <ProfileBar
            label="Scripts"
            value={profileData.scripts}
            max={frameTime}
            color="bg-purple-500"
          />
          <ProfileBar
            label="Physics"
            value={profileData.physics}
            max={frameTime}
            color="bg-green-500"
          />
          <ProfileBar
            label="Other"
            value={profileData.other}
            max={frameTime}
            color="bg-orange-500"
          />

          <div className="grid grid-cols-3 gap-1 text-[9px] mt-2 pt-2 border-t border-slate-800">
            <div className="text-center">
              <div className="text-slate-500">Geoms</div>
              <div className="text-cyan-400 font-mono">{geometries}</div>
            </div>
            <div className="text-center">
              <div className="text-slate-500">Textures</div>
              <div className="text-purple-400 font-mono">{textures}</div>
            </div>
            <div className="text-center">
              <div className="text-slate-500">Shaders</div>
              <div className="text-green-400 font-mono">{programs}</div>
            </div>
          </div>

          {memoryUsage > 0 && (
            <div className="flex justify-between text-[10px] pt-1">
              <span className="text-slate-500">Memory:</span>
              <span className="text-orange-400 font-mono">{memoryUsage.toFixed(0)} MB</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
