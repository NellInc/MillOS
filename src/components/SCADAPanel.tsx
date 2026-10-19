/**
 * SCADA Panel Component for MillOS
 *
 * Displays real-time SCADA data including:
 * - Tag browser with current values
 * - Alarm list with acknowledge controls
 * - Mini trend chart for selected tags
 */

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
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
  Maximize2,
  Factory,
  MapPin,
  ListChecks,
  BookOpenText,
  BriefcaseBusiness,
  Gauge,
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
  Brush,
} from 'recharts';
import { useSCADA, useSCADAAlarms, getSCADAService, refreshSharedSCADAStatus } from '../scada';
import type {
  TagValue,
  TagDefinition,
  TagGroup,
  ConnectionConfig,
  Quality,
  AlarmPriority,
  AlarmState,
  Alarm,
} from '../scada/types';
import { useGraphicsStore } from '../stores/graphicsStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { processTrendHistory, TREND_QUALITY_SUFFIX, type TrendRow } from '../scada/trendProcessing';
import { OPERATION_TAG_IDS, UTILITY_ASSET_TAG_IDS } from '../scada/tagDatabase';
import { useMaterialFlowStore } from '../stores/materialFlowStore';
import { useBreakdownStore } from '../stores/breakdownStore';
import { useQCLabStore } from '../stores/qcLabStore';
import { useShallow } from 'zustand/react/shallow';
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import { useHistoricalPlaybackStore } from '../stores/historicalPlaybackStore';
import { capitalizeIn, formatFixed, translate, useLocale, useT } from '../i18n';
import { incidentDescription, incidentTitle } from '../stores/incidentText';
import { dispatchBlockText } from '../stores/dispatchBlockText';
import { scadaPanelMessages } from './SCADAPanel.messages';
import { SCADASetpointControl } from './SCADASetpointControl';

interface SCADAPanelProps {
  isOpen: boolean;
  onClose: () => void;
  embedded?: boolean;
  selectedMachineId?: string | null;
  onFocusMachine?: (machineId: string) => void;
}

type SCADATab = 'overview' | 'tags' | 'alarms' | 'trends' | 'events' | 'faults' | 'settings';

const SCADA_TAB_ORDER: readonly SCADATab[] = [
  'overview',
  'tags',
  'alarms',
  'trends',
  'events',
  'faults',
  'settings',
];

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

// Alarm states in plain words for the chips (message keys, resolved at render)
const ALARM_STATE_LABEL_KEYS = {
  UNACK: 'stateUnack',
  RTN_UNACK: 'stateRtnUnack',
  ACKED: 'stateAcked',
  NORMAL: 'stateNormal',
} as const satisfies Record<AlarmState, keyof typeof scadaPanelMessages.en>;

// Protocol names are not translated; only 'Simulation' is copy.
const CONNECTION_LABELS: Record<Exclude<ConnectionConfig['type'], 'simulation'>, string> = {
  rest: 'REST API',
  mqtt: 'MQTT',
  websocket: 'WebSocket',
  opcua: 'OPC-UA',
  modbus: 'Modbus',
};

const connectionLabel = (type: ConnectionConfig['type']): string =>
  type === 'simulation'
    ? translate(scadaPanelMessages, 'connSimulation')
    : (CONNECTION_LABELS[type] ?? type);

const STAGE_STATE_LABEL_KEYS = {
  critical: 'stageStateCritical',
  attention: 'stageStateAttention',
  nominal: 'stageStateNominal',
} as const;

const FAULT_LABEL_KEYS = {
  sensor_fail: { name: 'faultSensorFail', description: 'faultSensorFailDescription' },
  spike: { name: 'faultSpike', description: 'faultSpikeDescription' },
  drift: { name: 'faultDrift', description: 'faultDriftDescription' },
  stuck: { name: 'faultStuck', description: 'faultStuckDescription' },
  noise: { name: 'faultNoise', description: 'faultNoiseDescription' },
} as const;

const defaultControlIdentity = (): string =>
  translate(scadaPanelMessages, 'defaultControlIdentity');

const DEFAULT_POLL_INTERVAL_MS = 1000;

const isInService = (alarm: Alarm): boolean => (alarm.disposition ?? 'IN_SERVICE') === 'IN_SERVICE';

// Format a tag value for display: integers as counts, booleans as state words.
const formatValue = (value: TagValue, tag: TagDefinition): string => {
  if (value.quality === 'BAD') return '---';
  const v = value.value;
  if (tag.dataType === 'BOOL') {
    const on = typeof v === 'number' ? v !== 0 : Boolean(v);
    return on
      ? tag.engUnit.charAt(0).toUpperCase() + tag.engUnit.slice(1)
      : translate(scadaPanelMessages, 'boolOff', { unit: tag.engUnit });
  }
  if (typeof v === 'number') {
    const text =
      tag.dataType === 'INT16' || tag.dataType === 'INT32'
        ? formatFixed(Math.round(v), 0)
        : formatFixed(v, 1);
    return `${text} ${tag.engUnit}`;
  }
  return String(v);
};

const withUnit = (value: number, digits: number, unit?: string): string =>
  `${formatFixed(value, digits)}${unit ? ` ${unit}` : ''}`;

const normalizeMachineId = (machineId: string) => machineId.toLowerCase().replace(/[^a-z0-9]/g, '');

