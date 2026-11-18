import { useEffect } from "react";
import { Platform } from "react-native";
import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { createCelebrationStore } from "./store";
import { createPresentationStore, type PresentationStore } from "./presentation";
import { mountBrowserOverlay } from "./web";
import { startLiveEvents, reportPresented } from "./events";
import { SettingsScreen, useSettingsBridge } from "./settings";
import { previewCelebration } from "../../shared/celebration/celebration";

export const CELEBRATION_SETTINGS_ID = "celebration";

// The overlay lives outside Paseo's tree, so a hidden footer item passes it the current theme and settings.
function ThemeBridge({ theme, presentation }: PluginSidebarItemProps & { presentation: PresentationStore }) {
  useEffect(() => {
    presentation.update(theme);
  }, [theme, presentation]);
  useSettingsBridge(presentation);
  return null;
}

/**
 * Celebrates merged pull requests with confetti and a recap over the whole window. Desktop and web only: phones
 * have no document to draw the overlay on. `openWorkspace` opens a workspace on the installation's host.
 */
export function contributeCelebration(client: PluginClientContext, { openWorkspace }: { openWorkspace: (workspaceId: string) => void }) {
  if (Platform.OS !== "web") return () => {};
  const store = createCelebrationStore();
  const presentation = createPresentationStore();
  const unmount = mountBrowserOverlay({
    store,
    presentation,
    onOpenWorkspace: openWorkspace,
    async onArchive(workspaceId) {
      const result = await client.paseo.workspaces.archive(workspaceId);
      if (result.error) throw new Error(result.error);
    },
    onPresented(id) {
      void reportPresented(client, store, id);
    },
  });
  let stopEvents = () => {};
  let started = false;
  const removeSettingsGate = presentation.subscribe(() => {
    if (started || !presentation.settingsReady()) return;
    started = true;
    stopEvents = startLiveEvents(client, {
      ...store,
      show(event) {
        if (presentation.getSettings().enabled) store.show(event);
        else void reportPresented(client, store, event.id);
      },
    });
  });
  function preview() {
    store.show({ ...previewCelebration, id: `preview-${Date.now()}-${Math.random()}` });
  }
  function Bridge(props: PluginSidebarItemProps) {
    return <ThemeBridge {...props} presentation={presentation} />;
  }
  const removeTheme = client.addSidebarFooterItem({ id: "celebration-theme", title: "Merge celebration", Component: Bridge });
  const removeSettings = client.addSettingsScreen({
    id: CELEBRATION_SETTINGS_ID,
    title: "Merge celebration",
    icon: "PartyPopper",
    Component: (props) => <SettingsScreen {...props} presentation={presentation} onPreview={preview} />,
  });
  const removePreview = client.addCommandCenterItem({
    id: "preview-celebration",
    title: "Preview merge celebration",
    icon: "PartyPopper",
    keywords: ["confetti", "celebrate", "merged"],
    context: "global",
    onSelect: preview,
  });
  const removeOpenSettings = client.addCommandCenterItem({
    id: "celebration-settings",
    title: "Merge celebration settings",
    icon: "Settings",
    keywords: ["confetti", "celebrate", "merged", "preferences"],
    context: "global",
    onSelect({ openSettings }) {
      openSettings(CELEBRATION_SETTINGS_ID);
    },
  });
  return () => {
    removeOpenSettings();
    removePreview();
    removeSettings();
    removeTheme();
    removeSettingsGate();
    stopEvents();
    unmount?.();
    store.clear();
  };
}
