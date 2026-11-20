import { expect, it, vi } from "vitest";
import { registerIndex } from "../server/workspace-index";
import { organizationSchema } from "../shared/organization";
import { parseGithubLink, workspaceKey } from "../shared/organization";
import { parseStatus } from "../server/github-status";

async function harness(options: { invalid?: boolean; pushFailure?: boolean; document?: unknown; readStatus?: any; findPr?: any; lookUp?: any } = {}) {
  let stored: any = null;
  let outsideEdit: () => void = () => {};
  let handler: any;
  let observer: any;
  let settingsChanged: any;
  const stopSettings = vi.fn(), stopObservation = vi.fn(), release = vi.fn();
  const server = {
    registerSettings: () => ({
      read: async () => options.invalid ? { status: "invalid", error: "Stored document invalid" }
        : stored ?? { status: "ready", revision: "1", values: organizationSchema.parse(options.document ?? {}) },
      subscribe: (callback: any) => { settingsChanged = callback; return stopSettings; },
    }),
    handle: (_contract: any, callback: any) => { handler = callback; },
  };
  const dispose = registerIndex(server as any, options.readStatus ?? (async (link: any) => parseStatus(link.kind, { state: "OPEN" }, "2026-11-11T12:00:00Z")),
    options.findPr ?? (async () => null), { lookUpNumber: options.lookUp ?? (async () => { throw new Error("HTTP 404"); }),
      watchSettings: (_document: string, onChange: () => void) => { outsideEdit = onChange; return () => {}; } });
  const controller = new AbortController();
  const list = vi.fn(async () => ({
    subscription: { subscribe: (callback: any) => { observer = callback; callback.snapshot({ entries: [] }); return stopObservation; }, release },
  }));
  const push = options.pushFailure ? vi.fn().mockRejectedValue(new Error("Transport failed")) : vi.fn().mockResolvedValue(undefined);
  const running = handler({}, {
    signal: controller.signal, push,
    paseo: { hosts: { list: async () => ({ self: { serverId: "host" } }) }, workspaces: { list } },
  });
  // Register the rejection handler immediately to avoid an unhandled rejection during setup.
  const settled = running.then(() => null, (error: unknown) => error).finally(() => dispose?.());
  await vi.waitFor(() => expect(observer).toBeTruthy());
  // Something outside Paseo rewrites the settings file.
  const editOutside = (document: unknown, revision: string) => { stored = { status: "ready", revision, values: organizationSchema.parse(document) }; outsideEdit(); };
  return { observer, settingsChanged, controller, push, settled, stopSettings, stopObservation, release, list, editOutside };
}

it("observes PR changes, workspace removal and reconnect snapshots; releases every resource", async () => {
  const h = await harness();
  const workspace = { id: "w", name: "Feature", title: null, background: false, archivingAt: null,
    githubRuntime: { pullRequest: { url: "https://github.com/o/r/pull/42" } }, gitRuntime: { currentBranch: "feat/one" }, labels: ["review"] };
  h.observer.snapshot({ entries: [workspace, { ...workspace, id: "background", background: true }] });
  await vi.waitFor(() => expect(h.push.mock.lastCall?.[0].entries).toHaveLength(1));
  expect(h.push.mock.lastCall?.[0].entries[0].links[0].number).toBe(42);
  h.observer.update({ type: "workspace_update", payload: { kind: "remove", id: "w" } });
  await vi.waitFor(() => expect(h.push.mock.lastCall?.[0].entries).toHaveLength(0));
  h.observer.snapshot({ entries: [{ ...workspace, id: "after-reconnect" }] });
  await vi.waitFor(() => expect(h.push.mock.lastCall?.[0].entries[0].id).toBe("after-reconnect"));
  h.controller.abort(); await h.settled;
  expect(h.stopSettings).toHaveBeenCalledOnce(); expect(h.stopObservation).toHaveBeenCalledOnce(); expect(h.release).toHaveBeenCalledOnce();
});

it("publishes status for every manual PR and issue link", async () => {
  const first = parseGithubLink("https://github.com/o/r/pull/42"), second = parseGithubLink("https://github.com/o/r/pull/87"), issue = parseGithubLink("https://github.com/o/r/issues/99");
  const h = await harness({ document: { workspaces: { [workspaceKey("host", "w")]: { links: [first, second, issue] } } },
    readStatus: async (link: any) => parseStatus(link.kind, { state: link.kind === "issue" ? "CLOSED" : "MERGED" }, "2026-11-11T12:00:00Z") });
  h.observer.snapshot({ entries: [{ id: "w", name: "Feature" }] });
  await vi.waitFor(() => expect(h.push.mock.lastCall?.[0].github?.[issue.url]?.state).toBe("closed"));
  expect(h.push.mock.lastCall?.[0].github[first.url].state).toBe("merged");
  expect(h.push.mock.lastCall?.[0].github[second.url].state).toBe("merged");
  h.controller.abort(); await h.settled;
});

