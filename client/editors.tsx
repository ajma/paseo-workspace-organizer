import { useState } from "react";
import { Icon } from "@getpaseo/plugin/client/ui";
import { getPaseoClient, type WorkspaceRef } from "@getpaseo/plugin/client";
import { Pressable, Text, View } from "react-native";
import { descendants, dissolveGroup, emptyDetails, mergeLinks, orderLinks, type GithubLink, type Group, type Organization } from "../shared/organization";
import { parseLinkInput } from "../shared/link-resolve";
import { Button, Choices, EditorFrame, ErrorText, Field, type Theme } from "./controls";
import { font } from "./typography";
import { groupColorHex, groupColorNames, type GroupColor } from "../shared/group-colors";
import { linkLook, type GithubState } from "./card-fields";
import { pascal } from "./lucide";
import type { GithubStatus } from "../shared/github-status";

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
  const [color, setColor] = useState<GroupColor | null>(group?.color ?? null);
  const excluded = group ? descendants(base.value.groups, group.id) : new Set<string>();
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    if (!name.trim()) { setError("Give the group a name."); return; }
    const id = group?.id ?? `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const next = { id, name: name.trim(), parentId: parent, color };
    const groups = group ? base.value.groups.map((item) => item.id === id ? next : item) : [...base.value.groups, next];
    if (await save({ ...base.value, groups }, base.revision)) close();
  }
  return <EditorFrame theme={theme} title={group ? "Edit group" : "New group"}>
    <Field theme={theme} label="Group name" value={name} onChangeText={setName} />
    <Choices theme={theme} label="Parent group" value={parent} onSelect={setParent}
      options={[{ id: null, name: "Top level" }, ...base.value.groups.filter((item) => !excluded.has(item.id)).map((item) => ({ id: item.id, name: groupPath(base.value.groups, item.id) }))]} />
    <ColorChoices theme={theme} value={color} onSelect={setColor} />
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

// Swatches in each color at full strength; the group shows it as a lighter tint.
function ColorChoices({ theme, value, onSelect }: { theme: Theme; value: GroupColor | null; onSelect: (color: GroupColor | null) => void }) {
  const swatch = (color: GroupColor | null) => {
    const selected = value === color;
    const name = color ? color[0].toUpperCase() + color.slice(1) : "No color";
    return <Pressable key={color ?? "none"} accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={name}
      onPress={() => onSelect(color)} style={{ padding: 2, borderRadius: 13, borderWidth: 2, borderColor: selected ? theme.colors.accent : "transparent" }}>
      <View style={{ width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center",
        ...(color ? { backgroundColor: groupColorHex(color) } : { borderWidth: 1, borderColor: theme.colors.border }) }}>
        {color ? null : <Icon name="X" size={11} color={theme.colors.foregroundMuted} />}
      </View>
    </Pressable>;
  };
  return <View style={{ gap: 6 }}>
    <Text style={{ color: theme.colors.foregroundMuted, fontSize: font.sm }}>Color</Text>
    <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 2 }}>
      {[null, ...groupColorNames].map(swatch)}
    </View>
  </View>;
}

// Looks bare PR or issue numbers up in the workspace's repository.
export type ResolveNumbers = (numbers: number[]) => Promise<{ links: GithubLink[]; errors: string[] }>;

const linkLabel = (link: GithubLink) => `${link.kind === "pr" ? "PR" : "issue"} ${link.repository}#${link.number}`;

// The row's icon and color for the link's state (when known), so the list reads like the row.
function LinkName({ link, theme, state }: { link: GithubLink; theme: Theme; state?: GithubState }) {
  const { icon, color } = linkLook(link.kind, state, theme);
  return <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
    <View accessible accessibilityLabel={link.kind === "pr" ? "Pull request" : "Issue"}>
      <Icon name={pascal(icon)} size={font.sm} color={color} />
    </View>
    <Text numberOfLines={1} style={{ flex: 1, color: theme.colors.foreground, fontSize: font.sm }}>{`${link.repository}#${link.number}`}</Text>
  </View>;
}

