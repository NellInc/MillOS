/**
 * Unit tests for SCADA message validation
 */

import { describe, it, expect } from 'vitest';
import {
  isAcceptableSCADAPayloadText,
  isValidMQTTPayload,
  isValidWSMessage,
  MAX_SCADA_BATCH_TAGS,
  MAX_SCADA_ERROR_BYTES,
  MAX_SCADA_MESSAGE_BYTES,
  MAX_SCADA_QUALITY_BYTES,
  MAX_SCADA_STRING_VALUE_BYTES,
  MAX_SCADA_TAG_ID_BYTES,
  MAX_SCADA_TAG_IDS,
  MessageValidationError,
} from '../messageValidation';

describe('WebSocket Message Validation', () => {
  describe('isValidWSMessage', () => {
    it('should accept valid update message', () => {
      const msg = {
        type: 'update',
        tagId: 'SILO_A_LEVEL',
        value: 75.5,
        quality: 'GOOD',
        timestamp: Date.now(),
      };

      expect(isValidWSMessage(msg)).toBe(true);
    });

    it('should accept valid batch message', () => {
      const msg = {
        type: 'batch',
        tags: [
          {
            tagId: 'SILO_A_LEVEL',
            value: 75.5,
            quality: 'GOOD',
            timestamp: Date.now(),
          },
          {
            tagId: 'SILO_B_LEVEL',
            value: 42.0,
            quality: 'GOOD',
            timestamp: Date.now(),
          },
        ],
      };

      expect(isValidWSMessage(msg)).toBe(true);
    });

    it('should accept valid write message', () => {
      const msg = {
        type: 'write',
        tagId: 'MILL_101_SPEED',
        value: 1500,
      };

      expect(isValidWSMessage(msg)).toBe(true);
    });

    it('should accept valid subscribe message', () => {
      const msg = {
        type: 'subscribe',
        tagIds: ['SILO_A_LEVEL', 'SILO_B_LEVEL', 'MILL_101_SPEED'],
      };

      expect(isValidWSMessage(msg)).toBe(true);
    });

    it('should accept valid error message', () => {
      const msg = {
        type: 'error',
        error: 'Connection timeout',
      };

      expect(isValidWSMessage(msg)).toBe(true);
    });

    it('should accept ping/pong messages', () => {
      expect(isValidWSMessage({ type: 'ping' })).toBe(true);
      expect(isValidWSMessage({ type: 'pong' })).toBe(true);
    });

    it('should reject null input', () => {
      expect(isValidWSMessage(null)).toBe(false);
    });

    it('should reject non-object input', () => {
      expect(isValidWSMessage('invalid')).toBe(false);
      expect(isValidWSMessage(123)).toBe(false);
      expect(isValidWSMessage(true)).toBe(false);
    });

    it('should reject message without type field', () => {
      const msg = {
        tagId: 'SILO_A_LEVEL',
        value: 75.5,
      };

      expect(isValidWSMessage(msg)).toBe(false);
    });

    it('should reject message with invalid type', () => {
      const msg = {
        type: 'invalid_type',
        tagId: 'SILO_A_LEVEL',
      };

      expect(isValidWSMessage(msg)).toBe(false);
    });

    it('should reject update message without tagId', () => {
      const msg = {
        type: 'update',
        value: 75.5,
      };

      expect(isValidWSMessage(msg)).toBe(false);
    });

    it('should reject update message with empty tagId', () => {
      const msg = {
        type: 'update',
        tagId: '',
        value: 75.5,
      };

      expect(isValidWSMessage(msg)).toBe(false);
    });

    it('should reject write message without value', () => {
      const msg = {
        type: 'write',
        tagId: 'MILL_101_SPEED',
      };

      expect(isValidWSMessage(msg)).toBe(false);
    });

    it('should reject write message with invalid value type', () => {
      const msg = {
        type: 'write',
        tagId: 'MILL_101_SPEED',
        value: { invalid: 'object' },
      };

      expect(isValidWSMessage(msg)).toBe(false);
    });

    it('should reject subscribe message with non-array tagIds', () => {
      const msg = {
        type: 'subscribe',
        tagIds: 'not-an-array',
      };

      expect(isValidWSMessage(msg)).toBe(false);
    });

    it('should reject subscribe message with invalid tagId in array', () => {
      const msg = {
        type: 'subscribe',
        tagIds: ['VALID_TAG', 123, 'ANOTHER_TAG'],
      };

      expect(isValidWSMessage(msg)).toBe(false);
    });

    it('should reject batch message without tags array', () => {
      const msg = {
        type: 'batch',
      };

      expect(isValidWSMessage(msg)).toBe(false);
    });

    it('should reject batch message with invalid tag structure', () => {
      const msg = {
        type: 'batch',
        tags: [
          {
            tagId: 'SILO_A_LEVEL',
            value: 75.5,
            quality: 'GOOD',
            // Missing timestamp
          },
        ],
      };

      expect(isValidWSMessage(msg)).toBe(false);
    });

    it('should reject message with invalid quality type', () => {
      const msg = {
        type: 'update',
        tagId: 'SILO_A_LEVEL',
        value: 75.5,
        quality: 123,
        timestamp: Date.now(),
      };

      expect(isValidWSMessage(msg)).toBe(false);
    });

    it('should reject message with invalid timestamp type', () => {
      const msg = {
        type: 'update',
        tagId: 'SILO_A_LEVEL',
        value: 75.5,
        quality: 'GOOD',
        timestamp: 'not-a-number',
      };

      expect(isValidWSMessage(msg)).toBe(false);
    });

    it('should accept update message with boolean value', () => {
      const msg = {
        type: 'update',
        tagId: 'MILL_101_RUNNING',
        value: true,
        quality: 'GOOD',
        timestamp: Date.now(),
      };

      expect(isValidWSMessage(msg)).toBe(true);
    });

    it('should accept update message with string value', () => {
      const msg = {
        type: 'update',
        tagId: 'MILL_101_STATUS',
        value: 'RUNNING',
        quality: 'GOOD',
        timestamp: Date.now(),
      };

      expect(isValidWSMessage(msg)).toBe(true);
    });
  });
});

