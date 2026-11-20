import { beforeEach, expect, it, vi } from "vitest";
import { act, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OrganizerSidebar } from "../client/sidebar";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { HINT_DELAY_MS } from "../client/hint";
import { createProjectIconStore } from "../client/project-icons";
import { archiveCalls, changeOrganization, failArchives, failRenames, getDocument, getOrganization, makeIndex, renameCalls, resetHost, setHostLabels, setWorkspaces, theme, workspace } from "../preview/host";
import { placeSidebar } from "../client/sidebar-placement";
import { emptyDetails, workspaceKey } from "../shared/organization";

beforeEach(resetHost);
const show = () => render(<OrganizerSidebar theme={theme} layout={{ compact: true, platform: "web" }}
  active={{ workspace: null, agent: null }} navigation={{ openWorkspace: vi.fn(), openAgent: vi.fn(), openTerminal: vi.fn(), openProject: vi.fn() }} dismiss={vi.fn()} index={makeIndex()} />);
const openFilterTab = (tab: "Status" | "Tags" | "Host" | "Project" | "PR") => {
  if (!screen.queryByRole("tablist")) fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
  fireEvent.click(screen.getByRole("tab", { name: new RegExp(`^${tab}`) }));
};
// Hover menus: a group header's ⋯ and a row's ⋯ show while the pointer is on them.
const groupMenu = (name: string, item: string) => {
  fireEvent.pointerEnter(screen.getByRole("button", { name: new RegExp(`^(Collapse|Expand) ${name}$`) }), { pointerType: "mouse" });
  fireEvent.click(screen.getByRole("button", { name: `${name} group actions` }));
  fireEvent.click(screen.getByRole("menuitem", { name: item }));
};
const rowMenu = (title: string, item: string) => {
  const row = screen.getByRole("button", { name: new RegExp(`^Open ${title}`) }).closest('[data-testid="workspace-row"]') as HTMLElement;
  fireEvent.pointerEnter(row, { pointerType: "mouse" });
  fireEvent.click(screen.getByRole("button", { name: "Workspace actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name: item }));
};
// The Saved pill opens a menu of saved searches and their actions.
const openSaved = () => fireEvent.click(screen.getByRole("button", { name: /^Saved searches/ }));
const typeSearch = (value: string) => {
  if (!screen.queryByRole("textbox", { name: "Search workspaces" })) fireEvent.click(screen.getByRole("button", { name: "Show search" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Search workspaces" }), { target: { value } });
};

it("renders multiline subtitles, tags and each PR and issue link", () => {
  show();
  expect(screen.getByText(/Custom groups and a calmer workspace list/).textContent).toContain("\nKeep tags");
  expect(screen.getByText("in review")).toBeTruthy();
  expect(screen.getAllByRole("link").map((element) => element.getAttribute("aria-label"))).toEqual(expect.arrayContaining([
    "Open PR getpaseo/paseo#412", "Open PR getpaseo/paseo#427", "Open issue getpaseo/paseo#385",
  ]));
});
it("shows each GitHub link like Paseo's list: number, state when not open, and CI result", () => {
  show();
  expect(screen.getByLabelText("PR 412").textContent).toBe("412passed");
  expect(screen.getByLabelText("PR 427").textContent).toBe("427 Draftrunning");
  expect(screen.getByLabelText("Issue 385").textContent).toBe("385 Closed");
});
it("finds a workspace inside collapsed nested groups by an issue number", () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Collapse In progress" }));
  expect(screen.queryByText("Restructure workspace navigation")).toBeNull();
  typeSearch("#385");
  expect(screen.getByText("Restructure workspace navigation")).toBeTruthy();
  expect(screen.queryByText("Search by GitHub references")).toBeNull();
});
it("creates a custom subgroup", async () => {
  show();
  groupMenu("Later", "Add subgroup…");
  fireEvent.change(screen.getByRole("textbox", { name: "Group name" }), { target: { value: "Next sprint" } });
  fireEvent.click(screen.getByRole("button", { name: "Save group" }));
  await waitFor(() => expect(getOrganization().groups).toContainEqual(expect.objectContaining({ name: "Next sprint", parentId: "later" })));
});
it("moves a workspace to a custom group and saves multiline notes, tags and multiple links", async () => {
  show();
  rowMenu("Explore next ideas", "Edit details");
  fireEvent.click(screen.getByRole("radio", { name: "In progress / Interface" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Subtitle" }), { target: { value: "First line\nSecond line" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Tags (comma separated)" }), { target: { value: "alpha, beta" } });
  fireEvent.change(screen.getByRole("textbox", { name: "GitHub links (one URL or #number per line)" }), { target: { value: "https://github.com/o/r/pull/1\nhttps://github.com/o/r/pull/2\nhttps://github.com/o/r/issues/3" } });
  fireEvent.click(screen.getByRole("button", { name: "Save workspace" }));
  await waitFor(() => expect(getOrganization().workspaces[workspaceKey("local", "notes")]).toMatchObject({ groupId: "interface", subtitle: "First line\nSecond line", tags: ["alpha", "beta"], links: expect.any(Array) }));
  expect(getOrganization().workspaces[workspaceKey("local", "notes")].links).toHaveLength(3);
});
it("renames a workspace from its menu, and an empty name goes back to Paseo's", async () => {
  setWorkspaces([workspace("notes", "Explore next ideas", { name: "notes-default", projectId: "notes", projectDisplayName: "notes", branch: null })]);
  show();
  rowMenu("Explore next ideas", "Rename…");
  const field = () => screen.getByRole("textbox", { name: "Workspace name" }) as HTMLInputElement;
  expect(field().value).toBe("Explore next ideas");
  expect(screen.getByText(/notes-default/)).toBeTruthy();
  fireEvent.change(field(), { target: { value: "  Brainstorm  " } });
  fireEvent.click(screen.getByRole("button", { name: "Save name" }));
  await waitFor(() => expect(screen.getByRole("button", { name: /^Open Brainstorm/ })).toBeTruthy());
  expect(renameCalls).toEqual([{ id: "notes", title: "Brainstorm" }]);
  expect(screen.queryByRole("textbox", { name: "Workspace name" })).toBeNull();
  rowMenu("Brainstorm", "Rename…");
  fireEvent.change(field(), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Save name" }));
  await waitFor(() => expect(screen.getByRole("button", { name: /^Open notes-default/ })).toBeTruthy());
  expect(renameCalls.at(-1)).toEqual({ id: "notes", title: null });
});

it("keeps the rename open with the reason when renaming fails", async () => {
  failRenames("Host is offline");
  show();
  rowMenu("Explore next ideas", "Rename…");
  fireEvent.change(screen.getByRole("textbox", { name: "Workspace name" }), { target: { value: "Brainstorm" } });
  fireEvent.click(screen.getByRole("button", { name: "Save name" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Host is offline"));
  expect((screen.getByRole("textbox", { name: "Workspace name" }) as HTMLInputElement).value).toBe("Brainstorm");
  expect(screen.getByRole("button", { name: /^Open Explore next ideas/ })).toBeTruthy();
});

it("offers Groups from in the ⋯ menu once several hosts run the plugin, and keeps the pick on this device", async () => {
  localStorage.setItem("@paseo:daemon-registry", JSON.stringify([{ serverId: "local", connections: [{ id: "direct:localhost:6767", endpoint: "localhost:6767" }] }]));
  setWorkspaces([workspace("notes", "Explore next ideas"), workspace("box-work", "Build box work", { hostId: "box" })]);
  setHostLabels({ box: "Build box" });
  show();
  const openMore = () => fireEvent.click(screen.getByRole("button", { name: "More options" }));
  openMore();
  expect(screen.queryByText("Groups from")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "More options" }));
  // Two hosts' copies are running in this window.
  const copies = ["local", "box"].map((id) => {
    let shown = 0;
    const stop = placeSidebar({ hostId: () => id, subscribe: () => () => {}, localHosts: new Set(["local"]), initialChoice: null,
      add: () => { shown++; return () => { shown--; }; } });
    return { stop, shown: () => shown };
  });
  openMore();
  expect(screen.getByText("Groups from")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Groups from This Mac (this computer)" }).getAttribute("aria-selected")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Groups from Build box" }));
  await waitFor(() => expect(getDocument("preferences").sidebarHost).toBe("box"));
  expect(copies.map((copy) => copy.shown())).toEqual([0, 1]);
  // Picking this computer again goes back to the default.
  openMore();
  fireEvent.click(screen.getByRole("button", { name: "Groups from This Mac (this computer)" }));
  await waitFor(() => expect(getDocument("preferences").sidebarHost).toBeNull());
  expect(copies.map((copy) => copy.shown())).toEqual([1, 0]);
  copies.forEach((copy) => copy.stop());
  localStorage.removeItem("@paseo:daemon-registry");
});

it("switches the sidebar to the picked host's copy and keeps it there, as Paseo swaps the copies' sidebars", async () => {
  localStorage.setItem("@paseo:daemon-registry", JSON.stringify([{ serverId: "local", connections: [{ id: "direct:localhost:6767", endpoint: "localhost:6767" }] }]));
  setWorkspaces([workspace("notes", "Explore next ideas"), workspace("box-work", "Build box work", { hostId: "box" })]);
  setHostLabels({ box: "Build box" });
  // Like Paseo: each host's copy offers its own sidebar, and only the offered one is drawn.
  function Paseo() {
    const [owner, setOwner] = useState<string | null>(null);
    useEffect(() => {
      const stops = ["local", "box"].map((id) => placeSidebar({ hostId: () => id, subscribe: () => () => {}, localHosts: new Set(["local"]),
        initialChoice: null, add: () => { setOwner(id); return () => setOwner((current) => (current === id ? null : current)); } }));
      return () => stops.forEach((stop) => stop());
    }, []);
    return owner ? <View testID={`sidebar-of-${owner}`}><OrganizerSidebar key={owner} theme={theme} layout={{ compact: true, platform: "web" }}
      active={{ workspace: null, agent: null }} navigation={{ openWorkspace: vi.fn(), openAgent: vi.fn(), openTerminal: vi.fn(), openProject: vi.fn() }}
      dismiss={vi.fn()} index={makeIndex()} /></View> : null;
  }
  render(<Paseo />);
  await waitFor(() => expect(screen.getByTestId("sidebar-of-local")).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "More options" }));
  fireEvent.click(screen.getByRole("button", { name: "Groups from Build box" }));
  await waitFor(() => expect(getDocument("preferences").sidebarHost).toBe("box"));
  await waitFor(() => expect(screen.getByTestId("sidebar-of-box")).toBeTruthy());
  // It stays on the picked host rather than bouncing back.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
  expect(screen.getByTestId("sidebar-of-box")).toBeTruthy();
  localStorage.removeItem("@paseo:daemon-registry");
});

it("looks a bare PR or issue number up in the workspace's repository when saving its links", async () => {
  const resolveLinks = vi.fn(async ({ numbers }: { numbers: number[] }) => numbers[0] === 77
    ? { links: [], errors: ["#77 wasn't found in getpaseo/paseo."] }
    : { links: [{ repository: "getpaseo/paseo", number: 42, kind: "pr" as const, url: "https://github.com/getpaseo/paseo/pull/42" }], errors: [] });
  render(<OrganizerSidebar theme={theme} layout={{ compact: true, platform: "web" }} active={{ workspace: null, agent: null }}
    navigation={{ openWorkspace: vi.fn(), openAgent: vi.fn(), openTerminal: vi.fn(), openProject: vi.fn() }} dismiss={vi.fn()} index={makeIndex()} resolveLinks={resolveLinks} />);
  rowMenu("Explore next ideas", "Edit details");
  const links = () => screen.getByRole("textbox", { name: "GitHub links (one URL or #number per line)" }) as HTMLTextAreaElement;
  fireEvent.change(links(), { target: { value: "#77" } });
  fireEvent.click(screen.getByRole("button", { name: "Save workspace" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("#77 wasn't found"));
  expect(links().value).toBe("#77");
  fireEvent.change(links(), { target: { value: "#42" } });
  fireEvent.click(screen.getByRole("button", { name: "Save workspace" }));
  await waitFor(() => expect(getOrganization().workspaces[workspaceKey("local", "notes")].links.map((link: { url: string }) => link.url)).toEqual(["https://github.com/getpaseo/paseo/pull/42"]));
  expect(resolveLinks).toHaveBeenLastCalledWith(expect.objectContaining({ hostId: "local", workspaceId: "notes", numbers: [42] }));
});

it("keeps an unsaved draft when another client changes the organization", async () => {
  show();
  rowMenu("Explore next ideas", "Edit details");
  fireEvent.change(screen.getByRole("textbox", { name: "Subtitle" }), { target: { value: "Keep this draft" } });
  act(() => changeOrganization((values) => ({ ...values, groups: [...values.groups, { id: "new", name: "From another client", parentId: null }] })));
  fireEvent.click(screen.getByRole("button", { name: "Save workspace" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Settings changed elsewhere"));
  expect((screen.getByRole("textbox", { name: "Subtitle" }) as HTMLTextAreaElement).value).toBe("Keep this draft");
  expect(getOrganization().groups.some((group: any) => group.id === "new")).toBe(true);
});

it("filters by status and reveals matches inside collapsed groups", () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Collapse In progress" }));
  expect(screen.queryByRole("checkbox", { name: "Filter status Running" })).toBeNull();
  openFilterTab("Status");
  fireEvent.click(screen.getByRole("checkbox", { name: "Filter status Running" }));
  expect(screen.getByRole("tab", { name: "Status, 1 selected" }).textContent).toBe("Status · 1");
  expect(screen.getByRole("button", { name: "Filters, 1 selected" }).textContent).toContain("Filters · 1");
  expect(screen.getByText("Restructure workspace navigation")).toBeTruthy();
  expect(screen.queryByText("Search by GitHub references")).toBeNull();
  openFilterTab("Tags");
  expect(screen.queryByRole("checkbox", { name: "Filter status Running" })).toBeNull();
  expect(screen.getByText("Restructure workspace navigation")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(screen.queryByText("Restructure workspace navigation")).toBeNull();
});

it("filters by native workspace tags and organizer tags", () => {
  show();
  openFilterTab("Tags");
  fireEvent.click(screen.getByRole("checkbox", { name: "Filter tag plugin" }));
  expect(screen.getByText("Restructure workspace navigation")).toBeTruthy();
  expect(screen.queryByText("Explore next ideas")).toBeNull();
  fireEvent.click(screen.getByRole("checkbox", { name: "Filter tag plugin" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Filter tag mobile" }));
  expect(screen.getByText("Polish compact sidebar layout")).toBeTruthy();
  expect(screen.queryByText("Restructure workspace navigation")).toBeNull();
});

it("shows two-level tags collapsed under their group; checking the group selects every sub-level tag", () => {
  setWorkspaces([workspace("abc", "Attribute abc", { labels: ["tag:abc"] }),
    workspace("def", "Attribute def"), workspace("other", "Other tag", { labels: ["other:abc"] }),
    workspace("phone", "Phone S25", { labels: ["📲 S25"] }), workspace("phone2", "Phone P10", { labels: ["📲 P10"] })]);
  changeOrganization((value) => ({ ...value, workspaces: { ...value.workspaces,
    [workspaceKey("local", "def")]: { ...emptyDetails(), tags: ["tag:def"] },
  } }));
  show();
  openFilterTab("Tags");
  // Only the first level shows; sub-level tags are collapsed.
  expect(screen.queryByRole("checkbox", { name: "Filter exact tag tag:abc" })).toBeNull();
  expect(screen.getByRole("button", { name: "Expand tag tag" })).toBeTruthy();
  // A plain tag with nothing beneath it has no expand button.
  expect(screen.queryByRole("button", { name: "Expand tag mobile" })).toBeNull();
  // Checking the group expands it and checks every sub-level tag.
  fireEvent.click(screen.getByRole("checkbox", { name: "Filter tag tag" }));
  expect(screen.getByRole("checkbox", { name: "Filter tag tag" }).getAttribute("aria-checked")).toBe("true");
  expect(screen.getByRole("checkbox", { name: "Filter exact tag tag:abc" }).getAttribute("aria-checked")).toBe("true");
  expect(screen.getByRole("checkbox", { name: "Filter exact tag tag:def" }).getAttribute("aria-checked")).toBe("true");
  expect(screen.getByText("Attribute abc")).toBeTruthy();
  expect(screen.getByText("Attribute def")).toBeTruthy();
  expect(screen.queryByText("Other tag")).toBeNull();
  // Unchecking one sub-level tag stops showing its workspaces; the group shows as partly checked.
  fireEvent.click(screen.getByRole("checkbox", { name: "Filter exact tag tag:abc" }));
  expect(screen.queryByText("Attribute abc")).toBeNull();
  expect(screen.getByText("Attribute def")).toBeTruthy();
  expect(screen.getByRole("checkbox", { name: "Filter tag tag" }).getAttribute("aria-checked")).toBe("mixed");
  // Pressing a partly checked group checks all again; pressing a fully checked group clears it.
  fireEvent.click(screen.getByRole("checkbox", { name: "Filter tag tag" }));
  expect(screen.getByText("Attribute abc")).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: "Filter tag tag" }));
  expect(screen.getByText("Phone S25")).toBeTruthy();
  // Sub-level rows show the part after the group, and collapse again on request.
  fireEvent.click(screen.getByRole("button", { name: "Expand tag 📲" }));
  // The row reads "S25", then its workspace count.
  expect(screen.getByRole("checkbox", { name: "Filter exact tag 📲 S25" }).textContent).toBe("S251");
  fireEvent.click(screen.getByRole("checkbox", { name: "Filter exact tag 📲 S25" }));
  expect(screen.getByText("Phone S25")).toBeTruthy();
  expect(screen.queryByText("Phone P10")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Collapse tag 📲" }));
  expect(screen.queryByRole("checkbox", { name: "Filter exact tag 📲 S25" })).toBeNull();
});

it("filters hosts and projects using separate identities", () => {
  setWorkspaces([workspace("local", "Local work"), workspace("remote", "Remote work", { hostId: "remote" }),
    workspace("notes", "Project notes", { projectId: "notes", projectDisplayName: "notes" })]);
  show();
  openFilterTab("Host");
  fireEvent.click(screen.getByRole("checkbox", { name: "Filter host remote" }));
  expect(screen.getByText("Remote work")).toBeTruthy();
  expect(screen.queryByText("Local work")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  openFilterTab("Project");
  // Only the project name shared across hosts carries a host suffix.
  expect(screen.getByRole("checkbox", { name: "Filter project paseo on This Mac" })).toBeTruthy();
  expect(screen.getByRole("checkbox", { name: "Filter project paseo on remote" })).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: "Filter project notes" }));
  expect(screen.getByText("Project notes")).toBeTruthy();
  expect(screen.queryByText("Remote work")).toBeNull();
});

it("saves query and filters and restores them after remount", async () => {
  const view = show();
  typeSearch("#385");
  openFilterTab("Status");
  fireEvent.click(screen.getByRole("checkbox", { name: "Filter status Running" }));
  openSaved();
  fireEvent.click(screen.getByRole("button", { name: "Save search" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Search name" }), { target: { value: "My reviews" } });
  fireEvent.click(screen.getByRole("button", { name: "Save named search" }));
  await waitFor(() => expect(getOrganization().savedSearches).toContainEqual(expect.objectContaining({ name: "My reviews", query: "#385", filters: { statuses: ["running"], tags: [], hostIds: [], projectKeys: [], prs: [] } })));
  view.unmount(); show();
  openSaved();
  fireEvent.click(screen.getByRole("button", { name: "Use saved search My reviews" }));
  // The pill now shows the saved search in use.
  expect(screen.getByRole("button", { name: "Saved searches, currently My reviews" }).textContent).toContain("My reviews");
  expect((screen.getByRole("textbox", { name: "Search workspaces" }) as HTMLInputElement).value).toBe("#385");
  expect(screen.getByText("Restructure workspace navigation")).toBeTruthy();
  expect(screen.queryByText("Search by GitHub references")).toBeNull();
});

it("updates, renames and deletes a saved search while retaining unrelated organization data", async () => {
  changeOrganization((value) => ({ ...value, savedSearches: [{ id: "saved", name: "Reviews", query: "", filters: { statuses: ["running"], tags: [], hostIds: [], projectKeys: [] } }] }));
  show();
  openSaved();
  fireEvent.click(screen.getByRole("button", { name: "Use saved search Reviews" }));
  typeSearch("#385");
  openSaved();
  fireEvent.click(screen.getByRole("button", { name: "Update saved search" }));
  await waitFor(() => expect(getOrganization().savedSearches[0].query).toBe("#385"));
  fireEvent.click(screen.getByRole("button", { name: "Manage saved search" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Search name" }), { target: { value: "Ready for review" } });
  fireEvent.click(screen.getByRole("button", { name: "Save named search" }));
  await waitFor(() => expect(getOrganization().savedSearches[0].name).toBe("Ready for review"));
  await waitFor(() => expect(screen.queryByRole("textbox", { name: "Search name" })).toBeNull());
  openSaved();
  fireEvent.click(screen.getByRole("button", { name: "Manage saved search" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete saved search" }));
  await waitFor(() => expect(getOrganization().savedSearches).toEqual([]));
  expect(getOrganization().groups).toHaveLength(3);
  expect(getOrganization().workspaces[workspaceKey("local", "sidebar")].subtitle).toContain("Custom groups");
});

it("preserves a saved-search draft on a concurrent settings conflict", async () => {
  show();
  openSaved();
  fireEvent.click(screen.getByRole("button", { name: "Save search" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Search name" }), { target: { value: "Keep my draft" } });
  act(() => changeOrganization((value) => ({ ...value, groups: [...value.groups, { id: "new", name: "Other client", parentId: null }] })));
  fireEvent.click(screen.getByRole("button", { name: "Save named search" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Settings changed elsewhere"));
  expect((screen.getByRole("textbox", { name: "Search name" }) as HTMLInputElement).value).toBe("Keep my draft");
  expect(getOrganization().savedSearches).toEqual([]);
  expect(getOrganization().groups.some((group: any) => group.id === "new")).toBe(true);
});

it("hides the search box until the search pill is pressed, and keeps hidden search text applied", () => {
  show();
  expect(screen.queryByRole("textbox", { name: "Search workspaces" })).toBeNull();
  typeSearch("#385");
  expect(screen.queryByText("Search by GitHub references")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Hide search" }));
  expect(screen.queryByRole("textbox", { name: "Search workspaces" })).toBeNull();
  expect(screen.getByRole("button", { name: "Show search" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.queryByText("Search by GitHub references")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(screen.getByRole("button", { name: "Show search" }).getAttribute("aria-pressed")).toBe("false");
  expect(screen.getByText("Search by GitHub references")).toBeTruthy();
});

it("shows each workspace's last activity", () => {
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000 - 1_000).toISOString();
  setWorkspaces([
    workspace("sidebar", "Restructure workspace navigation", { createdAt: minutesAgo(600), lastPromptAt: minutesAgo(5), statusEnteredAt: minutesAgo(30) }),
    workspace("search", "Search by GitHub references", { createdAt: minutesAgo(3 * 24 * 60), lastPromptAt: null, statusEnteredAt: null }),
    workspace("mobile", "Polish compact sidebar layout"),
  ]);
  show();
  expect(screen.getByLabelText("Last activity 5m")).toBeTruthy();
  expect(screen.getByLabelText("Last activity 3d")).toBeTruthy();
  expect(screen.getAllByLabelText(/^Last activity/)).toHaveLength(2);
});

it("changes workspace sorting from the pill row and remembers it on the device", async () => {
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
  setWorkspaces([
    workspace("one", "Alpha task", { lastPromptAt: minutesAgo(90) }),
    workspace("two", "Zulu task", { lastPromptAt: minutesAgo(5) }),
  ]);
  const view = show();
  const titles = () => screen.getAllByRole("button", { name: /^Open .* task/ }).map((element) => element.getAttribute("aria-label"));
  expect(titles()).toEqual(["Open Alpha task, Running", "Open Zulu task, Running"]);
  fireEvent.click(screen.getByRole("button", { name: "Sort by, currently Manual" }));
  fireEvent.click(screen.getByRole("button", { name: "Sort by Recent activity" }));
  await waitFor(() => expect(titles()).toEqual(["Open Zulu task, Running", "Open Alpha task, Running"]));
  view.unmount(); show();
  expect(screen.getByRole("button", { name: "Sort by, currently Recent activity" })).toBeTruthy();
  expect(titles()).toEqual(["Open Zulu task, Running", "Open Alpha task, Running"]);
});

it("shows project icons from the installation's host in the project chooser, batching one request", async () => {
  setWorkspaces([workspace("local", "Local work"), workspace("remote", "Remote work", { hostId: "remote" }),
    workspace("notes", "Project notes", { projectId: "notes", projectDisplayName: "notes" })]);
  const png = "iVBORw0KGgo=";
  const rpc = vi.fn(async () => ({ icons: { notes: { data: png, mimeType: "image/png" }, paseo: null } }));
  const icons = createProjectIconStore({ rpc } as never);
  render(<OrganizerSidebar theme={theme} layout={{ compact: true, platform: "web" }} icons={icons}
    active={{ workspace: null, agent: null }} navigation={{ openWorkspace: vi.fn(), openAgent: vi.fn(), openTerminal: vi.fn(), openProject: vi.fn() }} dismiss={vi.fn()} index={makeIndex()} />);
  openFilterTab("Project");
  await waitFor(() => expect(document.querySelector(`img[src="data:image/png;base64,${png}"]`)).not.toBeNull());
  expect(rpc).toHaveBeenCalledTimes(1);
  // The remote host's projects are not readable from this installation.
  expect((rpc.mock.calls[0] as unknown[])[1]).toEqual({ projectIds: expect.arrayContaining(["paseo", "notes"]) });
  expect(((rpc.mock.calls[0] as unknown[])[1] as { projectIds: string[] }).projectIds).toHaveLength(2);
});

it("opens one Filters dropdown with a tab per category and closes it with Done", () => {
  show();
  expect(screen.queryByRole("tablist")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Filters" }));
  expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Status", "Tags", "Host", "Project", "PR"]);
  expect(screen.getByRole("tab", { name: "Status" }).getAttribute("aria-selected")).toBe("true");
  fireEvent.click(screen.getByRole("checkbox", { name: "Filter status Done" }));
  expect(screen.getByRole("checkbox", { name: "Filter status Done" }).getAttribute("aria-checked")).toBe("true");
  openFilterTab("Tags");
  fireEvent.click(screen.getByRole("checkbox", { name: "Filter tag mobile" }));
  expect(screen.getByRole("button", { name: "Filters, 2 selected" })).toBeTruthy();
  expect(screen.getByText("Polish compact sidebar layout")).toBeTruthy();
  expect(screen.queryByText("Restructure workspace navigation")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Close filters" }));
  expect(screen.queryByRole("tablist")).toBeNull();
  expect(screen.queryByText("Restructure workspace navigation")).toBeNull();
});

it("opens a workspace by pressing its card, but its menu does not", () => {
  const openWorkspace = vi.fn();
  render(<OrganizerSidebar theme={theme} layout={{ compact: true, platform: "web" }} active={{ workspace: null, agent: null }}
    navigation={{ openWorkspace, openAgent: vi.fn(), openTerminal: vi.fn(), openProject: vi.fn() }} dismiss={vi.fn()} index={makeIndex()} />);
  fireEvent.click(screen.getByText(/Custom groups and a calmer workspace list/));
  expect(openWorkspace).toHaveBeenCalledTimes(1);
  expect(openWorkspace.mock.calls[0][0].id).toBe("sidebar");
  rowMenu("Restructure workspace navigation", "Edit details");
  expect(openWorkspace).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("textbox", { name: /subtitle|notes/i })).toBeTruthy();
});

it("filters workspaces by PR from the PR tab", () => {
  show();
  openFilterTab("PR");
  fireEvent.click(screen.getByRole("checkbox", { name: "Filter PR Has a PR" }));
  expect(screen.getByText("Restructure workspace navigation")).toBeTruthy();
  expect(screen.queryByText("Polish compact sidebar layout")).toBeNull();
  fireEvent.click(screen.getByRole("checkbox", { name: "Filter PR Has a PR" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Filter PR No PR" }));
  expect(screen.queryByText("Restructure workspace navigation")).toBeNull();
  expect(screen.getByText("Polish compact sidebar layout")).toBeTruthy();
});

// Browser drag and drop: start on `source`, then hover and drop on `target` at a height (0 top, 1 bottom).
async function dragTo(source: HTMLElement, find: HTMLElement | (() => HTMLElement), ratio = 0.5) {
  fireEvent.dragStart(source);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  const target = typeof find === "function" ? find() : find;
  vi.spyOn(target, "getBoundingClientRect").mockReturnValue({ top: 0, height: 100 } as DOMRect);
  for (const make of [createEvent.dragOver, createEvent.drop]) {
    const event = make(target);
    Object.defineProperty(event, "clientY", { value: ratio * 100 });
    fireEvent(target, event);
  }
  fireEvent.dragEnd(source);
}
const rowOf = (title: string) => screen.getByRole("button", { name: new RegExp(`^Open ${title}`) }).closest('[data-testid="workspace-row"]') as HTMLElement;
const headerOf = (name: string) => screen.getByRole("button", { name: new RegExp(`^(Collapse|Expand) ${name}$`) }).parentElement!.parentElement as HTMLElement;

it("has no Organize mode: rows and group headers can be dragged", () => {
  show();
  expect(screen.queryByRole("button", { name: "Organize" })).toBeNull();
  expect(rowOf("Explore next ideas").getAttribute("draggable")).toBe("true");
  expect(headerOf("Later").getAttribute("draggable")).toBe("true");
});

it("drops a workspace on a group to move it in, and on Ungrouped to take it out", async () => {
  show();
  await dragTo(rowOf("Explore next ideas"), headerOf("Later"));
  await waitFor(() => expect(getOrganization().workspaces[workspaceKey("local", "notes")].groupId).toBe("later"));
  // With nothing ungrouped, the Ungrouped drop zone appears once a drag starts.
  expect(screen.queryByText("Ungrouped")).toBeNull();
  await dragTo(rowOf("Polish compact sidebar layout"), () => headerOf("Ungrouped"));
  await waitFor(() => expect(getOrganization().workspaces[workspaceKey("local", "mobile")].groupId).toBeNull());
});

it("drops a workspace above another to reorder it and move it into that row's group", async () => {
  show();
  await dragTo(rowOf("Explore next ideas"), rowOf("Search by GitHub references"), 0.2);
  await waitFor(() => expect(getOrganization().workspaces[workspaceKey("local", "notes")].groupId).toBe("active"));
  const order = getOrganization().workspaceOrder;
  expect(order.indexOf(workspaceKey("local", "notes"))).toBeLessThan(order.indexOf(workspaceKey("local", "search")));
});

it("drops a group inside another, or above it, but never inside itself", async () => {
  show();
  await dragTo(headerOf("Later"), headerOf("Interface"), 0.5);
  await waitFor(() => expect(getOrganization().groups.find((group: any) => group.id === "later").parentId).toBe("interface"));
  await dragTo(headerOf("Later"), headerOf("In progress"), 0.1);
  await waitFor(() => expect(getOrganization().groups.find((group: any) => group.id === "later").parentId).toBeNull());
  expect(getOrganization().groups.map((group: any) => group.id).indexOf("later")).toBe(0);
  const before = JSON.stringify(getOrganization().groups);
  await dragTo(headerOf("In progress"), headerOf("Interface"), 0.5);
  expect(JSON.stringify(getOrganization().groups)).toBe(before);
});

it("shows every workspace in one list with no group headers when grouping is None", async () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Group by, currently Your groups" }));
  fireEvent.click(screen.getByRole("button", { name: "Group by None" }));
  await waitFor(() => expect(getDocument("preferences").groupBy).toBe("none"));
  expect(screen.getByRole("button", { name: "Group by, currently None" })).toBeTruthy();
  // No headers of any kind, and nothing to collapse.
  expect(screen.queryAllByRole("button", { name: /^(Collapse|Expand) / })).toEqual([]);
  expect(screen.queryByText("In progress")).toBeNull();
  expect(screen.queryByText("Ungrouped")).toBeNull();
  // Every workspace is listed.
  for (const title of ["Restructure workspace navigation", "Search by GitHub references", "Polish compact sidebar layout", "Explore next ideas"]) {
    expect(screen.getByRole("button", { name: new RegExp(`^Open ${title}`) })).toBeTruthy();
  }
});

it("groups by host, project or PR status from Group by, remembered on the device", async () => {
  const view = show();
  fireEvent.click(screen.getByRole("button", { name: "Group by, currently Your groups" }));
  fireEvent.click(screen.getByRole("button", { name: "Group by Project" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Collapse notes" })).toBeTruthy());
  expect(screen.getByRole("button", { name: "Collapse paseo" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Collapse Later" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Group by, currently Project" }));
  fireEvent.click(screen.getByRole("button", { name: "Group by PR status" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Collapse No PR" })).toBeTruthy());
  expect(screen.queryByRole("button", { name: "Group by Last active" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Group by, currently PR status" }));
  fireEvent.click(screen.getByRole("button", { name: "Group by Host" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Collapse This Mac" })).toBeTruthy());
  // Collapsing an automatic group works like your own groups.
  fireEvent.click(screen.getByRole("button", { name: "Collapse This Mac" }));
  await waitFor(() => expect(screen.queryByText("Explore next ideas")).toBeNull());
  view.unmount(); show();
  expect(screen.getByRole("button", { name: "Group by, currently Host" })).toBeTruthy();
});

it("creates a group from the Group by menu", async () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Group by, currently Your groups" }));
  fireEvent.click(screen.getByRole("button", { name: "New group" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Group name" }), { target: { value: "Someday" } });
  fireEvent.click(screen.getByRole("button", { name: "Save group" }));
  await waitFor(() => expect(getOrganization().groups).toContainEqual(expect.objectContaining({ name: "Someday", parentId: null })));
});

it("opens the group and workspace editors as a popover over the list, so they show wherever it is scrolled", () => {
  show();
  // Open from a group far down the list: the editor floats over the list rather than sitting at its top.
  groupMenu("Later", "Rename or move…");
  const popover = screen.getByLabelText("Edit group", { selector: "div:not([role])" });
  expect(popover.style.position).toBe("absolute");
  expect(popover.contains(screen.getByRole("textbox", { name: "Group name" }))).toBe(true);
  expect(popover.parentElement!.contains(screen.getByText("Explore next ideas"))).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("textbox", { name: "Group name" })).toBeNull();
  rowMenu("Explore next ideas", "Edit details");
  const details = screen.getByLabelText("Organize Explore next ideas", { selector: "div:not([role])" });
  expect(details.style.position).toBe("absolute");
  expect(details.parentElement!.contains(screen.getByText("Polish compact sidebar layout"))).toBe(false);
});

it("marks the open workspace", () => {
  render(<OrganizerSidebar theme={theme} layout={{ compact: true, platform: "web" }} active={{ workspace: { kind: "workspace", hostId: "local", id: "notes", key: workspaceKey("local", "notes") } as any, agent: null }}
    navigation={{ openWorkspace: vi.fn(), openAgent: vi.fn(), openTerminal: vi.fn(), openProject: vi.fn() }} dismiss={vi.fn()} index={makeIndex()} />);
  expect(screen.getAllByTestId("active-marker")).toHaveLength(1);
  expect(rowOf("Explore next ideas").querySelector('[data-testid="active-marker"]')).toBeTruthy();
});

it("opens Group by and Sort by as dropdowns like Filters, checking the current choice", async () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Sort by, currently Manual" }));
  const sortMenu = screen.getByLabelText("Sort order");
  expect(sortMenu.style.position).toBe("absolute");
  expect(screen.getByRole("button", { name: "Sort by Manual" }).getAttribute("aria-selected")).toBe("true");
  expect(screen.getByRole("button", { name: "Sort by Name" }).getAttribute("aria-selected")).toBe("false");
  // Opening another dropdown closes this one.
  fireEvent.click(screen.getByRole("button", { name: "Group by, currently Your groups" }));
  await waitFor(() => expect(screen.queryByLabelText("Sort order")).toBeNull());
  expect(screen.getByLabelText("Grouping").style.position).toBe("absolute");
  expect(screen.getByRole("button", { name: "Group by Your groups" }).getAttribute("aria-selected")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Group by Host" }));
  await waitFor(() => expect(screen.queryByLabelText("Grouping")).toBeNull());
});

it("shows how many workspaces each filter option would show, given the other selections", () => {
  show();
  openFilterTab("Status");
  const count = (name: string) => screen.getByRole("checkbox", { name }).textContent!.match(/(\d+)$/)?.[1];
  expect(count("Filter status Running")).toBe("1");
  expect(count("Filter status Done")).toBe("2");
  expect(count("Filter status Failed")).toBe("0");
  fireEvent.click(screen.getByRole("checkbox", { name: "Filter status Done" }));
  // Its own tab still counts every status; other tabs now count only Done workspaces.
  expect(count("Filter status Running")).toBe("1");
  openFilterTab("Project");
  expect(count("Filter project notes")).toBe("1");
  expect(count("Filter project paseo")).toBe("1");
  openFilterTab("Tags");
  expect(count("Filter tag mobile")).toBe("1");
  expect(count("Filter tag plugin")).toBe("0");
});

it("collapses and expands every group in one press, for your groups and automatic groups", async () => {
  const view = show();
  fireEvent.click(screen.getByRole("button", { name: "Collapse all groups" }));
  await waitFor(() => expect(screen.queryByText("Restructure workspace navigation")).toBeNull());
  expect(screen.queryByText("Polish compact sidebar layout")).toBeNull();
  // Ungrouped collapses too.
  expect(screen.queryByText("Explore next ideas")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Expand all groups" }));
  await waitFor(() => expect(screen.getByText("Restructure workspace navigation")).toBeTruthy());
  expect(screen.getByText("Polish compact sidebar layout")).toBeTruthy();
  // One open group is enough to offer Collapse all again.
  fireEvent.click(screen.getByRole("button", { name: "Collapse all groups" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Expand all groups" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Expand Later" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Collapse all groups" })).toBeTruthy());
  // Automatic groups too.
  fireEvent.click(screen.getByRole("button", { name: "Group by, currently Your groups" }));
  fireEvent.click(screen.getByRole("button", { name: "Group by Project" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Collapse notes" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Collapse all groups" }));
  await waitFor(() => expect(screen.queryByText("Explore next ideas")).toBeNull());
  view.unmount();
});

it("saves quick changes to device preferences one after another, without a conflict", async () => {
  show();
  const later = screen.getByRole("button", { name: "Collapse Later" });
  const interfaceGroup = screen.getByRole("button", { name: "Collapse Interface" });
  // Two presses before the sidebar redraws, as with a quick double click on two headers.
  act(() => { later.click(); interfaceGroup.click(); });
  await waitFor(() => expect([...getDocument("preferences").collapsed].sort()).toEqual(["interface", "later"]));
  expect(screen.queryByText(/Settings changed elsewhere/)).toBeNull();
  expect(screen.getByRole("button", { name: "Expand Later" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Expand Interface" })).toBeTruthy();
});

it("collapses and expands Ungrouped like any group", async () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Collapse Ungrouped" }));
  await waitFor(() => expect(screen.queryByText("Explore next ideas")).toBeNull());
  expect(screen.getByRole("button", { name: "Expand Ungrouped" }).textContent).toContain("1");
  fireEvent.click(screen.getByRole("button", { name: "Expand Ungrouped" }));
  await waitFor(() => expect(screen.getByText("Explore next ideas")).toBeTruthy());
});

it("in a sorted (not Manual) view, drops a workspace into a group at its sorted place, outlining the group", async () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Sort by, currently Manual" }));
  fireEvent.click(screen.getByRole("button", { name: "Sort by Name" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Sort by, currently Name" })).toBeTruthy());
  const orderBefore = getOrganization().workspaceOrder;
  // Hovering a row in another group offers the whole group, not a spot between rows.
  const source = rowOf("Explore next ideas");
  fireEvent.dragStart(source);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  const target = rowOf("Polish compact sidebar layout");
  vi.spyOn(target, "getBoundingClientRect").mockReturnValue({ top: 0, height: 100 } as DOMRect);
  const over = createEvent.dragOver(target);
  Object.defineProperty(over, "clientY", { value: 10 });
  fireEvent(target, over);
  expect(screen.queryByTestId("drop-line")).toBeNull();
  // The group is outlined with square corners, like its pinned header.
  let outlined: HTMLElement | null = target;
  while (outlined && outlined.style.outlineStyle !== "solid") outlined = outlined.parentElement;
  expect(outlined).not.toBeNull();
  expect(outlined!.style.borderTopLeftRadius || outlined!.style.borderRadius || "0px").toBe("0px");
  const drop = createEvent.drop(target);
  Object.defineProperty(drop, "clientY", { value: 10 });
  fireEvent(target, drop);
  fireEvent.dragEnd(source);
  await waitFor(() => expect(getOrganization().workspaces[workspaceKey("local", "notes")].groupId).toBe("later"));
  // Name order inside Later: "Explore…" before "Polish…", whatever spot it was dropped on.
  const titles = screen.getAllByRole("button", { name: /^Open (Explore|Polish)/ }).map((element) => element.getAttribute("aria-label"));
  expect(titles).toEqual(["Open Explore next ideas, Done", "Open Polish compact sidebar layout, Done"]);
  // Its manual position is now the end of its new group, after Polish.
  const order = getOrganization().workspaceOrder;
  expect(order.indexOf(workspaceKey("local", "notes"))).toBeGreaterThan(order.indexOf(workspaceKey("local", "mobile")));
  expect(orderBefore).not.toEqual(order);
});

it("labels every toolbar chip with text: Search, Filters, Saved, View, Group and Sort", () => {
  show();
  for (const [name, text] of [["Show search", "Search"], [/^Filters/, "Filters"], [/^Saved searches/, "Saved"], [/^View, currently/, "View"],
    [/^Group by, currently/, "Group"], [/^Sort by, currently/, "Sort"]] as const) {
    expect(screen.getByRole("button", { name }).textContent).toContain(text);
  }
  // Collapse all is an icon button again.
  expect(screen.getByRole("button", { name: "Collapse all groups" }).textContent).toBe("");
  expect(screen.getByRole("button", { name: /^Group by, currently/ }).textContent).toContain("Group");
  expect(screen.getByRole("button", { name: /^Group by, currently/ }).textContent).not.toContain("Group by");
  expect(screen.getByRole("button", { name: /^Sort by, currently/ }).textContent).not.toContain("Sort by");
  expect(screen.queryByRole("button", { name: "Save search" })).toBeNull();
  openSaved();
  expect(screen.getByLabelText("Saved searches", { selector: "div:not([role])" }).style.position).toBe("absolute");
  expect(screen.getByText("No saved searches yet.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Save search" })).toBeTruthy();
});

// Button labels are switched from the ⋯ menu at the end of the toolbar.
const toggleLabels = () => {
  fireEvent.click(screen.getByRole("button", { name: "More options" }));
  fireEvent.click(screen.getByRole("button", { name: "Show button labels" }));
};

it("hides and shows the chips' text from the ⋯ menu, remembered on the device", async () => {
  const view = show();
  expect(screen.queryByRole("button", { name: "Show button labels" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "More options" }));
  expect(screen.getByRole("button", { name: "Show button labels" }).getAttribute("aria-selected")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Show button labels" }));
  expect(screen.queryByRole("button", { name: "Show button labels" })).toBeNull();
  await waitFor(() => expect(screen.getByRole("button", { name: /^Sort by, currently/ }).textContent).not.toContain("Sort"));
  expect(screen.getByRole("button", { name: /^Group by, currently/ }).textContent).not.toContain("Group");
  view.unmount(); show();
  fireEvent.click(screen.getByRole("button", { name: "More options" }));
  expect(screen.getByRole("button", { name: "Show button labels" }).getAttribute("aria-selected")).toBe("false");
  fireEvent.click(screen.getByRole("button", { name: "Show button labels" }));
  await waitFor(() => expect(screen.getByRole("button", { name: /^Sort by, currently/ }).textContent).toContain("Sort"));
});

it("reorders the toolbar chips by dragging one onto another, remembered on the device", async () => {
  const view = show();
  const chipIds = () => [...document.querySelectorAll('[data-testid^="toolbar-chip-"]')].map((element) => element.getAttribute("data-testid")!.replace("toolbar-chip-", ""));
  expect(chipIds()).toEqual(["search", "filters", "saved", "view", "group", "sort"]);
  const chip = (id: string) => screen.getByTestId(`toolbar-chip-${id}`);
  // Drop Sort on the left half of Search: it moves to the front.
  const source = chip("sort");
  fireEvent.dragStart(source);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  const target = chip("search");
  vi.spyOn(target, "getBoundingClientRect").mockReturnValue({ top: 0, height: 28, left: 0, width: 100 } as DOMRect);
  for (const make of [createEvent.dragOver, createEvent.drop]) {
    const event = make(target);
    Object.defineProperty(event, "clientX", { value: 10 });
    Object.defineProperty(event, "clientY", { value: 10 });
    fireEvent(target, event);
  }
  fireEvent.dragEnd(source);
  await waitFor(() => expect(chipIds()).toEqual(["sort", "search", "filters", "saved", "view", "group"]));
  view.unmount(); show();
  expect(chipIds()).toEqual(["sort", "search", "filters", "saved", "view", "group"]);
});

it("goes back and forward through opened workspaces like a browser", () => {
  const openWorkspace = vi.fn();
  const ref = (id: string) => ({ kind: "workspace" as const, hostId: "local", id, key: workspaceKey("local", id) });
  const sidebar = (id: string) => <OrganizerSidebar theme={theme} layout={{ compact: true, platform: "web" }} active={{ workspace: ref(id), agent: null } as any}
    navigation={{ openWorkspace, openAgent: vi.fn(), openTerminal: vi.fn(), openProject: vi.fn() }} dismiss={vi.fn()} index={makeIndex()} />;
  const view = render(sidebar("sidebar"));
  expect(screen.getByRole("button", { name: "Back" }).getAttribute("aria-disabled")).toBe("true");
  view.rerender(sidebar("search"));
  view.rerender(sidebar("mobile"));
  fireEvent.click(screen.getByRole("button", { name: "Back to Search by GitHub references" }));
  expect(openWorkspace).toHaveBeenLastCalledWith(expect.objectContaining({ id: "search" }));
  // Paseo opens it; arriving there moves through the history instead of adding to it.
  view.rerender(sidebar("search"));
  expect(screen.getByRole("button", { name: "Forward to Polish compact sidebar layout" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Back to Restructure workspace navigation" }));
  expect(openWorkspace).toHaveBeenLastCalledWith(expect.objectContaining({ id: "sidebar" }));
  view.rerender(sidebar("sidebar"));
  // Opening something else drops what was ahead.
  view.rerender(sidebar("notes"));
  expect(screen.getByRole("button", { name: "Forward" }).getAttribute("aria-disabled")).toBe("true");
  expect(screen.getByRole("button", { name: "Back to Restructure workspace navigation" })).toBeTruthy();
});

it("names icon-only chips and buttons after resting on them for half a second", async () => {
  show();
  // With text shown, chips need no hint.
  vi.useFakeTimers();
  const sort = () => screen.getByRole("button", { name: /^Sort by, currently/ });
  fireEvent.pointerEnter(sort(), { pointerType: "mouse" });
  act(() => { vi.advanceTimersByTime(600); });
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.pointerLeave(sort(), { pointerType: "mouse" });
  vi.useRealTimers();
  toggleLabels();
  await waitFor(() => expect(sort().textContent).not.toContain("Sort"));
  vi.useFakeTimers();
  fireEvent.pointerEnter(sort(), { pointerType: "mouse" });
  act(() => { vi.advanceTimersByTime(HINT_DELAY_MS - 50); });
  expect(screen.queryByRole("tooltip")).toBeNull();
  act(() => { vi.advanceTimersByTime(50); });
  expect(screen.getByRole("tooltip").textContent).toBe("Sort");
  fireEvent.pointerLeave(sort(), { pointerType: "mouse" });
  expect(screen.queryByRole("tooltip")).toBeNull();
  // Icon buttons always name what they do.
  fireEvent.pointerEnter(screen.getByRole("button", { name: "Collapse all groups" }), { pointerType: "mouse" });
  act(() => { vi.advanceTimersByTime(HINT_DELAY_MS); });
  expect(screen.getByRole("tooltip").textContent).toBe("Collapse all groups");
  vi.useRealTimers();
});

it("labels the clear chip \"Clear\" while chip text is shown, and leaves just its ✕ when hidden", async () => {
  show();
  openFilterTab("Status");
  fireEvent.click(screen.getByRole("checkbox", { name: "Filter status Running" }));
  expect(screen.getByRole("button", { name: "Clear search" }).textContent).toContain("Clear");
  toggleLabels();
  await waitFor(() => expect(screen.getByRole("button", { name: "Clear search" }).textContent).not.toContain("Clear"));
});

it("archives a workspace from its row once confirmed, and brings the row back if archiving fails", async () => {
  show();
  const archiveFrom = (title: string) => {
    fireEvent.pointerEnter(rowOf(title), { pointerType: "mouse" });
    fireEvent.click(screen.getByRole("button", { name: "Archive workspace" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm archive" }));
  };
  archiveFrom("Explore next ideas");
  await waitFor(() => expect(screen.queryByText("Explore next ideas")).toBeNull());
  expect(archiveCalls).toEqual(["notes"]);
  failArchives("Host said no");
  archiveFrom("Polish compact sidebar layout");
  await waitFor(() => expect(archiveCalls).toEqual(["notes", "mobile"]));
  // The row comes back.
  await waitFor(() => expect(screen.getByText("Polish compact sidebar layout")).toBeTruthy());
});

it("goes back to the workspace you left from a screen like New workspace (⌘N)", () => {
  const openWorkspace = vi.fn();
  const ref = (id: string) => ({ kind: "workspace" as const, hostId: "local", id, key: workspaceKey("local", id) });
  const sidebar = (id: string | null) => <OrganizerSidebar theme={theme} layout={{ compact: true, platform: "web" }}
    active={{ workspace: id ? ref(id) : null, agent: null } as any}
    navigation={{ openWorkspace, openAgent: vi.fn(), openTerminal: vi.fn(), openProject: vi.fn() }} dismiss={vi.fn()} index={makeIndex()} />;
  const view = render(sidebar("search"));
  // Only one workspace opened so far: nowhere to go back to while it is open.
  expect(screen.getByRole("button", { name: "Back" }).getAttribute("aria-disabled")).toBe("true");
  view.rerender(sidebar(null));
  fireEvent.click(screen.getByRole("button", { name: "Back to Search by GitHub references" }));
  expect(openWorkspace).toHaveBeenLastCalledWith(expect.objectContaining({ id: "search" }));
  // Arriving back there adds nothing; Back is disabled again.
  view.rerender(sidebar("search"));
  expect(screen.getByRole("button", { name: "Back" }).getAttribute("aria-disabled")).toBe("true");
});

it("goes back and forward with ⌘← / ⌘→ like Chrome (not while typing) and with the mouse's side buttons (always)", () => {
  const openWorkspace = vi.fn();
  const ref = (id: string) => ({ kind: "workspace" as const, hostId: "local", id, key: workspaceKey("local", id) });
  const sidebar = (id: string) => <OrganizerSidebar theme={theme} layout={{ compact: true, platform: "web" }} active={{ workspace: ref(id), agent: null } as any}
    navigation={{ openWorkspace, openAgent: vi.fn(), openTerminal: vi.fn(), openProject: vi.fn() }} dismiss={vi.fn()} index={makeIndex()} />;
  const platform = vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
  const view = render(sidebar("search"));
  view.rerender(sidebar("mobile"));
  const textbox = document.body.appendChild(document.createElement("textarea"));
  // In a text field, ⌘← moves the caret, as in Chrome.
  fireEvent.keyDown(textbox, { key: "ArrowLeft", metaKey: true });
  expect(openWorkspace).not.toHaveBeenCalled();
  // Anywhere else it goes back.
  fireEvent.keyDown(document.body, { key: "ArrowLeft", metaKey: true });
  expect(openWorkspace).toHaveBeenLastCalledWith(expect.objectContaining({ id: "search" }));
  view.rerender(sidebar("search"));
  // Other modifiers are left alone.
  fireEvent.keyDown(document.body, { key: "ArrowRight", metaKey: true, shiftKey: true });
  expect(openWorkspace).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(document.body, { key: "ArrowRight", metaKey: true });
  expect(openWorkspace).toHaveBeenLastCalledWith(expect.objectContaining({ id: "mobile" }));
  view.rerender(sidebar("mobile"));
  // The mouse's back button works even while typing.
  fireEvent.mouseUp(textbox, { button: 3 });
  expect(openWorkspace).toHaveBeenLastCalledWith(expect.objectContaining({ id: "search" }));
  view.rerender(sidebar("search"));
  fireEvent.mouseUp(textbox, { button: 4 });
  expect(openWorkspace).toHaveBeenLastCalledWith(expect.objectContaining({ id: "mobile" }));
  expect(openWorkspace).toHaveBeenCalledTimes(4);
  textbox.remove();
  platform.mockRestore();
});

it("goes back and forward with ⌘[ / ⌘] even while typing, once Paseo's own binding for them is cleared", () => {
  const openWorkspace = vi.fn();
  const ref = (id: string) => ({ kind: "workspace" as const, hostId: "local", id, key: workspaceKey("local", id) });
  const sidebar = (id: string) => <OrganizerSidebar theme={theme} layout={{ compact: true, platform: "web" }} active={{ workspace: ref(id), agent: null } as any}
    navigation={{ openWorkspace, openAgent: vi.fn(), openTerminal: vi.fn(), openProject: vi.fn() }} dismiss={vi.fn()} index={makeIndex()} />;
  const platform = vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
  const view = render(sidebar("search"));
  view.rerender(sidebar("mobile"));
  const textbox = document.body.appendChild(document.createElement("textarea"));
  // While Paseo still binds ⌘[ to Previous workspace, it handles the key first and the sidebar leaves it alone.
  const handled = createEvent.keyDown(textbox, { key: "[", code: "BracketLeft", metaKey: true });
  handled.preventDefault();
  fireEvent(textbox, handled);
  expect(openWorkspace).not.toHaveBeenCalled();
  // Cleared in Paseo's shortcut settings, ⌘[ goes back, even from a text field (mouse buttons can send it).
  fireEvent.keyDown(textbox, { key: "[", code: "BracketLeft", metaKey: true });
  expect(openWorkspace).toHaveBeenLastCalledWith(expect.objectContaining({ id: "search" }));
  view.rerender(sidebar("search"));
  // ⌘⇧] is Paseo's next tab, not forward.
  fireEvent.keyDown(document.body, { key: "}", code: "BracketRight", metaKey: true, shiftKey: true });
  expect(openWorkspace).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(document.body, { key: "]", code: "BracketRight", metaKey: true });
  expect(openWorkspace).toHaveBeenLastCalledWith(expect.objectContaining({ id: "mobile" }));
  expect(openWorkspace).toHaveBeenCalledTimes(2);
  // In a code editor, ⌘[ outdents.
  const editor = document.body.appendChild(document.createElement("div"));
  editor.className = "cm-editor";
  const line = editor.appendChild(document.createElement("div"));
  fireEvent.keyDown(line, { key: "[", code: "BracketLeft", metaKey: true });
  expect(openWorkspace).toHaveBeenCalledTimes(2);
  editor.remove();
  textbox.remove();
  platform.mockRestore();
});
