import { expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Text } from "react-native";
import { WorkspaceCardView, displayPath } from "../client/card";
import { sampleCard } from "../client/card-sample";
import { cardFields, cardPresets, type CardField } from "../shared/cards";
import { theme } from "../preview/host";
import { WORKING_GLOW } from "../client/motion";
import { linkLook } from "../client/card-fields";

const draw = (fields: readonly CardField[], extra: Partial<Parameters<typeof WorkspaceCardView>[0]> = {}) =>
  render(<WorkspaceCardView theme={theme} model={sampleCard(Date.now())} fields={new Set(fields)} labelLimit="all" titleLines="2"
    projectIcon={<Text>ICON</Text>} {...extra} />);

it("draws every field of the Full card", () => {
  const onOpenLink = vi.fn();
  draw(cardFields, { onOpenLink });
  expect(screen.getByText("better-paseo › tasks-board")).toBeTruthy();
  expect(screen.getByText("ICON")).toBeTruthy();
  expect(screen.getByLabelText("Agent").textContent).toBe("GPT-5.5 CodexMedium");
  expect(screen.getByLabelText("Branch").textContent).toBe("feat/tasks-board↑3↓0");
  expect(screen.getByLabelText("Uncommitted changes")).toBeTruthy();
  expect(screen.getByLabelText("Folder").textContent).toBe("~/code/better-paseo/.worktrees/tasks-board");
  expect(screen.getAllByLabelText(/^Label /).map((chip) => chip.textContent)).toEqual(["frontend", "p1", "board"]);
  expect(screen.getByLabelText("Subtasks").textContent).toBe("2 running, 1 done");
  expect(screen.getByLabelText("PR 42").textContent).toBe("42passed");
  expect(screen.getByText("Match the desktop ring, then hand off to review.")).toBeTruthy();
  expect(screen.getByLabelText(/^Running for 12m 3\ds$/)).toBeTruthy();
  expect(screen.getByLabelText("Last activity now")).toBeTruthy();
  fireEvent.click(screen.getByRole("link", { name: "Open PR example/better-paseo#42" }));
  expect(onOpenLink).toHaveBeenCalledWith("https://github.com/example/better-paseo/pull/42");
});

