/**
 * SPCCharts.tsx
 * Statistical Process Control Charts for MillOS
 *
 * Displays control charts with UCL/LCL/CL limits and Western Electric rules detection.
 * Monitors process metrics like temperature, vibration, production rate, and quality.
 *
 * Phase 3: Uses real machine metrics from useProductionStore().machines
 * - Temperature/vibration: Averaged across running machines
 * - Production rate: From production metrics throughput
 * - Quality grade: From production metrics quality
 * - Bag weight: Derived from packer load metrics
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Label,
} from 'recharts';
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  X,
  Download,
  Info,
  AlertOctagon,
} from 'lucide-react';
import { useUIStore } from '../stores/uiStore';
import { useProductionStore } from '../stores/productionStore';
import type { ProductionStore } from '../stores/productionStore';

// ============================================================================
// Types & Interfaces
// ============================================================================

type ChartType = 'xbar' | 'r-chart' | 'i-mr' | 'p-chart';

type MetricType = 'temperature' | 'vibration' | 'production_rate' | 'quality_grade' | 'bag_weight';

interface SPCDataPoint {
  timestamp: number;
  time: string; // Formatted time for display
  value: number;
  ucl: number; // Upper Control Limit
  lcl: number; // Lower Control Limit
  cl: number; // Center Line
  uwl: number; // Upper Warning Limit (2σ)
  lwl: number; // Lower Warning Limit (2σ)
  status: 'in-control' | 'warning' | 'out-of-control';
  ruleViolations: string[];
}

interface ControlLimits {
  ucl: number; // Mean + 3σ
  lcl: number; // Mean - 3σ
  cl: number; // Mean
  uwl: number; // Mean + 2σ
  lwl: number; // Mean - 2σ
}

interface WesternElectricViolation {
  index: number;
  rule: string;
  description: string;
  severity: 'warning' | 'critical';
}

// ============================================================================
// Western Electric Rules Detection
// ============================================================================

const detectWesternElectricRules = (dataPoints: SPCDataPoint[]): WesternElectricViolation[] => {
  const violations: WesternElectricViolation[] = [];

  dataPoints.forEach((point, i) => {
    const ruleViolations: string[] = [];

    // Rule 1: One point beyond 3σ (UCL/LCL)
    if (point.value > point.ucl || point.value < point.lcl) {
      ruleViolations.push('Rule 1: Point beyond 3σ');
      violations.push({
        index: i,
        rule: 'Rule 1',
        description: 'One point beyond 3σ control limits',
        severity: 'critical',
      });
    }

    // Rule 2: 2 of 3 consecutive points beyond 2σ (warning limits)
    if (i >= 2) {
      const last3 = dataPoints.slice(i - 2, i + 1);
      const beyond2Sigma = last3.filter((p) => p.value > p.uwl || p.value < p.lwl).length;
      if (beyond2Sigma >= 2) {
        ruleViolations.push('Rule 2: 2 of 3 beyond 2σ');
        violations.push({
          index: i,
          rule: 'Rule 2',
          description: '2 of 3 consecutive points beyond 2σ',
          severity: 'warning',
        });
      }
    }

    // Rule 3: 4 of 5 consecutive points beyond 1σ
    if (i >= 4) {
      const last5 = dataPoints.slice(i - 4, i + 1);
      const beyond1Sigma = last5.filter((p) => {
        const sigma1Upper = p.cl + (p.ucl - p.cl) / 3;
        const sigma1Lower = p.cl - (p.cl - p.lcl) / 3;
        return p.value > sigma1Upper || p.value < sigma1Lower;
      }).length;
      if (beyond1Sigma >= 4) {
        ruleViolations.push('Rule 3: 4 of 5 beyond 1σ');
        violations.push({
          index: i,
          rule: 'Rule 3',
          description: '4 of 5 consecutive points beyond 1σ',
          severity: 'warning',
        });
      }
    }

    // Rule 4: 8 consecutive points on one side of center line
    if (i >= 7) {
      const last8 = dataPoints.slice(i - 7, i + 1);
      const allAbove = last8.every((p) => p.value > p.cl);
      const allBelow = last8.every((p) => p.value < p.cl);
      if (allAbove || allBelow) {
        ruleViolations.push('Rule 4: 8 points on one side');
        violations.push({
          index: i,
          rule: 'Rule 4',
          description: '8 consecutive points on one side of center line',
          severity: 'warning',
        });
      }
    }

    point.ruleViolations = ruleViolations;
  });

  return violations;
};

// ============================================================================
// Calculate Control Limits
// ============================================================================

const calculateControlLimits = (values: number[]): ControlLimits => {
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  return {
    cl: mean,
    ucl: mean + 3 * stdDev,
    lcl: mean - 3 * stdDev,
    uwl: mean + 2 * stdDev,
    lwl: mean - 2 * stdDev,
  };
};

// ============================================================================
// Real Machine Data History Tracker
// Phase 3: Uses actual machine metrics instead of mock data
// ============================================================================

// History storage for real-time data accumulation (per metric type)
const metricHistory: Record<MetricType, { timestamp: number; value: number }[]> = {
  temperature: [],
  vibration: [],
  production_rate: [],
  quality_grade: [],
  bag_weight: [],
};

const MAX_HISTORY_POINTS = 50;

// Get current real metric value from production store
const getCurrentMetricValue = (
  metricType: MetricType,
  machines: ProductionStore['machines'],
  metrics: ProductionStore['metrics']
): number => {
  const runningMachines = machines.filter((m) => m.status === 'running');
  if (
    runningMachines.length === 0 &&
    metricType !== 'production_rate' &&
    metricType !== 'quality_grade'
  ) {
    // Return baseline values when no machines running
    switch (metricType) {
      case 'temperature':
        return 65;
      case 'vibration':
        return 0.2;
      case 'bag_weight':
        return 50.0;
      default:
        return 0;
    }
  }

  switch (metricType) {
    case 'temperature': {
      // Average temperature across all running machines
      const temps = runningMachines.map((m) => m.metrics.temperature);
      return temps.length > 0 ? temps.reduce((a, b) => a + b, 0) / temps.length : 65;
    }
    case 'vibration': {
      // Average vibration across all running machines
      const vibs = runningMachines.map((m) => m.metrics.vibration);
      return vibs.length > 0 ? vibs.reduce((a, b) => a + b, 0) / vibs.length : 0.2;
    }
    case 'production_rate': {
      // Use throughput from production metrics (bags per hour)
      return metrics.throughput * 60; // Convert to bags per hour
    }
    case 'quality_grade': {
      // Use quality from production metrics
      return metrics.quality;
    }
    case 'bag_weight': {
      // Simulated bag weight based on running packers with slight variation
      const packers = runningMachines.filter((m) => m.type === 'PACKER');
      if (packers.length === 0) return 50.0;
      // Use average load as proxy for bag weight consistency
      const avgLoad = packers.reduce((sum, p) => sum + p.metrics.load, 0) / packers.length;
      return 50.0 + (avgLoad - 50) * 0.02; // Slight variation based on load
    }
  }
};

// Update history with current reading
const updateMetricHistory = (
  metricType: MetricType,
  machines: ProductionStore['machines'],
  metrics: ProductionStore['metrics']
): void => {
  const value = getCurrentMetricValue(metricType, machines, metrics);
  const now = Date.now();

  metricHistory[metricType].push({ timestamp: now, value });

  // Keep only last MAX_HISTORY_POINTS
  if (metricHistory[metricType].length > MAX_HISTORY_POINTS) {
    metricHistory[metricType] = metricHistory[metricType].slice(-MAX_HISTORY_POINTS);
  }
};

// Generate SPC data from real machine metrics
const generateRealData = (
  metricType: MetricType,
  machines: ProductionStore['machines'],
  metrics: ProductionStore['metrics'],
  _hours = 24
): SPCDataPoint[] => {
  // Update history with current reading
  updateMetricHistory(metricType, machines, metrics);

  const history = metricHistory[metricType];

  // Need at least 3 points for meaningful SPC
  if (history.length < 3) {
    // Bootstrap with current value
    const currentValue = getCurrentMetricValue(metricType, machines, metrics);
    const now = Date.now();
    for (let i = history.length; i < 3; i++) {
      history.unshift({ timestamp: now - (3 - i) * 5000, value: currentValue });
    }
  }

  const points = history.map((h) => h.value);
  const limits = calculateControlLimits(points);

  // Create data points with status
  const dataPoints: SPCDataPoint[] = history.map((h) => {
    let status: 'in-control' | 'warning' | 'out-of-control' = 'in-control';

    if (h.value > limits.ucl || h.value < limits.lcl) {
      status = 'out-of-control';
    } else if (h.value > limits.uwl || h.value < limits.lwl) {
      status = 'warning';
    }

    return {
      timestamp: h.timestamp,
      time: new Date(h.timestamp).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      value: Number(h.value.toFixed(2)),
      ucl: limits.ucl,
      lcl: limits.lcl,
      cl: limits.cl,
      uwl: limits.uwl,
      lwl: limits.lwl,
      status,
      ruleViolations: [],
    };
  });

  // Detect Western Electric rule violations
  detectWesternElectricRules(dataPoints);

  return dataPoints;
};

// ============================================================================
// Component Props
// ============================================================================

interface SPCChartsProps {
  className?: string;
  embedded?: boolean; // If true, shows compact version for ComplianceDashboard
}

// ============================================================================
// Main Component
// ============================================================================

export const SPCCharts: React.FC<SPCChartsProps> = ({ className = '', embedded = false }) => {
  // State
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('temperature');
  const [_selectedChart, setSelectedChart] = useState<ChartType>('xbar');
  const [timeRange, setTimeRange] = useState<1 | 8 | 24>(24);
  const [data, setData] = useState<SPCDataPoint[]>([]);
  const [_showAnnotations, setShowAnnotations] = useState(true);

  // Stores - Phase 3: Use real machine data
  const showSPCCharts = useUIStore((state) => state.showSPCCharts ?? false);
  const setShowSPCCharts = useUIStore((state) => state.setShowSPCCharts);
  const machines = useProductionStore((state) => state.machines);
  const productionMetrics = useProductionStore((state) => state.metrics);

  // Generate/update data from real machine metrics
  useEffect(() => {
    const newData = generateRealData(selectedMetric, machines, productionMetrics, timeRange);
    setData(newData);

    // Refresh data every 5 seconds to accumulate history
    if (!embedded) {
      const interval = setInterval(() => {
        const { machines: currentMachines, metrics: currentMetrics } =
          useProductionStore.getState();
        setData(generateRealData(selectedMetric, currentMachines, currentMetrics, timeRange));
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [selectedMetric, timeRange, embedded, machines, productionMetrics]);

  // Calculate statistics
  const stats = useMemo(() => {
    if (data.length === 0) return null;

    const values = data.map((d) => d.value);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    const inControl = data.filter((d) => d.status === 'in-control').length;
    const warning = data.filter((d) => d.status === 'warning').length;
    const outOfControl = data.filter((d) => d.status === 'out-of-control').length;

    const cpk = Math.min((data[0].ucl - mean) / (3 * stdDev), (mean - data[0].lcl) / (3 * stdDev));

    return {
      mean: mean.toFixed(2),
      stdDev: stdDev.toFixed(2),
      cpk: cpk.toFixed(2),
      inControl,
      warning,
      outOfControl,
      processCapable: cpk >= 1.33,
    };
  }, [data]);

  // Get violations
  const violations = useMemo(() => {
    return detectWesternElectricRules([...data]);
  }, [data]);

  // Custom dot renderer for status colors
  const customDot = (props: any) => {
    const { cx, cy, payload } = props;
    let fill = '#22c55e'; // green (in-control)

    if (payload?.status === 'warning') fill = '#eab308'; // yellow
    if (payload?.status === 'out-of-control') fill = '#ef4444'; // red

    return <circle cx={cx} cy={cy} r={4} fill={fill} stroke="#1e293b" strokeWidth={1} />;
  };

  // Handle export
  const handleExport = () => {
    const csv = [
      'Timestamp,Time,Value,UCL,LCL,CL,Status,Rule Violations',
      ...data.map((d) =>
        [
          d.timestamp,
          d.time,
          d.value,
          d.ucl.toFixed(2),
          d.lcl.toFixed(2),
          d.cl.toFixed(2),
          d.status,
          d.ruleViolations.join('; '),
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spc-${selectedMetric}-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // If embedded, return compact version
  if (embedded) {
    return (
      <div className={`bg-slate-800/50 rounded-lg border border-slate-700/50 p-4 ${className}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-white">SPC Chart</h3>
          </div>
          <select
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value as MetricType)}
            className="text-xs bg-slate-700 text-white rounded px-2 py-1 border border-slate-600"
          >
            <option value="temperature">Temperature</option>
            <option value="vibration">Vibration</option>
            <option value="production_rate">Production Rate</option>
            <option value="quality_grade">Quality Grade</option>
            <option value="bag_weight">Bag Weight</option>
          </select>
        </div>

        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="time"
                stroke="#64748b"
                tick={{ fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  fontSize: '11px',
                }}
              />
              <ReferenceLine y={data[0]?.ucl} stroke="#ef4444" strokeDasharray="5 5" />
              <ReferenceLine y={data[0]?.lcl} stroke="#ef4444" strokeDasharray="5 5" />
              <ReferenceLine y={data[0]?.cl} stroke="#22c55e" strokeWidth={2} />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#06b6d4"
                strokeWidth={2}
                dot={customDot}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // Full standalone version
  return (
    <AnimatePresence>
      {showSPCCharts && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className={`fixed inset-4 z-50 flex items-center justify-center pointer-events-none ${className}`}
        >
          <motion.div
            className="bg-slate-900 rounded-lg shadow-2xl border border-slate-700 w-full max-w-6xl max-h-[90vh] overflow-hidden pointer-events-auto"
            initial={{ y: 20 }}
            animate={{ y: 0 }}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-cyan-900/50 to-blue-900/50 border-b border-slate-700 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-cyan-500/10 rounded-lg">
                    <TrendingUp className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">
                      Statistical Process Control Charts
                    </h2>
                    <p className="text-xs text-slate-400">
                      Real-time quality monitoring with Western Electric rules
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowSPCCharts?.(false)}
                  className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto max-h-[calc(90vh-80px)]">
              {/* Controls */}
              <div className="p-4 bg-slate-800/50 border-b border-slate-700">
                <div className="grid grid-cols-4 gap-3">
                  {/* Metric Selection */}
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Metric</label>
                    <select
                      value={selectedMetric}
                      onChange={(e) => setSelectedMetric(e.target.value as MetricType)}
                      className="w-full text-sm bg-slate-700 text-white rounded px-3 py-2 border border-slate-600"
                    >
                      <option value="temperature">Temperature (C)</option>
                      <option value="vibration">Vibration (mm/s)</option>
                      <option value="production_rate">Production Rate (t/hr)</option>
                      <option value="quality_grade">Quality Grade (%)</option>
                      <option value="bag_weight">Bag Weight (kg)</option>
                    </select>
                  </div>

                  {/* Chart Type */}
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Chart Type</label>
                    <select
                      value={_selectedChart}
                      onChange={(e) => setSelectedChart(e.target.value as ChartType)}
                      className="w-full text-sm bg-slate-700 text-white rounded px-3 py-2 border border-slate-600"
                    >
                      <option value="xbar">X-bar (Mean)</option>
                      <option value="r-chart">R Chart (Range)</option>
                      <option value="i-mr">I-MR Chart</option>
                      <option value="p-chart">p-Chart (Defects)</option>
                    </select>
                  </div>

                  {/* Time Range */}
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Time Range</label>
                    <select
                      value={timeRange}
                      onChange={(e) => setTimeRange(Number(e.target.value) as 1 | 8 | 24)}
                      className="w-full text-sm bg-slate-700 text-white rounded px-3 py-2 border border-slate-600"
                    >
                      <option value={1}>Last Hour</option>
                      <option value={8}>Last 8 Hours</option>
                      <option value={24}>Last 24 Hours</option>
                    </select>
                  </div>

                  {/* Actions */}
                  <div className="flex items-end gap-2">
                    <button
                      onClick={() => setShowAnnotations(!_showAnnotations)}
                      className={`flex-1 text-xs px-3 py-2 rounded transition-colors ${
                        _showAnnotations ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      Annotations
                    </button>
                    <button
                      onClick={handleExport}
                      className="p-2 bg-slate-700 hover:bg-slate-600 rounded transition-colors"
                      title="Export to CSV"
                    >
                      <Download className="w-4 h-4 text-slate-300" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Statistics Bar */}
              {stats && (
                <div className="grid grid-cols-6 gap-3 p-4 bg-slate-800/30">
                  <div className="text-center">
                    <div className="text-xs text-slate-400 mb-1">Mean</div>
                    <div className="text-lg font-bold text-white font-mono">{stats.mean}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-slate-400 mb-1">Std Dev</div>
                    <div className="text-lg font-bold text-cyan-400 font-mono">{stats.stdDev}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-slate-400 mb-1">Cpk</div>
                    <div
                      className={`text-lg font-bold font-mono ${
                        stats.processCapable ? 'text-green-400' : 'text-red-400'
                      }`}
                    >
                      {stats.cpk}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-slate-400 mb-1">In Control</div>
                    <div className="text-lg font-bold text-green-400 font-mono">
                      {stats.inControl}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-slate-400 mb-1">Warning</div>
                    <div className="text-lg font-bold text-yellow-400 font-mono">
                      {stats.warning}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-slate-400 mb-1">Out of Control</div>
                    <div className="text-lg font-bold text-red-400 font-mono">
                      {stats.outOfControl}
                    </div>
                  </div>
                </div>
              )}

              {/* Chart */}
              <div className="p-4">
                <div className="h-96 bg-slate-800/30 rounded-lg p-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis
                        dataKey="time"
                        stroke="#94a3b8"
                        tick={{ fill: '#94a3b8', fontSize: 12 }}
                        interval="preserveStartEnd"
                      />
                      <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: '8px',
                          padding: '12px',
                        }}
                        labelStyle={{ color: '#cbd5e1' }}
                        formatter={(value, name) => [
                          typeof value === 'number' ? value.toFixed(2) : String(value ?? ''),
                          String(name ?? ''),
                        ]}
                      />
                      <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="line" />

                      {/* Control Limits */}
                      <ReferenceLine
                        y={data[0]?.ucl}
                        stroke="#ef4444"
                        strokeDasharray="5 5"
                        strokeWidth={2}
                      >
                        <Label value="UCL" position="right" fill="#ef4444" />
                      </ReferenceLine>
                      <ReferenceLine
                        y={data[0]?.lcl}
                        stroke="#ef4444"
                        strokeDasharray="5 5"
                        strokeWidth={2}
                      >
                        <Label value="LCL" position="right" fill="#ef4444" />
                      </ReferenceLine>
                      <ReferenceLine y={data[0]?.cl} stroke="#22c55e" strokeWidth={2}>
                        <Label value="CL" position="right" fill="#22c55e" />
                      </ReferenceLine>

                      {/* Warning Limits (2σ) */}
                      <ReferenceLine
                        y={data[0]?.uwl}
                        stroke="#eab308"
                        strokeDasharray="3 3"
                        strokeWidth={1}
                      >
                        <Label value="UWL" position="right" fill="#eab308" />
                      </ReferenceLine>
                      <ReferenceLine
                        y={data[0]?.lwl}
                        stroke="#eab308"
                        strokeDasharray="3 3"
                        strokeWidth={1}
                      >
                        <Label value="LWL" position="right" fill="#eab308" />
                      </ReferenceLine>

                      {/* Data Line */}
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="#06b6d4"
                        strokeWidth={2}
                        dot={customDot}
                        name="Value"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* Legend */}
                <div className="mt-4 flex items-center justify-center gap-6 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-0.5 bg-red-500 border-dashed" />
                    <span className="text-slate-400">UCL/LCL (3σ)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-0.5 bg-yellow-500 border-dashed" />
                    <span className="text-slate-400">UWL/LWL (2σ)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-0.5 bg-green-500" />
                    <span className="text-slate-400">Center Line</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <span className="text-slate-400">In Control</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-yellow-500" />
                    <span className="text-slate-400">Warning</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <span className="text-slate-400">Out of Control</span>
                  </div>
                </div>
              </div>

              {/* Rule Violations */}
              {violations.length > 0 && (
                <div className="p-4 border-t border-slate-700">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertOctagon className="w-4 h-4 text-orange-400" />
                    <h3 className="text-sm font-semibold text-white">
                      Western Electric Rule Violations ({violations.length})
                    </h3>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {violations.map((violation, i) => (
                      <div
                        key={i}
                        className={`flex items-start gap-3 p-3 rounded-lg ${
                          violation.severity === 'critical'
                            ? 'bg-red-500/10 border border-red-500/30'
                            : 'bg-yellow-500/10 border border-yellow-500/30'
                        }`}
                      >
                        {violation.severity === 'critical' ? (
                          <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5" />
                        ) : (
                          <Info className="w-4 h-4 text-yellow-400 mt-0.5" />
                        )}
                        <div className="flex-1">
                          <div className="text-sm font-medium text-white">{violation.rule}</div>
                          <div className="text-xs text-slate-400">{violation.description}</div>
                          <div className="text-xs text-slate-500 mt-1">
                            Point #{violation.index + 1} - {data[violation.index]?.time}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No Violations Message */}
              {violations.length === 0 && (
                <div className="p-4 border-t border-slate-700">
                  <div className="flex items-center justify-center gap-2 text-green-400 py-4">
                    <CheckCircle className="w-5 h-5" />
                    <span className="text-sm font-medium">
                      Process is in statistical control - No rule violations detected
                    </span>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
