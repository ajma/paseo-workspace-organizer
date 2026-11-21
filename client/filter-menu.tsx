import { useState, type ComponentProps } from "react";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useWorkspaces, type ProjectRef } from "@getpaseo/plugin/client";
import type { PluginWorkspaceSnapshot } from "@getpaseo/plugin";
import { Pressable, ScrollView, Text, View } from "react-native";
import { prFilterLabels, prFilters, statusLabels, statuses, type PrFilter, type WorkspaceFilters } from "../shared/search";
import type { Theme } from "./controls";
import { ProjectIconView, type ProjectIconStore } from "./project-icons";
import { font } from "./typography";
import { statusColor } from "./card";
import { useLabelColors, type LabelColorStore } from "./label-colors";
import { childChecked, groupState, toggleChild, toggleGroup, type GroupState } from "../shared/tag-tree";
import { readHostColors } from "./web";
import { identityColor, identityText, identityTint, isDarkSurface, tagGroupColor, type IdentityColor } from "../shared/identity-colors";
import { exactTagPrefix, facetKey, tagName } from "../shared/search";

// Tag groups carry their individual tags as children, drawn indented beneath the group.
export type FilterOption = { id: string; label: string; project?: ProjectRef; children?: FilterOption[]; exact?: boolean };
export type FilterTab = keyof WorkspaceFilters;
export type FilterCountsQuery = {
  where: (workspace: PluginWorkspaceSnapshot) => boolean;
  groupBy: (workspace: PluginWorkspaceSnapshot) => readonly string[];
};

// The dropdown mounts this only while its contents are visible.
export function FilterMenuWithCounts({ query, ...props }: Omit<ComponentProps<typeof FilterMenu>, "counts"> & { query: FilterCountsQuery }) {
  const facets = useWorkspaces(query);
  const counts = new Map(facets.map((facet) => [facet.key, facet.items.length]));
  return <FilterMenu {...props} counts={(category, id) => counts.get(facetKey(category, id)) ?? 0} />;
}
export const filterTabs: readonly { key: FilterTab; label: string; singular: string; plural: string }[] = [
  { key: "statuses", label: "Status", singular: "status", plural: "statuses" },
  { key: "tags", label: "Tags", singular: "tag", plural: "tags" },
  { key: "hostIds", label: "Host", singular: "host", plural: "hosts" },
  { key: "projectKeys", label: "Project", singular: "project", plural: "projects" },
  { key: "prs", label: "PR", singular: "PR", plural: "PR filters" },
];
// PR states use GitHub's familiar colors from Paseo's palette.
const prColors: Record<PrFilter, IdentityColor | null> = { any: "indigo", open: "emerald", draft: null, merged: "violet", closed: "red", none: null };

// A dropdown menu with one tab per filter category and a checkbox per value.
const Dot = ({ color }: { color: string }) => <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} />;

function Checkbox({ theme, state }: { theme: Theme; state: GroupState }) {
  const on = state !== "none";
  return <View style={{ width: 16, height: 16, borderRadius: 4, borderWidth: 1, alignItems: "center", justifyContent: "center",
    borderColor: on ? theme.colors.accent : theme.colors.border, backgroundColor: on ? theme.colors.accent : "transparent" }}>
    {state === "all" ? <Icon name="Check" size={12} color={theme.colors.accentForeground} />
      : state === "some" ? <Icon name="Minus" size={12} color={theme.colors.accentForeground} /> : null}
  </View>;
}

// The part of a sub-level tag after its group: "b" for "a:b", "S25" for "📲 S25".
function subLabel(group: string, tag: string): string {
  const rest = tag.slice(group.length).replace(/^\s*:\s*|^\s+/, "").trim();
  return tag.toLowerCase().startsWith(group.toLowerCase()) && rest ? rest : tag;
}

