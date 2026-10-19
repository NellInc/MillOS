/**
 * SCADA Type Definitions for MillOS
 *
 * This module defines all interfaces and types for the SCADA integration layer,
 * supporting bidirectional data flow between simulation and real PLCs.
 */

// ============================================================================
// Data Types
// ============================================================================

/** PLC data types supported by SCADA tags */
export type DataType = 'BOOL' | 'INT16' | 'INT32' | 'FLOAT32' | 'FLOAT64' | 'STRING';

/** Access mode for SCADA tags */
export type AccessMode = 'READ' | 'WRITE' | 'READ_WRITE';

/** OPC-UA quality codes (simplified) */
export type Quality = 'GOOD' | 'UNCERTAIN' | 'BAD' | 'STALE';

/** Functional groupings for SCADA tags */
export type TagGroup =
  | 'TEMPERATURE'
  | 'PRESSURE'
  | 'FLOW'
  | 'LEVEL'
  | 'VIBRATION'
  | 'SPEED'
  | 'CURRENT'
  | 'POWER'
  | 'HUMIDITY'
  | 'WEIGHT'
  | 'POSITION'
  | 'SETPOINT'
  | 'COMMAND'
  | 'STATUS';

// ============================================================================
// Tag Definitions
// ============================================================================

/** Simulation parameters for a SCADA tag */
export interface TagSimulationParams {
  /** Starting/base value for simulation */
  baseValue: number;
  /** Random noise amplitude (value varies by +/- this amount) */
  noiseAmplitude: number;
  /** Gradual drift rate per second (can be positive or negative) */
  driftRate: number;
  /** Other tags this value correlates with */
  correlatedWith?: string[];
  /** Whether value scales with machine load percentage */
  loadFactor?: boolean;
  /** Whether tag only has valid data when machine is running */
  statusDependent?: boolean;
  /**
   * Writable setpoint tag this process value follows while the machine runs.
   * The simulated reading approaches the setpoint with a first-order lag.
   */
  setpointTagId?: string;
}

/** Complete definition of a SCADA tag */
export interface TagDefinition {
  // === Identification ===
  /** Unique tag ID using ISA naming: AREA.TAG_TYPE.INSTANCE.ATTRIBUTE */
  id: string;
  /** Display name */
  name: string;
  /** Full description of what this tag represents */
  description: string;

  // === Addressing (for real SCADA systems) ===
  /** PLC memory address (e.g., "DB1.DBD0" for Siemens, "40001" for Modbus) */
  address?: string;
  /** OPC-UA NodeId (e.g., "ns=2;s=Silo.Temperature") */
  nodeId?: string;

  // === Data Characteristics ===
  /** PLC data type */
  dataType: DataType;
  /** Read/write access mode */
  accessMode: AccessMode;

  // === Engineering Units ===
  /** Engineering unit symbol (e.g., "C", "mm/s", "RPM", "%") */
  engUnit: string;
  /** Minimum engineering value */
  engLow: number;
  /** Maximum engineering value */
  engHigh: number;
  /** Raw PLC value minimum (for linear scaling) */
  rawLow?: number;
  /** Raw PLC value maximum (for linear scaling) */
  rawHigh?: number;

  // === Alarm Thresholds ===
  /** Critical high alarm threshold */
  alarmHiHi?: number;
  /** Warning high alarm threshold */
  alarmHi?: number;
  /** Warning low alarm threshold */
  alarmLo?: number;
  /** Critical low alarm threshold */
  alarmLoLo?: number;
  /** Deadband for alarm state changes (prevents chattering) */
  deadband?: number;

  // === Relationships ===
  /** Links this tag to a MachineData.id in the Zustand store */
  machineId: string;
  /** Functional grouping for filtering/display */
  group: TagGroup;

  // === Simulation ===
  /** Parameters for physics-based simulation */
  simulation?: TagSimulationParams;
}

// ============================================================================
// Tag Values
// ============================================================================

/** Real-time value of a SCADA tag */
export interface TagValue {
  /** Tag ID this value belongs to */
  tagId: string;
  /** Current value (type depends on tag definition) */
  value: number | boolean | string;
  /** Data quality indicator */
  quality: Quality;
  /** Server timestamp (when SCADA layer received the value) */
  timestamp: number;
  /** Source timestamp from PLC (if available) */
  sourceTimestamp?: number;
}

/** Historical data point for trending */
export interface TagHistoryPoint {
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Value at this timestamp */
  value: number;
  /** Quality at this timestamp */
  quality: Quality;
}

