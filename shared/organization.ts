import { defineSettings } from "@getpaseo/plugin";
import { sortModes } from "./sort";
import { titleLineOptions } from "./cards";
import { groupByModes } from "./grouping";
import { z } from "zod";
import { savedSearchSchema } from "./search";

export const githubLinkSchema = z.object({
  kind: z.enum(["pr", "issue"]),
  repository: z.string().min(3),
  number: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  url: z.string().url(),
});
export type GithubLink = z.infer<typeof githubLinkSchema>;

export function parseGithubLink(value: string): GithubLink {
  const match = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/(pull|issues)\/([1-9]\d*)(?:[/?#].*)?$/i.exec(value.trim());
  if (!match || !Number.isSafeInteger(Number(match[3]))) {
    throw new Error(`Use a GitHub PR or issue URL: ${value.trim()}`);
  }
  const repository = match[1].toLowerCase();
  const number = Number(match[3]);
  return { repository, number, kind: match[2].toLowerCase() === "pull" ? "pr" : "issue",
    url: `https://github.com/${repository}/${match[2].toLowerCase()}/${number}` };
}

export function mergeLinks(...lists: readonly (readonly GithubLink[])[]): GithubLink[] {
  return [...new Map(lists.flat().map((link) => [link.url.toLowerCase(), link])).values()];
}

export function parseLinks(text: string): GithubLink[] {
  return mergeLinks(text.split(/\s+/).filter(Boolean).map(parseGithubLink));
}

export const groupSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  parentId: z.string().min(1).nullable(),
});
export const workspaceDetailsSchema = z.object({
  groupId: z.string().min(1).nullable().default(null),
  subtitle: z.string().max(4000).default(""),
  tags: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
  links: z.array(githubLinkSchema).max(100).default([]),
});
export type WorkspaceDetails = z.infer<typeof workspaceDetailsSchema>;
export type Group = z.infer<typeof groupSchema>;

export const organizationSchema = z.object({
  groups: z.array(groupSchema).default([]),
  workspaces: z.record(z.string(), workspaceDetailsSchema).default({}),
  workspaceOrder: z.array(z.string()).default([]),
  savedSearches: z.array(savedSearchSchema).default([]),
}).superRefine((value, context) => {
  if (new Set(value.savedSearches.map((item) => item.id)).size !== value.savedSearches.length) context.addIssue({ code: "custom", message: "Saved-search IDs must be unique" });
  if (new Set(value.savedSearches.map((item) => item.name.toLowerCase())).size !== value.savedSearches.length) context.addIssue({ code: "custom", message: "Saved-search names must be unique" });
  const groups = new Map(value.groups.map((group) => [group.id, group]));
  if (groups.size !== value.groups.length) context.addIssue({ code: "custom", message: "Group IDs must be unique" });
  for (const group of value.groups) {
    const seen = new Set([group.id]);
    let parentId = group.parentId;
    while (parentId) {
      if (seen.has(parentId)) { context.addIssue({ code: "custom", message: "Groups cannot contain themselves" }); break; }
      if (!groups.has(parentId)) { context.addIssue({ code: "custom", message: "Parent group no longer exists" }); break; }
      seen.add(parentId);
      parentId = groups.get(parentId)!.parentId;
    }
  }
  for (const details of Object.values(value.workspaces)) {
    if (details.groupId && !groups.has(details.groupId)) context.addIssue({ code: "custom", message: "Workspace group no longer exists" });
    for (const link of details.links) {
      try {
        const canonical = parseGithubLink(link.url);
        if (canonical.kind !== link.kind || canonical.number !== link.number || canonical.repository !== link.repository) throw new Error();
      } catch { context.addIssue({ code: "custom", message: "Invalid GitHub link" }); }
    }
  }
});
export type Organization = z.infer<typeof organizationSchema>;

// One installation owns the shared organization, including cross-host workspace keys.
export const organization = defineSettings({ id: "organization", scope: "host", version: 1, schema: organizationSchema });
export const preferencesSchema = z.object({ collapsed: z.array(z.string()).default([]), sort: z.enum(sortModes).catch("manual").default("manual"),
  titleLines: z.enum(titleLineOptions).catch("2").default("2"), groupBy: z.enum(groupByModes).catch("groups").default("groups"),
  // The toolbar chips' order (normalized with chipOrder) and whether they show text beside their icons.
  toolbarOrder: z.array(z.string()).catch([]).default([]), toolbarLabels: z.boolean().catch(true).default(true),
  // Group headers stay at the top of the list while their workspaces scroll beneath them.
  stickyHeaders: z.boolean().catch(true).default(true),
  // In the desktop app, PR and issue links open as a Paseo browser tab in their workspace rather than the default browser.
  linksInPaseo: z.boolean().catch(true).default(true) });
