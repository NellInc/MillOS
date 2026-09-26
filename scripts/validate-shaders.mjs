#!/usr/bin/env node

/**
 * Shader contract validator.
 *
 * Checks four things, in both directions:
 *
 *   1. NON-DETERMINISM. No shader cache key may be derived from `Date.now()`,
 *      `Math.random()` or `performance.now()`. A key that changes recompiles
 *      the program every frame (see CLAUDE.md, "Shader Cache Key Bug").
 *   2. SOURCE -> REGISTERED. Every file under `src/` that DEFINES a shader
 *      (assigns `onBeforeCompile` or `customProgramCacheKey`) must appear in
 *      some contract's `sources`, or be explicitly allow-listed with a reason.
 *      Without this a brand new family could be added and the validator would
 *      still report a clean run, so the family count proved nothing.
 *   3. REGISTERED -> SOURCE. Every contract's `sources` must exist on disk, and
 *      its `cacheKey` must appear in one of ITS OWN source files - not merely
 *      somewhere in the repo, which a dead file could satisfy.
 *   4. ALLOW-LIST HYGIENE. Every allow-listed path must still contain a shader
 *      definition site, so an entry cannot rot into a permanent mute after the
 *      code it excused is deleted.
 *
 * DETECTION IS AST-BASED, NOT TEXTUAL. A text search for the identifiers above
 * false-flags doc comments (there are a dozen), `Object.hasOwn(material,
 * 'onBeforeCompile')` guards, reads such as `material.customProgramCacheKey()`,
 * and test files that invoke an injection. Only assignments and object-literal
 * property definitions count.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const srcRoot = resolve(root, 'src');
const failures = [];
const sources = new Map();

const NON_DETERMINISTIC = /Date\.now|Math\.random|performance\.now/;
const SHADER_DEFINITION_NAMES = new Set(['onBeforeCompile', 'customProgramCacheKey']);

const relative = (absolute) =>
  absolute
    .slice(root.length + 1)
    .split('\\')
    .join('/');
const isTestFile = (path) => /\.test\.tsx?$/.test(path) || path.includes('__tests__');

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.includes('Archive')) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      walk(path);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      sources.set(path, readFileSync(path, 'utf8'));
    }
  }
}
walk(srcRoot);

const parse = (file, source) =>
  ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

/** Name of an object-literal member, when it is a plain identifier or string. */
function memberName(node) {
  if (!node.name) return null;
  if (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) return node.name.text;
  return null;
}

let customKeyCount = 0;
/** Repo-relative paths of every file that defines a shader. */
const definitionSites = new Set();

for (const [file, source] of sources) {
  const sourceFile = parse(file, source);
  const path = relative(file);

  /**
   * ONE-HOP CONST RESOLUTION.
   *
   * The common shape in this repo is `const KEY = '...'` at module scope
   * followed by `material.customProgramCacheKey = () => KEY`. Checking only the
   * text of the arrow function would see the identifier `KEY` and pass, so the
   * const initialiser has to be checked too. Four live families use exactly
   * this shape (machineWear, machineDecal, dust mote, firefly).
   */
  const constInitialisers = new Map();
  const collectConsts = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      constInitialisers.set(node.name.text, node.initializer.getText(sourceFile));
    }
    ts.forEachChild(node, collectConsts);
  };
  collectConsts(sourceFile);

  const isNonDeterministic = (expression) => {
    const text = expression.getText(sourceFile);
    if (NON_DETERMINISTIC.test(text)) return true;
    let found = false;
    const visit = (node) => {
      if (found) return;
      if (ts.isIdentifier(node)) {
        const initialiser = constInitialisers.get(node.text);
        if (initialiser && NON_DETERMINISTIC.test(initialiser)) found = true;
      }
      ts.forEachChild(node, visit);
    };
    visit(expression);
    return found;
  };

  const report = (node, message) => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    failures.push(`${path}:${line + 1} ${message}`);
  };

  function inspect(node) {
    // `material.customProgramCacheKey = <expr>` / `material.onBeforeCompile = <expr>`
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      SHADER_DEFINITION_NAMES.has(node.left.name.text)
    ) {
      if (!isTestFile(path)) definitionSites.add(path);
      if (node.left.name.text === 'customProgramCacheKey') {
        // Counted for PRODUCTION sites only. The determinism check below still
        // runs on tests - a `Date.now()` key is worth catching wherever it is
        // written - but a test helper that fakes a host injection would
        // otherwise inflate a number this repo reads as a repo-shape metric.
        if (!isTestFile(path)) customKeyCount += 1;
        if (isNonDeterministic(node.right)) {
          report(node.left, 'has a nondeterministic shader cache key');
        }
      }
    }

    // `{ customProgramCacheKey: () => ..., onBeforeCompile(shader) { ... } }`
    if (
      (ts.isPropertyAssignment(node) || ts.isMethodDeclaration(node)) &&
      SHADER_DEFINITION_NAMES.has(memberName(node) ?? '')
    ) {
      if (!isTestFile(path)) definitionSites.add(path);
      if (memberName(node) === 'customProgramCacheKey') {
        if (!isTestFile(path)) customKeyCount += 1;
        const value = ts.isPropertyAssignment(node) ? node.initializer : node;
        if (isNonDeterministic(value)) {
          report(node, 'has a nondeterministic shader cache key');
        }
      }
    }

    /**
     * `applyWindShader(material, { cacheKey: <expr> })`.
     *
     * The injection helpers take the key as an option and assign it one call
     * frame away, so the assignment above sees only an opaque parameter. The
     * caller's literal is where a `Date.now()` would actually be written.
     */
    if (ts.isPropertyAssignment(node) && memberName(node) === 'cacheKey') {
      if (isNonDeterministic(node.initializer)) {
        report(node, 'passes a nondeterministic shader cache key');
      }
    }

    ts.forEachChild(node, inspect);
  }

  inspect(sourceFile);
}

