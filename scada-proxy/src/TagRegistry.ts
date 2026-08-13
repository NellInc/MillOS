/**
 * Tag Registry for SCADA Proxy
 *
 * Manages tag definitions and current values.
 * Supports loading tags from JSON configuration.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface TagDefinition {
  id: string;
  name: string;
  protocol: 'opcua' | 'modbus';
  address: string; // OPC-UA NodeId or Modbus address
  dataType: 'FLOAT32' | 'INT16' | 'INT32' | 'BOOL' | 'STRING';
  accessMode: 'READ' | 'WRITE' | 'READ_WRITE';
  engineeringUnits?: string;
  engLow?: number;
  engHigh?: number;
  // Modbus-specific
  modbusRegister?: 'holding' | 'input' | 'coil' | 'discrete';
  modbusOffset?: number;
  modbusSlave?: number;
  modbusByteSwap?: boolean;
  modbusWordSwap?: boolean;
}

export interface TagValue {
  tagId: string;
  value: unknown;
  quality: string;
  timestamp: number;
}

const PROTOCOLS = new Set<TagDefinition['protocol']>(['opcua', 'modbus']);
const DATA_TYPES = new Set<TagDefinition['dataType']>([
  'FLOAT32',
  'INT16',
  'INT32',
  'BOOL',
  'STRING',
]);
const ACCESS_MODES = new Set<TagDefinition['accessMode']>(['READ', 'WRITE', 'READ_WRITE']);
const MODBUS_REGISTERS = new Set<NonNullable<TagDefinition['modbusRegister']>>([
  'holding',
  'input',
  'coil',
  'discrete',
]);

function nonEmptyString(value: unknown, field: string, maximumLength: number): string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > maximumLength) {
    throw new Error(`${field} must be a non-empty string up to ${maximumLength} characters`);
  }
  return value;
}

function optionalFiniteNumber(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number`);
  }
  return value;
}

function boundedInteger(value: unknown, field: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${field} must be an integer from ${minimum} to ${maximum}`);
  }
  return value as number;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new Error(`${field} must be a boolean`);
  return value;
}

export function parseTagDefinitions(input: unknown): TagDefinition[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > 10000) {
    throw new Error('Tag configuration must be a non-empty array of at most 10000 tags');
  }

  const ids = new Set<string>();
  return input.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new Error(`Tag at index ${index} must be an object`);
    }
    const raw = candidate as Record<string, unknown>;
    const id = nonEmptyString(raw.id, `Tag ${index} id`, 128);
    if (!/^[A-Za-z0-9_.:-]+$/.test(id)) {
      throw new Error(`Tag ${id} contains unsupported identifier characters`);
    }
    if (ids.has(id)) throw new Error(`Duplicate tag id: ${id}`);
    ids.add(id);

    if (!PROTOCOLS.has(raw.protocol as TagDefinition['protocol'])) {
      throw new Error(`Tag ${id} has unsupported protocol`);
    }
    if (!DATA_TYPES.has(raw.dataType as TagDefinition['dataType'])) {
      throw new Error(`Tag ${id} has unsupported dataType`);
    }
    if (!ACCESS_MODES.has(raw.accessMode as TagDefinition['accessMode'])) {
      throw new Error(`Tag ${id} has unsupported accessMode`);
    }

    const engLow = optionalFiniteNumber(raw.engLow, `Tag ${id} engLow`);
    const engHigh = optionalFiniteNumber(raw.engHigh, `Tag ${id} engHigh`);
    if (engLow !== undefined && engHigh !== undefined && engLow > engHigh) {
      throw new Error(`Tag ${id} engLow cannot exceed engHigh`);
    }

    const tag: TagDefinition = {
      id,
      name: nonEmptyString(raw.name, `Tag ${id} name`, 256),
      protocol: raw.protocol as TagDefinition['protocol'],
      address: nonEmptyString(raw.address, `Tag ${id} address`, 512),
      dataType: raw.dataType as TagDefinition['dataType'],
      accessMode: raw.accessMode as TagDefinition['accessMode'],
      engineeringUnits:
        raw.engineeringUnits === undefined
          ? undefined
          : nonEmptyString(raw.engineeringUnits, `Tag ${id} engineeringUnits`, 64),
      engLow,
      engHigh,
    };

    if (tag.protocol === 'modbus') {
      if (
        !MODBUS_REGISTERS.has(raw.modbusRegister as NonNullable<TagDefinition['modbusRegister']>)
      ) {
        throw new Error(`Modbus tag ${id} requires a valid modbusRegister`);
      }
      if (tag.dataType === 'STRING') throw new Error(`Modbus tag ${id} cannot use STRING data`);
      if (['coil', 'discrete'].includes(raw.modbusRegister as string) && tag.dataType !== 'BOOL') {
        throw new Error(`Bit-addressed Modbus tag ${id} must use BOOL data`);
      }
      if (
        ['input', 'discrete'].includes(raw.modbusRegister as string) &&
        tag.accessMode !== 'READ'
      ) {
        throw new Error(`Read-only Modbus register ${id} cannot use ${tag.accessMode} access`);
      }
      tag.modbusRegister = raw.modbusRegister as NonNullable<TagDefinition['modbusRegister']>;
      tag.modbusOffset = boundedInteger(raw.modbusOffset, `Tag ${id} modbusOffset`, 0, 65535);
      tag.modbusSlave = boundedInteger(raw.modbusSlave, `Tag ${id} modbusSlave`, 1, 247);
      tag.modbusByteSwap = optionalBoolean(raw.modbusByteSwap, `Tag ${id} modbusByteSwap`);
      tag.modbusWordSwap = optionalBoolean(raw.modbusWordSwap, `Tag ${id} modbusWordSwap`);
    }

    return tag;
  });
}

export class TagRegistry {
  private tags = new Map<string, TagDefinition>();
  private values = new Map<string, TagValue>();

  /**
   * Load tag definitions from tags.json
   */
  async loadTags(allowDefaults = process.env.NODE_ENV !== 'production'): Promise<void> {
    const tagsPath = join(__dirname, '..', 'tags.json');

    if (!existsSync(tagsPath)) {
      if (!allowDefaults) throw new Error(`Required tag configuration not found: ${tagsPath}`);
      console.log('[TagRegistry] No tags.json found, using default tags');
      this.loadDefaultTags();
      return;
    }

    try {
      const content = readFileSync(tagsPath, 'utf-8');
      const tagList = parseTagDefinitions(JSON.parse(content));
      this.replaceTags(tagList);

      console.log(`[TagRegistry] Loaded ${this.tags.size} tags from tags.json`);
    } catch (err) {
      if (!allowDefaults) throw err;
      console.error('[TagRegistry] Failed to load tags.json:', err);
      this.loadDefaultTags();
    }
  }

  /**
   * Load default demo tags
   */
  private loadDefaultTags(): void {
    const defaultTags: TagDefinition[] = [
      // Roller Mills - OPC-UA
      {
        id: 'RM101.ST001.PV',
        name: 'Roller Mill 101 Speed',
        protocol: 'opcua',
        address: 'ns=2;s=RM101.Speed',
        dataType: 'FLOAT32',
        accessMode: 'READ',
        engineeringUnits: 'RPM',
        engLow: 0,
        engHigh: 2000,
      },
      {
        id: 'RM101.TT001.PV',
        name: 'Roller Mill 101 Temperature',
        protocol: 'opcua',
        address: 'ns=2;s=RM101.Temperature',
        dataType: 'FLOAT32',
        accessMode: 'READ',
        engineeringUnits: 'C',
        engLow: 0,
        engHigh: 100,
      },
      {
        id: 'RM101.VT001.PV',
        name: 'Roller Mill 101 Vibration',
        protocol: 'opcua',
        address: 'ns=2;s=RM101.Vibration',
        dataType: 'FLOAT32',
        accessMode: 'READ',
        engineeringUnits: 'mm/s',
        engLow: 0,
        engHigh: 10,
      },

      // Silos - Modbus
      {
        id: 'SILO_ALPHA.LT001.PV',
        name: 'Silo Alpha Level',
        protocol: 'modbus',
        address: '40001',
        dataType: 'FLOAT32',
        accessMode: 'READ',
        engineeringUnits: '%',
        engLow: 0,
        engHigh: 100,
        modbusRegister: 'holding',
        modbusOffset: 0,
        modbusSlave: 1,
      },
      {
        id: 'SILO_ALPHA.TT001.PV',
        name: 'Silo Alpha Temperature',
        protocol: 'modbus',
        address: '40003',
        dataType: 'FLOAT32',
        accessMode: 'READ',
        engineeringUnits: 'C',
        engLow: -20,
        engHigh: 60,
        modbusRegister: 'holding',
        modbusOffset: 2,
        modbusSlave: 1,
      },

      // Packers - Modbus
      {
        id: 'PACKER_1.CT001.PV',
        name: 'Packer 1 Bag Count',
        protocol: 'modbus',
        address: '40101',
        dataType: 'INT32',
        accessMode: 'READ',
        engineeringUnits: 'bags',
        engLow: 0,
        engHigh: 10000,
        modbusRegister: 'holding',
        modbusOffset: 100,
        modbusSlave: 2,
      },
    ];

    this.replaceTags(defaultTags);

    console.log(`[TagRegistry] Loaded ${this.tags.size} default tags`);
  }

  private replaceTags(tags: TagDefinition[]): void {
    this.tags.clear();
    this.values.clear();
    tags.forEach((tag) => {
      this.tags.set(tag.id, tag);
      this.values.set(tag.id, {
        tagId: tag.id,
        value: 0,
        quality: 'BAD',
        timestamp: Date.now(),
      });
    });
  }

  /**
   * Get tag definition by ID
   */
  getTagDefinition(tagId: string): TagDefinition | null {
    return this.tags.get(tagId) ?? null;
  }

  /**
   * Get all tags for a specific protocol
   */
  getTagsByProtocol(protocol: 'opcua' | 'modbus'): TagDefinition[] {
    return Array.from(this.tags.values()).filter((t) => t.protocol === protocol);
  }

  /**
   * Get current value for a tag
   */
  getValue(tagId: string): TagValue | null {
    return this.values.get(tagId) ?? null;
  }

  /**
   * Get all current values
   */
  getAllValues(): TagValue[] {
    return Array.from(this.values.values());
  }

  /**
   * Update a tag value
   */
  updateValue(tagId: string, value: unknown, quality: string): void {
    const existing = this.values.get(tagId);
    if (existing) {
      this.values.set(tagId, {
        tagId,
        value,
        quality,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Get total tag count
   */
  getTagCount(): number {
    return this.tags.size;
  }
}
