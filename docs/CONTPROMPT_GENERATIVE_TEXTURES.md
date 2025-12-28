# Continuation Prompt: Generative Textures

## Objective

Create procedural, code-generated textures that enhance the low-poly aesthetic without external assets. Textures should add surface interest while respecting the geometric simplicity - subtle variation, not photorealistic detail.

**The Pitch:** "Even the textures are agent-generated. No image files, just algorithms."

**Aesthetic Principles:**
- Complement low-poly, don't fight it
- Subtle variation over busy detail
- Coherent across the factory
- Stylized industrial, not photorealistic

**Performance Constraints:**
- Generate textures once at startup, cache as THREE.DataTexture
- Target 256x256 or 512x512 resolution (sufficient for stylized look)
- Use WebGL-friendly operations
- No runtime regeneration (static textures)

---

## Part 1: Texture Generation System

### 1.1 Core Texture Generator

**File:** `src/utils/textureGenerator.ts`

```typescript
import * as THREE from 'three';

/**
 * Procedural texture generation utilities.
 * All textures generated once at init, cached as DataTextures.
 */

// Texture cache
const textureCache = new Map<string, THREE.DataTexture>();

// Noise functions
const hash = (x: number, y: number): number => {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
};

const smoothNoise = (x: number, y: number): number => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;

  // Smoothstep interpolation
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const n00 = hash(ix, iy);
  const n10 = hash(ix + 1, iy);
  const n01 = hash(ix, iy + 1);
  const n11 = hash(ix + 1, iy + 1);

  const nx0 = n00 * (1 - sx) + n10 * sx;
  const nx1 = n01 * (1 - sx) + n11 * sx;

  return nx0 * (1 - sy) + nx1 * sy;
};

const fbmNoise = (x: number, y: number, octaves: number = 4): number => {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += smoothNoise(x * frequency, y * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return value / maxValue;
};

// Voronoi for cell patterns
const voronoi = (x: number, y: number, scale: number = 1): { dist: number; edge: number } => {
  const ix = Math.floor(x * scale);
  const iy = Math.floor(y * scale);
  const fx = (x * scale) - ix;
  const fy = (y * scale) - iy;

  let minDist = 1.0;
  let secondDist = 1.0;

  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      const cellX = hash(ix + ox, iy + oy);
      const cellY = hash(iy + oy, ix + ox);
      const dx = ox + cellX - fx;
      const dy = oy + cellY - fy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < minDist) {
        secondDist = minDist;
        minDist = dist;
      } else if (dist < secondDist) {
        secondDist = dist;
      }
    }
  }

  return { dist: minDist, edge: secondDist - minDist };
};

/**
 * Create a DataTexture from pixel data.
 */
const createDataTexture = (
  data: Uint8Array,
  width: number,
  height: number
): THREE.DataTexture => {
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
};

/**
 * Get or generate a cached texture.
 */
export const getTexture = (
  name: string,
  generator: () => THREE.DataTexture
): THREE.DataTexture => {
  if (textureCache.has(name)) {
    return textureCache.get(name)!;
  }

  const texture = generator();
  textureCache.set(name, texture);
  return texture;
};

/**
 * Dispose all cached textures.
 */
export const disposeAllTextures = (): void => {
  textureCache.forEach((texture) => texture.dispose());
  textureCache.clear();
};

export { hash, smoothNoise, fbmNoise, voronoi, createDataTexture };
```

---

## Part 2: Industrial Surface Textures

### 2.1 Brushed Metal Texture

Subtle directional scratches on metallic surfaces.

**File:** `src/textures/brushedMetal.ts`

