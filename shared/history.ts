// Back/forward history of opened workspaces, like a browser's: opening a workspace adds it after the current entry
// (dropping anything ahead), and back/forward move through the list, skipping entries that no longer exist.
export type History<T extends { key: string }> = { entries: readonly T[]; index: number };
export const HISTORY_LIMIT = 50;

export const emptyHistory = <T extends { key: string }>(): History<T> => ({ entries: [], index: -1 });

export function visit<T extends { key: string }>(history: History<T>, entry: T): History<T> {
  if (history.entries[history.index]?.key === entry.key) return history;
  const entries = [...history.entries.slice(0, history.index + 1), entry].slice(-HISTORY_LIMIT);
  return { entries, index: entries.length - 1 };
}

// The nearest entry in a direction that still exists, or null. While a screen other than a workspace is open (such as
// New workspace), the current entry is the workspace you left, so Back returns to it first.
export function step<T extends { key: string }>(history: History<T>, direction: -1 | 1, exists: (entry: T) => boolean,
  { onWorkspace = true }: { onWorkspace?: boolean } = {}): { history: History<T>; entry: T } | null {
  const left = history.entries[history.index];
  if (!onWorkspace && direction === -1 && left && exists(left)) return { history, entry: left };
  for (let index = history.index + direction; index >= 0 && index < history.entries.length; index += direction) {
    const entry = history.entries[index]!;
    if (entry.key !== history.entries[history.index]?.key && exists(entry)) return { history: { ...history, index }, entry };
  }
  return null;
}
