import type { CardModel } from "./card";

// The settings preview's card: every field filled so each switch visibly changes it.
export function sampleCard(now: number): CardModel {
  return {
    title: "Port the status ring to React Native", workspaceName: "tasks-board", indicator: "running", indicatorLabel: "Running",
    project: "better-paseo", projectPath: "/Users/me/code/better-paseo", statusSince: now - 750_000, lastActivityAt: now - 20_000,
    agent: { provider: "Codex", iconSvg: null, model: "GPT-5.5 Codex", thinking: "Medium", modelId: "gpt-5.5", status: "running" },
    branch: "feat/tasks-board", git: { dirty: true, ahead: 3, behind: 0 },
    directory: "/Users/me/code/better-paseo/.worktrees/tasks-board", labels: [{ name: "frontend", color: "violet", source: "label" }, { name: "p1", color: "red", source: "label" }, { name: "board", color: null, source: "tag" }],
    links: [{ url: "https://github.com/example/better-paseo/pull/42", kind: "pr", repository: "example/better-paseo", number: 42,
      status: "Open · CI passed", tone: "success", state: "open", checks: "success", review: "approved" }],
    notes: "Match the desktop ring, then hand off to review.", subtasks: { running: 2, done: 1, failed: 0 },
    timer: { running: true, at: now - 750_000, elapsed: 750_000 }, lastActivity: "now",
  };
}
