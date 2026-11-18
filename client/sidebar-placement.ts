// Adds the sidebar view only from the copy that should show it (see showsSidebar), once the copy knows its host.
import { showsSidebar } from "../shared/sidebar-placement";

export function placeSidebar({ hostId, subscribe, localHosts, add }: {
  hostId: () => string | null; subscribe: (listener: () => void) => () => void; localHosts: ReadonlySet<string>;
  add: () => () => void;
}): () => void {
  let remove: (() => void) | null = null;
  const update = () => {
    const show = showsSidebar({ hostId: hostId(), localHosts });
    if (show && !remove) remove = add();
    if (!show && remove) { remove(); remove = null; }
  };
  const unsubscribe = subscribe(update);
  update();
  return () => { unsubscribe(); remove?.(); remove = null; };
}
