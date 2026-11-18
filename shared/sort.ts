import { lastActivityAt } from "./activity";

export const sortModes = ["manual", "activity", "name", "created"] as const;
export type SortMode = typeof sortModes[number];
export const sortLabels: Record<SortMode, string> = {
  manual: "Manual", activity: "Recent activity", name: "Name", created: "Newest",
};

type Sortable = {
  ref: { key: string }; title: string | null; name: string;
  lastPromptAt: string | null; statusEnteredAt: string | null; createdAt: string | null;
};

const byName = (a: Sortable, b: Sortable) => (a.title ?? a.name).localeCompare(b.title ?? b.name);
// Newest first; workspaces without a time go last.
const newest = (a: number | null, b: number | null) => (b ?? -Infinity) - (a ?? -Infinity) || 0;
const created = (w: Sortable) => lastActivityAt([w.createdAt]);
const active = (w: Sortable) => lastActivityAt([w.lastPromptAt, w.statusEnteredAt, w.createdAt]);

// Orders workspaces within each group. Manual uses the saved order, then name.
export function compareWorkspaces(mode: SortMode, manualOrder: readonly string[]) {
  return (a: Sortable, b: Sortable): number => {
    if (mode === "name") return byName(a, b);
    if (mode === "activity") return newest(active(a), active(b)) || byName(a, b);
    if (mode === "created") return newest(created(a), created(b)) || byName(a, b);
    const aIndex = manualOrder.indexOf(a.ref.key), bIndex = manualOrder.indexOf(b.ref.key);
    return (aIndex < 0 ? Infinity : aIndex) - (bIndex < 0 ? Infinity : bIndex) || byName(a, b);
  };
}
