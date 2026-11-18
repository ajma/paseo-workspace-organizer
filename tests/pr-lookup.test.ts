import { expect, it, vi } from "vitest";
import { createPrLookup, shouldLookUp } from "../server/pr-lookup";

it("skips shared and missing branches", () => {
  expect(["main", "Master", "trunk", "develop", "dev"].some(shouldLookUp)).toBe(false);
  expect(shouldLookUp(null)).toBe(false);
  expect(shouldLookUp("feat/x")).toBe(true);
});

it("caches answers and failures, refreshes when stale, runs two at a time, and reports changes", async () => {
  let now = 0;
  const resolvers: ((url: string | null) => void)[] = [];
  const find = vi.fn((_directory: string, branch: string) => branch === "broken"
    ? Promise.reject(new Error("gh not authenticated")) : new Promise<string | null>((resolve) => resolvers.push(resolve)));
  const lookup = createPrLookup(find, () => now, 1_000);
  const changed = vi.fn();
  lookup.subscribe(changed);
  expect(lookup.get("/r", "a")).toBeNull();
  expect(lookup.get("/r", "b")).toBeNull();
  expect(lookup.get("/r", "c")).toBeNull();
  expect(lookup.get("/r", "a")).toBeNull();
  expect(find).toHaveBeenCalledTimes(2);
  resolvers.shift()!("https://github.com/o/r/pull/1");
  await vi.waitFor(() => expect(find).toHaveBeenCalledTimes(3));
  expect(lookup.get("/r", "a")).toBe("https://github.com/o/r/pull/1");
  expect(changed).toHaveBeenCalledTimes(1);
  resolvers.shift()!(null);
  resolvers.shift()!(null);
  await vi.waitFor(() => expect(lookup.get("/r", "c")).toBeNull());
  expect(changed).toHaveBeenCalledTimes(1);
  expect(lookup.get("/r", "broken")).toBeNull();
  await vi.waitFor(() => expect(find).toHaveBeenCalledTimes(4));
  lookup.get("/r", "broken");
  expect(find).toHaveBeenCalledTimes(4);
  now = 2_000;
  expect(lookup.get("/r", "a")).toBe("https://github.com/o/r/pull/1");
  expect(find).toHaveBeenCalledTimes(5);
  lookup.dispose();
});
