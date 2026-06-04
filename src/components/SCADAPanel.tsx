/**
 * SCADA Panel Component for MillOS
 *
 * Displays real-time SCADA data including:
 * - Tag browser with current values
 * - Alarm list with acknowledge controls
 * - Mini trend chart for selected tags
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  Download,
  RefreshCw,
  Search,
  Settings,
  Thermometer,
  Zap,
  X,
  TrendingUp,
  Plus,
  Minus,
  Clock,
  Pause,
  Play,
  Wifi,
  WifiOff,
  Server,
  Globe,
  Radio,
  RotateCcw,
  Save,
  Loader2,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useSCADA, useSCADAAlarms, getSCADAService } from '../scada';
import type {
  TagValue,
  TagDefinition,
  TagGroup,
  ConnectionConfig,
  Quality,
  AlarmPriority,
} from '../scada/types';
import { useGraphicsStore } from '../stores/graphicsStore';

interface SCADAPanelProps {
  isOpen: boolean;
  onClose: () => void;
  embedded?: boolean;
}

// Tag group icons
const TAG_GROUP_ICONS: Record<TagGroup, React.ReactNode> = {
  TEMPERATURE: <Thermometer className="w-4 h-4" />,
  PRESSURE: <Activity className="w-4 h-4" />,
  FLOW: <RefreshCw className="w-4 h-4" />,
  LEVEL: <Database className="w-4 h-4" />,
  VIBRATION: <Activity className="w-4 h-4" />,
  SPEED: <Zap className="w-4 h-4" />,
  CURRENT: <Zap className="w-4 h-4" />,
  POWER: <Zap className="w-4 h-4" />,
  HUMIDITY: <Thermometer className="w-4 h-4" />,
  WEIGHT: <Database className="w-4 h-4" />,
  POSITION: <Activity className="w-4 h-4" />,
  SETPOINT: <Settings className="w-4 h-4" />,
  COMMAND: <Settings className="w-4 h-4" />,
  STATUS: <Activity className="w-4 h-4" />,
};

// Quality indicator colors
const QUALITY_COLORS: Record<Quality, string> = {
  GOOD: 'bg-green-500',
  UNCERTAIN: 'bg-yellow-500',
  BAD: 'bg-red-500',
  STALE: 'bg-gray-500',
};

// Alarm priority colors
const ALARM_PRIORITY_COLORS: Record<AlarmPriority, string> = {
  CRITICAL: 'bg-red-600 text-white',
  HIGH: 'bg-orange-500 text-white',
  MEDIUM: 'bg-yellow-500 text-black',
  LOW: 'bg-blue-500 text-white',
};

export const SCADAPanel: React.FC<SCADAPanelProps> = ({ isOpen, onClose, embedded = false }) => {
  const {
    isConnected,
    mode,
    tagCount,
    values,
    tags,
    injectFault,
    clearAllFaults,
    activeFaults,
    exportToCSV,
    exportToJSON,
    getHistory,
  } = useSCADA();

  const { alarms, summary, acknowledge, acknowledgeAll, hasCritical } = useSCADAAlarms();
  const scadaEnabled = useGraphicsStore((state) => state.graphics.enableSCADA);
  const setSCADAEnabled = useGraphicsStore((state) => state.setSCADAEnabled);

  const [activeTab, setActiveTab] = useState<'tags' | 'alarms' | 'trends' | 'faults' | 'settings'>(
    'tags'
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<TagGroup | 'ALL'>('ALL');
  const [expandedMachines, setExpandedMachines] = useState<Set<string>>(new Set());

  // Trend chart state
  const [selectedTrendTags, setSelectedTrendTags] = useState<string[]>([]);
  const [trendDuration, setTrendDuration] = useState<number>(5 * 60 * 1000); // 5 minutes default
  const [trendData, setTrendData] = useState<Array<{ timestamp: number; [key: string]: number }>>(
    []
  );
  const [trendPaused, setTrendPaused] = useState(false);
  const [trendTagSearch, setTrendTagSearch] = useState('');

  // Connection settings state
  // SECURITY NOTE: Default URLs use HTTP/WS for localhost development convenience.
  // In production deployments, these should be configured to use HTTPS/WSS with valid TLS certificates.
  // Localhost connections do not require HTTPS as traffic never leaves the machine,
  // but any remote connections MUST use encrypted protocols to protect SCADA data in transit.
  const [connectionType, setConnectionType] = useState<ConnectionConfig['type']>('simulation');
  const [restUrl, setRestUrl] = useState('http://localhost:3001');
  const [restPollInterval, setRestPollInterval] = useState(1000);
  const [mqttBrokerUrl, setMqttBrokerUrl] = useState('ws://localhost:8883');
  const [mqttTopicPrefix, setMqttTopicPrefix] = useState('scada');
  const [proxyUrl, setProxyUrl] = useState('http://localhost:3001');
  const [isApplyingSettings, setIsApplyingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const handleToggleSCADA = useCallback(() => {
    setSCADAEnabled(!scadaEnabled);
    setSettingsMessage({
      type: 'success',
      text: !scadaEnabled ? 'SCADA runtime enabled' : 'SCADA runtime disabled',
    });
  }, [scadaEnabled, setSCADAEnabled]);

  // Chart line colors
  const TREND_COLORS = ['#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  // Duration options
  const DURATION_OPTIONS = [
    { label: '1m', value: 60 * 1000 },
    { label: '5m', value: 5 * 60 * 1000 },
    { label: '15m', value: 15 * 60 * 1000 },
    { label: '1h', value: 60 * 60 * 1000 },
    { label: '4h', value: 4 * 60 * 60 * 1000 },
    { label: '24h', value: 24 * 60 * 60 * 1000 },
  ];

  // Group tags by machine
  const tagsByMachine = useMemo(() => {
    const grouped = new Map<string, TagDefinition[]>();
    tags.forEach((tag) => {
      if (!grouped.has(tag.machineId)) {
        grouped.set(tag.machineId, []);
      }
      grouped.get(tag.machineId)!.push(tag);
    });
    return grouped;
  }, [tags]);

  // Filter tags based on search and group
  const filteredTags = useMemo(() => {
    return tags.filter((tag) => {
      const matchesSearch =
        searchTerm === '' ||
        tag.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tag.id.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesGroup = selectedGroup === 'ALL' || tag.group === selectedGroup;
      return matchesSearch && matchesGroup;
    });
  }, [tags, searchTerm, selectedGroup]);

  // Toggle machine expansion
  const toggleMachine = (machineId: string) => {
    setExpandedMachines((prev) => {
      const next = new Set(prev);
      if (next.has(machineId)) {
        next.delete(machineId);
      } else {
        next.add(machineId);
      }
      return next;
    });
  };

  // Format value for display
  const formatValue = (value: TagValue, tag: TagDefinition): string => {
    if (value.quality === 'BAD') return '---';
    if (typeof value.value === 'number') {
      return `${value.value.toFixed(1)} ${tag.engUnit}`;
    }
    return String(value.value);
  };

  // Check if value is in alarm
  const isInAlarm = (tag: TagDefinition, value: TagValue): 'hihi' | 'hi' | 'lo' | 'lolo' | null => {
    const numValue = value.value as number;
    if (tag.alarmHiHi !== undefined && numValue >= tag.alarmHiHi) return 'hihi';
    if (tag.alarmHi !== undefined && numValue >= tag.alarmHi) return 'hi';
    if (tag.alarmLoLo !== undefined && numValue <= tag.alarmLoLo) return 'lolo';
    if (tag.alarmLo !== undefined && numValue <= tag.alarmLo) return 'lo';
    return null;
  };

  // Filter tags for trend selection
  const trendFilteredTags = useMemo(() => {
    return tags.filter(
      (tag) =>
        tag.name.toLowerCase().includes(trendTagSearch.toLowerCase()) ||
        tag.id.toLowerCase().includes(trendTagSearch.toLowerCase())
    );
  }, [tags, trendTagSearch]);

  // Sync form state with current SCADA connection config when opening settings
  useEffect(() => {
    if (!isOpen) return;

    try {
      const config = getSCADAService().getConnectionConfig();
      setConnectionType(config.type ?? 'simulation');
      if (config.baseUrl) setRestUrl(config.baseUrl);
      if (config.pollInterval) setRestPollInterval(config.pollInterval);
      if (config.brokerUrl) setMqttBrokerUrl(config.brokerUrl);
      if (config.topicPrefix) setMqttTopicPrefix(config.topicPrefix);
      if (config.proxyUrl) setProxyUrl(config.proxyUrl);
    } catch {
      // Failed to load SCADA connection config - use defaults
    }
  }, [isOpen]);

  // Load trend data when selected tags or duration change
  const loadTrendData = useCallback(async () => {
    if (selectedTrendTags.length === 0) {
      setTrendData([]);
      return;
    }

    try {
      // Fetch history for all selected tags
      const historyPromises = selectedTrendTags.map((tagId) => getHistory(tagId, trendDuration));
      const historyResults = await Promise.all(historyPromises);

      // Merge all history data into a single time series
      const timeMap = new Map<number, { timestamp: number; [key: string]: number }>();

      selectedTrendTags.forEach((tagId, index) => {
        const history = historyResults[index];
        history.forEach((point) => {
          // Round timestamp to nearest second for alignment
          const roundedTs = Math.floor(point.timestamp / 1000) * 1000;
          if (!timeMap.has(roundedTs)) {
            timeMap.set(roundedTs, { timestamp: roundedTs });
          }
          const record = timeMap.get(roundedTs)!;
          record[tagId] = point.value;
        });
      });

      // Convert to sorted array
      const sortedData = Array.from(timeMap.values()).sort((a, b) => a.timestamp - b.timestamp);
      setTrendData(sortedData);
    } catch {
      // Failed to load history - ignore
    }
  }, [selectedTrendTags, trendDuration, getHistory]);

  // Load trend data periodically
  useEffect(() => {
    if (activeTab !== 'trends' || trendPaused) return;

    loadTrendData();
    const interval = setInterval(loadTrendData, 2000); // Update every 2 seconds

    return () => clearInterval(interval);
  }, [activeTab, trendPaused, loadTrendData]);

  // Add/remove tags from trend
  const toggleTrendTag = useCallback((tagId: string) => {
    setSelectedTrendTags((prev) => {
      if (prev.includes(tagId)) {
        return prev.filter((id) => id !== tagId);
      }
      if (prev.length >= 6) {
        return prev; // Max 6 tags
      }
      return [...prev, tagId];
    });
  }, []);

  // Format time for X-axis
  const formatXAxis = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  // Get tag name for legend
  const getTagShortName = (tagId: string) => {
    const tag = tags.find((t) => t.id === tagId);
    return tag?.name || tagId;
  };

  if (!isOpen) return null;

  // Embedded mode: render content without fixed wrapper for use inside ContextSidebar
  if (embedded) {
    // Get first 8 machines with their tags for compact display
    const machineEntries = Array.from(tagsByMachine.entries()).slice(0, 8);

    // If SCADA is disabled, show enable prompt
    if (!scadaEnabled) {
      return (
        <div className="p-4 space-y-4">
          <div className="text-center py-6">
            <Database className="w-12 h-12 mx-auto mb-3 text-slate-500" />
            <h3 className="text-sm font-bold text-white mb-2">SCADA Disabled</h3>
            <p className="text-xs text-slate-300 mb-4">
              SCADA telemetry is disabled on Low/Medium graphics for performance.
            </p>
            <button
              onClick={handleToggleSCADA}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-lg transition-colors"
            >
              Enable SCADA
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="p-3 space-y-3 overflow-y-auto h-full">
        {/* Status Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}
            />
            <span className="text-xs font-bold text-white">SCADA Live</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-cyan-400">{tags.length} tags</span>
            <button
              onClick={handleToggleSCADA}
              className="text-[9px] text-slate-400 hover:text-red-400 transition-colors"
              title="Disable SCADA"
              aria-label="Disable SCADA"
            >
              OFF
            </button>
          </div>
        </div>

        {/* Critical Alarms Banner */}
        {hasCritical && (
          <div className="flex items-center gap-2 p-2 bg-red-500/20 border border-red-500/50 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-xs text-red-400 font-medium">Critical alarms active!</span>
          </div>
        )}

        {/* Compact Tabs */}
        <div className="flex gap-1" role="tablist" aria-label="SCADA embedded tabs">
          {(['tags', 'alarms'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              role="tab"
              aria-selected={activeTab === tab}
              id={`scada-embedded-tab-button-${tab}`}
              aria-controls={`scada-embedded-tab-${tab}`}
              className={`flex-1 px-2 py-1.5 rounded text-[10px] font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50'
              }`}
            >
              {tab === 'tags' ? (
                <>
                  <Database className="w-3 h-3 inline mr-1" aria-hidden="true" />
                  Tags ({tags.length})
                </>
              ) : (
                <>
                  <Bell className="w-3 h-3 inline mr-1" aria-hidden="true" />
                  Alarms ({alarms.length})
                </>
              )}
            </button>
          ))}
        </div>

        {/* Tags View */}
        {activeTab === 'tags' && (
          <div
            className="space-y-2"
            role="tabpanel"
            id="scada-embedded-tab-tags"
            aria-labelledby="scada-embedded-tab-button-tags"
            aria-label="Tags list"
          >
            {machineEntries.length === 0 ? (
              <div className="text-center text-slate-400 py-6">
                <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-xs">No SCADA tags configured</p>
              </div>
            ) : (
              machineEntries.map(([machineId, machineTags]) => (
                <div
                  key={machineId}
                  className="bg-slate-800/40 rounded-lg p-2 border border-slate-700/30"
                >
                  <div className="text-[10px] font-bold text-cyan-400 uppercase mb-1.5 tracking-wide">
                    {machineId}
                  </div>
                  <div className="space-y-1">
                    {machineTags.slice(0, 4).map((tag) => {
                      const value = values.get(tag.id);
                      const displayValue = value ? formatValue(value, tag) : '---';
                      const isStale = value && Date.now() - value.timestamp > 5000;
                      return (
                        <div key={tag.id} className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-300 truncate flex-1 mr-2">{tag.name}</span>
                          <span
                            className={`font-mono tabular-nums ${isStale ? 'text-yellow-400' : 'text-green-400'}`}
                          >
                            {displayValue}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Alarms View */}
        {activeTab === 'alarms' && (
          <div
            className="space-y-2"
            role="tabpanel"
            id="scada-embedded-tab-alarms"
            aria-labelledby="scada-embedded-tab-button-alarms"
            aria-label="Alarms list"
          >
            {alarms.length === 0 ? (
              <div className="text-center text-slate-400 py-6">
                <Check className="w-8 h-8 mx-auto mb-2 text-green-500/50" />
                <p className="text-xs">All systems nominal</p>
                <p className="text-[10px] text-slate-400 mt-1">No active alarms</p>
              </div>
            ) : (
              alarms.slice(0, 10).map((alarm) => (
                <div
                  key={alarm.id}
                  className={`p-2 rounded-lg border ${
                    alarm.state === 'UNACK'
                      ? 'border-red-500/50 bg-red-500/10'
                      : 'border-slate-700/50 bg-slate-800/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${ALARM_PRIORITY_COLORS[alarm.priority] ?? 'bg-slate-600 text-white'}`}
                    >
                      {alarm.priority}
                    </span>
                    {alarm.state === 'UNACK' && (
                      <button
                        onClick={() => acknowledge(alarm.id)}
                        className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 text-[9px] rounded hover:bg-cyan-500/30"
                        aria-label={`Acknowledge ${alarm.tagName} alarm`}
                      >
                        ACK
                      </button>
                    )}
                  </div>
                  <div className="text-xs text-white font-medium">{alarm.tagName}</div>
                  <div className="text-[10px] text-slate-300">
                    Value: <span className="text-red-400">{alarm.value.toFixed(1)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: 400 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 400 }}
        className="fixed right-0 top-0 bottom-0 w-full sm:w-[450px] max-w-full bg-slate-900/95 backdrop-blur-xl border-l border-cyan-500/30 shadow-2xl z-50 flex flex-col"
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-700/50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div
                className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}
              />
              <h2 className="text-lg font-bold text-white">SCADA Monitor</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-slate-700/50 rounded"
              aria-label="Close SCADA panel"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-300">
            <span>
              Mode: <span className="text-cyan-400">{mode}</span>
            </span>
            <span>
              Tags: <span className="text-cyan-400">{tagCount}</span>
            </span>
            {hasCritical && (
              <span className="flex items-center gap-1 text-red-400">
                <AlertTriangle className="w-3 h-3" />
                CRITICAL ALARMS
              </span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div
          className="flex border-b border-slate-700/50"
          role="tablist"
          aria-label="SCADA Panel Tabs"
        >
          <button
            onClick={() => setActiveTab('tags')}
            role="tab"
            aria-selected={activeTab === 'tags'}
            aria-controls="scada-tab-tags"
            id="scada-tab-button-tags"
            tabIndex={activeTab === 'tags' ? 0 : -1}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'tags'
                ? 'text-cyan-400 border-b-2 border-cyan-400'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Database className="w-4 h-4 inline mr-2" aria-hidden="true" />
            Tags
          </button>
          <button
            onClick={() => setActiveTab('alarms')}
            role="tab"
            aria-selected={activeTab === 'alarms'}
            aria-controls="scada-tab-alarms"
            id="scada-tab-button-alarms"
            tabIndex={activeTab === 'alarms' ? 0 : -1}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors relative ${
              activeTab === 'alarms'
                ? 'text-cyan-400 border-b-2 border-cyan-400'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Bell className="w-4 h-4 inline mr-2" aria-hidden="true" />
            Alarms
            {summary.unacknowledged > 0 && (
              <span
                className="absolute top-1 right-2 bg-red-500 text-white text-xs rounded-full px-1.5"
                aria-label={`${summary.unacknowledged} unacknowledged alarms`}
              >
                {summary.unacknowledged}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('trends')}
            role="tab"
            aria-selected={activeTab === 'trends'}
            aria-controls="scada-tab-trends"
            id="scada-tab-button-trends"
            tabIndex={activeTab === 'trends' ? 0 : -1}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'trends'
                ? 'text-cyan-400 border-b-2 border-cyan-400'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <TrendingUp className="w-4 h-4 inline mr-2" aria-hidden="true" />
            Trends
          </button>
          <button
            onClick={() => setActiveTab('faults')}
            role="tab"
            aria-selected={activeTab === 'faults'}
            aria-controls="scada-tab-faults"
            id="scada-tab-button-faults"
            tabIndex={activeTab === 'faults' ? 0 : -1}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'faults'
                ? 'text-cyan-400 border-b-2 border-cyan-400'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <AlertTriangle className="w-4 h-4 inline mr-2" aria-hidden="true" />
            Test
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            role="tab"
            aria-selected={activeTab === 'settings'}
            aria-controls="scada-tab-settings"
            id="scada-tab-button-settings"
            tabIndex={activeTab === 'settings' ? 0 : -1}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'settings'
                ? 'text-cyan-400 border-b-2 border-cyan-400'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Settings className="w-4 h-4 inline mr-2" aria-hidden="true" />
            Config
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {/* Tags Tab */}
          {activeTab === 'tags' && (
            <div
              className="h-full flex flex-col"
              role="tabpanel"
              id="scada-tab-tags"
              aria-labelledby="scada-tab-button-tags"
              tabIndex={0}
            >
              {/* Search and filter */}
              <div className="p-3 space-y-2 border-b border-slate-700/50">
                <div className="relative">
                  <label htmlFor="scada-tag-search" className="sr-only">
                    Search tags
                  </label>
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    id="scada-tag-search"
                    type="text"
                    placeholder="Search tags..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded text-sm text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/30"
                  />
                </div>
                <div
                  className="flex gap-2 overflow-x-auto pb-1"
                  role="group"
                  aria-label="Filter tags by group"
                >
                  <button
                    onClick={() => setSelectedGroup('ALL')}
                    aria-pressed={selectedGroup === 'ALL'}
                    className={`px-2 py-1 rounded text-xs whitespace-nowrap ${
                      selectedGroup === 'ALL'
                        ? 'bg-cyan-500/20 text-cyan-400'
                        : 'bg-slate-800/50 text-slate-300 hover:text-white'
                    }`}
                  >
                    All
                  </button>
                  {(
                    ['TEMPERATURE', 'SPEED', 'VIBRATION', 'LEVEL', 'FLOW', 'PRESSURE'] as TagGroup[]
                  ).map((group) => (
                    <button
                      key={group}
                      onClick={() => setSelectedGroup(group)}
                      aria-pressed={selectedGroup === group}
                      className={`px-2 py-1 rounded text-xs whitespace-nowrap flex items-center gap-1 ${
                        selectedGroup === group
                          ? 'bg-cyan-500/20 text-cyan-400'
                          : 'bg-slate-800/50 text-slate-300 hover:text-white'
                      }`}
                    >
                      {TAG_GROUP_ICONS[group]}
                      {group}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tag list */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {Array.from(tagsByMachine.entries()).map(([machineId, machineTags]) => {
                  const filteredMachineTags = machineTags.filter((t) => filteredTags.includes(t));
                  if (filteredMachineTags.length === 0) return null;

                  const isExpanded = expandedMachines.has(machineId);

                  return (
                    <div key={machineId} className="bg-slate-800/30 rounded-lg overflow-hidden">
                      <button
                        onClick={() => toggleMachine(machineId)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleMachine(machineId);
                          }
                        }}
                        aria-expanded={isExpanded}
                        aria-controls={`machine-tags-${machineId}`}
                        className="w-full px-3 py-2 flex items-center justify-between text-sm font-medium text-slate-200 hover:bg-slate-700/30"
                      >
                        <span className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" aria-hidden="true" />
                          ) : (
                            <ChevronRight className="w-4 h-4" aria-hidden="true" />
                          )}
                          {machineId}
                        </span>
                        <span className="text-xs text-slate-400">
                          {filteredMachineTags.length} tags
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="px-2 pb-2 space-y-1" id={`machine-tags-${machineId}`}>
                          {filteredMachineTags.map((tag) => {
                            const value = values.get(tag.id);
                            const alarmState = value ? isInAlarm(tag, value) : null;

                            return (
                              <div
                                key={tag.id}
                                className={`px-2 py-1.5 rounded text-xs flex items-center justify-between ${
                                  alarmState
                                    ? alarmState === 'hihi' || alarmState === 'lolo'
                                      ? 'bg-red-500/20'
                                      : 'bg-yellow-500/20'
                                    : 'bg-slate-700/30'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  {TAG_GROUP_ICONS[tag.group]}
                                  <div className="truncate">
                                    <div className="text-slate-200 truncate">{tag.name}</div>
                                    <div className="text-slate-400 truncate">{tag.id}</div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 ml-2">
                                  {value && (
                                    <>
                                      <span
                                        className={`${alarmState ? 'text-white font-bold' : 'text-cyan-400'}`}
                                      >
                                        {formatValue(value, tag)}
                                      </span>
                                      <span
                                        className={`w-2 h-2 rounded-full ${QUALITY_COLORS[value.quality] ?? 'bg-slate-600'}`}
                                        aria-label={`Quality: ${value.quality}`}
                                      />
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Export buttons */}
              <div className="p-3 border-t border-slate-700/50 flex gap-2">
                <button
                  onClick={() =>
                    exportToCSV(
                      tags.map((t) => t.id),
                      60 * 60 * 1000
                    )
                  }
                  className="flex-1 px-3 py-2 bg-slate-700/50 hover:bg-slate-600/50 text-white text-sm rounded flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" aria-hidden="true" />
                  Export CSV
                </button>
                <button
                  onClick={() =>
                    exportToJSON(
                      tags.map((t) => t.id),
                      60 * 60 * 1000
                    )
                  }
                  className="flex-1 px-3 py-2 bg-slate-700/50 hover:bg-slate-600/50 text-white text-sm rounded flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" aria-hidden="true" />
                  Export JSON
                </button>
              </div>
            </div>
          )}

          {/* Alarms Tab */}
          {activeTab === 'alarms' && (
            <div
              className="h-full flex flex-col"
              role="tabpanel"
              id="scada-tab-alarms"
              aria-labelledby="scada-tab-button-alarms"
              tabIndex={0}
            >
              {/* Alarm summary */}
              <div className="p-3 border-b border-slate-700/50">
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-slate-800/50 rounded p-2">
                    <div className="text-2xl font-bold text-white">{summary.total}</div>
                    <div className="text-xs text-slate-400">Total</div>
                  </div>
                  <div className="bg-red-500/20 rounded p-2">
                    <div className="text-2xl font-bold text-red-400">{summary.critical}</div>
                    <div className="text-xs text-red-300">Critical</div>
                  </div>
                  <div className="bg-orange-500/20 rounded p-2">
                    <div className="text-2xl font-bold text-orange-400">{summary.high}</div>
                    <div className="text-xs text-orange-300">High</div>
                  </div>
                  <div className="bg-yellow-500/20 rounded p-2">
                    <div className="text-2xl font-bold text-yellow-400">
                      {summary.unacknowledged}
                    </div>
                    <div className="text-xs text-yellow-300">Unack</div>
                  </div>
                </div>
              </div>

              {/* Alarm list */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {alarms.length === 0 ? (
                  <div className="text-center text-slate-400 py-8">
                    <Check className="w-12 h-12 mx-auto mb-2 text-green-500/50" />
                    No active alarms
                  </div>
                ) : (
                  alarms.map((alarm) => (
                    <div
                      key={alarm.id}
                      className={`p-3 rounded-lg border ${
                        alarm.state === 'UNACK' || alarm.state === 'RTN_UNACK'
                          ? 'border-red-500/50 bg-red-500/10'
                          : 'border-slate-700/50 bg-slate-800/30'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-xs ${ALARM_PRIORITY_COLORS[alarm.priority] ?? 'bg-slate-600 text-white'}`}
                          >
                            {alarm.priority}
                          </span>
                          <span className="text-xs text-slate-400">{alarm.type}</span>
                        </div>
                        {(alarm.state === 'UNACK' || alarm.state === 'RTN_UNACK') && (
                          <button
                            onClick={() => acknowledge(alarm.id)}
                            className="px-2 py-1 bg-cyan-500/20 text-cyan-400 text-xs rounded hover:bg-cyan-500/30"
                            aria-label={`Acknowledge ${alarm.tagName} alarm`}
                          >
                            ACK
                          </button>
                        )}
                      </div>
                      <div className="mt-2">
                        <div className="text-sm text-white font-medium">{alarm.tagName}</div>
                        <div className="text-xs text-slate-300 mt-1">
                          Value: {alarm.value.toFixed(2)} | Threshold: {alarm.threshold}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          {new Date(alarm.timestamp).toLocaleTimeString()}
                          {alarm.acknowledgedBy && ` | ACK by ${alarm.acknowledgedBy}`}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Acknowledge all button */}
              {summary.unacknowledged > 0 && (
                <div className="p-3 border-t border-slate-700/50">
                  <button
                    onClick={acknowledgeAll}
                    className="w-full px-4 py-2 bg-cyan-500/20 text-cyan-400 rounded hover:bg-cyan-500/30 text-sm"
                  >
                    Acknowledge All ({summary.unacknowledged})
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Trends Tab */}
          {activeTab === 'trends' && (
            <div
              className="h-full flex flex-col"
              role="tabpanel"
              id="scada-tab-trends"
              aria-labelledby="scada-tab-button-trends"
              tabIndex={0}
            >
              {/* Trend Controls */}
              <div className="p-3 border-b border-slate-700/50 space-y-3">
                {/* Duration selector */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-300" aria-hidden="true" />
                    <span className="text-xs text-slate-300">Duration:</span>
                  </div>
                  <div className="flex gap-1" role="group" aria-label="Select trend duration">
                    {DURATION_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setTrendDuration(opt.value)}
                        aria-pressed={trendDuration === opt.value}
                        className={`px-2 py-1 rounded text-xs ${
                          trendDuration === opt.value
                            ? 'bg-cyan-500/20 text-cyan-400'
                            : 'bg-slate-800/50 text-slate-300 hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pause/Play control */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-300">
                    {selectedTrendTags.length}/6 tags selected
                  </span>
                  <button
                    onClick={() => setTrendPaused(!trendPaused)}
                    aria-pressed={trendPaused}
                    className={`px-3 py-1 rounded text-xs flex items-center gap-1 ${
                      trendPaused
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-amber-500/20 text-amber-400'
                    }`}
                  >
                    {trendPaused ? (
                      <>
                        <Play className="w-3 h-3" aria-hidden="true" />
                        Resume
                      </>
                    ) : (
                      <>
                        <Pause className="w-3 h-3" aria-hidden="true" />
                        Pause
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Chart Area */}
              <div className="flex-1 p-3 min-h-0">
                {selectedTrendTags.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400">
                    <TrendingUp className="w-12 h-12 mb-3 opacity-50" aria-hidden="true" />
                    <p className="text-sm">Select tags below to view trends</p>
                    <p className="text-xs mt-1">Up to 6 tags can be displayed</p>
                  </div>
                ) : (
                  <div className="h-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={trendData}
                        margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis
                          dataKey="timestamp"
                          tickFormatter={formatXAxis}
                          stroke="#94a3b8"
                          tick={{ fontSize: 10 }}
                          interval="preserveStartEnd"
                        />
                        <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} width={50} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#1e293b',
                            border: '1px solid #334155',
                            borderRadius: '8px',
                            fontSize: '12px',
                          }}
                          labelStyle={{ color: '#e2e8f0' }}
                          itemStyle={{ color: '#cbd5e1' }}
                          labelFormatter={(ts) => new Date(ts).toLocaleTimeString()}
                          formatter={(value) => [
                            typeof value === 'number' ? value.toFixed(2) : String(value ?? ''),
                            '',
                          ]}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: '10px' }}
                          formatter={(value) => getTagShortName(value)}
                        />
                        {selectedTrendTags.map((tagId, idx) => (
                          <Line
                            key={tagId}
                            type="monotone"
                            dataKey={tagId}
                            name={tagId}
                            stroke={TREND_COLORS[idx % TREND_COLORS.length]}
                            strokeWidth={2}
                            dot={false}
                            isAnimationActive={false}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Tag Selector */}
              <div className="border-t border-slate-700/50 max-h-[200px] flex flex-col">
                <div className="p-2 border-b border-slate-700/50">
                  <div className="relative">
                    <label htmlFor="trend-tag-search" className="sr-only">
                      Search tags to add to trend
                    </label>
                    <Search
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      id="trend-tag-search"
                      type="text"
                      placeholder="Search tags to add..."
                      value={trendTagSearch}
                      onChange={(e) => setTrendTagSearch(e.target.value)}
                      className="w-full pl-7 pr-2 py-1 bg-slate-800/50 border border-slate-700/50 rounded text-xs text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/30"
                    />
                  </div>
                </div>

                {/* Selected tags */}
                {selectedTrendTags.length > 0 && (
                  <div className="px-2 py-1 flex flex-wrap gap-1 border-b border-slate-700/50">
                    {selectedTrendTags.map((tagId, idx) => (
                      <button
                        key={tagId}
                        onClick={() => toggleTrendTag(tagId)}
                        className="flex items-center gap-1 px-2 py-0.5 rounded text-xs"
                        style={{
                          backgroundColor: `${TREND_COLORS[idx % TREND_COLORS.length]}20`,
                          color: TREND_COLORS[idx % TREND_COLORS.length],
                        }}
                        aria-label={`Remove ${getTagShortName(tagId)} from trend`}
                      >
                        <span className="truncate max-w-[100px]">{getTagShortName(tagId)}</span>
                        <X className="w-3 h-3" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                )}

                {/* Available tags */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {trendFilteredTags.slice(0, 20).map((tag) => {
                    const isSelected = selectedTrendTags.includes(tag.id);
                    const value = values.get(tag.id);
                    return (
                      <button
                        key={tag.id}
                        onClick={() => toggleTrendTag(tag.id)}
                        disabled={!isSelected && selectedTrendTags.length >= 6}
                        aria-pressed={isSelected}
                        className={`w-full px-2 py-1 rounded text-xs flex items-center justify-between ${
                          isSelected
                            ? 'bg-cyan-500/20 text-cyan-400'
                            : selectedTrendTags.length >= 6
                              ? 'bg-slate-800/30 text-slate-500 cursor-not-allowed'
                              : 'bg-slate-800/50 text-slate-200 hover:bg-slate-700/50'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {isSelected ? (
                            <Minus className="w-3 h-3" aria-hidden="true" />
                          ) : (
                            <Plus className="w-3 h-3" aria-hidden="true" />
                          )}
                          <span className="truncate">{tag.name}</span>
                        </div>
                        {value && (
                          <span className="text-slate-400 ml-2">
                            {typeof value.value === 'number'
                              ? `${value.value.toFixed(1)} ${tag.engUnit}`
                              : String(value.value)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Faults Tab (for testing) */}
          {activeTab === 'faults' && (
            <div
              className="h-full flex flex-col p-3"
              role="tabpanel"
              id="scada-tab-faults"
              aria-labelledby="scada-tab-button-faults"
              tabIndex={0}
            >
              <div className="text-sm text-slate-300 mb-4">
                Inject faults into the simulation for testing alarm detection and anomaly handling.
              </div>

              <div className="space-y-3">
                {(['sensor_fail', 'spike', 'drift', 'stuck', 'noise'] as const).map((faultType) => (
                  <button
                    key={faultType}
                    onClick={() =>
                      injectFault({
                        tagId: 'RM101.TT001.PV',
                        faultType,
                        duration: 10000,
                        severity: 1.5,
                      })
                    }
                    className="w-full px-4 py-3 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg text-left"
                  >
                    <div className="text-sm font-medium text-white capitalize">
                      {faultType.replace('_', ' ')}
                    </div>
                    <div className="text-xs text-slate-400">
                      {faultType === 'sensor_fail' && 'Simulate sensor failure (BAD quality)'}
                      {faultType === 'spike' && 'Sudden value spike to near maximum'}
                      {faultType === 'drift' && 'Accelerated value drift over time'}
                      {faultType === 'stuck' && 'Value stops changing (UNCERTAIN quality)'}
                      {faultType === 'noise' && 'Increased measurement noise'}
                    </div>
                  </button>
                ))}
              </div>

              {activeFaults.length > 0 && (
                <div className="mt-4">
                  <div className="text-sm font-medium text-white mb-2">Active Faults</div>
                  <div className="space-y-2">
                    {activeFaults.map((fault, idx) => (
                      <div key={idx} className="px-3 py-2 bg-red-500/20 rounded text-sm">
                        <span className="text-red-400">{fault.faultType}</span>
                        <span className="text-slate-300 ml-2">on {fault.tagId}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={clearAllFaults}
                    className="mt-3 w-full px-4 py-2 bg-slate-700/50 text-slate-200 rounded hover:bg-slate-600/50 text-sm"
                  >
                    Clear All Faults
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div
              className="h-full flex flex-col"
              role="tabpanel"
              id="scada-tab-settings"
              aria-labelledby="scada-tab-button-settings"
              tabIndex={0}
            >
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Current Status */}
                <div className="bg-slate-800/30 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-white">Connection Status</span>
                    <span
                      className={`flex items-center gap-1.5 text-xs ${isConnected ? 'text-green-400' : 'text-red-400'}`}
                    >
                      {isConnected ? (
                        <Wifi className="w-3 h-3" aria-hidden="true" />
                      ) : (
                        <WifiOff className="w-3 h-3" aria-hidden="true" />
                      )}
                      {isConnected ? 'Connected' : 'Disconnected'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-300">
                    Current mode: <span className="text-cyan-400">{mode}</span>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <div className="text-xs text-slate-300">SCADA runtime</div>
                    <button
                      onClick={handleToggleSCADA}
                      aria-pressed={scadaEnabled}
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                        scadaEnabled
                          ? 'bg-green-500/20 text-green-300 border border-green-500/40'
                          : 'bg-slate-700/50 text-slate-200 border border-slate-600/60'
                      }`}
                    >
                      {scadaEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                  {!scadaEnabled && (
                    <div className="mt-2 text-[11px] text-amber-300">
                      Enable to start SCADA simulation and live telemetry.
                    </div>
                  )}
                </div>

                {/* Connection Type Selector */}
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-white">Connection Type</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      {
                        type: 'simulation' as const,
                        icon: Server,
                        label: 'Simulation',
                        desc: 'Local physics simulation',
                      },
                      {
                        type: 'rest' as const,
                        icon: Globe,
                        label: 'REST API',
                        desc: 'HTTP polling',
                      },
                      { type: 'mqtt' as const, icon: Radio, label: 'MQTT', desc: 'MQTT pub/sub' },
                      {
                        type: 'websocket' as const,
                        icon: Wifi,
                        label: 'WebSocket',
                        desc: 'Direct WS connection',
                      },
                      {
                        type: 'opcua' as const,
                        icon: Server,
                        label: 'OPC-UA',
                        desc: 'Via backend proxy',
                      },
                    ].map(({ type, icon: Icon, label, desc }) => (
                      <button
                        key={type}
                        onClick={() => setConnectionType(type)}
                        aria-pressed={connectionType === type}
                        className={`p-3 rounded-lg text-left transition-colors ${
                          connectionType === type
                            ? 'bg-cyan-500/20 border border-cyan-500/50'
                            : 'bg-slate-800/50 border border-slate-700/50 hover:border-slate-600/50'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Icon
                            className={`w-4 h-4 ${connectionType === type ? 'text-cyan-400' : 'text-slate-300'}`}
                            aria-hidden="true"
                          />
                          <span
                            className={`text-sm font-medium ${connectionType === type ? 'text-cyan-400' : 'text-white'}`}
                          >
                            {label}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400">{desc}</div>
                      </button>
                    ))}
                  </div>
                </fieldset>

                {/* REST Configuration */}
                {connectionType === 'rest' && (
                  <fieldset className="space-y-3 bg-slate-800/30 rounded-lg p-3">
                    <legend className="text-sm font-medium text-white flex items-center gap-2">
                      <Globe className="w-4 h-4 text-cyan-400" aria-hidden="true" />
                      REST API Configuration
                    </legend>
                    <div className="space-y-2">
                      <div>
                        <label
                          htmlFor="rest-base-url"
                          className="block text-xs text-slate-300 mb-1"
                        >
                          Base URL
                        </label>
                        <input
                          id="rest-base-url"
                          type="text"
                          value={restUrl}
                          onChange={(e) => setRestUrl(e.target.value)}
                          placeholder="http://localhost:3001"
                          className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded text-sm text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/30"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="rest-poll-interval"
                          className="block text-xs text-slate-300 mb-1"
                        >
                          Poll Interval (ms)
                        </label>
                        <input
                          id="rest-poll-interval"
                          type="number"
                          value={restPollInterval}
                          onChange={(e) =>
                            setRestPollInterval(parseInt(e.target.value, 10) || 1000)
                          }
                          min={100}
                          max={60000}
                          aria-valuemin={100}
                          aria-valuemax={60000}
                          aria-valuenow={restPollInterval}
                          className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded text-sm text-white focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/30"
                        />
                      </div>
                    </div>
                  </fieldset>
                )}

                {/* MQTT Configuration */}
                {connectionType === 'mqtt' && (
                  <fieldset className="space-y-3 bg-slate-800/30 rounded-lg p-3">
                    <legend className="text-sm font-medium text-white flex items-center gap-2">
                      <Radio className="w-4 h-4 text-cyan-400" aria-hidden="true" />
                      MQTT Configuration
                    </legend>
                    <div className="space-y-2">
                      <div>
                        <label
                          htmlFor="mqtt-broker-url"
                          className="block text-xs text-slate-300 mb-1"
                        >
                          Broker URL (WebSocket)
                        </label>
                        <input
                          id="mqtt-broker-url"
                          type="text"
                          value={mqttBrokerUrl}
                          onChange={(e) => setMqttBrokerUrl(e.target.value)}
                          placeholder="ws://localhost:8883"
                          className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded text-sm text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/30"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="mqtt-topic-prefix"
                          className="block text-xs text-slate-300 mb-1"
                        >
                          Topic Prefix
                        </label>
                        <input
                          id="mqtt-topic-prefix"
                          type="text"
                          value={mqttTopicPrefix}
                          onChange={(e) => setMqttTopicPrefix(e.target.value)}
                          placeholder="scada"
                          className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded text-sm text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/30"
                        />
                      </div>
                    </div>
                  </fieldset>
                )}

                {/* WebSocket Configuration */}
                {connectionType === 'websocket' && (
                  <fieldset className="space-y-3 bg-slate-800/30 rounded-lg p-3">
                    <legend className="text-sm font-medium text-white flex items-center gap-2">
                      <Wifi className="w-4 h-4 text-cyan-400" aria-hidden="true" />
                      WebSocket Configuration
                    </legend>
                    <div>
                      <label htmlFor="websocket-url" className="block text-xs text-slate-300 mb-1">
                        WebSocket URL
                      </label>
                      <input
                        id="websocket-url"
                        type="text"
                        value={proxyUrl}
                        onChange={(e) => setProxyUrl(e.target.value)}
                        placeholder="ws://localhost:3001/ws"
                        className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded text-sm text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/30"
                      />
                    </div>
                  </fieldset>
                )}

                {/* OPC-UA / Backend Proxy Configuration */}
                {(connectionType === 'opcua' || connectionType === 'modbus') && (
                  <fieldset className="space-y-3 bg-slate-800/30 rounded-lg p-3">
                    <legend className="text-sm font-medium text-white flex items-center gap-2">
                      <Server className="w-4 h-4 text-cyan-400" aria-hidden="true" />
                      Backend Proxy Configuration
                    </legend>
                    <div className="text-xs text-slate-300 mb-2">
                      OPC-UA and Modbus require the scada-proxy backend service.
                    </div>
                    <div>
                      <label htmlFor="proxy-url" className="block text-xs text-slate-300 mb-1">
                        Proxy URL
                      </label>
                      <input
                        id="proxy-url"
                        type="text"
                        value={proxyUrl}
                        onChange={(e) => setProxyUrl(e.target.value)}
                        placeholder="http://localhost:3001"
                        className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded text-sm text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/30"
                      />
                    </div>
                  </fieldset>
                )}

                {/* Settings Message */}
                {settingsMessage && (
                  <div
                    role="alert"
                    className={`p-3 rounded-lg text-sm ${
                      settingsMessage.type === 'success'
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                        : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}
                  >
                    {settingsMessage.text}
                  </div>
                )}
              </div>

              {/* Apply Button */}
              <div className="p-4 border-t border-slate-700/50 space-y-2">
                <button
                  onClick={async () => {
                    setIsApplyingSettings(true);
                    setSettingsMessage(null);
                    try {
                      const config: ConnectionConfig = {
                        type: connectionType,
                      };

                      if (connectionType === 'rest') {
                        config.baseUrl = restUrl;
                        config.pollInterval = restPollInterval;
                      } else if (connectionType === 'mqtt') {
                        config.brokerUrl = mqttBrokerUrl;
                        config.topicPrefix = mqttTopicPrefix;
                      } else if (connectionType === 'websocket') {
                        config.proxyUrl = proxyUrl;
                      } else if (connectionType === 'opcua' || connectionType === 'modbus') {
                        config.proxyUrl = proxyUrl;
                      }

                      const service = getSCADAService();
                      await service.setConnectionConfig(config);

                      setSettingsMessage({
                        type: 'success',
                        text: `Switched to ${connectionType} mode successfully`,
                      });
                    } catch (err) {
                      setSettingsMessage({
                        type: 'error',
                        text: `Failed to apply settings: ${err instanceof Error ? err.message : String(err)}`,
                      });
                    } finally {
                      setIsApplyingSettings(false);
                    }
                  }}
                  disabled={isApplyingSettings}
                  className="w-full px-4 py-2 bg-cyan-500/20 text-cyan-400 rounded hover:bg-cyan-500/30 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isApplyingSettings ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      Applying...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" aria-hidden="true" />
                      Apply Settings
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    // SECURITY NOTE: Resetting to localhost defaults with HTTP/WS protocols.
                    // These defaults are appropriate for local development only.
                    // Production deployments must use HTTPS/WSS for all remote connections.
                    setConnectionType('simulation');
                    setRestUrl('http://localhost:3001');
                    setRestPollInterval(1000);
                    setMqttBrokerUrl('ws://localhost:8883');
                    setMqttTopicPrefix('scada');
                    setProxyUrl('http://localhost:3001');
                    setSettingsMessage(null);
                  }}
                  className="w-full px-4 py-2 bg-slate-700/50 text-slate-200 rounded hover:bg-slate-600/50 text-sm flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" aria-hidden="true" />
                  Reset to Defaults
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default SCADAPanel;
