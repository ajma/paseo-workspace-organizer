import { useState, type ReactNode } from "react";
import type { ProjectIconStore } from "./project-icons";
import type { LabelColorStore } from "./label-colors";
import { FilterMenu, type FilterOption, type FilterTab } from "./filter-menu";
import { Pressable, Text, TextInput, View, type LayoutChangeEvent } from "react-native";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { Organization } from "../shared/organization";
import { filtersSchema, hasFilters, sameCriteria, type SearchCriteria } from "../shared/search";
import { Button, ErrorText, Field, type Theme } from "./controls";
import type { Save } from "./editors";
import { font } from "./typography";
import { sortLabels, sortModes, type SortMode } from "../shared/sort";
import { groupByLabels, groupByModes, type GroupBy } from "../shared/grouping";
import { Dropdown, MenuChoice } from "./dropdown";
import { cardModeLabels, cardModes, type CardMode } from "../shared/cards";
import { chipOrder, firstLineCount, moveChip, type ToolbarChip } from "../shared/toolbar";
import { useDragDrop } from "./drag";
import { HintBubble, useHint } from "./hint";
import { Collapsible } from "./collapsible";

const CHIP_GAP = 4;

export type { FilterOption } from "./filter-menu";

function Pill({ theme, label, icon, trailing, leading, iconOnly = false, accessibilityLabel = label, selected, disabled = false, onPress, style, hint }: {
  theme: Theme; label: string; icon?: string; trailing?: string; leading?: ReactNode; iconOnly?: boolean; accessibilityLabel?: string; selected: boolean;
  disabled?: boolean; onPress: () => void; style?: { marginLeft?: "auto"; maxWidth?: number };
  // Shown after resting on the pill while it shows only its icon; defaults to its label.
  hint?: string;
}) {
  const color = selected ? theme.colors.accent : theme.colors.foregroundMuted;
  const hover = useHint(iconOnly);
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel}
    accessibilityState={{ selected }} aria-pressed={selected} disabled={disabled} onPress={onPress}
    onHoverIn={hover.onHoverIn} onHoverOut={hover.onHoverOut} onPressIn={hover.onPressIn}
    style={{ borderWidth: 1, borderColor: selected ? theme.colors.accent : theme.colors.border,
      backgroundColor: selected ? theme.colors.surface2 : "transparent", paddingHorizontal: 7,
      paddingVertical: 6, borderRadius: 14, minHeight: 28, maxWidth: "100%", opacity: disabled ? 0.45 : 1,
      justifyContent: "center", flexDirection: "row", alignItems: "center", gap: 3, ...style }}>
    {icon ? <Icon name={icon} size={font.md} color={color} /> : leading}
    {iconOnly ? null : <Text numberOfLines={1} style={{ color, fontSize: font.sm, flexShrink: 1 }}>{label}</Text>}
    {trailing ? <Icon name={trailing} size={font.sm} color={color} /> : null}
    {hover.shown ? <HintBubble theme={theme} text={hint ?? label} /> : null}
  </Pressable>;
}

// An icon-only toolbar button; resting on it shows what it does.
function IconButton({ theme, label, icon, onPress, pressed, disabled = false, hint }: {
  theme: Theme; label: string; icon: string; onPress: () => void; pressed?: boolean; disabled?: boolean;
  // What resting on it shows, when it should say more than its label (such as its keyboard shortcut).
  hint?: string;
}) {
  const hover = useHint(true);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} aria-pressed={pressed} disabled={disabled} onPress={onPress}
    onHoverIn={hover.onHoverIn} onHoverOut={hover.onHoverOut} onPressIn={hover.onPressIn}
    style={(state) => ({ padding: 6, borderRadius: 6, opacity: disabled ? 0.45 : 1,
      backgroundColor: (state as { hovered?: boolean }).hovered ? theme.colors.surface2 : "transparent" })}>
    <Icon name={icon} size={font.md} color={pressed ? theme.colors.foreground : theme.colors.foregroundMuted} />
    {hover.shown ? <HintBubble theme={theme} text={hint ?? label} align="right" /> : null}
  </Pressable>;
}

