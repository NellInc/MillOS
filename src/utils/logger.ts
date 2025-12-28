/**
 * Centralized logging utility for MillOS
 *
 * Features:
 * - Log levels (debug, info, warn, error)
 * - Namespaced loggers for subsystems
 * - Automatic timestamps
 * - Development/production mode awareness
 * - Enable/disable logging per namespace
 */

/** Log severity levels */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Configuration for a logger instance */
interface LoggerConfig {
  /** Minimum log level to output */
  level: LogLevel;
  /** Prefix for log messages */
  prefix?: string;
  /** Whether logging is enabled */
  enabled: boolean;
}

/** Log level priorities for filtering */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** Check if we're in development mode */
const isDevelopment = import.meta.env?.MODE === 'development' || import.meta.env?.DEV === true;

/**
 * Creates a logger instance with the given configuration
 */
class Logger {
  private config: LoggerConfig;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: isDevelopment ? 'debug' : 'info',
      prefix: '',
      enabled: true,
      ...config,
    };
  }

  /**
   * Formats a log message with timestamp and prefix
   */
  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const prefix = this.config.prefix ? `[${this.config.prefix}]` : '';
    const levelLabel = `[${level.toUpperCase()}]`;

    return `${timestamp} ${levelLabel}${prefix} ${message}`;
  }

  /**
   * Checks if a log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    if (!this.config.enabled) return false;

    const currentPriority = LOG_LEVEL_PRIORITY[this.config.level];
    const messagePriority = LOG_LEVEL_PRIORITY[level];

    return messagePriority >= currentPriority;
  }

  /**
   * Outputs a log message at the specified level
   */
  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (!this.shouldLog(level)) return;

    const formattedMessage = this.formatMessage(level, message);

    switch (level) {
      case 'debug':
        console.debug(formattedMessage, ...args);
        break;
      case 'info':
        console.info(formattedMessage, ...args);
        break;
      case 'warn':
        console.warn(formattedMessage, ...args);
        break;
      case 'error':
        console.error(formattedMessage, ...args);
        break;
    }
  }

  /**
   * Log a debug message (development only by default)
   */
  debug(message: string, ...args: unknown[]): void {
    this.log('debug', message, ...args);
  }

  /**
   * Log an info message
   */
  info(message: string, ...args: unknown[]): void {
    this.log('info', message, ...args);
  }

  /**
   * Log a warning message
   */
  warn(message: string, ...args: unknown[]): void {
    this.log('warn', message, ...args);
  }

  /**
   * Log an error message
   */
  error(message: string, ...args: unknown[]): void {
    this.log('error', message, ...args);
  }

  /**
   * Enable or disable this logger
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  /**
   * Set the minimum log level
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * Create a child logger with a new prefix
   */
  child(prefix: string): Logger {
    const childPrefix = this.config.prefix ? `${this.config.prefix}:${prefix}` : prefix;

    return new Logger({
      ...this.config,
      prefix: childPrefix,
    });
  }
}

/**
 * Default logger instance
 */
const defaultLogger = new Logger();

/**
 * SCADA subsystem logger
 */
const scadaLogger = new Logger({
  prefix: 'SCADA',
  level: isDevelopment ? 'debug' : 'info',
  enabled: true,
});

/**
 * Audio subsystem logger
 */
const audioLogger = new Logger({
  prefix: 'Audio',
  level: isDevelopment ? 'debug' : 'info',
  enabled: true,
});

/**
 * AI subsystem logger
 */
const aiLogger = new Logger({
  prefix: 'AI',
  level: isDevelopment ? 'debug' : 'info',
  enabled: true,
});

/**
 * Worker subsystem logger
 */
const workerLogger = new Logger({
  prefix: 'Worker',
  level: isDevelopment ? 'debug' : 'info',
  enabled: true,
});

/**
 * Store subsystem logger
 */
const storeLogger = new Logger({
  prefix: 'Store',
  level: isDevelopment ? 'debug' : 'info',
  enabled: true,
});

/**
 * Performance logger for metrics and optimization
 */
const perfLogger = new Logger({
  prefix: 'Perf',
  level: isDevelopment ? 'debug' : 'warn',
  enabled: true,
});

/**
 * Multiplayer subsystem logger for WebRTC/PeerJS
 */
const multiplayerLogger = new Logger({
  prefix: 'Multiplayer',
  level: isDevelopment ? 'debug' : 'info',
  enabled: true,
});

/**
 * Main logger export with namespaced subsystem loggers
 */
export const logger = {
  debug: defaultLogger.debug.bind(defaultLogger),
  info: defaultLogger.info.bind(defaultLogger),
  warn: defaultLogger.warn.bind(defaultLogger),
  error: defaultLogger.error.bind(defaultLogger),
  setEnabled: defaultLogger.setEnabled.bind(defaultLogger),
  setLevel: defaultLogger.setLevel.bind(defaultLogger),
  child: defaultLogger.child.bind(defaultLogger),

  // Namespaced loggers for different subsystems
  scada: scadaLogger,
  audio: audioLogger,
  ai: aiLogger,
  worker: workerLogger,
  store: storeLogger,
  perf: perfLogger,
  multiplayer: multiplayerLogger,
};

/**
 * Export Logger class for creating custom logger instances
 */
export { Logger };
export type { LogLevel, LoggerConfig };
