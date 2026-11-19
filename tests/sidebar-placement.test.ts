import { afterEach, expect, it, vi } from "vitest";
import { localHostIds, sidebarHostFor } from "../shared/sidebar-placement";
import { chooseSidebarHost, placeSidebar, resetCopies, runningHosts } from "../client/sidebar-placement";
import { preferences } from "../shared/organization";

afterEach(() => { resetCopies(); vi.useRealTimers(); });

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

it("uses the only host running the plugin, else this computer's, unless another is picked on this device", () => {
  const local = new Set(["srv_mac"]);
  const both = new Set(["srv_mac", "srv_box"]);
  expect(sidebarHostFor({ chosen: null, localHosts: local, running: both, waited: false })).toBe("srv_mac");
  expect(sidebarHostFor({ chosen: "srv_box", localHosts: local, running: both, waited: false })).toBe("srv_box");
  // A pick whose copy isn't running goes back to this computer's.
  expect(sidebarHostFor({ chosen: "srv_gone", localHosts: local, running: both, waited: false })).toBe("srv_mac");
  // Only another host runs it: use that one, after a short wait in case this computer's copy is still starting.
  expect(sidebarHostFor({ chosen: null, localHosts: local, running: new Set(["srv_box"]), waited: false })).toBeNull();
  expect(sidebarHostFor({ chosen: null, localHosts: local, running: new Set(["srv_box"]), waited: true })).toBe("srv_box");
  expect(sidebarHostFor({ chosen: null, localHosts: local, running: new Set(), waited: true })).toBeNull();
  // A phone has no local host: its pick, or else the same host every time.
  expect(sidebarHostFor({ chosen: null, localHosts: new Set(), running: new Set(["srv_b", "srv_a"]), waited: false })).toBe("srv_a");
  expect(sidebarHostFor({ chosen: "srv_b", localHosts: new Set(), running: new Set(["srv_b", "srv_a"]), waited: false })).toBe("srv_b");
});

function copy(localHosts: Set<string>, initialChoice: string | null = null) {
  let hostId: string | null = null;
  const listeners = new Set<() => void>();
  let shown = 0;
  const stop = placeSidebar({ hostId: () => hostId, subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    localHosts, initialChoice, add: () => { shown++; return () => { shown--; }; } });
  return { stop, shown: () => shown, learn(id: string) { hostId = id; listeners.forEach((listener) => listener()); } };
}

it("moves the sidebar to the picked host's copy and back, and lists the hosts whose copies run", () => {
  vi.useFakeTimers();
  const mac = copy(new Set(["srv_mac"])), box = copy(new Set(["srv_mac"]));
  mac.learn("srv_mac"); box.learn("srv_box");
  expect([mac.shown(), box.shown()]).toEqual([1, 0]);
  expect([...runningHosts()].sort()).toEqual(["srv_box", "srv_mac"]);
  chooseSidebarHost("srv_box");
  expect([mac.shown(), box.shown()]).toEqual([0, 1]);
  chooseSidebarHost(null);
  expect([mac.shown(), box.shown()]).toEqual([1, 0]);
  // The picked host's copy stops: this computer's takes over.
  chooseSidebarHost("srv_box");
  box.stop();
  expect(mac.shown()).toBe(1);
  expect([...runningHosts()]).toEqual(["srv_mac"]);
  mac.stop();
  expect(mac.shown()).toBe(0);
});

it("uses another host's copy when it's the only one, and hands over when this computer's turns up", () => {
  vi.useFakeTimers();
  const box = copy(new Set(["srv_mac"]));
  box.learn("srv_box");
  expect(box.shown()).toBe(0);
  vi.advanceTimersByTime(5000);
  expect(box.shown()).toBe(1);
  const mac = copy(new Set(["srv_mac"]));
  mac.learn("srv_mac");
  expect([mac.shown(), box.shown()]).toEqual([1, 0]);
  mac.stop(); box.stop();
});

it("starts from a pick saved on this device before any sidebar has drawn", () => {
  const mac = copy(new Set(["srv_mac"]), "srv_box"), box = copy(new Set(["srv_mac"]), "srv_box");
  mac.learn("srv_mac"); box.learn("srv_box");
  expect([mac.shown(), box.shown()]).toEqual([0, 1]);
  mac.stop(); box.stop();
});

it("keeps existing device preferences when adding the picked host (version 1 to 2)", async () => {
  expect(preferences.version).toBe(2);
  const migrated = await preferences.migrate!({ collapsed: ["later"], sort: "name", stickyHeaders: false }, 1) as Record<string, unknown>;
  expect(migrated).toMatchObject({ collapsed: ["later"], sort: "name", stickyHeaders: false, sidebarHost: null });
});

it("ignores a shared record left by another version of the plugin in this window, rather than failing to start", () => {
  // An earlier version kept a differently shaped record under the old name; a copy on another host may still run it.
  Reflect.set(globalThis, "__workspaceOrganizerCopies", { local: new Set(), listeners: new Set() });
  const mac = copy(new Set(["srv_mac"]));
  mac.learn("srv_mac");
  expect(mac.shown()).toBe(1);
  mac.stop();
  Reflect.deleteProperty(globalThis, "__workspaceOrganizerCopies");
});

it("still adds the sidebar if coordinating with other copies fails", () => {
  const broken = { get copies(): never { throw new Error("broken"); } };
  for (const key of Reflect.ownKeys(globalThis).filter((key) => typeof key === "string" && key.startsWith("__workspaceOrganizerCopies"))) {
    Reflect.set(globalThis, key, broken);
  }
  Reflect.set(globalThis, "__workspaceOrganizerCopies.v2", broken);
  let shown = 0;
  expect(() => placeSidebar({ hostId: () => "srv_mac", subscribe: () => () => {}, localHosts: new Set(["srv_mac"]), initialChoice: null,
    add: () => { shown++; return () => { shown--; }; } })).not.toThrow();
  expect(shown).toBe(1);
  Reflect.deleteProperty(globalThis, "__workspaceOrganizerCopies.v2");
});
