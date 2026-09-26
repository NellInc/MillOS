import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';

/**
 * Shader-chunk anchor contract.
 *
 * Every `onBeforeCompile` injection in this repo works by string-replacing a
 * three.js shader chunk include:
 *
 *   shader.fragmentShader = shader.fragmentShader.replace(
 *     '#include <fog_fragment>',
 *     `...injected GLSL...`
 *   );
 *
 * `String.prototype.replace` returns the subject unchanged when the pattern is
 * absent. So if the anchor is misspelled, or three renames or removes the chunk
 * in an upgrade, the injection silently does nothing: no exception, no warning,
 * the material simply renders without the feature. Nothing else in the toolchain
 * catches this — GLSL is a string, so typecheck, eslint, the jsdom test
 * environment (no WebGL) and the production build all pass on an anchor that
 * matches nothing.
 *
 * This test pins every `#include <...>` anchor used as a replace() target
 * against the chunks three actually ships, so a broken or renamed anchor fails
 * here instead of quietly removing a visual feature at runtime.
 */

const SOURCE_ROOT = path.resolve(__dirname, '../..');

// Archived snapshots are frozen copies of earlier releases pinned to older
// three versions; their anchors are not a contract this build has to honour.
const EXCLUDED_DIRECTORIES = new Set(['0.10 Archive', '__tests__', 'node_modules']);

function collectSourceFiles(directory: string, accumulator: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const fullPath = path.join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      if (EXCLUDED_DIRECTORIES.has(entry)) continue;
      collectSourceFiles(fullPath, accumulator);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) accumulator.push(fullPath);
  }
  return accumulator;
}

interface AnchorUsage {
  file: string;
  chunk: string;
}

/**
 * Matches any chunk include written in TypeScript source.
 *
 * Deliberately broader than "the pattern argument of .replace(...)": several
 * injections pass the anchor through a helper (`injectAfter(shader, anchor,
 * addition)`), so an anchor-position-only regex would miss them — including the
 * nine terrain injections. Every `#include <name>` this repo writes should name
 * a chunk three actually ships, whether it is used as an anchor or re-emitted
 * inside injected GLSL, so the broader sweep is the correct contract and has no
 * false positives.
 */
const CHUNK_INCLUDE = /(['"`])\s*#include <([a-zA-Z0-9_]+)>/g;

function collectAnchors(): AnchorUsage[] {
  const usages: AnchorUsage[] = [];
  for (const file of collectSourceFiles(SOURCE_ROOT)) {
    const contents = readFileSync(file, 'utf8');
    for (const match of contents.matchAll(CHUNK_INCLUDE)) {
      usages.push({ file: path.relative(SOURCE_ROOT, file), chunk: match[2] });
    }
  }
  return usages;
}

describe('shader chunk injection anchors', () => {
  const anchors = collectAnchors();

  it('finds the injection sites it is meant to guard', () => {
    // A regex that silently matches nothing would make every assertion below
    // vacuously pass, so the sweep asserts its own reach first.
    expect(anchors.length).toBeGreaterThan(0);
  });

  it('only anchors on chunks that three actually ships', () => {
    const shippedChunks = new Set(Object.keys(THREE.ShaderChunk));
    const unknown = anchors.filter((usage) => !shippedChunks.has(usage.chunk));

    expect(
      unknown.map((usage) => `${usage.file} -> #include <${usage.chunk}>`),
      'These anchors match no three.js shader chunk, so the injection is a silent no-op'
    ).toEqual([]);
  });

  it('anchors on chunks whose source is non-empty', () => {
    // A chunk can exist as a key but be emptied out by an upgrade. Replacing an
    // empty-bodied include still works, but a chunk that has lost its content is
    // a strong signal the surrounding assumptions have moved.
    const empty = anchors.filter(
      (usage) => (THREE.ShaderChunk[usage.chunk as keyof typeof THREE.ShaderChunk] ?? '') === ''
    );

    expect(
      empty.map((usage) => `${usage.file} -> #include <${usage.chunk}>`),
      'These anchors resolve to an empty three.js chunk'
    ).toEqual([]);
  });
});

describe('renderer shadow filter contract', () => {
  it('selects a shadow mode implemented by the installed renderer', () => {
    const app = readFileSync(path.join(SOURCE_ROOT, 'App.tsx'), 'utf8');
    const mode = app.match(/<Canvas[\s\S]*?\bshadows=\{[\s\S]*?type:\s*THREE\.(\w+)/)?.[1];
    expect(mode, 'Canvas shadow mode must be discoverable').toBeDefined();
    const program = readFileSync(
      path.join(SOURCE_ROOT, '../node_modules/three/src/renderers/webgl/WebGLProgram.js'),
      'utf8'
    );
    const defines = program.match(/const shadowMapTypeDefines = \{([\s\S]*?)\};/)?.[1] ?? '';
    expect(defines, `${mode} must not silently fall back to single-tap BASIC shadows`).toContain(
      `[ ${mode} ]`
    );
    expect(THREE.ShaderChunk.shadowmap_pars_fragment).toContain('SHADOWMAP_TYPE_PCF');
  });
});