it("draws only the Simple fields: project, one label, links and last activity", () => {
  draw(cardPresets.simple.fields, { labelLimit: "1" });
  expect(screen.getByText("better-paseo")).toBeTruthy();
  expect(screen.queryByLabelText("Branch")).toBeNull();
  expect(screen.queryByLabelText("Agent")).toBeNull();
  expect(screen.queryByLabelText("Folder")).toBeNull();
  expect(screen.queryByLabelText(/^Subtasks/)).toBeNull();
  expect(screen.queryByLabelText(/^Running for/)).toBeNull();
  expect(screen.getAllByLabelText(/^Label /).map((chip) => chip.textContent)).toEqual(["frontend"]);
  expect(screen.getByLabelText("2 more labels")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Open PR example/better-paseo#42" })).toBeTruthy();
  expect(screen.getByLabelText("Last activity now")).toBeTruthy();
});

it("limits labels, shortens folders and caps title lines", () => {
  draw(["labels", "folder"], { labelLimit: "2", titleLines: "1" });
  expect(screen.getAllByLabelText(/^Label /).map((chip) => chip.textContent)).toEqual(["frontend", "p1"]);
  expect(screen.getByLabelText("1 more labels").textContent).toBe("+1");
  expect(screen.getByLabelText("Folder").textContent).toBe("tasks-board");
  expect(displayPath("/home/sam/work/app/", true)).toBe("~/work/app/");
  expect(displayPath("/srv/app", true)).toBe("/srv/app");
});

it("shows the provider name when only the brand mark is on", () => {
  draw(["agentBrand"]);
  expect(screen.getByLabelText("Agent").textContent).toBe("Codex");
});

it("draws each field in its own color", () => {
  draw(cardFields);
  const colorOf = (label: string) => getComputedStyle(screen.getByLabelText(label).querySelector("div[dir]")!).color;
  const colors = ["Agent", "Branch", "Folder"].map(colorOf);
  expect(new Set(colors).size).toBe(3);
  // sky in Paseo's dark-theme palette
  expect(colorOf("Branch")).toBe("rgb(106, 166, 206)");
});

it("opens the workspace from anywhere on the card except links and buttons inside it", () => {
  const onOpen = vi.fn(), onOpenLink = vi.fn();
  render(<WorkspaceCardView theme={theme} model={sampleCard(Date.now())} fields={new Set(cardFields)} labelLimit="2" titleLines="2"
    onOpen={onOpen} onOpenLink={onOpenLink} />);
  for (const target of [screen.getByLabelText("Branch"), screen.getByLabelText("Agent"), screen.getByLabelText("Folder"),
    screen.getByLabelText("Label p1"), screen.getByLabelText("1 more labels"), screen.getByText("Match the desktop ring, then hand off to review."),
    screen.getByText("better-paseo › tasks-board")]) {
    fireEvent.click(target);
  }
  expect(onOpen).toHaveBeenCalledTimes(7);
  fireEvent.click(screen.getByRole("link", { name: "Open PR example/better-paseo#42" }));
  expect(onOpenLink).toHaveBeenCalledTimes(1);
  expect(onOpen).toHaveBeenCalledTimes(7);
});

it("shows the host beside a server icon after the project", () => {
  render(<WorkspaceCardView theme={theme} model={{ ...sampleCard(Date.now()), hostLabel: "Mini" }} fields={new Set(cardFields)} labelLimit="all" titleLines="2" />);
  expect(screen.getByLabelText("Host Mini").textContent).toBe("Mini");
  expect(screen.getByText("better-paseo › tasks-board")).toBeTruthy();
});

it("shows archive and ⋯ while the pointer is on the card; archive asks for a second press; the menu runs actions", () => {
  const actions = { onArchive: vi.fn(), onEdit: vi.fn(), onRename: vi.fn(), onCopyPath: vi.fn(), onCopyBranch: vi.fn(), onTogglePin: vi.fn(), pinned: false };
  const onOpen = vi.fn();
  render(<WorkspaceCardView theme={theme} model={sampleCard(Date.now())} fields={new Set(cardFields)} labelLimit="all" titleLines="2" onOpen={onOpen} actions={actions} />);
  const card = screen.getByLabelText("Branch").closest('[data-testid="workspace-row"]') as HTMLElement;
  expect(screen.queryByRole("button", { name: "Archive workspace" })).toBeNull();
  fireEvent.pointerEnter(card, { pointerType: "mouse" });
  fireEvent.click(screen.getByRole("button", { name: "Archive workspace" }));
  expect(actions.onArchive).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm archive" }));
  expect(actions.onArchive).toHaveBeenCalledTimes(1);
  expect(onOpen).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Workspace actions" }));
  expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Edit details", "Rename…", "Copy path", "Copy branch name", "Pin to top", "Archive…"]);
  fireEvent.click(screen.getByRole("menuitem", { name: "Copy branch name" }));
  expect(actions.onCopyBranch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Workspace actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Rename…" }));
  expect(actions.onRename).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("menu")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Workspace actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Pin to top" }));
  expect(actions.onTogglePin).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Workspace actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Archive…" }));
  expect(screen.getByRole("button", { name: "Confirm archive" })).toBeTruthy();
  // A pending confirmation stays visible after the pointer leaves so it can still be confirmed.
  fireEvent.pointerLeave(card, { pointerType: "mouse" });
  expect(screen.getByRole("button", { name: "Confirm archive" })).toBeTruthy();
  expect(onOpen).not.toHaveBeenCalled();
});

it("confirms archiving with a red Archive button beside Cancel, which backs out", () => {
  const actions = { onArchive: vi.fn(), pinned: false };
  render(<WorkspaceCardView theme={theme} model={sampleCard(Date.now())} fields={new Set(cardFields)} labelLimit="all" titleLines="2" onOpen={vi.fn()} actions={actions} />);
  fireEvent.pointerEnter(screen.getByLabelText("Branch").closest('[data-testid="workspace-row"]') as HTMLElement, { pointerType: "mouse" });
  fireEvent.click(screen.getByRole("button", { name: "Archive workspace" }));
  expect(screen.getByRole("button", { name: "Confirm archive" }).textContent).toBe("Archive");
  expect(screen.getByRole("button", { name: "Cancel archive" }).textContent).toBe("Cancel");
  // While confirming, ⋯ steps aside so the two choices have room.
  expect(screen.queryByRole("button", { name: "Workspace actions" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Cancel archive" }));
  expect(screen.queryByRole("button", { name: "Confirm archive" })).toBeNull();
  expect(screen.getByRole("button", { name: "Archive workspace" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Archive workspace" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm archive" }));
  expect(actions.onArchive).toHaveBeenCalledTimes(1);
});

it("hides the buttons when the pointer leaves, and shows none without actions", () => {
  vi.useFakeTimers();
  const view = render(<WorkspaceCardView theme={theme} model={sampleCard(Date.now())} fields={new Set(cardFields)} labelLimit="all" titleLines="2"
    actions={{ onArchive: vi.fn(), pinned: true, onTogglePin: vi.fn() }} />);
  const card = screen.getByLabelText("Branch").closest('[data-testid="workspace-row"]') as HTMLElement;
  fireEvent.pointerEnter(card, { pointerType: "mouse" });
  fireEvent.click(screen.getByRole("button", { name: "Workspace actions" }));
  expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Unpin", "Archive…"]);
  fireEvent.pointerLeave(card, { pointerType: "mouse" });
  // A short grace period lets the pointer move between the card's parts without the buttons flickering.
  act(() => { vi.advanceTimersByTime(200); });
  expect(screen.queryByRole("button", { name: "Workspace actions" })).toBeNull();
  expect(screen.queryByRole("menu")).toBeNull();
  view.unmount();
  draw(cardFields);
  fireEvent.pointerEnter(screen.getByLabelText("Branch").closest('[data-testid="workspace-row"]') as HTMLElement, { pointerType: "mouse" });
  expect(screen.queryByRole("button", { name: "Workspace actions" })).toBeNull();
  vi.useRealTimers();
});

it("keeps the ⋯ menu open while the pointer moves onto it, so an item can be clicked", () => {
  vi.useFakeTimers();
  const actions = { onArchive: vi.fn(), onCopyPath: vi.fn(), pinned: false };
  render(<WorkspaceCardView theme={theme} model={sampleCard(Date.now())} fields={new Set(cardFields)} labelLimit="all" titleLines="2" actions={actions} />);
  const row = screen.getByLabelText("Branch").closest('[data-testid="workspace-row"]') as HTMLElement;
  fireEvent.pointerEnter(row, { pointerType: "mouse" });
  fireEvent.click(screen.getByRole("button", { name: "Workspace actions" }));
  // React Native Web hands hover from the row to the menu item under the pointer.
  fireEvent.pointerLeave(row, { pointerType: "mouse" });
  const item = screen.getByRole("menuitem", { name: "Copy path" });
  fireEvent.pointerEnter(item, { pointerType: "mouse" });
  act(() => { vi.advanceTimersByTime(500); });
  expect(screen.getByRole("menu")).toBeTruthy();
  fireEvent.click(screen.getByRole("menuitem", { name: "Copy path" }));
  expect(actions.onCopyPath).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("menu")).toBeNull();
  vi.useRealTimers();
});

it("shows the host only when the Host field is on, as an icon alone when Paseo's badge is Icon", () => {
  const model = { ...sampleCard(Date.now()), hostLabel: "Mini" };
  const view = render(<WorkspaceCardView theme={theme} model={model} fields={new Set(cardFields)} labelLimit="all" titleLines="2" />);
  expect(screen.getByLabelText("Host Mini").textContent).toBe("Mini");
  view.unmount();
  const off = render(<WorkspaceCardView theme={theme} model={model} fields={new Set(cardFields.filter((field) => field !== "host"))} labelLimit="all" titleLines="2" />);
  expect(screen.queryByLabelText("Host Mini")).toBeNull();
  off.unmount();
  render(<WorkspaceCardView theme={theme} model={{ ...model, hostIconOnly: true }} fields={new Set(cardFields)} labelLimit="all" titleLines="2" />);
  expect(screen.getByLabelText("Host Mini").textContent).toBe("");
});

it("underlines a link while the pointer is on it, so it reads as clickable", () => {
  draw(cardFields, { onOpenLink: vi.fn() });
  const link = screen.getByRole("link", { name: "Open PR example/better-paseo#42" });
  const number = [...link.querySelectorAll("div[dir]")].find((node) => node.textContent === "42") as HTMLElement;
  expect(getComputedStyle(number).textDecorationLine || number.style.textDecorationLine).not.toContain("underline");
  fireEvent.pointerEnter(link, { pointerType: "mouse" });
  expect(getComputedStyle(number).textDecorationLine || number.style.textDecorationLine).toContain("underline");
  fireEvent.pointerLeave(link, { pointerType: "mouse" });
  expect(getComputedStyle(number).textDecorationLine || number.style.textDecorationLine).not.toContain("underline");
});

it("tints the whole row of a working workspace, softly, and no other row", () => {
  const view = draw(cardFields);
  const glow = screen.getByTestId("working-glow");
  expect(glow.closest('[data-testid="workspace-row"]')).toBeTruthy();
  // Clicks pass through it, and it stays faint (jsdom reduces motion, so it holds its resting tint).
  expect(getComputedStyle(glow).pointerEvents).toBe("none");
  expect(Number(glow.style.opacity)).toBeGreaterThan(0);
  // Subtle in light themes (at most a 5% wash), stronger on dark surfaces where the same wash barely shows, and a slow breath.
  expect(WORKING_GLOW.light.high).toBeLessThanOrEqual(0.05);
  expect(WORKING_GLOW.dark.high).toBeGreaterThanOrEqual(2 * WORKING_GLOW.light.high);
  expect(WORKING_GLOW.dark.high).toBeLessThanOrEqual(0.12);
  for (const range of [WORKING_GLOW.light, WORKING_GLOW.dark]) expect(range.low).toBeLessThan(range.high);
  expect(WORKING_GLOW.cycleMs).toBeGreaterThanOrEqual(2500);
  view.unmount();
  render(<WorkspaceCardView theme={theme} model={{ ...sampleCard(Date.now()), indicator: "done", indicatorLabel: "Done" }} fields={new Set(cardFields)}
    labelLimit="all" titleLines="2" projectIcon={<Text>ICON</Text>} />);
  expect(screen.queryByTestId("working-glow")).toBeNull();
});

it("gives PRs and issues one icon per state, shared with Edit details", () => {
  expect((["open", "draft", "merged", "closed", undefined] as const).map((state) => linkLook("pr", state, theme).icon)).toEqual(
    ["git-pull-request", "git-pull-request-draft", "git-merge", "git-pull-request-closed", "git-pull-request"]);
  expect((["open", "closed", undefined] as const).map((state) => linkLook("issue", state, theme).icon)).toEqual(["circle-dot", "circle-check", "circle-dot"]);
  expect(linkLook("pr", "open", theme).color).not.toBe(linkLook("pr", "closed", theme).color);
});

it("shows a running, waiting or failed workspace as a colored bar down the row's left edge, in place of the open row's bar", () => {
  const bar = () => screen.queryByTestId("status-bar") as HTMLElement | null;
  const color = (element: HTMLElement | null) => element && getComputedStyle(element).backgroundColor;
  const cases = [["running", theme.colors.accent], ["needs_input", theme.colors.statusWarning], ["failed", theme.colors.statusDanger]] as const;
  for (const [indicator, expected] of cases) {
    const { unmount } = draw([], { model: { ...sampleCard(Date.now()), indicator } });
    const inner = bar()?.querySelector('[data-testid="status-bar-fill"]') as HTMLElement | null;
    const probe = document.createElement("div"); probe.style.backgroundColor = expected;
    expect(color(inner)).toBe(probe.style.backgroundColor);
    unmount();
  }
  // No bar once it's done; the open row keeps its own, which a status bar replaces.
  const done = draw([], { model: { ...sampleCard(Date.now()), indicator: "done" }, active: true });
  expect(bar()).toBeNull();
  expect(screen.getByTestId("active-marker")).toBeTruthy();
  done.unmount();
  draw([], { model: { ...sampleCard(Date.now()), indicator: "needs_input" }, active: true });
  expect(bar()).toBeTruthy();
  expect(screen.queryByTestId("active-marker")).toBeNull();
});

it("outlines the open workspace in the accent color, whatever its status", () => {
  for (const indicator of ["done", "needs_input", "running"] as const) {
    const { unmount } = draw([], { model: { ...sampleCard(Date.now()), indicator }, active: true });
    const outline = screen.getByTestId("active-outline");
    const probe = document.createElement("div"); probe.style.borderColor = theme.colors.accent;
    expect(getComputedStyle(outline).borderTopColor).toBe(probe.style.borderTopColor);
    unmount();
  }
  draw([], { model: { ...sampleCard(Date.now()), indicator: "done" }, active: false });
  expect(screen.queryByTestId("active-outline")).toBeNull();
});
