import { useState } from "react";
import { getPaseoClient, type WorkspaceRef } from "@getpaseo/plugin/client";
import { Text, View } from "react-native";
import { descendants, dissolveGroup, emptyDetails, parseLinks, type Group, type Organization } from "../shared/organization";
import { Button, Choices, EditorFrame, ErrorText, Field, type Theme } from "./controls";
import { font } from "./typography";

export type Save = (value: Organization, revision: string) => Promise<boolean>;

export function groupPath(groups: readonly Group[], id: string): string {
  const parts: string[] = [], seen = new Set<string>();
  let group = groups.find((item) => item.id === id);
  while (group && !seen.has(group.id)) {
    seen.add(group.id); parts.unshift(group.name); group = groups.find((item) => item.id === group!.parentId);
  }
  return parts.join(" / ");
}

export function GroupEditor({ theme, value, revision, group, parentId, save, close, saving, saveError }: {
  theme: Theme; value: Organization; revision: string; group?: Group; parentId: string | null;
  save: Save; close: () => void; saving: boolean; saveError: string | null;
}) {
  // Freeze the document and its revision together so a concurrent edit cannot be overwritten.
  const [base] = useState({ value, revision });
  const [name, setName] = useState(group?.name ?? "");
  const [parent, setParent] = useState(group?.parentId ?? parentId);
  const excluded = group ? descendants(base.value.groups, group.id) : new Set<string>();
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    if (!name.trim()) { setError("Give the group a name."); return; }
    const id = group?.id ?? `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const next = { id, name: name.trim(), parentId: parent };
    const groups = group ? base.value.groups.map((item) => item.id === id ? next : item) : [...base.value.groups, next];
    if (await save({ ...base.value, groups }, base.revision)) close();
  }
  return <EditorFrame theme={theme} title={group ? "Edit group" : "New group"}>
    <Field theme={theme} label="Group name" value={name} onChangeText={setName} />
    <Choices theme={theme} label="Parent group" value={parent} onSelect={setParent}
      options={[{ id: null, name: "Top level" }, ...base.value.groups.filter((item) => !excluded.has(item.id)).map((item) => ({ id: item.id, name: groupPath(base.value.groups, item.id) }))]} />
    {group ? <Text style={{ color: theme.colors.foregroundMuted, fontSize: font.sm }}>Removing this group moves its contents to its parent.</Text> : null}
    <ErrorText theme={theme} message={error ?? saveError} />
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      <Button theme={theme} label={saving ? "Saving…" : "Save group"} primary disabled={saving} onPress={() => void submit()} />
      <Button theme={theme} label="Cancel" disabled={saving} onPress={close} />
      {group ? <Button theme={theme} label="Remove group" disabled={saving} onPress={() => {
        void save(dissolveGroup(base.value, group.id), base.revision).then((saved) => { if (saved) close(); });
      }} /> : null}
    </View>
    {saveError ? <Button theme={theme} label="Close and reload latest changes" disabled={saving} onPress={close} /> : null}
  </EditorFrame>;
}

export function WorkspaceEditor({ theme, title, workspaceKey, value, revision, save, close, saving, saveError }: {
  theme: Theme; title: string; workspaceKey: string; value: Organization; revision: string;
  save: Save; close: () => void; saving: boolean; saveError: string | null;
}) {
  const [base] = useState({ value, revision });
  const original = base.value.workspaces[workspaceKey] ?? emptyDetails();
  const [groupId, setGroupId] = useState(original.groupId);
  const [subtitle, setSubtitle] = useState(original.subtitle);
  const [tags, setTags] = useState(original.tags.join(", "));
  const [links, setLinks] = useState(original.links.map((link) => link.url).join("\n"));
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    setError(null);
    try {
      const details = { groupId, subtitle, tags: [...new Set(tags.split(",").map((tag) => tag.trim()).filter(Boolean))], links: parseLinks(links) };
      if (await save({ ...base.value, workspaces: { ...base.value.workspaces, [workspaceKey]: details } }, base.revision)) close();
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
  }
  return <EditorFrame theme={theme} title={`Organize ${title}`}>
    <Choices theme={theme} label="Group" value={groupId} onSelect={setGroupId}
      options={[{ id: null, name: "Ungrouped" }, ...base.value.groups.map((item) => ({ id: item.id, name: groupPath(base.value.groups, item.id) }))]} />
    <Field theme={theme} label="Subtitle" value={subtitle} onChangeText={setSubtitle} multiline placeholder="Add notes on separate lines" />
    <Field theme={theme} label="Tags (comma separated)" value={tags} onChangeText={setTags} placeholder="review, backend" />
    <Field theme={theme} label="GitHub links (one URL per line)" value={links} onChangeText={setLinks} multiline
      placeholder="https://github.com/owner/repo/pull/123" />
    <Text style={{ color: theme.colors.foregroundMuted, fontSize: font.sm }}>Add multiple PR and issue links, including links from other repositories. Paseo’s detected PR is included automatically.</Text>
    <ErrorText theme={theme} message={error ?? saveError} />
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      <Button theme={theme} label={saving ? "Saving…" : "Save workspace"} primary disabled={saving} onPress={() => void submit()} />
      <Button theme={theme} label="Cancel" disabled={saving} onPress={close} />
    </View>
    {saveError ? <Button theme={theme} label="Close and reload latest changes" disabled={saving} onPress={close} /> : null}
  </EditorFrame>;
}

// Renames a workspace the way Paseo's own sidebar does: its title. An empty name goes back to Paseo's default name.
export function RenameEditor({ theme, reference, title, defaultName, close }: {
  theme: Theme; reference: WorkspaceRef; title: string; defaultName: string; close: () => void;
}) {
  const [name, setName] = useState(title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    const next = name.trim();
    if (next === title) { close(); return; }
    setSaving(true); setError(null);
    try {
      await getPaseoClient(reference.hostId).workspaces.ref(reference.id).setTitle(next || null);
      close();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      setSaving(false);
    }
  }
  return <EditorFrame theme={theme} title="Rename workspace">
    <Field theme={theme} label="Workspace name" value={name} onChangeText={setName} autoFocus onSubmit={() => void submit()} />
    <Text style={{ color: theme.colors.foregroundMuted, fontSize: font.sm }}>Leave it empty to use Paseo’s name, “{defaultName}”.</Text>
    <ErrorText theme={theme} message={error} />
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      <Button theme={theme} label={saving ? "Saving…" : "Save name"} primary disabled={saving} onPress={() => void submit()} />
      <Button theme={theme} label="Cancel" disabled={saving} onPress={close} />
    </View>
  </EditorFrame>;
}
