/**
 * Modbus TCP Adapter for SCADA Proxy
 *
 * Connects to Modbus TCP devices to read/write register data.
 * Uses modbus-serial for Modbus communication.
 */

import ModbusRTU from 'modbus-serial';

interface TagValue {
  tagId: string;
  value: unknown;
  quality: string;
  timestamp: number;
}

interface ConnectionStatus {
  connected: boolean;
  host?: string;
  port?: number;
  lastError?: string;
  reconnectAttempts: number;
}

export interface ModbusTagConfig {
  tagId: string;
  slaveId: number;
  registerType: 'holding' | 'input' | 'coil' | 'discrete';
  address: number;
  count: number;
  dataType: 'FLOAT32' | 'INT16' | 'INT32' | 'BOOL';
  byteSwap?: boolean;
  wordSwap?: boolean;
}

export class ModbusAdapter {
  private host: string;
  private port: number;
  private client: ModbusRTU;
  private connected = false;
  private reconnectAttempts = 0;
  private lastError?: string;
  private ioQueue: Promise<void> = Promise.resolve();

  // Map tagId to Modbus configuration
  private tagConfigMap = new Map<string, ModbusTagConfig>();

  constructor(host: string, port: number = 502) {
    this.host = host;
    this.port = port;
    this.client = new ModbusRTU();
  }

  /**
   * Connect to Modbus TCP device
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      await this.client.connectTCP(this.host, { port: this.port });
      this.client.setTimeout(5000);
      this.connected = true;
      this.reconnectAttempts = 0;
      this.lastError = undefined;

      console.log(`[ModbusAdapter] Connected to ${this.host}:${this.port}`);
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.reconnectAttempts++;
      throw err;
    }
  }

  /**
   * Disconnect from Modbus device
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.close(() => {
        console.log('[ModbusAdapter] Disconnected');
      });
    }
    this.connected = false;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected && this.client.isOpen;
  }

  /**
   * Get connection status
   */
  getStatus(): ConnectionStatus {
    return {
      connected: this.connected,
      host: this.host,
      port: this.port,
      lastError: this.lastError,
      reconnectAttempts: this.reconnectAttempts,
    };
  }

  /**
   * Register tag configuration
   */
  registerTag(config: ModbusTagConfig): void {
    this.tagConfigMap.set(config.tagId, config);
  }

  /** Serialize setID plus I/O so concurrent polls and writes cannot target the wrong slave. */
  private withIO<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.ioQueue.then(operation, operation);
    this.ioQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  /**
   * Read values for multiple tags
   */
  async readValues(tagIds: string[]): Promise<TagValue[]> {
    const results: TagValue[] = [];

    for (const tagId of tagIds) {
      const config = this.tagConfigMap.get(tagId);
      if (!config) {
        // Never guess an industrial address from a display identifier. Missing
        // registration is a configuration fault, not permission to read slave
        // 1, register 0.
        results.push({
          tagId,
          value: 0,
          quality: 'BAD',
          timestamp: Date.now(),
        });
        continue;
      }

      const value = await this.readTag(config);
      results.push(value);
    }

    return results;
  }

