// A Group field on Paseo's New workspace screen: the new workspace appears in the group picked here. Paseo draws its
// Select as a field like the screen's own Host and Isolation pickers.
import { useNewWorkspace, useSettings, type PluginNewWorkspaceItemProps } from "@getpaseo/plugin/client";
import { Select } from "@getpaseo/plugin/client/ui";
import { View } from "react-native";
import { GROUP_METADATA_KEY, requestedGroup } from "../shared/new-workspace-group";
import { organization } from "../shared/organization";
import { groupPath } from "./editors";

// Select values are strings, so Ungrouped needs one; group ids never start with "__".
const UNGROUPED = "__ungrouped";

export function NewWorkspaceGroupPicker(_props: PluginNewWorkspaceItemProps) {
  const newWorkspace = useNewWorkspace();
  const settings = useSettings(organization);
  // Without any groups there is nothing to pick.
  if (settings.status !== "ready" || !settings.values.groups.length) return null;
  const groups = settings.values.groups;
  const options = [{ value: UNGROUPED, label: "Ungrouped" },
    ...groups.map((group) => ({ value: group.id, label: groupPath(groups, group.id) })).sort((a, b) => a.label.localeCompare(b.label))];
  const picked = requestedGroup(newWorkspace.metadata);
  const value = picked && groups.some((group) => group.id === picked) ? picked : UNGROUPED;
  // Paseo wraps its own pickers in a container that may shrink, so their labels end in "…" when the row runs out of
  // room; plugin items sit directly in the row, so this gives the Group field the same container. Paseo marks the field
  // pending while the pick saves and reports a failure itself.
  return <View style={{ minWidth: 0, flexShrink: 1 }}>
    <Select title="Group" icon="Layers" value={value} options={options}
      onValueChange={({ value: next }) => newWorkspace.setMetadata({ [GROUP_METADATA_KEY]: next === UNGROUPED ? null : next })} />
  </View>;
}