```typescript
import * as THREE from 'three';
import { getTexture, fbmNoise, hash, createDataTexture } from '../utils/textureGenerator';

/**
 * Generates brushed metal texture with directional scratches.
 * Returns: roughness/metalness texture (R=roughness, G=metalness, B=AO)
 */
export const generateBrushedMetal = (
  size: number = 256,
  scratchDensity: number = 0.3,
  scratchDirection: 'horizontal' | 'vertical' | 'diagonal' = 'horizontal'
): THREE.DataTexture => {
  return getTexture(`brushed-metal-${size}-${scratchDensity}-${scratchDirection}`, () => {
    const data = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;

        // Base roughness with noise
        let roughness = 0.25 + fbmNoise(x * 0.02, y * 0.02, 2) * 0.15;

        // Directional scratches
        let scratchCoord: number;
        switch (scratchDirection) {
          case 'horizontal':
            scratchCoord = y;
            break;
          case 'vertical':
            scratchCoord = x;
            break;
          case 'diagonal':
            scratchCoord = (x + y) * 0.707;
            break;
        }

        // Multiple scratch frequencies
        const scratch1 = Math.sin(scratchCoord * 0.5 + hash(Math.floor(scratchCoord * 0.1), 0) * 10);
        const scratch2 = Math.sin(scratchCoord * 2.0 + hash(Math.floor(scratchCoord * 0.3), 1) * 5);
        const scratch3 = Math.sin(scratchCoord * 8.0 + hash(Math.floor(scratchCoord * 0.5), 2) * 3);

        const scratchIntensity = (scratch1 * 0.3 + scratch2 * 0.4 + scratch3 * 0.3);
        const scratchMask = hash(x * 0.1, y * 0.1) > (1 - scratchDensity) ? 1 : 0;

        roughness += scratchIntensity * 0.1 * scratchMask;
        roughness = Math.max(0.15, Math.min(0.5, roughness));

        // High metalness
        const metalness = 0.9 + fbmNoise(x * 0.05, y * 0.05, 1) * 0.1;

        // Subtle AO in scratches
        const ao = 1.0 - Math.abs(scratchIntensity) * 0.1 * scratchMask;

        data[i] = Math.floor(roughness * 255);     // R = roughness
        data[i + 1] = Math.floor(metalness * 255); // G = metalness
        data[i + 2] = Math.floor(ao * 255);        // B = AO
        data[i + 3] = 255;                          // A = 1
      }
    }

    return createDataTexture(data, size, size);
  });
};
```

### 2.2 Painted Metal Texture

Factory equipment with painted surfaces showing subtle wear.

**File:** `src/textures/paintedMetal.ts`

```typescript
import * as THREE from 'three';
import { getTexture, fbmNoise, voronoi, hash, createDataTexture } from '../utils/textureGenerator';

/**
 * Generates painted metal with subtle wear patterns.
 * Returns: color variation texture (RGB = color tint, A = wear amount)
 */
export const generatePaintedMetal = (
  size: number = 256,
  wearAmount: number = 0.2,
  chipScale: number = 8
): THREE.DataTexture => {
  return getTexture(`painted-metal-${size}-${wearAmount}-${chipScale}`, () => {
    const data = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        // Base color variation (subtle tint shifts)
        const tintR = 0.5 + fbmNoise(nx * 3, ny * 3, 2) * 0.1;
        const tintG = 0.5 + fbmNoise(nx * 3 + 100, ny * 3, 2) * 0.1;
        const tintB = 0.5 + fbmNoise(nx * 3, ny * 3 + 100, 2) * 0.1;

        // Wear/chip pattern using voronoi edges
        const vor = voronoi(nx, ny, chipScale);
        const edgeWear = vor.edge < 0.1 ? (0.1 - vor.edge) * 10 : 0;

        // Additional wear from noise
        const noiseWear = fbmNoise(nx * 10, ny * 10, 3);
        const wearThreshold = 1 - wearAmount;
        const wear = noiseWear > wearThreshold ?
          (noiseWear - wearThreshold) / wearAmount : 0;

        // Combine wear sources
        const totalWear = Math.min(1, edgeWear + wear * 0.5);

        // Edge darkening (dirt in crevices)
        const edgeDirt = vor.edge < 0.05 ? 0.1 : 0;

        data[i] = Math.floor((tintR - edgeDirt) * 255);     // R
        data[i + 1] = Math.floor((tintG - edgeDirt) * 255); // G
        data[i + 2] = Math.floor((tintB - edgeDirt) * 255); // B
        data[i + 3] = Math.floor(totalWear * 255);           // A = wear
      }
    }

    return createDataTexture(data, size, size);
  });
};
```

