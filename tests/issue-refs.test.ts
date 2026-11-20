import { expect, it } from "vitest";
import { issueNumbersFrom } from "../shared/issue-refs";

it("finds the issue a workspace names in its title or branch", () => {
  expect(issueNumbersFrom({ title: "#6159 Stream Android adb logs to backend", branch: null })).toEqual([6159]);
  expect(issueNumbersFrom({ title: "Solos 5.10.0 camera-busy retest (#5705 / #6981)", branch: "solos-5100-camera-busy-retest" })).toEqual([5705, 6981]);
  expect(issueNumbersFrom({ title: "Add watch speaker", branch: "issue-6307-add-watch-speaker" })).toEqual([6307]);
  expect(issueNumbersFrom({ title: "#9421 Rung declared succeeded", branch: "fix-9421-rung-success" })).toEqual([9421]);
  expect(issueNumbersFrom({ title: "LiveKit room re-created", branch: "i6410-room-recreated" })).toEqual([6410]);
  expect(issueNumbersFrom({ title: "Thing", branch: "ajma/issue-12-thing" })).toEqual([12]);
});

it("leaves alone what isn't an issue reference", () => {
  // Channels, single digits and version or other numbers in branch names.
  expect(issueNumbersFrom({ title: "Find workflow posting bugs to #reality-testing-thread", branch: "enhanced-seal" })).toEqual([]);
  expect(issueNumbersFrom({ title: "Step #1 of the plan", branch: "feature/sidebar-organizer" })).toEqual([]);
  expect(issueNumbersFrom({ title: "Optimize video; evaluate VP9 and AV1", branch: "release-2026-11" })).toEqual([]);
  expect(issueNumbersFrom({ title: null, branch: null })).toEqual([]);
});
