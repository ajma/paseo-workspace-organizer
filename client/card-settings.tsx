import { useSettings, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Icon, SettingsAction, SettingsCard, SettingsSection, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import {
  activeLayout, cardFieldLabels, cardFields, cardModeLabels, cardModes, cards, defaultCardSettings, editCustom, labelLimits, titleLinesFor,
  fieldColors, titleLineOptions, toggleField, type CardSettings,
} from "../shared/cards";
import { identityText, isDarkSurface } from "../shared/identity-colors";
import { Segmented } from "./segmented";
import { Button } from "./controls";
import { preferences } from "../shared/organization";
import { WorkspaceCardView } from "./card";
import { sampleCard } from "./card-sample";
import type { Theme } from "./controls";
import { font } from "./typography";
import { useQueuedSave } from "./queued-save";
import { useBracketShortcuts } from "./paseo-shortcuts";

// A settings row whose control sits beside the label on wide screens and below it on phones.
function Row({ theme, compact, title, hint, children }: { theme: Theme; compact: boolean; title: string; hint?: string; children: ReactNode }) {
  return <View style={{ flexDirection: compact ? "column" : "row", alignItems: compact ? "stretch" : "center", gap: 10, paddingVertical: 12 }}>
    <View style={{ flex: compact ? undefined : 1, gap: 3 }}>
      <Text style={{ color: theme.colors.foreground, fontSize: font.md }}>{title}</Text>
      {hint ? <Text style={{ color: theme.colors.foregroundMuted, fontSize: font.sm }}>{hint}</Text> : null}
    </View>
    {children}
  </View>;
}

export function CardSettingsScreen({ theme, layout: surface }: Pick<PluginSurfaceProps, "theme" | "layout">) {
  const compact = surface.compact;
  const settings = useSettings(cards);
  const device = useSettings(preferences);
  const { values: prefs, update: updatePrefs } = useQueuedSave(device);
  const brackets = useBracketShortcuts();
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  if (settings.status !== "ready") return <Text style={{ color: theme.colors.foregroundMuted, fontSize: font.md, padding: 16 }}>
    {settings.status === "loading" ? "Loading row settings…" : settings.error}</Text>;
  const values = settings.values;
  const chosenTitleLines = prefs ? prefs.titleLines : "2";
  const titleLines = titleLinesFor(values.mode, chosenTitleLines);
  const busy = settings.saving;
  const save = (next: CardSettings) => { setError(null); void settings.save(next, settings.revision).then((ok) => { if (!ok) setError(settings.saveError ?? "Couldn't save. Reload and try again."); }); };
  const layout = activeLayout(values);
  const fields = new Set(layout.fields);
  return <View style={{ gap: 16 }}>
    <SettingsSection title="Rows">
      <SettingsCard>
        <View style={{ paddingHorizontal: 16 }}>
          <Row theme={theme} compact={compact} title="View" hint="Simple and Full are fixed; Custom keeps your own fields. Also switchable from the sidebar.">
            <Segmented theme={theme} label="View" disabled={busy} value={values.mode}
              options={cardModes.map((value) => ({ value, label: cardModeLabels[value] }))} onChange={(mode) => save({ ...values, mode })} />
          </Row>
          <View style={{ height: 1, backgroundColor: theme.colors.border }} />
          <View style={{ paddingVertical: 12, gap: 10 }}>
            <View style={{ gap: 3 }}>
              <Text style={{ color: theme.colors.foreground, fontSize: font.md }}>Fields</Text>
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: font.sm }}>What each row shows; changing one switches to Custom. The status and title always show.</Text>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {cardFields.map((field) => {
                const on = fields.has(field);
                return <Pressable key={field} accessibilityRole="checkbox" accessibilityState={{ checked: on }} aria-checked={on}
                  accessibilityLabel={cardFieldLabels[field]} disabled={busy} onPress={() => save(toggleField(values, field))}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1,
                    borderColor: on ? theme.colors.accent : theme.colors.border, backgroundColor: on ? theme.colors.surface2 : "transparent" }}>
                  {on ? <Icon name="Check" size={font.sm} color={theme.colors.accent} /> : null}
                  {fieldColors[field] ? <View style={{ width: 8, height: 8, borderRadius: 4,
                    backgroundColor: identityText(fieldColors[field]!, isDarkSurface(theme.colors.surface0)) }} /> : null}
                  <Text style={{ color: on ? theme.colors.foreground : theme.colors.foregroundMuted, fontSize: font.sm }}>{cardFieldLabels[field]}</Text>
                </Pressable>;
              })}
            </View>
            <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, overflow: "hidden" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8,
                borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                <Text style={{ color: theme.colors.foreground, fontSize: font.sm, fontWeight: "600" }}>Row preview</Text>
                <Text style={{ color: theme.colors.accent, backgroundColor: theme.colors.surface2, fontSize: font.xs, paddingHorizontal: 6,
                  paddingVertical: 2, borderRadius: 4 }}>Sample</Text>
                {compact ? null : <Text style={{ flex: 1, textAlign: "right", color: theme.colors.foregroundMuted, fontSize: font.xs }}>
                  Follows the switches above</Text>}
              </View>
              <View accessibilityLabel="Row preview" style={{ padding: compact ? 10 : 20, backgroundColor: theme.colors.surface0, alignItems: "center" }}>
                <View style={{ width: "100%", maxWidth: 380 }}>
                  <WorkspaceCardView theme={theme} model={sampleCard(Date.now())} fields={fields} labelLimit={layout.labelLimit} titleLines={titleLines}
                    projectIcon={<View style={{ width: font.md, height: font.md, borderRadius: 3, backgroundColor: theme.colors.accent,
                      alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: theme.colors.accentForeground, fontSize: font.xs - 2, fontWeight: "700" }}>B</Text>
                    </View>} />
                </View>
              </View>
            </View>
          </View>
          <View style={{ height: 1, backgroundColor: theme.colors.border }} />
          <Row theme={theme} compact={compact} title="Labels shown">
            <Segmented theme={theme} label="Labels shown" disabled={busy} value={layout.labelLimit}
              options={labelLimits.map((value) => ({ value, label: value === "all" ? "All" : value }))}
              onChange={(labelLimit) => save(editCustom(values, (current) => ({ ...current, labelLimit })))} />
          </Row>
          <View style={{ height: 1, backgroundColor: theme.colors.border }} />
          <Row theme={theme} compact={compact} title="Title lines"
            hint={values.mode === "simple" ? "Simple always shows one line. Applies to Full and Custom; saved on this device only." : "Saved on this device only."}>
            <Segmented theme={theme} label="Title lines" disabled={!prefs} value={chosenTitleLines}
              options={titleLineOptions.map((value) => ({ value, label: value === "all" ? "All" : value }))}
              onChange={(next) => updatePrefs((current) => ({ ...current, titleLines: next }))} />
          </Row>
        </View>
      </SettingsCard>
      <SettingsCard>
        <SettingsSwitch label="Use the Simple view on phones" hint="Phones use the Simple view whatever you pick above."
          value={values.minimalOnPhones} disabled={busy} onValueChange={(minimalOnPhones) => save({ ...values, minimalOnPhones })} />
      </SettingsCard>
      <SettingsCard>
        <SettingsAction label="Reset row settings" hint="Only settings in this section will be restored." actionLabel="Reset rows"
          disabled={busy || confirmingReset} error={error} onPress={() => setConfirmingReset(true)} />
        {confirmingReset ? <View accessibilityRole="alert" style={{ gap: 10, paddingHorizontal: 16, paddingBottom: 16 }}>
          <Text style={{ color: theme.colors.foreground, fontSize: font.md, fontWeight: "600" }}>Are you sure?</Text>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: font.sm }}>
            This restores the view, your Custom fields, labels shown, title lines on this device and the phone setting to their defaults. It can't be undone.
          </Text>
          <View style={{ flexDirection: "row", gap: 8, justifyContent: "flex-end" }}>
            <Button theme={theme} label="Cancel" accessibilityLabel="Cancel reset" onPress={() => setConfirmingReset(false)} />
            <Button theme={theme} label="Reset" accessibilityLabel="Confirm reset" primary disabled={busy} onPress={() => {
              setConfirmingReset(false);
              save(defaultCardSettings());
              updatePrefs((current) => ({ ...current, titleLines: "2" }));
            }} />
          </View>
        </View> : null}
      </SettingsCard>
    </SettingsSection>
    <SettingsSection title="Groups">
      <SettingsCard>
        <SettingsSwitch label="Sticky group headers"
          hint="A group's header stays at the top of the sidebar while you scroll through its workspaces. Saved on this device only."
          value={prefs ? prefs.stickyHeaders : true} disabled={!prefs}
          onValueChange={(stickyHeaders) => updatePrefs((current) => ({ ...current, stickyHeaders }))} />
      </SettingsCard>
    </SettingsSection>
    <SettingsSection title="Links">
      <SettingsCard>
        <SettingsSwitch label="Open links in Paseo browser tabs"
          hint="In the desktop app, PRs and issues open as a browser tab in their workspace. Off, they open in your default browser. Saved on this device only."
          value={prefs ? prefs.linksInPaseo : true} disabled={!prefs}
          onValueChange={(linksInPaseo) => updatePrefs((current) => ({ ...current, linksInPaseo }))} />
      </SettingsCard>
    </SettingsSection>
    {brackets.available ? <SettingsSection title="Back and forward">
      <SettingsCard>
        <SettingsSwitch label="Back and forward with ⌘[ and ⌘]"
          hint="Paseo uses ⌘[ and ⌘] for Previous and Next workspace. Turn this on to use them for back and forward through the workspaces you've opened instead, even while you type. To use your mouse's side buttons, set them to send ⌘[ and ⌘] in the mouse's software. Off gives the keys back to Paseo. This changes Paseo's Settings → Shortcuts."
          value={brackets.freed} onValueChange={brackets.setFreed} />
      </SettingsCard>
    </SettingsSection> : null}
  </View>;
}