  /**
   * Read a single tag
   */
  private async readTag(config: ModbusTagConfig): Promise<TagValue> {
    try {
      const value = await this.withIO(async () => {
        this.client.setID(config.slaveId);

        switch (config.registerType) {
          case 'holding': {
            const result = await this.client.readHoldingRegisters(config.address, config.count);
            return this.convertValue(Array.from(result.data), config);
          }
          case 'input': {
            const result = await this.client.readInputRegisters(config.address, config.count);
            return this.convertValue(Array.from(result.data), config);
          }
          case 'coil': {
            const result = await this.client.readCoils(config.address, 1);
            return result.data[0];
          }
          case 'discrete': {
            const result = await this.client.readDiscreteInputs(config.address, 1);
            return result.data[0];
          }
          default:
            throw new Error(`Unknown register type: ${config.registerType}`);
        }
      });

      return {
        tagId: config.tagId,
        value,
        quality: 'GOOD',
        timestamp: Date.now(),
      };
    } catch (err) {
      console.error(`[ModbusAdapter] Read error for ${config.tagId}:`, err);
      this.lastError = err instanceof Error ? err.message : String(err);

      return {
        tagId: config.tagId,
        value: 0,
        quality: 'BAD',
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Write value to a tag
   */
  async writeValue(tagId: string, value: unknown): Promise<boolean> {
    const config = this.tagConfigMap.get(tagId);
    if (!config) {
      console.warn(`[ModbusAdapter] Unknown tag: ${tagId}`);
      return false;
    }

    try {
      await this.withIO(async () => {
        this.client.setID(config.slaveId);

        switch (config.registerType) {
          case 'holding': {
            const registers = this.valueToRegisters(value, config);
            if (registers.length === 1) {
              await this.client.writeRegister(config.address, registers[0]);
            } else {
              await this.client.writeRegisters(config.address, registers);
            }
            return;
          }
          case 'coil':
            await this.client.writeCoil(config.address, Boolean(value));
            return;
          default:
            throw new Error(`Cannot write to ${config.registerType} registers`);
        }
      });

      return true;
    } catch (err) {
      console.error(`[ModbusAdapter] Write error for ${tagId}:`, err);
      this.lastError = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /**
   * Convert raw register data to typed value
   */
  private convertValue(rawData: number[], config: ModbusTagConfig): number {
    let data = rawData.map((register) =>
      config.byteSwap ? ((register & 0xff) << 8) | ((register >>> 8) & 0xff) : register
    );
    if (config.wordSwap && data.length >= 2) {
      data = [data[1], data[0], ...data.slice(2)];
    }

    switch (config.dataType) {
      case 'INT16':
        return this.toInt16(data[0]);

      case 'INT32':
        if (data.length >= 2) {
          return this.toInt32(data[0], data[1]);
        }
        return data[0];

      case 'FLOAT32':
        if (data.length >= 2) {
          return this.toFloat32(data[0], data[1]);
        }
        return data[0];

      case 'BOOL':
        return data[0] !== 0 ? 1 : 0;

      default:
        return data[0];
    }
  }

  /**
   * Convert value to Modbus registers
   */
  private valueToRegisters(value: unknown, config: ModbusTagConfig): number[] {
    const numValue = Number(value);
    let registers: number[];
    switch (config.dataType) {
      case 'INT16':
        registers = [numValue & 0xffff];
        break;

      case 'INT32':
        registers = [(numValue >> 16) & 0xffff, numValue & 0xffff];
        break;

      case 'FLOAT32':
        registers = this.float32ToRegisters(numValue);
        break;

      case 'BOOL':
        registers = [numValue !== 0 ? 1 : 0];
        break;

      default:
        registers = [numValue & 0xffff];
    }

    if (config.wordSwap && registers.length >= 2) {
      registers = [registers[1], registers[0], ...registers.slice(2)];
    }
    if (config.byteSwap) {
      registers = registers.map((register) => ((register & 0xff) << 8) | ((register >>> 8) & 0xff));
    }
    return registers;
  }

  /**
   * Convert 16-bit register to signed int
   */
  private toInt16(value: number): number {
    return value > 32767 ? value - 65536 : value;
  }

  /**
   * Convert two 16-bit registers to signed 32-bit int
   */
  private toInt32(high: number, low: number): number {
    const value = (high << 16) | low;
    return value > 2147483647 ? value - 4294967296 : value;
  }

  /**
   * Convert two 16-bit registers to 32-bit float
   */
  private toFloat32(high: number, low: number): number {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);

    view.setUint16(0, high, false);
    view.setUint16(2, low, false);

    return view.getFloat32(0, false);
  }

  /**
   * Convert 32-bit float to two 16-bit registers
   */
  private float32ToRegisters(value: number): number[] {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);

    view.setFloat32(0, value, false);

    const high = view.getUint16(0, false);
    const low = view.getUint16(2, false);

    return [high, low];
  }
}
