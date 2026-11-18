// The hover detail for each part of a workspace card, written as short plain sentences.
import { formatDuration } from "./activity";

export function formatDateTime(at: number): string {
  return new Date(at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export function statusDetail(status: string | null, since: number | null): string | null {
  if (!status) return null;
  return since === null ? status : `${status} since ${formatDateTime(since)}`;
}

export function projectDetail(input: { project: string; projectPath: string | null; workspaceName: string | null; hostLabel?: string }): string {
  return [`Project ${input.project}`, input.projectPath, input.workspaceName ? `Workspace ${input.workspaceName}` : null,
    input.hostLabel ? `On ${input.hostLabel}` : null].filter(Boolean).join("\n");
}

export function agentDetail(agent: { provider: string; model: string | null; modelId?: string | null; thinking: string | null; status?: string | null }): string {
  const model = agent.model && agent.modelId && agent.modelId !== agent.model ? `${agent.model} (${agent.modelId})` : agent.model ?? agent.modelId;
  return [`${agent.provider}${model ? ` · ${model}` : ""}`, agent.thinking ? `Thinking: ${agent.thinking}` : null,
    agent.status ? `Agent ${agent.status}` : null].filter(Boolean).join("\n");
}

export function branchDetail(branch: string, git: { dirty: boolean | null; ahead: number | null; behind: number | null } | null): string {
  const lines = [`Branch ${branch}`];
  if (git?.dirty) lines.push("Uncommitted changes");
  else if (git?.dirty === false) lines.push("No uncommitted changes");
  if (git && (git.ahead !== null || git.behind !== null)) {
    lines.push(`${plural(git.ahead ?? 0, "commit")} ahead, ${git.behind ?? 0} behind`);
  }
  return lines.join("\n");
}

export function labelDetail(label: { name: string; color: string | null; source?: "label" | "tag" }): string {
  return label.source === "tag" ? `Organizer tag ${label.name}`
    : `Paseo label ${label.name}${label.color ? ` (${label.color})` : ""}`;
}

export function linkDetail(link: { kind: "pr" | "issue"; repository: string; number: number; status: string | null; hint?: string }): string {
  return [`${link.kind === "pr" ? "Pull request" : "Issue"} ${link.repository}#${link.number}`, link.hint || link.status].filter(Boolean).join("\n");
}

export function subtaskDetail(subtasks: { running: number; done: number; failed: number }): string {
  return `Subagents: ${subtasks.running} running, ${subtasks.done} done, ${subtasks.failed} failed`;
}

export function timerDetail(timer: { running: boolean; at: number | null; elapsed: number | null }, now: number): string | null {
  if (timer.at === null) return null;
  if (timer.running) return `Run started ${formatDateTime(timer.at)}\nRunning for ${formatDuration(Math.max(0, now - timer.at))}`;
  return [`Last run finished ${formatDateTime(timer.at)}`, timer.elapsed !== null ? `Took ${formatDuration(timer.elapsed)}` : null].filter(Boolean).join("\n");
}

export function activityDetail(at: number | null): string | null {
  return at === null ? null : `Last activity ${formatDateTime(at)}`;
}

type DetailModel = {
  title: string; indicatorLabel: string | null; statusSince?: number | null;
  project: string; projectPath?: string | null; workspaceName: string | null; hostLabel?: string;
  agent: { provider: string; model: string | null; modelId?: string | null; thinking: string | null; status?: string | null } | null;
  branch: string | null; git: { dirty: boolean | null; ahead: number | null; behind: number | null } | null;
  directory: string | null; labels: { name: string; color: string | null; source?: "label" | "tag" }[];
  links: { kind: "pr" | "issue"; repository: string; number: number; status: string | null; hint?: string }[];
  notes: string | null; subtasks: { running: number; done: number; failed: number };
  timer: { running: boolean; at: number | null; elapsed: number | null }; lastActivityAt?: number | null;
};
const oneLine = (text: string) => text.split("\n").filter(Boolean).join(" · ");

// Every detail about a workspace, one labeled row each, whatever fields the card style shows.
export function cardDetailRows(model: DetailModel, now: number): { label: string; value: string }[] {
  const rows: { label: string; value: string | null }[] = [
    { label: "Status", value: statusDetail(model.indicatorLabel, model.statusSince ?? null) },
    { label: "Project", value: [model.project, model.projectPath].filter(Boolean).join(" · ") },
    { label: "Workspace", value: model.workspaceName && model.workspaceName !== model.title ? model.workspaceName : null },
    { label: "Host", value: model.hostLabel ?? null },
    { label: "Agent", value: model.agent ? oneLine(agentDetail(model.agent)) : null },
    { label: "Branch", value: model.branch ? oneLine(branchDetail(model.branch, model.git)).replace(/^Branch /, "") : null },
    { label: "Folder", value: model.directory },
    { label: "Labels", value: model.labels.filter((label) => label.source !== "tag").map((label) => label.name).join(", ") || null },
    { label: "Tags", value: model.labels.filter((label) => label.source === "tag").map((label) => label.name).join(", ") || null },
    ...model.links.map((link) => ({ label: link.kind === "pr" ? "Pull request" : "Issue",
      value: `${link.repository}#${link.number}${link.hint || link.status ? ` · ${link.hint || link.status}` : ""}` })),
    { label: "Subagents", value: model.subtasks.running + model.subtasks.done + model.subtasks.failed
      ? subtaskDetail(model.subtasks).replace(/^Subagents: /, "") : null },
    { label: "Run", value: (() => { const detail = timerDetail(model.timer, now); return detail ? oneLine(detail) : null; })() },
    { label: "Last activity", value: model.lastActivityAt != null ? formatDateTime(model.lastActivityAt) : null },
    { label: "Notes", value: model.notes },
  ];
  return rows.filter((row): row is { label: string; value: string } => Boolean(row.value));
}
