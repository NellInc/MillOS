// @vitest-environment node
import { test, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { runQueue, sha, makeApi } from './tripo-world-queue.mjs';

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'millos-tripo-'));
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  writeFileSync(path.join(dir, 'pilot.png'), png);
  writeFileSync(path.join(dir, 'source.tsx'), 'source');
  const plan = {
    approvedCapCredits: 5000,
    sourceHashes: { 'source.tsx': sha('source') },
    jobs: [
      {
        id: 'pilot',
        reference: 'pilot.png',
        referenceSha256: sha(png),
        reviewed: true,
        expectedCredits: 30,
        reserveCredits: 60,
        faceLimit: 4000,
      },
    ],
  };
  const calls = [];
  const api = async (route, options) => {
    calls.push({ route, options });
    if (route === '/account/balance') return { balance: 500, frozen: 0 };
    if (route === '/files') return { file_token: 'file_test' };
    if (route === '/generation/image-to-model') return { task_id: 'task_test' };
    throw new Error('Unexpected endpoint');
  };
  return {
    dir,
    root: dir,
    plan,
    api,
    calls,
    clean: () => rmSync(dir, { recursive: true, force: true }),
  };
}
const withFixture = (fn) => async () => {
  const f = fixture();
  try {
    await fn(f);
  } finally {
    f.clean();
  }
};

test(
  'default preflight makes no POST',
  withFixture(async (f) => {
    const result = await runQueue(f);
    expect(result.blockedBy).toEqual([]);
    expect(f.calls.map((c) => c.route)).toEqual(['/account/balance']);
  })
);
test(
  '25 credits block submission before upload',
  withFixture(async (f) => {
    f.api = async (route) => {
      f.calls.push(route);
      return { balance: 25, frozen: 0 };
    };
    await expect(runQueue({ ...f, mode: 'submit', id: 'pilot' })).rejects.toThrow('insufficient');
    expect(f.calls).toEqual(['/account/balance']);
  })
);
test(
  'frozen credits block a concurrent account submission',
  withFixture(async (f) => {
    f.api = async () => ({ balance: 500, frozen: 30 });
    await expect(runQueue({ ...f, mode: 'submit', id: 'pilot' })).rejects.toThrow('frozen credits');
  })
);
for (const field of ['source', 'reference', 'review'])
  test(
    `${field} drift blocks before network`,
    withFixture(async (f) => {
      if (field === 'source') writeFileSync(path.join(f.dir, 'source.tsx'), 'changed');
      if (field === 'reference') writeFileSync(path.join(f.dir, 'pilot.png'), 'changed');
      if (field === 'review') f.plan.jobs[0].reviewed = false;
      await expect(runQueue(f)).rejects.toThrow();
      expect(f.calls).toEqual([]);
    })
  );
test(
  'cap exhaustion blocks uploads',
  withFixture(async (f) => {
    writeFileSync(
      path.join(f.dir, 'billing-ledger.json'),
      JSON.stringify({
        capCredits: 5000,
        jobs: { earlier: { status: 'success', reserveCredits: 4980 } },
      })
    );
    await expect(runQueue({ ...f, mode: 'submit', id: 'pilot' })).rejects.toThrow('cap exhausted');
    expect(f.calls.map((c) => c.route)).toEqual(['/account/balance']);
  })
);
test(
  'paid intent is durable before POST and receipt prevents duplicates',
  withFixture(async (f) => {
    const api = f.api;
    f.api = async (route, options) => {
      if (route === '/generation/image-to-model') {
        expect(
          JSON.parse(readFileSync(path.join(f.dir, 'billing-ledger.json'))).jobs.pilot.status
        ).toBe('submitting');
        const body = JSON.parse(options.body);
        expect(body.texture_quality).toBe('standard');
        expect(body.smart_low_poly).toBe(false);
        expect(body.face_limit).toBe(4000);
      }
      return api(route, options);
    };
    expect((await runQueue({ ...f, mode: 'submit', id: 'pilot' })).taskId).toBe('task_test');
    await expect(runQueue({ ...f, mode: 'submit', id: 'pilot' })).rejects.toThrow('already has');
    expect(f.calls.filter((c) => c.route === '/generation/image-to-model')).toHaveLength(1);
  })
);
test(
  'ambiguous POST stops without retry and holds the reservation',
  withFixture(async (f) => {
    const api = f.api;
    f.api = async (route, options) => {
      if (route === '/generation/image-to-model') throw new Error('connection lost');
      return api(route, options);
    };
    await expect(runQueue({ ...f, mode: 'submit', id: 'pilot' })).rejects.toThrow(
      'connection lost'
    );
    const result = await runQueue(f);
    expect(result.reservedCredits).toBe(60);
    expect(result.blockedBy.join(' ')).toContain('ambiguous');
  })
);
test(
  'poll still works after source drift and flags excessive account debit',
  withFixture(async (f) => {
    await runQueue({ ...f, mode: 'submit', id: 'pilot' });
    writeFileSync(path.join(f.dir, 'source.tsx'), 'changed');
    f.api = async (route) =>
      route === '/account/balance'
        ? { balance: 400, frozen: 0 }
        : {
            task_id: 'task_test',
            status: 'success',
            credits_consumed: 30,
            output: { model_url: 'https://example.com/model.glb' },
          };
    const result = await runQueue({ ...f, mode: 'poll', id: 'pilot' });
    expect(result.status).toBe('success');
    expect(result.reconciliationRequired).toBe(true);
  })
);
test('API transport rejects redirects and does not retry HTTP errors', async () => {
  let count = 0;
  const api = makeApi('test-key', async (url, options) => {
    count++;
    expect(url).toBe('https://openapi.tripo3d.ai/v3/account/balance');
    expect(options.redirect).toBe('error');
    return { ok: false, status: 403 };
  });
  await expect(api('/account/balance')).rejects.toThrow('HTTP 403');
  expect(count).toBe(1);
});

