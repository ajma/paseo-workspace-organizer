// Finds the pull request for a workspace's branch when Paseo has not detected one, using the daemon machine's gh CLI.
import { execFile } from "node:child_process";
import { z } from "zod";

// Shared branches have many PRs from other work; never attach one of those to a workspace.
const SHARED_BRANCHES = new Set(["main", "master", "trunk", "develop", "dev"]);
const listSchema = z.array(z.object({ url: z.string().url(), updatedAt: z.string().optional() }));

export type PrFinder = (directory: string, branch: string, signal: AbortSignal) => Promise<string | null>;

// The most recently updated PR of any state whose head is this branch, in the repository at `directory`.
export const findPullRequest: PrFinder = async (directory, branch, signal) => {
  const stdout = await new Promise<string>((resolve, reject) => {
    execFile("gh", ["pr", "list", "--head", branch, "--state", "all", "--limit", "10", "--json", "url,updatedAt"], {
      cwd: directory, encoding: "utf8", timeout: 10_000, maxBuffer: 1024 * 1024, windowsHide: true, signal,
      env: { ...process.env, GH_PROMPT_DISABLED: "1", GH_PAGER: "cat" },
    }, (error, output) => { if (error) reject(error); else resolve(output); });
  });
  const prs = listSchema.parse(JSON.parse(stdout));
  prs.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  return prs[0]?.url ?? null;
};

export function shouldLookUp(branch: string | null | undefined): branch is string {
  return Boolean(branch) && !SHARED_BRANCHES.has(branch!.toLowerCase());
}

// Caches lookups for ten minutes (also after failures, so a missing gh login is not retried constantly),
// runs two at a time, and reports when an answer changes.
export function createPrLookup(find: PrFinder = findPullRequest, now: () => number = Date.now, ttlMs = 10 * 60_000) {
  const lifetime = new AbortController();
  const values = new Map<string, { url: string | null; readAt: number }>();
  const queue: { key: string; directory: string; branch: string }[] = [];
  const queued = new Set<string>();
  const listeners = new Set<() => void>();
  let running = 0;
  const keyOf = (directory: string, branch: string) => JSON.stringify([directory, branch]);
  function pump() {
    while (running < 2 && queue.length && !lifetime.signal.aborted) {
      const job = queue.shift()!;
      running++;
      void find(job.directory, job.branch, lifetime.signal).catch(() => null).then((url) => {
        const previous = values.get(job.key);
        values.set(job.key, { url, readAt: now() });
        if (previous?.url !== url && !lifetime.signal.aborted) listeners.forEach((listener) => listener());
      }).finally(() => { running--; queued.delete(job.key); pump(); });
    }
  }
  return {
    // The last known PR URL, or null; asks again in the background when unknown or stale.
    get(directory: string | null | undefined, branch: string | null | undefined): string | null {
      if (!directory || !shouldLookUp(branch)) return null;
      const key = keyOf(directory, branch);
      const cached = values.get(key);
      if ((!cached || now() - cached.readAt >= ttlMs) && !queued.has(key)) {
        queued.add(key);
        queue.push({ key, directory, branch });
        pump();
      }
      return cached?.url ?? null;
    },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() { lifetime.abort(); queue.length = 0; listeners.clear(); },
  };
}
