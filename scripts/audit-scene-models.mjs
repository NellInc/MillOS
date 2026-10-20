/**
 * Every model in every scene, checked against the defect classes this repo has
 * actually paid for.
 *
 * WHY A RUNTIME SWEEP. Four of these classes are invisible in the source and in
 * the asset. `vertexColors` without a `color` attribute turned 122 meshes black
 * while every gate stayed green, and it was a batcher rewriting the material of
 * a mesh whose geometry it did not rewrite - a defect in the space between two
 * objects. A colour-space mistake is a property of the texture object that is
 * bound, not of the line that created it. A NaN bound is produced by an
 * argument three frames upstream. None of them can be found by reading files,
 * and `validate:assets` cannot see them because they are not in the assets.
 *
 * So this reads the RESOLVED draw state of every mesh through the runtime hook,
 * in every benchmark scene, and applies one rule per known defect class.
 *
 * The scene list is PARSED OUT of `src/runtime/runtimeMode.ts` rather than
 * copied, for the reason `capture-art-review.mjs` already documents: the
 * runtime silently coerces an unknown scene name to `overview`, so a stale copy
 * of the list would audit the same scene several times and report confident
 * full coverage.
 *
 * Usage:
 *   node scripts/audit-scene-models.mjs [--scenes=a,b] [--quality=medium] [--json=path]
 */
import { spawn } from 'node:child_process';
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';
import { acquireCaptureLock } from './lib/capture-lock.mjs';

const ROOT = process.cwd();
const RUNTIME_MODE_SOURCE = path.join(ROOT, 'src', 'runtime', 'runtimeMode.ts');

