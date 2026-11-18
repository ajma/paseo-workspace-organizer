import { expect, it, vi } from "vitest";
import contribute from "../index.server";
import { organization } from "../shared/organization";
import { cards } from "../shared/cards";
import { celebrationSettings } from "../shared/celebration/settings";

// Every host-scoped settings document the client reads must be registered by the server entry.
it("registers every host-scoped settings document", () => {
  const registered: string[] = [];
  const server = { registerSettings: vi.fn((definition: { id: string }) => { registered.push(definition.id); return { read: vi.fn(), subscribe: vi.fn() }; }), handle: vi.fn() };
  contribute(server as never);
  expect(registered.sort()).toEqual([cards.id, celebrationSettings.id, organization.id].sort());
  expect([cards, celebrationSettings, organization].every((definition) => definition.scope === "host")).toBe(true);
});
