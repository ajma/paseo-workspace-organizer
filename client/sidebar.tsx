import {
  getPaseoClient, openExternalUrl, useAgent, useHosts, useProjects, useSettings, useWorkspace, useWorkspaces,
  type AgentRef, type PluginSidebarViewProps, type WorkspaceRef,
} from "@getpaseo/plugin/client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { descendants, preferences, dissolveGroup, emptyDetails, matchesSearch, mergeLinks, organization, placeGroup, placeWorkspace, searchTerms,
  type Group, type Organization } from "../shared/organization";
import { prBucket, prBuckets, type GroupBy } from "../shared/grouping";
import { useDragDrop, useDragging, useTargetGroup, type DragPayload, type DropPosition } from "./drag";
import { Button, ErrorText, type Theme } from "./controls";
import { GroupEditor, groupPath, RenameEditor, WorkspaceEditor, type Save } from "./editors";
import { useWorkspaceIndex, type WorkspaceIndex } from "./workspace-index";
import type { IndexEvent } from "../shared/workspace-index";
import { exactTag, facetKey, facetKeys, filtersSchema, hasFilters, matchesFilters, prFilters, statuses, tagName, type FilterOptionIds } from "../shared/search";
import { SearchToolbar } from "./search-toolbar";
import { useQueuedSave } from "./queued-save";
import { useBracketShortcuts } from "./paseo-shortcuts";
import { githubRepositoryOf } from "../shared/link-resolve";
import type { GithubLink } from "../shared/organization";
import { chooseSidebarHost, initializeSidebarHost, useSidebarHosts } from "./sidebar-placement";
import { sidebarHostFor } from "../shared/sidebar-placement";
import { Dropdown } from "./dropdown";
import { githubStatusLabel, type GithubStatus } from "../shared/github-status";
import { font } from "./typography";
import { formatActivity, lastActivityAt, runTimes } from "../shared/activity";
import { agentLabels } from "../shared/agent-labels";
import { cards, defaultCardSettings, effectiveCard, type CardField, type CardMode, type LabelLimit, type TitleLines } from "../shared/cards";
import { copyText, Icon, useToast } from "@getpaseo/plugin/client/ui";
import { WorkspaceCardView, type CardLink, type CardModel } from "./card";
import { useProviderCatalog, useWorkspaceAgents } from "./agents";
import { compareWorkspaces, type SortMode } from "../shared/sort";
import { ProjectIconView, type ProjectIconStore } from "./project-icons";
import { useLabelColors, type LabelColorStore } from "./label-colors";
import { useRemoteWorkspaces, type RemoteWorkspaces } from "./remote-workspaces";
import { archiveWorkspace, useArchiveShortcut, useRowArchiver } from "./archive-shortcut";
import { Leaving } from "./motion";
import { Collapsible, TurningChevron } from "./collapsible";
import { backgroundBehind, historyShortcutLabel, hostBadge, isElectron, onHistoryInput, readHostAppearance, readLocalHostIds } from "./web";
import { detectedStatus, workspaceEntry } from "../shared/workspace-entry";
import type { PluginWorkspaceSnapshot } from "@getpaseo/plugin";
import type { ToolbarChip } from "../shared/toolbar";
import { useWorkspaceHistory } from "./history";
import { fileNewWorkspaces, GROUP_METADATA_KEY } from "../shared/new-workspace-group";
import { identityText, isDarkSurface, tagGroupColor, type IdentityColor } from "../shared/identity-colors";

type Snapshot = PluginWorkspaceSnapshot;

// One clock for every row so relative activity times stay current.
function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(timer); }, [intervalMs]);
  return now;
}

type ReadySettings = Extract<ReturnType<typeof useSettings<typeof organization.schema>>, { status: "ready" }>;
type ResolveLinks = (input: { hostId: string; workspaceId: string; repository: string | null; numbers: number[] }) =>
  Promise<{ links: GithubLink[]; errors: string[] }>;
type Editor = { kind: "group"; group?: Group; parentId: string | null } | { kind: "workspace"; key: string; title: string }
  | { kind: "rename"; reference: WorkspaceRef; title: string; defaultName: string } | null;

type CardConfig = { fields: ReadonlySet<CardField>; labelLimit: LabelLimit; titleLines: TitleLines };

function linkTone(status: GithubStatus | undefined): CardLink["tone"] {
  if (status?.state === "merged") return "success";
  if (status?.checks === "failure" || status?.review === "changes_requested") return "danger";
  return status?.checks === "success" ? "success" : "muted";
}

// The workspace's latest top-level agent, resolved to readable provider, model and thinking names.
function WithAgent({ agent, hostId, children }: { agent: AgentRef; hostId: string; children: (agent: CardModel["agent"]) => ReactNode }) {
  const snapshot = useAgent(agent, (item) => ({ provider: item.provider, model: item.model, thinkingOptionId: item.thinkingOptionId, status: item.status }));
  const catalog = useProviderCatalog(hostId);
  return <>{children(snapshot ? { ...agentLabels(catalog, snapshot), modelId: snapshot.model, status: snapshot.status } : null)}</>;
}

