import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const TABLES = [
  'metal-gpu-intervals',
  'metal-application-intervals',
  'metal-application-encoders-list',
];
const FIELDS = new Set([
  'time',
  'start-time',
  'end-time',
  'duration',
  'timestamp',
  'submit-time',
  'gpu-start-time',
  'gpu-end-time',
  'scheduled-time',
  'execution-time',
  'command-buffer',
  'command-buffer-id',
  'command-buffer-index',
  'encoder',
  'encoder-id',
  'queue',
  'queue-id',
  'frame',
  'frame-index',
  'sequence',
  'sequence-number',
  'pid',
  'process-id',
  'tid',
  'thread-id',
]);
const NUMBER = /^(?:-?\d+(?:\.\d+)?(?:e[+-]?\d+)?|0x[\da-f]{1,16})$/i;

export function ownedGpuPid(processes) {
  const gpu = processes.filter((item) => item.type === 'GPU');
  assert.equal(gpu.length, 1, 'Trace only the unique GPU process of this owned browser');
  assert.ok(Number.isSafeInteger(gpu[0].id) && gpu[0].id > 0, 'GPU PID must be explicit');
  return gpu[0].id;
}

// Raw Instruments bundles/XML/logs never enter the artifact directory. Only
// owned-PID rows and allowlisted numeric fields leave this parser; fmt strings,
// names, paths, stacks, resource contents and unknown fields are discarded.
// Working if unrelated/anonymous rows and all nonnumeric content stay private.
export function numericMetalRows(xml, pid) {
  assert.ok(xml.length <= 32 * 1024 * 1024, 'Trace export is bounded');
  assert.doesNotMatch(xml, /<!DOCTYPE|<!ENTITY/i, 'No external entities in trace exports');
  const dom = new JSDOM(xml, { contentType: 'text/xml' });
  try {
    const document = dom.window.document;
    const ids = new Map([...document.querySelectorAll('[id]')].map((n) => [n.id, n]));
    const resolve = (node) => {
      for (let i = 0; node?.hasAttribute('ref') && i < 8; i++) {
        node = ids.get(node.getAttribute('ref'));
      }
      return node?.hasAttribute('ref') ? null : node;
    };
    const columns = [...document.querySelectorAll('schema > col')].map((col) =>
      col.querySelector('mnemonic')?.textContent?.trim()
    );
    const allRows = [...document.querySelectorAll('row')];
    const result = { rows: [], totalRows: allRows.length, unownedRows: 0, truncated: false };
    for (const [index, row] of allRows.entries()) {
      const rowNodes = [...row.children].map(resolve).filter(Boolean);
      const processNodes = rowNodes
        .flatMap((node) => [
          ...(['process', 'owner-process'].includes(node.localName) ? [node] : []),
          ...node.querySelectorAll('process, owner-process'),
        ])
        .map(resolve);
      const pidNodes = [
        ...rowNodes.filter((node) => ['pid', 'process-id'].includes(node.localName)),
        ...processNodes.flatMap((node) => [...(node?.querySelectorAll('pid, process-id') ?? [])]),
      ];
      const rowPids = pidNodes.map((node) => resolve(node)?.textContent?.trim()).filter(Boolean);
      if (!rowPids.length || rowPids.some((value) => value !== String(pid))) {
        result.unownedRows++;
        continue;
      }
      if (result.rows.length >= 20_000) {
        result.truncated = true;
        break;
      }
      const fields = {};
      [...row.children].forEach((child, column) => {
        const key = columns[column];
        if (!FIELDS.has(key)) return;
        const node = resolve(child);
        const value = node?.textContent?.trim();
        if (value && value.length <= 64 && NUMBER.test(value)) fields[key] = value;
      });
      if (Object.keys(fields).length) result.rows.push({ index, fields });
    }
    return result;
  } finally {
    dom.window.close();
  }
}

function privateCommand(command, args, privateDirectory, name, timeout) {
  return new Promise((resolve) => {
    const child = execFile(
      command,
      args,
      { timeout, maxBuffer: 4 * 1024 * 1024 },
      async (error, stdout, stderr) => {
        const completedAt = Date.now();
        try {
          await writeFile(path.join(privateDirectory, `${name}.log`), stdout + stderr, {
            mode: 0o600,
          });
        } catch {
          resolve({
            ok: false,
            exitCode: null,
            completedAt,
            timedOut: false,
            stdout: '',
            stderr: '',
          });
          return;
        }
        resolve({
          ok: !error,
          exitCode: Number.isInteger(error?.code) ? error.code : null,
          timedOut: error?.killed === true,
          completedAt,
          stdout,
          stderr,
        });
      }
    );
    child.stdin.end();
  });
}