export function SearchToolbar({ theme, criteria, onChange, tags, hosts, projects, value, revision, save, disabled, onReload, sort, onSortChange, sortDisabled,
  groupBy = "groups", onGroupByChange, onNewGroup, counts, view, openCardSettings, collapseAll, toolbar, hostChoice, history, icons, installationHostId, labelColors }: {
  theme: Theme; criteria: SearchCriteria; onChange: (criteria: SearchCriteria) => void;
  tags: FilterOption[]; hosts: FilterOption[]; projects: FilterOption[];
  value: Organization; revision: string; save: Save; disabled: boolean; onReload: () => void;
  sort: SortMode; onSortChange: (sort: SortMode) => void; sortDisabled: boolean;
  groupBy?: GroupBy; onGroupByChange?: (groupBy: GroupBy) => void; onNewGroup?: () => void;
  counts?: (category: FilterTab, id: string) => number;
  // View: the card style (Simple, Full or Custom) and the way to card settings.
  view?: { ready: boolean; value: CardMode; set: (mode: CardMode) => void }; openCardSettings?: () => void;
  // Collapse or expand every group in one press.
  collapseAll?: { collapse: boolean; disabled: boolean; onPress: () => void };
  // Back and forward through opened workspaces: the title each would open, or null when there is none.
  history?: { back: string | null; forward: string | null; goBack: () => void; goForward: () => void; keys?: { back: string; forward: string } };
  // The chips' order and whether they show text, remembered on the device.
  toolbar?: { order: readonly string[]; labels: boolean; setOrder: (order: ToolbarChip[]) => void; setLabels: (labels: boolean) => void };
  // Hosts running the plugin, when there are several: whose groups the sidebar uses.
  hostChoice?: { hosts: { id: string; label: string }[]; current: string | null; choose: (id: string) => void };
  icons?: ProjectIconStore; installationHostId?: string; labelColors?: LabelColorStore;
}) {
  // Widths for fitting chips beside the icon buttons, from layout.
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [rowWidth, setRowWidth] = useState(0);
  // At most one dropdown is open; opening one closes the others.
  const [menu, setMenu] = useState<"filters" | "saved" | "view" | "group" | "sort" | "more" | null>(null);
  const toggleMenu = (name: NonNullable<typeof menu>) => setMenu((open) => (open === name ? null : name));
  const filtersOpen = menu === "filters";
  const [tab, setTab] = useState<FilterTab>("statuses");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ value: Organization; revision: string; id: string | null; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The text box starts hidden; hiding it keeps any search text, and the icon stays lit while text is active.
  const [searchOpen, setSearchOpen] = useState(false);
  const selected = value.savedSearches.find((item) => item.id === selectedId);
  // The saved search in use: chosen from the menu and not changed since.
  const active = selected && sameCriteria(criteria, selected) ? selected : undefined;
  function toggle(key: FilterTab, id: string) {
    const current = criteria.filters[key] as readonly string[];
    onChange({ ...criteria, filters: { ...criteria.filters, [key]: current.includes(id)
      ? current.filter((item) => item !== id) : [...current, id] } });
  }
  function begin(id: string | null) {
    setError(null); setDraft({ value, revision, id, name: id ? value.savedSearches.find((item) => item.id === id)!.name : "" });
  }
  async function saveDraft() {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name || name.length > 100) { setError("Use a search name between 1 and 100 characters."); return; }
    if (draft.value.savedSearches.some((item) => item.id !== draft.id && item.name.toLowerCase() === name.toLowerCase())) {
      setError("A saved search already uses that name."); return;
    }
    const previous = draft.value.savedSearches.find((item) => item.id === draft.id);
    const id = draft.id ?? `search-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    // Renaming preserves saved criteria even when the current view has unsaved changes.
    const item = { ...(previous ?? criteria), id, name };
    const savedSearches = previous ? draft.value.savedSearches.map((search) => search.id === id ? item : search) : [...draft.value.savedSearches, item];
    if (await save({ ...draft.value, savedSearches }, draft.revision)) { setSelectedId(id); setDraft(null); setError(null); setMenu(null); }
  }
  const filterCount = Object.values(criteria.filters).reduce((sum, values) => sum + values.length, 0);
  const labelsOn = toolbar?.labels ?? true;
  const order = chipOrder(toolbar?.order ?? []);
  // Each chip by name; the toolbar draws them in the user's order. Hiding labels leaves just their icons.
  const chips: Record<ToolbarChip, ReactNode> = {
    search: <Pill theme={theme} label="Search" icon="Search" iconOnly={!labelsOn} accessibilityLabel={searchOpen ? "Hide search" : "Show search"}
      selected={searchOpen || criteria.query.trim().length > 0} onPress={() => setSearchOpen(!searchOpen)} />,
    filters: <Pill theme={theme} label={`Filters${filterCount ? ` · ${filterCount}` : ""}`} icon="ListFilter" iconOnly={!labelsOn} trailing="ChevronDown"
      accessibilityLabel={`Filters${filterCount ? `, ${filterCount} selected` : ""}`} selected={filtersOpen || filterCount > 0}
      onPress={() => toggleMenu("filters")} />,
    // Saved searches: the active one's name, or "Saved".
    saved: <Pill theme={theme} label={active ? active.name : "Saved"} icon="Bookmark" iconOnly={!labelsOn} trailing="ChevronDown"
      accessibilityLabel={`Saved searches${active ? `, currently ${active.name}` : ""}`} selected={menu === "saved" || Boolean(active)}
      style={{ maxWidth: 120 }} onPress={() => toggleMenu("saved")} />,
    view: view ? <Pill theme={theme} label="View" icon="LayoutList" iconOnly={!labelsOn} trailing="ChevronDown"
      accessibilityLabel={`View, currently ${cardModeLabels[view.value]}`} selected={menu === "view"} onPress={() => toggleMenu("view")} /> : null,
    group: onGroupByChange ? <Pill theme={theme} label="Group" icon="Layers" iconOnly={!labelsOn} trailing="ChevronDown"
      accessibilityLabel={`Group by, currently ${groupByLabels[groupBy]}`} selected={menu === "group"} disabled={sortDisabled}
      onPress={() => toggleMenu("group")} /> : null,
    sort: <Pill theme={theme} label="Sort" icon="ArrowUpDown" iconOnly={!labelsOn} trailing="ChevronDown" accessibilityLabel={`Sort by, currently ${sortLabels[sort]}`}
      selected={menu === "sort"} disabled={sortDisabled} onPress={() => toggleMenu("sort")} />,
  };
  // The chips in order, then Clear while a search or filter is active. As many as fit share the first line with the
  // icon buttons; the rest wrap below at the full width. Drag a chip onto another to reorder them.
  const showClear = Boolean(criteria.query.trim() || hasFilters(criteria.filters));
  const items: (ToolbarChip | "clear")[] = [...order.filter((id) => chips[id]), ...(showClear ? ["clear" as const] : [])];
  // Everything on one line when it fits beside all the icon buttons. Otherwise the line splits in two: back and forward
  // stay on the first line, and collapse and the ⋯ menu move to the end of the second.
  const chipWidths = items.map((id) => widths[id]);
  const navWidth = history ? widths.nav : 0, toolsWidth = collapseAll || toolbar || openCardSettings || hostChoice ? widths.tools : 0;
  const bothWidths = navWidth === undefined || toolsWidth === undefined ? undefined : navWidth + toolsWidth;
  const oneLine = firstLineCount(chipWidths, rowWidth, bothWidths, CHIP_GAP) === items.length;
  const fit = oneLine ? items.length : firstLineCount(chipWidths, rowWidth, navWidth, CHIP_GAP);
  const measure = (id: string) => (event: LayoutChangeEvent) => {
    const width = Math.round(event.nativeEvent.layout.width);
    setWidths((current) => (current[id] === width ? current : { ...current, [id]: width }));
  };
  const renderItem = (id: ToolbarChip | "clear") => id === "clear"
    ? <View key="clear" onLayout={measure("clear")}><Pill theme={theme} label="Clear" icon="X" iconOnly={!labelsOn} accessibilityLabel="Clear search" hint="Clear search and filters"
      selected={false} onPress={() => { onChange({ query: "", filters: filtersSchema.parse({}) }); setSelectedId(null); setMenu(null); }} /></View>
    : <ChipSlot key={id} theme={theme} id={id} order={order} onReorder={toolbar?.setOrder} onLayout={measure(id)}>{chips[id]}</ChipSlot>;
  // Back and forward through opened workspaces; collapse or expand every group, and a ⋯ menu for the rest.
  const navButtons = history ? <View onLayout={measure("nav")} style={{ flexDirection: "row", alignItems: "center", minHeight: 28 }}>
    <IconButton theme={theme} label={history.back ? `Back to ${history.back}` : "Back"} icon="ArrowLeft" onPress={history.goBack} disabled={!history.back}
      hint={history.keys ? `${history.back ? `Back to ${history.back}` : "Back"} (${history.keys.back})` : undefined} />
    <IconButton theme={theme} label={history.forward ? `Forward to ${history.forward}` : "Forward"} icon="ArrowRight" onPress={history.goForward}
      disabled={!history.forward} hint={history.keys ? `${history.forward ? `Forward to ${history.forward}` : "Forward"} (${history.keys.forward})` : undefined} />
  </View> : null;
  const toolButtons = collapseAll || toolbar || openCardSettings || hostChoice ? <View onLayout={measure("tools")} style={{ flexDirection: "row", alignItems: "center", minHeight: 28 }}>
    {collapseAll ? <IconButton theme={theme} label={collapseAll.collapse ? "Collapse all groups" : "Expand all groups"}
      icon={collapseAll.collapse ? "ChevronsDownUp" : "ChevronsUpDown"} onPress={collapseAll.onPress} disabled={collapseAll.disabled} /> : null}
    {toolbar || openCardSettings || hostChoice ? <IconButton theme={theme} label="More options" icon="Ellipsis"
      onPress={() => toggleMenu("more")} pressed={menu === "more"} /> : null}
  </View> : null;
  return <View>
    <View onLayout={(event) => setRowWidth(Math.round(event.nativeEvent.layout.width))} style={{ gap: CHIP_GAP, position: "relative", zIndex: 20 }}>
      {/* Line one sits above line two so hints from its controls show over the line below. */}
      <ToolbarLine layer={3} trailing={<>{navButtons}{oneLine ? toolButtons : null}</>}>{items.slice(0, fit).map(renderItem)}</ToolbarLine>
      {oneLine ? null : <ToolbarLine layer={2} trailing={toolButtons}>{items.slice(fit).map(renderItem)}</ToolbarLine>}
      {/* The dropdowns open below this row, over the list, and fade and slide in and out. */}
      <Dropdown theme={theme} open={filtersOpen} label="Filters">{() => <FilterMenu theme={theme} tab={tab} onTab={setTab}
        filters={criteria.filters} onToggle={toggle} onSetTags={(tags) => onChange({ ...criteria, filters: { ...criteria.filters, tags } })}
        onClose={() => setMenu(null)} tags={tags} hosts={hosts} projects={projects} counts={counts} icons={icons} installationHostId={installationHostId}
        labelColors={labelColors} />}</Dropdown>
      <Dropdown theme={theme} open={menu === "saved"} label="Saved searches">{() => draft ? <View style={{ gap: 7, padding: 10 }}>
        <Field theme={theme} label="Search name" value={draft.name} onChangeText={(name) => { setDraft({ ...draft, name }); setError(null); }} />
        <ErrorText theme={theme} message={error} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
          <Button theme={theme} label="Save" accessibilityLabel="Save named search" primary disabled={disabled} onPress={() => void saveDraft()} />
          <Button theme={theme} label="Cancel" accessibilityLabel="Cancel saved search edit" disabled={disabled} onPress={() => { setDraft(null); setError(null); }} />
          {draft.id ? <Button theme={theme} label="Delete" accessibilityLabel="Delete saved search" disabled={disabled} onPress={() => {
            void save({ ...draft.value, savedSearches: draft.value.savedSearches.filter((item) => item.id !== draft.id) }, draft.revision)
              .then((saved) => { if (saved) { setDraft(null); setSelectedId(null); } });
          }} /> : null}
        </View>
        <Button theme={theme} label="Cancel and reload latest settings" disabled={disabled} onPress={() => { setDraft(null); setError(null); onReload(); }} />
      </View> : <View style={{ padding: 4 }}>
        {value.savedSearches.length ? value.savedSearches.map((search) => <MenuChoice key={search.id} theme={theme} label={search.name}
          accessibilityLabel={`Use saved search ${search.name}`} selected={active?.id === search.id} disabled={disabled} onPress={() => {
            onChange({ query: search.query, filters: search.filters }); setSelectedId(search.id); setMenu(null);
            if (search.query.trim()) setSearchOpen(true);
          }} />) : <Text style={{ color: theme.colors.foregroundMuted, fontSize: font.sm, padding: 10 }}>No saved searches yet.</Text>}
        <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 4 }} />
        <MenuChoice theme={theme} label="Save current search…" accessibilityLabel="Save search" icon="Plus" disabled={disabled} onPress={() => begin(null)} />
        {selected && !sameCriteria(criteria, selected) ? <MenuChoice theme={theme} label={`Update “${selected.name}”`} accessibilityLabel="Update saved search"
          icon="RefreshCw" disabled={disabled} onPress={() => void save({ ...value, savedSearches: value.savedSearches.map((item) => item.id === selected.id ? { ...item, ...criteria } : item) }, revision)} /> : null}
        {selected ? <MenuChoice theme={theme} label={`Rename or delete “${selected.name}”…`} accessibilityLabel="Manage saved search" icon="Pencil"
          disabled={disabled} onPress={() => begin(selected.id)} /> : null}
      </View>}</Dropdown>
      {view ? <Dropdown theme={theme} open={menu === "view"} label="View" align="right">{() => <View style={{ padding: 4 }}>
        {cardModes.map((mode) => <MenuChoice key={mode} theme={theme} label={cardModeLabels[mode]} accessibilityLabel={`View ${cardModeLabels[mode]}`}
          selected={view.value === mode} disabled={!view.ready} onPress={() => { view.set(mode); setMenu(null); }} />)}
      </View>}</Dropdown> : null}
      {onGroupByChange ? <Dropdown theme={theme} open={menu === "group"} label="Grouping" align="right">{() => <View style={{ padding: 4 }}>
        {groupByModes.map((mode) => <MenuChoice key={mode} theme={theme} label={groupByLabels[mode]} accessibilityLabel={`Group by ${groupByLabels[mode]}`}
          selected={groupBy === mode} disabled={sortDisabled} onPress={() => { onGroupByChange(mode); setMenu(null); }} />)}
        {onNewGroup ? <>
          <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 4 }} />
          <MenuChoice theme={theme} label="New group…" accessibilityLabel="New group" icon="Plus" onPress={() => { setMenu(null); onNewGroup(); }} />
        </> : null}
      </View>}</Dropdown> : null}
      <Dropdown theme={theme} open={menu === "more"} label="More options" align="right">{() => <View style={{ padding: 4 }}>
        {hostChoice && hostChoice.hosts.length > 1 ? <>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: font.xs, paddingHorizontal: 10, paddingTop: 6, paddingBottom: 2 }}>Groups from</Text>
          {hostChoice.hosts.map((host) => <MenuChoice key={host.id} theme={theme} label={host.label} accessibilityLabel={`Groups from ${host.label}`}
            selected={hostChoice.current === host.id} onPress={() => { hostChoice.choose(host.id); setMenu(null); }} />)}
          {toolbar || openCardSettings ? <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 4 }} /> : null}
        </> : null}
        {toolbar ? <MenuChoice theme={theme} label="Show button labels" selected={labelsOn}
          onPress={() => { toolbar.setLabels(!labelsOn); setMenu(null); }} /> : null}
        {toolbar && openCardSettings ? <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 4 }} /> : null}
        {openCardSettings ? <MenuChoice theme={theme} label="Plugin settings…" accessibilityLabel="Plugin settings" icon="Settings"
          onPress={() => { setMenu(null); openCardSettings(); }} /> : null}
      </View>}</Dropdown>
      <Dropdown theme={theme} open={menu === "sort"} label="Sort order" align="right">{() => <View style={{ padding: 4 }}>
        {sortModes.map((mode) => <MenuChoice key={mode} theme={theme} label={sortLabels[mode]} accessibilityLabel={`Sort by ${sortLabels[mode]}`}
          selected={sort === mode} disabled={sortDisabled} onPress={() => { onSortChange(mode); setMenu(null); }} />)}
      </View>}</Dropdown>
    </View>
    {/* The search box slides open and shut like a group; its gap above slides with it, so nothing jumps. */}
    <Collapsible open={searchOpen}>{() => <View style={{ paddingTop: 7 }}>
      <TextInput accessibilityLabel="Search workspaces" placeholder="Search name, tag, PR or issue #"
        placeholderTextColor={theme.colors.foregroundMuted} autoFocus value={criteria.query}
        onChangeText={(query) => onChange({ ...criteria, query })} autoCorrect={false} autoCapitalize="none"
        style={{ borderRadius: 5, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface1,
          padding: 8, fontSize: font.sm, color: theme.colors.foreground }} />
    </View>}</Collapsible>
  </View>;
}

// One line of the toolbar: chips that wrap within it, then icon buttons at its end.
function ToolbarLine({ layer, trailing, children }: { layer: number; trailing: ReactNode; children: ReactNode }) {
  return <View style={{ flexDirection: "row", alignItems: "flex-start", gap: CHIP_GAP, zIndex: layer }}>
    <View style={{ flex: 1, minWidth: 0, flexDirection: "row", flexWrap: "wrap", gap: CHIP_GAP }}>{children}</View>
    {trailing}
  </View>;
}

// A toolbar chip that can be dragged onto another chip to move it before or after it; a line shows where it will go.
function ChipSlot({ theme, id, order, onReorder, onLayout, children }: {
  theme: Theme; id: ToolbarChip; order: readonly ToolbarChip[]; onReorder?: (order: ToolbarChip[]) => void;
  onLayout?: (event: LayoutChangeEvent) => void; children: ReactNode;
}) {
  const dnd = useDragDrop({
    payload: onReorder ? { kind: "chip", id } : null, label: id, axis: "x",
    decide: onReorder ? (payload, ratio) => payload.kind === "chip" && payload.id !== id ? (ratio < 0.5 ? "before" : "after") : null : undefined,
    onDrop: (payload, position) => {
      if (payload.kind === "chip" && position !== "inside") onReorder?.(moveChip(order, payload.id as ToolbarChip, id, position));
    },
  });
  return <View ref={dnd.ref} testID={`toolbar-chip-${id}`} onLayout={onLayout} style={{ position: "relative" }}>
    {children}
    {dnd.position === "before" || dnd.position === "after" ? <View testID="chip-drop-line" pointerEvents="none" style={{ position: "absolute", top: 2, bottom: 2,
      width: 2, borderRadius: 1, backgroundColor: theme.colors.accent, ...(dnd.position === "before" ? { left: -3 } : { right: -3 }) }} /> : null}
  </View>;
}
