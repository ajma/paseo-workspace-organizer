import { expect, it, vi } from "vitest";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { createWorkspaceIndex } from "../client/workspace-index";
import { emptyDetails, organizationSchema, parseLinks, workspaceKey } from "../shared/organization";
import type { IndexEvent } from "../shared/workspace-index";

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