const arg = (name, fallback) => {
  const match = process.argv.find((value) => value.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : fallback;
};

/** Parse `BENCHMARK_SCENES` out of the real runtime rather than restating it. */
async function readSceneNames() {
  const source = await readFile(RUNTIME_MODE_SOURCE, 'utf8');
  const block = /const BENCHMARK_SCENES[^[]*\[([^\]]*)\]/.exec(source);
  if (!block) {
    throw new Error(
      `Could not find BENCHMARK_SCENES in ${RUNTIME_MODE_SOURCE}. The audit refuses to guess: ` +
        'an unknown scene name is silently coerced to `overview`, which would report full ' +
        'coverage while auditing one scene many times.'
    );
  }
  const names = [...block[1].matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
  if (names.length < 5)
    throw new Error(`Parsed only ${names.length} scenes; the pattern has drifted.`);
  return names;
}

/**
 * One rule per defect class. Each returns a reason string when the mesh is
 * defective, or null. Every rule cites the evidence that made it a rule.
 */
/**
 * Will the renderer reach this mesh?
 *
 * `visibleInTree` is reported by `RuntimeController.inspectObjects` and walks
 * the ancestors; older probe payloads only carry the own flag, so fall back to
 * it rather than silently passing everything.
 */
const isDrawn = (m) => (m.visibleInTree ?? m.visible) !== false;

const RULES = [
  {
    id: 'vertex-colour-without-attribute',
    severity: 'blocker',
    // three defines USE_COLOR from `material.vertexColors` alone
    // (WebGLProgram.js:566) and the shader then multiplies by a `color`
    // attribute the geometry may not have. An unbound attribute reads as the
    // WebGL generic default (0,0,0,1), so the diffuse goes to zero.
    test: (m) =>
      m.material.vertexColors && !m.geometry.attributes.includes('color')
        ? 'vertexColors is set but the geometry has no `color` attribute, so diffuse renders black'
        : null,
  },
  {
    id: 'albedo-not-srgb',
    severity: 'blocker',
    // CLAUDE.md: every DataTexture must declare a colour space. An albedo left
    // linear reads ~2.4x too bright in the mid-tones with all tonal separation
    // crushed toward white - measured at 1.9x to 5.1x across this repo's own
    // generators.
    test: (m) => {
      const bad = m.textures.filter(
        (t) => (t.slot === 'map' || t.slot === 'emissiveMap') && t.colorSpace !== 'srgb'
      );
      return bad.length
        ? `${bad.map((t) => `${t.slot} is ${t.colorSpace || 'no-colorspace'}`).join(', ')} - colour data must decode as sRGB`
        : null;
    },
  },
  {
    id: 'data-map-tagged-srgb',
    severity: 'blocker',
    // The same rule in the other direction, which CLAUDE.md is explicit about:
    // "a normal or roughness map decoded as sRGB is just as broken as an albedo
    // map left linear".
    test: (m) => {
      const linearSlots = new Set([
        'normalMap',
        'roughnessMap',
        'metalnessMap',
        'aoMap',
        'bumpMap',
        'displacementMap',
        'alphaMap',
        'clearcoatNormalMap',
        'clearcoatRoughnessMap',
      ]);
      const bad = m.textures.filter((t) => linearSlots.has(t.slot) && t.colorSpace === 'srgb');
      return bad.length
        ? `${bad.map((t) => t.slot).join(', ')} tagged sRGB - data maps are consumed verbatim and must be linear`
        : null;
    },
  },
  {
    id: 'non-finite-geometry',
    severity: 'blocker',
    // `computeBoundingSphere(): Computed radius is NaN` names no object when it
    // reaches the console. This names the object.
    test: (m) => (m.geometry.nonFinite ? 'geometry has a non-finite bound or position' : null),
  },
  {
    id: 'instanced-geometry-without-count',
    severity: 'blocker',
    // An `InstancedBufferGeometry` defaults `instanceCount` to Infinity, and
    // `WebGLRenderer.js:1316` only clamps that against `_maxInstanceCount`,
    // which `WebGLBindingStates` sets ONLY when it binds an instanced
    // attribute. A geometry with none draws with `primcount` Infinity: the GL
    // call coerces it to 0 so NOTHING RENDERS AND NOTHING LOOKS WRONG, but
    // `WebGLInfo.update` runs first and adds Infinity to `render.triangles`.
    // Benchmarks hold `info.autoReset` off for the whole measured window, so
    // one transient frame permanently zeroed the triangle count of every scene
    // in this app - a defect that only an instrument can see, and that
    // destroyed the instrument that could see it. See
    // `SceneText.initialiseGlyphInstanceCount`.
    test: (m) =>
      m.geometry.instancedDrawCount === 'unbounded'
        ? 'instanced geometry with a non-finite instanceCount - draws with primcount Infinity and poisons gl.info.render.triangles'
        : null,
  },
  {
    id: 'mirrored-transform',
    severity: 'warn',
    // A negative determinant flips every face's winding, so a solid body is
    // drawn inside-out and lights as though its normals point away.
    test: (m) =>
      m.worldDeterminant < 0
        ? `world matrix determinant is ${m.worldDeterminant.toFixed(4)} - a mirrored transform inverts face winding`
        : null,
  },
  {
    id: 'metal-without-environment',
    severity: 'warn',
    // A metal's diffuse is `albedo * (1 - metalness)`, so a fully metallic
    // material with nothing to reflect has almost no diffuse and no specular
    // source: it renders near-black regardless of its albedo.
    test: (m, rig) =>
      (m.material.metalness ?? 0) >= 0.9 && !m.material.envMapBound && !rig.scene.environmentBound
        ? `metalness ${m.material.metalness} with no envMap and no scene.environment - nothing to reflect`
        : null,
  },
  {
    id: 'invisible-material',
    severity: 'warn',
    // A mesh that is in the graph, costs a traverse and is never drawn.
    test: (m) =>
      isDrawn(m) && !m.material.visible ? 'mesh is visible but its material is not' : null,
  },
  {
    id: 'zero-opacity',
    severity: 'warn',
    // BOTH halves of this are load-bearing. The check fired on 53 meshes for
    // three passes on the strength of `m.visible` alone, which is the mesh's
    // OWN flag - and every one of those 53 was a forklift's cargo sitting
    // inside a group whose `visible` is false while there is nothing to carry.
    // three's `projectObject` returns at the first invisible ancestor, so those
    // meshes were never drawn and the warning's own message ("drawn every
    // frame") was false. `visibleInTree` is the ancestor-aware flag.
    test: (m) =>
      isDrawn(m) && m.material.transparent && m.material.opacity === 0
        ? 'transparent at opacity 0 - drawn every frame and contributes nothing'
        : null,
  },
];

const options = {
  quality: arg('quality', 'medium'),
  port: Number(arg('port', '4197')),
  json: arg('json', path.join(ROOT, 'test-results', 'model-audit.json')),
};

let preview = null;
let lock = null;

async function startPreview() {
  await access(path.join(ROOT, 'dist', 'index.html')).catch(() => {
    throw new Error('dist/index.html is missing. Run npm run build first.');
  });
  const url = `http://127.0.0.1:${options.port}`;
  preview = spawn(
    process.execPath,
    [
      path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'),
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      String(options.port),
      '--strictPort',
    ],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, BROWSER: 'none' } }
  );
  const deadline = Date.now() + 30000;
  for (;;) {
    try {
      if ((await fetch(url)).ok) return url;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error(`Preview did not start on ${url}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
const stopPreview = () => {
  if (preview && !preview.killed) preview.kill('SIGTERM');
};

async function main() {
  const scenes = arg('scenes', '') ? arg('scenes', '').split(',') : await readSceneNames();

  lock = await acquireCaptureLock('audit-scene-models', { root: ROOT });
  const baseUrl = await startPreview();
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const findings = new Map();
  const perScene = [];
  /** Per-branch texture coverage, for the scenes that hold the whole world. */
  const surveys = [];
  const flatLists = [];
  /**
   * Scenes whose meshes feed the coverage survey and the flat work list.
   *
   * `personnel-close` is here because the other two are WIDE, and level of
   * detail means a wide camera never mounts the thing being graded. Measured:
   * with only `overview` and `interior` in this set, `world-personnel` reported
   * 0% albedo / 0% normal / 100% flat and `world-forklifts` reported 100% flat -
   * both of which were surveys of the LOD stand-ins, a billboard quad and a
   * procedural body, while the authored GLBs those branches exist for were not
   * in the graph at all. A coverage number for geometry the reviewer never sees
   * is worse than no number, because it reads as a work list.
   *
   * `village` AND `farm` WERE TRIED HERE AND REMOVED, 2026-08-17. The
   * reasoning was sound - `authored-village` reads 66% flat and that put it on
   * the work list - and the premise was false: those two branches mount the
   * SAME meshes at every camera, so their survey blocks came back byte-identical
   * to `overview`'s, row for row, and the flat tables differed only by the
   * transients of two separate page loads. Adding them was an inert term with a
   * confident comment attached, which is worse than not adding them.
   *
   * The village's real answer is that 66% is a MESH-COUNT statistic: 54 of its
   * 82 meshes are flat and they total 42 m of world size, 27 m of which is a
   * `static-merge` output whose colours ride vertex colours. Read the two
   * columns together - `branch-flat.mjs` prints both for one branch - rather
   * than reaching for another camera.
   */
  const SURVEY_SCENES = new Set(['overview', 'interior', 'personnel-close']);

  try {
    for (const scene of scenes) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      try {
        await page.goto(`${baseUrl}/?benchmark=${scene}&quality=${options.quality}&duration=120`, {
          waitUntil: 'domcontentloaded',
          timeout: 90000,
        });
        await page.waitForFunction(() => window.__MILLOS_RUNTIME__?.ready === true, null, {
          timeout: 90000,
        });
        await page.waitForFunction(
          () => document.documentElement.dataset.millosWorldReady === 'true',
          null,
          { timeout: 90000 }
        );
        // Lazily mounted branches and the first environment convolution both
        // land seconds after "ready"; auditing before then measures a partial
        // world and reports clean coverage of a scene that is half absent.
        await page.waitForTimeout(8000);

        const { meshes, rig } = await page.evaluate(() => ({
          meshes: window.__MILLOS_RUNTIME__.inspectObjects('', 40000),
          rig: window.__MILLOS_RUNTIME__.lightRig(),
        }));

        let sceneFindings = 0;
        for (const mesh of meshes) {
          for (const rule of RULES) {
            const reason = rule.test(mesh, rig);
            if (!reason) continue;
            sceneFindings += 1;
            const key = `${rule.id}::${mesh.material.name || mesh.material.type}::${reason}`;
            const entry = findings.get(key) ?? {
              rule: rule.id,
              severity: rule.severity,
              reason,
              material: mesh.material.name || mesh.material.type,
              count: 0,
              instances: 0,
              scenes: new Set(),
              examples: [],
            };
            entry.count += 1;
            entry.instances += mesh.instanceCount;
            entry.scenes.add(scene);
            if (entry.examples.length < 3)
              entry.examples.push(mesh.path.split('/').slice(-3).join('/'));
            findings.set(key, entry);
          }
        }
        if (SURVEY_SCENES.has(scene)) {
          const byBranch = new Map();
          for (const mesh of meshes) {
            // Second path segment below `<Scene>/world-root`, which is the
            // level the scene actually divides at.
            const parts = mesh.path.split('/');
            const name = parts[2] || parts[1] || '(root)';
            const entry = byBranch.get(name) ?? {
              name,
              meshes: 0,
              albedo: 0,
              normal: 0,
              rough: 0,
              flat: 0,
              shaded: 0,
              casts: 0,
            };
            entry.meshes += 1;
            const slots = new Set(mesh.textures.map((t) => t.slot));
            if (slots.has('map')) entry.albedo += 1;
            if (slots.has('normalMap')) entry.normal += 1;
            if (slots.has('roughnessMap')) entry.rough += 1;
            // A surface can be finished without a single bound texture slot.
            // The terrain's splat blend, the machines' grime/dust/edge-wear and
            // the trailers' ribbed panels are all injected GLSL, and counting
            // them as flat sent the previous work list at surfacing that was
            // already done.
            if (mesh.material.shaderInjected) entry.shaded += 1;
            else if (slots.size === 0) entry.flat += 1;
            if (mesh.castShadow) entry.casts += 1;
            byBranch.set(name, entry);
          }
          surveys.push([
            scene,
            [...byBranch.values()].sort((a, b) => b.meshes - a.meshes).slice(0, 14),
          ]);

          const flats = new Map();
          for (const mesh of meshes) {
            if (mesh.textures.length > 0 || mesh.material.shaderInjected) continue;
            const parts = mesh.path.split('/');
            // Keyed by material name where there is one, and by colour where
            // there is not - an unnamed `MeshStandardMaterial` tells a reader
            // nothing, but its colour identifies the surface it is standing in
            // for.
            const key = mesh.material.name || `${mesh.material.type} ${mesh.material.color}`;
            const entry = flats.get(key) ?? {
              key,
              meshes: 0,
              instances: 0,
              metres: 0,
              biggest: 0,
              branch: parts[2] || '(root)',
              example: parts.slice(-2).join('/'),
            };
            entry.meshes += 1;
            entry.instances += mesh.instanceCount;
            // Summed world radius, in metres. See RuntimeObjectReport.geometry
            // for why this and not the geometry radius: almost every mesh here
            // is a shared unit box, so mesh COUNT ranks a hundred bolts above
            // the wall behind them. This column is the one to work down.
            //
            // `worldRadiusSum` rather than `worldRadius * instanceCount`,
            // because the two are not the same thing and the difference was
            // silent: an InstancedMesh keeps its per-instance scale in
            // `instanceMatrix`, not in its own world matrix, so that product
            // collapsed to the unit-geometry radius times a count and this
            // column was an instance count in metres' clothing. Measured on
            // `world-factory-infrastructure`, sixteen of nineteen rows came out
            // at exactly 0.87 x count.
            entry.metres += mesh.geometry.worldRadiusSum ?? 0;
            const worldRadius = mesh.geometry.worldRadius ?? 0;
            if (worldRadius > entry.biggest) {
              entry.biggest = worldRadius;
              entry.example = parts.slice(-2).join('/');
            }
            flats.set(key, entry);
          }
          flatLists.push([
            scene,
            [...flats.values()].sort((a, b) => b.metres - a.metres).slice(0, 24),
          ]);
        }
        perScene.push({ scene, meshes: meshes.length, findings: sceneFindings });
        console.log(
          `${scene.padEnd(16)} ${String(meshes.length).padStart(5)} meshes  ${String(sceneFindings).padStart(4)} findings`
        );
      } finally {
        await page.close();
      }
    }

    // --- quality survey -----------------------------------------------------
    // Not pass/fail. The generated farm and village assets carry baked PBR
    // albedo, normal and roughness maps; most of the factory is flat-coloured
    // primitives. That gap is the actual "model quality" question, and it is a
    // measurement rather than an opinion: count what each branch of the scene
    // is textured with, and how many of its materials are genuinely distinct.
    console.log('\n=== QUALITY SURVEY (overview + interior, by branch) ===');
    console.log(
      'branch'.padEnd(34) +
        'meshes'.padStart(7) +
        'albedo'.padStart(8) +
        'normal'.padStart(8) +
        'rough'.padStart(7) +
        'shader'.padStart(8) +
        'flat'.padStart(7) +
        'shadow'.padStart(8)
    );
    for (const [scene, survey] of surveys) {
      console.log(`-- ${scene}`);
      for (const branch of survey) {
        const pct = (n) => (branch.meshes ? `${Math.round((n / branch.meshes) * 100)}%` : '-');
        console.log(
          `   ${branch.name.slice(0, 30).padEnd(31)}` +
            String(branch.meshes).padStart(7) +
            pct(branch.albedo).padStart(8) +
            pct(branch.normal).padStart(8) +
            pct(branch.rough).padStart(7) +
            pct(branch.shaded).padStart(8) +
            pct(branch.flat).padStart(7) +
            pct(branch.casts).padStart(8)
        );
      }
    }

    // The work list: which untextured materials account for the most SURFACE.
    //
    // Ordered by summed world radius in metres, not by mesh count. Mesh count
    // ranks by how finely a thing was modelled; a viewer sees area. The two
    // orderings disagree violently here because nearly every mesh in this scene
    // is a shared unit box scaled by its matrix, so one 120 m road and one
    // 0.05 m bolt are the same row until the scale is applied.
    console.log('\n=== FLAT MATERIALS BY WORLD SIZE (no texture in any slot) ===');
    console.log(
      'material'.padEnd(34) +
        'metres'.padStart(9) +
        'largest'.padStart(9) +
        'meshes'.padStart(7) +
        'inst'.padStart(7) +
        '  branch / largest example'
    );
    for (const [scene, flats] of flatLists) {
      console.log(`-- ${scene}`);
      for (const flat of flats) {
        console.log(
          `   ${flat.key.slice(0, 30).padEnd(31)}` +
            flat.metres.toFixed(0).padStart(9) +
            flat.biggest.toFixed(1).padStart(9) +
            String(flat.meshes).padStart(7) +
            String(flat.instances).padStart(7) +
            `  ${flat.branch} / ${flat.example}`
        );
      }
    }

    const rows = [...findings.values()].sort((a, b) =>
      a.severity === b.severity ? b.count - a.count : a.severity === 'blocker' ? -1 : 1
    );
    console.log(`\n${rows.length} distinct findings across ${perScene.length} scenes\n`);
    for (const row of rows) {
      console.log(
        `[${row.severity.toUpperCase()}] ${row.rule}  x${row.count} meshes (${row.instances} instances) in ${row.scenes.size} scene(s)`
      );
      console.log(`    material "${row.material}"`);
      console.log(`    ${row.reason}`);
      console.log(`    e.g. ${row.examples.join(' | ')}`);
    }
    const blockers = rows.filter((r) => r.severity === 'blocker');
    console.log(
      `\nSUMMARY: ${blockers.length} blocker findings, ${rows.length - blockers.length} warnings.\n`
    );

    await writeFile(
      options.json,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          quality: options.quality,
          perScene,
          findings: rows.map((r) => ({ ...r, scenes: [...r.scenes] })),
        },
        null,
        2
      )
    );
    console.log(`Report: ${options.json}`);
    process.exitCode = blockers.length > 0 ? 1 : 0;
  } finally {
    await browser.close();
    stopPreview();
    await lock?.release();
  }
}

main().catch(async (error) => {
  stopPreview();
  await lock?.release();
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
