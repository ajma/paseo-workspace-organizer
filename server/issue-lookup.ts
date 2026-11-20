import { lookUpNumber, type NumberLookup } from "./link-resolve";

// Remembers what GitHub says a repository's issue number is: its canonical URL (which also tells a PR from an issue),
// or null when it doesn't exist or couldn't be asked. Each number is asked about once; a miss is retried after 10
// minutes. Listeners hear when an answer arrives, so the index can send the new link.
export function createIssueLookup(lookUp: NumberLookup = lookUpNumber, now: () => number = Date.now, retryMs = 10 * 60_000) {
  const answers = new Map<string, { url: string | null; at: number }>();
  const pending = new Set<string>();
  const listeners = new Set<() => void>();
  let disposed = false;
  return {
    get(repository: string, number: number): string | null | undefined {
      const key = `${repository}#${number}`;
      const known = answers.get(key);
      if (known && (known.url !== null || now() - known.at < retryMs)) return known.url;
      if (!pending.has(key)) {
        pending.add(key);
        lookUp(repository, number).then((url) => url || null, () => null).then((url) => {
          pending.delete(key);
          if (disposed) return;
          answers.set(key, { url, at: now() });
          listeners.forEach((listener) => listener());
        });
      }
      return known?.url;
    },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() { disposed = true; listeners.clear(); },
  };
}
