import { expect, it } from 'vitest';
import * as ts from 'typescript';
import { NULLABLE_PHYSICAL_FIELDS } from '../physicalSession';

// The decode's field check needs to know which saved fields may legitimately be
// null; the type of the captured record is the authority, so read it from the
// real source rather than a copy. Working if every top-level field whose type
// admits null (or is optional, which a fresh page would omit) is listed, and
// nothing else is.
it('lists exactly the saved fields whose type admits null', () => {
  const root = process.cwd();
  const configPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json')!;
  const config = ts.parseJsonConfigFileContent(
    ts.readConfigFile(configPath, ts.sys.readFile).config,
    ts.sys,
    root
  );
  const file = `${root}/src/utils/physicalSession.ts`;
  const program = ts.createProgram([file], {
    ...config.options,
    noEmit: true,
    skipLibCheck: true,
  });
  const checker = program.getTypeChecker();
  let captured: ts.Type | undefined;
  ts.forEachChild(program.getSourceFile(file)!, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'capturePhysicalSession')
      captured = checker.getReturnTypeOfSignature(checker.getSignatureFromDeclaration(node)!);
  });
  expect(captured).toBeDefined();
  // Logistics has its own validator; version and participants are not field-checked.
  const checkedDomains = new Set([
    'production',
    'material',
    'operations',
    'game',
    'maintenance',
    'trucks',
    'quality',
    'safety',
    'achievements',
    'tick',
    'clock',
  ]);
  const derived: Record<string, string[]> = {};
  const optional: string[] = [];
  for (const domain of checker.getPropertiesOfType(captured!)) {
    if (!checkedDomains.has(domain.name)) continue;
    for (const field of checker.getPropertiesOfType(checker.getTypeOfSymbol(domain))) {
      const type = checker.getTypeOfSymbol(field);
      const parts = type.isUnion() ? type.types : [type];
      if (field.flags & ts.SymbolFlags.Optional) optional.push(`${domain.name}.${field.name}`);
      if (parts.some((part) => part.flags & ts.TypeFlags.Null))
        (derived[domain.name] ??= []).push(field.name);
    }
  }
  // An optional field is absent from a fresh page's defaults, so a record
  // carrying it would be rejected as unknown; none may exist.
  expect(optional).toEqual([]);
  const listed = Object.fromEntries(
    Object.entries(NULLABLE_PHYSICAL_FIELDS).map(([domain, fields]) => [domain, [...fields].sort()])
  );
  expect(
    Object.fromEntries(Object.entries(derived).map(([domain, fields]) => [domain, fields.sort()]))
  ).toEqual(listed);
}, 120_000);