// ============================================================================
// Alarm System (ISA-18.2-informed simulator behavior)
// ============================================================================

/** Alarm state machine states per ISA-18.2 */
export type AlarmState =
  | 'NORMAL' // Value within limits, alarm cleared
  | 'UNACK' // Alarm active, not acknowledged
  | 'ACKED' // Alarm active, acknowledged by the control source
  | 'RTN_UNACK'; // Returned to normal, but not yet acknowledged

/** Alarm priority levels */
export type AlarmPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

/** Alarm type based on threshold exceeded */
export type AlarmType = 'HIHI' | 'HI' | 'LO' | 'LOLO' | 'BAD_QUALITY' | 'RATE_OF_CHANGE';

/** Control disposition, kept separate from the process alarm state machine. */
export type AlarmDisposition = 'IN_SERVICE' | 'SHELVED' | 'SUPPRESSED' | 'OUT_OF_SERVICE';

/** Active or historical alarm record */
export interface Alarm {
  /** Unique alarm ID */
  id: string;
  /** Tag that generated this alarm */
  tagId: string;
  /** Display tag name */
  tagName: string;
  /** Type of alarm condition */
  type: AlarmType;
  /** Current alarm state */
  state: AlarmState;
  /** Alarm priority */
  priority: AlarmPriority;
  /** Value that triggered the alarm */
  value: number;
  /** Threshold that was exceeded */
  threshold: number;
  /** When the alarm was raised */
  timestamp: number;
  /** Latest recurrence of the condition */
  lastOccurrenceAt?: number;
  /** Number of occurrences represented by this alarm record */
  occurrenceCount?: number;
  /** Engineering unit copied from the source tag */
  unit?: string;
  /** Source data quality at the latest occurrence */
  quality?: Quality;
  /** Literal condition shown in the control workspace */
  condition?: string;
  /** Current control disposition */
  disposition?: AlarmDisposition;
  /** Control source that acknowledged, if applicable */
  acknowledgedBy?: string;
  /** Optional control context entered during acknowledgement */
  acknowledgementNote?: string;
  /** When the alarm was acknowledged */
  acknowledgedAt?: number;
  /** When the alarm cleared (returned to normal) */
  clearedAt?: number;
  /** Machine ID associated with this alarm */
  machineId?: string;
}

/** Alarm suppression record */
export interface AlarmSuppression {
  tagId: string;
  disposition: Exclude<AlarmDisposition, 'IN_SERVICE'>;
  suppressedAt: number;
  suppressedBy: string;
  reason: string;
  expiresAt?: number;
}

// ============================================================================
// Protocol Adapter Interface
// ============================================================================

/** Connection configuration for protocol adapters */
export interface ConnectionConfig {
  /** Protocol type */
  type: 'simulation' | 'opcua' | 'modbus' | 'mqtt' | 'rest' | 'websocket';

  // === OPC-UA Specific ===
  /** OPC-UA server endpoint URL */
  endpointUrl?: string;
  /** Security mode for OPC-UA */
  securityMode?: 'None' | 'Sign' | 'SignAndEncrypt';
  /** OPC-UA username (if required) */
  username?: string;
  /** OPC-UA password (if required) */
  password?: string;

  // === Modbus Specific ===
  /** Modbus TCP host */
  host?: string;
  /** Modbus TCP port (default 502) */
  port?: number;
  /** Modbus unit/slave ID */
  unitId?: number;

  // === MQTT Specific ===
  /** MQTT broker URL (ws:// or wss://) */
  brokerUrl?: string;
  /** Topic prefix for SCADA data */
  topicPrefix?: string;
  /** MQTT client ID */
  clientId?: string;

  // === REST API Specific ===
  /** Base URL for REST API */
  baseUrl?: string;
  /** API key or bearer token */
  apiKey?: string;
  /** Polling interval in milliseconds */
  pollInterval?: number;

  // === Backend Proxy ===
  /** WebSocket URL to backend proxy */
  proxyUrl?: string;
}

/** Connection status information */
export interface ConnectionStatus {
  /** Whether currently connected */
  connected: boolean;
  /** Timestamp of last successful connection */
  lastConnectTime?: number;
  /** Timestamp of last disconnection */
  lastDisconnectTime?: number;
  /** Number of reconnection attempts since last disconnect */
  reconnectAttempts: number;
  /** Error message if connection failed */
  error?: string;
}

