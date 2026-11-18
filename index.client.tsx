import type { PluginClientContext, PluginScreenProps } from "@getpaseo/plugin/client";
import { useEffect, useState } from "react";
import { ExternalLink } from "@getpaseo/plugin/client/ui";
import { Text, View } from "react-native";
import { OrganizerSidebar } from "./client/sidebar";
import { createWorkspaceIndex } from "./client/workspace-index";
import { createProjectIconStore } from "./client/project-icons";
import { logoSvg } from "./client/logo";
import { NewWorkspaceGroupPicker } from "./client/new-workspace-group";
import { createLabelColorStore } from "./client/label-colors";
import { createRemoteWorkspaces } from "./client/remote-workspaces";
import { disposeProviderCatalogs } from "./client/agents";
import { CardSettingsScreen } from "./client/card-settings";
import { contributeCelebration } from "./client/celebration/contribute";
import { placeSidebar } from "./client/sidebar-placement";
import { readLocalHostIds } from "./client/web";

// Opens a workspace for Command Center results and merge celebrations. Without a host it opens on this screen's host.
function JumpToWorkspace({ navigation, params, theme, host }: PluginScreenProps) {
  const serverId = params.serverId ?? host.id;
  useEffect(() => {
    if (params.workspaceId) navigation?.openWorkspace({ workspaceId: params.workspaceId, serverId });
  }, [navigation, params.workspaceId, serverId]);
  return <View style={{ padding: 16 }}><Text style={{ color: theme.colors.foregroundMuted }}>
    {navigation ? "Opening workspace…" : "Update the Paseo app to open this workspace."}
  </Text></View>;
}

// Opens a link from a sidebar row as a browser tab in that row's workspace. The sidebar itself has no access to
// Paseo's workspace browser, but screens do. The desktop app is the only place that has one.
function OpenLinkInBrowser({ navigation, params, theme }: PluginScreenProps) {
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const openBrowser = navigation?.openBrowser;
    if (openBrowser && params.url && params.workspaceId) openBrowser({ url: params.url, workspaceId: params.workspaceId, serverId: params.serverId });
    else setUnavailable(true);
  }, [navigation, params.url, params.workspaceId, params.serverId]);
  return <View style={{ padding: 16, gap: 8 }}>
    <Text style={{ color: theme.colors.foregroundMuted }}>{unavailable ? "This Paseo app has no workspace browser." : "Opening link…"}</Text>
    {unavailable && params.url ? <ExternalLink href={params.url}>Open {params.url}</ExternalLink> : null}
  </View>;
}

export default function contribute(client: PluginClientContext) {
  const index = createWorkspaceIndex(client);
  const icons = createProjectIconStore(client);
  const labelColors = createLabelColorStore(client);
  const remoteWorkspaces = createRemoteWorkspaces();
  // A Group dropdown on the New workspace screen; the sidebar files the new workspace into the group picked there.
  const removeNewWorkspaceItem = client.addNewWorkspaceItem({ id: "group", Component: NewWorkspaceGroupPicker });
  const removeSettings = client.addSettingsScreen({ id: "cards", title: "Sidebar", icon: { svg: logoSvg }, Component: CardSettingsScreen });
  const removeScreen = client.addScreen({ id: "jump", title: "Open workspace", Component: JumpToWorkspace });
  const removeLinkScreen = client.addScreen({ id: "open-link", title: "Open link", Component: OpenLinkInBrowser });
  // With the plugin on several hosts, Paseo shows one copy's sidebar whatever its host, and each copy has its own host's
  // groups; so the copy on this computer's host offers it, and another host's only when that copy isn't running.
  const removeSidebar = placeSidebar({ hostId: () => index.getSnapshot()?.hostId ?? null, subscribe: index.subscribe,
    localHosts: readLocalHostIds(), add: () => client.addSidebarView({
    id: "organized-workspaces", title: "Workspace organizer",
    description: "Nested custom groups with multiline notes, tags, PRs and issues",
    Component: (props) => <OrganizerSidebar {...props} index={index} icons={icons} labelColors={labelColors} remoteWorkspaces={remoteWorkspaces}
      openCardSettings={() => client.openSettings("cards")}
      openInBrowser={(url, workspace) => client.openScreen({ screenId: "open-link", params: { url, workspaceId: workspace.id, serverId: workspace.hostId } })} />,
  }) });
  const removeCelebration = contributeCelebration(client, {
    openWorkspace: (workspaceId) => client.openScreen({ screenId: "jump", params: { workspaceId } }) });
  return () => { removeCelebration(); index.dispose(); icons.dispose(); labelColors.dispose(); remoteWorkspaces.dispose(); disposeProviderCatalogs(); void removeSidebar(); void removeScreen(); void removeLinkScreen(); void removeSettings(); void removeNewWorkspaceItem(); };
}
