import type { TagDefinition } from './TagRegistry';

export interface WriteValidationResult {
  ok: boolean;
  value?: unknown;
  error?: string;
}

const INTEGER_LIMITS = {
  INT16: { minimum: -32768, maximum: 32767 },
  INT32: { minimum: -2147483648, maximum: 2147483647 },
} as const;

export function validateWrite(tag: TagDefinition, value: unknown): WriteValidationResult {
  if (tag.accessMode === 'READ') {
    return { ok: false, error: 'Tag is read-only' };
  }

  switch (tag.dataType) {
    case 'BOOL':
      if (typeof value === 'boolean') return { ok: true, value };
      if (value === 1 || value === '1' || value === 'true') return { ok: true, value: true };
      if (value === 0 || value === '0' || value === 'false') return { ok: true, value: false };
      return { ok: false, error: 'Boolean value required' };

    case 'STRING':
      if (typeof value !== 'string') return { ok: false, error: 'String value required' };
      if (value.length > 1024) return { ok: false, error: 'String value exceeds 1024 characters' };
      return { ok: true, value };

    case 'INT16':
    case 'INT32':
    case 'FLOAT32': {
      const numeric =
        typeof value === 'number'
          ? value
          : typeof value === 'string' && value.trim() !== ''
            ? Number(value)
            : Number.NaN;
      if (!Number.isFinite(numeric)) return { ok: false, error: 'Finite numeric value required' };

      if (tag.dataType !== 'FLOAT32' && !Number.isInteger(numeric)) {
        return { ok: false, error: `${tag.dataType} requires an integer value` };
      }

      const intrinsic = tag.dataType === 'FLOAT32' ? null : INTEGER_LIMITS[tag.dataType];
      const minimum = Math.max(
        tag.engLow ?? Number.NEGATIVE_INFINITY,
        intrinsic?.minimum ?? -3.4e38
      );
      const maximum = Math.min(
        tag.engHigh ?? Number.POSITIVE_INFINITY,
        intrinsic?.maximum ?? 3.4e38
      );
      if (numeric < minimum || numeric > maximum) {
        return { ok: false, error: `Value must be between ${minimum} and ${maximum}` };
      }

      return { ok: true, value: numeric };
    }

    default:
      return { ok: false, error: 'Unsupported data type' };
  }
}
