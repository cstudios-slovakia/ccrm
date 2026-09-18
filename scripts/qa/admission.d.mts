/** Types for `admission.mjs`, so the playwright suite (TypeScript) can share it. */

export const LOCK_FILE: string;
export const MIN_FREE_MB: number;
export const WAIT_MINUTES: number;

export function freeMb(): number;
export function lockHolder(): { pid: number; scope: string; cwd: string; startedAt: number; ageMin: number } | null;
export function releaseRunLock(): void;
export function portBusy(port: string | number): Promise<boolean>;
export function sweepOrphans(port: string | number): void;
export function killTree(pid: number): void;
export function admitRun(opts: {
  scope: string;
  port: string | number;
  checkPort?: boolean;
  log?: (line: string) => void;
}): Promise<void>;
