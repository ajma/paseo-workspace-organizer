// Two-level tag filters ("a" with "a:b", "a:c" beneath it). A group with sub-level tags filters only through them:
// checking the group checks every sub-level tag, and unchecking one stops matching it. The group's own checkbox just
// reflects its children. A group without sub-level tags is a single checkbox for the group itself.
export type TagGroup = { id: string; childIds: readonly string[] };
export type GroupState = "all" | "some" | "none";

const isTwoLevel = (group: TagGroup) => group.childIds.length > 0;

// Older saved searches may hold the group id itself, which stands for every tag in the group.
export function childChecked(group: TagGroup, childId: string, selected: readonly string[]): boolean {
  return selected.includes(group.id) || selected.includes(childId);
}

export function groupState(group: TagGroup, selected: readonly string[]): GroupState {
  if (!isTwoLevel(group)) return selected.includes(group.id) ? "all" : "none";
  const checked = group.childIds.filter((id) => childChecked(group, id, selected)).length;
  return checked === 0 ? "none" : checked === group.childIds.length ? "all" : "some";
}

const without = (selected: readonly string[], ids: readonly string[]) => selected.filter((id) => !ids.includes(id));

// Checking a group selects all of it; pressing a fully checked group clears it.
export function toggleGroup(group: TagGroup, selected: readonly string[]): string[] {
  if (!isTwoLevel(group)) return selected.includes(group.id) ? without(selected, [group.id]) : [...selected, group.id];
  const cleared = without(selected, [group.id, ...group.childIds]);
  return groupState(group, selected) === "all" ? cleared : [...cleared, ...group.childIds];
}

export function toggleChild(group: TagGroup, childId: string, selected: readonly string[]): string[] {
  // A whole-group selection becomes its individual tags first, so one can be unchecked.
  const expanded = selected.includes(group.id) ? [...without(selected, [group.id, ...group.childIds]), ...group.childIds] : [...selected];
  return expanded.includes(childId) ? without(expanded, [childId]) : [...expanded, childId];
}
