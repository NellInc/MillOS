/** Tripo H-series pilot queue. Default is read-only preflight.
 * --plan=... --submit=<id> submits ONE reviewed reference; --poll=<id> resumes it.
 * No paid POST retries. An ambiguous submission retains its full reservation and
 * blocks new submissions until manually reconciled against the provider account.
 * Working if insufficient funds/drift/ambiguity produce zero POSTs in the tests.
 */
import {
  readFileSync,
  writeFileSync,
  renameSync,
  openSync,
  closeSync,
  fsyncSync,
  unlinkSync,
  existsSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { pathToFileURL } from 'node:url';

const { fetch, AbortSignal, FormData, Blob } = globalThis;

export const CAP = 5000;
const BASE = 'https://openapi.tripo3d.ai/v3';
const MODEL = 'v3.1-20260211';
export const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
function save(file, value) {
  const temp = `${file}.tmp`;
  writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  const fd = openSync(temp, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temp, file);
}
export function validatePlan(plan, root, dir) {
  if (plan.approvedCapCredits !== CAP || !plan.jobs?.length)
    throw new Error('Missing approved 5000-credit scope');
  const ids = new Set();
  for (const [file, hash] of Object.entries(plan.sourceHashes ?? {})) {
    if (sha(readFileSync(path.resolve(root, file))) !== hash)
      throw new Error(`Source drift: ${file}`);
  }
  if (!Object.keys(plan.sourceHashes ?? {}).length) throw new Error('Missing source custody');
  for (const job of plan.jobs) {
    if (!/^[a-z0-9-]+$/.test(job.id) || ids.has(job.id))
      throw new Error('Invalid or duplicate job ID');
    ids.add(job.id);
    if (job.operation && !['texture', 'generation'].includes(job.operation))
      throw new Error('Unknown operation');
    if (job.operation === 'texture') {
      if (path.basename(job.modelFile) !== job.modelFile || !job.modelFile.endsWith('.glb'))
        throw new Error('Texture input must be local GLB basename');
      const model = readFileSync(path.join(dir, job.modelFile));
      if (
        sha(model) !== job.modelSha256 ||
        model.subarray(0, 4).toString() !== 'glTF' ||
        model.length > 150 * 1024 * 1024
      )
        throw new Error('Changed or invalid texture input');
      if (typeof job.texturePrompt !== 'string' || !job.texturePrompt.trim())
        throw new Error('Missing texture guidance');
    }
    if (
      job.expectedCredits !==
        (job.operation === 'texture' ? 10 : job.smartLowPoly === true ? 40 : 30) ||
      job.reserveCredits !== (job.operation === 'texture' ? 20 : 60) ||
      !Number.isInteger(job.faceLimit) ||
      job.faceLimit < 500 ||
      job.faceLimit > 10000
    )
      throw new Error('Unreviewed pricing or geometry options');
    if (path.basename(job.reference) !== job.reference || !job.reference.endsWith('.png'))
      throw new Error('Reference must be a local PNG basename');
    const bytes = readFileSync(path.join(dir, job.reference));
    if (!job.reviewed || sha(bytes) !== job.referenceSha256)
      throw new Error(`Unreviewed or changed reference: ${job.id}`);
    if (
      bytes.length > 20 * 1024 * 1024 ||
      bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
    )
      throw new Error('Invalid or oversized PNG');
  }
}
export function makeApi(key, fetcher = fetch) {
  return async (route, options = {}) => {
    let response;
    try {
      response = await fetcher(BASE + route, {
        ...options,
        redirect: 'error',
        signal: AbortSignal.timeout(60000),
        headers: {
          Authorization: `Bearer ${key}`,
          'User-Agent': 'MillOS-asset-preflight/1.0',
          ...options.headers,
        },
      });
    } catch (error) {
      // Identify the failed stage without logging headers, uploads or tokens.
      // Working if a transport failure names its route and still makes one call.
      const code = error?.cause?.code ?? error?.code;
      throw new Error(
        `Tripo ${options.method ?? 'GET'} ${route}: fetch failed${code ? ` (${code})` : ''}`,
        { cause: error }
      );
    }
    if (!response.ok) throw new Error(`Tripo HTTP ${response.status}`);
    const body = await response.json();
    if (body.code !== 0 || !body.data) throw new Error(`Tripo API code ${body.code}`);
    return body.data;
  };
}
export async function runQueue({ plan, dir, root, mode = 'preflight', id, api }) {
  const ledgerFile = path.join(dir, 'billing-ledger.json');
  const ledger = existsSync(ledgerFile)
    ? JSON.parse(readFileSync(ledgerFile, 'utf8'))
    : { capCredits: CAP, jobs: {} };
  if (ledger.capCredits !== CAP) throw new Error('Ledger cap mismatch');
  // Polling must remain possible after source/reference changes: it cannot spend.
  if (mode !== 'poll') validatePlan(plan, root, dir);
  const job = plan.jobs.find((j) => j.id === id);
  if (mode === 'poll') {
    const record = ledger.jobs[id];
    if (!record?.taskId)
      throw new Error('No recorded task ID; reconcile ambiguous submission manually');
    const result = await api(`/tasks/${encodeURIComponent(record.taskId)}`);
    if (result.task_id !== record.taskId) throw new Error('Provider task identity mismatch');
    record.status = result.status;
    record.reportedCredits = result.credits_consumed ?? null;
    record.output = result.output ?? null;
    record.lastPolledAt = new Date().toISOString();
    // Settlement is a point-in-time receipt. Later polls can refresh an expired
    // output URL, but later account activity must never rewrite that receipt.
    // Working if a settled task can be polled after other jobs without rebilling it.
    if (['success', 'failed', 'cancelled'].includes(result.status) && !record.balanceAfter) {
      const after = await api('/account/balance');
      record.balanceAfter = after;
      record.observedAccountDebit =
        record.balanceBefore.balance + record.balanceBefore.frozen - after.balance - after.frozen;
      record.billingCaveat =
        'Account-wide debit can include concurrent activity; not attributed solely to this task.';
      if (
        !Number.isFinite(record.observedAccountDebit) ||
        record.observedAccountDebit > record.reserveCredits
      )
        ledger.reconciliationRequired = true;
    }
    if (Number.isFinite(record.reportedCredits) && record.reportedCredits > record.reserveCredits)
      ledger.reconciliationRequired = true;
    save(ledgerFile, ledger);
    return {
      id,
      taskId: record.taskId,
      status: record.status,
      output: record.output,
      reconciliationRequired: !!ledger.reconciliationRequired,
    };
  }
  const balance = await api('/account/balance');
  if (!Number.isFinite(balance.balance) || balance.balance < 0 || !Number.isFinite(balance.frozen))
    throw new Error('Unrecognized balance response');
  const reserve = job?.reserveCredits ?? 60;
  const records = Object.values(ledger.jobs);
  const reserved = records.reduce((n, r) => n + r.reserveCredits, 0);
  if (!Number.isFinite(reserved)) throw new Error('Invalid reservation ledger');
  const blockedBy = [];
  if (ledger.reconciliationRequired || records.some((r) => r.status === 'submitting'))
    blockedBy.push('ambiguous billing/submission requires reconciliation');
  if (records.some((r) => !['success', 'failed', 'cancelled'].includes(r.status)))
    blockedBy.push('poll outstanding task before another submission');
  if (balance.frozen !== 0)
    blockedBy.push('account has frozen credits; wait for existing account activity');
  if (balance.balance < reserve)
    blockedBy.push(`insufficient available credits for ${reserve}-credit conservative reservation`);
  if (reserved + reserve > CAP) blockedBy.push('approved cap exhausted');
  const preflight = {
    checkedAt: new Date().toISOString(),
    balance,
    capCredits: CAP,
    reservedCredits: reserved,
    blockedBy,
    submittedJobs: records.filter((r) => r.taskId).length,
  };
  save(path.join(dir, 'preflight.json'), preflight);
  if (mode === 'preflight') return preflight;
  if (mode !== 'submit' || !job) throw new Error('Unknown mode or job');
  if (ledger.jobs[id])
    throw new Error('Job already has a ledger record; never resubmit automatically');
  if (blockedBy.length) throw new Error(blockedBy.join('; '));
  const bytes = readFileSync(path.join(dir, job.reference));
  const form = new FormData();
  form.set('file', new Blob([bytes], { type: 'image/png' }), job.reference);
  const upload = await api('/files', { method: 'POST', body: form });
  if (typeof upload.file_token !== 'string' || !upload.file_token)
    throw new Error('Upload returned no token');
  let inputToken = upload.file_token;
  if (job.operation === 'texture') {
    const modelForm = new FormData();
    modelForm.set(
      'file',
      new Blob([readFileSync(path.join(dir, job.modelFile))], { type: 'model/gltf-binary' }),
      job.modelFile
    );
    const modelUpload = await api('/files', { method: 'POST', body: modelForm });
    if (typeof modelUpload.file_token !== 'string' || !modelUpload.file_token)
      throw new Error('Model upload returned no token');
    inputToken = modelUpload.file_token;
  }
  const record = {
    status: 'submitting',
    operation: job.operation ?? 'generation',
    reserveCredits: reserve,
    expectedCredits: job.expectedCredits,
    balanceBefore: balance,
    referenceSha256: job.referenceSha256,
    fileToken: inputToken,
    referenceToken: upload.file_token,
    modelSha256: job.modelSha256,
    model: job.operation === 'texture' ? 'v3.0-20250812' : MODEL,
    startedAt: new Date().toISOString(),
  };
  ledger.jobs[id] = record;
  // Durable intent BEFORE the paid POST. Any interrupted/uncertain POST stays blocked.
  save(ledgerFile, ledger);
  const result = await api(
    job.operation === 'texture' ? '/models/texture' : '/generation/image-to-model',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        job.operation === 'texture'
          ? {
              input: inputToken,
              model: 'v3.0-20250812',
              texture_prompt: {
                text: job.texturePrompt,
                style_image: { file_token: upload.file_token },
              },
              texture_quality: 'standard',
              pbr: true,
              bake: false,
            }
          : {
              input: upload.file_token,
              model: MODEL,
              face_limit: job.faceLimit,
              texture: true,
              pbr: true,
              texture_quality: 'standard',
              geometry_quality: 'standard',
              enable_image_autofix: false,
              texture_alignment: 'original_image',
              auto_size: false,
              quad: false,
              smart_low_poly: job.smartLowPoly === true,
              generate_parts: false,
            }
      ),
    }
  );
  if (typeof result.task_id !== 'string' || !result.task_id)
    throw new Error('No task ID; reconcile submission manually');
  record.taskId = result.task_id;
  record.status = 'queued';
  save(ledgerFile, ledger);
  return { id, taskId: record.taskId, status: record.status, reservedCredits: reserved + reserve };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !/^--(plan|submit|poll)=/.test(arg)))
    throw new Error('Use --plan=path [--submit=id | --poll=id]');
  const arg = (name) => args.find((v) => v.startsWith(`--${name}=`))?.slice(name.length + 3);
  if (arg('submit') && arg('poll')) throw new Error('Choose submit or poll');
  const planPath = path.resolve(arg('plan') ?? 'test-results/tripo-world-20260907/pilot-plan.json');
  const dir = path.dirname(planPath);
  if (dir !== path.resolve('test-results/tripo-world-20260907'))
    throw new Error('Keep this campaign in its single ledger directory');
  const lockPath = path.join(dir, '.queue.lock');
  // Never reclaim automatically: a crashed paid request needs reconciliation first.
  const lock = openSync(lockPath, 'wx', 0o600);
  try {
    const plan = JSON.parse(readFileSync(planPath, 'utf8'));
    const key = execFileSync('security', ['find-generic-password', '-s', 'tripo', '-w'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    const mode = arg('submit') ? 'submit' : arg('poll') ? 'poll' : 'preflight';
    console.log(
      JSON.stringify(
        await runQueue({
          plan,
          dir,
          root: process.cwd(),
          mode,
          id: arg('submit') ?? arg('poll'),
          api: makeApi(key),
        }),
        null,
        2
      )
    );
  } finally {
    closeSync(lock);
    unlinkSync(lockPath);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
