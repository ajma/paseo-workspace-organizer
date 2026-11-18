// How the sidebar groups workspaces: your own groups, or groups made automatically from each workspace.
export const groupByModes = ["groups", "host", "project", "pr"] as const;
export type GroupBy = typeof groupByModes[number];
export const groupByLabels: Record<GroupBy, string> = {
  groups: "Your groups", host: "Host", project: "Project", pr: "PR status",
};

export type Bucket = { key: string; title: string };

// A workspace with several PRs sits under the most active one.
export const prBuckets: readonly Bucket[] = [
  { key: "open", title: "Open PR" }, { key: "draft", title: "Draft PR" }, { key: "merged", title: "Merged PR" },
  { key: "closed", title: "Closed PR" }, { key: "unknown", title: "PR status unknown" }, { key: "none", title: "No PR" },
];
export function prBucket(states: readonly string[]): string {
  for (const bucket of prBuckets) if (states.includes(bucket.key)) return bucket.key;
  return states.length ? "unknown" : "none";
}