it("uses Paseo's detected PR state when GitHub status cannot be fetched", async () => {
  const h = await harness({ readStatus: async () => { throw new Error("No gh authentication"); } });
  const url = "https://github.com/o/r/pull/42";
  h.observer.snapshot({ entries: [{ id: "w", name: "Feature", githubRuntime: { pullRequest: {
    url, state: "CLOSED", isMerged: true, checksStatus: "success", reviewDecision: "approved",
  } } }] });
  await vi.waitFor(() => expect(h.push.mock.lastCall?.[0].github?.[url]).toMatchObject({ state: "merged", checks: "success", review: "approved" }));
  h.controller.abort(); await h.settled;
});

it("does not replace a newer stale GitHub result with an older native PR state", async () => {
  const url = "https://github.com/o/r/pull/42";
  const h = await harness({ readStatus: async () => ({ ...parseStatus("pr", { state: "MERGED" }, "2026-11-11T13:00:00Z"), stale: true, error: "offline" }) });
  h.observer.snapshot({ entries: [{ id: "w", name: "Feature", githubRuntime: { refreshedAt: "2026-11-11T12:00:00Z", pullRequest: { url, state: "OPEN" } } }] });
  await vi.waitFor(() => expect(h.push.mock.lastCall?.[0].github?.[url]).toMatchObject({ state: "merged", stale: true }));
  h.controller.abort(); await h.settled;
});

it("uses a newer native PR result rather than an older cached GitHub response", async () => {
  const url = "https://github.com/o/r/pull/42";
  const h = await harness({ readStatus: async () => parseStatus("pr", { state: "OPEN" }, "2026-11-11T12:00:00Z") });
  h.observer.snapshot({ entries: [{ id: "w", name: "Feature", githubRuntime: { refreshedAt: "2026-11-11T13:00:00Z", pullRequest: { url, state: "CLOSED", isMerged: true } } }] });
  await vi.waitFor(() => expect(h.push.mock.lastCall?.[0].github?.[url]?.state).toBe("merged"));
  h.controller.abort(); await h.settled;
});

it("stops scheduling GitHub reads and pushes when the workspace observation fails", async () => {
  const pending: (() => void)[] = [];
  const readStatus = vi.fn(() => new Promise<any>((resolve) => pending.push(() => resolve(parseStatus("pr", { state: "OPEN" }, "2026-11-11T12:00:00Z")))));
  const h = await harness({ document: { workspaces: { [workspaceKey("host", "w")]: { links: Array.from({ length: 8 }, (_, i) => parseGithubLink(`https://github.com/o/r/pull/${i + 1}`)) } } }, readStatus });
  h.observer.snapshot({ entries: [{ id: "w", name: "Feature" }] });
  await vi.waitFor(() => expect(readStatus).toHaveBeenCalledTimes(4));
  h.observer.error(new Error("Observation failed"));
  await h.settled;
  const pushes = h.push.mock.calls.length;
  pending.splice(0).forEach((resolve) => resolve());
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(readStatus).toHaveBeenCalledTimes(4);
  expect(h.push).toHaveBeenCalledTimes(pushes);
});

it("refreshes after the cache expires even when the initial GitHub read has latency", async () => {
  vi.useFakeTimers();
  let h: Awaited<ReturnType<typeof harness>> | undefined;
  try {
    const readStatus = vi.fn(async () => { await new Promise((resolve) => setTimeout(resolve, 1000)); return parseStatus("pr", { state: "OPEN" }, new Date().toISOString()); });
    h = await harness({ document: { workspaces: { [workspaceKey("host", "w")]: { links: [parseGithubLink("https://github.com/o/r/pull/42")] } } }, readStatus });
    h.observer.snapshot({ entries: [{ id: "w", name: "Feature" }] });
    await vi.advanceTimersByTimeAsync(1000);
    expect(readStatus).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(readStatus).toHaveBeenCalledTimes(2);
  } finally {
    h?.controller.abort(); if (h) await h.settled;
    vi.clearAllTimers(); vi.useRealTimers();
  }
});
it("surfaces invalid settings without discarding the stored document", async () => {
  const h = await harness({ invalid: true });
  await vi.waitFor(() => expect(h.push).toHaveBeenCalledWith(expect.objectContaining({ organization: null, error: "Stored document invalid" })));
  h.controller.abort(); await h.settled;
});
it("closes and cleans up on an observation failure", async () => {
  const h = await harness();
  h.observer.error(new Error("Observation failed"));
  expect(await h.settled).toMatchObject({ message: "Observation failed" });
  expect(h.release).toHaveBeenCalledOnce();
});
it("closes and cleans up on a push failure", async () => {
  const h = await harness({ pushFailure: true });
  expect(await h.settled).toMatchObject({ message: "Transport failed" });
  expect(h.release).toHaveBeenCalledOnce();
});
it("requests the entire directory and indexes workspaces beyond the default 200", async () => {
  const h = await harness();
  expect(h.list).toHaveBeenCalledWith({ subscribe: {}, page: { limit: 200 } });
  h.observer.snapshot({ entries: Array.from({ length: 250 }, (_, i) => ({ id: `workspace-${i}`, name: `Workspace ${i}` })) });
  await vi.waitFor(() => expect(h.push.mock.lastCall?.[0].entries).toHaveLength(250));
  h.controller.abort(); await h.settled;
});

