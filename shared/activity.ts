// The latest of a workspace's activity timestamps, in epoch milliseconds.
export function lastActivityAt(times: readonly (string | null)[]): number | null {
  const parsed = times.map((time) => (time ? Date.parse(time) : NaN)).filter((time) => Number.isFinite(time));
  return parsed.length ? Math.max(...parsed) : null;
}

// Compact elapsed time: "now", "5m", "3h", "2d", "2mo", "1y".
export function formatActivity(at: number, now: number): string {
  const seconds = Math.floor(Math.max(0, now - at) / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

// The current or last agent run: a running workspace counts up from its last prompt;
// otherwise the run finished when the workspace entered its current status.
export function runTimes(workspace: { status: string; lastPromptAt: string | null; statusEnteredAt: string | null }, now: number):
  { running: boolean; at: number | null; elapsed: number | null } {
  const prompt = lastActivityAt([workspace.lastPromptAt]);
  const entered = lastActivityAt([workspace.statusEnteredAt]);
  if (workspace.status === "running") {
    const start = prompt ?? entered;
    return { running: true, at: start, elapsed: start === null ? null : Math.max(0, now - start) };
  }
  return { running: false, at: entered, elapsed: entered !== null && prompt !== null && entered >= prompt ? entered - prompt : null };
}

// "10:12" for today, otherwise "Nov 12".
export function formatClock(at: number, now: number): string {
  const date = new Date(at), today = new Date(now);
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// "45s", "12m 30s", "2h 5m", "3d 4h".
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