### 2.3 Concrete/Floor Texture

Industrial floor with subtle panel lines and wear paths.

**File:** `src/textures/concrete.ts`

```typescript
import * as THREE from 'three';
import { getTexture, fbmNoise, hash, createDataTexture } from '../utils/textureGenerator';

/**
 * Generates industrial concrete floor texture.
 * Returns: color texture with panel lines and wear
 */
export const generateConcrete = (
  size: number = 512,
  panelSize: number = 64,
  wearPaths: boolean = true
): THREE.DataTexture => {
  return getTexture(`concrete-${size}-${panelSize}-${wearPaths}`, () => {
    const data = new Uint8Array(size * size * 4);

    // Base concrete gray
    const baseR = 0.45;
    const baseG = 0.43;
    const baseB = 0.42;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        // Surface noise (aggregate texture)
        const noise1 = fbmNoise(nx * 20, ny * 20, 3) * 0.08;
        const noise2 = fbmNoise(nx * 50, ny * 50, 2) * 0.04;

        // Panel/tile lines
        const panelX = (x % panelSize) / panelSize;
        const panelY = (y % panelSize) / panelSize;
        const edgeX = panelX < 0.02 || panelX > 0.98 ? 0.05 : 0;
        const edgeY = panelY < 0.02 || panelY > 0.98 ? 0.05 : 0;
        const panelEdge = Math.max(edgeX, edgeY);

        // Wear paths (darker areas where people walk)
        let wear = 0;
        if (wearPaths) {
          // Central corridor wear
          const centerDist = Math.abs(nx - 0.5);
          if (centerDist < 0.15) {
            wear = (0.15 - centerDist) / 0.15 * 0.1;
          }
          // Cross corridors
          const crossDist = Math.abs(ny - 0.5);
          if (crossDist < 0.1) {
            wear = Math.max(wear, (0.1 - crossDist) / 0.1 * 0.08);
          }
        }

        // Combine
        let r = baseR + noise1 + noise2 - panelEdge - wear;
        let g = baseG + noise1 + noise2 - panelEdge - wear;
        let b = baseB + noise1 + noise2 - panelEdge - wear;

        // Slight color variation per panel
        const panelTint = hash(Math.floor(x / panelSize), Math.floor(y / panelSize)) * 0.03;
        r += panelTint;
        g += panelTint * 0.8;
        b += panelTint * 0.6;

        data[i] = Math.floor(Math.max(0, Math.min(1, r)) * 255);
        data[i + 1] = Math.floor(Math.max(0, Math.min(1, g)) * 255);
        data[i + 2] = Math.floor(Math.max(0, Math.min(1, b)) * 255);
        data[i + 3] = 255;
      }
    }

    return createDataTexture(data, size, size);
  });
};

/**
 * Concrete roughness map.
 */
export const generateConcreteRoughness = (size: number = 512): THREE.DataTexture => {
  return getTexture(`concrete-roughness-${size}`, () => {
    const data = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        // High roughness with variation
        const roughness = 0.7 + fbmNoise(nx * 30, ny * 30, 3) * 0.25;

        data[i] = Math.floor(Math.min(1, roughness) * 255);
        data[i + 1] = 0;   // Not used
        data[i + 2] = 0;   // Not used
        data[i + 3] = 255;
      }
    }

    return createDataTexture(data, size, size);
  });
};
```

---

## Part 3: Specialty Textures

### 3.1 Grain/Product Texture

For silos and product flow visualization.

**File:** `src/textures/grain.ts`