function WorkspaceRow({ reference, theme, navigation, active, now, details, detectedLinks, git, github, hostLabel, hostIconOnly, hostColor, card, icons, installationHostId, labelList, onEdit, onRename, drag, openInBrowser }: {
  reference: WorkspaceRef; theme: Theme; navigation: PluginSidebarViewProps["navigation"]; active: string | undefined; now: number;
  details: ReturnType<typeof emptyDetails>; detectedLinks: ReturnType<typeof mergeLinks>; git: CardModel["git"]; hostLabel?: string;
  hostIconOnly: boolean; hostColor: IdentityColor | null;
  github: Record<string, GithubStatus>; card: CardConfig; icons?: ProjectIconStore; installationHostId?: string;
  labelList: readonly { name: string; color: IdentityColor }[];
  onEdit: (title: string) => void; onRename: (title: string, defaultName: string) => void; drag: DragSpec;
  openInBrowser?: (url: string, workspace: WorkspaceRef) => void;
}) {
  const workspace = useWorkspace(reference);
  const agents = useWorkspaceAgents(reference);
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const dnd = useDragDrop({ ...drag, label: workspace?.title ?? workspace?.name ?? "Workspace" });
  // Archiving animates the row away first, then asks the host; if that fails the row comes back.
  const [leaving, setLeaving] = useState(false);
  const archive = () => setLeaving(true); // setting it again while leaving changes nothing
  useRowArchiver(reference.key, archive);
  if (!workspace) return null;
  const title = workspace.title ?? workspace.name;
  const activityAt = lastActivityAt([workspace.lastPromptAt, workspace.statusEnteredAt, workspace.createdAt]);
  const base: Omit<CardModel, "agent"> = {
    title, workspaceName: workspace.name, indicator: workspace.indicator, indicatorLabel: workspace.indicatorLabel,
    project: workspace.projectDisplayName, hostLabel, hostColor, hostIconOnly,
    branch: workspace.branch, git, directory: workspace.directory,
    projectPath: workspace.projectRootPath, statusSince: lastActivityAt([workspace.statusEnteredAt]), lastActivityAt: activityAt,
    labels: [...new Set([...workspace.labels, ...details.tags])].map((name) => ({ name,
      source: workspace.labels.includes(name) ? "label" as const : "tag" as const,
      color: labelList.find((label) => label.name.toLowerCase() === name.toLowerCase())?.color ?? tagGroupColor(tagName(name), labelList, tagName) })),
    notes: details.subtitle || null,
    links: mergeLinks(detectedLinks, details.links).map((link) => ({ ...link, status: githubStatusLabel(github[link.url]) || null,
      tone: linkTone(github[link.url]), hint: [githubStatusLabel(github[link.url]), github[link.url]?.error].filter(Boolean).join(". "),
      state: github[link.url]?.state, checks: github[link.url]?.checks ?? null, review: github[link.url]?.review ?? null })),
    subtasks: { running: agents.running, done: agents.done, failed: agents.failed },
    timer: runTimes(workspace, now), lastActivity: activityAt === null ? null : formatActivity(activityAt, now),
  };
  const render = (agent: CardModel["agent"]) => <WorkspaceCardView theme={theme} model={{ ...base, agent }} fields={card.fields}
    labelLimit={card.labelLimit} titleLines={card.titleLines} active={active === reference.key}
    nodeRef={dnd.ref} dropLine={dnd.position === "inside" ? null : dnd.position}
    projectIcon={<ProjectIconView project={workspace.project} store={icons} installationHostId={installationHostId} size={font.md} color={theme.colors.foregroundMuted} />}
    onOpen={() => navigation.openWorkspace(reference)}
    actions={{
      onArchive: archive,
      onEdit: () => onEdit(title),
      onRename: () => onRename(title, workspace.name),
      onCopyPath: workspace.directory ? () => void copyText(workspace.directory).then(() => toast.show("Path copied")) : undefined,
      onCopyBranch: workspace.branch ? () => void copyText(workspace.branch!).then(() => toast.show("Branch name copied")) : undefined,
      pinned: Boolean(workspace.pinnedAt),
      onTogglePin: () => {
        try {
          void getPaseoClient(reference.hostId).workspaces.ref(reference.id).setPinned(!workspace.pinnedAt)
            .catch((failure: unknown) => toast.error(`Couldn't ${workspace.pinnedAt ? "unpin" : "pin"} workspace: ${failure instanceof Error ? failure.message : String(failure)}`));
        } catch { toast.error("Host is not connected."); }
      },
    }}
    onOpenLink={(url) => {
      setError(null);
      // In the desktop app links open as a browser tab in this workspace; elsewhere Paseo has no workspace browser.
      if (openInBrowser && isElectron()) { openInBrowser(url, reference); return; }
      void openExternalUrl(url).catch((failure: unknown) => setError(String(failure)));
    }}>
    <ErrorText theme={theme} message={error} />
  </WorkspaceCardView>;
  return <Leaving leaving={leaving} onGone={() => archiveWorkspace(reference, toast, undefined, () => setLeaving(false))}>
    {agents.main ? <WithAgent agent={agents.main} hostId={reference.hostId}>{render}</WithAgent> : render(null)}
  </Leaving>;
}

export function OrganizerSidebar(props: PluginSidebarViewProps & { index: WorkspaceIndex; icons?: ProjectIconStore; labelColors?: LabelColorStore;
  openCardSettings?: () => void; remoteWorkspaces?: RemoteWorkspaces; openInBrowser?: (url: string, workspace: WorkspaceRef) => void;
  resolveLinks?: ResolveLinks }) {
  const settings = useSettings(organization);
  const device = useSettings(preferences);
  // Per-device preferences, with quick successive changes saved one after another.
  const { values: prefs, update: updatePrefs } = useQueuedSave(device);
  const runtime = useWorkspaceIndex(props.index);
  // Groups from: when several hosts run the plugin, the saved pick tells every copy whose sidebar to show.
  const sidebarHosts = useSidebarHosts();
  const allHosts = useHosts();
  const savedHost = prefs ? prefs.sidebarHost : undefined;
  // Switching hands the sidebar to another copy and removes this one, so it only happens once the pick is saved: this
  // effect runs after the preference queue has sent it. A sidebar's first value only fills in a missing pick.
  const seenHost = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (savedHost === undefined) return;
    if (seenHost.current === undefined) initializeSidebarHost(savedHost);
    else if (seenHost.current !== savedHost) chooseSidebarHost(savedHost);
    seenHost.current = savedHost;
  }, [savedHost]);
  const localHosts = readLocalHostIds();
  const hostChoice = sidebarHosts.running.length > 1 ? {
    hosts: sidebarHosts.running.map((id) => ({ id, label: `${allHosts.find((host) => host.serverId === id)?.label ?? id}${localHosts.has(id) ? " (this computer)" : ""}` })),
    current: sidebarHostFor({ chosen: sidebarHosts.chosen, localHosts, running: new Set(sidebarHosts.running), waited: true }),
    // This computer's host is the default, so picking it clears the pick.
    choose: (id: string) => { const sidebarHost = localHosts.has(id) ? null : id; updatePrefs((values) => ({ ...values, sidebarHost })); },
  } : undefined;
  useArchiveShortcut(props.active.workspace);
  const cardSettings = useSettings(cards);
  const card = effectiveCard(cardSettings.status === "ready" ? cardSettings.values : defaultCardSettings(), props.layout.compact,
    prefs ? prefs.titleLines : "2");
  if (settings.status !== "ready") return <View style={{ padding: 12, gap: 8 }}>
    <Text style={{ color: props.theme.colors.foregroundMuted, fontSize: font.md }}>{settings.status === "loading" ? "Loading workspace organization…" : settings.error}</Text>
    {settings.status !== "loading" ? <Button theme={props.theme} label="Retry loading organization" onPress={() => void settings.reload()} /> : null}
  </View>;
  const cardMode = { ready: cardSettings.status === "ready" && !cardSettings.saving,
    value: cardSettings.status === "ready" ? cardSettings.values.mode : "custom" as CardMode,
    set: (mode: CardMode) => { if (cardSettings.status === "ready") void cardSettings.save({ ...cardSettings.values, mode }, cardSettings.revision); } };
  return <WorkspaceTree {...props} settings={settings} runtime={runtime} cardMode={cardMode}
    card={card}
    // Without a browser-tab opener, rows fall back to the default browser.
    openInBrowser={!prefs || prefs.linksInPaseo ? props.openInBrowser : undefined}
    collapsed={prefs ? prefs.collapsed : []}
    canCollapse={Boolean(prefs)}
    toggleCollapsed={(id) => updatePrefs((values) => ({ ...values, collapsed: values.collapsed.includes(id)
      ? values.collapsed.filter((item) => item !== id) : [...values.collapsed, id] }))}
    setCollapsed={(ids, collapse) => updatePrefs((values) => ({ ...values, collapsed: collapse
      ? [...new Set([...values.collapsed, ...ids])] : values.collapsed.filter((item) => !ids.includes(item)) }))}
    sort={prefs ? prefs.sort : "manual"}
    canSort={Boolean(prefs)}
    setSort={(sort) => updatePrefs((values) => ({ ...values, sort }))}
    hostChoice={hostChoice}
    toolbar={prefs ? { order: prefs.toolbarOrder, labels: prefs.toolbarLabels,
      setOrder: (toolbarOrder) => updatePrefs((values) => ({ ...values, toolbarOrder })),
      setLabels: (toolbarLabels) => updatePrefs((values) => ({ ...values, toolbarLabels })) } : undefined}
    stickyHeaders={prefs ? prefs.stickyHeaders : true}
    groupBy={prefs ? prefs.groupBy : "groups"}
    setGroupBy={(groupBy) => updatePrefs((values) => ({ ...values, groupBy }))}
    displayError={device.status === "invalid" || device.status === "error" ? device.error : device.saveError} />;
}

