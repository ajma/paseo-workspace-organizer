import { afterEach, expect, it, vi } from "vitest";
import { detailExtras, fieldItems } from "../client/card-fields";
import { sampleCard } from "../client/card-sample";
import { showFloatingPanel } from "../client/web";
import { theme } from "../preview/host";
import { act, render, screen } from "@testing-library/react";
import { AccessibilityInfo, Animated, Text } from "react-native";
import { WorkspaceCardView } from "../client/card";
import { cardFields } from "../shared/cards";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(Element.prototype, "animate");
});

function controlRowVisibility() {
  const listeners = new Map<Element, IntersectionObserverCallback>();
  const observer = vi.fn(function (this: IntersectionObserver, callback: IntersectionObserverCallback) {
    this.observe = (row) => { listeners.set(row, callback); };
    this.unobserve = (row) => { listeners.delete(row); };
    this.disconnect = () => { listeners.clear(); };
  });
  vi.stubGlobal("IntersectionObserver", observer);
  return {
    observer,
    set(row: Element, isIntersecting: boolean) {
      act(() => { listeners.get(row)?.([{ target: row, isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver); });
    },
  };
}

it("starts status animations when a row becomes visible and stops them when the last row leaves view", async () => {
  vi.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
  const loop = vi.spyOn(Animated, "loop");
  const visibility = controlRowVisibility();
  const model = sampleCard(Date.now());
  render(<>
    <WorkspaceCardView theme={theme} model={model} fields={new Set()} labelLimit="all" titleLines="2" observeVisibility />
    <WorkspaceCardView theme={theme} model={model} fields={new Set()} labelLimit="all" titleLines="2" observeVisibility />
  </>);
  const [firstRow, secondRow] = screen.getAllByTestId("workspace-row") as HTMLElement[];
  await act(async () => {});
  expect(loop).not.toHaveBeenCalled();
  expect(visibility.observer).toHaveBeenCalledTimes(1);

  visibility.set(firstRow!, true);
  const started = loop.mock.results.map((result) => result.value as { stop: () => void });
  expect(started).toHaveLength(3);
  const stops = started.map((animation) => vi.spyOn(animation, "stop"));
  visibility.set(secondRow!, false);
  expect(stops.every((stop) => stop.mock.calls.length === 0)).toBe(true);

  visibility.set(firstRow!, false);
  expect(stops.every((stop) => stop.mock.calls.length > 0)).toBe(true);
  const [firstGlow, secondGlow] = screen.getAllByTestId("working-glow");
  expect(Number(firstGlow?.style.opacity)).toBeGreaterThan(0);
  expect(firstGlow?.style.opacity).toBe(secondGlow?.style.opacity);

  visibility.set(secondRow!, true);
  expect(loop).toHaveBeenCalledTimes(6);
});

it("suspends elapsed seconds offscreen and catches up when the row returns", () => {
  vi.useFakeTimers();
  const visibility = controlRowVisibility();
  render(<WorkspaceCardView theme={theme} model={sampleCard(Date.now())} fields={new Set(["timer"])}
    labelLimit="all" titleLines="2" observeVisibility />);
  const row = screen.getByTestId("workspace-row");
  const elapsed = () => screen.getByLabelText(/^Running for/).textContent;
  visibility.set(row, false);
  expect(elapsed()).toBe("12m 30s");
  act(() => { vi.advanceTimersByTime(3000); });
  expect(elapsed()).toBe("12m 30s");

  visibility.set(row, true);
  expect(elapsed()).toBe("12m 33s");
  act(() => { vi.advanceTimersByTime(1000); });
  expect(elapsed()).toBe("12m 34s");
  visibility.set(row, false);
  act(() => { vi.advanceTimersByTime(2000); });
  expect(elapsed()).toBe("12m 34s");
});

it("marks running things to spin: pending CI checks and a running workspace's status", () => {
  const card = sampleCard(Date.now());
  const pending = { ...card, links: [{ ...card.links[0]!, checks: "pending" as const }] };
  const ci = fieldItems(pending, theme, { fields: null, full: false, now: Date.now() }).find((item) => item.label === "PR 42")!;
  expect(ci.pieces.find((piece) => piece.text === "running")).toMatchObject({ icon: "loader-circle", spin: true });
  const passed = fieldItems(card, theme, { fields: null, full: false, now: Date.now() }).find((item) => item.label === "PR 42")!;
  expect(passed.pieces.some((piece) => piece.spin)).toBe(false);
  expect(detailExtras(card, theme).status).toMatchObject({ icon: "loader-circle", spin: true });
  expect(detailExtras({ ...card, indicator: "done", indicatorLabel: "Done" }, theme).status).toMatchObject({ icon: "circle-dot", spin: false });
});

function panelWithSpinner() {
  return showFloatingPanel({ anchor: { x: 0, y: 0, width: 100, height: 20 }, title: "Run", notes: null, labels: [],
    lines: [{ pieces: [{ icon: "loader-circle", text: "Running", color: "red", spin: true }] }, { pieces: [{ icon: "clock", text: "Last active", color: "blue" }] }],
    colors: { background: "#fff", border: "#ccc", foreground: "#000", muted: "#666" }, fontSize: { title: 14, body: 12 } });
}

it("turns the panel's running icon, and only that icon", () => {
  const animate = vi.fn();
  Object.defineProperty(Element.prototype, "animate", { value: animate, configurable: true });
  const remove = panelWithSpinner();
  expect(animate).toHaveBeenCalledTimes(1);
  expect(animate.mock.calls[0]![1]).toMatchObject({ iterations: Infinity });
  remove();
});

it("keeps the panel still when the system asks for reduced motion", () => {
  const animate = vi.fn();
  Object.defineProperty(Element.prototype, "animate", { value: animate, configurable: true });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));
  const remove = panelWithSpinner();
  expect(animate).not.toHaveBeenCalled();
  remove();
});

it("moves every working row together: one shared loop per animation, started once and stopped with the last row", async () => {
  // Motion on, as on most machines.
  const reduceMotion = vi.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
  const loop = vi.spyOn(Animated, "loop");
  const card = (key: string) => <WorkspaceCardView key={key} theme={theme} model={sampleCard(Date.now())} fields={new Set(cardFields)} labelLimit="all"
    titleLines="2" projectIcon={<Text>ICON</Text>} />;
  const settle = () => act(async () => { await Promise.resolve(); });
  const view = render(<>{card("a")}</>);
  await settle();
  const started = loop.mock.results.map((result) => result.value as { stop: () => void });
  expect(started.length).toBeGreaterThan(0);
  const stops = started.map((animation) => vi.spyOn(animation, "stop"));
  // A second working row joins the first one's glow and pulse rather than starting its own, so they stay in step.
  view.rerender(<>{card("a")}{card("b")}</>);
  await settle();
  expect(screen.getAllByTestId("working-glow")).toHaveLength(2);
  expect(loop.mock.calls.length).toBe(started.length);
  view.rerender(<>{card("a")}</>);
  await settle();
  expect(stops.every((stop) => stop.mock.calls.length === 0)).toBe(true);
  view.unmount();
  expect(stops.every((stop) => stop.mock.calls.length > 0)).toBe(true);
  loop.mockRestore();
  reduceMotion.mockRestore();
});
