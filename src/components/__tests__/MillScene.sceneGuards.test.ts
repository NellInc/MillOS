import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as ts from 'typescript';

// Walk the JSX tree of the shipped MillScene source rather than a copied
// list, following the playable-journey test's source-reading pattern.
const sceneFile = ts.createSourceFile(
  'MillScene.tsx',
  readFileSync('src/components/MillScene.tsx', 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);

function jsxElementsNamed(name: string): ts.Node[] {
  const found: ts.Node[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      node.tagName.getText(sceneFile) === name
    )
      found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(sceneFile);
  return found;
}

function enclosingTag(node: ts.Node, tag: string): ts.JsxElement | undefined {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isJsxElement(current) && current.openingElement.tagName.getText(sceneFile) === tag)
      return current;
  }
  return undefined;
}

function hasNullFallback(boundary: ts.JsxElement): boolean {
  return boundary.openingElement.attributes.properties.some(
    (prop) =>
      ts.isJsxAttribute(prop) &&
      prop.name.getText(sceneFile) === 'fallback' &&
      prop.initializer !== undefined &&
      ts.isJsxExpression(prop.initializer) &&
      prop.initializer.expression?.kind === ts.SyntaxKind.NullKeyword
  );
}

describe('MillScene optional subsystem error boundaries', () => {
  // A rejected lazy chunk inside the Canvas otherwise reaches App's
  // WebGL boundary and replaces the whole world with "3D view stopped".
  const optional = [
    'AuthoredDockOpening',
    'CommunityLife',
    'AuthoredFactoryExterior',
    'AuthoredCastle',
    'AuthoredFarm',
    'AuthoredVillage',
    'OptionalCascadeVisualization',
    'OptionalStrategicOverlay',
    'OptionalBlueprintMode',
    'EnhancedHolographicDisplays',
    'TruckBay',
    'OperationalWorldSignals',
    'PostProcessing',
    'HighDetailSpoutingSystem',
  ];

  it.each(optional)('%s renders inside an ErrorBoundary with fallback={null}', (name) => {
    const uses = jsxElementsNamed(name);
    expect(uses.length).toBeGreaterThan(0);
    for (const use of uses) {
      const boundary = enclosingTag(use, 'ErrorBoundary');
      expect(boundary, `${name} has no ErrorBoundary ancestor`).toBeDefined();
      expect(hasNullFallback(boundary!)).toBe(true);
    }
  });

  // Mounted on demand after the world is ready ('K' toggle, camera entering the
  // building on Ultra). Without a local Suspense the first fetch suspends to
  // App's Suspense and swaps the whole world for the core preview.
  it.each(['OptionalCascadeVisualization', 'EnhancedHolographicDisplays'])(
    '%s also has a local Suspense below its boundary',
    (name) => {
      for (const use of jsxElementsNamed(name)) {
        const suspense = enclosingTag(use, 'Suspense');
        expect(suspense, `${name} has no local Suspense`).toBeDefined();
        expect(enclosingTag(suspense!, 'ErrorBoundary')).toBeDefined();
      }
    }
  );

  // Core process and ground stay unguarded on purpose: their absence should
  // fail visibly rather than be silently replaced by nothing.
  it.each(['MachinesContainer', 'OperationalConveyors', 'OperationalForklifts', 'AuthoredTerrain'])(
    '%s stays outside any local ErrorBoundary',
    (name) => {
      const uses = jsxElementsNamed(name);
      expect(uses.length).toBeGreaterThan(0);
      for (const use of uses) expect(enclosingTag(use, 'ErrorBoundary')).toBeUndefined();
    }
  );
});
