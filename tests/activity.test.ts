import { expect, it } from "vitest";
import { formatActivity, lastActivityAt } from "../shared/activity";

it("uses the most recent valid timestamp", () => {
  expect(lastActivityAt([null, "2026-11-17T10:00:00Z", "2026-11-17T12:00:00Z", "not a date"]))
    .toBe(Date.parse("2026-11-17T12:00:00Z"));
  expect(lastActivityAt([null, null])).toBeNull();
});

it("formats compact elapsed times", () => {
  const now = Date.parse("2026-11-17T12:00:00Z");
  const ago = (ms: number) => formatActivity(now - ms, now);
  expect(ago(30_000)).toBe("now");
  expect(ago(-5_000)).toBe("now");
  expect(ago(5 * 60_000)).toBe("5m");
  expect(ago(3 * 3_600_000)).toBe("3h");
  expect(ago(2 * 86_400_000)).toBe("2d");
  expect(ago(65 * 86_400_000)).toBe("2mo");
  expect(ago(800 * 86_400_000)).toBe("2y");
});
