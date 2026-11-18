import { expect, it } from "vitest";
import { fileNewWorkspaces, GROUP_METADATA_KEY, requestedGroup } from "../shared/new-workspace-group";
import { emptyDetails, organizationSchema } from "../shared/organization";
import { workspaceEntry } from "../shared/workspace-entry";

const org = () => organizationSchema.parse({
  groups: [{ id: "sprint", name: "Sprint", parentId: null }],
  workspaces: { moved: { ...emptyDetails(), groupId: null } },
});

it("reads the group picked on the New workspace screen from the workspace's metadata", () => {
  expect(requestedGroup({ [GROUP_METADATA_KEY]: "sprint" })).toBe("sprint");
  expect(requestedGroup({ [GROUP_METADATA_KEY]: 42 })).toBeNull();
  expect(requestedGroup({})).toBeNull();
  expect(requestedGroup(null)).toBeNull();
  expect(workspaceEntry({ id: "w", name: "w", metadata: { [GROUP_METADATA_KEY]: "sprint" } } as any).group).toBe("sprint");
});

it("files brand-new workspaces into the group picked for them, and nothing else", () => {
  const filed = fileNewWorkspaces(org(), [
    { key: "fresh", groupId: "sprint" },
    // Already has details (the user moved it since): their choice stands.
    { key: "moved", groupId: "sprint" },
    // The group was removed before the workspace appeared.
    { key: "orphan", groupId: "gone" },
    { key: "plain", groupId: null },
  ]);
  expect(filed?.keys).toEqual(["fresh"]);
  expect(filed?.value.workspaces.fresh.groupId).toBe("sprint");
  expect(filed?.value.workspaces.moved.groupId).toBeNull();
  expect(filed?.value.workspaces.orphan).toBeUndefined();
  expect(fileNewWorkspaces(org(), [{ key: "moved", groupId: "sprint" }])).toBeNull();
});
