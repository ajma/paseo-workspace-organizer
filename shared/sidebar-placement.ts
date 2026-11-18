// Paseo loads a copy of the plugin for each host that has it installed and shows the sidebar view of whichever copy
// it finds first, whatever its host. Each copy reads its own host's groups, so this decides which copy offers it.

const LOOPBACK = /^(?:localhost|127(?:\.\d{1,3}){3}|\[?::1\]?)(?::\d+)?$/i;

// This computer's hosts: those Paseo's saved host list reaches with a direct connection to a loopback address.
// The list's format isn't a public contract, so anything unexpected means none.
export function localHostIds(registry: string | null): Set<string> {
  const ids = new Set<string>();
  try {
    const hosts: unknown = JSON.parse(registry ?? "[]");
    if (!Array.isArray(hosts)) return ids;
    for (const host of hosts as { serverId?: unknown; connections?: unknown }[]) {
      if (typeof host?.serverId !== "string" || !Array.isArray(host.connections)) continue;
      const local = (host.connections as { id?: unknown; type?: unknown; endpoint?: unknown }[]).some((connection) => {
        const endpoint = typeof connection?.endpoint === "string" ? connection.endpoint
          : typeof connection?.id === "string" && connection.id.startsWith("direct:") ? connection.id.slice("direct:".length) : null;
        return endpoint !== null && LOOPBACK.test(endpoint.replace(/^[a-z]+:\/\//i, "").replace(/\/.*$/, ""));
      });
      if (local) ids.add(host.serverId);
    }
  } catch { /* Unreadable storage: no local host is known. */ }
  return ids;
}

// On a computer with a local host, only that host's copy shows the sidebar, so other hosts' groups never appear; a
// copy waits until it knows its host. Without one (a phone, or the web away from the daemon), any copy offers it.
export function showsSidebar({ hostId, localHosts }: { hostId: string | null; localHosts: ReadonlySet<string> }): boolean {
  if (localHosts.size === 0) return true;
  return hostId !== null && localHosts.has(hostId);
}