describe('MQTT Payload Validation', () => {
  describe('isValidMQTTPayload', () => {
    it('should accept valid MQTT payload', () => {
      const payload = {
        tagId: 'SILO_A_LEVEL',
        value: 75.5,
        quality: 'GOOD',
        timestamp: Date.now(),
      };

      expect(isValidMQTTPayload(payload)).toBe(true);
    });

    it('should accept valid MQTT payload with sourceTimestamp', () => {
      const payload = {
        tagId: 'SILO_A_LEVEL',
        value: 75.5,
        quality: 'GOOD',
        timestamp: Date.now(),
        sourceTimestamp: Date.now() - 1000,
      };

      expect(isValidMQTTPayload(payload)).toBe(true);
    });

    it('should accept payload with boolean value', () => {
      const payload = {
        tagId: 'MILL_101_RUNNING',
        value: true,
        quality: 'GOOD',
        timestamp: Date.now(),
      };

      expect(isValidMQTTPayload(payload)).toBe(true);
    });

    it('should accept payload with string value', () => {
      const payload = {
        tagId: 'MILL_101_STATUS',
        value: 'RUNNING',
        quality: 'GOOD',
        timestamp: Date.now(),
      };

      expect(isValidMQTTPayload(payload)).toBe(true);
    });

    it('should reject null input', () => {
      expect(isValidMQTTPayload(null)).toBe(false);
    });

    it('should reject non-object input', () => {
      expect(isValidMQTTPayload('invalid')).toBe(false);
      expect(isValidMQTTPayload(123)).toBe(false);
      expect(isValidMQTTPayload(true)).toBe(false);
    });

    it('should reject payload without tagId', () => {
      const payload = {
        value: 75.5,
        quality: 'GOOD',
        timestamp: Date.now(),
      };

      expect(isValidMQTTPayload(payload)).toBe(false);
    });

    it('should reject payload with empty tagId', () => {
      const payload = {
        tagId: '',
        value: 75.5,
        quality: 'GOOD',
        timestamp: Date.now(),
      };

      expect(isValidMQTTPayload(payload)).toBe(false);
    });

    it('should reject payload without value', () => {
      const payload = {
        tagId: 'SILO_A_LEVEL',
        quality: 'GOOD',
        timestamp: Date.now(),
      };

      expect(isValidMQTTPayload(payload)).toBe(false);
    });

    it('should reject payload with invalid value type', () => {
      const payload = {
        tagId: 'SILO_A_LEVEL',
        value: { invalid: 'object' },
        quality: 'GOOD',
        timestamp: Date.now(),
      };

      expect(isValidMQTTPayload(payload)).toBe(false);
    });

    it('should reject payload without quality', () => {
      const payload = {
        tagId: 'SILO_A_LEVEL',
        value: 75.5,
        timestamp: Date.now(),
      };

      expect(isValidMQTTPayload(payload)).toBe(false);
    });

    it('should reject payload with non-string quality', () => {
      const payload = {
        tagId: 'SILO_A_LEVEL',
        value: 75.5,
        quality: 123,
        timestamp: Date.now(),
      };

      expect(isValidMQTTPayload(payload)).toBe(false);
    });

    it('should reject payload without timestamp', () => {
      const payload = {
        tagId: 'SILO_A_LEVEL',
        value: 75.5,
        quality: 'GOOD',
      };

      expect(isValidMQTTPayload(payload)).toBe(false);
    });

    it('should reject payload with non-number timestamp', () => {
      const payload = {
        tagId: 'SILO_A_LEVEL',
        value: 75.5,
        quality: 'GOOD',
        timestamp: 'not-a-number',
      };

      expect(isValidMQTTPayload(payload)).toBe(false);
    });

    it('should reject payload with invalid sourceTimestamp type', () => {
      const payload = {
        tagId: 'SILO_A_LEVEL',
        value: 75.5,
        quality: 'GOOD',
        timestamp: Date.now(),
        sourceTimestamp: 'not-a-number',
      };

      expect(isValidMQTTPayload(payload)).toBe(false);
    });
  });
});

