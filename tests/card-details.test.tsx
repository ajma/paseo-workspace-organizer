import { expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { WorkspaceCardView } from "../client/card";
import { HOVER_DELAY_MS } from "../client/tooltip";
import { sampleCard } from "../client/card-sample";
import { agentDetail, branchDetail, labelDetail, linkDetail, projectDetail, subtaskDetail, timerDetail } from "../shared/card-details";
import { cardFields, cardPresets } from "../shared/cards";
import { theme } from "../preview/host";

it("writes plain detail for each card part", () => {
  expect(projectDetail({ project: "paseo", projectPath: "/work/paseo", workspaceName: "sidebar", hostLabel: "This Mac" }))
    .toBe("Project paseo\n/work/paseo\nWorkspace sidebar\nOn This Mac");
  expect(agentDetail({ provider: "Codex", model: "GPT-5.5 Codex", modelId: "gpt-5.5", thinking: "Medium", status: "running" }))
    .toBe("Codex · GPT-5.5 Codex (gpt-5.5)\nThinking: Medium\nAgent running");
  expect(branchDetail("feat/x", { dirty: true, ahead: 1, behind: 2 })).toBe("Branch feat/x\nUncommitted changes\n1 commit ahead, 2 behind");
  expect(branchDetail("main", null)).toBe("Branch main");
  expect(labelDetail({ name: "p1", color: "red", source: "label" })).toBe("Paseo label p1 (red)");
  expect(labelDetail({ name: "board", color: null, source: "tag" })).toBe("Organizer tag board");
  expect(linkDetail({ kind: "pr", repository: "a/b", number: 4, status: "Open", hint: "Open · CI passed" })).toBe("Pull request a/b#4\nOpen · CI passed");
  expect(subtaskDetail({ running: 2, done: 1, failed: 0 })).toBe("Subagents: 2 running, 1 done, 0 failed");
  const now = Date.parse("2026-11-17T12:00:00Z");
  expect(timerDetail({ running: true, at: now - 750_000, elapsed: null }, now)).toMatch(/^Run started .+\nRunning for 12m 30s$/);
  expect(timerDetail({ running: false, at: now, elapsed: 60_000 }, now)).toMatch(/^Last run finished .+\nTook 1m 0s$/);
  expect(timerDetail({ running: false, at: null, elapsed: null }, now)).toBeNull();
});

it("opens one details panel with every detail after resting on a field, keeps it open between fields, and still opens on tap", () => {
  vi.useFakeTimers();
  const onOpen = vi.fn();
  // Simple shows few fields, but the bubble lists everything.
  render(<WorkspaceCardView theme={theme} model={sampleCard(Date.now())} fields={new Set(cardPresets.simple.fields)} labelLimit="all" titleLines="2" onOpen={onOpen} />);
  const hover = (element: HTMLElement) => fireEvent.pointerEnter(element.parentElement!, { pointerType: "mouse" });
  const leave = (element: HTMLElement) => fireEvent.pointerLeave(element.parentElement!, { pointerType: "mouse" });
  const label = screen.getByLabelText("Label p1");
  // A quick pass does not open it.
  hover(label);
  act(() => { vi.advanceTimersByTime(HOVER_DELAY_MS - 100); });
  leave(label);
  act(() => { vi.advanceTimersByTime(HOVER_DELAY_MS); });
  expect(screen.queryByLabelText("Workspace details")).toBeNull();
  // Resting does, with every detail, in a panel floating beside the card.
  hover(label);
  act(() => { vi.advanceTimersByTime(HOVER_DELAY_MS); });
  // The card measures its place on screen before the panel appears beside it.
  act(() => { vi.advanceTimersByTime(10); });
  expect(screen.getByRole("tooltip", { name: "Workspace details" }).style.position).toBe("fixed");
  const details = screen.getByLabelText("Workspace details").textContent!;
  // Every field, one per line in the row's icons and colors, with full text.
  for (const text of ["Port the status ring to React Native", "Running since", "better-paseo › tasks-board · ~/code/better-paseo", "GPT-5.5 Codex (gpt-5.5)", "Medium",
    "agent running", "feat/tasks-board", "uncommitted changes", "↑3", "~/code/better-paseo/.worktrees/tasks-board", "example/better-paseo#42 Open", "passed", "approved",
    "2 running, 1 done", "started", "Last active", "frontend", "p1", "board", "Match the desktop ring, then hand off to review."]) expect(details).toContain(text);
  const panel = screen.getByRole("tooltip", { name: "Workspace details" });
  expect(panel.querySelectorAll("svg").length).toBeGreaterThan(5);
  expect(panel.style.fontFamily).not.toBe("");
  expect(panel.querySelector("[style*='grid']")).toBeNull();
  // Moving to another field keeps the one bubble open.
  const link = screen.getByRole("link", { name: "Open PR example/better-paseo#42" });
  leave(label);
  fireEvent.pointerEnter(link, { pointerType: "mouse" });
  act(() => { vi.advanceTimersByTime(200); });
  expect(screen.getAllByLabelText("Workspace details")).toHaveLength(1);
  fireEvent.pointerLeave(link, { pointerType: "mouse" });
  act(() => { vi.advanceTimersByTime(200); });
  expect(screen.queryByLabelText("Workspace details")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Open Port the status ring to React Native, Running" }));
  expect(onOpen).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});

it("lifts the card above the next one while its details are open", () => {
  vi.useFakeTimers();
  render(<WorkspaceCardView theme={theme} model={sampleCard(Date.now())} fields={new Set(cardFields)} labelLimit="all" titleLines="2" onOpen={vi.fn()} />);
  const branch = screen.getByLabelText("Branch");
  const card = branch.closest('[data-testid="workspace-row"]') as HTMLElement;
  expect(card.style.zIndex).toBe("");
  fireEvent.pointerEnter(branch.parentElement!, { pointerType: "mouse" });
  act(() => { vi.advanceTimersByTime(HOVER_DELAY_MS); });
  expect(card.style.zIndex).toBe("1000");
  fireEvent.pointerLeave(branch.parentElement!, { pointerType: "mouse" });
  act(() => { vi.advanceTimersByTime(200); });
  expect(card.style.zIndex).toBe("");
  vi.useRealTimers();
});

it("opens the details when resting anywhere on the row, not only on a field", () => {
  vi.useFakeTimers();
  render(<WorkspaceCardView theme={theme} model={sampleCard(Date.now())} fields={new Set(cardFields)} labelLimit="all" titleLines="2" onOpen={vi.fn()} />);
  const row = screen.getByLabelText("Branch").closest('[data-testid="workspace-row"]') as HTMLElement;
  fireEvent.pointerEnter(row, { pointerType: "mouse" });
  act(() => { vi.advanceTimersByTime(HOVER_DELAY_MS); });
  act(() => { vi.advanceTimersByTime(10); });
  expect(screen.getByRole("tooltip", { name: "Workspace details" })).toBeTruthy();
  fireEvent.pointerLeave(row, { pointerType: "mouse" });
  act(() => { vi.advanceTimersByTime(200); });
  expect(screen.queryByRole("tooltip", { name: "Workspace details" })).toBeNull();
  vi.useRealTimers();
});

it("keeps the details open while the pointer moves onto them, and opens their links", () => {
  vi.useFakeTimers();
  const onOpenLink = vi.fn();
  render(<WorkspaceCardView theme={theme} model={sampleCard(Date.now())} fields={new Set(cardPresets.simple.fields)} labelLimit="all" titleLines="2"
    onOpen={vi.fn()} onOpenLink={onOpenLink} />);
  const row = screen.getByLabelText("Label p1").closest('[data-testid="workspace-row"]') as HTMLElement;
  fireEvent.pointerEnter(row, { pointerType: "mouse" });
  act(() => { vi.advanceTimersByTime(HOVER_DELAY_MS); });
  act(() => { vi.advanceTimersByTime(10); });
  const panel = screen.getByRole("tooltip", { name: "Workspace details" });
  expect(panel.style.pointerEvents).toBe("auto");
  // Leaving the row for the panel keeps it open, however long the pointer rests there.
  fireEvent.pointerLeave(row, { pointerType: "mouse" });
  act(() => { vi.advanceTimersByTime(50); });
  fireEvent.pointerEnter(panel, { pointerType: "mouse" });
  act(() => { vi.advanceTimersByTime(2000); });
  expect(screen.getByRole("tooltip", { name: "Workspace details" })).toBe(panel);
  const link = within(panel).getByRole("link", { name: "Open PR example/better-paseo#42" });
  fireEvent.click(link);
  expect(onOpenLink).toHaveBeenCalledWith("https://github.com/example/better-paseo/pull/42");
  // Leaving the panel closes it.
  fireEvent.pointerLeave(panel, { pointerType: "mouse" });
  act(() => { vi.advanceTimersByTime(200); });
  expect(screen.queryByRole("tooltip", { name: "Workspace details" })).toBeNull();
  vi.useRealTimers();
});