function WorkspaceTree({ theme, navigation, active, layout, settings, runtime, collapsed, toggleCollapsed, setCollapsed, canCollapse, sort, setSort, canSort, groupBy, setGroupBy, toolbar, hostChoice, stickyHeaders, displayError, index, icons, labelColors, card, openCardSettings, cardMode, remoteWorkspaces, openInBrowser, resolveLinks }: PluginSidebarViewProps & {
  settings: ReadySettings; runtime: IndexEvent | null; collapsed: string[]; toggleCollapsed: (id: string) => void;
  setCollapsed: (ids: string[], collapse: boolean) => void;
  sort: SortMode; setSort: (sort: SortMode) => void; canSort: boolean; groupBy: GroupBy; setGroupBy: (groupBy: GroupBy) => void;
  toolbar?: { order: readonly string[]; labels: boolean; setOrder: (order: ToolbarChip[]) => void; setLabels: (labels: boolean) => void };
  hostChoice?: { hosts: { id: string; label: string }[]; current: string | null; choose: (id: string) => void };
  stickyHeaders: boolean;
  canCollapse: boolean; displayError: string | null; index: WorkspaceIndex; icons?: ProjectIconStore; labelColors?: LabelColorStore; card: CardConfig; openCardSettings?: () => void;
  cardMode: { ready: boolean; value: CardMode; set: (mode: CardMode) => void }; remoteWorkspaces?: RemoteWorkspaces; resolveLinks?: ResolveLinks;
  openInBrowser?: (url: string, workspace: WorkspaceRef) => void;
}) {
  const labelList = useLabelColors(labelColors);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState(() => filtersSchema.parse({}));
  const [editor, setEditor] = useState<Editor>(null);
  const lastEditor = useRef<{ title: string; element: ReactNode } | null>(null);
  const [treeHeight, setTreeHeight] = useState(0), [toolbarHeight, setToolbarHeight] = useState(0);
  const now = useNow(60_000);
  const hosts = useHosts();
  // Rows follow each host's badge choice in Paseo (Name, Icon or Hidden), with Paseo's defaults.
  const hostAppearance = readHostAppearance();
  const hostBadgeFor = (hostId: string) => hostBadge(hostAppearance.get(hostId)?.badge, hostId === runtime?.hostId);
  const remote = useRemoteWorkspaces(remoteWorkspaces,
    hosts.filter((host) => host.status === "online" && host.serverId !== runtime?.hostId).map((host) => host.serverId));
  // PR links and git status: this installation's host from the daemon side, every other host from its own workspace list.
  const entryFor = (hostId: string, id: string) => {
    if (runtime?.hostId === hostId) return runtime.entries.find((item) => item.id === id) ?? null;
    const workspace = remote?.get(hostId, id);
    return workspace ? workspaceEntry(workspace) : null;
  };
  const githubFor = (hostId: string, id: string): Record<string, GithubStatus> => {
    const workspace = runtime?.hostId === hostId ? undefined : remote?.get(hostId, id);
    const url = workspace?.githubRuntime?.pullRequest?.url, status = workspace ? detectedStatus(workspace) : null;
    return { ...(url && status ? { [url]: status } : {}), ...(runtime?.github ?? {}) };
  };
  const value = settings.values;
  const searching = Boolean(query.trim()) || hasFilters(filters);
  const visibleWorkspace = (workspace: { background: boolean; archivingAt: string | null }) => !workspace.background && !workspace.archivingAt;
  const tagGroups = useWorkspaces({ where: visibleWorkspace, groupBy: (workspace) => {
    const names = [...workspace.labels, ...(value.workspaces[workspace.ref.key]?.tags ?? [])].map(tagName).filter(Boolean);
    return [...new Map(names.map((name) => [name.toLowerCase(), name]))].map(([key, title]) => ({ key, title }));
  } });
  const fullTags = useWorkspaces({ where: visibleWorkspace, groupBy: (workspace) => {
    const names = [...workspace.labels, ...(value.workspaces[workspace.ref.key]?.tags ?? [])].map((name) => name.trim()).filter(Boolean);
    return [...new Map(names.map((name) => [name.toLowerCase(), name]))].map(([key, title]) => ({ key, title }));
  } });
  // Each tag group lists its individual tags beneath it, unless its only tag is the group name itself.
  const tagOptions = tagGroups.map((group) => {
    const label = group.title ?? group.key;
    const children = fullTags.map((tag) => tag.title ?? tag.key)
      .filter((tag) => tagName(tag).toLowerCase() === group.key)
      .sort((a, b) => a.localeCompare(b));
    const single = children.length === 1 && children[0].toLowerCase() === group.key;
    return { id: group.key, label, children: single ? [] : children.map((tag) => ({ id: exactTag(tag), label: tag })) };
  }).sort((a, b) => a.label.localeCompare(b.label));
  const projectGroups = useWorkspaces({ where: visibleWorkspace, groupBy: (workspace) => ({
    key: workspace.project.key, title: workspace.projectDisplayName }) });
  const projectRefs = useProjects();
  // Name each project plainly; add "on <host>" only when another listed project shares its name.
  const projectOptions = projectGroups.map((group) => {
    const name = group.title ?? group.key;
    const hostId = group.items[0]?.hostId;
    const shared = projectGroups.filter((other) => (other.title ?? other.key).toLowerCase() === name.toLowerCase()).length > 1;
    const hostLabel = hosts.find((host) => host.serverId === hostId)?.label ?? hostId;
    return { id: group.key, label: shared && hostLabel ? `${name} on ${hostLabel}` : name,
      project: projectRefs.find((ref) => ref.key === group.key) };
  }).sort((a, b) => a.label.localeCompare(b.label));
  const prStatesFor = (workspace: Snapshot) => {
    const statuses = githubFor(workspace.hostId, workspace.id);
    return mergeLinks(entryFor(workspace.hostId, workspace.id)?.links ?? [], value.workspaces[workspace.ref.key]?.links ?? [])
      .filter((link) => link.kind === "pr").map((link) => statuses[link.url]?.state ?? "unknown");
  };
  const factsFor = (workspace: Snapshot) => ({ indicator: workspace.indicator,
    tags: [...workspace.labels, ...(value.workspaces[workspace.ref.key]?.tags ?? [])],
    hostId: workspace.hostId, projectKey: workspace.project.key, prStates: prStatesFor(workspace) });
  const matchesQuery = (workspace: Snapshot) => {
    const details = value.workspaces[workspace.ref.key] ?? emptyDetails();
    const detected = entryFor(workspace.hostId, workspace.id)?.links ?? [];
    return matchesSearch(query, searchTerms(workspace.title ?? workspace.name, workspace.branch, workspace.labels, details,
      mergeLinks(detected, details.links), details.groupId ? [groupPath(value.groups, details.groupId)] : []));
  };
  const shown = (workspace: Snapshot) => visibleWorkspace(workspace) && matchesFilters(factsFor(workspace), filters) && matchesQuery(workspace);
  // How many workspaces each filter option would show, given the search text and the other tabs' selections.
  const facetOptions: FilterOptionIds = { statuses, prs: prFilters,
    tags: tagOptions.flatMap((option) => [option.id, ...(option.children ?? []).map((child) => child.id)]),
    hostIds: hosts.map((host) => host.serverId), projectKeys: projectOptions.map((option) => option.id) };
  const facets = useWorkspaces({ where: (workspace) => visibleWorkspace(workspace) && matchesQuery(workspace),
    groupBy: (workspace) => facetKeys(factsFor(workspace), filters, facetOptions) });
  const filterCounts = new Map(facets.map((facet) => [facet.key, facet.items.length]));
  const orderBy = compareWorkspaces(sort, value.workspaceOrder);
  const refs = useWorkspaces({ where: shown, orderBy });
  // Automatic groups: each workspace's host, project or most active PR.
  const projectLabel = (key: string) => projectOptions.find((option) => option.id === key)?.label;
  const autoGroups = useWorkspaces({ where: shown, orderBy, groupBy: (workspace) => {
    if (groupBy === "host") return { key: workspace.hostId, title: hosts.find((host) => host.serverId === workspace.hostId)?.label ?? workspace.hostId };
    if (groupBy === "project") return { key: workspace.project.key, title: projectLabel(workspace.project.key) ?? workspace.projectDisplayName };
    if (groupBy === "pr") return prBucket(prStatesFor(workspace));
    // No grouping: one bucket, drawn without a header.
    if (groupBy === "none") return { key: "all", title: "" };
    return "all";
  } });
  const fixedOrder = groupBy === "pr" ? prBuckets : null;
  const buckets = groupBy === "groups" ? [] : [...autoGroups].map((group) => ({ ...group,
    title: fixedOrder?.find((bucket) => bucket.key === group.key)?.title ?? group.title ?? group.key })).sort((a, b) => fixedOrder
    ? fixedOrder.findIndex((bucket) => bucket.key === a.key) - fixedOrder.findIndex((bucket) => bucket.key === b.key)
    : groupBy === "host" ? hosts.findIndex((host) => host.serverId === a.key) - hosts.findIndex((host) => host.serverId === b.key)
    : a.title.localeCompare(b.title));
  const save: Save = (next, revision) => settings.save(next, revision);
  const closeEditor = () => { setEditor(null); if (settings.saveError) void settings.reload(); };
  const busy = settings.saving || editor !== null;
  const ownGroups = groupBy === "groups";
  const manual = sort === "manual";
  const dragging = useDragging();
  // The group a dragged workspace would land in is outlined whole, so a drop anywhere on it is clearly "into this group".
  const targetGroup = useTargetGroup();
  const dropHighlight = (id: string) => targetGroup === id
    ? { outlineWidth: 1, outlineStyle: "solid", outlineColor: theme.colors.accent, backgroundColor: theme.colors.surface1 } as object : {};
  const members = (id: string | null) => refs.filter((ref) => (value.workspaces[ref.key]?.groupId ?? null) === id);
  const hasMatches = (id: string): boolean => members(id).length > 0 || value.groups.some((group) => group.parentId === id && hasMatches(group.id));
  const countMembers = (id: string): number => members(id).length + value.groups.filter((group) => group.parentId === id).reduce((sum, group) => sum + countMembers(group.id), 0);
  const commit = (next: Organization | null) => { if (next && !settings.saving) void save(next, settings.revision); };

  // Rows: in Manual sort, drag a workspace onto another to drop it before or after; with your groups that also moves
  // it into the row's group, while automatic groups only reorder within themselves. In any other sort the position
  // comes from the sort, so dropping anywhere on another group just moves the workspace into it (the whole group lights
  // up) and it takes its sorted place.
  function rowDrag(key: string, bucket: string, siblings: readonly string[], groupId: string | null | undefined): DragSpec {
    const movable = ownGroups || manual;
    return {
      payload: movable && !busy ? { kind: "workspace", key, bucket } : null,
      group: bucket,
      decide: (payload, ratio) => {
        if (payload.kind !== "workspace" || payload.key === key || busy) return null;
        const sameGroup = payload.bucket === bucket;
        if (!ownGroups && !sameGroup) return null;
        if (!manual) return sameGroup ? null : "inside";
        return ratio < 0.5 ? "before" : "after";
      },
      onDrop: (payload, position) => {
        if (payload.kind !== "workspace") return;
        const rest = siblings.filter((item) => item !== payload.key);
        const before = position === "before" ? key : position === "after" ? rest[rest.indexOf(key) + 1] ?? null : null;
        commit(placeWorkspace(value, payload.key, { groupId, siblings, before }));
      },
    };
  }
  // Group headers (your groups only): a workspace drops inside; a group drops above, below or inside.
  function headerDrag(group: Group | null): DragSpec {
    const id = group?.id ?? null;
    return {
      payload: group && !busy ? { kind: "group", id: group.id } : null,
      group: id ?? "",
      decide: (payload, ratio) => {
        if (busy) return null;
        if (payload.kind === "workspace") return "inside";
        if (!group) return "inside";
        if (payload.id === group.id || descendants(value.groups, payload.id).has(group.id)) return null;
        return ratio < 0.3 ? "before" : ratio > 0.7 ? "after" : "inside";
      },
      onDrop: (payload, position) => {
        if (payload.kind === "workspace") {
          commit(placeWorkspace(value, payload.key, { groupId: id, siblings: members(id).map((ref) => ref.key), before: null }));
          return;
        }
        if (!group || position === "inside") { commit(placeGroup(value, payload.id, { parentId: id, before: null })); return; }
        const siblings = value.groups.filter((item) => item.parentId === group.parentId && item.id !== payload.id).map((item) => item.id);
        const before = position === "before" ? group.id : siblings[siblings.indexOf(group.id) + 1] ?? null;
        commit(placeGroup(value, payload.id, { parentId: group.parentId, before }));
      },
    };
  }
  function renderRows(rows: readonly WorkspaceRef[], bucket: string, groupId: string | null | undefined) {
    const siblings = rows.map((row) => row.key);
    return rows.map((ref) => <WorkspaceRow key={ref.key} reference={ref} theme={theme} navigation={navigation} now={now} openInBrowser={openInBrowser}
      active={active.workspace?.key} details={value.workspaces[ref.key] ?? emptyDetails()}
      github={githubFor(ref.hostId, ref.id)} card={card} icons={icons} installationHostId={runtime?.hostId} labelList={labelList}
      git={entryFor(ref.hostId, ref.id)?.git ?? null}
      detectedLinks={entryFor(ref.hostId, ref.id)?.links ?? []}
      hostLabel={hosts.length > 1 && hostBadgeFor(ref.hostId) !== "hidden" ? hosts.find((host) => host.serverId === ref.hostId)?.label : undefined}
      hostIconOnly={hostBadgeFor(ref.hostId) === "icon"} hostColor={hostAppearance.get(ref.hostId)?.color ?? null}
      onEdit={(title) => setEditor({ kind: "workspace", key: ref.key, title })}
      onRename={(title, defaultName) => setEditor({ kind: "rename", reference: ref, title, defaultName })}
      drag={rowDrag(ref.key, bucket, siblings, groupId)} />);
  }
  const groupMenu = (group: Group) => busy ? [] : [
    { label: "Rename or move…", run: () => setEditor({ kind: "group", group, parentId: group.parentId }) },
    { label: "Add subgroup…", run: () => setEditor({ kind: "group", parentId: group.id }) },
    { label: "Remove group", run: () => commit(dissolveGroup(value, group.id)) },
  ];
  function renderGroups(parentId: string | null, depth = 0) {
    const siblings = value.groups.filter((group) => group.parentId === parentId);
    return siblings.filter((group) => !searching || hasMatches(group.id)).map((group, position) => {
      const isCollapsed = !searching && collapsed.includes(group.id);
      // Earlier groups sit above later ones so a row's menu is never covered by the next group.
      return <View key={group.id} style={{ zIndex: siblings.length - position + 1, marginLeft: depth === 0 ? 0 : 10, marginBottom: 6,
        borderLeftWidth: depth ? 1 : 0, borderLeftColor: theme.colors.border, ...dropHighlight(group.id) }}>
        <GroupHeader theme={theme} title={group.name} count={countMembers(group.id)} open={!isCollapsed} animate={!searching} sticky={stickyAt(depth)}
          canCollapse={canCollapse && !searching} onToggle={() => toggleCollapsed(group.id)} drag={headerDrag(group)}
          menu={groupMenu(group)} />
        {/* Searching opens matching groups instantly; collapsing and expanding by hand slides. */}
        <Collapsible open={!isCollapsed} animate={!searching}>{() => <>{renderGroups(group.id, depth + 1)}{renderRows(members(group.id), group.id, group.id)}</>}</Collapsible>
      </View>;
    });
  }
  function renderBuckets() {
    if (groupBy === "none") return buckets.map((bucket) => <View key="all">{renderRows(bucket.items, bucket.key, undefined)}</View>);
    return buckets.map((bucket, position) => {
      const id = `${groupBy}:${bucket.key}`;
      const isCollapsed = !searching && collapsed.includes(id);
      const project = groupBy === "project" ? projectOptions.find((option) => option.id === bucket.key)?.project : undefined;
      const hostColor = groupBy === "host" ? hostAppearance.get(bucket.key)?.color : undefined;
      return <View key={id} style={{ zIndex: buckets.length - position + 1, marginBottom: 6 }}>
        <GroupHeader theme={theme} title={bucket.title} count={bucket.items.length} open={!isCollapsed} animate={!searching} sticky={stickyAt(0)}
          canCollapse={canCollapse && !searching} onToggle={() => toggleCollapsed(id)}
          leading={project ? <ProjectIconView project={project} store={icons} installationHostId={runtime?.hostId} size={font.sm} color={theme.colors.foregroundMuted} />
            : hostColor ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: identityText(hostColor, isDarkSurface(theme.colors.surface0)) }} /> : undefined} />
        <Collapsible open={!isCollapsed} animate={!searching}>{() => renderRows(bucket.items, bucket.key, undefined)}</Collapsible>
      </View>;
    });
  }
  // Phones: React Native pins only the scroll list's own children (stickyHeaderIndices), so there the tree is laid out
  // flat: each header is its own item, followed by its open subgroups and then its rows. Each header stays at the top
  // until the next one pushes it away. Nesting shows as indentation with the same line as on desktop.
  type ListItem = { key: string; element: ReactNode; sticky: boolean };
  const nativeSticky = stickyHeaders && Platform.OS !== "web";
  const indent = (depth: number) => ({ marginLeft: depth * 10, borderLeftWidth: depth ? 1 : 0, borderLeftColor: theme.colors.border });
  const headerBackground = { top: 0, background: theme.colors.surface0 };
  function flatGroups(parentId: string | null, depth = 0): ListItem[] {
    const siblings = value.groups.filter((group) => group.parentId === parentId && (!searching || hasMatches(group.id)));
    return siblings.flatMap((group) => {
      const isCollapsed = !searching && collapsed.includes(group.id);
      return [
        { key: `header:${group.id}`, sticky: true, element: <View style={indent(depth)}>
          <GroupHeader theme={theme} title={group.name} count={countMembers(group.id)} open={!isCollapsed} animate={!searching} sticky={headerBackground}
            canCollapse={canCollapse && !searching} onToggle={() => toggleCollapsed(group.id)} menu={groupMenu(group)} />
        </View> },
        ...(isCollapsed ? [] : flatGroups(group.id, depth + 1)),
        { key: `rows:${group.id}`, sticky: false, element: <View style={{ ...indent(depth), marginBottom: 6 }}>
          <Collapsible open={!isCollapsed} animate={!searching}>{() => renderRows(members(group.id), group.id, group.id)}</Collapsible>
        </View> },
      ];
    });
  }
  function flatList(): ListItem[] {
    if (groupBy === "none") return buckets.map((bucket) => ({ key: "rows:all", sticky: false, element: renderRows(bucket.items, bucket.key, undefined) }));
    if (!ownGroups) return buckets.flatMap((bucket) => {
      const id = `${groupBy}:${bucket.key}`;
      const isCollapsed = !searching && collapsed.includes(id);
      return [{ key: `header:${id}`, sticky: true, element: <GroupHeader theme={theme} title={bucket.title} count={bucket.items.length} open={!isCollapsed}
        animate={!searching} sticky={headerBackground} canCollapse={canCollapse && !searching} onToggle={() => toggleCollapsed(id)} /> },
        { key: `rows:${id}`, sticky: false, element: <View style={{ marginBottom: 6 }}>
          <Collapsible open={!isCollapsed} animate={!searching}>{() => renderRows(bucket.items, bucket.key, undefined)}</Collapsible>
        </View> }];
    });
    const items = flatGroups(null);
    if (ungrouped.length && value.groups.length) items.push(
      { key: "header:ungrouped", sticky: true, element: <GroupHeader theme={theme} title="Ungrouped" count={ungrouped.length} open={ungroupedOpen}
        animate={!searching} sticky={headerBackground} canCollapse={canCollapse && !searching} onToggle={() => toggleCollapsed(UNGROUPED)} /> },
      { key: "rows:ungrouped", sticky: false, element: <Collapsible open={ungroupedOpen} animate={!searching}>{() => renderRows(ungrouped, "", null)}</Collapsible> });
    else if (ungrouped.length) items.push({ key: "rows:ungrouped", sticky: false, element: <>{renderRows(ungrouped, "", null)}</> });
    return items;
  }
  const ungrouped = members(null);
  // Sticky headers (web only): each pins at the top of the list while its group scrolls beneath it, and subgroup
  // headers pin just below their parents'. They cover the rows with the sidebar's own color, read from the page.
  const [listBackground, setListBackground] = useState<string | null>(null);
  const stickyAt = (depth: number) => stickyHeaders && Platform.OS === "web"
    ? { top: depth * GROUP_HEADER_HEIGHT, background: listBackground ?? theme.colors.surface0 } : undefined;
  // Back and forward through the workspaces opened this session, skipping any since archived.
  const visibleRefs = useWorkspaces({ where: visibleWorkspace });
  const openable = new Set(visibleRefs.map((ref) => ref.key));
  // Workspaces created with a group picked on the New workspace screen are filed into it once they appear, then
  // their pick is cleared. Only workspaces the organizer has never stored details for are filed.
  const groupRequests = visibleRefs.flatMap((ref) => {
    const groupId = entryFor(ref.hostId, ref.id)?.group ?? null;
    return groupId ? [{ ref, groupId }] : [];
  });
  const groupRequestKey = groupRequests.map((request) => `${request.ref.key}=${request.groupId}`).join("|");
  useEffect(() => {
    if (!groupRequests.length || settings.saving) return;
    const clearPicks = () => { for (const { ref } of groupRequests) {
      try { void getPaseoClient(ref.hostId).workspaces.ref(ref.id).setMetadata({ [GROUP_METADATA_KEY]: null }).catch(() => {}); }
      catch { /* A disconnected host keeps its pick; filing it again is a no-op once its details exist. */ }
    } };
    const filed = fileNewWorkspaces(value, groupRequests.map((request) => ({ key: request.ref.key, groupId: request.groupId })));
    if (!filed) { clearPicks(); return; }
    void save(filed.value, settings.revision).then((saved) => { if (saved) clearPicks(); });
  }, [groupRequestKey, settings.revision]);
  const nav = useWorkspaceHistory(active.workspace, (workspace) => navigation.openWorkspace(workspace), (key) => openable.has(key));
  // The buttons' hints name ⌘[ / ⌘] once Paseo has handed them over (they also work while typing), else ⌘← / ⌘→.
  const brackets = useBracketShortcuts();
  const historyKeys = brackets.freed ? { back: "⌘[", forward: "⌘]" } : { back: historyShortcutLabel(-1), forward: historyShortcutLabel(1) };
  // ⌘← / ⌘→ (Alt+← / Alt+→ off macOS) and the mouse's side buttons press Back and Forward.
  const latestNav = useRef(nav);
  latestNav.current = nav;
  useEffect(() => onHistoryInput((direction) => { if (direction < 0) latestNav.current.goBack(); else latestNav.current.goForward(); }), []);
  const navTitles = new Map(useWorkspaces({ where: (workspace) => workspace.ref.key === nav.back?.key || workspace.ref.key === nav.forward?.key,
    groupBy: (workspace) => ({ key: workspace.ref.key, title: workspace.title ?? workspace.name }) }).map((group) => [group.key, group.title ?? group.key]));
  // Collapse all / Expand all acts on the groups the current grouping shows. Any open group makes it Collapse all.
  const showsUngrouped = ownGroups && value.groups.length > 0 && ungrouped.length > 0;
  const ungroupedOpen = searching || !collapsed.includes(UNGROUPED);
  const groupIds = ownGroups ? [...value.groups.map((group) => group.id), ...(showsUngrouped ? [UNGROUPED] : [])]
    : groupBy === "none" ? [] : buckets.map((bucket) => `${groupBy}:${bucket.key}`);
  const anyOpen = groupIds.some((id) => !collapsed.includes(id));
  // No background of its own: the sidebar shows Paseo's sidebar color behind it.
  // Bare PR or issue numbers are looked up in the workspace's repository: this daemon's host finds it from the
  // workspace's git remote; for another host's workspace the sidebar reads it from that host's workspace list.
  const resolverFor = (key: string) => {
    if (!resolveLinks) return undefined;
    const [hostId, workspaceId] = JSON.parse(key) as [string, string];
    return (numbers: number[]) => {
      const elsewhere = hostId !== runtime?.hostId ? remoteWorkspaces?.get(hostId, workspaceId) as
        { gitRuntime?: { remoteUrl?: string | null } | null; project?: { checkout?: { remoteUrl?: string | null } | null } | null } | undefined : undefined;
      const repository = githubRepositoryOf(elsewhere?.gitRuntime?.remoteUrl ?? elsewhere?.project?.checkout?.remoteUrl);
      return resolveLinks({ hostId, workspaceId, repository, numbers });
    };
  };
  // The group and workspace editors float over the list below the toolbar, so they show wherever the list is scrolled.
  const editorPopover = editor?.kind === "group"
    ? { title: editor.group ? "Edit group" : "New group", element: <GroupEditor key={`group-editor:${editor.group?.id ?? `new-${editor.parentId}`}`} theme={theme} value={value}
      revision={settings.revision} group={editor.group} parentId={editor.parentId} save={save} close={closeEditor} saving={settings.saving} saveError={settings.saveError} /> }
    : editor?.kind === "workspace"
      ? { title: `Organize ${editor.title}`, element: <WorkspaceEditor key={`workspace-editor:${editor.key}`} theme={theme} title={editor.title} workspaceKey={editor.key}
        value={value} revision={settings.revision} save={save} close={closeEditor} saving={settings.saving} saveError={settings.saveError} resolveNumbers={resolverFor(editor.key)} /> }
      : editor?.kind === "rename"
        ? { title: "Rename workspace", element: <RenameEditor key={`rename:${editor.reference.key}`} theme={theme} reference={editor.reference}
          title={editor.title} defaultName={editor.defaultName} close={closeEditor} /> }
        : null;
  // Kept while the popover fades out after closing.
  if (editorPopover) lastEditor.current = editorPopover;
  const editorMaxHeight = treeHeight && toolbarHeight ? Math.max(160, treeHeight - toolbarHeight - 12) : undefined;
  return <View ref={(node) => { if (node && !listBackground) setListBackground(backgroundBehind(node)); }} style={{ flex: 1, minHeight: 0 }}
    onLayout={(event) => setTreeHeight(Math.round(event.nativeEvent.layout.height))}>
    <View onLayout={(event) => setToolbarHeight(Math.round(event.nativeEvent.layout.height))} style={{ padding: 8, gap: 7, zIndex: 10, position: "relative" }}>
      <SearchToolbar theme={theme} criteria={{ query, filters }} onChange={(next) => { setQuery(next.query); setFilters(next.filters); }}
        tags={tagOptions}
        hosts={hosts.map((host) => ({ id: host.serverId, label: host.label }))}
        projects={projectOptions} counts={(category, id) => filterCounts.get(facetKey(category, id)) ?? 0} icons={icons} installationHostId={runtime?.hostId} labelColors={labelColors}
        value={value} revision={settings.revision} save={save} disabled={busy} onReload={() => void settings.reload()}
        sort={sort} onSortChange={setSort} sortDisabled={!canSort}
        groupBy={groupBy} onGroupByChange={setGroupBy} onNewGroup={busy ? undefined : () => { setGroupBy("groups"); setEditor({ kind: "group", parentId: null }); }}
        view={cardMode} openCardSettings={openCardSettings} toolbar={toolbar} hostChoice={hostChoice}
        history={{ back: nav.back ? navTitles.get(nav.back.key) ?? "previous workspace" : null,
          forward: nav.forward ? navTitles.get(nav.forward.key) ?? "next workspace" : null, goBack: nav.goBack, goForward: nav.goForward,
          keys: historyKeys }}
        collapseAll={groupIds.length ? { collapse: anyOpen, disabled: !canCollapse || searching, onPress: () => setCollapsed(groupIds, anyOpen) } : undefined} />
      <ErrorText theme={theme} message={editor ? null : settings.saveError} />
      <ErrorText theme={theme} message={displayError ?? index.getError()} />
      {/* Inset like the toolbar, and out of the flow so it adds no gap below it. */}
      <View style={{ position: "absolute", left: 8, right: 8, top: "100%" }}>
        <Dropdown theme={theme} open={editorPopover !== null} label={lastEditor.current?.title ?? "Editor"}>{() =>
          <ScrollView style={editorMaxHeight ? { maxHeight: editorMaxHeight } : undefined} keyboardShouldPersistTaps="handled">
            {lastEditor.current?.element}
          </ScrollView>}</Dropdown>
      </View>
    </View>
    {(() => {
      const empty = !refs.length ? <Text key="empty" style={{ color: theme.colors.foregroundMuted, fontSize: font.md, padding: 16 }}>
        {searching ? "No workspaces match. Adjust the search text or filters." : "No active workspaces. Create one with Paseo’s New workspace action."}
      </Text> : null;
      const contentStyle = { paddingHorizontal: layout.compact ? 4 : 6, paddingBottom: 20 };
      if (nativeSticky) {
        const items = flatList();
        const stickyHeaderIndices = items.flatMap((item, index) => (item.sticky ? [index] : []));
        return <ScrollView contentContainerStyle={contentStyle} keyboardShouldPersistTaps="handled" stickyHeaderIndices={stickyHeaderIndices}>
          {/* A pinned item covers its full width, including a nested header's indentation, so rows never show beside it. */}
          {items.map((item) => <View key={item.key} style={item.sticky ? { backgroundColor: theme.colors.surface0 } : undefined}>{item.element}</View>)}
          {empty}
        </ScrollView>;
      }
      return <ScrollView contentContainerStyle={contentStyle} keyboardShouldPersistTaps="handled">
        {ownGroups ? <>
          {renderGroups(null)}
          {/* Workspaces outside every group; while dragging it also takes workspaces and groups out of their groups. */}
          {/* Spaced like the groups above it. */}
          {ungrouped.length || (dragging && value.groups.length) ? <View style={{ marginBottom: 6, ...dropHighlight("") }}>
            {value.groups.length ? <>
              <GroupHeader theme={theme} title="Ungrouped" count={ungrouped.length} open={ungroupedOpen} animate={!searching} sticky={stickyAt(0)}
                canCollapse={canCollapse && !searching} onToggle={() => toggleCollapsed(UNGROUPED)} drag={headerDrag(null)} />
              <Collapsible open={ungroupedOpen} animate={!searching}>{() => renderRows(ungrouped, "", null)}</Collapsible>
            </> : renderRows(ungrouped, "", null)}
          </View> : null}
        </> : renderBuckets()}
        {empty}
      </ScrollView>;
    })()}
  </View>;
}