it("finds a branch's PR itself when Paseo has not detected one, and keeps Paseo's when it has", async () => {
  const findPr = vi.fn(async (_directory: string, branch: string) => branch === "feat/found" ? "https://github.com/o/r/pull/77" : null);
  const h = await harness({ findPr, readStatus: async (link: any) => parseStatus(link.kind, { state: "MERGED" }, "2026-11-11T12:00:00Z") });
  const base = { name: "W", title: null, background: false, archivingAt: null, labels: [], workspaceDirectory: "/work/r" };
  h.observer.snapshot({ entries: [
    { ...base, id: "found", gitRuntime: { currentBranch: "feat/found" } },
    { ...base, id: "none", gitRuntime: { currentBranch: "feat/none" } },
    { ...base, id: "main", gitRuntime: { currentBranch: "main" } },
    { ...base, id: "paseo", gitRuntime: { currentBranch: "feat/paseo" }, githubRuntime: { pullRequest: { url: "https://github.com/o/r/pull/5" } } },
  ] });
  await vi.waitFor(() => expect(h.push.mock.lastCall?.[0].entries.find((e: any) => e.id === "found").links[0]?.number).toBe(77));
  await vi.waitFor(() => expect(h.push.mock.lastCall?.[0].github["https://github.com/o/r/pull/77"]?.state).toBe("merged"));
  const entries = h.push.mock.lastCall?.[0].entries;
  expect(entries.find((e: any) => e.id === "none").links).toEqual([]);
  expect(entries.find((e: any) => e.id === "paseo").links.map((l: any) => l.number)).toEqual([5]);
  // Shared branches and workspaces with Paseo's PR are never looked up.
  expect(findPr.mock.calls.map((call) => call[1]).sort()).toEqual(["feat/found", "feat/none"]);
  h.controller.abort(); await h.settled;
});

it("links the issue a workspace names in its title or branch, once GitHub confirms it", async () => {
  const lookUp = vi.fn(async (repository: string, number: number) => {
    if (number === 6159) return `https://github.com/${repository}/issues/6159`;
    if (number === 9421) return `https://github.com/${repository}/pull/9421`;
    throw new Error("HTTP 404: Not Found");
  });
  const h = await harness({ lookUp });
  h.observer.snapshot({ entries: [
    { id: "w", name: "w", title: "#6159 Stream logs", gitRuntime: { currentBranch: "fix-9421-thing", remoteUrl: "git@github.com:Acme/App.git" } },
    { id: "missing", name: "m", title: "#4040 Gone", gitRuntime: { currentBranch: "main", remoteUrl: "https://github.com/acme/app.git" } },
  ] });
  await vi.waitFor(() => expect(h.push.mock.lastCall?.[0].entries[0].links.map((link: any) => link.url)).toEqual(
    ["https://github.com/acme/app/issues/6159", "https://github.com/acme/app/pull/9421"]));
  expect(h.push.mock.lastCall?.[0].entries[1].links).toEqual([]);
  // Each number is asked about once.
  h.observer.snapshot({ entries: [{ id: "w", name: "w", title: "#6159 Stream logs", gitRuntime: { currentBranch: "fix-9421-thing", remoteUrl: "git@github.com:Acme/App.git" } }] });
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(lookUp.mock.calls.filter(([, number]) => number === 6159)).toHaveLength(1);
  h.controller.abort(); await h.settled;
});

it("picks up an outside edit to the settings file and tells the sidebar its new revision", async () => {
  const h = await harness();
  h.observer.snapshot({ entries: [{ id: "w", name: "Feature" }] });
  await vi.waitFor(() => expect(h.push.mock.lastCall?.[0].organizationRevision).toBe("1"));
  const link = parseGithubLink("https://github.com/o/r/issues/7");
  h.editOutside({ workspaces: { [workspaceKey("host", "w")]: { links: [link] } } }, "2");
  await vi.waitFor(() => expect(h.push.mock.lastCall?.[0].organizationRevision).toBe("2"));
  expect(h.push.mock.lastCall?.[0].organization.workspaces[workspaceKey("host", "w")].links).toEqual([link]);
  h.controller.abort(); await h.settled;
});
