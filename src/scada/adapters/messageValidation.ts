/**
 * Message Validation Utilities for SCADA Protocol Adapters
 *
 * Provides type-safe validation for incoming protocol messages to prevent
 * runtime errors from malformed or malicious data.
 */

/** Valid WebSocket message types */
type WSMessageType =
  | 'subscribe'
  | 'unsubscribe'
  | 'write'
  | 'update'
  | 'batch'
  | 'snapshot'
  | 'error'
  | 'ping'
  | 'pong';

/** Valid MQTT message payload structure */
interface MQTTTagPayload {
  tagId: string;
  value: number | boolean | string;
  quality: string;
  timestamp: number;
  sourceTimestamp?: number;
}

/** WebSocket message structure */
interface WSMessage {
  type: WSMessageType;
  tagId?: string;
  tagIds?: string[];
  value?: number | boolean | string;
  quality?: string;
  timestamp?: number;
  tags?: Array<{
    tagId: string;
    value: number | boolean | string;
    quality: string;
    timestamp: number;
  }>;
  error?: string;
}

/**
 * Defensive protocol limits. These align the browser adapters with the proxy's
 * 32 KiB WebSocket ceiling while also bounding nested collections and fields.
 */
export const MAX_SCADA_MESSAGE_BYTES = 32 * 1024;
export const MAX_SCADA_TAG_ID_BYTES = 256;
export const MAX_SCADA_TAG_IDS = 256;
export const MAX_SCADA_BATCH_TAGS = 256;
export const MAX_SCADA_STRING_VALUE_BYTES = 1024;
export const MAX_SCADA_QUALITY_BYTES = 32;
export const MAX_SCADA_ERROR_BYTES = 512;

const textEncoder = new TextEncoder();

function isBoundedString(
  value: unknown,
  minimumBytes: number,
  maximumBytes: number
): value is string {
  if (typeof value !== 'string' || value.length < minimumBytes || value.length > maximumBytes) {
    return false;
  }

  const byteLength = textEncoder.encode(value).byteLength;
  return byteLength >= minimumBytes && byteLength <= maximumBytes;
}

function isValidTagId(value: unknown): value is string {
  return isBoundedString(value, 1, MAX_SCADA_TAG_ID_BYTES);
}

function isValidTagValue(value: unknown): value is number | boolean | string {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  return isBoundedString(value, 0, MAX_SCADA_STRING_VALUE_BYTES);
}

function isValidTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Reject oversized or non-text protocol payloads before JSON parsing. */
export function isAcceptableSCADAPayloadText(data: unknown): data is string {
  if (typeof data !== 'string' || data.length > MAX_SCADA_MESSAGE_BYTES) {
    return false;
  }

  return textEncoder.encode(data).byteLength <= MAX_SCADA_MESSAGE_BYTES;
}

/**
 * Type guard: Validates WebSocket message structure
 *
 * @param data - Unknown data from JSON.parse
 * @returns True if data conforms to WSMessage interface
 */
export function isValidWSMessage(data: unknown): data is WSMessage {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const msg = data as Record<string, unknown>;

  // Validate required 'type' field
  if (typeof msg.type !== 'string') {
    return false;
  }

  const validTypes: WSMessageType[] = [
    'subscribe',
    'unsubscribe',
    'write',
    'update',
    'batch',
    'snapshot',
    'error',
    'ping',
    'pong',
  ];

  if (!validTypes.includes(msg.type as WSMessageType)) {
    return false;
  }

  // Validate type-specific required fields
  switch (msg.type) {
    case 'update':
      // 'update' requires a bounded tagId and a concrete primitive value.
      if (!isValidTagId(msg.tagId) || !isValidTagValue(msg.value)) {
        return false;
      }
      break;

    case 'write': {
      // 'write' requires tagId and value
      if (!isValidTagId(msg.tagId) || !isValidTagValue(msg.value)) {
        return false;
      }
      break;
    }

    case 'subscribe':
    case 'unsubscribe':
      // Requires tagIds array
      if (!Array.isArray(msg.tagIds) || msg.tagIds.length > MAX_SCADA_TAG_IDS) {
        return false;
      }
      if (!msg.tagIds.every(isValidTagId)) {
        return false;
      }
      break;

    case 'batch':
    case 'snapshot':
      // Requires tags array
      if (!Array.isArray(msg.tags) || msg.tags.length > MAX_SCADA_BATCH_TAGS) {
        return false;
      }
      // Validate each tag in the batch
      for (const tag of msg.tags) {
        if (!isValidBatchTag(tag)) {
          return false;
        }
      }
      break;

    case 'error':
      // Optional error message
      if (msg.error !== undefined && !isBoundedString(msg.error, 0, MAX_SCADA_ERROR_BYTES)) {
        return false;
      }
      break;

    case 'ping':
    case 'pong':
      // No additional validation needed
      break;
  }

  // Validate optional fields if present
  if (msg.quality !== undefined && !isBoundedString(msg.quality, 0, MAX_SCADA_QUALITY_BYTES)) {
    return false;
  }

  if (msg.timestamp !== undefined && !isValidTimestamp(msg.timestamp)) {
    return false;
  }

  return true;
}

/**
 * Type guard: Validates individual tag in batch message
 *
 * @param tag - Unknown tag data from batch
 * @returns True if tag has valid structure
 */
function isValidBatchTag(tag: unknown): boolean {
  if (typeof tag !== 'object' || tag === null) {
    return false;
  }

  const t = tag as Record<string, unknown>;

  // Required fields
  if (!isValidTagId(t.tagId)) {
    return false;
  }

  if (!isValidTagValue(t.value)) {
    return false;
  }

  if (!isBoundedString(t.quality, 0, MAX_SCADA_QUALITY_BYTES)) {
    return false;
  }

  if (!isValidTimestamp(t.timestamp)) {
    return false;
  }

  return true;
}

/**
 * Type guard: Validates MQTT tag payload structure
 *
 * @param data - Unknown data from JSON.parse
 * @returns True if data conforms to MQTTTagPayload interface
 */
export function isValidMQTTPayload(data: unknown): data is MQTTTagPayload {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const payload = data as Record<string, unknown>;

  // Validate required fields
  if (!isValidTagId(payload.tagId)) {
    return false;
  }

  if (!isValidTagValue(payload.value)) {
    return false;
  }

  if (!isBoundedString(payload.quality, 0, MAX_SCADA_QUALITY_BYTES)) {
    return false;
  }

  if (!isValidTimestamp(payload.timestamp)) {
    return false;
  }

  // Validate optional sourceTimestamp
  if (payload.sourceTimestamp !== undefined && !isValidTimestamp(payload.sourceTimestamp)) {
    return false;
  }

  return true;
}

/**
 * Validation error class for protocol message validation failures
 */
export class MessageValidationError extends Error {
  constructor(
    message: string,
    public readonly receivedData: unknown,
    public readonly protocol: 'WebSocket' | 'MQTT'
  ) {
    super(message);
    this.name = 'MessageValidationError';
  }
}
