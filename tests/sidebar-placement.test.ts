import { expect, it } from "vitest";
import { localHostIds, showsSidebar } from "../shared/sidebar-placement";
import { placeSidebar } from "../client/sidebar-placement";

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

it("shows only the local host's sidebar; without a local host, any copy's", () => {
  const local = new Set(["srv_mac"]);
  expect(showsSidebar({ hostId: "srv_mac", localHosts: local })).toBe(true);
  // Another host's copy never shows, and a copy not yet sure of its host waits until it is.
  expect(showsSidebar({ hostId: "srv_box", localHosts: local })).toBe(false);
  expect(showsSidebar({ hostId: null, localHosts: local })).toBe(false);
  // A phone, or the web away from the daemon, has no local host: every copy offers its sidebar, as before.
  expect(showsSidebar({ hostId: null, localHosts: new Set() })).toBe(true);
  expect(showsSidebar({ hostId: "srv_box", localHosts: new Set() })).toBe(true);
});

it("adds the sidebar once a copy learns it is on the local host, and never for another host's copy", () => {
  const copy = (localHosts: Set<string>) => {
    let hostId: string | null = null;
    const listeners = new Set<() => void>();
    let shown = 0;
    const stop = placeSidebar({ hostId: () => hostId, subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
      localHosts, add: () => { shown++; return () => { shown--; }; } });
    return { stop, shown: () => shown, learn(id: string) { hostId = id; listeners.forEach((listener) => listener()); } };
  };
  const local = copy(new Set(["srv_mac"])), remote = copy(new Set(["srv_mac"]));
  expect([local.shown(), remote.shown()]).toEqual([0, 0]);
  local.learn("srv_mac"); remote.learn("srv_box");
  expect([local.shown(), remote.shown()]).toEqual([1, 0]);
  // Repeated updates don't add it twice; stopping removes it.
  local.learn("srv_mac");
  expect(local.shown()).toBe(1);
  local.stop(); remote.stop();
  expect(local.shown()).toBe(0);
  // Without a local host it's offered straight away.
  const phone = copy(new Set());
  expect(phone.shown()).toBe(1);
  phone.stop();
});