```typescript
import * as THREE from 'three';
import { getTexture, hash, fbmNoise, createDataTexture } from '../utils/textureGenerator';

/**
 * Generates grain particle texture for silos/product areas.
 * Stylized grain kernels as color pattern.
 */
export const generateGrainPattern = (
  size: number = 256,
  density: number = 0.4,
  grainColor: { r: number; g: number; b: number } = { r: 0.85, g: 0.75, b: 0.45 }
): THREE.DataTexture => {
  return getTexture(`grain-${size}-${density}`, () => {
    const data = new Uint8Array(size * size * 4);

    // Background color (darker)
    const bgR = grainColor.r * 0.3;
    const bgG = grainColor.g * 0.3;
    const bgB = grainColor.b * 0.3;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        // Start with background
        let r = bgR;
        let g = bgG;
        let b = bgB;

        // Scatter grain particles
        const cellSize = 8;
        const cellX = Math.floor(x / cellSize);
        const cellY = Math.floor(y / cellSize);
        const localX = (x % cellSize) / cellSize;
        const localY = (y % cellSize) / cellSize;

        // Each cell might have a grain kernel
        if (hash(cellX, cellY) < density) {
          // Kernel center offset within cell
          const kernelX = 0.3 + hash(cellX + 1, cellY) * 0.4;
          const kernelY = 0.3 + hash(cellX, cellY + 1) * 0.4;

          // Distance to kernel center
          const dx = localX - kernelX;
          const dy = (localY - kernelY) * 1.5; // Elongated
          const dist = Math.sqrt(dx * dx + dy * dy);

          // Kernel shape
          if (dist < 0.25) {
            const kernelIntensity = 1 - dist / 0.25;
            const colorVar = hash(cellX * 2, cellY * 2) * 0.2;

            r = grainColor.r * (0.8 + colorVar) * kernelIntensity + r * (1 - kernelIntensity);
            g = grainColor.g * (0.8 + colorVar) * kernelIntensity + g * (1 - kernelIntensity);
            b = grainColor.b * (0.8 + colorVar) * kernelIntensity + b * (1 - kernelIntensity);
          }
        }

        // Add subtle noise
        const noise = fbmNoise(nx * 10, ny * 10, 2) * 0.1;
        r += noise;
        g += noise;
        b += noise;

        data[i] = Math.floor(Math.max(0, Math.min(1, r)) * 255);
        data[i + 1] = Math.floor(Math.max(0, Math.min(1, g)) * 255);
        data[i + 2] = Math.floor(Math.max(0, Math.min(1, b)) * 255);
        data[i + 3] = 255;
      }
    }

    return createDataTexture(data, size, size);
  });
};
```

### 3.2 Rust/Weathering Texture

For aged equipment accents.

**File:** `src/textures/rust.ts`

```typescript
import * as THREE from 'three';
import { getTexture, fbmNoise, voronoi, hash, createDataTexture } from '../utils/textureGenerator';

/**
 * Generates rust/weathering pattern.
 * Use as mask or blend texture.
 */
export const generateRustPattern = (
  size: number = 256,
  rustAmount: number = 0.3,
  streakDirection: 'down' | 'radial' = 'down'
): THREE.DataTexture => {
  return getTexture(`rust-${size}-${rustAmount}-${streakDirection}`, () => {
    const data = new Uint8Array(size * size * 4);

    // Rust colors (orange-brown spectrum)
    const rustColors = [
      { r: 0.6, g: 0.3, b: 0.1 },  // Dark rust
      { r: 0.7, g: 0.4, b: 0.15 }, // Medium rust
      { r: 0.8, g: 0.5, b: 0.2 },  // Light rust
    ];

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        // Base rust pattern from noise
        const rustNoise = fbmNoise(nx * 8, ny * 8, 4);

        // Streak effect
        let streakIntensity = 0;
        if (streakDirection === 'down') {
          // Vertical streaks (rain/drip patterns)
          const streakNoise = fbmNoise(nx * 20, ny * 2, 2);
          streakIntensity = streakNoise * (ny * 0.5 + 0.5); // Stronger toward bottom
        } else {
          // Radial from edges
          const edgeDist = Math.min(nx, 1 - nx, ny, 1 - ny) * 2;
          streakIntensity = 1 - edgeDist;
        }

        // Combine for rust mask
        const rustMask = rustNoise * 0.6 + streakIntensity * 0.4;
        const isRusted = rustMask > (1 - rustAmount);

        if (isRusted) {
          // Pick rust color based on intensity
          const intensity = (rustMask - (1 - rustAmount)) / rustAmount;
          const colorIndex = Math.min(2, Math.floor(intensity * 3));
          const color = rustColors[colorIndex];

          // Add variation
          const variation = hash(x, y) * 0.1;

          data[i] = Math.floor((color.r + variation) * 255);
          data[i + 1] = Math.floor((color.g + variation * 0.5) * 255);
          data[i + 2] = Math.floor((color.b) * 255);
          data[i + 3] = Math.floor(intensity * 255); // Alpha = rust intensity
        } else {
          // Transparent (no rust)
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
          data[i + 3] = 0;
        }
      }
    }

    return createDataTexture(data, size, size);
  });
};
```

