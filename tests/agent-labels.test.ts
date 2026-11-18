import { expect, it } from "vitest";
import { agentLabels, buildProviderCatalog } from "../shared/agent-labels";
import { formatDuration, runTimes } from "../shared/activity";

it("labels agents from full and compact provider snapshots, with readable fallbacks", () => {
  const catalog = buildProviderCatalog({
    entries: [{ provider: "claude", label: "Claude", iconSvg: "<svg/>" }],
    compactSnapshot: { thinkingSets: [{ options: [{ id: "high", label: "High" }] }],
      entries: [{ provider: "claude", models: [{ id: "opus", label: "Opus 5.5", aliases: ["claude-opus"], thinkingSet: 0 }] }] },
  });
  expect(agentLabels(catalog, { provider: "claude", model: "claude-opus", thinkingOptionId: "high" }))
    .toEqual({ provider: "Claude", iconSvg: "<svg/>", model: "Opus 5.5", thinking: "High" });
  expect(agentLabels(null, { provider: "open-code", model: "m-1", thinkingOptionId: "extra_high" }))
    .toEqual({ provider: "Open Code", iconSvg: null, model: "m-1", thinking: "Extra High" });
});

it("times running and finished runs", () => {
  const now = Date.parse("2026-11-17T12:00:00Z");
  expect(runTimes({ status: "running", lastPromptAt: "2026-11-17T11:47:30Z", statusEnteredAt: "2026-11-17T11:47:31Z" }, now))
    .toEqual({ running: true, at: Date.parse("2026-11-17T11:47:30Z"), elapsed: 750_000 });
  expect(runTimes({ status: "done", lastPromptAt: "2026-11-17T11:00:00Z", statusEnteredAt: "2026-11-17T11:12:30Z" }, now))
    .toEqual({ running: false, at: Date.parse("2026-11-17T11:12:30Z"), elapsed: 750_000 });
  expect(runTimes({ status: "done", lastPromptAt: null, statusEnteredAt: null }, now)).toEqual({ running: false, at: null, elapsed: null });
  expect([45_000, 750_000, 7_500_000, 273_600_000].map(formatDuration)).toEqual(["45s", "12m 30s", "2h 5m", "3d 4h"]);
});