export async function preflightMetalTrace(privateDirectory) {
  assert.equal(process.platform, 'darwin');
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  await mkdir(privateDirectory, { recursive: true, mode: 0o700 });
  const templates = await privateCommand(
    'xcrun',
    ['xctrace', 'list', 'templates'],
    privateDirectory,
    'templates',
    30_000
  );
  const help = await privateCommand(
    'xcrun',
    ['xctrace', 'record', '--help'],
    privateDirectory,
    'record-help',
    30_000
  );
  const notify = await privateCommand(
    '/usr/bin/notifyutil',
    ['-h'],
    privateDirectory,
    'notify-help',
    5000
  );
  const receipt = {
    templateAvailable: templates.ok && /^Metal System Trace\s*$/m.test(templates.stdout),
    startNotificationAvailable: (help.stdout + help.stderr).includes('--notify-tracing-started'),
    notificationObserverAvailable: (notify.stdout + notify.stderr).includes('register for key'),
    rawUploaded: false,
  };
  return receipt;
}

export async function startMetalTrace(pid, privateDirectory) {
  assert.ok(Number.isSafeInteger(pid) && pid > 0);
  const notification = `org.nellinc.millos.trace.${process.pid}.${pid}`;
  // Native one-notification wait, no model polling or arbitrary startup sleep.
  const notified = privateCommand(
    '/usr/bin/notifyutil',
    ['-1', notification],
    privateDirectory,
    'record-start',
    25_000
  );
  const requestedAt = Date.now();
  const trace = path.join(privateDirectory, 'owned-gpu.trace');
  const recording = privateCommand(
    'xcrun',
    [
      'xctrace',
      'record',
      '--template',
      'Metal System Trace',
      '--attach',
      String(pid),
      '--time-limit',
      '120s',
      '--notify-tracing-started',
      notification,
      '--output',
      trace,
    ],
    privateDirectory,
    'record',
    160_000
  );
  const start = await notified;
  const startNotificationAt = start.ok ? start.completedAt : null;
  const finish = async (deadline = Date.now() + 120_000) => {
    const recorded = await recording;
    const receipt = {
      pid,
      requestedAt,
      startNotificationAt,
      completedAt: recorded.completedAt,
      collectedAt: Date.now(),
      recorded: recorded.ok,
      exitCode: recorded.exitCode,
      timedOut: recorded.timedOut,
      rawUploaded: false,
      tables: [],
      diagnosticOnly: true,
    };
    if (!recorded.ok) return receipt;
    const remaining = () => Math.max(1, Math.min(30_000, deadline - Date.now()));
    if (Date.now() >= deadline) {
      receipt.exportStatus = 'diagnostic-deadline';
      return receipt;
    }
    const toc = await privateCommand(
      'xcrun',
      ['xctrace', 'export', '--input', trace, '--toc'],
      privateDirectory,
      'toc',
      remaining()
    );
    if (!toc.ok) {
      receipt.exportStatus = 'toc-unavailable';
      return receipt;
    }
    const dom = new JSDOM(toc.stdout, { contentType: 'text/xml' });
    const present = new Set(
      [...dom.window.document.querySelectorAll('table')].map((node) => node.getAttribute('schema'))
    );
    dom.window.close();
    for (const schema of TABLES.filter((item) => present.has(item))) {
      if (Date.now() >= deadline) {
        receipt.exportStatus = 'diagnostic-deadline';
        return receipt;
      }
      const output = path.join(privateDirectory, `${schema}.xml`);
      const exported = await privateCommand(
        'xcrun',
        [
          'xctrace',
          'export',
          '--input',
          trace,
          '--xpath',
          `/trace-toc/run[@number="1"]/data/table[@schema="${schema}"]`,
          '--output',
          output,
        ],
        privateDirectory,
        schema,
        remaining()
      );
      if (!exported.ok) {
        receipt.tables.push({ schema, exported: false });
        continue;
      }
      try {
        receipt.tables.push({
          schema,
          exported: true,
          ...numericMetalRows(await readFile(output, 'utf8'), pid),
        });
      } catch {
        receipt.tables.push({ schema, exported: false, status: 'export-rejected' });
      }
    }
    receipt.exportStatus = receipt.tables.some((table) => table.rows?.length)
      ? 'owned-numeric-rows'
      : 'no-owned-metal-rows';
    return receipt;
  };
  return { started: start.ok, finish };
}
