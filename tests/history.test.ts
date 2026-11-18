import { expect, it } from "vitest";
import { emptyHistory, HISTORY_LIMIT, step, visit, type History } from "../shared/history";

const ws = (key: string) => ({ key });
const keys = (history: History<{ key: string }>) => history.entries.map((entry) => entry.key);
const always = () => true;

it("records each workspace opened, ignoring the same one twice in a row", () => {
  let history = emptyHistory<{ key: string }>();
  for (const key of ["a", "b", "b", "c"]) history = visit(history, ws(key));
  expect(keys(history)).toEqual(["a", "b", "c"]);
  expect(history.index).toBe(2);
});

it("goes back and forward, and opening something new drops the forward entries", () => {
  let history = ["a", "b", "c"].reduce((h, key) => visit(h, ws(key)), emptyHistory<{ key: string }>());
  const back = step(history, -1, always)!;
  expect(back.entry.key).toBe("b");
  history = back.history;
  expect(step(history, 1, always)!.entry.key).toBe("c");
  history = visit(history, ws("d"));
  expect(keys(history)).toEqual(["a", "b", "d"]);
  expect(step(history, 1, always)).toBeNull();
});

it("skips workspaces that are gone, and the one already open", () => {
  const history = ["a", "b", "a", "c"].reduce((h, key) => visit(h, ws(key)), emptyHistory<{ key: string }>());
  expect(step(history, -1, (entry) => entry.key !== "a")!.entry.key).toBe("b");
  expect(step({ ...history, index: 2 }, -1, always)!.entry.key).toBe("b");
  expect(step(history, -1, () => false)).toBeNull();
});

it("keeps the most recent entries only", () => {
  let history = emptyHistory<{ key: string }>();
  for (let index = 0; index < HISTORY_LIMIT + 10; index++) history = visit(history, ws(String(index)));
  expect(history.entries).toHaveLength(HISTORY_LIMIT);
  expect(history.entries[0]!.key).toBe("10");
});

it("goes back to the workspace you came from when a non-workspace screen is open (like New workspace)", () => {
  const history = ["a", "b"].reduce((h, key) => visit(h, ws(key)), emptyHistory<{ key: string }>());
  // On a workspace, Back goes to the previous one.
  expect(step(history, -1, always)!.entry.key).toBe("a");
  // Off any workspace, Back returns to the one that was open, staying at that entry.
  const back = step(history, -1, always, { onWorkspace: false })!;
  expect(back.entry.key).toBe("b");
  expect(back.history.index).toBe(1);
  // With a single workspace in history, Back still has somewhere to go.
  expect(step(visit(emptyHistory<{ key: string }>(), ws("only")), -1, always, { onWorkspace: false })!.entry.key).toBe("only");
  // If that workspace is gone, it falls back to the one before.
  expect(step(history, -1, (entry) => entry.key !== "b", { onWorkspace: false })!.entry.key).toBe("a");
});
