// The fields a workspace row shows, as icon-and-text pieces with their colors. The row draws them in one line
// joined by "·"; the details panel draws every field, one per line, with full text. Both use these same pieces.
import { formatClock, formatDuration } from "../shared/activity";
import { fieldColors, type CardField } from "../shared/cards";
import { formatDateTime } from "../shared/card-details";
import { identityText, isDarkSurface, type IdentityColor } from "../shared/identity-colors";
import type { Theme } from "./controls";

export type GithubState = "open" | "draft" | "merged" | "closed" | "unknown";
export type ChecksState = "success" | "failure" | "pending" | "none" | "unknown" | null;
export type CardLink = { url: string; kind: "pr" | "issue"; repository: string; number: number; status: string | null;
  tone: "success" | "danger" | "muted"; hint?: string; state?: GithubState; checks?: ChecksState; review?: string | null };

// Everything a row can draw, independent of where the data came from (live workspace or settings sample).
export type CardModel = {
  title: string; workspaceName: string | null; indicator: string; indicatorLabel: string | null;
  project: string; hostLabel?: string; hostColor?: IdentityColor | null; hostIconOnly?: boolean; projectPath?: string | null;
  statusSince?: number | null; lastActivityAt?: number | null;
  agent: { provider: string; iconSvg: string | null; model: string | null; thinking: string | null; modelId?: string | null; status?: string | null } | null;
  branch: string | null; git: { dirty: boolean | null; ahead: number | null; behind: number | null } | null;
  directory: string | null; labels: { name: string; color: IdentityColor | null; source?: "label" | "tag" }[]; links: CardLink[]; notes: string | null;
  subtasks: { running: number; done: number; failed: number };
  timer: { running: boolean; at: number | null; elapsed: number | null };
  lastActivity: string | null;
};

// A piece of a field: an optional Lucide icon (by kebab name, or the provider's own SVG) and text in one color.
export type Piece = { icon?: string; svg?: string | null; text?: string; color: string; bold?: boolean; mono?: boolean;
  dot?: boolean; liveSince?: number; spin?: boolean };
export type FieldItem = { key: string; label: string; pieces: Piece[]; link?: CardLink };

// Home folders read as "~", like a shell prompt.
export function displayPath(directory: string, full: boolean): string {
  if (!full) return directory.replace(/\/+$/, "").split("/").pop() || directory;
  return directory.replace(/^\/(?:Users|home)\/[^/]+(?=\/|$)/, "~");
}

export function statusColor(theme: Theme, indicator: string): string {
  return indicator === "failed" ? theme.colors.statusDanger
    : indicator === "needs_input" || indicator === "attention" ? theme.colors.statusWarning
    : indicator === "running" ? theme.colors.accent : theme.colors.statusSuccess;
}

export function palette(theme: Theme) {
  const dark = isDarkSurface(theme.colors.surface0);
  return {
    muted: theme.colors.foregroundMuted,
    tone: (field: keyof typeof fieldColors) => identityText(fieldColors[field]!, dark),
    identity: (color: IdentityColor) => identityText(color, dark),
  };
}

