#!/usr/bin/env node
/**
 * Texture Conversion Script
 *
 * Converts JPG/PNG textures to KTX2 format using Basis Universal (basisu).
 * Reduces file sizes by ~75% while maintaining quality.
 *
 * Prerequisites:
 *   - Install basis_universal: brew install basis_universal
 *
 * Usage:
 *   node scripts/convert-textures.mjs [--dry-run] [--force]
 */

import { execSync } from 'child_process';
import { readdirSync, statSync, existsSync, mkdirSync } from 'fs';
import { join, basename, extname } from 'path';

const TEXTURE_DIRS = ['public/textures/machines'];

const OUTPUT_DIR = 'public/textures/compressed';
const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png'];

// KTX2 compression settings for basisu
const COMPRESSION_SETTINGS = {
  // ETC1S for maximum compression (good for diffuse/color maps)
  etc1s: '-ktx2 -etc1s -mipmap',
  // UASTC for higher quality (good for normal maps) with linear colorspace
  uastc: '-ktx2 -uastc -mipmap -linear',
};

function checkBasiuInstalled() {
  try {
    execSync('basisu -version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function findTextures(dir, textures = []) {
  if (!existsSync(dir)) return textures;

  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      findTextures(fullPath, textures);
    } else if (SUPPORTED_EXTENSIONS.includes(extname(entry).toLowerCase())) {
      textures.push(fullPath);
    }
  }
  return textures;
}

function getCompressionType(filename) {
  // Use UASTC for normal maps (higher quality needed)
  if (filename.includes('Normal') || filename.includes('normal')) {
    return 'uastc';
  }
  // ETC1S for everything else (better compression)
  return 'etc1s';
}

function convertTexture(inputPath, outputDir, dryRun = false) {
  const filename = basename(inputPath, extname(inputPath));
  const outputPath = join(outputDir, `${filename}.ktx2`);

  // Skip if output exists and is newer
  if (existsSync(outputPath)) {
    const inputStat = statSync(inputPath);
    const outputStat = statSync(outputPath);
    if (outputStat.mtime > inputStat.mtime) {
      console.log(`  [skip] ${filename}.ktx2 (up to date)`);
      return { skipped: true };
    }
  }

  const compressionType = getCompressionType(filename);
  const settings = COMPRESSION_SETTINGS[compressionType];

  // basisu outputs to the same directory as input by default, so we use -output_file
  const cmd = `basisu ${settings} -output_file "${outputPath}" "${inputPath}"`;

  if (dryRun) {
    console.log(`  [dry-run] ${cmd}`);
    return { dryRun: true };
  }

  try {
    console.log(`  [convert] ${filename} -> ${filename}.ktx2 (${compressionType})`);
    execSync(cmd, { stdio: 'pipe' });

    // Get size comparison
    const inputSize = statSync(inputPath).size;
    const outputSize = statSync(outputPath).size;
    const savings = ((1 - outputSize / inputSize) * 100).toFixed(1);

    console.log(
      `           ${(inputSize / 1024).toFixed(1)}KB -> ${(outputSize / 1024).toFixed(1)}KB (${savings}% smaller)`
    );
    return { success: true, inputSize, outputSize };
  } catch (err) {
    console.error(`  [error] Failed to convert ${filename}: ${err.message}`);
    return { error: true };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log('=== Texture Conversion Tool (basisu) ===\n');

  // Check for basisu
  if (!checkBasiuInstalled()) {
    console.error('Error: basisu not found. Please install basis_universal:');
    console.error('  macOS: brew install basis_universal');
    process.exit(1);
  }

  // Create output directory
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Find all textures
  let allTextures = [];
  for (const dir of TEXTURE_DIRS) {
    const textures = findTextures(dir);
    allTextures = allTextures.concat(textures);
  }

  console.log(`Found ${allTextures.length} textures to process\n`);

  if (allTextures.length === 0) {
    console.log('No textures found. Add textures to:');
    TEXTURE_DIRS.forEach((dir) => console.log(`  - ${dir}`));
    return;
  }

  // Convert textures
  const stats = { success: 0, skipped: 0, error: 0, totalSaved: 0 };

  for (const texture of allTextures) {
    const result = convertTexture(texture, OUTPUT_DIR, dryRun);

    if (result.success) {
      stats.success++;
      stats.totalSaved += result.inputSize - result.outputSize;
    } else if (result.skipped) {
      stats.skipped++;
    } else if (result.error) {
      stats.error++;
    }
  }

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Converted: ${stats.success}`);
  console.log(`Skipped: ${stats.skipped}`);
  console.log(`Errors: ${stats.error}`);
  if (stats.totalSaved > 0) {
    console.log(`Total saved: ${(stats.totalSaved / 1024 / 1024).toFixed(2)} MB`);
  }

  if (dryRun) {
    console.log('\n(Dry run - no files were modified)');
  }
}

main().catch(console.error);
