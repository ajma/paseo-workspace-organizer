// Stands in for Paseo's host-provided @getpaseo/plugin/client/ui in the preview and tests.
import { Pressable, Switch, Text, View } from "react-native";
import { createElement, useState, type ReactNode } from "react";
import { previewIcons } from "./lucide-icons";
import type { IconProps } from "@getpaseo/plugin/client/ui";

// The preview draws Paseo's real Lucide icons (and inline SVG marks) so layouts and screenshots look like the app;
// tests keep icons textless.
const kebab = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
export function Icon({ name, icon, size = 14, color }: IconProps) {
  const preview = Reflect.get(globalThis, "__ORGANIZER_PREVIEW_ICONS__") === true;
  if (!preview) return <Text accessibilityElementsHidden style={{ fontSize: size, lineHeight: size + 2, color }}>{name === "Search" ? "⌕" : ""}</Text>;
  const svg = icon && typeof icon === "object" && "svg" in icon ? String(icon.svg) : null;
  if (svg) return createElement("span", { "aria-hidden": true, style: { display: "inline-flex", width: size, height: size, color, flexShrink: 0 },
    dangerouslySetInnerHTML: { __html: svg.replace(/<svg /, `<svg width="${size}" height="${size}" `) } });
  const shapes = previewIcons[kebab(name ?? "")] ?? [["circle", { cx: "12", cy: "12", r: "3" }]];
  return createElement("svg", { "aria-hidden": true, width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color ?? "currentColor",
    strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", style: { flexShrink: 0, display: "block" } },
    ...shapes.map(([tag, attributes], index) => createElement(tag, { key: index, ...attributes })));
}

// Plain stand-ins for Paseo's settings components.
const muted = "#a5acb9", fg = "#e7e9ef";
export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return <View style={{ gap: 12 }}><Text style={{ color: muted, fontSize: 13, fontWeight: "600" }}>{title}</Text>{children}</View>;
}
export function SettingsCard({ children }: { children: ReactNode }) {
  return <View style={{ borderWidth: 1, borderColor: "#353b45", borderRadius: 10, backgroundColor: "#23262d" }}>{children}</View>;
}
function RowFrame({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children?: ReactNode }) {
  return <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16 }}>
    <View style={{ flex: 1, gap: 3 }}><Text style={{ color: fg, fontSize: 14 }}>{label}</Text>
      {hint ? <Text style={{ color: muted, fontSize: 13 }}>{hint}</Text> : null}
      {error ? <Text style={{ color: "#f09090", fontSize: 13 }}>{error}</Text> : null}</View>
    {children}
  </View>;
}
export function SettingsSwitch({ label, hint, value, onValueChange, disabled }: { label: string; hint?: string; value: boolean; onValueChange(value: boolean): void; disabled?: boolean }) {
  return <RowFrame label={label} hint={hint}><Switch accessibilityLabel={label} value={value} disabled={disabled} onValueChange={onValueChange} /></RowFrame>;
}
export function SettingsAction({ label, hint, error, actionLabel, onPress, disabled }: { label: string; hint?: string; error?: string | null; actionLabel: string; onPress(): void; disabled?: boolean }) {
  return <RowFrame label={label} hint={hint} error={error}>
    <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} disabled={disabled} onPress={onPress}
      style={{ borderWidth: 1, borderColor: "#353b45", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 }}>
      <Text style={{ color: fg, fontSize: 14 }}>{actionLabel}</Text></Pressable>
  </RowFrame>;
}

// Toasts in the preview and tests are recorded instead of shown.
export const shownToasts: { message: string; kind: "show" | "error" }[] = [];
export function useToast() {
  return { show: (message: string) => { shownToasts.push({ message, kind: "show" }); }, error: (message: string) => { shownToasts.push({ message, kind: "error" }); } };
}

// Copies in the preview and tests are recorded instead of reaching the clipboard.
export const copiedTexts: string[] = [];
export async function copyText(text: string) { copiedTexts.push(text); }

// A settings row whose value is picked from a short list, drawn as a row of choices.
export function SettingsSelect<Value extends string>({ label, hint, value, options, onValueChange, disabled }: {
  label: string; hint?: string; value: Value; options: readonly { value: Value; label: string }[]; onValueChange(value: Value): void; disabled?: boolean;
}) {
  return <RowFrame label={label} hint={hint}>
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, justifyContent: "flex-end", maxWidth: 320 }}>
      {options.map((option) => <Pressable key={option.value} accessibilityRole="radio" aria-checked={option.value === value}
        accessibilityLabel={`${label} ${option.label}`} disabled={disabled} onPress={() => onValueChange(option.value)}
        style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: option.value === value ? "#2d323b" : "transparent" }}>
        <Text style={{ color: option.value === value ? fg : muted, fontSize: 13 }}>{option.label}</Text>
      </Pressable>)}
    </View>
  </RowFrame>;
}

// Stands in for Paseo's composer controls: the current value as a button that opens the options.
export function Select<Value extends string>({ title, value, options, onValueChange, disabled }: {
  title: string; value: Value; options: readonly { value: Value; label: string }[]; onValueChange(event: { value: Value }): void | Promise<void>;
  disabled?: boolean; icon?: unknown;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value);
  return <View>
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}, currently ${current?.label ?? value}`} disabled={disabled} onPress={() => setOpen(!open)}>
      <Text>{title}: {current?.label ?? value}</Text>
    </Pressable>
    {open ? options.map((option) => <Pressable key={option.value} accessibilityRole="button" accessibilityLabel={`${title} ${option.label}`}
      onPress={() => { setOpen(false); void onValueChange({ value: option.value }); }}><Text>{option.label}</Text></Pressable>) : null}
  </View>;
}