### 3.3 Safety Stripe Pattern

For hazard areas and equipment.

**File:** `src/textures/safetyStripe.ts`

```typescript
import * as THREE from 'three';
import { getTexture, fbmNoise, createDataTexture } from '../utils/textureGenerator';

/**
 * Generates safety stripe (hazard) pattern.
 */
export const generateSafetyStripe = (
  size: number = 256,
  stripeWidth: number = 32,
  colors: { primary: string; secondary: string } = {
    primary: '#f59e0b',  // Amber
    secondary: '#1f2937' // Dark gray
  }
): THREE.DataTexture => {
  return getTexture(`safety-stripe-${size}-${stripeWidth}`, () => {
    const data = new Uint8Array(size * size * 4);

    // Parse colors
    const primary = {
      r: parseInt(colors.primary.slice(1, 3), 16) / 255,
      g: parseInt(colors.primary.slice(3, 5), 16) / 255,
      b: parseInt(colors.primary.slice(5, 7), 16) / 255,
    };
    const secondary = {
      r: parseInt(colors.secondary.slice(1, 3), 16) / 255,
      g: parseInt(colors.secondary.slice(3, 5), 16) / 255,
      b: parseInt(colors.secondary.slice(5, 7), 16) / 255,
    };

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

        let r, g, b;
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
```

---

## Part 4: Normal Map Generation

### 4.1 Normal from Height

Convert height data to normal maps for surface detail.

**File:** `src/textures/normalGenerator.ts`

```typescript
import * as THREE from 'three';
import { getTexture, fbmNoise, createDataTexture } from '../utils/textureGenerator';

/**
 * Generate normal map from procedural height data.
 */
export const generateProceduralNormal = (
  size: number = 256,
  bumpScale: number = 1.0,
  noiseScale: number = 10
): THREE.DataTexture => {
  return getTexture(`procedural-normal-${size}-${bumpScale}-${noiseScale}`, () => {
    const data = new Uint8Array(size * size * 4);

    // First pass: generate height map
    const heights = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = x / size;
        const ny = y / size;
        heights[y * size + x] = fbmNoise(nx * noiseScale, ny * noiseScale, 4);
      }
    }

    // Second pass: compute normals from height differences
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;

        // Sample neighboring heights (with wrapping)
        const left = heights[y * size + ((x - 1 + size) % size)];
        const right = heights[y * size + ((x + 1) % size)];
        const up = heights[((y - 1 + size) % size) * size + x];
        const down = heights[((y + 1) % size) * size + x];

        // Compute gradient
        const dx = (right - left) * bumpScale;
        const dy = (down - up) * bumpScale;

        // Normal vector (pointing up with perturbation)
        const nx = -dx;
        const ny = -dy;
        const nz = 1.0;

        // Normalize
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        const nnx = nx / len;
        const nny = ny / len;
        const nnz = nz / len;

        // Encode to 0-255 range (normal maps use 128 as zero)
        data[i] = Math.floor((nnx * 0.5 + 0.5) * 255);     // R = X
        data[i + 1] = Math.floor((nny * 0.5 + 0.5) * 255); // G = Y
        data[i + 2] = Math.floor((nnz * 0.5 + 0.5) * 255); // B = Z
        data[i + 3] = 255;
      }
    }

    return createDataTexture(data, size, size);
  });
};

/**
 * Generate panel/grid normal map for industrial surfaces.
 */
export const generatePanelNormal = (
  size: number = 256,
  panelCount: number = 4,
  bevelWidth: number = 0.02
): THREE.DataTexture => {
  return getTexture(`panel-normal-${size}-${panelCount}-${bevelWidth}`, () => {
    const data = new Uint8Array(size * size * 4);
    const panelSize = 1.0 / panelCount;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        // Position within panel
        const px = (nx % panelSize) / panelSize;
        const py = (ny % panelSize) / panelSize;

        // Default: flat normal (pointing up)
        let normalX = 0;
        let normalY = 0;
        let normalZ = 1;

        // Bevel at edges
        if (px < bevelWidth) {
          normalX = -(bevelWidth - px) / bevelWidth * 0.5;
        } else if (px > 1 - bevelWidth) {
          normalX = (px - (1 - bevelWidth)) / bevelWidth * 0.5;
        }

        if (py < bevelWidth) {
          normalY = -(bevelWidth - py) / bevelWidth * 0.5;
        } else if (py > 1 - bevelWidth) {
          normalY = (py - (1 - bevelWidth)) / bevelWidth * 0.5;
        }

        // Normalize
        const len = Math.sqrt(normalX * normalX + normalY * normalY + normalZ * normalZ);

        data[i] = Math.floor((normalX / len * 0.5 + 0.5) * 255);
        data[i + 1] = Math.floor((normalY / len * 0.5 + 0.5) * 255);
        data[i + 2] = Math.floor((normalZ / len * 0.5 + 0.5) * 255);
        data[i + 3] = 255;
      }
    }

    return createDataTexture(data, size, size);
  });
};
```

