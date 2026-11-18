import { useEffect, useState } from "react";

type Change<Values> = (values: Values) => Values;
type ReadySettings<Values> = { status: "ready"; values: Values; revision: string; saving: boolean; save(values: Values, revision: string): Promise<boolean> };
type SettingsLike<Values> = ReadySettings<Values> | { status: string };

/**
 * Saves changes to a settings document one after another. A save carries the revision it was based on, so a
 * second quick change sent before the first lands would be rejected as a conflict. Changes made meanwhile queue
 * up and are applied to the saved values once the first save's revision arrives. Queued changes show at once.
 */
export function useQueuedSave<Values>(settings: SettingsLike<Values>) {
  const [queue, setQueue] = useState<Change<Values>[]>([]);
  // The save in flight: the revision it was based on and how many queued changes it carried.
  const [sending, setSending] = useState<{ revision: string; count: number } | null>(null);
  const ready = settings.status === "ready" ? settings as ReadySettings<Values> : null;
  // Once the saved revision arrives, the changes it carried are part of the values and leave the queue.
  const landed = Boolean(sending && ready && ready.revision !== sending.revision);
  const waiting = landed ? queue.slice(sending!.count) : queue;

  useEffect(() => {
    if (landed) { const count = sending!.count; setQueue((current) => current.slice(count)); setSending(null); return; }
    if (!ready || sending || !queue.length || ready.saving) return;
    const count = queue.length;
    setSending({ revision: ready.revision, count });
    void ready.save(queue.reduce((values, change) => change(values), ready.values), ready.revision)
      .catch(() => false)
      .then((saved: boolean) => {
        // A failed save drops its changes; the settings hook reports the error.
        if (!saved) { setQueue((current) => current.slice(count)); setSending(null); }
      });
  }, [landed, ready?.revision, ready?.saving, queue, sending]);

  return {
    values: ready ? waiting.reduce((values, change) => change(values), ready.values) : null,
    update: (change: Change<Values>) => { if (ready) setQueue((current) => [...current, change]); },
  };
}