// ---------------------------------------------------------------------------
// CONTRACT REGISTRY
// ---------------------------------------------------------------------------

const contractPath = resolve(root, 'src/shaders/shaderContracts.ts');
const contractSource = readFileSync(contractPath, 'utf8');
const contractFile = parse(contractPath, contractSource);

/** Read a string literal, or an array of them, out of an object-literal member. */
const stringsOf = (node) => {
  if (!node) return [];
  if (ts.isStringLiteral(node)) return [node.text];
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.filter(ts.isStringLiteral).map((element) => element.text);
  }
  return [];
};

const readRegistry = (exportName) => {
  const entries = [];
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === exportName &&
      node.initializer
    ) {
      // Unwrap `[...] as const`.
      const array = ts.isAsExpression(node.initializer)
        ? node.initializer.expression
        : node.initializer;
      if (ts.isArrayLiteralExpression(array)) {
        for (const element of array.elements) {
          if (!ts.isObjectLiteralExpression(element)) continue;
          const record = {};
          for (const member of element.properties) {
            if (!ts.isPropertyAssignment(member)) continue;
            const name = memberName(member);
            if (name) record[name] = stringsOf(member.initializer);
          }
          entries.push(record);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(contractFile);
  return entries;
};

const contracts = readRegistry('ACTIVE_SHADER_CONTRACTS');
const allowList = readRegistry('UNCONTRACTED_SHADER_SITES');

const contractIds = contracts.flatMap(({ id }) => id ?? []);
if (contractIds.length < 10 || new Set(contractIds).size !== contractIds.length) {
  failures.push('active shader registry must contain at least ten unique contracts');
}

const contractedPaths = new Set();
for (const contract of contracts) {
  const id = contract.id?.[0] ?? '(unnamed)';
  const contractSources = contract.sources ?? [];
  if (contractSources.length === 0) {
    failures.push(`contract ${id} declares no sources`);
    continue;
  }

  for (const path of contractSources) {
    contractedPaths.add(path);
    if (!existsSync(resolve(root, path))) {
      failures.push(`contract ${id} names a source that does not exist: ${path}`);
    }
  }

  // The cache key must live in one of THIS contract's files. Searching the
  // whole repo is what let a contract for a dead file keep passing.
  const key = contract.cacheKey?.[0];
  if (!key || key === 'three-source-default' || key.includes('{')) continue;
  const present = contractSources.some((path) => {
    const absolute = resolve(root, path);
    return sources.has(absolute) && sources.get(absolute).includes(key);
  });
  if (!present) {
    failures.push(`cache key of contract ${id} is not present in its own sources: ${key}`);
  }
}

const allowedPaths = new Set(allowList.flatMap(({ path }) => path ?? []));
for (const entry of allowList) {
  const path = entry.path?.[0];
  if (!path) continue;
  if (!(entry.reason?.[0] ?? '').trim()) {
    failures.push(`allow-listed shader site has no reason: ${path}`);
  }
  if (!definitionSites.has(path)) {
    failures.push(`allow-listed shader site no longer defines a shader, remove the entry: ${path}`);
  }
}

for (const path of [...definitionSites].sort()) {
  if (contractedPaths.has(path) || allowedPaths.has(path)) continue;
  failures.push(
    `${path} defines a shader with no registered contract - add one to ACTIVE_SHADER_CONTRACTS or an entry to UNCONTRACTED_SHADER_SITES`
  );
}

if (failures.length > 0) {
  console.error('Shader contract validation failed:');
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    `Shader contracts valid: ${contractIds.length} families, ${customKeyCount} stable cache keys, ` +
      `${definitionSites.size} definition sites covered. No recompiles on your conscience.`
  );
}
