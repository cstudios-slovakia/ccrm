/**
 * Admission control for the QA audit: one run per machine, and only when the
 * machine can carry it.
 *
 * Several editor sessions share this machine, and each of them follows the
 * same "test when finished" rule, so runs used to pile up: two or three at
 * once, each a Chromium per worker plus a dev server, on a 16 GB machine
 * already carrying the editors, Docker and WSL. The result was 0.2 GB free,
 * runs that hung for half an hour and reported nothing, and "defects" that
 * vanished on a quiet machine.
 *
 * Used from two places so it cannot be bypassed: `run-qa.mjs` before it spawns
 * playwright, and `tests/e2e/globalSetup.ts` for anyone who runs
 * `npx playwright test` directly. The runner hands its lock down through
 * `QA_LOCK_OWNER` so the global setup does not queue behind its own parent.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

/**
 * One lock for the whole machine, in the user's temp directory rather than
 * the checkout: the runs that collided came from different sessions and
 * different worktrees of this same repo, and they all share one CPU and one
 * pool of memory.
 */
export const LOCK_FILE = path.join(os.tmpdir(), 'ccrm-qa-run.lock');

/* Free physical memory a run needs before it may start. One run measured
   ~2 GB for playwright and two browsers plus ~0.6 GB for its dev server, and
   a one-worker run completed cleanly with 1.4 GB free; below that it pages. CI
   runners are dedicated, so they skip the check. */
export const MIN_FREE_MB = Number(process.env.QA_MIN_FREE_MB ?? (process.env.CI ? 0 : 1536));
/* How long to queue behind another run, low memory or a busy port. */
export const WAIT_MINUTES = Number(process.env.QA_WAIT_MIN ?? 30);
/* A lock older than this belongs to a run that is hung or was killed without
   cleanup — the run itself is capped at 45 minutes. */
const STALE_LOCK_MINUTES = 60;
const POLL_MS = 5000;
const MB = 1024 * 1024;

export const freeMb = () => Math.round(os.freemem() / MB);

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function readLock() {
  try {
    return JSON.parse(readFileSync(LOCK_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function removeLock() {
  try {
    unlinkSync(LOCK_FILE);
  } catch {
    /* already gone, or another waiter cleared it first */
  }
}

/** The live run holding the lock, or null after clearing a stale one. */
export function lockHolder() {
  const held = readLock();
  if (!held) {
    removeLock();
    return null;
  }
  if (held.pid === process.pid) return null;
  const ageMin = (Date.now() - (held.startedAt ?? 0)) / 60000;
  if (pidAlive(held.pid) && ageMin <= STALE_LOCK_MINUTES) return { ...held, ageMin };
  removeLock();
  return null;
}

function tryLock(info) {
  try {
    /* 'wx' is create-only, so two waiters cannot both win. */
    writeFileSync(LOCK_FILE, JSON.stringify({ ...info, pid: process.pid, startedAt: Date.now() }), { flag: 'wx' });
    return true;
  } catch (err) {
    if (err.code === 'EEXIST') return false;
    throw err;
  }
}

/** Releases the lock if this process holds it. Safe to call at any time. */
export function releaseRunLock() {
  if (readLock()?.pid !== process.pid) return;
  removeLock();
}

export function portBusy(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port: Number(port), host: '127.0.0.1' });
    const done = (busy) => {
      socket.destroy();
      resolve(busy);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(1000, () => done(false));
  });
}

/**
 * Kills leftover dev servers on the QA port — but only true orphans, whose
 * parent process is gone. A sibling run's server has a live playwright
 * parent, and a server you started yourself for `QA_REUSE_SERVER=1` has a
 * live shell. Killing by port alone used to take those down too, which is
 * where the mid-run `ERR_CONNECTION_REFUSED` and the phantom
 * `VIEW_RENDERED_EMPTY` findings came from.
 */
export function sweepOrphans(port) {
  if (process.platform !== 'win32') return;
  const filter = `$_.Name -eq 'node.exe' -and $_.CommandLine -like '*--port ${port}*--strictPort*'`;
  const script =
    `$all = Get-CimInstance Win32_Process; $live = @{}; ` +
    `foreach ($p in $all) { $live[[int]$p.ProcessId] = $true }; ` +
    `$all | Where-Object { ${filter} } | Where-Object { -not $live.ContainsKey([int]$_.ParentProcessId) } | ` +
    `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
  try {
    execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'ignore' });
  } catch {
    /* best effort: an orphan left behind is a nuisance, not a failed run */
  }
}

/** The whole tree under a pid: the playwright CLI, its workers, every browser. */
export function killTree(pid) {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } else {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Resolves once this run may start: no other run holds the lock, enough
 * memory is free, and (when `checkPort` is on) the port is not held by
 * something this runner did not start. Prints why it is waiting, once per
 * reason. Throws after `WAIT_MINUTES` rather than start a run whose findings
 * would be noise. The lock is released automatically when the process exits.
 *
 * @param {{ scope: string, port: string | number, checkPort?: boolean, log?: (line: string) => void }} opts
 */
export async function admitRun({ scope, port, checkPort = true, log = console.log }) {
  sweepOrphans(port);
  const deadline = Date.now() + WAIT_MINUTES * 60000;
  let lastReason = null;
  for (;;) {
    const reasons = [];
    const free = freeMb();
    if (free < MIN_FREE_MB) reasons.push(`only ${free} MB of RAM free (need ${MIN_FREE_MB}; QA_MIN_FREE_MB overrides)`);
    if (checkPort && (await portBusy(port))) {
      reasons.push(`port ${port} is in use (a run from another session, or a server you started — QA_REUSE_SERVER=1 to use it)`);
    }
    if (reasons.length === 0 && tryLock({ scope, cwd: process.cwd() })) {
      process.on('exit', releaseRunLock);
      return;
    }
    const holder = lockHolder();
    if (holder) {
      reasons.unshift(`another QA run is live: PID ${holder.pid}, ${holder.scope}, started ${Math.round(holder.ageMin)} min ago`);
    } else if (reasons.length === 0) {
      continue; /* the lock was just released or was stale; try again right away */
    }
    const reason = reasons.join('; ');
    if (reason !== lastReason) {
      log(`Waiting: ${reason}`);
      lastReason = reason;
    }
    if (Date.now() > deadline) {
      throw new Error(`QA run not started: gave up after ${WAIT_MINUTES} min (${reason}). QA_WAIT_MIN=n changes the wait.`);
    }
    await sleep(POLL_MS);
  }
}
