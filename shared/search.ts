import { z } from "zod";

export const statuses = ["running", "needs_input", "attention", "failed", "done"] as const;
export const statusLabels: Record<typeof statuses[number], string> = {
  running: "Running", needs_input: "Needs input", attention: "Attention", failed: "Failed", done: "Done",
};
// A leading emoji (including ZWJ sequences, skin tones and flags) is the tag's filter name.
const leadingEmoji = /^(?:\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?)*)/u;
// Tags group by a leading emoji ("🔥 urgent" → "🔥"), otherwise by the text before the first colon ("abc:def" → "abc").
export function tagName(tag: string): string {
  const trimmed = tag.trim();
  return trimmed.match(leadingEmoji)?.[0] ?? trimmed.split(":", 1)[0].trim();
}

// A tag filter is either a group ("📲", "abc") matching every tag in it, or one exact tag written "=📲 s25".
export const exactTagPrefix = "=";
export const exactTag = (tag: string) => `${exactTagPrefix}${tag.trim().toLowerCase()}`;
const tagFilter = (value: string) => value.startsWith(exactTagPrefix)
  ? (value.slice(1).trim() ? exactTag(value.slice(1)) : "") : tagName(value);

// PR filters: any PR, a PR in a given state, or no PR at all.
export const prFilters = ["any", "open", "draft", "merged", "closed", "none"] as const;
export type PrFilter = typeof prFilters[number];
export const prFilterLabels: Record<PrFilter, string> = { any: "Has a PR", open: "Open", draft: "Draft", merged: "Merged", closed: "Closed", none: "No PR" };

export const filtersSchema = z.object({
  statuses: z.array(z.enum(statuses)).default([]),
  tags: z.array(z.string().trim().min(1).toLowerCase().transform(tagFilter).pipe(z.string().min(1)))
    .transform((tags) => [...new Set(tags)]).default([]),
  hostIds: z.array(z.string().min(1)).default([]),
  projectKeys: z.array(z.string().min(1)).default([]),
  prs: z.array(z.enum(prFilters)).default([]),
});
export type WorkspaceFilters = z.infer<typeof filtersSchema>;
export const savedSearchSchema = z.object({
  id: z.string().min(1), name: z.string().trim().min(1).max(100), query: z.string().max(4000), filters: filtersSchema,
});
export type SavedSearch = z.infer<typeof savedSearchSchema>;
export type SearchCriteria = Pick<SavedSearch, "query" | "filters">;

// `prStates` holds the state of each PR linked to the workspace ("unknown" until GitHub status arrives).
export function matchesFilters(workspace: { indicator: string; tags: readonly string[]; hostId: string; projectKey: string; prStates?: readonly string[] }, filters: WorkspaceFilters): boolean {
  const prStates = workspace.prStates ?? [];
  return (!filters.statuses.length || filters.statuses.some((status) => status === workspace.indicator))
    && (!filters.tags.length || workspace.tags.some((tag) => filters.tags.includes(tagName(tag).toLowerCase()) || filters.tags.includes(exactTag(tag))))
    && (!filters.hostIds.length || filters.hostIds.includes(workspace.hostId))
    && (!filters.projectKeys.length || filters.projectKeys.includes(workspace.projectKey))
    && (!filters.prs.length || filters.prs.some((filter) => filter === "any" ? prStates.length > 0
      : filter === "none" ? prStates.length === 0 : prStates.includes(filter)));
}

// Filter counts: a workspace counts toward an option when it would match with that option as its category's only
// choice and every other category as selected, so each count shows what checking that option alone would add.
export type FilterFacts = Parameters<typeof matchesFilters>[0];
export type FilterOptionIds = { readonly [K in keyof WorkspaceFilters]: readonly string[] };
export const facetKey = (category: keyof WorkspaceFilters, id: string) => `${category}\u0000${id}`;
export function facetKeys(facts: FilterFacts, filters: WorkspaceFilters, options: FilterOptionIds): string[] {
  const prs = facts.prStates ?? [];
  const matches = {
    statuses: new Set([facts.indicator]),
    tags: new Set(facts.tags.flatMap((tag) => [tagName(tag).toLowerCase(), exactTag(tag)])),
    hostIds: new Set([facts.hostId]),
    projectKeys: new Set([facts.projectKey]),
    prs: new Set(prs.length ? ["any", ...prs.filter((state) => state !== "none")] : ["none"]),
  };
  const categories = Object.keys(options) as (keyof WorkspaceFilters)[];
  const blocked = categories.filter((category) => filters[category].length && !filters[category].some((id) => matches[category].has(id)));
  if (blocked.length > 1) return [];
  const keys: string[] = [];
  for (const category of blocked.length ? blocked : categories) {
    for (const id of options[category]) {
      if (matches[category].has(id)) keys.push(facetKey(category, id));
    }
  }
  return keys;
}

export function sameCriteria(a: SearchCriteria, b: SearchCriteria): boolean {
  const sorted = (values: readonly string[]) => [...new Set(values)].sort();
  return a.query.trim() === b.query.trim()
    && (Object.keys(a.filters) as (keyof WorkspaceFilters)[]).every((key) => JSON.stringify(sorted(a.filters[key])) === JSON.stringify(sorted(b.filters[key])));
}
export function hasFilters(filters: WorkspaceFilters): boolean { return Object.values(filters).some((values) => values.length > 0); }
