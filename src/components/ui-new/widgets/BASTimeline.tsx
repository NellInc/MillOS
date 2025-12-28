/**
 * BAS Timeline - Time-lapse Visualization
 *
 * Visualizes the historical evolution of Bilateral Autonomy System metrics:
 * - Stability product (alpha x tau) with threshold line at 0.368
 * - Value (V = Z x S x E x F)
 * - Aggregate flourishing
 * - Worker satisfaction
 *
 * Features:
 * - Timeline chart with multiple metrics
 * - Time range selector (1h, 4h, 12h, 24h, 7d)
 * - Playback controls for historical review
 * - Event markers for significant moments
 * - Mini sparklines showing trends
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  History,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronDown,
  ChevronUp,
  Activity,
  Sparkles,
  Heart,
  Users,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle,
  Zap,
  Flag,
  Info,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import {
  useBASHistoryStore,
  type TimeRange,
  type BASHistoryPoint,
  type BASEvent,
  type BASEventType,
  TIME_RANGE_MS,
} from '../../../stores/basHistoryStore';
import { useStabilityStore } from '../../../stores/stabilityStore';
import { useFlourishingStore } from '../../../stores/flourishingStore';
import { useWorkerMoodStore } from '../../../stores/workerMoodStore';
import { STABILITY_THRESHOLD, WARNING_THRESHOLD } from '../../../types/bas';

// =============================================================================
// CONSTANTS
// =============================================================================

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: '1h', label: '1 Hour' },
  { value: '4h', label: '4 Hours' },
  { value: '12h', label: '12 Hours' },
  { value: '24h', label: '24 Hours' },
  { value: '7d', label: '7 Days' },
];

const METRIC_COLORS = {
  stabilityProduct: {
    line: 'text-orange-400',
    bg: 'bg-orange-500',
    fill: 'bg-orange-500/20',
  },
  value: {
    line: 'text-yellow-400',
    bg: 'bg-yellow-500',
    fill: 'bg-yellow-500/20',
  },
  flourishing: {
    line: 'text-pink-400',
    bg: 'bg-pink-500',
    fill: 'bg-pink-500/20',
  },
  workerSatisfaction: {
    line: 'text-cyan-400',
    bg: 'bg-cyan-500',
    fill: 'bg-cyan-500/20',
  },
};

const EVENT_ICONS: Record<BASEventType, React.ComponentType<{ className?: string }>> = {
  'phase-transition': Zap,
  'axis-change': Activity,
  crisis: AlertTriangle,
  recovery: CheckCircle,
  'vote-completed': Flag,
  milestone: Sparkles,
};

const EVENT_COLORS: Record<BASEventType, string> = {
  'phase-transition': 'text-purple-400',
  'axis-change': 'text-blue-400',
  crisis: 'text-red-400',
  recovery: 'text-green-400',
  'vote-completed': 'text-amber-400',
  milestone: 'text-yellow-400',
};

// =============================================================================
// SPARKLINE COMPONENT
// =============================================================================

interface SparklineProps {
  data: number[];
  color: string;
  height?: number;
  showThreshold?: boolean;
  thresholdValue?: number;
  inverted?: boolean; // For stability product where lower is better
}

const Sparkline: React.FC<SparklineProps> = ({
  data,
  color,
  height = 24,
  showThreshold = false,
  thresholdValue = 0.368,
  inverted = false,
}) => {
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center text-slate-600" style={{ height }}>
        <span className="text-[8px]">No data</span>
      </div>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  // Generate SVG path
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * 100;
    const y = ((max - value) / range) * 100;
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(' L ')}`;

  // Threshold line position
  const thresholdY =
    showThreshold && thresholdValue >= min && thresholdValue <= max
      ? ((max - thresholdValue) / range) * 100
      : null;

  // Trend indicator
  const firstValue = data[0];
  const lastValue = data[data.length - 1];
  const trend = lastValue > firstValue ? 'up' : lastValue < firstValue ? 'down' : 'flat';

  // For inverted metrics (stability), up is bad
  const trendColor = inverted
    ? trend === 'up'
      ? 'text-red-400'
      : trend === 'down'
        ? 'text-green-400'
        : 'text-slate-400'
    : trend === 'up'
      ? 'text-green-400'
      : trend === 'down'
        ? 'text-red-400'
        : 'text-slate-400';

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  return (
    <div className="flex items-center gap-1">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="flex-1" style={{ height }}>
        {/* Threshold line */}
        {thresholdY !== null && (
          <line
            x1="0"
            y1={thresholdY}
            x2="100"
            y2={thresholdY}
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="2,2"
            className="text-red-500/50"
          />
        )}
        {/* Data line */}
        <path
          d={pathD}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={color}
        />
      </svg>
      <TrendIcon className={`w-3 h-3 ${trendColor}`} />
    </div>
  );
};

