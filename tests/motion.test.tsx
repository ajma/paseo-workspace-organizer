import { afterEach, expect, it, vi } from "vitest";
import { detailExtras, fieldItems } from "../client/card-fields";
import { sampleCard } from "../client/card-sample";
import { showFloatingPanel } from "../client/web";
import { theme } from "../preview/host";

afterEach(() => { vi.unstubAllGlobals(); Reflect.deleteProperty(Element.prototype, "animate"); });

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
