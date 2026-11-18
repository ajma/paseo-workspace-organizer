import type { PluginSidebarViewProps } from "@getpaseo/plugin/client";
import { Pressable, Text, TextInput, View } from "react-native";
import type { ReactNode } from "react";
import { font } from "./typography";

export type Theme = PluginSidebarViewProps["theme"];
export function Button({ theme, label, accessibilityLabel = label, onPress, disabled = false, primary = false }: {
  theme: Theme; label: string; accessibilityLabel?: string; onPress: () => void; disabled?: boolean; primary?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} disabled={disabled} onPress={onPress}
    style={{ paddingHorizontal: 9, paddingVertical: 7, minHeight: 28, minWidth: 28, maxWidth: "100%", borderRadius: 5,
      backgroundColor: primary ? theme.colors.accent : theme.colors.surface2, opacity: disabled ? 0.45 : 1 }}>
    <Text style={{ color: primary ? theme.colors.accentForeground : theme.colors.foreground, fontSize: font.sm }}>{label}</Text>
  </Pressable>;
}
export function Field({ theme, label, value, onChangeText, multiline = false, placeholder, autoFocus, onSubmit }: {
  theme: Theme; label: string; value: string; onChangeText: (text: string) => void; multiline?: boolean; placeholder?: string;
  autoFocus?: boolean; onSubmit?: () => void;
}) {
  return <View style={{ gap: 5 }}>
    <Text style={{ color: theme.colors.foregroundMuted, fontSize: font.sm }}>{label}</Text>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} multiline={multiline} placeholder={placeholder}
      autoFocus={autoFocus} onSubmitEditing={onSubmit}
      placeholderTextColor={theme.colors.foregroundMuted} autoCapitalize="none" autoCorrect={false}
      style={{ color: theme.colors.foreground, backgroundColor: theme.colors.surface0, borderColor: theme.colors.border,
        borderWidth: 1, padding: 8, borderRadius: 5, fontSize: font.md, minHeight: multiline ? 76 : 34, textAlignVertical: "top" }} />
  </View>;
}
export function Choices({ theme, label, value, options, onSelect }: {
  theme: Theme; label: string; value: string | null; options: { id: string | null; name: string }[];
  onSelect: (id: string | null) => void;
}) {
  return <View style={{ gap: 6 }}>
    <Text style={{ color: theme.colors.foregroundMuted, fontSize: font.sm }}>{label}</Text>
    <View style={{ flexDirection: "row", gap: 5, flexWrap: "wrap" }}>
      {options.map((option) => <Pressable key={option.id ?? "root"} accessibilityRole="radio"
        accessibilityState={{ checked: option.id === value }} accessibilityLabel={option.name}
        onPress={() => onSelect(option.id)} style={{ borderColor: option.id === value ? theme.colors.accent : theme.colors.border,
          backgroundColor: option.id === value ? theme.colors.surface2 : theme.colors.surface0, borderWidth: 1, borderRadius: 5, padding: 7 }}>
        <Text style={{ color: theme.colors.foreground, fontSize: font.sm }}>{option.name}</Text>
      </Pressable>)}
    </View>
  </View>;
}
export function EditorFrame({ theme, title, children }: { theme: Theme; title: string; children: ReactNode }) {
  // Drawn inside a popover, which supplies the border and background.
  return <View style={{ padding: 12, gap: 10 }}>
    <Text style={{ color: theme.colors.foreground, fontSize: font.lg, fontWeight: "600" }}>{title}</Text>
    {children}
  </View>;
}
export function ErrorText({ theme, message }: { theme: Theme; message: string | null }) {
  return message ? <Text accessibilityRole="alert" style={{ color: theme.colors.statusDanger, fontSize: font.sm }}>{message}</Text> : null;
}
