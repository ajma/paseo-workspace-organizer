import { expect, it } from "vitest";
import { blend, groupColorHex, groupColorNames, groupTint, GROUP_TINT } from "../shared/group-colors";
import { organization, organizationSchema, preferences } from "../shared/organization";

it("tints a group's header more than its workspaces, and more on dark surfaces where the same tint reads weaker", () => {
  for (const color of groupColorNames) {
    const hex = groupColorHex(color);
    const rgb = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16)).join(", ");
    expect(groupTint(color, false, "header")).toBe(`rgba(${rgb}, ${GROUP_TINT.light.header})`);
    expect(groupTint(color, true, "body")).toBe(`rgba(${rgb}, ${GROUP_TINT.dark.body})`);
  }
  expect(GROUP_TINT.light.header).toBeGreaterThan(GROUP_TINT.light.body);
  expect(GROUP_TINT.dark.header).toBeGreaterThan(GROUP_TINT.light.header);
  expect(GROUP_TINT.dark.body).toBeGreaterThan(GROUP_TINT.light.body);
});

it("blends tints over a background into one solid color, for pinned headers that must hide the rows beneath them", () => {
  expect(blend("#000000", [])).toBe("rgb(0, 0, 0)");
  expect(blend("rgb(0, 0, 0)", ["rgba(255, 255, 255, 0.5)"])).toBe("rgb(128, 128, 128)");
  expect(blend("#ffffff", ["rgba(0, 0, 0, 0.5)", "rgba(0, 0, 0, 0.5)"])).toBe("rgb(64, 64, 64)");
  // Something unreadable leaves the background as it is.
  expect(blend("transparent", ["rgba(0, 0, 0, 0.5)"])).toBe("transparent");
});

it("offers clearly different hues, yellow among them", () => {
  expect(groupColorNames).toEqual(["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "gray"]);
  // Hues at least 20° apart, so no two read as the same color (gray has none).
  const hue = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  };
  const hues = groupColorNames.filter((name) => name !== "gray").map((name) => hue(groupColorHex(name))).sort((a, b) => a - b);
  hues.forEach((value, index) => { if (index) expect(value - hues[index - 1]).toBeGreaterThanOrEqual(20); });
});

it("maps colors saved under the earlier palette's names to the nearest new one", () => {
  const parse = (color: string) => organizationSchema.parse({ groups: [{ id: "a", name: "A", parentId: null, color }] }).groups[0].color;
  expect(["violet", "indigo", "sky", "emerald", "amber", "blue", "teal", "pink", "orange", "red"].map(parse)).toEqual(
    ["purple", "purple", "blue", "green", "yellow", "blue", "teal", "pink", "orange", "red"]);
});

it("keeps saved groups when adding colors (organization version 1 to 2), and falls back to none for a bad color", async () => {
  expect(organization.version).toBe(2);
  const v1 = { groups: [{ id: "a", name: "A", parentId: null }], workspaces: {}, workspaceOrder: [], savedSearches: [] };
  const migrated = await organization.migrate!(v1, 1) as { groups: { color: unknown }[] };
  expect(migrated.groups[0]).toEqual({ id: "a", name: "A", parentId: null, color: null });
  expect(organizationSchema.parse({ groups: [{ id: "a", name: "A", parentId: null, color: "plaid" }] }).groups[0].color).toBeNull();
});

it("adds the group color fill to device preferences (version 2 to 3), coloring the whole group by default", async () => {
  expect(preferences.version).toBe(3);
  const migrated = await preferences.migrate!({ collapsed: ["x"], sidebarHost: "srv" }, 2) as Record<string, unknown>;
  expect(migrated).toMatchObject({ collapsed: ["x"], sidebarHost: "srv", groupColorFill: "group" });
});
