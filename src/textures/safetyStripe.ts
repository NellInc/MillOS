/**
 * Safety Stripe Pattern Generator
 *
 * For hazard areas and equipment.
 * Classic diagonal warning stripes with subtle wear.
 */

import * as THREE from 'three';
import { getTexture, fbmNoise, createDataTexture } from '../utils/textureGenerator';

export interface StripeColors {
  primary: string; // Hex color
  secondary: string; // Hex color
}

// Default industrial warning colors
const DEFAULT_COLORS: StripeColors = {
  primary: '#f59e0b', // Amber
  secondary: '#1f2937', // Dark gray
};

/**
 * Parse hex color to RGB object (0-1 range).
 */
const parseHex = (hex: string): { r: number; g: number; b: number } => ({
  r: parseInt(hex.slice(1, 3), 16) / 255,
  g: parseInt(hex.slice(3, 5), 16) / 255,
  b: parseInt(hex.slice(5, 7), 16) / 255,
});

/**
 * Generates safety stripe (hazard) pattern.
 */
export const generateSafetyStripe = (
  size: number = 256,
  stripeWidth: number = 32,
  colors: StripeColors = DEFAULT_COLORS
): THREE.DataTexture => {
  return getTexture(`safety-stripe-${size}-${stripeWidth}`, () => {
    const data = new Uint8Array(size * size * 4);

    // Parse colors
    const primary = parseHex(colors.primary);
    const secondary = parseHex(colors.secondary);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;

        // Diagonal stripe
        const diagonal = (x + y) % (stripeWidth * 2);
        const isPrimary = diagonal < stripeWidth;

        // Add subtle wear/noise
        const nx = x / size;
        const ny = y / size;
        const wear = fbmNoise(nx * 15, ny * 15, 2) * 0.1;

        let r: number, g: number, b: number;
        if (isPrimary) {
          r = primary.r - wear;
          g = primary.g - wear;
          b = primary.b - wear;
        } else {
          r = secondary.r - wear * 0.5;
          g = secondary.g - wear * 0.5;
          b = secondary.b - wear * 0.5;
        }

        data[i] = Math.floor(Math.max(0, r) * 255);
        data[i + 1] = Math.floor(Math.max(0, g) * 255);
        data[i + 2] = Math.floor(Math.max(0, b) * 255);
        data[i + 3] = 255;
      }
    }

    return createDataTexture(data, size, size);
  });
};
