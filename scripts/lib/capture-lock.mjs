/**
 * A whole-machine mutex for anything that renders.
 *
 * WHY THIS EXISTS. Two headless Chromium instances driving a WebGL scene on one
 * GPU do not fail. They each run at roughly half speed, and the frame rate that
 * then lands in the report is a measurement of the other process rather than of
 * the scene. This repository routinely fans out agents - `blind-ab-judge` and
 * `visual-fidelity-judge` are separate agent types, and the audit sweeps run
 * parallel workers - so concurrent captures are the normal case, not an edge
 * case. Without serialisation, `overview` failing its 55 FPS budget by 7 FPS is
 * indistinguishable from another agent holding the GPU.
 *
 * The related hazard the lock does NOT solve, and which callers must still
 * respect: comparing a measurement against a control taken at a different time
 * on a shared tree attributes every other change in between to yours. An A/B
 * must be one variable, ideally toggled at runtime in a single process.
 *
 * Usage:
 *   const lock = await acquireCaptureLock('art-review');
 *   try { ... } finally { await lock.release(); }
 */
import { mkdir, readFile, rm } from 'node:fs/promises';
import {
  closeSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { setInterval, clearInterval, setTimeout } from 'node:timers';

const LOCK_FILENAME = '.capture.lock';

/**
 * Set by whichever process holds the lock, and inherited by everything it
 * spawns.
 *
 * `capture-art-review.mjs` runs `run-performance-benchmark.mjs` as a child - up
 * to twice, for the art pass and the conjoined budget gate - and both scripts
 * render. Without re-entrancy the child would block for the full timeout
 * waiting for a lock its own parent is holding, which is a deadlock that only
 * shows up under the flag nobody sets by default. Children are already
 * serialised by the parent's hold, so they simply inherit it.
 */
const LOCK_ENV_VAR = 'MILLOS_CAPTURE_LOCK_PID';

/**
 * How long a lock may be held before a waiter treats it as abandoned.
 *
 * The longest legitimate hold is a full art capture: a production build plus
 * five scenes at warmup-plus-duration each, plus the contact sheet. That runs to
 * several minutes on a cold cache, so the threshold has to clear it comfortably.
 * A holder that is still alive refreshes its heartbeat, so this only fires for a
 * process that died without releasing.
 */
const STALE_AFTER_MS = 20 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 30 * 1000;
const POLL_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    // Signal 0 performs the permission and existence check without delivering.
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to another user.
    return error.code === 'EPERM';
  }
}