---

## Part 5: Material Integration

### 5.1 Texture-Enhanced Materials

**File:** `src/materials/generativeMaterials.ts`

```typescript
import * as THREE from 'three';
import { generateBrushedMetal } from '../textures/brushedMetal';
import { generatePaintedMetal } from '../textures/paintedMetal';
import { generateConcrete, generateConcreteRoughness } from '../textures/concrete';
import { generateProceduralNormal, generatePanelNormal } from '../textures/normalGenerator';

/**
 * Factory for materials using generative textures.
 * All textures generated on first use, then cached.
 */

export const createBrushedMetalMaterial = (
  color: string = '#6b7280'
): THREE.MeshStandardMaterial => {
  const roughnessMap = generateBrushedMetal(256, 0.4, 'horizontal');

  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.9,
    roughness: 0.3,
    roughnessMap,
    envMapIntensity: 1.0,
  });
};

export const createPaintedMetalMaterial = (
  color: string = '#2563eb',
  wear: number = 0.2
): THREE.MeshStandardMaterial => {
  const wearMap = generatePaintedMetal(256, wear, 8);
  const normalMap = generateProceduralNormal(256, 0.5, 15);

  const material = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.3,
    roughness: 0.6,
    normalMap,
    normalScale: new THREE.Vector2(0.3, 0.3),
  });

  // Custom shader chunk to apply wear
  material.onBeforeCompile = (shader) => {
    shader.uniforms.wearMap = { value: wearMap };

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
      #include <map_fragment>
      vec4 wearSample = texture2D(wearMap, vMapUv);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.7, wearSample.a * 0.3);
      `
    );
  };

  return material;
};

export const createConcreteMaterial = (): THREE.MeshStandardMaterial => {
  const colorMap = generateConcrete(512, 64, true);
  const roughnessMap = generateConcreteRoughness(512);
  const normalMap = generatePanelNormal(512, 8, 0.03);

  return new THREE.MeshStandardMaterial({
    map: colorMap,
    roughnessMap,
    roughness: 0.8,
    metalness: 0.0,
    normalMap,
    normalScale: new THREE.Vector2(0.2, 0.2),
  });
};

export const createIndustrialFloorMaterial = (): THREE.MeshStandardMaterial => {
  const colorMap = generateConcrete(512, 128, true);
  const roughnessMap = generateConcreteRoughness(512);

  return new THREE.MeshStandardMaterial({
    map: colorMap,
    roughnessMap,
    roughness: 0.75,
    metalness: 0.0,
    envMapIntensity: 0.3,
  });
};
```

---

## Part 6: Preload System

### 6.1 Texture Preloader

Generate all textures at startup to avoid runtime hitches.

**File:** `src/utils/texturePreloader.ts`

```typescript
import { generateBrushedMetal } from '../textures/brushedMetal';
import { generatePaintedMetal } from '../textures/paintedMetal';
import { generateConcrete, generateConcreteRoughness } from '../textures/concrete';
import { generateGrainPattern } from '../textures/grain';
import { generateRustPattern } from '../textures/rust';
import { generateSafetyStripe } from '../textures/safetyStripe';
import { generateProceduralNormal, generatePanelNormal } from '../textures/normalGenerator';
import { logger } from './logger';

