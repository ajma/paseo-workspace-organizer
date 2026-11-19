import { expect, it } from "vitest";
import { breath } from "../shared/breath";

it("rises to its peak and falls back the same way, easing at both ends", () => {
  expect(breath(0)).toBeCloseTo(0);
  expect(breath(0.5)).toBeCloseTo(1);
  expect(breath(1)).toBeCloseTo(0);
  // Up then down: the same height on the way up as on the way down.
  for (const t of [0.1, 0.2, 0.3, 0.4]) expect(breath(t)).toBeCloseTo(breath(1 - t));
  const steps = Array.from({ length: 21 }, (_, i) => breath(i / 20));
  for (let i = 1; i <= 10; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]);
  for (let i = 11; i <= 20; i++) expect(steps[i]).toBeLessThan(steps[i - 1]);
  // It slows at the top and the bottom rather than turning sharply.
  expect(breath(0.5) - breath(0.45)).toBeLessThan(breath(0.3) - breath(0.25));
  expect(breath(0.05) - breath(0)).toBeLessThan(breath(0.3) - breath(0.25));
});
