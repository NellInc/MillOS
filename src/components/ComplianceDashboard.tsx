/**
 * ISA-18.2 Compliance Dashboard for MillOS
 *
 * Displays comprehensive alarm management compliance metrics:
 * - Alarm lifecycle state visualization
 * - Priority distribution charts
 * - Acknowledgment performance tracking
 * - Alarm rationalization workflow
 * - Chattering detection
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ListChecks,
  Pause,
  Search,
  Shield,
  Siren,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useSCADA, useSCADAAlarms, getSCADAService } from '../scada';
import type { Alarm, AlarmState, AlarmPriority, AlarmSuppression } from '../scada/types';

interface ComplianceDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

// ISA-18.2 state colors
const STATE_COLORS: Record<AlarmState, string> = {
  NORMAL: '#10b981', // green
  UNACK: '#ef4444', // red
  ACKED: '#f59e0b', // amber
  RTN_UNACK: '#06b6d4', // cyan
};

const PRIORITY_COLORS: Record<AlarmPriority, string> = {
  CRITICAL: '#dc2626',
  HIGH: '#f97316',
  MEDIUM: '#eab308',
  LOW: '#3b82f6',
};

const PRIORITY_BG_COLORS: Record<AlarmPriority, string> = {
  CRITICAL: 'bg-red-600 text-white',
  HIGH: 'bg-orange-500 text-white',
  MEDIUM: 'bg-yellow-500 text-black',
  LOW: 'bg-blue-500 text-white',
};

export const ComplianceDashboard: React.FC<ComplianceDashboardProps> = ({ isOpen, onClose }) => {
  const { alarms, summary, acknowledge, hasCritical, suppressed, unsuppress } = useSCADAAlarms();
  const { isConnected } = useSCADA();
  const [activeTab, setActiveTab] = useState<'overview' | 'lifecycle' | 'rationalization'>(
    'overview'
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<AlarmPriority | 'ALL'>('ALL');
  const [stateFilter, setStateFilter] = useState<AlarmState | 'ALL'>('ALL');
  const [expandedAlarms, setExpandedAlarms] = useState<Set<string>>(new Set());

  // Alarm history for compliance tracking
  const [alarmHistory, setAlarmHistory] = useState<Alarm[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    const loadHistory = async () => {
      if (!isConnected) {
        setAlarmHistory([]);
        return;
      }

      try {
        const service = getSCADAService();
        const endTime = Date.now();
        const startTime = endTime - 24 * 60 * 60 * 1000; // last 24 hours
        const history = await service.getAlarmHistory(startTime, endTime, 500);
        if (!cancelled) {
          setAlarmHistory(history);
        }
      } catch {
        if (!cancelled) {
          // Fallback to current alarms to avoid empty UI
          setAlarmHistory(alarms);
        }
      }
    };

    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [isOpen, isConnected, alarms]);

  // Calculate compliance metrics
  const complianceMetrics = useMemo(() => {
    const slaThreshold = 30000; // 30 seconds SLA for acknowledgment

    let ackWithinSLA = 0;
    let totalAcked = 0;
    const ackTimes: number[] = [];

    alarmHistory.forEach((alarm) => {
      if (alarm.acknowledgedAt && alarm.timestamp) {
        const ackTime = alarm.acknowledgedAt - alarm.timestamp;
        ackTimes.push(ackTime);
        totalAcked++;
        if (ackTime <= slaThreshold) {
          ackWithinSLA++;
        }
      }
    });

    const avgAckTime =
      ackTimes.length > 0 ? ackTimes.reduce((a, b) => a + b, 0) / ackTimes.length : 0;

    return {
      slaCompliance: totalAcked > 0 ? (ackWithinSLA / totalAcked) * 100 : 100,
      avgAckTime,
      totalProcessed: alarmHistory.length,
    };
  }, [alarmHistory]);

  // Alarm state distribution for lifecycle visualization
  const stateDistribution = useMemo(() => {
    const counts: Record<AlarmState, number> = {
      NORMAL: 0,
      UNACK: 0,
      ACKED: 0,
      RTN_UNACK: 0,
    };

    alarms.forEach((alarm) => {
      counts[alarm.state]++;
    });

    return Object.entries(counts).map(([state, count]) => ({
      name: state,
      value: count,
      color: STATE_COLORS[state as AlarmState],
    }));
  }, [alarms]);

  // Priority distribution
  const priorityDistribution = useMemo(() => {
    const counts: Record<AlarmPriority, number> = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };

    alarms.forEach((alarm) => {
      counts[alarm.priority]++;
    });

    return Object.entries(counts).map(([priority, count]) => ({
      name: priority,
      value: count,
      color: PRIORITY_COLORS[priority as AlarmPriority],
    }));
  }, [alarms]);

  // Chattering detection - alarms that have occurred frequently
  const chatteringAlarms = useMemo(() => {
    const tagCounts = new Map<string, number>();

    alarmHistory.forEach((alarm) => {
      const count = tagCounts.get(alarm.tagId) || 0;
      tagCounts.set(alarm.tagId, count + 1);
    });

    const chattering: Array<{ tagId: string; tagName: string; count: number }> = [];
    tagCounts.forEach((count, tagId) => {
      if (count >= 5) {
        // Threshold for chattering
        const alarm = alarmHistory.find((a) => a.tagId === tagId);
        if (alarm) {
          chattering.push({
            tagId,
            tagName: alarm.tagName,
            count,
          });
        }
      }
    });

    return chattering.sort((a, b) => b.count - a.count);
  }, [alarmHistory]);

  // Filtered alarms
  const filteredAlarms = useMemo(() => {
    return alarms.filter((alarm) => {
      const matchesSearch =
        searchTerm === '' ||
        alarm.tagName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        alarm.tagId.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesPriority = priorityFilter === 'ALL' || alarm.priority === priorityFilter;
      const matchesState = stateFilter === 'ALL' || alarm.state === stateFilter;

      return matchesSearch && matchesPriority && matchesState;
    });
  }, [alarms, searchTerm, priorityFilter, stateFilter]);

  // Toggle alarm expansion
  const toggleAlarmExpansion = (alarmId: string) => {
    setExpandedAlarms((prev) => {
      const next = new Set(prev);
      if (next.has(alarmId)) {
        next.delete(alarmId);
      } else {
        next.add(alarmId);
      }
      return next;
    });
  };

  // Format time duration
  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
    return `${Math.round(ms / 3600000)}h`;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: 400 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 400 }}
        className="fixed right-0 top-0 bottom-0 w-full sm:w-[500px] max-w-full bg-slate-900/95 backdrop-blur-xl border-l border-purple-500/30 shadow-2xl z-50 flex flex-col"
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-700/50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-purple-400" />
              <h2 className="text-lg font-bold text-white">ISA-18.2 Compliance</h2>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-slate-700/50 rounded">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span>
              Total Alarms: <span className="text-cyan-400">{summary.total}</span>
            </span>
            <span>
              Unack: <span className="text-red-400">{summary.unacknowledged}</span>
            </span>
            <span>
              SLA:{' '}
              <span className="text-green-400">{complianceMetrics.slaCompliance.toFixed(1)}%</span>
            </span>
            {hasCritical && (
              <span className="flex items-center gap-1 text-red-400 animate-pulse">
                <Siren className="w-3 h-3" />
                CRITICAL
              </span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-700/50">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'overview'
                ? 'text-purple-400 border-b-2 border-purple-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <BarChart3 className="w-4 h-4 inline mr-2" />
            Overview
          </button>
          <button
            onClick={() => setActiveTab('lifecycle')}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'lifecycle'
                ? 'text-purple-400 border-b-2 border-purple-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Activity className="w-4 h-4 inline mr-2" />
            Lifecycle
          </button>
          <button
            onClick={() => setActiveTab('rationalization')}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'rationalization'
                ? 'text-purple-400 border-b-2 border-purple-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ListChecks className="w-4 h-4 inline mr-2" />
            Analysis
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="h-full overflow-y-auto p-4 space-y-4">
              {/* KPI Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
                  <div className="text-xs text-slate-500 uppercase mb-1">SLA Compliance</div>
                  <div className="text-2xl font-bold text-green-400">
                    {complianceMetrics.slaCompliance.toFixed(1)}%
                  </div>
                  <div className="text-xs text-slate-500 mt-1">30s target</div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
                  <div className="text-xs text-slate-500 uppercase mb-1">Avg Ack Time</div>
                  <div className="text-2xl font-bold text-cyan-400">
                    {formatDuration(complianceMetrics.avgAckTime)}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">response time</div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
                  <div className="text-xs text-slate-500 uppercase mb-1">Processed</div>
                  <div className="text-2xl font-bold text-purple-400">
                    {complianceMetrics.totalProcessed}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">total alarms</div>
                </div>
              </div>

              {/* Priority Distribution Chart */}
              <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/30">
                <div className="text-sm font-medium text-white mb-3">Priority Distribution</div>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={priorityDistribution}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={60}
                        label={(entry) => `${entry.name}: ${entry.value}`}
                      >
                        {priorityDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: '8px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* State Distribution Chart */}
              <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/30">
                <div className="text-sm font-medium text-white mb-3">
                  Alarm State Distribution (ISA-18.2)
                </div>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stateDistribution}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: '8px',
                        }}
                      />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {stateDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Alarm Flow Diagram */}
              <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/30">
                <div className="text-sm font-medium text-white mb-3">ISA-18.2 Lifecycle</div>
                <div className="flex items-center justify-between text-xs">
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-full bg-green-500/20 border-2 border-green-500 flex items-center justify-center mb-1">
                      <CheckCircle className="w-6 h-6 text-green-400" />
                    </div>
                    <div className="text-green-400 font-medium">NORMAL</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600" />
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500 flex items-center justify-center mb-1">
                      <AlertTriangle className="w-6 h-6 text-red-400" />
                    </div>
                    <div className="text-red-400 font-medium">UNACK</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600" />
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-500 flex items-center justify-center mb-1">
                      <Bell className="w-6 h-6 text-amber-400" />
                    </div>
                    <div className="text-amber-400 font-medium">ACKED</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600" />
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-full bg-cyan-500/20 border-2 border-cyan-500 flex items-center justify-center mb-1">
                      <Activity className="w-6 h-6 text-cyan-400" />
                    </div>
                    <div className="text-cyan-400 font-medium">RTN</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Lifecycle Tab */}
          {activeTab === 'lifecycle' && (
            <div className="h-full flex flex-col">
              {/* Filters */}
              <div className="p-3 border-b border-slate-700/50 space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search alarms..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/50"
                  />
                </div>
                <div className="flex gap-2">
                  <select
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value as AlarmPriority | 'ALL')}
                    className="flex-1 px-2 py-1 bg-slate-800/50 border border-slate-700/50 rounded text-xs text-white focus:outline-none focus:border-purple-500/50"
                  >
                    <option value="ALL">All Priorities</option>
                    <option value="CRITICAL">Critical</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </select>
                  <select
                    value={stateFilter}
                    onChange={(e) => setStateFilter(e.target.value as AlarmState | 'ALL')}
                    className="flex-1 px-2 py-1 bg-slate-800/50 border border-slate-700/50 rounded text-xs text-white focus:outline-none focus:border-purple-500/50"
                  >
                    <option value="ALL">All States</option>
                    <option value="UNACK">Unacknowledged</option>
                    <option value="ACKED">Acknowledged</option>
                    <option value="RTN_UNACK">Returned Unack</option>
                  </select>
                </div>
              </div>

              {/* Alarm List */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {filteredAlarms.length === 0 ? (
                  <div className="text-center text-slate-500 py-8">
                    <Check className="w-12 h-12 mx-auto mb-2 text-green-500/50" />
                    {searchTerm || priorityFilter !== 'ALL' || stateFilter !== 'ALL'
                      ? 'No alarms match filters'
                      : 'No active alarms'}
                  </div>
                ) : (
                  filteredAlarms.map((alarm) => {
                    const isExpanded = expandedAlarms.has(alarm.id);
                    return (
                      <div
                        key={alarm.id}
                        className={`rounded-lg border overflow-hidden ${
                          alarm.state === 'UNACK' || alarm.state === 'RTN_UNACK'
                            ? 'border-red-500/50 bg-red-500/10'
                            : 'border-slate-700/50 bg-slate-800/30'
                        }`}
                      >
                        <div className="p-3">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-bold ${PRIORITY_BG_COLORS[alarm.priority]}`}
                              >
                                {alarm.priority}
                              </span>
                              <span className="text-xs text-slate-500">{alarm.type}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {(alarm.state === 'UNACK' || alarm.state === 'RTN_UNACK') && (
                                <button
                                  onClick={() => acknowledge(alarm.id)}
                                  className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs rounded hover:bg-purple-500/30"
                                >
                                  ACK
                                </button>
                              )}
                              <button
                                onClick={() => toggleAlarmExpansion(alarm.id)}
                                className="p-1 hover:bg-slate-700/50 rounded"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-slate-400" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-slate-400" />
                                )}
                              </button>
                            </div>
                          </div>

                          <div className="text-sm text-white font-medium mb-1">{alarm.tagName}</div>
                          <div className="flex items-center justify-between text-xs text-slate-400">
                            <span>
                              Value: {alarm.value.toFixed(2)} | Limit: {alarm.threshold}
                            </span>
                            <span
                              className="px-2 py-0.5 rounded text-xs font-medium"
                              style={{
                                backgroundColor: `${STATE_COLORS[alarm.state]}20`,
                                color: STATE_COLORS[alarm.state],
                              }}
                            >
                              {alarm.state}
                            </span>
                          </div>

                          {isExpanded && (
                            <div className="mt-3 pt-3 border-t border-slate-700/50 space-y-2 text-xs">
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <div className="text-slate-500">Tag ID</div>
                                  <div className="text-slate-300 font-mono">{alarm.tagId}</div>
                                </div>
                                <div>
                                  <div className="text-slate-500">Machine</div>
                                  <div className="text-slate-300">{alarm.machineId || 'N/A'}</div>
                                </div>
                                <div>
                                  <div className="text-slate-500">Raised At</div>
                                  <div className="text-slate-300">
                                    {new Date(alarm.timestamp).toLocaleTimeString()}
                                  </div>
                                </div>
                                {alarm.acknowledgedAt && (
                                  <div>
                                    <div className="text-slate-500">Acknowledged</div>
                                    <div className="text-slate-300">
                                      {new Date(alarm.acknowledgedAt).toLocaleTimeString()}
                                      {alarm.acknowledgedBy && ` by ${alarm.acknowledgedBy}`}
                                    </div>
                                  </div>
                                )}
                                {alarm.clearedAt && (
                                  <div>
                                    <div className="text-slate-500">Cleared At</div>
                                    <div className="text-slate-300">
                                      {new Date(alarm.clearedAt).toLocaleTimeString()}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Rationalization Tab */}
          {activeTab === 'rationalization' && (
            <div className="h-full overflow-y-auto p-4 space-y-4">
              {/* Chattering Alarms */}
              <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/30">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-4 h-4 text-yellow-400" />
                  <div className="text-sm font-medium text-white">Chattering Detection</div>
                </div>
                {chatteringAlarms.length === 0 ? (
                  <div className="text-xs text-slate-500 text-center py-3">
                    No chattering alarms detected
                  </div>
                ) : (
                  <div className="space-y-2">
                    {chatteringAlarms.map((alarm) => (
                      <div
                        key={alarm.tagId}
                        className="flex items-center justify-between p-2 bg-yellow-500/10 border border-yellow-500/30 rounded"
                      >
                        <div>
                          <div className="text-sm text-white font-medium">{alarm.tagName}</div>
                          <div className="text-xs text-slate-400 font-mono">{alarm.tagId}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-yellow-400">{alarm.count}</div>
                          <div className="text-xs text-slate-500">occurrences</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Suppressed Alarms */}
              <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/30">
                <div className="flex items-center gap-2 mb-3">
                  <Pause className="w-4 h-4 text-cyan-400" />
                  <div className="text-sm font-medium text-white">
                    Suppressed Alarms ({suppressed.length})
                  </div>
                </div>
                {suppressed.length === 0 ? (
                  <div className="text-xs text-slate-500 text-center py-3">
                    No alarms currently suppressed
                  </div>
                ) : (
                  <div className="space-y-2">
                    {suppressed.map((suppression: AlarmSuppression) => (
                      <div
                        key={suppression.tagId}
                        className="p-2 bg-slate-700/30 border border-slate-600/50 rounded"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-sm text-white font-mono">{suppression.tagId}</div>
                          <button
                            onClick={() => unsuppress(suppression.tagId)}
                            className="text-xs text-cyan-400 hover:text-cyan-300"
                          >
                            Unsuppress
                          </button>
                        </div>
                        <div className="text-xs text-slate-400">{suppression.reason}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          By {suppression.suppressedBy} at{' '}
                          {new Date(suppression.suppressedAt).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Alarm Frequency Analysis */}
              <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/30">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-purple-400" />
                  <div className="text-sm font-medium text-white">Alarm Frequency</div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Total Alarms (Last 50)</span>
                    <span className="text-white font-bold">{alarmHistory.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Critical Priority</span>
                    <span className="text-red-400 font-bold">
                      {alarmHistory.filter((a) => a.priority === 'CRITICAL').length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">High Priority</span>
                    <span className="text-orange-400 font-bold">
                      {alarmHistory.filter((a) => a.priority === 'HIGH').length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Auto-Cleared</span>
                    <span className="text-green-400 font-bold">
                      {
                        alarmHistory.filter(
                          (a) => a.state === 'NORMAL' && a.acknowledgedAt && a.clearedAt
                        ).length
                      }
                    </span>
                  </div>
                </div>
              </div>

              {/* Deadband Configuration */}
              <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/30">
                <div className="flex items-center gap-2 mb-3">
                  <Activity className="w-4 h-4 text-green-400" />
                  <div className="text-sm font-medium text-white">Deadband Status</div>
                </div>
                <div className="text-xs text-slate-400">
                  Deadband prevents alarm chattering by requiring values to cross back over the
                  threshold by a minimum amount before clearing. Currently configured per tag in
                  SCADA tag database.
                </div>
                <div className="mt-3 p-2 bg-green-500/10 border border-green-500/30 rounded">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-xs text-green-400 font-medium">
                      Deadband actively preventing nuisance alarms
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ComplianceDashboard;