/**
 * Preload all generative textures at startup.
 * Call once in App initialization.
 */
export const preloadGenerativeTextures = (): Promise<void> => {
  return new Promise((resolve) => {
    logger.info('[Textures] Generating procedural textures...');
    const startTime = performance.now();

    // Generate all textures (they auto-cache)
    generateBrushedMetal(256, 0.3, 'horizontal');
    generateBrushedMetal(256, 0.4, 'vertical');
    generatePaintedMetal(256, 0.2, 8);
    generatePaintedMetal(256, 0.4, 6);
    generateConcrete(512, 64, true);
    generateConcrete(512, 128, false);
    generateConcreteRoughness(512);
    generateGrainPattern(256, 0.4);
    generateRustPattern(256, 0.3, 'down');
    generateSafetyStripe(256, 32);
    generateProceduralNormal(256, 1.0, 10);
    generateProceduralNormal(256, 0.5, 20);
    generatePanelNormal(256, 4, 0.02);
    generatePanelNormal(256, 8, 0.03);

    const elapsed = performance.now() - startTime;
    logger.info(`[Textures] Generated ${14} textures in ${elapsed.toFixed(1)}ms`);

    resolve();
  });
};
```

### 6.2 Add to App Initialization

**File:** Update `src/App.tsx`

```tsx
import { preloadGenerativeTextures } from './utils/texturePreloader';

// In useEffect or initialization
useEffect(() => {
  preloadGenerativeTextures().then(() => {
    console.log('Generative textures ready');
  });
}, []);
```

---

## Part 7: Usage Examples

### 7.1 Apply to Existing Machines

**File:** Update machine materials

```typescript
import {
  createBrushedMetalMaterial,
  createPaintedMetalMaterial,
  createIndustrialFloorMaterial,
} from '../materials/generativeMaterials';

// In machine component
const housingMaterial = createPaintedMetalMaterial('#2563eb', 0.15);
const frameMaterial = createBrushedMetalMaterial('#4b5563');
const floorMaterial = createIndustrialFloorMaterial();
```

### 7.2 Apply to Floor

```tsx
import { createIndustrialFloorMaterial } from '../materials/generativeMaterials';

const FloorPlane: React.FC = () => {
  const material = useMemo(() => createIndustrialFloorMaterial(), []);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[200, 200]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
};
```

---

## Performance Notes

### Generation Time
- 256x256 texture: ~5-10ms
- 512x512 texture: ~20-40ms
- All textures preloaded at startup: ~200-400ms total

### Memory
- 256x256 RGBA: 256KB per texture
- 512x512 RGBA: 1MB per texture
- Total with ~14 textures: ~8-10MB

### GPU
- DataTextures upload once
- Mipmaps generated automatically
- Standard texture sampling (no runtime cost)

---

## Validation Checklist

- [ ] `npm run build` passes
- [ ] All textures generate without errors
- [ ] Preloader completes in <500ms
- [ ] Brushed metal shows directional scratches
- [ ] Painted metal shows subtle wear
- [ ] Concrete shows panel lines and wear paths
- [ ] Grain pattern is recognizable but stylized
- [ ] Normal maps add subtle depth
- [ ] Textures tile seamlessly
- [ ] No runtime generation (all cached)
- [ ] Memory usage reasonable (<15MB for textures)

---

## The Impact

When demonstrating:

> "Even the textures are procedurally generated. No image files - just noise functions and math. The brushed metal, the worn concrete, the grain patterns - all algorithms."

The textures add surface interest without fighting the low-poly aesthetic. They're subtle enough to complement simple geometry while proving that agents can generate sophisticated visual detail from pure code.

Agent-built, all the way down.