test('network diagnostics identify the stage without retrying a paid POST', async () => {
  let count = 0;
  const api = makeApi('test-key', async () => {
    count++;
    throw new TypeError('fetch failed', { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } });
  });
  await expect(api('/tasks', { method: 'POST' })).rejects.toThrow(
    'Tripo POST /tasks: fetch failed (UND_ERR_CONNECT_TIMEOUT)'
  );
  expect(count).toBe(1);
});

test(
  're-poll preserves the original settlement after later account spending',
  withFixture(async (f) => {
    await runQueue({ ...f, mode: 'submit', id: 'pilot' });
    let balance = 470;
    let balanceReads = 0;
    f.api = async (route) => {
      if (route === '/account/balance') {
        balanceReads++;
        return { balance, frozen: 0 };
      }
      return { task_id: 'task_test', status: 'success', credits_consumed: 30, output: {} };
    };
    await runQueue({ ...f, mode: 'poll', id: 'pilot' });
    balance = 300;
    const result = await runQueue({ ...f, mode: 'poll', id: 'pilot' });
    const record = JSON.parse(readFileSync(path.join(f.dir, 'billing-ledger.json'))).jobs.pilot;
    expect(result.reconciliationRequired).toBe(false);
    expect(record.balanceAfter).toEqual({ balance: 470, frozen: 0 });
    expect(record.observedAccountDebit).toBe(30);
    expect(balanceReads).toBe(1);
    f.api = async () => ({ task_id: 'task_test', status: 'success', credits_consumed: 70 });
    expect((await runQueue({ ...f, mode: 'poll', id: 'pilot' })).reconciliationRequired).toBe(true);
  })
);

test(
  'texture route reserves 20 and uploads only hash-checked authored model',
  withFixture(async (f) => {
    const job = f.plan.jobs[0];
    const model = Buffer.from('glTF-test');
    writeFileSync(path.join(f.dir, 'authored.glb'), model);
    Object.assign(job, {
      operation: 'texture',
      expectedCredits: 10,
      reserveCredits: 20,
      modelFile: 'authored.glb',
      modelSha256: sha(model),
      texturePrompt: 'Preserve green paint and timber.',
    });
    const original = f.api;
    f.api = async (route, options) => {
      if (route === '/models/texture') {
        const body = JSON.parse(options.body);
        expect(body.bake).toBe(false);
        expect(body.texture_quality).toBe('standard');
        expect(body.texture_prompt.text).toContain('green paint');
        return { task_id: 'texture_test' };
      }
      return original(route, options);
    };
    const result = await runQueue({ ...f, mode: 'submit', id: 'pilot' });
    expect(result.reservedCredits).toBe(20);
    expect(f.calls.filter((c) => c.route === '/files')).toHaveLength(2);
  })
);

test(
  'changed texture mesh blocks before any network call',
  withFixture(async (f) => {
    Object.assign(f.plan.jobs[0], {
      operation: 'texture',
      expectedCredits: 10,
      reserveCredits: 20,
      modelFile: 'authored.glb',
      modelSha256: sha('glTF-old'),
      texturePrompt: 'Green paint',
    });
    writeFileSync(path.join(f.dir, 'authored.glb'), 'glTF-new');
    await expect(runQueue(f)).rejects.toThrow('Changed or invalid');
    expect(f.calls).toEqual([]);
  })
);

test(
  'smart topology addon has explicit 40-credit pricing and no hidden HD addons',
  withFixture(async (f) => {
    Object.assign(f.plan.jobs[0], { smartLowPoly: true, expectedCredits: 40 });
    await runQueue({ ...f, mode: 'submit', id: 'pilot' });
    const body = JSON.parse(
      f.calls.find((c) => c.route === '/generation/image-to-model').options.body
    );
    expect(body.smart_low_poly).toBe(true);
    expect(body.geometry_quality).toBe('standard');
    expect(body.texture_quality).toBe('standard');
  })
);
