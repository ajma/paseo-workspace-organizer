import { afterEach, expect, it, vi } from "vitest";
import { localHostIds, showsSidebar } from "../shared/sidebar-placement";
import { placeSidebar } from "../client/sidebar-placement";

afterEach(() => { vi.useRealTimers(); Reflect.deleteProperty(globalThis, "__workspaceOrganizerCopies"); });

const registry = JSON.stringify([
  { serverId: "srv_mac", appearance: {}, connections: [{ id: "direct:localhost:6767", type: "direct", endpoint: "localhost:6767" },
    { id: "relay:wss://relay.paseo.sh:443", type: "relay" }] },
  { serverId: "srv_box", connections: [{ id: "relay:wss://relay.paseo.sh:443", type: "relay" }] },
  { serverId: "srv_lan", connections: [{ id: "direct:192.168.1.20:6767", type: "direct", endpoint: "192.168.1.20:6767" }] },
  { serverId: "srv_loop", connections: [{ type: "direct", endpoint: "127.0.0.1:7777" }] },
]);

it("finds this computer's hosts: those Paseo reaches directly on a loopback address", () => {
  expect([...localHostIds(registry)].sort()).toEqual(["srv_loop", "srv_mac"]);
  expect(localHostIds(null).size).toBe(0);
  expect(localHostIds("not json").size).toBe(0);
  expect(localHostIds(JSON.stringify({ hosts: [] })).size).toBe(0);
});

it("shows the local host's sidebar; another host's only when no local copy is running", () => {
  const local = new Set(["srv_mac"]);
  // Without a local host (a phone, or the web away from the daemon), every copy offers its sidebar, as before.
  expect(showsSidebar({ hostId: null, localHosts: new Set(), localCopyRunning: false, waited: false })).toBe(true);
  expect(showsSidebar({ hostId: "srv_mac", localHosts: local, localCopyRunning: false, waited: false })).toBe(true);
  expect(showsSidebar({ hostId: "srv_box", localHosts: local, localCopyRunning: true, waited: true })).toBe(false);
  // A copy on another host, or one not yet sure of its host, waits briefly for a local copy before stepping in.
  expect(showsSidebar({ hostId: "srv_box", localHosts: local, localCopyRunning: false, waited: false })).toBe(false);
  expect(showsSidebar({ hostId: "srv_box", localHosts: local, localCopyRunning: false, waited: true })).toBe(true);
  expect(showsSidebar({ hostId: null, localHosts: local, localCopyRunning: false, waited: true })).toBe(true);
});

it("lets the local host's copy own the sidebar while it runs, and another host's take over when it stops", () => {
  vi.useFakeTimers();
  const copy = () => {
    let hostId: string | null = null;
    const listeners = new Set<() => void>();
    const views: string[] = [];
    return {
      views,
      learn(id: string) { hostId = id; listeners.forEach((listener) => listener()); },
      place: (name: string) => placeSidebar({ hostId: () => hostId, subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
        localHosts: new Set(["srv_mac"]), add: () => { views.push(name); return () => { views.splice(views.indexOf(name), 1); }; } }),
    };
  };
  const remote = copy(), local = copy();
  const stopRemote = remote.place("box");
  const stopLocal = local.place("mac");
  // Neither knows its host yet, so neither shows a sidebar straight away.
  expect([remote.views, local.views]).toEqual([[], []]);
  remote.learn("srv_box");
  local.learn("srv_mac");
  expect(local.views).toEqual(["mac"]);
  vi.advanceTimersByTime(10_000);
  expect(remote.views).toEqual([]);
  // The local copy stops (the plugin is removed from this computer): the other host's copy takes over.
  stopLocal();
  expect(remote.views).toEqual(["box"]);
  stopRemote();
  expect(remote.views).toEqual([]);
});

it("steps a remote copy aside when the local copy turns up late", () => {
  vi.useFakeTimers();
  const views: string[] = [];
  const make = (name: string, id: string) => {
    let hostId: string | null = null; const listeners = new Set<() => void>();
    const stop = placeSidebar({ hostId: () => hostId, subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
      localHosts: new Set(["srv_mac"]), add: () => { views.push(name); return () => { views.splice(views.indexOf(name), 1); }; } });
    return { stop, learn: () => { hostId = id; listeners.forEach((listener) => listener()); } };
  };
  const remote = make("box", "srv_box");
  remote.learn();
  vi.advanceTimersByTime(10_000);
  expect(views).toEqual(["box"]);
  const local = make("mac", "srv_mac");
  local.learn();
  expect(views).toEqual(["mac"]);
  local.stop(); remote.stop();
});
