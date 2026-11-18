import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OrganizerSidebar } from "../client/sidebar";
import { createLabelColorStore } from "../client/label-colors";
import { readHostColors } from "../client/web";
import { readLabelColors } from "../server/label-colors";
import { identityTint, isDarkSurface, tagGroupColor } from "../shared/identity-colors";
import { tagName } from "../shared/search";
import { makeIndex, setWorkspaces, theme, workspace } from "../preview/host";

afterEach(() => localStorage.clear());

it("reads Paseo's label colors and ignores malformed entries", async () => {
  const home = await mkdtemp(join(tmpdir(), "organizer-labels-"));
  await mkdir(join(home, "projects"), { recursive: true });
  await writeFile(join(home, "projects", "workspace-labels.json"), JSON.stringify([
    { name: "backburner", color: "amber" }, { name: "📲 S25", color: "sky" }, { name: "bad", color: "plaid" }, "junk"]));
  expect(await readLabelColors(home)).toEqual([{ name: "backburner", color: "amber" }, { name: "📲 S25", color: "sky" }]);
  expect(await readLabelColors(join(home, "missing"))).toEqual([]);
});

it("colors a tag group by its exact label, else by a label grouped under it", () => {
  const labels = [{ name: "📲 S25", color: "sky" as const }, { name: "review", color: "violet" as const }, { name: "review:ui", color: "red" as const }];
  expect(tagGroupColor("📲", labels, tagName)).toBe("sky");
  expect(tagGroupColor("Review", labels, tagName)).toBe("violet");
  expect(tagGroupColor("other", labels, tagName)).toBeNull();
  expect(isDarkSurface("#1c1e23")).toBe(true);
  expect(isDarkSurface("#ffffff")).toBe(false);
});

it("reads host colors from the app's saved host list on web", () => {
  localStorage.setItem("@paseo:daemon-registry", JSON.stringify([
    { serverId: "local", appearance: { color: "amber" } }, { serverId: "remote", appearance: { color: "none" } }, { serverId: 3 }]));
  expect([...readHostColors()]).toEqual([["local", "amber"]]);
  localStorage.setItem("@paseo:daemon-registry", "not json");
  expect(readHostColors().size).toBe(0);
});

it("shows status dots, tags in their label colors and host dots in the Filters menu", async () => {
  localStorage.setItem("@paseo:daemon-registry", JSON.stringify([{ serverId: "local", appearance: { color: "emerald" } }]));
  setWorkspaces([workspace("one", "Tagged work", { labels: ["📲 S25", "plain"] }), workspace("two", "Remote work", { hostId: "remote" })]);
  const rpc = vi.fn(async () => ({ labels: [{ name: "📲 S25", color: "sky" }] }));
  render(<OrganizerSidebar theme={theme} layout={{ compact: false, platform: "web" }} labelColors={createLabelColorStore({ rpc } as never)}
    active={{ workspace: null, agent: null }} navigation={{ openWorkspace: vi.fn(), openAgent: vi.fn(), openTerminal: vi.fn(), openProject: vi.fn() }}
    dismiss={vi.fn()} index={makeIndex()} />);
  fireEvent.click(screen.getByRole("button", { name: "Filters" }));
  const running = screen.getByRole("checkbox", { name: "Filter status Running" });
  expect(running.querySelector(`div[style*="background-color: rgb(155, 185, 255)"]`)).not.toBeNull();
  fireEvent.click(screen.getByRole("tab", { name: "Tags" }));
  await waitFor(() => expect(screen.getByRole("checkbox", { name: "Filter tag 📲" }).innerHTML).toContain("rgba(61, 126, 166, 0.1)"));
  expect(screen.getByRole("checkbox", { name: "Filter tag plain" }).innerHTML).not.toContain("rgba(61, 126, 166");
  fireEvent.click(screen.getByRole("tab", { name: "Host" }));
  expect(screen.getByRole("checkbox", { name: "Filter host This Mac" }).innerHTML).toContain("rgb(56, 128, 104)");
  expect(screen.getByRole("checkbox", { name: "Filter host remote" }).innerHTML).not.toContain("rgb(56, 128, 104)");
  expect(identityTint("sky")).toBe("#3d7ea61a");
});

it("follows Paseo's host badge choice, defaulting to hidden for this computer's host and the name elsewhere", async () => {
  const { hostBadge, readHostAppearance } = await import("../client/web");
  localStorage.setItem("@paseo:daemon-registry", JSON.stringify([
    { serverId: "a", appearance: { color: "amber", badgeDisplay: "icon" } }, { serverId: "b", appearance: { color: "none", badgeDisplay: null } }]));
  expect(readHostAppearance().get("a")).toEqual({ color: "amber", badge: "icon" });
  expect(hostBadge(readHostAppearance().get("b")?.badge, true)).toBe("hidden");
  expect(hostBadge(readHostAppearance().get("b")?.badge, false)).toBe("name");
  expect(hostBadge("name", true)).toBe("name");
});
