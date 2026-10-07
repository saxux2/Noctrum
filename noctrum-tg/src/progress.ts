import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";

// Remembers which steps of a multi-step money flow (lend, borrow, repay) already succeeded,
// so a retry after a later failure resumes instead of depositing or transferring funds again.
// Stored next to the wallets (data/ is the Railway volume), so it survives bot restarts.

export interface FlowProgress {
  step: number;
  data: Record<string, string>;
}

const PROGRESS_DIR = join(import.meta.dir, "..", "data", "progress");

function progressPath(key: string): string {
  return join(PROGRESS_DIR, `${createHash("sha256").update(key).digest("hex")}.json`);
}

export function loadProgress(key: string): FlowProgress {
  const fp = progressPath(key);
  if (!existsSync(fp)) return { step: 0, data: {} };
  try {
    return JSON.parse(readFileSync(fp, "utf-8"));
  } catch {
    return { step: 0, data: {} };
  }
}

export function saveProgress(key: string, progress: FlowProgress) {
  if (!existsSync(PROGRESS_DIR)) mkdirSync(PROGRESS_DIR, { recursive: true });
  writeFileSync(progressPath(key), JSON.stringify(progress));
}

export function clearProgress(key: string) {
  const fp = progressPath(key);
  if (existsSync(fp)) unlinkSync(fp);
}
