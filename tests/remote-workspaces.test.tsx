import { expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { createRemoteWorkspaces } from "../client/remote-workspaces";
import { OrganizerSidebar } from "../client/sidebar";
import { makeIndex, resetHost, setWorkspaces, theme, workspace } from "../preview/host";

function fakeHost(entries: any[]) {
  let observer: any;
  const release = vi.fn(), unobserve = vi.fn();
  const list = vi.fn(async () => ({ subscription: { subscribe: (callback: any) => { observer = callback; callback.snapshot({ entries }); return unobserve; }, release } }));
  return { paseo: { workspaces: { list } } as any, list, release, unobserve, observer: () => observer };
}
const remotePr = { id: "mini-1", name: "stingy-catfish", title: "Diagnose watch notifications",
  githubRuntime: { pullRequest: { url: "https://github.com/o/r/pull/9001", state: "OPEN", isMerged: false, isDraft: false, checksStatus: "success", reviewDecision: "approved" },
    refreshedAt: new Date().toISOString() },
  gitRuntime: { currentBranch: "watch-ghosting", isDirty: true, aheadOfOrigin: 2, behindOfOrigin: 0 } };

it("follows each other host's workspace list, applies updates, and stops hosts that leave", async () => {
  const mini = fakeHost([remotePr]);
  const store = createRemoteWorkspaces(() => mini.paseo);
  const changed = vi.fn();
  store.subscribe(changed);
  store.sync(["mini"]);
  await vi.waitFor(() => expect(store.get("mini", "mini-1")?.githubRuntime?.pullRequest?.url).toBe("https://github.com/o/r/pull/9001"));
  expect(mini.list).toHaveBeenCalledWith({ subscribe: {}, page: { limit: 200 } });
  mini.observer().update({ type: "workspace_update", payload: { kind: "remove", id: "mini-1" } });
  expect(store.get("mini", "mini-1")).toBeUndefined();
  store.sync([]);
  expect(mini.unobserve).toHaveBeenCalledOnce();
  expect(mini.release).toHaveBeenCalledOnce();
  expect(changed).toHaveBeenCalled();
  store.dispose();
});

it("shows Paseo's detected PR, its status and git status for workspaces on other hosts", async () => {
  resetHost();
  setWorkspaces([workspace("mini-1", "Diagnose watch notifications", { hostId: "mini", branch: "watch-ghosting" })]);
  const mini = fakeHost([remotePr]);
  render(<OrganizerSidebar theme={theme} layout={{ compact: false, platform: "web" }} index={makeIndex()} remoteWorkspaces={createRemoteWorkspaces(() => mini.paseo)}
    active={{ workspace: null, agent: null }} navigation={{ openWorkspace: vi.fn(), openAgent: vi.fn(), openTerminal: vi.fn(), openProject: vi.fn() }} dismiss={vi.fn()} />);
  await waitFor(() => expect(screen.getByRole("link", { name: "Open PR o/r#9001" })).toBeTruthy());
  expect(screen.getByLabelText("PR 9001").textContent).toBe("9001passed");
  expect(screen.getByLabelText("Uncommitted changes")).toBeTruthy();
});
