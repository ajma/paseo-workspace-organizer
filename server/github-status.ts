import { execFile } from "node:child_process";
import { z } from "zod";
import type { GithubLink } from "../shared/organization";
import type { GithubStatus } from "../shared/github-status";

const payloadSchema = z.object({
  state: z.string(), isDraft: z.boolean().optional(), mergedAt: z.string().nullable().optional(),
  reviewDecision: z.string().nullable().optional(),
  statusCheckRollup: z.array(z.object({ status: z.string().optional(), conclusion: z.string().nullable().optional(), state: z.string().optional() })).nullish(),
});

export function parseStatus(kind: GithubLink["kind"], payload: unknown, updatedAt: string): GithubStatus {
  const data = payloadSchema.parse(payload);
  const state = data.state.toUpperCase();
  const result: GithubStatus = { state: state === "MERGED" || (kind === "pr" && data.mergedAt) ? "merged"
    : state === "CLOSED" ? "closed" : state === "OPEN" ? kind === "pr" && data.isDraft ? "draft" : "open" : "unknown",
    checks: null, review: null, updatedAt, stale: false, error: null };
  if (kind === "issue") return result;
  const checks = data.statusCheckRollup;
  const failures = new Set(["FAILURE", "ERROR", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE", "STALE"]);
  const successes = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);
  const states = checks?.map((check) => check.status && check.status !== "COMPLETED" ? "PENDING" : check.conclusion ?? check.state ?? "UNKNOWN");
  result.checks = !states ? "unknown" : !states.length ? "none"
    : states.some((value) => failures.has(value)) ? "failure"
    : states.some((value) => value === "PENDING" || value === "EXPECTED") ? "pending"
    : states.every((value) => successes.has(value)) ? "success" : "unknown";
  result.review = data.reviewDecision === "APPROVED" ? "approved" : data.reviewDecision === "CHANGES_REQUESTED" ? "changes_requested"
    : data.reviewDecision === "REVIEW_REQUIRED" ? "pending" : data.reviewDecision === "" ? "none" : "unknown";
  return result;
}

export type StatusReader = (link: GithubLink, signal: AbortSignal) => Promise<GithubStatus>;
export const readGithubStatus: StatusReader = async (link, signal) => {
  const fields = link.kind === "pr" ? "state,isDraft,mergedAt,statusCheckRollup,reviewDecision" : "state";
  const stdout = await new Promise<string>((resolve, reject) => {
    execFile("gh", [link.kind === "pr" ? "pr" : "issue", "view", link.url, "--json", fields], {
      encoding: "utf8", timeout: 10_000, maxBuffer: 1024 * 1024, windowsHide: true, signal,
      env: { ...process.env, GH_PROMPT_DISABLED: "1", GH_PAGER: "cat" },
    }, (error, output) => { if (error) reject(error); else resolve(output); });
  });
  return parseStatus(link.kind, JSON.parse(stdout), new Date().toISOString());
};

export function createStatusCache(read: StatusReader = readGithubStatus, now: () => number = Date.now) {
  const lifetime = new AbortController();
  const values = new Map<string, { status: GithubStatus; readAt: number }>();
  const pending = new Map<string, Promise<GithubStatus>>();
  return {
    get(link: GithubLink): Promise<GithubStatus> {
      const cached = values.get(link.url);
      if (cached && now() - cached.readAt < 60_000) return Promise.resolve(cached.status);
      const running = pending.get(link.url);
      if (running) return running;
      const request = Promise.resolve().then(() => read(link, lifetime.signal)).catch((): GithubStatus => ({
        state: cached?.status.state ?? "unknown", checks: cached?.status.checks ?? null, review: cached?.status.review ?? null,
        updatedAt: cached?.status.updatedAt ?? null, stale: Boolean(cached?.status.updatedAt),
        error: "GitHub status unavailable. Check gh authentication, repository access, or connectivity.",
      })).then((status) => { values.set(link.url, { status, readAt: now() }); return status; }).finally(() => pending.delete(link.url));
      pending.set(link.url, request);
      return request;
    },
    dispose() { lifetime.abort(); values.clear(); pending.clear(); },
  };
}
