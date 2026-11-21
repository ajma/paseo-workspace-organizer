import { expect, it, vi } from "vitest";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { createWorkspaceIndex } from "../client/workspace-index";
import * as organization from "../shared/organization";
import { emptyDetails, organizationSchema, parseLinks, workspaceKey } from "../shared/organization";
import { indexEventSchema, type IndexEvent } from "../shared/workspace-index";

it("keeps Cmd+K search current even with no sidebar mounted, removes deleted references and cleans up", async () => {
  let receive!: (event: IndexEvent) => void;
  const removers: ReturnType<typeof vi.fn>[] = [];
  const addCommandCenterItem = vi.fn(() => { const remove = vi.fn(); removers.push(remove); return remove; });
  const release = Object.assign(vi.fn(), { ready: Promise.resolve(), release: vi.fn() });
  const client = { addCommandCenterItem, subscribe: vi.fn((_contract, _input, callback) => { receive = callback; return release; }) } as unknown as PluginClientContext;
  const index = createWorkspaceIndex(client);
  const document = organizationSchema.parse({ workspaces: { [workspaceKey("host", "w")]: { ...emptyDetails(), links: parseLinks("https://github.com/o/r/pull/42 https://github.com/o/r/pull/87 https://github.com/o/r/issues/99") } } });
  const event: IndexEvent = { hostId: "host", entries: [{ id: "w", name: "Reconnect", branch: "fix/socket", labels: [], links: [] }], organization: document, error: null, github: {} };
  receive(event);
  const command = addCommandCenterItem.mock.calls[0][0] as any;
  expect(command.keywords).toEqual(expect.arrayContaining(["42", "#87", "issue #99"]));
  const openScreen = vi.fn(); command.onSelect({ openScreen });
  expect(openScreen).toHaveBeenCalledWith({ screenId: "jump", params: { workspaceId: "w", serverId: "host" } });
  receive(event); expect(addCommandCenterItem).toHaveBeenCalledTimes(1);
  receive({ ...event, organization: organizationSchema.parse({}) });
  expect(removers[0]).toHaveBeenCalledOnce();
  expect((addCommandCenterItem.mock.calls[1][0] as any).keywords).not.toContain("#99");
  receive({ ...event, entries: [] }); expect(removers[1]).toHaveBeenCalledOnce();
  index.dispose(); expect(release).toHaveBeenCalledOnce();
});

it("publishes status changes without rebuilding Cmd+K search terms", () => {
  let receive!: (event: IndexEvent) => void;
  const searchTerms = vi.spyOn(organization, "searchTerms");
  const handle = Object.assign(vi.fn(), { ready: Promise.resolve(), release: vi.fn() });
  const client = { addCommandCenterItem: () => vi.fn(), subscribe: vi.fn((_contract, _input, callback) => { receive = callback; return handle; }) } as unknown as PluginClientContext;
  const index = createWorkspaceIndex(client);
  const listener = vi.fn();
  index.subscribe(listener);
  try {
    const link = organization.parseGithubLink("https://github.com/o/r/pull/42");
    const entries = Array.from({ length: 250 }, (_, i) => ({ id: `workspace-${i}`, name: `Workspace ${i}`, branch: null, labels: [], links: i ? [] : [link] }));
    const event = { hostId: "host", organization: { workspaces: { [workspaceKey("host", "workspace-0")]: { tags: ["review"] } } },
      organizationRevision: "1", error: null, entries };
    receive(indexEventSchema.parse(event));
    for (const [i, state] of ["draft", "open", "closed", "merged"].entries()) {
      const first = { ...entries[0], git: { dirty: !!(i % 2), ahead: i, behind: 0 } };
      receive(indexEventSchema.parse({ ...event, entries: [first, ...entries.slice(1)], github: {
        [link.url]: { state, checks: null, review: null, updatedAt: null, stale: false, error: null },
      } }));
    }
    expect(index.getSnapshot()?.github[link.url].state).toBe("merged");
    expect(index.getSnapshot()?.entries[0].git?.ahead).toBe(3);
    expect(listener).toHaveBeenCalledTimes(5);
    expect(searchTerms).toHaveBeenCalledTimes(250);
  } finally {
    index.dispose(); searchTerms.mockRestore();
  }
});

it("reconnects after the plugin or daemon restarts, and names the failure only if reconnecting keeps failing", async () => {
  vi.useFakeTimers();
  type Handle = (() => void) & { ready: Promise<void>; release: () => Promise<void> };
  const connections: { receive: (event: IndexEvent) => void; close: (message: string) => void; handle: Handle }[] = [];
  const client = { addCommandCenterItem: vi.fn(() => vi.fn()), subscribe: vi.fn((_contract, _input, receive, options) => {
    const handle = Object.assign(vi.fn(), { ready: Promise.resolve(), release: vi.fn(async () => {}) }) as unknown as Handle;
    connections.push({ receive, close: (message) => options.onClosed({ error: new Error(message) }), handle });
    return handle;
  }) } as unknown as PluginClientContext;
  const index = createWorkspaceIndex(client);
  const event: IndexEvent = { hostId: "host", entries: [{ id: "w", name: "Reconnect", branch: null, labels: [], links: [] }], organization: null, error: null, github: {} };
  connections[0].receive(event);
  // A restart closes the connection; it comes straight back, so no error shows and the data stays.
  connections[0].close("Plugin stopped: paseo-workspace-organizer");
  expect(index.getError()).toBeNull();
  expect(index.getSnapshot()).toEqual(event);
  await vi.advanceTimersByTimeAsync(1000);
  expect(client.subscribe).toHaveBeenCalledTimes(2);
  connections[1].receive({ ...event, entries: [] });
  expect(index.getSnapshot()?.entries).toEqual([]);
  // When reconnecting keeps failing, the sidebar says why, and keeps trying.
  for (let attempt = 1; attempt <= 3; attempt++) {
    connections.at(-1)!.close("Plugin stopped: paseo-workspace-organizer");
    await vi.advanceTimersByTimeAsync(30_000);
  }
  expect(index.getError()).toMatch(/^Plugin stopped: paseo-workspace-organizer\. Retrying/);
  connections.at(-1)!.receive(event);
  expect(index.getError()).toBeNull();
  // Disposed, it stops reconnecting.
  const attempts = connections.length;
  connections.at(-1)!.close("Plugin stopped: paseo-workspace-organizer");
  index.dispose();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(connections.length).toBe(attempts);
  vi.useRealTimers();
});