// Choices kept on each device: collapsed groups, sort, grouping, title lines, the toolbar, sticky headers and links.
export const preferences = defineSettings({ id: "preferences", scope: "device", version: 1, schema: preferencesSchema });

export function workspaceKey(hostId: string, id: string): string { return JSON.stringify([hostId, id]); }
export function emptyDetails(): WorkspaceDetails { return workspaceDetailsSchema.parse({}); }

export function descendants(groups: readonly Group[], id: string): Set<string> {
  const result = new Set([id]);
  for (let changed = true; changed;) {
    changed = false;
    for (const group of groups) if (group.parentId && result.has(group.parentId) && !result.has(group.id)) {
      result.add(group.id); changed = true;
    }
  }
  return result;
}

// Dissolving a group promotes its children and workspaces to its parent.
export function dissolveGroup(value: Organization, id: string): Organization {
  const parentId = value.groups.find((group) => group.id === id)?.parentId ?? null;
  return { ...value,
    groups: value.groups.filter((group) => group.id !== id).map((group) => group.parentId === id ? { ...group, parentId } : group),
    workspaces: Object.fromEntries(Object.entries(value.workspaces).map(([key, details]) =>
      [key, details.groupId === id ? { ...details, groupId: parentId } : details])),
  };
}

export function moveInOrder(order: readonly string[], visible: readonly string[], id: string, direction: -1 | 1): string[] {
  const all = [...new Set([...order, ...visible])];
  const siblings = all.filter((key) => visible.includes(key));
  const from = siblings.indexOf(id), target = siblings[from + direction];
  if (from < 0 || !target) return all;
  const a = all.indexOf(id), b = all.indexOf(target);
  [all[a], all[b]] = [all[b], all[a]];
  return all;
}

// Drops a workspace before another (or after the last of `siblings`, the target group's workspaces in display order).
// `groupId` undefined keeps its group: automatic groups (host, project…) can only be reordered.
export function placeWorkspace(value: Organization, key: string,
  target: { groupId: string | null | undefined; siblings: readonly string[]; before: string | null }): Organization {
  const order = [...new Set([...value.workspaceOrder, ...target.siblings])].filter((item) => item !== key);
  const anchor = target.before && target.before !== key ? order.indexOf(target.before) : -1;
  const last = Math.max(-1, ...target.siblings.filter((item) => item !== key).map((item) => order.indexOf(item)));
  order.splice(anchor >= 0 ? anchor : last >= 0 ? last + 1 : order.length, 0, key);
  const workspaces = target.groupId === undefined ? value.workspaces
    : { ...value.workspaces, [key]: { ...(value.workspaces[key] ?? emptyDetails()), groupId: target.groupId } };
  return { ...value, workspaceOrder: order, workspaces };
}

// Drops a group under `parentId`, before another group or after its last sibling. Null when it would contain itself.
export function placeGroup(value: Organization, id: string, target: { parentId: string | null; before: string | null }): Organization | null {
  const group = value.groups.find((item) => item.id === id);
  if (!group || (target.parentId && descendants(value.groups, id).has(target.parentId))) return null;
  const groups = value.groups.filter((item) => item.id !== id);
  const anchor = target.before ? groups.findIndex((item) => item.id === target.before) : -1;
  const last = groups.map((item) => item.parentId).lastIndexOf(target.parentId);
  groups.splice(anchor >= 0 ? anchor : last >= 0 ? last + 1 : groups.length, 0, { ...group, parentId: target.parentId });
  return { ...value, groups };
}

export function searchTerms(name: string, branch: string | null, labels: readonly string[], details: WorkspaceDetails, links: readonly GithubLink[], groupNames: readonly string[] = []): string[] {
  return [name, branch ?? "", details.subtitle, ...labels, ...details.tags, ...groupNames,
    ...links.flatMap((link) => [link.repository, link.url, String(link.number), `#${link.number}`,
      `${link.kind} ${link.number}`, `${link.kind} #${link.number}`, `${link.repository}#${link.number}`])].filter(Boolean);
}

export function matchesSearch(query: string, terms: readonly string[]): boolean {
  const haystack = terms.join(" ").toLowerCase();
  return query.trim().toLowerCase().split(/\s+/).every((term) => haystack.includes(term));
}
