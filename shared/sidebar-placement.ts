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

// Whose copy shows the sidebar, from the hosts whose copies are running: the one picked on this device, else this
// computer's, else (one host, or a phone) the first by id, the same every time. While this computer's copy or the
// picked one may still be starting, another host's waits briefly; null means no copy shows it yet.
export function sidebarHostFor({ chosen, localHosts, running, waited }: {
  chosen: string | null; localHosts: ReadonlySet<string>; running: ReadonlySet<string>; waited: boolean;
}): string | null {
  if (chosen !== null && running.has(chosen)) return chosen;
  const local = [...localHosts].sort().find((id) => running.has(id));
  if (local) return local;
  const first = [...running].sort()[0] ?? null;
  const expectingAnother = chosen !== null || localHosts.size > 0;
  return expectingAnother && !waited ? null : first;
}