export function WorkspaceEditor({ theme, title, workspaceKey, value, revision, save, close, saving, saveError, resolveNumbers, detected = [], statuses = {} }: {
  theme: Theme; title: string; workspaceKey: string; value: Organization; revision: string;
  save: Save; close: () => void; saving: boolean; saveError: string | null; resolveNumbers?: ResolveNumbers;
  // What GitHub reports for each link, by URL, for its icon.
  statuses?: Readonly<Record<string, GithubStatus>>;
  // Links found automatically (Paseo's detected PR, issues named in the title or branch): shown, but not saved here.
  detected?: readonly GithubLink[];
}) {
  const [base] = useState({ value, revision });
  const original = base.value.workspaces[workspaceKey] ?? emptyDetails();
  const [groupId, setGroupId] = useState(original.groupId);
  const [subtitle, setSubtitle] = useState(original.subtitle);
  const [tags, setTags] = useState(original.tags.join(", "));
  const [links, setLinks] = useState<GithubLink[]>(original.links);
  const [adding, setAdding] = useState("");
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saved = new Set(links.map((link) => link.url.toLowerCase()));
  const automatic = detected.filter((link) => !saved.has(link.url.toLowerCase()));
  // Adds what's typed in the box (URLs or bare numbers, several at once) to the list; null when something in it
  // can't be added, which leaves the text in place with the reason.
  async function addTyped(current: GithubLink[]): Promise<GithubLink[] | null> {
    if (!adding.trim()) return current;
    setError(null);
    try {
      const parsed = parseLinkInput(adding);
      let found: GithubLink[] = [];
      if (parsed.numbers.length) {
        if (!resolveNumbers) { setError("Looking up a bare number needs the plugin on this workspace's host. Paste the full URL instead."); return null; }
        setLooking(true);
        const result = await resolveNumbers(parsed.numbers).finally(() => setLooking(false));
        if (result.errors.length) { setError(result.errors.join("\n")); return null; }
        found = result.links;
      }
      const next = mergeLinks(current, parsed.links, found);
      setLinks(next);
      setAdding("");
      return next;
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); return null; }
  }
  async function submit() {
    setError(null);
    // Text left in the box is added rather than lost.
    const next = await addTyped(links);
    if (!next) return;
    const details = { groupId, subtitle, tags: [...new Set(tags.split(",").map((tag) => tag.trim()).filter(Boolean))], links: next };
    if (await save({ ...base.value, workspaces: { ...base.value.workspaces, [workspaceKey]: details } }, base.revision)) close();
  }
  return <EditorFrame theme={theme} title={`Organize ${title}`}>
    <Choices theme={theme} label="Group" value={groupId} onSelect={setGroupId}
      options={[{ id: null, name: "Ungrouped" }, ...base.value.groups.map((item) => ({ id: item.id, name: groupPath(base.value.groups, item.id) }))]} />
    <Field theme={theme} label="Subtitle" value={subtitle} onChangeText={setSubtitle} multiline placeholder="Add notes on separate lines" />
    <Field theme={theme} label="Tags (comma separated)" value={tags} onChangeText={setTags} placeholder="review, backend" />
    <View style={{ gap: 5 }}>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: font.sm }}>GitHub links</Text>
      <View accessibilityLabel="Linked PRs and issues" style={{ gap: 2 }}>
        {orderLinks(links).map((link) => <View key={link.url} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 3 }}>
          <LinkName link={link} theme={theme} state={statuses[link.url]?.state} />
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${linkLabel(link)}`} disabled={saving}
            onPress={() => setLinks(links.filter((item) => item.url !== link.url))} style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
            <Icon name="X" size={font.sm} color={theme.colors.foregroundMuted} />
          </Pressable>
        </View>)}
        {orderLinks(automatic).map((link) => <View key={link.url} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 3 }}>
          <LinkName link={link} theme={theme} state={statuses[link.url]?.state} />
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: font.xs }}>found automatically</Text>
        </View>)}
        {!links.length && !automatic.length ? <Text style={{ color: theme.colors.foregroundMuted, fontSize: font.sm }}>None yet.</Text> : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6 }}>
        <View style={{ flex: 1 }}>
          <Field theme={theme} label="Add GitHub link" value={adding} onChangeText={setAdding} placeholder="PR or issue URL, or #123"
            onSubmit={() => void addTyped(links)} />
        </View>
        <Button theme={theme} label={looking ? "Looking up…" : "Add"} accessibilityLabel="Add link" disabled={saving || looking || !adding.trim()}
          onPress={() => void addTyped(links)} />
      </View>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: font.sm }}>Paste a PR or issue URL from any repository, or a bare number like #456 to look it up in this workspace’s repository (workspaces on the plugin’s host only). Paseo’s detected PR and issues named in the workspace’s title or branch are found automatically.</Text>
    </View>
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