// =============================================================================
// TIMELINE CHART COMPONENT
// =============================================================================

interface TimelineChartProps {
  data: BASHistoryPoint[];
  events: BASEvent[];
  timeRange: TimeRange;
  selectedMetrics: Set<keyof typeof METRIC_COLORS>;
  onEventClick?: (event: BASEvent) => void;
}

const TimelineChart: React.FC<TimelineChartProps> = ({
  data,
  events,
  timeRange,
  selectedMetrics,
  onEventClick,
}) => {
  const chartHeight = 120;

  if (data.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-slate-500 bg-slate-800/30 rounded"
        style={{ height: chartHeight }}
      >
        <div className="text-center">
          <History className="w-6 h-6 mx-auto mb-1 opacity-50" />
          <span className="text-[10px]">Collecting data...</span>
        </div>
      </div>
    );
  }

  const now = Date.now();
  const rangeMs = TIME_RANGE_MS[timeRange];
  const startTime = now - rangeMs;

  // Normalize data for each metric
  const normalizeValue = (value: number, metric: keyof typeof METRIC_COLORS): number => {
    if (metric === 'stabilityProduct') {
      // Stability: 0 to 0.5 (show beyond threshold)
      return Math.min(1, value / 0.5);
    }
    // Others: 0 to 1
    return Math.min(1, Math.max(0, value));
  };

  // Generate path for a metric
  const generatePath = (metric: keyof typeof METRIC_COLORS): string => {
    const points = data.map((point) => {
      const x = ((point.timestamp - startTime) / rangeMs) * 100;
      const rawValue = point[metric] as number;
      const normalizedValue = normalizeValue(rawValue, metric);
      const y = (1 - normalizedValue) * 100;
      return `${x},${y}`;
    });
    return `M ${points.join(' L ')}`;
  };

  // Calculate event positions
  const eventPositions = events.map((event) => ({
    event,
    x: ((event.timestamp - startTime) / rangeMs) * 100,
  }));

  // Threshold line position for stability
  const thresholdY = (1 - STABILITY_THRESHOLD / 0.5) * 100;
  const warningY = (1 - WARNING_THRESHOLD / 0.5) * 100;

  return (
    <div className="relative" style={{ height: chartHeight }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
        {/* Background grid */}
        <defs>
          <pattern id="grid" width="10" height="25" patternUnits="userSpaceOnUse">
            <path
              d="M 10 0 L 0 0 0 25"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.2"
              className="text-slate-700"
            />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#grid)" />

        {/* Stability threshold lines (only if stability is selected) */}
        {selectedMetrics.has('stabilityProduct') && (
          <>
            {/* Warning threshold */}
            <line
              x1="0"
              y1={warningY}
              x2="100"
              y2={warningY}
              stroke="currentColor"
              strokeWidth="0.5"
              strokeDasharray="2,2"
              className="text-amber-500/40"
            />
            {/* Critical threshold */}
            <line
              x1="0"
              y1={thresholdY}
              x2="100"
              y2={thresholdY}
              stroke="currentColor"
              strokeWidth="0.5"
              strokeDasharray="2,2"
              className="text-red-500/50"
            />
          </>
        )}

        {/* Metric lines */}
        {Array.from(selectedMetrics).map((metric) => (
          <path
            key={metric}
            d={generatePath(metric)}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={METRIC_COLORS[metric].line}
          />
        ))}

        {/* Event markers */}
        {eventPositions
          .filter((ep) => ep.x >= 0 && ep.x <= 100)
          .map((ep) => (
            <g key={ep.event.id}>
              <line
                x1={ep.x}
                y1="0"
                x2={ep.x}
                y2="100"
                stroke="currentColor"
                strokeWidth="0.5"
                strokeDasharray="1,2"
                className={EVENT_COLORS[ep.event.type]}
              />
              <circle
                cx={ep.x}
                cy="5"
                r="2"
                fill="currentColor"
                className={EVENT_COLORS[ep.event.type]}
                style={{ cursor: 'pointer' }}
                onClick={() => onEventClick?.(ep.event)}
              />
            </g>
          ))}
      </svg>

      {/* Time labels */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-between text-[8px] text-slate-500">
        <span>{formatTimeLabel(startTime)}</span>
        <span>Now</span>
      </div>
    </div>
  );
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function formatTimeLabel(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const BASTimeline: React.FC = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>('1h');
  const [isPlaying, setIsPlaying] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<BASEvent | null>(null);
  const [selectedMetrics, setSelectedMetrics] = useState<Set<keyof typeof METRIC_COLORS>>(
    new Set(['stabilityProduct', 'value', 'flourishing', 'workerSatisfaction'])
  );

  // Store data
  const {
    history,
    events,
    getHistoryInRange,
    getEventsInRange,
    getTrendForMetric,
    recordDataPoint,
    playbackTime,
    setPlaybackTime,
  } = useBASHistoryStore(
    useShallow((state) => ({
      history: state.history,
      events: state.events,
      getHistoryInRange: state.getHistoryInRange,
      getEventsInRange: state.getEventsInRange,
      getTrendForMetric: state.getTrendForMetric,
      recordDataPoint: state.recordDataPoint,
      playbackTime: state.playbackTime,
      setPlaybackTime: state.setPlaybackTime,
    }))
  );

  // Current values from stores - use stable selectors to avoid infinite loops
  const stabilityProduct = useStabilityStore((state) => state.wallace.stabilityProduct);
  const phase = useStabilityStore((state) => state.phase);

  // Get flourishing from worker data
  const workerFlourishing = useFlourishingStore(useShallow((state) => state.workerFlourishing));
  const flourishing = useMemo(() => {
    const workers = Object.values(workerFlourishing);
    if (workers.length === 0) return 0;
    // Calculate average overall score across workers
    return workers.reduce((sum, w) => sum + (w?.flourishingScore || 0), 0) / workers.length;
  }, [workerFlourishing]);

  // Get worker moods and calculate satisfaction
  const workerMoods = useWorkerMoodStore(useShallow((state) => state.workerMoods));
  const workerSatisfaction = useMemo(() => {
    const moods = Object.values(workerMoods);
    if (moods.length === 0) return 0;
    return moods.reduce((sum, m) => sum + (m?.satisfaction || 0), 0) / moods.length;
  }, [workerMoods]);

  // Record data point periodically
  useEffect(() => {
    // Calculate value (simplified - would be better to get from ValueDashboard)
    const value =
      Math.max(0, 1 - stabilityProduct / STABILITY_THRESHOLD) *
      (flourishing / 100) *
      (workerSatisfaction / 100);

    const interval = setInterval(() => {
      recordDataPoint({
        stabilityProduct,
        value,
        flourishing: flourishing / 100,
        workerSatisfaction: workerSatisfaction / 100,
        phase,
      });
    }, 5000); // Record every 5 seconds

    return () => clearInterval(interval);
  }, [stabilityProduct, flourishing, workerSatisfaction, phase, recordDataPoint]);

  // Get filtered data
  const filteredHistory = useMemo(
    () => getHistoryInRange(timeRange),
    [getHistoryInRange, timeRange, history]
  );

  const filteredEvents = useMemo(
    () => getEventsInRange(timeRange),
    [getEventsInRange, timeRange, events]
  );

  // Playback controls
  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false);
      setPlaybackTime(null);
    } else if (filteredHistory.length > 0) {
      setIsPlaying(true);
      setPlaybackTime(filteredHistory[0].timestamp);
    }
  }, [isPlaying, filteredHistory, setPlaybackTime]);

  // Playback animation
  useEffect(() => {
    if (!isPlaying || playbackTime === null || filteredHistory.length === 0) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const newTime = playbackTime + 1000; // Advance 1 second per frame
      if (newTime >= now) {
        setIsPlaying(false);
        setPlaybackTime(null);
      } else {
        setPlaybackTime(newTime);
      }
    }, 50); // 20 fps playback

    return () => clearInterval(interval);
  }, [isPlaying, playbackTime, filteredHistory, setPlaybackTime]);

  // Toggle metric visibility
  const toggleMetric = (metric: keyof typeof METRIC_COLORS) => {
    setSelectedMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(metric)) {
        if (next.size > 1) next.delete(metric); // Keep at least one
      } else {
        next.add(metric);
      }
      return next;
    });
  };

  // Extract sparkline data
  const getSparklineData = (metric: keyof typeof METRIC_COLORS): number[] => {
    return filteredHistory.map((p) => p[metric] as number);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-900/90 backdrop-blur-md border border-slate-600/50 rounded-lg shadow-lg w-full"
    >
      {/* Header */}
      <div className="p-3 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-bold text-white">BAS Timeline</span>
          <span className="ml-auto text-[10px] text-slate-400">
            {filteredHistory.length} data points
          </span>
        </div>
        <p className="text-[9px] text-slate-400 mt-1">
          Historical evolution of bilateral autonomy metrics
        </p>
      </div>

      {/* Time Range Selector */}
      <div className="p-3 border-b border-slate-700/30">
        <div className="flex items-center gap-1">
          {TIME_RANGES.map((range) => (
            <button
              key={range.value}
              onClick={() => setTimeRange(range.value)}
              className={`px-2 py-1 text-[9px] rounded transition-colors ${
                timeRange === range.value
                  ? 'bg-cyan-500/20 text-cyan-400 font-medium'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline Chart */}
      <div className="p-3 border-b border-slate-700/30">
        <TimelineChart
          data={filteredHistory}
          events={filteredEvents}
          timeRange={timeRange}
          selectedMetrics={selectedMetrics}
          onEventClick={setSelectedEvent}
        />
      </div>

      {/* Playback Controls */}
      <div className="p-3 border-b border-slate-700/30">
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => {
              if (filteredHistory.length > 0) {
                setPlaybackTime(filteredHistory[0].timestamp);
              }
            }}
            className="p-1.5 rounded bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
            title="Jump to start"
          >
            <SkipBack className="w-3 h-3" />
          </button>
          <button
            onClick={handlePlayPause}
            className={`p-2 rounded transition-colors ${
              isPlaying
                ? 'bg-cyan-500/20 text-cyan-400'
                : 'bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setPlaybackTime(null)}
            className="p-1.5 rounded bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
            title="Jump to live"
          >
            <SkipForward className="w-3 h-3" />
          </button>
          {playbackTime !== null && (
            <span className="text-[9px] text-slate-400 ml-2">{formatTimeLabel(playbackTime)}</span>
          )}
        </div>
      </div>

      {/* Mini Sparklines */}
      <div className="p-3 border-b border-slate-700/30">
        <div className="grid grid-cols-2 gap-2">
          {/* Stability Product */}
          <button
            onClick={() => toggleMetric('stabilityProduct')}
            className={`p-2 rounded transition-colors ${
              selectedMetrics.has('stabilityProduct')
                ? 'bg-orange-500/10 border border-orange-500/30'
                : 'bg-slate-800/30 border border-transparent hover:bg-slate-800/50'
            }`}
          >
            <div className="flex items-center gap-1 mb-1">
              <Activity className="w-3 h-3 text-orange-400" />
              <span className="text-[9px] text-slate-400">Stability (alpha x tau)</span>
            </div>
            <Sparkline
              data={getSparklineData('stabilityProduct')}
              color="text-orange-400"
              showThreshold
              thresholdValue={STABILITY_THRESHOLD}
              inverted
            />
            <div className="flex justify-between mt-1">
              <span className="text-[8px] text-orange-400 font-mono">
                {stabilityProduct.toFixed(3)}
              </span>
              <span className="text-[8px] text-slate-500">/ {STABILITY_THRESHOLD.toFixed(3)}</span>
            </div>
          </button>

          {/* Value */}
          <button
            onClick={() => toggleMetric('value')}
            className={`p-2 rounded transition-colors ${
              selectedMetrics.has('value')
                ? 'bg-yellow-500/10 border border-yellow-500/30'
                : 'bg-slate-800/30 border border-transparent hover:bg-slate-800/50'
            }`}
          >
            <div className="flex items-center gap-1 mb-1">
              <Sparkles className="w-3 h-3 text-yellow-400" />
              <span className="text-[9px] text-slate-400">Value (V)</span>
            </div>
            <Sparkline data={getSparklineData('value')} color="text-yellow-400" />
            <div className="flex justify-between mt-1">
              <span className="text-[8px] text-yellow-400 font-mono">
                {(filteredHistory[filteredHistory.length - 1]?.value || 0).toFixed(3)}
              </span>
              <TrendIndicator trend={getTrendForMetric('value', timeRange)} />
            </div>
          </button>

          {/* Flourishing */}
          <button
            onClick={() => toggleMetric('flourishing')}
            className={`p-2 rounded transition-colors ${
              selectedMetrics.has('flourishing')
                ? 'bg-pink-500/10 border border-pink-500/30'
                : 'bg-slate-800/30 border border-transparent hover:bg-slate-800/50'
            }`}
          >
            <div className="flex items-center gap-1 mb-1">
              <Heart className="w-3 h-3 text-pink-400" />
              <span className="text-[9px] text-slate-400">Flourishing</span>
            </div>
            <Sparkline data={getSparklineData('flourishing')} color="text-pink-400" />
            <div className="flex justify-between mt-1">
              <span className="text-[8px] text-pink-400 font-mono">{flourishing.toFixed(0)}%</span>
              <TrendIndicator trend={getTrendForMetric('flourishing', timeRange)} />
            </div>
          </button>

          {/* Worker Satisfaction */}
          <button
            onClick={() => toggleMetric('workerSatisfaction')}
            className={`p-2 rounded transition-colors ${
              selectedMetrics.has('workerSatisfaction')
                ? 'bg-cyan-500/10 border border-cyan-500/30'
                : 'bg-slate-800/30 border border-transparent hover:bg-slate-800/50'
            }`}
          >
            <div className="flex items-center gap-1 mb-1">
              <Users className="w-3 h-3 text-cyan-400" />
              <span className="text-[9px] text-slate-400">Satisfaction</span>
            </div>
            <Sparkline data={getSparklineData('workerSatisfaction')} color="text-cyan-400" />
            <div className="flex justify-between mt-1">
              <span className="text-[8px] text-cyan-400 font-mono">
                {workerSatisfaction.toFixed(0)}%
              </span>
              <TrendIndicator trend={getTrendForMetric('workerSatisfaction', timeRange)} />
            </div>
          </button>
        </div>
      </div>

      {/* Event List */}
      {filteredEvents.length > 0 && (
        <div className="p-3 border-b border-slate-700/30">
          <div className="flex items-center gap-1 mb-2">
            <Flag className="w-3 h-3 text-amber-400" />
            <span className="text-[10px] font-medium text-white">
              Recent Events ({filteredEvents.length})
            </span>
          </div>
          <div className="space-y-1 max-h-24 overflow-y-auto">
            {filteredEvents
              .slice(-5)
              .reverse()
              .map((event) => {
                const Icon = EVENT_ICONS[event.type];
                return (
                  <button
                    key={event.id}
                    onClick={() => setSelectedEvent(event)}
                    className={`w-full flex items-center gap-2 p-1.5 rounded text-left transition-colors ${
                      selectedEvent?.id === event.id ? 'bg-slate-700/50' : 'hover:bg-slate-800/50'
                    }`}
                  >
                    <Icon className={`w-3 h-3 ${EVENT_COLORS[event.type]}`} />
                    <span className="text-[9px] text-white truncate flex-1">{event.title}</span>
                    <span className="text-[8px] text-slate-500">
                      {formatDuration(Date.now() - event.timestamp)} ago
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {/* Selected Event Detail */}
      <AnimatePresence>
        {selectedEvent && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-slate-700/30"
          >
            <div className="p-3 bg-slate-800/30">
              <div className="flex items-start gap-2">
                {React.createElement(EVENT_ICONS[selectedEvent.type], {
                  className: `w-4 h-4 ${EVENT_COLORS[selectedEvent.type]} mt-0.5`,
                })}
                <div className="flex-1">
                  <div className="text-[10px] font-medium text-white">{selectedEvent.title}</div>
                  <div className="text-[9px] text-slate-400">{selectedEvent.description}</div>
                  <div className="text-[8px] text-slate-500 mt-1">
                    {new Date(selectedEvent.timestamp).toLocaleString()}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="text-slate-500 hover:text-white"
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* About Section */}
      <div className="p-3">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-white transition-colors"
        >
          <span className="flex items-center gap-1">
            <Info className="w-3 h-3" />
            About BAS Timeline
          </span>
          {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        <AnimatePresence>
          {showDetails && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 space-y-2 text-[9px] text-slate-400">
                <p className="leading-relaxed">
                  The BAS Timeline visualizes how bilateral autonomy metrics evolve over time,
                  helping identify patterns and trends.
                </p>

                <div className="bg-slate-800/30 rounded p-2 space-y-1">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-orange-500" />
                    <span className="text-white">Stability Product</span>
                    <span className="text-slate-500 ml-1">(alpha x tau, threshold 0.368)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-yellow-500" />
                    <span className="text-white">Value</span>
                    <span className="text-slate-500 ml-1">(V = Z x S x E x F)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-pink-500" />
                    <span className="text-white">Flourishing</span>
                    <span className="text-slate-500 ml-1">(Aggregate eudaimonia)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-cyan-500" />
                    <span className="text-white">Satisfaction</span>
                    <span className="text-slate-500 ml-1">(Worker mood average)</span>
                  </div>
                </div>

                <div className="bg-cyan-500/10 rounded p-2 border border-cyan-500/20">
                  <div className="font-bold text-cyan-400 mb-1">Tip</div>
                  <p className="text-slate-400">
                    Click metric cards to toggle visibility. Use playback controls to review
                    historical states.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

interface TrendIndicatorProps {
  trend: 'improving' | 'stable' | 'declining';
}

const TrendIndicator: React.FC<TrendIndicatorProps> = ({ trend }) => {
  const Icon = trend === 'improving' ? TrendingUp : trend === 'declining' ? TrendingDown : Minus;
  const color =
    trend === 'improving'
      ? 'text-green-400'
      : trend === 'declining'
        ? 'text-red-400'
        : 'text-slate-400';

  return (
    <div className={`flex items-center gap-0.5 ${color}`}>
      <Icon className="w-2.5 h-2.5" />
      <span className="text-[7px] capitalize">{trend}</span>
    </div>
  );
};

export default BASTimeline;
