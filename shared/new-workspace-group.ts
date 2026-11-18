// Picking a group on Paseo's New workspace screen: the choice travels as workspace metadata, because the workspace
// does not exist yet, and the sidebar files the new workspace into that group once it appears.
import { emptyDetails, type Organization } from "./organization";

export const GROUP_METADATA_KEY = "workspace-organizer.group";

export function requestedGroup(metadata: Readonly<Record<string, unknown>> | null | undefined): string | null {
  const value = metadata?.[GROUP_METADATA_KEY];
  return typeof value === "string" && value ? value : null;
}

// Files each workspace the organizer has never stored details for into its picked group, if that group still exists.
// A workspace with details was already seen (and maybe moved since), so its place stands. Null when nothing changes.
export function fileNewWorkspaces(value: Organization, requests: readonly { key: string; groupId: string | null }[]):
  { value: Organization; keys: string[] } | null {
  const workspaces = { ...value.workspaces };
  const keys: string[] = [];
  for (const { key, groupId } of requests) {
    if (!groupId || workspaces[key] || !value.groups.some((group) => group.id === groupId)) continue;
    workspaces[key] = { ...emptyDetails(), groupId };
    keys.push(key);
  }
  return keys.length ? { value: { ...value, workspaces }, keys } : null;
}
