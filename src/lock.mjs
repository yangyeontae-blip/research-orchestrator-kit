import * as fs from 'node:fs/promises';
import os from 'node:os';
import { unlinkQuiet } from './utils.mjs';

const LOCK_WAIT_MS = 10_000;
// State transactions take milliseconds; an older lock was left behind by a crashed process.
const STALE_LOCK_MS = 120_000;

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

// Returns true when the lock file is gone (removed now or already absent) so the caller can retry immediately.
async function removeStaleLock(lockPath) {
  let stat;
  try {
    stat = await fs.stat(lockPath);
  } catch (error) {
    if (error.code === 'ENOENT') return true;
    throw error;
  }
  let owner = null;
  try {
    owner = JSON.parse(await fs.readFile(lockPath, 'utf8'));
  } catch {
    /* the owner may still be writing it */
  }
  const deadOwner =
    owner?.host === os.hostname() &&
    Number.isInteger(owner.pid) &&
    owner.pid !== process.pid &&
    !processAlive(owner.pid);
  if (!deadOwner && Date.now() - stat.mtimeMs < STALE_LOCK_MS) return false;
  // Another process may have replaced the stale file with a live lock since we looked; never remove that one.
  const again = await fs.stat(lockPath).catch(() => null);
  if (again && (again.ino !== stat.ino || again.mtimeMs !== stat.mtimeMs)) return false;
  await unlinkQuiet(lockPath);
  return true;
}

// Exclusive lock file shared by every rok command in one project; `displayPath` is only used in the error message.
export async function acquireLock(lockPath, displayPath = lockPath) {
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      const handle = await fs.open(lockPath, 'wx');
      await handle.writeFile(JSON.stringify({ pid: process.pid, host: os.hostname(), at: new Date().toISOString() }));
      return handle;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    if (await removeStaleLock(lockPath)) continue;
    if (Date.now() >= deadline) {
      throw new Error(`Workflow state is locked by another rok command. If none is running, delete ${displayPath}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

export async function releaseLock(handle, lockPath) {
  await handle.close();
  await unlinkQuiet(lockPath);
}