function linkPieces(link: CardLink, theme: Theme, full: boolean): Piece[] {
  const { muted, identity } = palette(theme);
  const state = link.state ?? "unknown";
  const stateColor = state === "open" ? identity("emerald") : state === "merged" ? identity("violet")
    : state === "closed" ? (link.kind === "issue" ? identity("violet") : identity("red")) : link.kind === "issue" ? identity("pink") : state === "draft" ? muted : identity("indigo");
  const icon = link.kind === "issue" ? (state === "closed" ? "circle-check" : "circle-dot")
    : state === "merged" ? "git-merge" : state === "closed" ? "git-pull-request-closed" : state === "draft" ? "git-pull-request-draft" : "git-pull-request";
  const word = state === "merged" ? "Merged" : state === "closed" ? "Closed" : state === "draft" ? "Draft" : full && state === "open" ? "Open" : null;
  const pieces: Piece[] = [{ icon, text: `${full ? `${link.repository}#` : ""}${link.number}${word ? ` ${word}` : ""}`, color: stateColor }];
  const checks = link.checks;
  if (checks === "success") pieces.push({ icon: "circle-check", text: "passed", color: theme.colors.statusSuccess });
  else if (checks === "failure") pieces.push({ icon: "circle-x", text: "failed", color: theme.colors.statusDanger });
  else if (checks === "pending") pieces.push({ icon: "loader-circle", text: "running", color: theme.colors.statusWarning, spin: true });
  if (full && link.review === "approved") pieces.push({ text: "approved", color: theme.colors.statusSuccess });
  if (full && link.review === "changes_requested") pieces.push({ text: "changes requested", color: theme.colors.statusDanger });
  if (full && !link.state && link.status) pieces.push({ text: link.status, color: muted });
  return pieces;
}

// `fields` null means every field (the details panel). `full` shows complete paths and link details.
export function fieldItems(model: CardModel, theme: Theme, options: { fields: ReadonlySet<CardField> | null; full: boolean; now: number }): FieldItem[] {
  const { muted, tone, identity } = palette(theme);
  const has = (field: CardField) => !options.fields || options.fields.has(field);
  const items: FieldItem[] = [];
  if (has("host") && model.hostLabel) items.push({ key: "host", label: `Host ${model.hostLabel}`,
    pieces: [{ icon: "server", text: model.hostIconOnly && !options.full ? undefined : model.hostLabel,
      color: model.hostColor ? identity(model.hostColor) : tone("host") }] });
  const project = [has("project") ? model.project : null,
    has("workspaceName") && model.workspaceName && model.workspaceName !== model.title ? model.workspaceName : null].filter(Boolean).join(" › ");
  if (project) items.push({ key: "project", label: `Project ${project}`, pieces: [{ text: options.full && model.projectPath
    ? `${project} · ${displayPath(model.projectPath, true)}` : project, color: tone("project") }] });
  const agent = model.agent;
  if (agent && (has("agentBrand") || has("model") || has("thinking"))) {
    const name = [has("agentBrand") && (!has("model") || !agent.model) ? agent.provider : null, has("model") ? agent.model : null].filter(Boolean).join(" ");
    const pieces: Piece[] = [{ icon: has("agentBrand") && !agent.iconSvg ? "bot" : undefined, svg: has("agentBrand") ? agent.iconSvg : null,
      text: options.full && agent.modelId && agent.modelId !== agent.model ? `${name} (${agent.modelId})` : name, color: tone("model"), bold: true }];
    if (has("thinking") && agent.thinking) pieces.push({ icon: "brain", text: agent.thinking, color: tone("thinking") });
    if (options.full && agent.status) pieces.push({ text: `agent ${agent.status}`, color: muted });
    items.push({ key: "agent", label: "Agent", pieces });
  }
  if (has("branch") && model.branch) {
    const pieces: Piece[] = [{ icon: "git-branch", text: model.branch, color: tone("branch"), mono: true }];
    const git = has("gitStatus") ? model.git : null;
    if (git?.dirty) pieces.push({ dot: true, color: theme.colors.statusWarning, text: options.full ? "uncommitted changes" : undefined });
    if (git && git.ahead !== null) pieces.push({ text: `↑${git.ahead}`, color: git.ahead ? theme.colors.statusSuccess : muted });
    if (git && git.behind !== null) pieces.push({ text: `↓${git.behind}`, color: git.behind ? theme.colors.statusWarning : muted });
    items.push({ key: "branch", label: "Branch", pieces });
  }
  if ((has("folder") || has("fullPath")) && model.directory) items.push({ key: "folder", label: "Folder",
    pieces: [{ icon: "folder", text: displayPath(model.directory, options.full || has("fullPath")), color: tone("folder") }] });
  if (has("links")) for (const link of model.links) items.push({ key: link.url, label: `${link.kind === "pr" ? "PR" : "Issue"} ${link.number}`,
    pieces: linkPieces(link, theme, options.full), link });
  const total = model.subtasks.running + model.subtasks.done + model.subtasks.failed;
  if (has("subtasks") && total) items.push({ key: "subtasks", label: "Subtasks", pieces: [{ icon: "network",
    text: [model.subtasks.running ? `${model.subtasks.running} running` : null, model.subtasks.done ? `${model.subtasks.done} done` : null,
      model.subtasks.failed ? `${model.subtasks.failed} failed` : null].filter(Boolean).join(", "), color: tone("subtasks") }] });
  if (has("timer") && model.timer.at !== null) {
    const at = options.full ? formatDateTime(model.timer.at) : formatClock(model.timer.at, options.now);
    const pieces: Piece[] = [{ icon: "clock", text: options.full ? `${model.timer.running ? "started" : "finished"} ${at}` : at, color: tone("timer") }];
    if (model.timer.running) pieces.push({ icon: "hourglass", color: tone("timer"), liveSince: model.timer.at,
      text: formatDuration(Math.max(0, options.now - model.timer.at)) });
    else if (model.timer.elapsed !== null) pieces.push({ icon: "hourglass", text: options.full ? `took ${formatDuration(model.timer.elapsed)}` : formatDuration(model.timer.elapsed), color: tone("timer") });
    items.push({ key: "timer", label: "Run", pieces });
  }
  return items;
}

// The extra lines only the details panel shows: status first, then last activity and notes.
export function detailExtras(model: CardModel, theme: Theme) {
  const { muted } = palette(theme);
  return {
    status: { icon: model.indicator === "running" ? "loader-circle" : "circle-dot", spin: model.indicator === "running", color: statusColor(theme, model.indicator),
      text: model.indicatorLabel ? `${model.indicatorLabel}${model.statusSince != null ? ` since ${formatDateTime(model.statusSince)}` : ""}` : null },
    lastActivity: model.lastActivityAt != null ? { icon: "clock", color: muted, text: `Last active ${formatDateTime(model.lastActivityAt)}` } : null,
    notes: model.notes ? { icon: "sticky-note", color: muted, text: model.notes } : null,
  };
}