async function readLock(lockPath) {
  try {
    return JSON.parse(await readFile(lockPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Decide whether an existing lock file may be taken over.
 *
 * A lock is reclaimable when its owner is gone, or when its heartbeat has not
 * advanced for longer than a legitimate hold could last. Both are reported to
 * the caller so a reclaim is never silent - a reclaim that happens often means
 * something is crashing without cleanup, which is worth seeing.
 */
function reclaimReason(record) {
  // A new holder can be between exclusive create and its first write. Older
  // holders also truncate during heartbeat updates. Neither proves abandonment.
  if (!record || typeof record !== 'object') return null;
  if (!isProcessAlive(record.pid)) return `owner pid ${String(record.pid)} is no longer running`;
  const beatAt = Date.parse(record.heartbeatAt ?? record.acquiredAt ?? '');
  if (!Number.isFinite(beatAt)) return 'lock file carried no usable timestamp';
  const age = Date.now() - beatAt;
  if (age > STALE_AFTER_MS) {
    return `heartbeat is ${Math.round(age / 1000)}s old, past the ${Math.round(STALE_AFTER_MS / 1000)}s limit`;
  }
  return null;
}

/**
 * Take the capture lock, waiting for any current holder to finish.
 *
 * @param {string} tag Short name of the work, shown to whoever is waiting.
 * @param {{root?: string, timeoutMs?: number, onWait?: (info: object) => void}} [config]
 * @returns {Promise<{release: () => Promise<void>, path: string, reclaimed: string|null}>}
 */
export async function acquireCaptureLock(tag, config = {}) {
  const root = config.root ?? process.cwd();
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const lockPath = path.join(root, LOCK_FILENAME);
  await mkdir(root, { recursive: true });

  const inheritedFrom = process.env[LOCK_ENV_VAR];
  if (inheritedFrom && isProcessAlive(Number(inheritedFrom))) {
    // An ancestor already serialised this work. Hand back a release that does
    // nothing, so the ancestor stays the sole owner of the lock file.
    return {
      path: lockPath,
      reclaimed: null,
      inheritedFrom: Number(inheritedFrom),
      async release() {},
    };
  }

  const deadline = Date.now() + timeoutMs;
  let announced = false;
  let reclaimed = null;

  for (;;) {
    const record = {
      tag,
      pid: process.pid,
      argv: process.argv.slice(1).join(' '),
      acquiredAt: new Date().toISOString(),
      heartbeatAt: new Date().toISOString(),
    };
    try {
      // 'wx' fails if the path exists, which is the atomic part.
      const handle = openSync(lockPath, 'wx');
      writeSync(handle, `${JSON.stringify(record, null, 2)}\n`);
      closeSync(handle);
      return startHolding(lockPath, record, reclaimed);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }

    const existing = await readLock(lockPath);
    const reason = reclaimReason(existing);
    if (reason) {
      console.warn(
        `Reclaiming a stale capture lock from "${existing?.tag ?? 'unknown'}": ${reason}.`
      );
      reclaimed = reason;
      await rm(lockPath, { force: true });
      continue;
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for the capture lock, ` +
          `held by "${existing?.tag ?? 'unknown'}" (pid ${String(existing?.pid)}) since ` +
          `${existing?.acquiredAt ?? 'unknown'}. Renders must not overlap: concurrent GPU work ` +
          `makes frame timings a measurement of the other process. Wait, or remove ${LOCK_FILENAME} ` +
          `if you are certain nothing is rendering.`
      );
    }

    if (!announced) {
      announced = true;
      const info = {
        holder: existing?.tag ?? 'unknown',
        pid: existing?.pid,
        since: existing?.acquiredAt,
      };
      if (config.onWait) config.onWait(info);
      else {
        console.log(
          `Waiting for the capture lock, held by "${info.holder}" (pid ${String(info.pid)}) since ${info.since}...`
        );
      }
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

function startHolding(lockPath, record, reclaimed) {
  let released = false;
  // Published so spawned children can see they are already covered.
  process.env[LOCK_ENV_VAR] = String(process.pid);

  const heartbeat = setInterval(() => {
    const temporary = `${lockPath}.${process.pid}.tmp`;
    try {
      const current = JSON.parse(readFileSync(lockPath, 'utf8'));
      if (released || current.pid !== process.pid) return;
      // Publish atomically: readers must never observe a truncated heartbeat.
      // Synchronous publication also cannot finish after release() removes it.
      writeFileSync(
        temporary,
        `${JSON.stringify({ ...record, heartbeatAt: new Date().toISOString() }, null, 2)}\n`
      );
      renameSync(temporary, lockPath);
    } catch {
      // Retain the last complete record if a heartbeat cannot be published.
    } finally {
      try {
        unlinkSync(temporary);
      } catch {
        /* Renamed or never created. */
      }
    }
  }, HEARTBEAT_INTERVAL_MS);
  heartbeat.unref?.();

  // Synchronous cleanup, because 'exit' and signal handlers cannot await. An
  // unreleased lock blocks the next agent for twenty minutes, so this path has
  // to work on the abrupt exits too.
  const releaseSync = () => {
    if (released) return;
    released = true;
    clearInterval(heartbeat);
    try {
      const current = JSON.parse(readFileSync(lockPath, 'utf8'));
      // Only ever remove our own lock. If a reclaim raced us the file belongs
      // to somebody else, and deleting it would hand the GPU to two processes.
      if (current.pid !== process.pid) return;
    } catch {
      return; // Unreadable or gone: ownership cannot be established.
    }
    try {
      unlinkSync(lockPath);
    } catch {
      /* Already removed. */
    }
  };

  const onSignal = (signal) => {
    releaseSync();
    process.exit(signal === 'SIGINT' ? 130 : 143);
  };
  process.once('exit', releaseSync);
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  return {
    path: lockPath,
    reclaimed,
    inheritedFrom: null,
    async release() {
      if (released) return;
      released = true;
      clearInterval(heartbeat);
      delete process.env[LOCK_ENV_VAR];
      process.removeListener('exit', releaseSync);
      process.removeListener('SIGINT', onSignal);
      process.removeListener('SIGTERM', onSignal);
      const current = await readLock(lockPath);
      // Only ever remove our own lock. If a reclaim raced us, the file now
      // belongs to somebody else and deleting it would hand the GPU to two
      // processes at once.
      if (!current || current.pid !== process.pid) return;
      await rm(lockPath, { force: true });
    },
  };
}