/** Adapter performance statistics */
export interface AdapterStatistics {
  /** Read operations per second */
  readsPerSecond: number;
  /** Write operations per second */
  writesPerSecond: number;
  /** Average read latency in milliseconds */
  avgReadLatency: number;
  /** Total error count since connection */
  errorCount: number;
  /** Seconds since connection established */
  uptime: number;
}

/** Common interface all protocol adapters must implement */
export interface IProtocolAdapter {
  // === Lifecycle ===
  /** Establish connection to data source */
  connect(): Promise<void>;
  /** Disconnect from data source */
  disconnect(): Promise<void>;
  /** Check if currently connected */
  isConnected(): boolean;

  // === Read Operations ===
  /** Read a single tag value */
  readTag(tagId: string): Promise<TagValue>;
  /** Read multiple tag values */
  readTags(tagIds: string[]): Promise<TagValue[]>;
  /** Read all registered tags */
  readAllTags(): Promise<TagValue[]>;

  // === Write Operations ===
  /** Write a value to a tag (for setpoints/commands) */
  writeTag(tagId: string, value: number | boolean | string): Promise<boolean>;

  // === Subscriptions ===
  /** Subscribe to real-time updates for specific tags */
  subscribe(tagIds: string[], callback: (values: TagValue[]) => void): () => void;

  // === Diagnostics ===
  /** Get current connection status */
  getConnectionStatus(): ConnectionStatus;
  /** Get performance statistics */
  getStatistics(): AdapterStatistics;
}

// ============================================================================
// SCADA Service Types
// ============================================================================

/** SCADA operation mode */
export type SCADAMode = 'simulation' | 'live' | 'hybrid' | 'disconnected';

/** SCADA service configuration */
export interface SCADAConfig {
  /** Operating mode */
  mode: SCADAMode;
  /** Connection configuration for the selected mode */
  connection: ConnectionConfig;
  /** History retention period in milliseconds (default 24 hours) */
  historyRetention?: number;
  /** Sample rate for history in milliseconds (default 1000) */
  historySampleRate?: number;
  /** Whether to enable alarm management */
  alarmsEnabled?: boolean;
}

/** Fault injection types for testing */
export type FaultType =
  | 'sensor_fail' // Sensor returns BAD quality
  | 'spike' // Sudden value spike
  | 'drift' // Accelerated drift
  | 'stuck' // Value stops changing
  | 'noise' // Increased noise
  | 'communication'; // Connection lost

/** Fault injection request */
export interface FaultInjection {
  /** Tag to inject fault into */
  tagId: string;
  /** Type of fault to inject */
  faultType: FaultType;
  /** Duration in milliseconds (0 = permanent until cleared) */
  duration?: number;
  /** Severity multiplier (1.0 = normal, 2.0 = double effect) */
  severity?: number;
}

// ============================================================================
// IndexedDB Schema Types
// ============================================================================

/** Tag history record stored in IndexedDB */
export interface TagHistoryRecord {
  /** Auto-increment ID */
  id?: number;
  /** Tag ID */
  tagId: string;
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Value at this timestamp */
  value: number;
  /** Quality at this timestamp */
  quality: Quality;
}

/** Alarm history record stored in IndexedDB */
export interface AlarmHistoryRecord {
  /** Auto-increment ID */
  id?: number;
  /** Alarm ID */
  alarmId: string;
  /** Tag ID that generated the alarm */
  tagId: string;
  /** Alarm type */
  type: AlarmType;
  /** Final alarm state */
  state: AlarmState;
  /** Alarm priority */
  priority: AlarmPriority;
  /** Value that triggered alarm */
  value: number;
  /** Threshold exceeded */
  threshold: number;
  /** When alarm was raised */
  raisedAt: number;
  /** When alarm was acknowledged */
  acknowledgedAt?: number;
  /** When alarm cleared */
  clearedAt?: number;
  /** Control source that acknowledged */
  acknowledgedBy?: string;
}

// ============================================================================
// Export Formats
// ============================================================================

/** JSON export format for SCADA data */
export interface SCADAExport {
  /** Export timestamp */
  exportTime: number;
  /** Start of data range */
  startTime: number;
  /** End of data range */
  endTime: number;
  /** Format version identifier */
  format: 'MillOS-SCADA-Export-v1';
  /** Tag data */
  tags: Record<string, TagHistoryPoint[]>;
  /** Alarm data (optional) */
  alarms?: AlarmHistoryRecord[];
}