describe('SCADA protocol trust-boundary limits', () => {
  const validTag = {
    tagId: 'SILO_A_LEVEL',
    value: 75.5,
    quality: 'GOOD',
    timestamp: 1_700_000_000_000,
  };

  it('bounds raw text by UTF-8 bytes before JSON parsing', () => {
    expect(isAcceptableSCADAPayloadText('x'.repeat(MAX_SCADA_MESSAGE_BYTES))).toBe(true);
    expect(isAcceptableSCADAPayloadText('x'.repeat(MAX_SCADA_MESSAGE_BYTES + 1))).toBe(false);
    expect(isAcceptableSCADAPayloadText('é'.repeat(MAX_SCADA_MESSAGE_BYTES / 2 + 1))).toBe(false);
    expect(isAcceptableSCADAPayloadText(new ArrayBuffer(8))).toBe(false);
  });

  it('requires bounded identifiers, concrete finite values, and finite timestamps', () => {
    expect(
      isValidWSMessage({
        type: 'update',
        tagId: 'A'.repeat(MAX_SCADA_TAG_ID_BYTES),
        value: 'x'.repeat(MAX_SCADA_STRING_VALUE_BYTES),
        quality: 'Q'.repeat(MAX_SCADA_QUALITY_BYTES),
        timestamp: Number.MAX_SAFE_INTEGER,
      })
    ).toBe(true);
    expect(isValidWSMessage({ type: 'update', tagId: 'A' })).toBe(false);
    expect(
      isValidWSMessage({
        ...validTag,
        type: 'update',
        tagId: 'A'.repeat(MAX_SCADA_TAG_ID_BYTES + 1),
      })
    ).toBe(false);
    expect(isValidWSMessage({ ...validTag, type: 'update', value: Number.POSITIVE_INFINITY })).toBe(
      false
    );
    expect(isValidWSMessage({ ...validTag, type: 'update', timestamp: Number.NaN })).toBe(false);
    expect(
      isValidWSMessage({
        ...validTag,
        type: 'update',
        value: 'x'.repeat(MAX_SCADA_STRING_VALUE_BYTES + 1),
      })
    ).toBe(false);
  });

  it('bounds WebSocket collections and diagnostic strings', () => {
    expect(
      isValidWSMessage({ type: 'subscribe', tagIds: Array(MAX_SCADA_TAG_IDS).fill('TAG') })
    ).toBe(true);
    expect(
      isValidWSMessage({ type: 'subscribe', tagIds: Array(MAX_SCADA_TAG_IDS + 1).fill('TAG') })
    ).toBe(false);
    expect(
      isValidWSMessage({ type: 'batch', tags: Array(MAX_SCADA_BATCH_TAGS).fill(validTag) })
    ).toBe(true);
    expect(
      isValidWSMessage({ type: 'snapshot', tags: Array(MAX_SCADA_BATCH_TAGS + 1).fill(validTag) })
    ).toBe(false);
    expect(isValidWSMessage({ type: 'error', error: 'x'.repeat(MAX_SCADA_ERROR_BYTES + 1) })).toBe(
      false
    );
    expect(
      isValidWSMessage({
        ...validTag,
        type: 'update',
        quality: 'Q'.repeat(MAX_SCADA_QUALITY_BYTES + 1),
      })
    ).toBe(false);
  });

  it('applies the same scalar limits to MQTT payloads', () => {
    expect(isValidMQTTPayload({ ...validTag, sourceTimestamp: Number.MAX_SAFE_INTEGER })).toBe(
      true
    );
    expect(isValidMQTTPayload({ ...validTag, value: Number.NEGATIVE_INFINITY })).toBe(false);
    expect(isValidMQTTPayload({ ...validTag, timestamp: Number.NaN })).toBe(false);
    expect(isValidMQTTPayload({ ...validTag, sourceTimestamp: Number.POSITIVE_INFINITY })).toBe(
      false
    );
    expect(isValidMQTTPayload({ ...validTag, tagId: 'é'.repeat(MAX_SCADA_TAG_ID_BYTES) })).toBe(
      false
    );
  });
});

describe('MessageValidationError', () => {
  it('should create error with correct properties', () => {
    const invalidData = { invalid: 'data' };
    const error = new MessageValidationError('Test error message', invalidData, 'WebSocket');

    expect(error.message).toBe('Test error message');
    expect(error.receivedData).toEqual(invalidData);
    expect(error.protocol).toBe('WebSocket');
    expect(error.name).toBe('MessageValidationError');
  });

  it('should work with MQTT protocol', () => {
    const error = new MessageValidationError('MQTT validation failed', { bad: 'payload' }, 'MQTT');

    expect(error.protocol).toBe('MQTT');
  });
});