// A group header's height: its 28px row, 6px padding above and below, and a 1px border.
const GROUP_HEADER_HEIGHT = 42;

// The Ungrouped section's id in the device's collapsed list; group ids never start with "__".
const UNGROUPED = "__ungrouped";

type DragSpec = { payload: DragPayload | null; decide?: (payload: DragPayload, ratio: number) => DropPosition | null;
  onDrop?: (payload: DragPayload, position: DropPosition) => void; group?: string };

// A group's header: its chevron, name and count; a ⋯ menu for your own groups; and drag and drop.
function GroupHeader({ theme, title, count, open, animate, canCollapse, onToggle, leading, drag, menu = [], sticky }: {
  theme: Theme; title: string; count: number; open: boolean; animate: boolean; canCollapse: boolean; onToggle?: () => void;
  leading?: ReactNode; drag?: DragSpec; menu?: { label: string; run: () => void }[];
  // Pinned this far from the top of the list while its group scrolls beneath it, over the list's own background.
  sticky?: { top: number; background: string };
}) {
  const dnd = useDragDrop({ payload: drag?.payload ?? null, decide: drag?.decide, onDrop: drag?.onDrop, group: drag?.group, label: title });
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (leaveTimer.current) clearTimeout(leaveTimer.current); }, []);
  // The header and its ⋯ button hand hover to each other, so a short grace keeps the button while moving between them.
  const presence = (inside: boolean) => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    if (inside) setHovered(true);
    else leaveTimer.current = setTimeout(() => { setHovered(false); setMenuOpen(false); }, 150);
  };
  const muted = theme.colors.foregroundMuted;
  const showMenu = menu.length > 0 && (Platform.OS !== "web" || hovered || menuOpen);
  // The web pins the header with CSS; on phones the scroll list pins it, and the header only needs its background.
  const cssSticky = sticky && Platform.OS === "web";
  return <View ref={dnd.ref} style={{ position: cssSticky ? "sticky" : "relative", top: cssSticky ? sticky.top : undefined, zIndex: cssSticky ? 4 : 2,
    // A pinned header is square, so rows scrolling beneath it never show through rounded corners.
    paddingHorizontal: 8, paddingVertical: 6, borderRadius: sticky ? 0 : 6, borderWidth: 1,
    borderColor: dnd.position === "inside" ? theme.colors.accent : "transparent",
    backgroundColor: dnd.position === "inside" ? theme.colors.surface2 : sticky?.background ?? "transparent" } as object}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${open ? "Collapse" : "Expand"} ${title}`}
          accessibilityState={{ expanded: open }} disabled={!canCollapse} onPress={onToggle}
          onHoverIn={() => presence(true)} onHoverOut={() => presence(false)}
          style={{ flex: 1, minHeight: 28, flexDirection: "row", alignItems: "center", gap: 5 }}>
          <TurningChevron open={open} animate={animate} size={font.md} color={muted} />
          {leading}
          <Text numberOfLines={1} style={{ color: muted, fontWeight: "600", fontSize: font.sm, flex: 1 }}>{title}</Text>
          <Text style={{ color: muted, fontSize: font.xs }}>{count}</Text>
        </Pressable>
      {showMenu ? <Pressable accessibilityRole="button" accessibilityLabel={`${title} group actions`} onPress={() => setMenuOpen(!menuOpen)}
        onHoverIn={() => presence(true)} onHoverOut={() => presence(false)} style={{ padding: 4, borderRadius: 4 }}>
        <Icon name="Ellipsis" size={font.md} color={muted} />
      </Pressable> : null}
    </View>
    {menuOpen ? <View accessibilityRole="menu" style={{ position: "absolute", top: "100%", right: 6, zIndex: 30, minWidth: 170, padding: 4,
      borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface1,
      shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8 }}>
      {menu.map((item) => <Pressable key={item.label} accessibilityRole="menuitem" accessibilityLabel={item.label}
        onPress={() => { setMenuOpen(false); item.run(); }} onHoverIn={() => presence(true)} onHoverOut={() => presence(false)}
        style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 6 }}>
        <Text style={{ color: item.label === "Remove group" ? theme.colors.statusDanger : theme.colors.foreground, fontSize: font.sm }}>{item.label}</Text>
      </Pressable>)}
    </View> : null}
    {dnd.position === "before" || dnd.position === "after" ? <View testID="drop-line" pointerEvents="none" style={{ position: "absolute", left: 6, right: 6, height: 2,
      borderRadius: 1, backgroundColor: theme.colors.accent, ...(dnd.position === "before" ? { top: -2 } : { bottom: -2 }) }} /> : null}
  </View>;
}