export function FilterMenu({ theme, tab, onTab, filters, onToggle, onSetTags, onClose, tags, hosts, projects, counts, icons, installationHostId, labelColors }: {
  theme: Theme; tab: FilterTab; onTab: (tab: FilterTab) => void; filters: WorkspaceFilters;
  onToggle: (tab: FilterTab, id: string) => void; onSetTags: (tags: string[]) => void; onClose: () => void;
  tags: FilterOption[]; hosts: FilterOption[]; projects: FilterOption[];
  // How many workspaces an option would show, with the search and the other tabs' selections applied.
  counts?: (category: FilterTab, id: string) => number;
  icons?: ProjectIconStore; installationHostId?: string; labelColors?: LabelColorStore;
}) {
  const labels = useLabelColors(labelColors);
  // Sub-level tags start collapsed; checking a group expands it.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggleExpanded = (id: string) => setExpanded((value) => { const next = new Set(value); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const tagColor = (label: string, exact: boolean) => exact
    ? labels.find((item) => item.name.toLowerCase() === label.toLowerCase())?.color ?? tagGroupColor(tagName(label), labels, tagName)
    : tagGroupColor(label.toLowerCase(), labels, tagName);
  const tagText = (text: string, color: IdentityColor | null) => color ? <View style={{ flex: 1, flexDirection: "row" }}>
    <Text numberOfLines={1} style={{ color: identityText(color, dark), backgroundColor: identityTint(color), fontSize: font.sm,
      paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, overflow: "hidden" }}>{text}</Text>
  </View> : <Text numberOfLines={1} style={{ flex: 1, color: theme.colors.foreground, fontSize: font.sm }}>{text}</Text>;
  const count = (id: string) => counts ? <Text accessibilityLabel={`${counts(tab, id)} workspaces`}
    style={{ color: theme.colors.foregroundMuted, fontSize: font.xs, minWidth: 16, textAlign: "right" }}>{counts(tab, id)}</Text> : null;
  const hostColors = tab === "hostIds" ? readHostColors() : new Map();
  const dark = isDarkSurface(theme.colors.surface0);
  const current = filterTabs.find((item) => item.key === tab)!;
  const options: FilterOption[] = tab === "prs" ? prFilters.map((filter) => ({ id: filter, label: prFilterLabels[filter] }))
    : tab === "statuses" ? statuses.map((status) => ({ id: status, label: statusLabels[status] }))
    : tab === "tags" ? tags : tab === "hostIds" ? hosts : projects;
  const selected: readonly string[] = filters[tab];
  // Keep selections whose host or project went away visible, so they can be cleared.
  const listed = options.flatMap((option) => [option, ...(option.children ?? []).map((child) => ({ ...child, exact: true }))]);
  const choices: FilterOption[] = [...listed, ...selected.filter((id) => !listed.some((option) => option.id === id)).map((id) => ({
    id, exact: id.startsWith(exactTagPrefix),
    label: tab === "tags" ? id.replace(exactTagPrefix, "") : `${tab === "hostIds" ? "Unavailable host" : "Unavailable project"} (${id})`,
  }))];
  // Drawn inside the toolbar's dropdown, which gives it its panel and animation.
  return <View>
    <View accessibilityRole="tablist" style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
      {filterTabs.map((item) => {
        const active = item.key === tab, count = filters[item.key].length;
        return <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: active }} aria-selected={active}
          accessibilityLabel={`${item.label}${count ? `, ${count} selected` : ""}`} onPress={() => onTab(item.key)}
          style={{ flex: 1, paddingVertical: 8, alignItems: "center", borderBottomWidth: 2,
            borderBottomColor: active ? theme.colors.accent : "transparent" }}>
          <Text numberOfLines={1} style={{ color: active ? theme.colors.foreground : theme.colors.foregroundMuted, fontSize: font.sm,
            fontWeight: active ? "600" : "400" }}>{item.label}{count ? ` · ${count}` : ""}</Text>
        </Pressable>;
      })}
    </View>
    <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ paddingVertical: 4 }} keyboardShouldPersistTaps="handled">
      {tab === "tags" ? tags.map((option) => {
        const group = { id: option.id, childIds: (option.children ?? []).map((child) => child.id) };
        const state = groupState(group, selected), open = expanded.has(option.id), twoLevel = group.childIds.length > 0;
        return <View key={option.id}>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: state === "some" ? "mixed" : state === "all" }}
            aria-checked={state === "some" ? "mixed" : state === "all"} accessibilityLabel={`Filter tag ${option.label}`}
            onPress={() => {
              const next = toggleGroup(group, selected);
              if (twoLevel && groupState(group, next) !== "none") setExpanded((value) => new Set(value).add(option.id));
              onSetTags(next);
            }}
            style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingRight: 10, paddingLeft: 4, paddingVertical: 7 }}>
            {twoLevel ? <Pressable accessibilityRole="button" accessibilityLabel={`${open ? "Collapse" : "Expand"} tag ${option.label}`}
              accessibilityState={{ expanded: open }} onPress={() => toggleExpanded(option.id)} hitSlop={6}
              style={{ width: 16, alignItems: "center" }}>
              <Icon name={open ? "ChevronDown" : "ChevronRight"} size={font.sm} color={theme.colors.foregroundMuted} />
            </Pressable> : <View style={{ width: 16 }} />}
            <Checkbox theme={theme} state={state} />
            {tagText(option.label, tagColor(option.id, false))}
            {count(option.id)}
          </Pressable>
          {twoLevel && open ? (option.children ?? []).map((child) => {
            const checked = childChecked(group, child.id, selected);
            return <Pressable key={child.id} accessibilityRole="checkbox" accessibilityState={{ checked }} aria-checked={checked}
              accessibilityLabel={`Filter exact tag ${child.label}`} onPress={() => onSetTags(toggleChild(group, child.id, selected))}
              style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingRight: 10, paddingLeft: 52, paddingVertical: 6 }}>
              <Checkbox theme={theme} state={checked ? "all" : "none"} />
              {tagText(subLabel(option.label, child.label), tagColor(child.label, true))}
              {count(child.id)}
            </Pressable>;
          }) : null}
        </View>;
      }).concat(choices.filter((option) => !listed.some((item) => item.id === option.id)).map((option) => {
        // Saved tag selections that no workspace has any more, so they can still be cleared.
        const checked = selected.includes(option.id);
        return <Pressable key={option.id} accessibilityRole="checkbox" accessibilityState={{ checked }} aria-checked={checked}
          accessibilityLabel={`Filter ${option.exact ? "exact " : ""}tag ${option.label}`} onPress={() => onToggle(tab, option.id)}
          style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingRight: 10, paddingLeft: 28, paddingVertical: 7 }}>
          <Checkbox theme={theme} state={checked ? "all" : "none"} />
          {tagText(option.label, null)}
        </Pressable>;
      })) : choices.map((option) => {
        const checked = selected.includes(option.id);
        return <Pressable key={option.id} accessibilityRole="checkbox" accessibilityState={{ checked }} aria-checked={checked}
          accessibilityLabel={`Filter ${option.exact ? "exact " : ""}${current.singular} ${option.label}`} onPress={() => onToggle(tab, option.id)}
          style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingRight: 10, paddingLeft: option.exact ? 34 : 10, paddingVertical: 7 }}>
          <Checkbox theme={theme} state={checked ? "all" : "none"} />
          {option.project ? <ProjectIconView project={option.project} store={icons} installationHostId={installationHostId}
            size={font.md} color={theme.colors.foregroundMuted} /> : null}
          {tab === "statuses" ? <Dot color={statusColor(theme, option.id)} /> : null}
          {tab === "prs" ? <Dot color={prColors[option.id as PrFilter] ? identityText(prColors[option.id as PrFilter]!, dark) : theme.colors.foregroundMuted} /> : null}
          {tab === "hostIds" && hostColors.has(option.id) ? <Dot color={identityColor(hostColors.get(option.id)!)} /> : null}
          <Text numberOfLines={1} style={{ flex: 1, color: theme.colors.foreground, fontSize: font.sm }}>{option.label}</Text>
          {count(option.id)}
        </Pressable>;
      })}
      {!choices.length ? <Text style={{ color: theme.colors.foregroundMuted, fontSize: font.sm, padding: 10 }}>No {current.plural} available.</Text> : null}
    </ScrollView>
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, padding: 8,
      borderTopWidth: 1, borderTopColor: theme.colors.border }}>
      <Text style={{ flex: 1, color: theme.colors.foregroundMuted, fontSize: font.xs }}>Matches any checked value in a tab; tabs combine.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Close filters" onPress={onClose} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
        <Text style={{ color: theme.colors.accent, fontSize: font.sm, fontWeight: "600" }}>Done</Text>
      </Pressable>
    </View>
  </View>;
}
