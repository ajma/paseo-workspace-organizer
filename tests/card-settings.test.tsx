import { beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CardSettingsScreen } from "../client/card-settings";
import { OrganizerSidebar } from "../client/sidebar";
import { getDocument, makeIndex, openedLinks, resetHost, theme } from "../preview/host";

beforeEach(resetHost);
const settings = () => render(<CardSettingsScreen theme={theme} layout={{ compact: false, platform: "web" }} />);
const checked = (role: "radio" | "checkbox", name: string) => screen.getByRole(role, { name }).getAttribute("aria-checked");

it("switches style, edits Custom from the fields on screen, and updates the preview", async () => {
  settings();
  expect(checked("radio", "View Custom")).toBe("true");
  expect(screen.queryByLabelText("Subtasks")).toBeNull();
  fireEvent.click(screen.getByRole("radio", { name: "View Full" }));
  await waitFor(() => expect(checked("radio", "View Full")).toBe("true"));
  expect(checked("checkbox", "Subtask summary")).toBe("true");
  expect(screen.getByLabelText("Subtasks").textContent).toBe("2 running, 1 done");
  fireEvent.click(screen.getByRole("checkbox", { name: "Model" }));
  await waitFor(() => expect(checked("radio", "View Custom")).toBe("true"));
  expect(checked("checkbox", "Subtask summary")).toBe("true");
  expect(checked("checkbox", "Model")).toBe("false");
  expect(getDocument("cards").custom.fields).not.toContain("model");
});

it("saves labels shown, title lines per device, phone mode, and resets only row settings", async () => {
  settings();
  fireEvent.click(screen.getByRole("radio", { name: "Labels shown 1" }));
  fireEvent.click(screen.getByRole("radio", { name: "Title lines All" }));
  await waitFor(() => expect(getDocument("cards").custom.labelLimit).toBe("1"));
  await waitFor(() => expect(getDocument("preferences").titleLines).toBe("all"));
  fireEvent.click(screen.getByRole("switch", { name: "Use the Simple view on phones" }));
  await waitFor(() => expect(getDocument("cards").minimalOnPhones).toBe(true));
  fireEvent.click(screen.getByRole("button", { name: "Reset rows" }));
  expect(screen.getByText("Are you sure?")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Cancel reset" }));
  expect(screen.queryByText("Are you sure?")).toBeNull();
  expect(getDocument("cards").minimalOnPhones).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Reset rows" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm reset" }));
  await waitFor(() => expect(getDocument("cards")).toEqual({ mode: "custom", custom: { fields: expect.any(Array), labelLimit: "3" }, minimalOnPhones: false }));
  await waitFor(() => expect(getDocument("preferences").titleLines).toBe("2"));
  expect(getDocument("preferences").collapsed).toEqual([]);
});

it("draws sidebar cards from the saved settings and minimal cards on phones when asked", async () => {
  settings().unmount();
  const sidebar = (compact: boolean) => render(<OrganizerSidebar theme={theme} layout={{ compact, platform: "web" }} index={makeIndex()}
    active={{ workspace: null, agent: null }} navigation={{ openWorkspace: vi.fn(), openAgent: vi.fn(), openTerminal: vi.fn(), openProject: vi.fn() }} dismiss={vi.fn()} />);
  const view = sidebar(false);
  expect(screen.getByText(/Custom groups and a calmer workspace list/)).toBeTruthy();
  view.unmount();
  settings();
  fireEvent.click(screen.getByRole("switch", { name: "Use the Simple view on phones" }));
  await waitFor(() => expect(getDocument("cards").minimalOnPhones).toBe(true));
  cleanup();
  sidebar(true);
  expect(screen.queryByText(/Custom groups and a calmer workspace list/)).toBeNull();
});

it("opens the plugin's settings from the ⋯ menu", () => {
  const openCardSettings = vi.fn();
  render(<OrganizerSidebar theme={theme} layout={{ compact: false, platform: "web" }} index={makeIndex()} openCardSettings={openCardSettings}
    active={{ workspace: null, agent: null }} navigation={{ openWorkspace: vi.fn(), openAgent: vi.fn(), openTerminal: vi.fn(), openProject: vi.fn() }} dismiss={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "View, currently Custom" }));
  expect(screen.queryByRole("button", { name: "Row settings" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "More options" }));
  fireEvent.click(screen.getByRole("button", { name: "Plugin settings" }));
  expect(openCardSettings).toHaveBeenCalled();
});

