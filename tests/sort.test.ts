import { expect, it } from "vitest";
import { compareWorkspaces } from "../shared/sort";

const w = (key: string, title: string, times: { lastPromptAt?: string; statusEnteredAt?: string; createdAt?: string } = {}) => ({
  ref: { key }, title, name: title, lastPromptAt: times.lastPromptAt ?? null,
  statusEnteredAt: times.statusEnteredAt ?? null, createdAt: times.createdAt ?? null,
});
const items = [
  w("a", "Bravo", { createdAt: "2026-11-01T00:00:00Z", lastPromptAt: "2026-11-17T09:00:00Z" }),
  w("b", "Alpha", { createdAt: "2026-11-10T00:00:00Z", statusEnteredAt: "2026-11-17T11:00:00Z" }),
  w("c", "Charlie"),
  w("d", "Delta", { createdAt: "2026-11-15T00:00:00Z" }),
];
const order = (mode: Parameters<typeof compareWorkspaces>[0], manual: string[] = []) =>
  [...items].sort(compareWorkspaces(mode, manual)).map((item) => item.title);

it("sorts by name", () => expect(order("name")).toEqual(["Alpha", "Bravo", "Charlie", "Delta"]));
it("sorts by most recent activity, workspaces without times last", () =>
  expect(order("activity")).toEqual(["Alpha", "Bravo", "Delta", "Charlie"]));
it("sorts by newest creation time", () => expect(order("created")).toEqual(["Delta", "Alpha", "Bravo", "Charlie"]));
it("keeps the saved manual order, then name", () => expect(order("manual", ["d", "a"])).toEqual(["Delta", "Bravo", "Alpha", "Charlie"]));