export const SCADAPanel: React.FC<SCADAPanelProps> = ({
  isOpen,
  onClose,
  embedded = false,
  selectedMachineId,
  onFocusMachine,
}) => {
  const materialProvenance = useMaterialFlowStore(
    useShallow((state) => {
      let latestLot = null as
        | (typeof state.sourceLots extends Map<string, infer T> ? T : never)
        | null;
      state.sourceLots.forEach((lot) => {
        if (!latestLot || lot.simulationTime >= latestLot.simulationTime) latestLot = lot;
      });
      return {
        latestBatch: state.productionBatches.at(-1) ?? null,
        latestManifest: state.manifests.at(-1) ?? null,
        latestLot,
      };
    })
  );
  const latestOpenWorkOrder = useBreakdownStore(
    (state) =>
      state.workOrders.find((workOrder) => workOrder.phase !== 'returned_to_service') ?? null
  );
  const latestQualityRecord = useQCLabStore(
    (state) => state.qcLab.dispositionHistory.at(-1) ?? null
  );
  const activeSafetyEvent = useGameSimulationStore((state) =>
    state.safetyEvents.find((event) => event.id === state.activeSafetyEventId)
  );
  const campaign = useOperationsCampaignStore(
    useShallow((state) => ({
      elapsedMinutes: state.elapsedMinutes,
      orders: state.orders,
      activeOrderId: state.activeOrderId,
      incidents: state.incidents,
      constraints: state.constraints,
      execution: state.execution,
      utilityAssets: state.utilityAssets,
      logbook: state.logbook,
      addLogEntry: state.addLogEntry,
    }))
  );
  const historicalPlayback = useHistoricalPlaybackStore(
    useShallow((state) => ({
      isReplaying: state.isReplaying,
      enterReplayMode: state.enterReplayMode,
      exitReplayMode: state.exitReplayMode,
    }))
  );
  const {
    isConnected,
    linkUp,
    mode,
    writeSetpoint,
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

  const {
    alarms,
    summary,
    acknowledge,
    acknowledgeAll,
    shelve,
    suppress,
    takeOutOfService,
    suppressed,
    unsuppress,
    hasCritical,
  } = useSCADAAlarms();
  const scadaEnabled = useGraphicsStore((state) => state.graphics.enableSCADA);
  const setSCADAEnabled = useGraphicsStore((state) => state.setSCADAEnabled);
  const reduceMotion = useReducedMotion();
  const t = useT(scadaPanelMessages);
  const locale = useLocale();
  // English keeps the browser default (unchanged output); pt-BR dates and times follow pt-BR.
  const dateLocale = locale === 'en' ? undefined : locale;

  const [activeTab, setActiveTab] = useState<SCADATab>(() => (embedded ? 'tags' : 'overview'));
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<TagGroup | 'ALL'>('ALL');
  const [expandedMachines, setExpandedMachines] = useState<Set<string>>(new Set());
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Trend chart state
  const [selectedTrendTags, setSelectedTrendTags] = useState<string[]>([]);
  const [trendDuration, setTrendDuration] = useState<number>(5 * 60 * 1000); // 5 minutes default
  const [trendData, setTrendData] = useState<TrendRow[]>([]);
  const [trendPaused, setTrendPaused] = useState(false);
  const [trendView, setTrendView] = useState<'chart' | 'table'>('chart');
  const [trendTagSearch, setTrendTagSearch] = useState('');
  const [eventHistory, setEventHistory] = useState<Alarm[]>([]);
  const [eventHistoryLoading, setEventHistoryLoading] = useState(false);
  const [controlIdentity, setControlIdentity] = useState(defaultControlIdentity);
  const [alarmNote, setAlarmNote] = useState('');
  const [operationsLogMessage, setOperationsLogMessage] = useState('');

  // Connection settings state
  // SECURITY NOTE: Default URLs use HTTP/WS for localhost development convenience.
  // In production deployments, these should be configured to use HTTPS/WSS with valid TLS certificates.
  // Localhost connections do not require HTTPS as traffic never leaves the machine,
  // but any remote connections MUST use encrypted protocols to protect SCADA data in transit.
  const [connectionType, setConnectionType] = useState<ConnectionConfig['type']>('simulation');
  const [restUrl, setRestUrl] = useState('http://localhost:3001');
  // Kept as typed so the field can be cleared and retyped; clamped on Apply.
  const [restPollIntervalInput, setRestPollIntervalInput] = useState(
    String(DEFAULT_POLL_INTERVAL_MS)
  );
  const [mqttBrokerUrl, setMqttBrokerUrl] = useState('ws://localhost:8883');
  const [mqttTopicPrefix, setMqttTopicPrefix] = useState('scada');
  const [proxyUrl, setProxyUrl] = useState('http://localhost:3001');
  // The WebSocket adapter and the OPC-UA/Modbus proxy take different URL
  // schemes, so they no longer share one field.
  const [websocketUrl, setWebsocketUrl] = useState('ws://localhost:3001/ws');
  const [isApplyingSettings, setIsApplyingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const handleToggleSCADA = useCallback(() => {
    setSCADAEnabled(!scadaEnabled);
    setSettingsMessage({
      type: 'success',
      text: !scadaEnabled
        ? translate(scadaPanelMessages, 'runtimeEnabled')
        : translate(scadaPanelMessages, 'runtimeDisabled'),
    });
  }, [scadaEnabled, setSCADAEnabled]);

  // Mode and link state do not arrive on the value stream; poll them while open.
  useEffect(() => {
    if (!isOpen || !scadaEnabled) return;
    refreshSharedSCADAStatus();
    const interval = setInterval(refreshSharedSCADAStatus, 2000);
    return () => clearInterval(interval);
  }, [isOpen, scadaEnabled]);

  useEffect(() => {
    if (!isOpen || embedded) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const handleWorkspaceKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !workspaceRef.current) return;
      const focusable = Array.from(
        workspaceRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => !element.hasAttribute('hidden'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleWorkspaceKeyDown);
    return () => {
      document.removeEventListener('keydown', handleWorkspaceKeyDown);
      previouslyFocused?.focus();
    };
  }, [embedded, isOpen, onClose]);

  // Chart line colors
  const TREND_COLORS = ['#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  // Duration options
  const DURATION_OPTIONS = [
    { label: t('duration1m'), value: 60 * 1000 },
    { label: t('duration5m'), value: 5 * 60 * 1000 },
    { label: t('duration15m'), value: 15 * 60 * 1000 },
    { label: t('duration1h'), value: 60 * 60 * 1000 },
    { label: t('duration4h'), value: 4 * 60 * 60 * 1000 },
    { label: t('duration24h'), value: 24 * 60 * 60 * 1000 },
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

  const processStages = useMemo(
    () =>
      [
        {
          id: 'intake',
          labelKey: 'stageIntake',
          descriptionKey: 'stageIntakeDescription',
          machineIds: Array.from(tagsByMachine.keys()).filter((id) => id.startsWith('silo-')),
        },
        {
          id: 'milling',
          labelKey: 'stageMilling',
          descriptionKey: 'stageMillingDescription',
          machineIds: Array.from(tagsByMachine.keys()).filter((id) => id.startsWith('rm-')),
        },
        {
          id: 'sifting',
          labelKey: 'stageSifting',
          descriptionKey: 'stageSiftingDescription',
          machineIds: Array.from(tagsByMachine.keys()).filter((id) => id.startsWith('sifter-')),
        },
        {
          id: 'packing',
          labelKey: 'stagePacking',
          descriptionKey: 'stagePackingDescription',
          machineIds: Array.from(tagsByMachine.keys()).filter((id) => id.startsWith('packer-')),
        },
        {
          id: 'logistics',
          labelKey: 'stageLogistics',
          descriptionKey: 'stageLogisticsDescription',
          machineIds: Array.from(tagsByMachine.keys()).filter(
            (id) => id.startsWith('forklift-') || id.endsWith('-truck')
          ),
        },
      ] as const,
    [tagsByMachine]
  );

  const operationalTelemetry = useMemo(() => {
    const read = (tagId: string): number => {
      const value = values.get(tagId)?.value;
      return typeof value === 'number' && Number.isFinite(value) ? value : 0;
    };
    return {
      rawInventory: read(OPERATION_TAG_IDS.rawInventory),
      inProcess: read(OPERATION_TAG_IDS.inProcess),
      finishedGoods: read(OPERATION_TAG_IDS.finishedGoods),
      packerFlow: read(OPERATION_TAG_IDS.packerFlow),
      balanceError: read(OPERATION_TAG_IDS.materialBalanceError),
      lastReceiving: read(OPERATION_TAG_IDS.lastReceiving),
      lastShipping: read(OPERATION_TAG_IDS.lastShipping),
      partsStock: read(OPERATION_TAG_IDS.partsStock),
      shippingReleased: read(OPERATION_TAG_IDS.shippingReleased) >= 0.5,
      activeQualityHolds: read(OPERATION_TAG_IDS.activeQualityHolds),
      recalledBatches: read(OPERATION_TAG_IDS.recalledBatches),
      openWorkOrders: read(OPERATION_TAG_IDS.openWorkOrders),
      maintenanceDowntime: read(OPERATION_TAG_IDS.maintenanceDowntime),
    };
  }, [values]);

  const utilityTelemetry = useMemo(
    () =>
      campaign.utilityAssets.map((asset) => {
        const tagIds = UTILITY_ASSET_TAG_IDS[asset.id];
        const read = (tagId: string | undefined, fallback: number): number => {
          const value = tagId ? values.get(tagId)?.value : undefined;
          return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
        };
        const levelPercent = read(tagIds?.level, asset.levelPercent);
        return {
          ...asset,
          levelPercent,
          temperatureC: read(tagIds?.temperature, asset.temperatureC),
          pressureBar: read(tagIds?.pressure, asset.pressureBar),
          status: levelPercent <= 10 ? 'critical' : levelPercent <= 20 ? 'low' : 'normal',
          quality: tagIds ? (values.get(tagIds.level)?.quality ?? 'STALE') : 'STALE',
        };
      }),
    [campaign.utilityAssets, values]
  );

  const eventTimeline = useMemo(
    () =>
      [...alarms, ...eventHistory]
        .filter(
          (alarm, index, all) =>
            all.findIndex(
              (candidate) => candidate.id === alarm.id && candidate.timestamp === alarm.timestamp
            ) === index
        )
        .sort((left, right) => right.timestamp - left.timestamp)
        .slice(0, 100),
    [alarms, eventHistory]
  );
  const alarmFloodCount = useMemo(
    () => eventTimeline.filter((alarm) => alarm.timestamp >= Date.now() - 60_000).length,
    [eventTimeline]
  );

  const selectedTagMachineId = useMemo(() => {
    if (!selectedMachineId) return null;
    const selectedKey = normalizeMachineId(selectedMachineId);
    return (
      Array.from(tagsByMachine.keys()).find(
        (machineId) => normalizeMachineId(machineId) === selectedKey
      ) ?? null
    );
  }, [selectedMachineId, tagsByMachine]);

  useEffect(() => {
    if (!selectedTagMachineId) return;
    setExpandedMachines((previous) => {
      if (previous.has(selectedTagMachineId)) return previous;
      const next = new Set(previous);
      next.add(selectedTagMachineId);
      return next;
    });
  }, [selectedTagMachineId]);

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

  const filteredTagIds = useMemo(() => new Set(filteredTags.map((t) => t.id)), [filteredTags]);

  // Group filter chips for every group that has tags, in a stable order
  const presentGroups = useMemo(() => {
    const seen = new Set(tags.map((t) => t.group));
    return (Object.keys(TAG_GROUP_ICONS) as TagGroup[]).filter((g) => seen.has(g));
  }, [tags]);

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
      if (config.pollInterval) setRestPollIntervalInput(String(config.pollInterval));
      if (config.brokerUrl) setMqttBrokerUrl(config.brokerUrl);
      if (config.topicPrefix) setMqttTopicPrefix(config.topicPrefix);
      if (config.proxyUrl) {
        if (config.type === 'websocket') setWebsocketUrl(config.proxyUrl);
        else setProxyUrl(config.proxyUrl);
      }
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

      setTrendData(await processTrendHistory(selectedTrendTags, historyResults));
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

  const loadEventHistory = useCallback(async () => {
    setEventHistoryLoading(true);
    try {
      const history = await getSCADAService().getAlarmHistory(
        Date.now() - 24 * 60 * 60 * 1000,
        Date.now(),
        100
      );
      setEventHistory(history);
    } catch {
      setEventHistory([]);
    } finally {
      setEventHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'events') void loadEventHistory();
  }, [activeTab, loadEventHistory]);

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

  const handleTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, currentTab: SCADATab) => {
      const currentIndex = SCADA_TAB_ORDER.indexOf(currentTab);
      let nextIndex: number | null = null;

      if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % SCADA_TAB_ORDER.length;
      if (event.key === 'ArrowLeft') {
        nextIndex = (currentIndex - 1 + SCADA_TAB_ORDER.length) % SCADA_TAB_ORDER.length;
      }
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = SCADA_TAB_ORDER.length - 1;
      if (nextIndex === null) return;

      event.preventDefault();
      const nextTab = SCADA_TAB_ORDER[nextIndex];
      setActiveTab(nextTab);
      requestAnimationFrame(() => document.getElementById(`scada-tab-button-${nextTab}`)?.focus());
    },
    []
  );

  // Format time for X-axis
  const formatXAxis = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString(locale === 'en' ? 'en-US' : locale, {
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

  const selectedTrendDefinitions = selectedTrendTags
    .map((tagId) => tags.find((tag) => tag.id === tagId))
    .filter((tag): tag is TagDefinition => tag !== undefined);
  const trendUnits = Array.from(
    new Set(selectedTrendDefinitions.map((tag) => tag.engUnit || 'value'))
  );

  const alarmStateLabel = (state: AlarmState): string => {
    const key = ALARM_STATE_LABEL_KEYS[state];
    return key ? t(key) : state;
  };

  if (!isOpen) return null;

  // Embedded mode: render content without fixed wrapper for use inside ContextSidebar
  if (embedded) {
    // Get first 8 machines with their tags for compact display
    const machineEntries = Array.from(tagsByMachine.entries())
      .sort(([leftId], [rightId]) => {
        if (leftId === selectedTagMachineId) return -1;
        if (rightId === selectedTagMachineId) return 1;
        return leftId.localeCompare(rightId);
      })
      .slice(0, 8);

    // If SCADA is disabled, show enable prompt
    if (!scadaEnabled) {
      return (
        <div className="p-4 space-y-4">
          <div className="text-center py-6">
            <Database className="w-12 h-12 mx-auto mb-3 text-slate-500" />
            <h3 className="text-sm font-bold text-white mb-2">{t('scadaDisabledTitle')}</h3>
            <p className="text-xs text-slate-300 mb-4">{t('scadaDisabledBody')}</p>
            <button
              onClick={handleToggleSCADA}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-lg transition-colors"
            >
              {t('enableScada')}
            </button>
          </div>
        </div>
      );
    }

    return (
      <>
        <div className="p-3 space-y-3 overflow-y-auto h-full">
          {/* Status Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={`w-2.5 h-2.5 rounded-full ${linkUp ? 'bg-green-500' : 'bg-red-500'}`}
                role="img"
                aria-label={linkUp ? t('telemetryConnected') : t('telemetryDisconnected')}
              />
              <span className="text-xs font-bold text-white">
                {mode === 'simulation' ? t('scadaSimulation') : t('scadaConnected')}
              </span>
              {mode === 'simulation' && (
                <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-cyan-300">
                  {t('simulatedBadge')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-cyan-400">
                {t('tagCount', { count: formatFixed(tags.length, 0) })}
              </span>
              <button
                onClick={() => setWorkspaceOpen(true)}
                className="inline-flex min-h-11 items-center gap-1 rounded bg-cyan-500/15 px-3 text-[9px] font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/25"
                title={t('openWorkspace')}
                aria-label={t('openWorkspace')}
              >
                <Maximize2 className="h-3 w-3" aria-hidden="true" />
                {t('workspaceButton')}
              </button>
              <button
                onClick={handleToggleSCADA}
                className="min-h-11 rounded px-2 text-[9px] text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-red-400"
                title={t('disableTelemetry')}
                aria-label={t('disableTelemetry')}
              >
                {t('disable')}
              </button>
            </div>
          </div>

          {/* Critical Alarms Banner */}
          {hasCritical && (
            <div className="flex items-center gap-2 p-2 bg-red-500/20 border border-red-500/50 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="text-xs text-red-400 font-medium">{t('criticalAlarmsActive')}</span>
            </div>
          )}

          {/* Compact Tabs */}
          <div className="flex gap-1" role="tablist" aria-label={t('embeddedTabsLabel')}>
            {(['tags', 'alarms'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                role="tab"
                aria-selected={activeTab === tab}
                id={`scada-embedded-tab-button-${tab}`}
                aria-controls={`scada-embedded-tab-${tab}`}
                className={`min-h-11 flex-1 px-2 rounded text-[10px] font-medium transition-colors ${
                  activeTab === tab
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                    : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50'
                }`}
              >
                {tab === 'tags' ? (
                  <>
                    <Database className="w-3 h-3 inline mr-1" aria-hidden="true" />
                    {t('tagsTabCount', { count: formatFixed(tags.length, 0) })}
                  </>
                ) : (
                  <>
                    <Bell className="w-3 h-3 inline mr-1" aria-hidden="true" />
                    {t('alarmsTabCount', { count: formatFixed(alarms.length, 0) })}
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
              aria-label={t('tagsListLabel')}
            >
              {machineEntries.length === 0 ? (
                <div className="text-center text-slate-400 py-6">
                  <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">{t('noTagsConfigured')}</p>
                </div>
              ) : (
                machineEntries.map(([machineId, machineTags]) => (
                  <div
                    key={machineId}
                    className={`rounded-lg border p-2 ${
                      machineId === selectedTagMachineId
                        ? 'border-cyan-400/70 bg-cyan-500/10'
                        : 'border-slate-700/30 bg-slate-800/40'
                    }`}
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-cyan-300">
                        {machineId}
                      </div>
                      {onFocusMachine && (
                        <button
                          type="button"
                          onClick={() => onFocusMachine(machineId)}
                          className="inline-flex min-h-11 items-center gap-1 rounded px-2 text-[9px] text-slate-300 hover:bg-slate-700/60 hover:text-white"
                          aria-label={t('locateMachine', { machine: machineId })}
                        >
                          <MapPin className="h-3 w-3" aria-hidden="true" />
                          {t('locate')}
                        </button>
                      )}
                    </div>
                    <div className="space-y-1">
                      {machineTags.slice(0, 4).map((tag) => {
                        const value = values.get(tag.id);
                        const displayValue = value ? formatValue(value, tag) : '---';
                        const isStale = value && Date.now() - value.timestamp > 5000;
                        return (
                          <div
                            key={tag.id}
                            className="flex items-center justify-between text-[10px]"
                          >
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
              aria-label={t('alarmsListLabel')}
            >
              {alarms.length === 0 ? (
                <div className="text-center text-slate-400 py-6">
                  <Check className="w-8 h-8 mx-auto mb-2 text-green-500/50" />
                  <p className="text-xs">{t('allSystemsNominal')}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{t('noActiveAlarms')}</p>
                </div>
              ) : (
                alarms.slice(0, 10).map((alarm) => {
                  const needsAck = alarm.state === 'UNACK' || alarm.state === 'RTN_UNACK';
                  return (
                    <div
                      key={alarm.id}
                      className={`p-2 rounded-lg border ${
                        needsAck
                          ? 'border-red-500/50 bg-red-500/10'
                          : 'border-slate-700/50 bg-slate-800/30'
                      } ${isInService(alarm) ? '' : 'opacity-60'}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${ALARM_PRIORITY_COLORS[alarm.priority] ?? 'bg-slate-600 text-white'}`}
                        >
                          {t('alarmPriority', { value: alarm.priority })}
                        </span>
                        {needsAck && (
                          <button
                            onClick={() => acknowledge(alarm.id)}
                            className="min-h-11 min-w-11 rounded bg-cyan-500/20 px-2 text-[9px] text-cyan-400 hover:bg-cyan-500/30"
                            aria-label={t('acknowledgeAlarm', { tag: alarm.tagName })}
                          >
                            {t('ack')}
                          </button>
                        )}
                      </div>
                      <div className="text-xs text-white font-medium">{alarm.tagName}</div>
                      <div className="text-[10px] text-slate-300">
                        {alarm.type === 'BAD_QUALITY' ? (
                          (alarm.condition ?? t('sourceQualityBad'))
                        ) : (
                          <>
                            {t('valueLabel')}{' '}
                            <span className="text-red-400">
                              {withUnit(alarm.value, 1, alarm.unit)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
        {workspaceOpen && (
          <SCADAPanel
            isOpen
            embedded={false}
            onClose={() => setWorkspaceOpen(false)}
            selectedMachineId={selectedMachineId}
            onFocusMachine={onFocusMachine}
          />
        )}
      </>
    );
  }

  const fullWorkspace = (
    <AnimatePresence>
      <motion.div
        ref={workspaceRef}
        initial={{ opacity: 0, x: reduceMotion ? 0 : 400 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: reduceMotion ? 0 : 400 }}
        role="dialog"
        aria-modal="true"
        aria-label={t('workspaceDialogLabel')}
        aria-describedby="scada-workspace-description"
        className="fixed inset-2 z-50 flex flex-col overflow-hidden rounded-xl border border-cyan-500/30 bg-slate-950/97 shadow-2xl backdrop-blur-xl sm:inset-5"
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-700/50">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div
                className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${linkUp ? 'bg-green-500' : 'bg-red-500'}`}
                aria-hidden="true"
              />
              <div>
                <h2 className="text-lg font-bold text-white">{t('workspaceTitle')}</h2>
                <p id="scada-workspace-description" className="text-xs text-slate-400">
                  {t('workspaceDescription')}
                </p>
              </div>
            </div>
            <button
              ref={closeButtonRef}
              onClick={onClose}
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded text-slate-300 hover:bg-slate-700/50 hover:text-white"
              aria-label={t('closePanel')}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300">
            <span>
              {t('modeLabel')}{' '}
              <span className="text-cyan-400">{t('modeName', { value: mode })}</span>
            </span>
            <span>
              {t('tagsLabel')} <span className="text-cyan-400">{formatFixed(tagCount, 0)}</span>
            </span>
            {hasCritical && (
              <span className="flex items-center gap-1 text-red-400">
                <AlertTriangle className="w-3 h-3" />
                {t('criticalAlarms')}
              </span>
            )}
            {selectedTagMachineId && (
              <span className="inline-flex items-center gap-1 rounded bg-cyan-500/15 px-2 py-1 text-cyan-300">
                <MapPin className="h-3 w-3" aria-hidden="true" />
                {t('sceneLinked', { machine: selectedTagMachineId })}
              </span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div
          className="flex overflow-x-auto border-b border-slate-700/50"
          role="tablist"
          aria-label={t('tabListLabel')}
        >
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            onKeyDown={(event) => handleTabKeyDown(event, 'overview')}
            role="tab"
            aria-selected={activeTab === 'overview'}
            aria-controls="scada-tab-overview"
            id="scada-tab-button-overview"
            tabIndex={activeTab === 'overview' ? 0 : -1}
            className={`min-h-11 min-w-28 flex-1 px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === 'overview'
                ? 'border-b-2 border-cyan-400 text-cyan-300'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Factory className="mr-2 inline h-4 w-4" aria-hidden="true" />
            {t('tabProcess')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tags')}
            onKeyDown={(event) => handleTabKeyDown(event, 'tags')}
            role="tab"
            aria-selected={activeTab === 'tags'}
            aria-controls="scada-tab-tags"
            id="scada-tab-button-tags"
            tabIndex={activeTab === 'tags' ? 0 : -1}
            className={`min-h-11 min-w-24 flex-1 px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === 'tags'
                ? 'text-cyan-400 border-b-2 border-cyan-400'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Database className="w-4 h-4 inline mr-2" aria-hidden="true" />
            {t('tabTags')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('alarms')}
            onKeyDown={(event) => handleTabKeyDown(event, 'alarms')}
            role="tab"
            aria-selected={activeTab === 'alarms'}
            aria-controls="scada-tab-alarms"
            id="scada-tab-button-alarms"
            tabIndex={activeTab === 'alarms' ? 0 : -1}
            className={`relative min-h-11 min-w-24 flex-1 px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === 'alarms'
                ? 'text-cyan-400 border-b-2 border-cyan-400'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Bell className="w-4 h-4 inline mr-2" aria-hidden="true" />
            {t('tabAlarms')}
            {summary.unacknowledged > 0 && (
              <span
                className="absolute top-1 right-2 bg-red-500 text-white text-xs rounded-full px-1.5"
                aria-label={t('unacknowledgedAlarmsAria', {
                  count: formatFixed(summary.unacknowledged, 0),
                  n: summary.unacknowledged,
                })}
              >
                {summary.unacknowledged}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('trends')}
            onKeyDown={(event) => handleTabKeyDown(event, 'trends')}
            role="tab"
            aria-selected={activeTab === 'trends'}
            aria-controls="scada-tab-trends"
            id="scada-tab-button-trends"
            tabIndex={activeTab === 'trends' ? 0 : -1}
            className={`min-h-11 min-w-24 flex-1 px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === 'trends'
                ? 'text-cyan-400 border-b-2 border-cyan-400'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <TrendingUp className="w-4 h-4 inline mr-2" aria-hidden="true" />
            {t('tabTrends')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('events')}
            onKeyDown={(event) => handleTabKeyDown(event, 'events')}
            role="tab"
            aria-selected={activeTab === 'events'}
            aria-controls="scada-tab-events"
            id="scada-tab-button-events"
            tabIndex={activeTab === 'events' ? 0 : -1}
            className={`min-h-11 min-w-24 flex-1 px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === 'events'
                ? 'border-b-2 border-cyan-400 text-cyan-300'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <ListChecks className="mr-2 inline h-4 w-4" aria-hidden="true" />
            {t('tabEvents')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('faults')}
            onKeyDown={(event) => handleTabKeyDown(event, 'faults')}
            role="tab"
            aria-selected={activeTab === 'faults'}
            aria-controls="scada-tab-faults"
            id="scada-tab-button-faults"
            tabIndex={activeTab === 'faults' ? 0 : -1}
            className={`min-h-11 min-w-32 flex-1 px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === 'faults'
                ? 'text-cyan-400 border-b-2 border-cyan-400'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <AlertTriangle className="w-4 h-4 inline mr-2" aria-hidden="true" />
            {t('tabSimulationLab')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            onKeyDown={(event) => handleTabKeyDown(event, 'settings')}
            role="tab"
            aria-selected={activeTab === 'settings'}
            aria-controls="scada-tab-settings"
            id="scada-tab-button-settings"
            tabIndex={activeTab === 'settings' ? 0 : -1}
            className={`min-h-11 min-w-28 flex-1 px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === 'settings'
                ? 'text-cyan-400 border-b-2 border-cyan-400'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Settings className="w-4 h-4 inline mr-2" aria-hidden="true" />
            {t('tabConnections')}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {/* Process Overview */}
          {activeTab === 'overview' && (
            <div
              className="h-full overflow-y-auto p-4"
              role="tabpanel"
              id="scada-tab-overview"
              aria-labelledby="scada-tab-button-overview"
              tabIndex={0}
            >
              {activeSafetyEvent && (
                <section
                  className={`mb-4 rounded-lg border p-3 ${
                    activeSafetyEvent.simulated
                      ? 'border-amber-500/50 bg-amber-500/10'
                      : 'border-red-500/50 bg-red-500/10'
                  }`}
                  aria-labelledby="scada-safety-interlock-heading"
                  role="status"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3
                      id="scada-safety-interlock-heading"
                      className="text-sm font-semibold text-white"
                    >
                      {activeSafetyEvent.simulated
                        ? t('simulatedSafetyState')
                        : t('facilitySafetyInterlock')}
                    </h3>
                    <span className="rounded border border-white/20 px-2 py-0.5 text-[10px] uppercase text-slate-200">
                      {activeSafetyEvent.stage}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-200">{activeSafetyEvent.cause}</p>
                  <p className="mt-1 text-xs text-slate-400">{activeSafetyEvent.response}</p>
                </section>
              )}

              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-700/60 bg-slate-900/70 p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-400">
                    {t('telemetry')}
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-white">
                    {formatFixed(tagCount, 0)}
                  </div>
                  <div className="text-xs text-slate-300">{t('configuredProcessTags')}</div>
                </div>
                <div className="rounded-lg border border-slate-700/60 bg-slate-900/70 p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-400">
                    {t('alarms')}
                  </div>
                  <div
                    className={`mt-1 text-2xl font-semibold ${
                      summary.unacknowledged > 0 ? 'text-amber-300' : 'text-green-300'
                    }`}
                  >
                    {summary.unacknowledged}
                  </div>
                  <div className="text-xs text-slate-300">{t('awaitingAcknowledgementLower')}</div>
                </div>
                <div className="rounded-lg border border-slate-700/60 bg-slate-900/70 p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-400">
                    {t('source')}
                  </div>
                  <div
                    className={`mt-1 text-base font-semibold ${capitalizeIn(locale)} text-cyan-300`}
                  >
                    {t('modeHeading', { value: mode })}
                  </div>
                  <div className="text-xs text-slate-300">
                    {mode === 'simulation'
                      ? t('localSimulatedTelemetry')
                      : t('configuredDataAdapter')}
                  </div>
                </div>
              </div>

              <section className="mb-4" aria-labelledby="scada-material-ledger-heading">
                <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h3
                      id="scada-material-ledger-heading"
                      className="text-sm font-semibold text-white"
                    >
                      {t('ledgerHeading')}
                    </h3>
                    <p className="text-xs text-slate-400">{t('ledgerBody')}</p>
                  </div>
                  <div
                    className={`rounded border px-2 py-1 text-[10px] ${
                      Math.abs(operationalTelemetry.balanceError) <= 0.01
                        ? 'border-emerald-500/40 text-emerald-200'
                        : 'border-amber-500/50 text-amber-200'
                    }`}
                  >
                    {t('balance', {
                      sign: operationalTelemetry.balanceError >= 0 ? '+' : '',
                      value: formatFixed(operationalTelemetry.balanceError, 2),
                    })}
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    [t('rawGrain'), operationalTelemetry.rawInventory, 't'],
                    [t('inProcess'), operationalTelemetry.inProcess, 't'],
                    [t('finishedGoods'), operationalTelemetry.finishedGoods, 't'],
                    [t('finalFlow'), operationalTelemetry.packerFlow, 't/h'],
                  ].map(([label, value, unit]) => (
                    <div
                      key={label as string}
                      className="rounded-lg border border-slate-700/60 bg-slate-950/35 p-2.5"
                    >
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">
                        {label}
                      </div>
                      <div className="mt-1 font-mono text-lg text-cyan-200">
                        {formatFixed(value as number, 2)}{' '}
                        <span className="text-xs text-slate-400">{unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 grid gap-2 text-xs text-slate-300 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded border border-slate-700/50 px-2.5 py-2">
                    {t('lastIntake', {
                      value: formatFixed(operationalTelemetry.lastReceiving, 2),
                    })}
                  </div>
                  <div className="rounded border border-slate-700/50 px-2.5 py-2">
                    {t('lastDispatch', {
                      value: formatFixed(operationalTelemetry.lastShipping, 2),
                    })}
                  </div>
                  <div className="rounded border border-slate-700/50 px-2.5 py-2">
                    {t('maintenanceStock', {
                      count: formatFixed(Math.round(operationalTelemetry.partsStock), 0),
                    })}
                  </div>
                  <div
                    className={`rounded border px-2.5 py-2 ${
                      operationalTelemetry.shippingReleased
                        ? 'border-emerald-500/40 text-emerald-200'
                        : 'border-amber-500/50 text-amber-200'
                    }`}
                    role="status"
                  >
                    {operationalTelemetry.shippingReleased
                      ? t('dispatchQualityReleased')
                      : t('dispatchQualityHold')}
                  </div>
                </div>
                <div className="mt-2 grid gap-2 text-xs text-slate-300 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded border border-slate-700/50 px-2.5 py-2">
                    {t('qualityHolds', {
                      count: formatFixed(Math.round(operationalTelemetry.activeQualityHolds), 0),
                    })}
                  </div>
                  <div className="rounded border border-slate-700/50 px-2.5 py-2">
                    {t('recalled', {
                      count: formatFixed(Math.round(operationalTelemetry.recalledBatches), 0),
                    })}
                  </div>
                  <div className="rounded border border-slate-700/50 px-2.5 py-2">
                    {t('openWorkOrders', {
                      count: formatFixed(Math.round(operationalTelemetry.openWorkOrders), 0),
                    })}
                  </div>
                  <div className="rounded border border-slate-700/50 px-2.5 py-2">
                    {t('maintenanceDowntime', {
                      count: formatFixed(Math.round(operationalTelemetry.maintenanceDowntime), 0),
                    })}
                  </div>
                </div>
                <div className="mt-2 grid gap-2 text-[10px] text-slate-400 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded border border-cyan-500/20 bg-cyan-950/10 px-2.5 py-2">
                    <div className="uppercase tracking-wide">{t('latestBatch')}</div>
                    <div className="mt-1 font-mono text-cyan-200">
                      {materialProvenance.latestBatch?.id ?? t('awaitingProduction')}
                    </div>
                    {materialProvenance.latestBatch && (
                      <div className={`mt-0.5 ${capitalizeIn(locale)}`}>
                        {t('batchDisposition', {
                          value: materialProvenance.latestBatch.disposition,
                        })}
                        , {formatFixed(materialProvenance.latestBatch.availableKg, 1)} kg
                      </div>
                    )}
                  </div>
                  <div className="rounded border border-cyan-500/20 bg-cyan-950/10 px-2.5 py-2">
                    <div className="uppercase tracking-wide">{t('latestSourceLot')}</div>
                    <div className="mt-1 font-mono text-cyan-200">
                      {materialProvenance.latestLot?.id ?? t('openingInventory')}
                    </div>
                    <div className="mt-0.5">
                      {materialProvenance.latestManifest?.id ?? t('noDockManifest')}
                    </div>
                  </div>
                  <div className="rounded border border-orange-500/20 bg-orange-950/10 px-2.5 py-2">
                    <div className="uppercase tracking-wide">{t('maintenanceProvenance')}</div>
                    <div className="mt-1 font-mono text-orange-200">
                      {latestOpenWorkOrder?.id ?? t('noOpenWorkOrder')}
                    </div>
                    {latestOpenWorkOrder && (
                      <div className={`mt-0.5 ${capitalizeIn(locale)}`}>
                        {t('workOrderPhase', { phase: latestOpenWorkOrder.phase })}
                      </div>
                    )}
                  </div>
                  <div className="rounded border border-violet-500/20 bg-violet-950/10 px-2.5 py-2">
                    <div className="uppercase tracking-wide">{t('qualityProvenance')}</div>
                    <div className="mt-1 font-mono text-violet-200">
                      {latestQualityRecord?.id ?? t('noDispositionAction')}
                    </div>
                    {latestQualityRecord && (
                      <div className={`mt-0.5 ${capitalizeIn(locale)}`}>
                        {t('qualityAction', { value: latestQualityRecord.action })},{' '}
                        {latestQualityRecord.referenceId}
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <section className="mb-3 rounded-lg border border-cyan-500/25 bg-cyan-950/10 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                      <BriefcaseBusiness className="h-4 w-4 text-cyan-300" aria-hidden="true" />
                      {t('operationsCommitments')}
                    </h3>
                    <p className="text-xs text-slate-400">{t('operationsCommitmentsBody')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('events')}
                    className="min-h-11 rounded border border-cyan-500/30 px-3 text-xs text-cyan-200 hover:bg-cyan-500/10"
                  >
                    {t('openLogbook')}
                  </button>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {(() => {
                    const activeOrder =
                      campaign.orders.find((order) => order.id === campaign.activeOrderId) ??
                      campaign.orders.find((order) => order.status !== 'fulfilled');
                    const activeIncidents = campaign.incidents.filter(
                      (incident) => incident.phase !== 'resolved'
                    );
                    const progress = activeOrder
                      ? Math.min(
                          100,
                          (activeOrder.shippedKg / Math.max(1, activeOrder.requiredKg)) * 100
                        )
                      : 100;
                    return (
                      <>
                        <div className="rounded border border-slate-700/60 bg-slate-950/35 p-2.5">
                          <div className="text-[10px] uppercase text-slate-400">
                            {t('activeOrder')}
                          </div>
                          <div className="mt-1 truncate text-xs font-semibold text-cyan-200">
                            {activeOrder?.customer ?? t('allCommitmentsComplete')}
                          </div>
                          <div className="mt-1 font-mono text-[10px] text-slate-400">
                            {t('percentDispatched', { percent: formatFixed(progress, 0) })}
                          </div>
                        </div>
                        <div className="rounded border border-slate-700/60 bg-slate-950/35 p-2.5">
                          <div className="text-[10px] uppercase text-slate-400">
                            {t('executionState')}
                          </div>
                          <div className="mt-1 font-mono text-xs text-slate-200">
                            {t('percentSetpoint', {
                              percent: formatFixed(campaign.execution.lineSetpointPercent, 0),
                            })}
                          </div>
                          <div
                            className={`mt-1 text-[10px] ${capitalizeIn(locale)} text-slate-400`}
                          >
                            {t('executionStage', { value: campaign.execution.stage })}
                          </div>
                        </div>
                        <div className="rounded border border-slate-700/60 bg-slate-950/35 p-2.5">
                          <div className="text-[10px] uppercase text-slate-400">
                            {t('activeIncidents')}
                          </div>
                          <div
                            className={`mt-1 font-mono text-xs ${activeIncidents.length ? 'text-amber-200' : 'text-emerald-200'}`}
                          >
                            {activeIncidents.length}
                          </div>
                          <div className="mt-1 truncate text-[10px] text-slate-400">
                            {activeIncidents[0]
                              ? incidentTitle(activeIncidents[0])
                              : t('noCampaignIncident')}
                          </div>
                        </div>
                        <div className="rounded border border-slate-700/60 bg-slate-950/35 p-2.5">
                          <div className="text-[10px] uppercase text-slate-400">
                            {t('topConstraint')}
                          </div>
                          <div className="mt-1 truncate text-xs text-amber-100">
                            {campaign.constraints[0]?.label ?? t('noActiveConstraint')}
                          </div>
                          <div className="mt-1 truncate text-[10px] text-slate-400">
                            {campaign.constraints[0]?.detail ?? t('planUnconstrained')}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <div className="rounded border border-slate-700/60 bg-slate-950/35 p-2.5">
                    <div className="text-[10px] uppercase text-slate-400">{t('recipeRoute')}</div>
                    <div className="mt-1 text-xs font-semibold text-cyan-200">
                      {campaign.execution.sourceMaterial
                        ? t('sourceMaterial', { value: campaign.execution.sourceMaterial })
                        : t('noSource')}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {t('toProduct', {
                        product: campaign.execution.finishedMaterial
                          ? t('productName', { value: campaign.execution.finishedMaterial })
                          : t('noProduct'),
                      })}
                    </div>
                  </div>
                  <div className="rounded border border-slate-700/60 bg-slate-950/35 p-2.5">
                    <div className="text-[10px] uppercase text-slate-400">{t('qualityGate')}</div>
                    <div
                      className={`mt-1 text-xs font-semibold ${campaign.execution.qualityReleased ? 'text-emerald-200' : 'text-amber-200'}`}
                    >
                      {campaign.execution.qualityReleased ? t('released') : t('held')}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {t('kgDispatchable', {
                        kg: formatFixed(campaign.execution.releasedFinishedKg, 0),
                      })}
                    </div>
                  </div>
                  <div className="rounded border border-slate-700/60 bg-slate-950/35 p-2.5">
                    <div className="text-[10px] uppercase text-slate-400">{t('truckLoad')}</div>
                    <div className="mt-1 font-mono text-xs font-semibold text-cyan-200">
                      {formatFixed(campaign.execution.dispatchLoad.loadedKg, 0)} /{' '}
                      {formatFixed(campaign.execution.dispatchLoad.capacityKg, 0)} kg
                    </div>
                    <div
                      className={`mt-1 truncate text-[10px] ${capitalizeIn(locale)} text-slate-400`}
                    >
                      {dispatchBlockText(campaign.execution.dispatchLoad) ??
                        t('dispatchStatus', { value: campaign.execution.dispatchLoad.status })}
                    </div>
                  </div>
                </div>
              </section>

              <section className="mb-3 rounded-lg border border-emerald-500/20 bg-emerald-950/10 p-3">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Gauge className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                    {t('utilityHeading')}
                  </h3>
                  <p className="text-xs text-slate-400">{t('utilityBody')}</p>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  {utilityTelemetry.map((asset) => (
                    <article
                      key={asset.id}
                      className="rounded border border-slate-700/60 bg-slate-950/35 p-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-[10px] font-semibold text-slate-200">
                          {asset.label}
                        </div>
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${
                            asset.status === 'critical'
                              ? 'bg-rose-400'
                              : asset.status === 'low'
                                ? 'bg-amber-400'
                                : 'bg-emerald-400'
                          }`}
                          role="img"
                          aria-label={t('assetLevelAria', {
                            status: asset.status,
                            quality: asset.quality.toLowerCase(),
                          })}
                          title={t('assetSignalTitle', { quality: asset.quality })}
                        />
                      </div>
                      <div className="mt-1 font-mono text-sm font-semibold text-white">
                        {formatFixed(asset.levelPercent, 1)}%
                      </div>
                      <div className="mt-1 font-mono text-[10px] text-slate-400">
                        {formatFixed(asset.temperatureC, 1)} °C ·{' '}
                        {formatFixed(asset.pressureBar, 2)} bar
                      </div>
                      <div className="mt-1 truncate text-[9px] text-slate-500">
                        {asset.contents}
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <div className="mb-2 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">{t('grainFlowHeading')}</h3>
                  <p className="text-xs text-slate-400">{t('grainFlowBody')}</p>
                </div>
                <div className="rounded border border-slate-700/60 px-2 py-1 text-[10px] text-slate-300">
                  {t('rearIntakeToFrontDispatch')}
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-5">
                {processStages.map((stage, stageIndex) => {
                  const stageAlarms = alarms.filter(
                    (alarm) => alarm.machineId && stage.machineIds.includes(alarm.machineId)
                  );
                  const poorQualityCount = stage.machineIds.reduce((total, machineId) => {
                    const machineTags = tagsByMachine.get(machineId) ?? [];
                    return (
                      total +
                      machineTags.filter((tag) => {
                        const value = values.get(tag.id);
                        return value?.quality === 'BAD' || value?.quality === 'STALE';
                      }).length
                    );
                  }, 0);
                  const stageState = stageAlarms.some((alarm) => alarm.priority === 'CRITICAL')
                    ? 'critical'
                    : stageAlarms.length > 0 || poorQualityCount > 0
                      ? 'attention'
                      : 'nominal';

                  return (
                    <section
                      key={stage.id}
                      className={`relative rounded-xl border p-3 ${
                        stageState === 'critical'
                          ? 'border-red-500/60 bg-red-500/10'
                          : stageState === 'attention'
                            ? 'border-amber-500/50 bg-amber-500/10'
                            : 'border-emerald-500/35 bg-emerald-500/5'
                      }`}
                    >
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-white">
                            {formatFixed(stageIndex + 1, 0)}. {t(stage.labelKey)}
                          </div>
                          <div className="text-[11px] text-slate-300">
                            {t(stage.descriptionKey)}
                          </div>
                        </div>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                            stageState === 'critical'
                              ? 'bg-red-500/25 text-red-200'
                              : stageState === 'attention'
                                ? 'bg-amber-500/20 text-amber-200'
                                : 'bg-emerald-500/15 text-emerald-200'
                          }`}
                        >
                          {t(STAGE_STATE_LABEL_KEYS[stageState])}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {stage.machineIds.map((machineId) => {
                          const isSelected = machineId === selectedTagMachineId;
                          return (
                            <button
                              type="button"
                              key={machineId}
                              onClick={() => onFocusMachine?.(machineId)}
                              disabled={!onFocusMachine}
                              aria-pressed={isSelected}
                              className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs transition-colors ${
                                isSelected
                                  ? 'bg-cyan-500/25 text-cyan-100 ring-1 ring-cyan-400/60'
                                  : 'bg-slate-950/35 text-slate-200 hover:bg-slate-800/80'
                              } disabled:cursor-default`}
                            >
                              <span className="font-mono">{machineId}</span>
                              <MapPin className="h-3 w-3 text-slate-400" aria-hidden="true" />
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          )}

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
                    {t('searchTags')}
                  </label>
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    id="scada-tag-search"
                    type="text"
                    placeholder={t('searchTagsPlaceholder')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded text-sm text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/30"
                  />
                </div>
                <div
                  className="flex gap-2 overflow-x-auto pb-1"
                  role="group"
                  aria-label={t('filterTagsByGroup')}
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
                    {t('allGroups')}
                  </button>
                  {presentGroups.map((group) => (
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
                  const filteredMachineTags = machineTags.filter((t) => filteredTagIds.has(t.id));
                  if (filteredMachineTags.length === 0) return null;

                  const isExpanded = expandedMachines.has(machineId);

                  return (
                    <div
                      key={machineId}
                      className={`overflow-hidden rounded-lg border ${
                        machineId === selectedTagMachineId
                          ? 'border-cyan-400/60 bg-cyan-500/10'
                          : 'border-transparent bg-slate-800/30'
                      }`}
                    >
                      <div className="flex items-center">
                        <button
                          onClick={() => toggleMachine(machineId)}
                          aria-expanded={isExpanded}
                          aria-controls={`machine-tags-${machineId}`}
                          className="flex min-w-0 flex-1 items-center justify-between px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700/30"
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
                            {t('tagCount', { count: formatFixed(filteredMachineTags.length, 0) })}
                          </span>
                        </button>
                        {onFocusMachine && (
                          <button
                            type="button"
                            onClick={() => onFocusMachine(machineId)}
                            className="mr-2 rounded p-2 text-slate-300 hover:bg-slate-700/60 hover:text-cyan-300"
                            aria-label={t('locateMachine', { machine: machineId })}
                          >
                            <MapPin className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                      </div>

                      {isExpanded && (
                        <div className="px-2 pb-2 space-y-1" id={`machine-tags-${machineId}`}>
                          {filteredMachineTags.map((tag) => {
                            const value = values.get(tag.id);
                            const alarmState = value ? isInAlarm(tag, value) : null;
                            const writable = tag.accessMode === 'READ_WRITE';
                            const follower = writable
                              ? tags.find(
                                  (candidate) => candidate.simulation?.setpointTagId === tag.id
                                )
                              : undefined;

                            const row = (
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
                                        role="img"
                                        aria-label={t('quality', { quality: value.quality })}
                                      />
                                    </>
                                  )}
                                </div>
                              </div>
                            );

                            if (!writable) return row;
                            return (
                              <div key={tag.id}>
                                {row}
                                <SCADASetpointControl
                                  tag={tag}
                                  setpoint={value}
                                  readingTag={follower}
                                  reading={follower ? values.get(follower.id) : undefined}
                                  mode={mode}
                                  isConnected={isConnected}
                                  writeSetpoint={writeSetpoint}
                                />
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
                  {t('exportCsv')}
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
                  {t('exportJson')}
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
                    <div className="text-xs text-slate-400">{t('summaryTotal')}</div>
                  </div>
                  <div className="bg-red-500/20 rounded p-2">
                    <div className="text-2xl font-bold text-red-400">{summary.critical}</div>
                    <div className="text-xs text-red-300">{t('summaryCritical')}</div>
                  </div>
                  <div className="bg-orange-500/20 rounded p-2">
                    <div className="text-2xl font-bold text-orange-400">{summary.high}</div>
                    <div className="text-xs text-orange-300">{t('summaryHigh')}</div>
                  </div>
                  <div className="bg-yellow-500/20 rounded p-2">
                    <div className="text-2xl font-bold text-yellow-400">
                      {summary.unacknowledged}
                    </div>
                    <div className="text-xs text-yellow-300">{t('summaryUnack')}</div>
                  </div>
                </div>
                <div
                  className={`mt-2 rounded border px-3 py-2 text-xs ${
                    alarmFloodCount >= 10
                      ? 'border-red-500/60 bg-red-500/15 text-red-200'
                      : 'border-slate-700 bg-slate-800/40 text-slate-300'
                  }`}
                  role={alarmFloodCount >= 10 ? 'alert' : 'status'}
                >
                  {t('floodMonitor', {
                    count: formatFixed(alarmFloodCount, 0),
                    plural: alarmFloodCount !== 1,
                    reached: alarmFloodCount >= 10,
                  })}
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <div>
                    <label
                      htmlFor="scada-alarm-source"
                      className="mb-1 block text-xs text-slate-300"
                    >
                      {t('controlIdentity')}
                    </label>
                    <input
                      id="scada-alarm-source"
                      value={controlIdentity}
                      onChange={(event) => setControlIdentity(event.target.value)}
                      className="min-h-11 w-full rounded border border-slate-700 bg-slate-900/70 px-3 text-sm text-white focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/30"
                    />
                  </div>
                  <div>
                    <label htmlFor="scada-alarm-note" className="mb-1 block text-xs text-slate-300">
                      {t('controlNote')}
                    </label>
                    <input
                      id="scada-alarm-note"
                      value={alarmNote}
                      onChange={(event) => setAlarmNote(event.target.value)}
                      placeholder={t('controlNotePlaceholder')}
                      className="min-h-11 w-full rounded border border-slate-700 bg-slate-900/70 px-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/30"
                    />
                  </div>
                </div>
              </div>

              {/* Alarm list */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {alarms.length === 0 ? (
                  <div className="text-center text-slate-400 py-8">
                    <Check className="w-12 h-12 mx-auto mb-2 text-green-500/50" />
                    {t('noActiveAlarms')}
                  </div>
                ) : (
                  alarms.map((alarm) => (
                    <div
                      key={alarm.id}
                      className={`p-3 rounded-lg border ${
                        alarm.state === 'UNACK' || alarm.state === 'RTN_UNACK'
                          ? 'border-red-500/50 bg-red-500/10'
                          : 'border-slate-700/50 bg-slate-800/30'
                      } ${isInService(alarm) ? '' : 'opacity-60'}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-xs ${ALARM_PRIORITY_COLORS[alarm.priority] ?? 'bg-slate-600 text-white'}`}
                          >
                            {t('alarmPriority', { value: alarm.priority })}
                          </span>
                          <span className="text-xs text-slate-400">{alarm.type}</span>
                          <span className="rounded border border-slate-600 px-1.5 py-0.5 text-[10px] text-slate-300">
                            {alarmStateLabel(alarm.state)}
                          </span>
                          {alarm.disposition && alarm.disposition !== 'IN_SERVICE' && (
                            <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] text-violet-200">
                              {t('alarmDisposition', { value: alarm.disposition })}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap justify-end gap-1">
                          {(alarm.state === 'UNACK' || alarm.state === 'RTN_UNACK') && (
                            <button
                              onClick={() => {
                                acknowledge(
                                  alarm.id,
                                  controlIdentity.trim() || defaultControlIdentity(),
                                  alarmNote
                                );
                                if (alarmNote.trim()) setAlarmNote('');
                              }}
                              className="min-h-11 rounded bg-cyan-500/20 px-3 text-xs text-cyan-300 hover:bg-cyan-500/30"
                              aria-label={t('acknowledgeAlarm', { tag: alarm.tagName })}
                            >
                              {t('ack')}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={!alarmNote.trim()}
                            aria-label={t('shelveAria', { tag: alarm.tagName })}
                            title={alarmNote.trim() ? undefined : t('enterReasonFirst')}
                            aria-describedby={alarmNote.trim() ? undefined : 'scada-alarm-note'}
                            onClick={() => {
                              shelve(
                                alarm.tagId,
                                controlIdentity.trim() || defaultControlIdentity(),
                                alarmNote.trim(),
                                15 * 60 * 1000
                              );
                              setAlarmNote('');
                            }}
                            className="min-h-11 rounded bg-amber-500/20 px-3 text-xs text-amber-200 hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {t('shelve15')}
                          </button>
                          <button
                            type="button"
                            disabled={!alarmNote.trim()}
                            aria-label={t('suppressAria', { tag: alarm.tagName })}
                            title={alarmNote.trim() ? undefined : t('enterReasonFirst')}
                            aria-describedby={alarmNote.trim() ? undefined : 'scada-alarm-note'}
                            onClick={() => {
                              suppress(
                                alarm.tagId,
                                controlIdentity.trim() || defaultControlIdentity(),
                                alarmNote.trim(),
                                15 * 60 * 1000
                              );
                              setAlarmNote('');
                            }}
                            className="min-h-11 rounded bg-violet-500/20 px-3 text-xs text-violet-200 hover:bg-violet-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {t('suppress15')}
                          </button>
                          <button
                            type="button"
                            disabled={!alarmNote.trim()}
                            aria-label={t('outOfServiceAria', { tag: alarm.tagName })}
                            title={alarmNote.trim() ? undefined : t('enterReasonFirst')}
                            aria-describedby={alarmNote.trim() ? undefined : 'scada-alarm-note'}
                            onClick={() => {
                              takeOutOfService(
                                alarm.tagId,
                                controlIdentity.trim() || defaultControlIdentity(),
                                alarmNote.trim()
                              );
                              setAlarmNote('');
                            }}
                            className="min-h-11 rounded bg-slate-700 px-3 text-xs text-slate-200 hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {t('outOfService')}
                          </button>
                        </div>
                      </div>
                      <div className="mt-2">
                        <div className="text-sm text-white font-medium">{alarm.tagName}</div>
                        <div className="text-xs text-slate-300 mt-1">
                          {alarm.type === 'BAD_QUALITY'
                            ? `${alarm.condition ?? t('sourceQualityBad')}.`
                            : t('conditionValue', {
                                condition: alarm.condition ?? alarm.type,
                                value: withUnit(alarm.value, 2, alarm.unit),
                              })}
                        </div>
                        <div className="mt-1 grid gap-x-4 gap-y-1 text-xs text-slate-400 sm:grid-cols-2">
                          <span>
                            {t('sourceField', { source: alarm.machineId ?? alarm.tagId })}
                          </span>
                          <span>{t('quality', { quality: alarm.quality ?? 'UNCERTAIN' })}</span>
                          <span>
                            {t('firstField', {
                              time: new Date(alarm.timestamp).toLocaleString(dateLocale),
                            })}
                          </span>
                          <span>
                            {t('lastField', {
                              time: new Date(
                                alarm.lastOccurrenceAt ?? alarm.timestamp
                              ).toLocaleString(dateLocale),
                            })}
                          </span>
                          <span>
                            {t('countField', {
                              count: formatFixed(alarm.occurrenceCount ?? 1, 0),
                            })}
                          </span>
                          <span>
                            {alarm.acknowledgedBy
                              ? t('acknowledgedBy', { who: alarm.acknowledgedBy })
                              : t('awaitingAcknowledgement')}
                          </span>
                        </div>
                        {alarm.acknowledgementNote && (
                          <p className="mt-2 rounded bg-slate-900/60 px-2 py-1 text-xs text-slate-300">
                            {t('noteField', { note: alarm.acknowledgementNote })}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )}
                {suppressed.length > 0 && (
                  <section
                    aria-labelledby="suppressed-alarm-heading"
                    className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"
                  >
                    <h3
                      id="suppressed-alarm-heading"
                      className="text-sm font-semibold text-amber-100"
                    >
                      {t('suppressedHeading')}
                    </h3>
                    <ul className="mt-2 space-y-2">
                      {suppressed.map((entry) => (
                        <li
                          key={entry.tagId}
                          className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300"
                        >
                          <span>
                            {t('suppressedEntry', {
                              tag: entry.tagId,
                              disposition: t('alarmDisposition', { value: entry.disposition }),
                              who: entry.suppressedBy,
                              reason: entry.reason,
                            })}
                            {entry.expiresAt
                              ? t('suppressedUntil', {
                                  time: new Date(entry.expiresAt).toLocaleTimeString(dateLocale),
                                })
                              : ''}
                          </span>
                          <button
                            type="button"
                            onClick={() => unsuppress(entry.tagId)}
                            className="min-h-11 rounded bg-violet-500/20 px-3 text-violet-200 hover:bg-violet-500/30"
                          >
                            {t('restoreToService')}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>

              {/* Acknowledge all button */}
              {summary.unacknowledged > 0 && (
                <div className="p-3 border-t border-slate-700/50">
                  <button
                    onClick={() => {
                      acknowledgeAll(controlIdentity.trim() || defaultControlIdentity(), alarmNote);
                      if (alarmNote.trim()) setAlarmNote('');
                    }}
                    className="min-h-11 w-full rounded bg-cyan-500/20 px-4 text-sm text-cyan-400 hover:bg-cyan-500/30"
                  >
                    {t('acknowledgeAll', { count: formatFixed(summary.unacknowledged, 0) })}
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
              {campaign.incidents.some((incident) => incident.phase !== 'resolved') && (
                <div
                  className="border-b border-amber-500/25 bg-amber-950/20 px-3 py-2"
                  aria-label={t('trendAnnotationsLabel')}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-amber-200">
                      {t('activeAnnotations')}
                    </span>
                    {campaign.incidents
                      .filter((incident) => incident.phase !== 'resolved')
                      .slice(-4)
                      .map((incident) => (
                        <button
                          key={incident.id}
                          type="button"
                          onClick={() => setActiveTab('events')}
                          className="min-h-8 rounded border border-amber-500/30 px-2 text-[10px] text-amber-100 hover:bg-amber-500/10"
                          title={t('incidentTitle', {
                            phase: incident.phase,
                            description: incidentDescription(incident),
                          })}
                        >
                          {t('incidentChip', {
                            minute: formatFixed(Math.round(incident.startedAtMinute), 0),
                            title: incidentTitle(incident),
                          })}
                        </button>
                      ))}
                  </div>
                </div>
              )}
              {/* Trend Controls */}
              <div className="p-3 border-b border-slate-700/50 space-y-3">
                {/* Duration selector */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-300" aria-hidden="true" />
                    <span className="text-xs text-slate-300">{t('duration')}</span>
                  </div>
                  <div className="flex gap-1" role="group" aria-label={t('selectTrendDuration')}>
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

                {/* View and update controls */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-slate-300" aria-live="polite">
                    {t('tagsSelected', { count: formatFixed(selectedTrendTags.length, 0) })}
                  </span>
                  <div className="flex flex-wrap items-center gap-1">
                    <div
                      className="flex rounded bg-slate-800/60 p-0.5"
                      role="group"
                      aria-label={t('trendView')}
                    >
                      {(['chart', 'table'] as const).map((view) => (
                        <button
                          key={view}
                          type="button"
                          onClick={() => setTrendView(view)}
                          aria-pressed={trendView === view}
                          className={`min-h-8 rounded px-2 text-xs ${capitalizeIn(locale)} ${
                            trendView === view
                              ? 'bg-cyan-500/20 text-cyan-300'
                              : 'text-slate-300 hover:text-white'
                          }`}
                        >
                          {view === 'chart' ? t('viewChart') : t('viewTable')}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => void loadTrendData()}
                      disabled={selectedTrendTags.length === 0}
                      className="inline-flex min-h-8 items-center gap-1 rounded bg-slate-800/60 px-2 text-xs text-slate-200 hover:bg-slate-700/70 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden="true" />
                      {t('refresh')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void exportToCSV(selectedTrendTags, trendDuration)}
                      disabled={selectedTrendTags.length === 0}
                      className="inline-flex min-h-8 items-center gap-1 rounded bg-slate-800/60 px-2 text-xs text-slate-200 hover:bg-slate-700/70 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Download className="h-3 w-3" aria-hidden="true" />
                      CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => setTrendPaused(!trendPaused)}
                      aria-pressed={trendPaused}
                      className={`inline-flex min-h-8 items-center gap-1 rounded px-3 text-xs ${
                        trendPaused
                          ? 'bg-green-500/20 text-green-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {trendPaused ? (
                        <>
                          <Play className="w-3 h-3" aria-hidden="true" />
                          {t('resume')}
                        </>
                      ) : (
                        <>
                          <Pause className="w-3 h-3" aria-hidden="true" />
                          {t('pause')}
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400">{t('trendFootnote')}</p>
              </div>

              {/* Chart Area */}
              <div className="flex-1 p-3 min-h-0">
                {selectedTrendTags.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400">
                    <TrendingUp className="w-12 h-12 mb-3 opacity-50" aria-hidden="true" />
                    <p className="text-sm">{t('selectTagsPrompt')}</p>
                    <p className="text-xs mt-1">{t('upToSixTags')}</p>
                  </div>
                ) : trendView === 'chart' ? (
                  <div className="h-full" aria-hidden="true">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={trendData}
                        margin={{ top: 5, right: 16, left: 0, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis
                          dataKey="timestamp"
                          tickFormatter={formatXAxis}
                          stroke="#94a3b8"
                          tick={{ fontSize: 10 }}
                          interval="preserveStartEnd"
                        />
                        {trendUnits.map((unit, unitIndex) => (
                          <YAxis
                            key={unit}
                            yAxisId={unit}
                            orientation={unitIndex % 2 === 0 ? 'left' : 'right'}
                            stroke={TREND_COLORS[unitIndex % TREND_COLORS.length]}
                            tick={{ fontSize: 9 }}
                            width={52}
                            label={{
                              value: unit,
                              angle: -90,
                              position: unitIndex % 2 === 0 ? 'insideLeft' : 'insideRight',
                              fontSize: 9,
                            }}
                          />
                        ))}
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#1e293b',
                            border: '1px solid #334155',
                            borderRadius: '8px',
                            fontSize: '12px',
                          }}
                          labelStyle={{ color: '#e2e8f0' }}
                          itemStyle={{ color: '#cbd5e1' }}
                          labelFormatter={(ts) => new Date(ts).toLocaleTimeString(dateLocale)}
                          formatter={(value) => [
                            typeof value === 'number' ? formatFixed(value, 2) : String(value ?? ''),
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
                            yAxisId={tags.find((tag) => tag.id === tagId)?.engUnit || 'value'}
                            stroke={TREND_COLORS[idx % TREND_COLORS.length]}
                            strokeWidth={2}
                            dot={false}
                            connectNulls={false}
                            isAnimationActive={false}
                          />
                        ))}
                        <Brush
                          dataKey="timestamp"
                          height={20}
                          stroke="#06b6d4"
                          tickFormatter={formatXAxis}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-full overflow-auto rounded border border-slate-700/60">
                    <table className="w-full border-collapse text-left text-xs text-slate-200">
                      <caption className="sr-only">{t('trendTableCaption')}</caption>
                      <thead className="sticky top-0 z-10 bg-slate-900">
                        <tr>
                          <th scope="col" className="border-b border-slate-700 px-2 py-2">
                            {t('time')}
                          </th>
                          {selectedTrendDefinitions.map((tag) => (
                            <th
                              key={tag.id}
                              scope="col"
                              className="border-b border-slate-700 px-2 py-2"
                            >
                              {tag.name}
                              <span className="block font-normal text-slate-400">
                                {tag.engUnit || t('valueUnit')}
                              </span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {trendData
                          .slice(-200)
                          .reverse()
                          .map((row) => (
                            <tr key={row.timestamp} className="odd:bg-slate-800/30">
                              <th
                                scope="row"
                                className="whitespace-nowrap border-b border-slate-800 px-2 py-1.5 font-normal"
                              >
                                {new Date(row.timestamp).toLocaleTimeString(dateLocale)}
                              </th>
                              {selectedTrendDefinitions.map((tag) => {
                                const quality = row[`${tag.id}${TREND_QUALITY_SUFFIX}`] ?? 'STALE';
                                const sample = row[tag.id];
                                return (
                                  <td
                                    key={tag.id}
                                    className="border-b border-slate-800 px-2 py-1.5"
                                  >
                                    <span className="font-mono">
                                      {typeof sample === 'number'
                                        ? formatFixed(sample, 2)
                                        : t('gap')}
                                    </span>
                                    <span className="ml-2 text-[10px] text-slate-400">
                                      {quality}
                                    </span>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Tag Selector */}
              <div className="border-t border-slate-700/50 max-h-[200px] flex flex-col">
                <div className="p-2 border-b border-slate-700/50">
                  <div className="relative">
                    <label htmlFor="trend-tag-search" className="sr-only">
                      {t('searchTagsToAdd')}
                    </label>
                    <Search
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      id="trend-tag-search"
                      type="text"
                      placeholder={t('searchTagsToAddPlaceholder')}
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
                        aria-label={t('removeFromTrend', { tag: getTagShortName(tagId) })}
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
                        data-testid="scada-trend-tag-option"
                        data-tag-id={tag.id}
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
                          <span className="text-slate-400 ml-2">{formatValue(value, tag)}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Events and alarm audit trail */}
          {activeTab === 'events' && (
            <div
              className="h-full flex flex-col"
              role="tabpanel"
              id="scada-tab-events"
              aria-labelledby="scada-tab-button-events"
              tabIndex={0}
            >
              <div className="flex items-center justify-between gap-3 border-b border-slate-700/50 p-3">
                <div>
                  <h3 className="text-sm font-medium text-white">{t('eventHistoryHeading')}</h3>
                  <p className="text-xs text-slate-400">{t('eventHistoryBody')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadEventHistory()}
                  disabled={eventHistoryLoading}
                  className="inline-flex items-center gap-2 rounded bg-slate-700/60 px-3 py-2 text-xs text-slate-100 hover:bg-slate-600/70 disabled:opacity-60"
                >
                  {eventHistoryLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {t('refresh')}
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                <section
                  className="mb-3 rounded-lg border border-indigo-500/25 bg-indigo-950/15 p-3"
                  aria-labelledby="scada-operations-logbook-heading"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3
                        id="scada-operations-logbook-heading"
                        className="flex items-center gap-2 text-sm font-medium text-white"
                      >
                        <BookOpenText className="h-4 w-4 text-indigo-300" aria-hidden="true" />
                        {t('operationsLogbook')}
                      </h3>
                      <p className="text-xs text-slate-400">{t('operationsLogbookBody')}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (historicalPlayback.isReplaying) {
                          historicalPlayback.exitReplayMode();
                        } else {
                          historicalPlayback.enterReplayMode();
                        }
                      }}
                      className={`min-h-11 rounded px-3 text-xs font-semibold ${
                        historicalPlayback.isReplaying
                          ? 'bg-rose-700 text-white'
                          : 'bg-indigo-700 text-white hover:bg-indigo-600'
                      }`}
                    >
                      {historicalPlayback.isReplaying ? t('returnToLive') : t('openRecentReplay')}
                    </button>
                  </div>
                  <form
                    className="mt-3 flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      campaign.addLogEntry(
                        controlIdentity.trim() || defaultControlIdentity(),
                        'operation',
                        operationsLogMessage,
                        null,
                        'operator'
                      );
                      setOperationsLogMessage('');
                    }}
                  >
                    <label htmlFor="scada-operations-log-message" className="sr-only">
                      {t('operationsLogMessage')}
                    </label>
                    <input
                      id="scada-operations-log-message"
                      value={operationsLogMessage}
                      onChange={(event) => setOperationsLogMessage(event.target.value)}
                      maxLength={500}
                      placeholder={t('operationsLogPlaceholder')}
                      className="min-h-11 min-w-0 flex-1 rounded border border-slate-600 bg-slate-900/60 px-3 text-xs text-white placeholder:text-slate-500"
                    />
                    <button
                      type="submit"
                      disabled={!operationsLogMessage.trim()}
                      className="min-h-11 rounded bg-indigo-700 px-4 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      {t('record')}
                    </button>
                  </form>
                  <ol className="mt-3 space-y-1.5" aria-label={t('logbookTimeline')}>
                    {campaign.logbook
                      .slice(-6)
                      .reverse()
                      .map((entry) => (
                        <li
                          key={entry.id}
                          className="rounded border border-slate-700/50 bg-slate-900/30 px-2.5 py-2 text-xs text-slate-300"
                        >
                          <span className="font-mono text-[10px] text-slate-500">
                            {t('logMinute', {
                              minute: formatFixed(Math.round(entry.simulationMinute), 0),
                            })}
                          </span>{' '}
                          <span className="font-semibold text-slate-100">{entry.source}:</span>{' '}
                          {entry.message}
                        </li>
                      ))}
                  </ol>
                </section>
                {eventHistoryLoading && eventHistory.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">
                    {t('loadingEventHistory')}
                  </div>
                ) : eventTimeline.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-slate-400">
                    <ListChecks className="mb-2 h-10 w-10 text-emerald-500/50" aria-hidden="true" />
                    <p className="text-sm">{t('noAlarmEvents')}</p>
                  </div>
                ) : (
                  <ol className="space-y-2" aria-label={t('alarmEventTimeline')}>
                    {eventTimeline.map((alarm) => (
                      <li
                        key={`${alarm.id}-${alarm.timestamp}`}
                        className="grid gap-2 rounded-lg border border-slate-700/50 bg-slate-800/30 p-3 sm:grid-cols-[8rem_1fr_auto]"
                      >
                        <time
                          dateTime={new Date(alarm.timestamp).toISOString()}
                          className="font-mono text-xs text-slate-400"
                        >
                          {new Date(alarm.timestamp).toLocaleString(dateLocale)}
                        </time>
                        <div>
                          <div className="text-sm font-medium text-white">{alarm.tagName}</div>
                          <div className="text-xs text-slate-300">
                            {t('eventDetail', {
                              machine: alarm.machineId ?? t('unassigned'),
                              type: alarm.type,
                              value: withUnit(alarm.value, 2, alarm.unit),
                            })}
                          </div>
                          {alarm.acknowledgedBy && (
                            <div className="mt-1 text-[11px] text-slate-400">
                              {t('acknowledgedBy', { who: alarm.acknowledgedBy })}
                            </div>
                          )}
                        </div>
                        <span
                          className={`h-fit rounded px-2 py-1 text-[10px] font-semibold ${ALARM_PRIORITY_COLORS[alarm.priority]}`}
                        >
                          {alarmStateLabel(alarm.state)}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          )}

          {/* Simulation Lab */}
          {activeTab === 'faults' && (
            <div
              className="h-full flex flex-col p-3"
              role="tabpanel"
              id="scada-tab-faults"
              aria-labelledby="scada-tab-button-faults"
              tabIndex={0}
            >
              <div className="mb-4 rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 text-sm text-amber-100">
                {t('simulationLabBanner')}
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
                    <div className={`text-sm font-medium text-white ${capitalizeIn(locale)}`}>
                      {t(FAULT_LABEL_KEYS[faultType].name)}
                    </div>
                    <div className="text-xs text-slate-400">
                      {t(FAULT_LABEL_KEYS[faultType].description)}
                    </div>
                  </button>
                ))}
              </div>

              {activeFaults.length > 0 && (
                <div className="mt-4">
                  <div className="text-sm font-medium text-white mb-2">{t('activeFaults')}</div>
                  <div className="space-y-2">
                    {activeFaults.map((fault) => (
                      <div key={fault.tagId} className="px-3 py-2 bg-red-500/20 rounded text-sm">
                        <span className="text-red-400">
                          {t('faultName', { value: fault.faultType })}
                        </span>
                        <span className="text-slate-300 ml-2">
                          {t('faultOnTag', { tag: fault.tagId })}
                        </span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={clearAllFaults}
                    className="mt-3 w-full px-4 py-2 bg-slate-700/50 text-slate-200 rounded hover:bg-slate-600/50 text-sm"
                  >
                    {t('clearAllFaults')}
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
                    <span className="text-sm font-medium text-white">{t('connectionStatus')}</span>
                    <span
                      className={`flex items-center gap-1.5 text-xs ${linkUp ? 'text-green-400' : 'text-red-400'}`}
                    >
                      {linkUp ? (
                        <Wifi className="w-3 h-3" aria-hidden="true" />
                      ) : (
                        <WifiOff className="w-3 h-3" aria-hidden="true" />
                      )}
                      {linkUp ? t('connected') : t('disconnected')}
                    </span>
                  </div>
                  <div className="text-xs text-slate-300">
                    {t('currentMode')}{' '}
                    <span className="text-cyan-400">{t('modeName', { value: mode })}</span>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <div className="text-xs text-slate-300">{t('scadaRuntime')}</div>
                    <button
                      onClick={handleToggleSCADA}
                      aria-pressed={scadaEnabled}
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                        scadaEnabled
                          ? 'bg-green-500/20 text-green-300 border border-green-500/40'
                          : 'bg-slate-700/50 text-slate-200 border border-slate-600/60'
                      }`}
                    >
                      {scadaEnabled ? t('enabled') : t('disabled')}
                    </button>
                  </div>
                  {!scadaEnabled && (
                    <div className="mt-2 text-[11px] text-amber-300">{t('enableToStart')}</div>
                  )}
                </div>

                {/* Connection Type Selector */}
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-white">{t('connectionType')}</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      {
                        type: 'simulation' as const,
                        icon: Server,
                        label: t('connSimulation'),
                        desc: t('connSimulationDescription'),
                      },
                      {
                        type: 'rest' as const,
                        icon: Globe,
                        label: 'REST API',
                        desc: t('connRestDescription'),
                      },
                      {
                        type: 'mqtt' as const,
                        icon: Radio,
                        label: 'MQTT',
                        desc: t('connMqttDescription'),
                      },
                      {
                        type: 'websocket' as const,
                        icon: Wifi,
                        label: 'WebSocket',
                        desc: t('connWebsocketDescription'),
                      },
                      {
                        type: 'opcua' as const,
                        icon: Server,
                        label: 'OPC-UA',
                        desc: t('connOpcuaDescription'),
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
                      {t('restConfiguration')}
                    </legend>
                    <div className="space-y-2">
                      <div>
                        <label
                          htmlFor="rest-base-url"
                          className="block text-xs text-slate-300 mb-1"
                        >
                          {t('baseUrl')}
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
                          {t('pollInterval')}
                        </label>
                        <input
                          id="rest-poll-interval"
                          type="number"
                          value={restPollIntervalInput}
                          onChange={(e) => setRestPollIntervalInput(e.target.value)}
                          min={100}
                          max={60000}
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
                      {t('mqttConfiguration')}
                    </legend>
                    <div className="space-y-2">
                      <div>
                        <label
                          htmlFor="mqtt-broker-url"
                          className="block text-xs text-slate-300 mb-1"
                        >
                          {t('brokerUrl')}
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
                          {t('topicPrefix')}
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
                      {t('websocketConfiguration')}
                    </legend>
                    <div>
                      <label htmlFor="websocket-url" className="block text-xs text-slate-300 mb-1">
                        {t('websocketUrl')}
                      </label>
                      <input
                        id="websocket-url"
                        type="text"
                        value={websocketUrl}
                        onChange={(e) => setWebsocketUrl(e.target.value)}
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
                      {t('proxyConfiguration')}
                    </legend>
                    <div className="text-xs text-slate-300 mb-2">{t('proxyNote')}</div>
                    <div>
                      <label htmlFor="proxy-url" className="block text-xs text-slate-300 mb-1">
                        {t('proxyUrl')}
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

                      // A blank URL would silently fall back to simulation.
                      const requiredUrl =
                        connectionType === 'rest'
                          ? { value: restUrl, messageKey: 'enterBaseUrl' as const }
                          : connectionType === 'mqtt'
                            ? { value: mqttBrokerUrl, messageKey: 'enterBrokerUrl' as const }
                            : connectionType === 'websocket'
                              ? { value: websocketUrl, messageKey: 'enterWebsocketUrl' as const }
                              : connectionType === 'opcua' || connectionType === 'modbus'
                                ? { value: proxyUrl, messageKey: 'enterProxyUrl' as const }
                                : null;
                      if (requiredUrl && !requiredUrl.value.trim()) {
                        setSettingsMessage({
                          type: 'error',
                          text: translate(scadaPanelMessages, requiredUrl.messageKey),
                        });
                        return;
                      }

                      if (connectionType === 'rest') {
                        config.baseUrl = restUrl;
                        const pollMs = Number.parseInt(restPollIntervalInput, 10);
                        config.pollInterval = Number.isFinite(pollMs)
                          ? Math.min(60000, Math.max(100, pollMs))
                          : DEFAULT_POLL_INTERVAL_MS;
                        setRestPollIntervalInput(String(config.pollInterval));
                      } else if (connectionType === 'mqtt') {
                        config.brokerUrl = mqttBrokerUrl;
                        config.topicPrefix = mqttTopicPrefix;
                      } else if (connectionType === 'websocket') {
                        config.proxyUrl = websocketUrl;
                      } else if (connectionType === 'opcua' || connectionType === 'modbus') {
                        config.proxyUrl = proxyUrl;
                      }

                      const service = getSCADAService();
                      await service.setConnectionConfig(config);

                      setSettingsMessage({
                        type: 'success',
                        text: translate(scadaPanelMessages, 'switchedTo', {
                          label: connectionLabel(connectionType),
                        }),
                      });
                    } catch (err) {
                      setSettingsMessage({
                        type: 'error',
                        text: translate(scadaPanelMessages, 'applyFailed', {
                          error: err instanceof Error ? err.message : String(err),
                        }),
                      });
                    } finally {
                      refreshSharedSCADAStatus();
                      setIsApplyingSettings(false);
                    }
                  }}
                  disabled={isApplyingSettings}
                  className="w-full px-4 py-2 bg-cyan-500/20 text-cyan-400 rounded hover:bg-cyan-500/30 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isApplyingSettings ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      {t('applying')}
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" aria-hidden="true" />
                      {t('applySettings')}
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
                    setRestPollIntervalInput(String(DEFAULT_POLL_INTERVAL_MS));
                    setMqttBrokerUrl('ws://localhost:8883');
                    setMqttTopicPrefix('scada');
                    setProxyUrl('http://localhost:3001');
                    setWebsocketUrl('ws://localhost:3001/ws');
                    setSettingsMessage(null);
                  }}
                  className="w-full px-4 py-2 bg-slate-700/50 text-slate-200 rounded hover:bg-slate-600/50 text-sm flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" aria-hidden="true" />
                  {t('resetToDefaults')}
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );

  return typeof document === 'undefined'
    ? fullWorkspace
    : createPortal(fullWorkspace, document.body);
};

export default SCADAPanel;