it("switches Simple, Full and Custom from the View dropdown and keeps Custom", async () => {
  const sidebar = render(<OrganizerSidebar theme={theme} layout={{ compact: false, platform: "web" }} index={makeIndex()}
    active={{ workspace: null, agent: null }} navigation={{ openWorkspace: vi.fn(), openAgent: vi.fn(), openTerminal: vi.fn(), openProject: vi.fn() }} dismiss={vi.fn()} />);
  expect(screen.queryByRole("radio", { name: "View Custom" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "View, currently Custom" }));
  expect(screen.getByRole("button", { name: "View Custom" }).getAttribute("aria-selected")).toBe("true");
  expect(screen.getByText(/Custom groups and a calmer workspace list/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "View Simple" }));
  await waitFor(() => expect(screen.queryByText(/Custom groups and a calmer workspace list/)).toBeNull());
  expect(getDocument("cards").mode).toBe("simple");
  fireEvent.click(screen.getByRole("button", { name: "View, currently Simple" }));
  fireEvent.click(screen.getByRole("button", { name: "View Custom" }));
  await waitFor(() => expect(screen.getByText(/Custom groups and a calmer workspace list/)).toBeTruthy());
  sidebar.unmount();
});

it("keeps group headers at the top while scrolling unless turned off in settings", async () => {
  const header = () => screen.getByRole("button", { name: "Collapse In progress" }).parentElement!.parentElement as HTMLElement;
  const sidebar = () => render(<OrganizerSidebar theme={theme} layout={{ compact: false, platform: "web" }} index={makeIndex()}
    active={{ workspace: null, agent: null }} navigation={{ openWorkspace: vi.fn(), openAgent: vi.fn(), openTerminal: vi.fn(), openProject: vi.fn() }} dismiss={vi.fn()} />);
  let view = sidebar();
  expect(header().style.position).toBe("sticky");
  // Subgroups pin just below their parent's header.
  expect((screen.getByRole("button", { name: "Collapse Interface" }).parentElement!.parentElement as HTMLElement).style.top).toBe("42px");
  view.unmount();
  const settings = render(<CardSettingsScreen theme={theme} layout={{ compact: false, platform: "web" }} />);
  fireEvent.click(screen.getByRole("switch", { name: "Sticky group headers" }));
  await waitFor(() => expect(getDocument("preferences").stickyHeaders).toBe(false));
  settings.unmount();
  view = sidebar();
  expect(header().style.position).not.toBe("sticky");
  view.unmount();
});

it("opens links in a Paseo browser tab in the desktop app unless turned off in settings", async () => {
  const userAgent = vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 Paseo Electron/39.0.0");
  openedLinks.length = 0;
  const openInBrowser = vi.fn();
  const sidebar = () => render(<OrganizerSidebar theme={theme} layout={{ compact: false, platform: "web" }} index={makeIndex()} openInBrowser={openInBrowser}
    active={{ workspace: null, agent: null }} navigation={{ openWorkspace: vi.fn(), openAgent: vi.fn(), openTerminal: vi.fn(), openProject: vi.fn() }} dismiss={vi.fn()} />);
  const openPr = () => fireEvent.click(screen.getByRole("link", { name: "Open PR getpaseo/paseo#412" }));
  let view = sidebar();
  openPr();
  expect(openInBrowser).toHaveBeenCalledWith("https://github.com/getpaseo/paseo/pull/412", expect.objectContaining({ id: "sidebar" }));
  expect(openedLinks).toEqual([]);
  view.unmount();
  const screenView = settings();
  expect((screen.getByRole("switch", { name: "Open links in Paseo browser tabs" }) as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole("switch", { name: "Open links in Paseo browser tabs" }));
  await waitFor(() => expect(getDocument("preferences").linksInPaseo).toBe(false));
  screenView.unmount();
  openInBrowser.mockClear();
  view = sidebar();
  openPr();
  expect(openInBrowser).not.toHaveBeenCalled();
  expect(openedLinks).toEqual(["https://github.com/getpaseo/paseo/pull/412"]);
  view.unmount();
  userAgent.mockRestore();
});

it("chooses whether a colored group tints just its header or its whole group, on this device", async () => {
  const view = settings();
  expect(screen.getByRole("radio", { name: "Group colors Header and workspaces" }).getAttribute("aria-checked")).toBe("true");
  fireEvent.click(screen.getByRole("radio", { name: "Group colors Header" }));
  await waitFor(() => expect(getDocument("preferences").groupColorFill).toBe("header"));
  view.unmount();
});
