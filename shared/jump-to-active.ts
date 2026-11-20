// Rules for the sidebar's "Current workspace" button: when the open workspace's row is out of view, and where to
// scroll so it lands in the middle of the list. Positions are window coordinates, as measureInWindow reports them.
export type Span = { y: number; height: number };

// Out of view: no part of the row shows in the list. An unmeasured list (height 0) never counts, so the button
// doesn't flash up before layout.
export function rowOutOfView(row: Span, list: Span): boolean {
  if (list.height <= 0 || row.height <= 0) return false;
  return row.y + row.height <= list.y || row.y >= list.y + list.height;
}

// The scroll offset that centers the row in the list (or puts its top at the list's top when it's taller), never
// above the start. Centered rather than at the top, so pinned group headers never cover it.
export function scrollOffsetFor(row: Span, list: Span, scrollY: number): number {
  const centered = scrollY + (row.y - list.y) - Math.max(0, (list.height - row.height) / 2);
  return Math.max(0, Math.round(centered));
}

// The collapsed sections hiding the row, outermost first: its own group and every group above it, or its automatic
// group, or Ungrouped. `chain` lists the row's sections from the outermost in.
export function collapsedAround(chain: readonly string[], collapsed: readonly string[]): string[] {
  return chain.filter((id) => collapsed.includes(id));
}

// The groups that hold a workspace, outermost first, following parents up from its own group (cycles are ignored).
export function groupChain(groups: readonly { id: string; parentId: string | null }[], groupId: string | null): string[] {
  const chain: string[] = [], seen = new Set<string>();
  let group = groups.find((item) => item.id === groupId);
  while (group && !seen.has(group.id)) {
    seen.add(group.id); chain.unshift(group.id);
    group = groups.find((item) => item.id === group!.parentId);
  }
  return chain;
}
