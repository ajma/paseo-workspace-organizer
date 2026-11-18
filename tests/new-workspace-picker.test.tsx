import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NewWorkspaceGroupPicker } from "../client/new-workspace-group";
import { OrganizerSidebar } from "../client/sidebar";
import { GROUP_METADATA_KEY } from "../shared/new-workspace-group";
import { workspaceKey } from "../shared/organization";
import { getOrganization, makeIndex, metadataCalls, resetHost, theme, useNewWorkspace } from "../preview/host";

beforeEach(resetHost);
const host = { id: "local", label: "This Mac" };

it("offers a Group field on the New workspace screen that records the pick on the new workspace", async () => {
  let metadata: Record<string, unknown> = {};
  const Probe = () => { metadata = useNewWorkspace().metadata; return null; };
  render(<><NewWorkspaceGroupPicker theme={theme as any} host={host} layout={{ compact: false, platform: "web" }} /><Probe /></>);
  fireEvent.click(screen.getByRole("button", { name: "Group, currently Ungrouped" }));
  // Nested groups read as paths, after Ungrouped.
  expect(screen.getAllByRole("button", { name: /^Group (?!,)/ }).map((option) => option.getAttribute("aria-label")))
    .toEqual(["Group Ungrouped", "Group In progress", "Group In progress / Interface", "Group Later"]);
  fireEvent.click(screen.getByRole("button", { name: "Group In progress / Interface" }));
  await waitFor(() => expect(metadata[GROUP_METADATA_KEY]).toBe("interface"));
  expect(screen.getByRole("button", { name: "Group, currently In progress / Interface" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Group, currently In progress / Interface" }));
  fireEvent.click(screen.getByRole("button", { name: "Group Ungrouped" }));
  await waitFor(() => expect(metadata[GROUP_METADATA_KEY]).toBeUndefined());
});

it("files a newly created workspace into its picked group, then clears the pick", async () => {
  // "notes" is new to the organizer; "mobile" already sits in Later and keeps its place.
  const index = makeIndex({ entries: [
    { id: "notes", name: "notes", branch: null, labels: [], links: [], git: null, group: "active" },
    { id: "mobile", name: "mobile", branch: null, labels: [], links: [], git: null, group: "active" },
  ] });
  render(<OrganizerSidebar theme={theme} layout={{ compact: false, platform: "web" }} index={index}
    active={{ workspace: null, agent: null }} navigation={{ openWorkspace: vi.fn(), openAgent: vi.fn(), openTerminal: vi.fn(), openProject: vi.fn() }} dismiss={vi.fn()} />);
  await waitFor(() => expect(getOrganization().workspaces[workspaceKey("local", "notes")]?.groupId).toBe("active"));
  expect(getOrganization().workspaces[workspaceKey("local", "mobile")].groupId).toBe("later");
  await waitFor(() => expect(metadataCalls).toEqual(expect.arrayContaining([
    { hostId: "local", id: "notes", patch: { [GROUP_METADATA_KEY]: null } },
    { hostId: "local", id: "mobile", patch: { [GROUP_METADATA_KEY]: null } },
  ])));
});
