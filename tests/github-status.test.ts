import { expect, it, vi } from "vitest";
import * as github from "../server/github-status";
import { parseGithubLink } from "../shared/organization";
import { githubStatusLabel } from "../shared/github-status";

const pr = parseGithubLink("https://github.com/o/r/pull/42");
const issue = parseGithubLink("https://github.com/o/r/issues/99");
const now = "2026-11-11T12:00:00Z";

it.each([
  [{ state: "OPEN", isDraft: false }, "open"],
  [{ state: "OPEN", isDraft: true }, "draft"],
  [{ state: "CLOSED", isDraft: true }, "closed"],
  [{ state: "MERGED", isDraft: true, mergedAt: now }, "merged"],
])("normalizes PR state without showing a closed draft as Draft", (payload, expected) => {
  expect(github.parseStatus("pr", payload, now).state).toBe(expected);
});

it("shows CI failures before pending checks and preserves the review decision", () => {
  const status = github.parseStatus("pr", { state: "OPEN", reviewDecision: "CHANGES_REQUESTED", statusCheckRollup: [
    { status: "IN_PROGRESS", conclusion: null }, { status: "COMPLETED", conclusion: "FAILURE" },
  ] }, now);
  expect(status).toMatchObject({ state: "open", checks: "failure", review: "changes_requested" });
  expect(githubStatusLabel(status)).toBe("Open · CI failed · Changes requested");
});

it.each([
  [[{ status: "COMPLETED", conclusion: "SUCCESS" }, { state: "SUCCESS" }], "success"],
  [[{ status: "QUEUED", conclusion: null }, { state: "SUCCESS" }], "pending"],
  [[{ state: "ERROR" }], "failure"],
  [[], "none"],
  [null, "unknown"],
])("normalizes check runs and legacy status contexts", (statusCheckRollup, expected) => {
  expect(github.parseStatus("pr", { state: "OPEN", statusCheckRollup }, now).checks).toBe(expected);
});

it("shows issue state without fabricated CI or review fields", () => {
  const status = github.parseStatus("issue", { state: "CLOSED" }, now);
  expect(status).toMatchObject({ state: "closed", checks: null, review: null });
  expect(githubStatusLabel(status)).toBe("Closed");
});

it("deduplicates concurrent reads and expires the status cache", async () => {
  let time = 0;
  const fetch = vi.fn(async () => github.parseStatus("pr", { state: "OPEN" }, now));
  const cache = github.createStatusCache(fetch, () => time);
  await Promise.all([cache.get(pr), cache.get(pr)]);
  expect(fetch).toHaveBeenCalledTimes(1);
  time = 59_000; await cache.get(pr); expect(fetch).toHaveBeenCalledTimes(1);
  time = 61_000; await cache.get(pr); expect(fetch).toHaveBeenCalledTimes(2);
  cache.dispose();
});

it("retains a last-known status as stale after a failed refresh", async () => {
  let time = 0;
  const fetch = vi.fn().mockResolvedValueOnce(github.parseStatus("issue", { state: "OPEN" }, now)).mockRejectedValueOnce(new Error("offline"));
  const cache = github.createStatusCache(fetch, () => time);
  await cache.get(issue); time = 61_000;
  const status = await cache.get(issue);
  expect(status).toMatchObject({ state: "open", stale: true, updatedAt: now });
  expect(status.error).toBeTruthy();
  cache.dispose();
});

it("reports unavailable status when authentication or access fails, without exposing raw error output", async () => {
  const cache = github.createStatusCache(async () => { throw new Error("private process output"); });
  const status = await cache.get(issue);
  expect(status.state).toBe("unknown");
  expect(status.error).not.toContain("private process output");
  cache.dispose();
});
