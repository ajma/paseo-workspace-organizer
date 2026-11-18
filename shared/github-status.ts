import { z } from "zod";

export const githubStatusSchema = z.object({
  state: z.enum(["open", "draft", "merged", "closed", "unknown"]),
  checks: z.enum(["success", "pending", "failure", "none", "unknown"]).nullable(),
  review: z.enum(["approved", "changes_requested", "pending", "none", "unknown"]).nullable(),
  updatedAt: z.string().nullable(), stale: z.boolean(), error: z.string().nullable(),
});
export type GithubStatus = z.infer<typeof githubStatusSchema>;

export function githubStatusLabel(status: GithubStatus | undefined): string {
  if (!status) return "Loading status…";
  const state = { open: "Open", draft: "Draft", merged: "Merged", closed: "Closed", unknown: "Status unavailable" }[status.state];
  const checks = status.checks ? { success: "CI passed", pending: "CI pending", failure: "CI failed", none: "", unknown: "CI unavailable" }[status.checks] : "";
  const review = status.review ? { approved: "Approved", changes_requested: "Changes requested", pending: "Review required", none: "", unknown: "Review unavailable" }[status.review] : "";
  return [state, checks, review, status.stale ? "stale" : ""].filter(Boolean).join(" · ");
}
