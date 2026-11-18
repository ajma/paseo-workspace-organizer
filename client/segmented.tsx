import { Pressable, Text, View } from "react-native";
import type { Theme } from "./controls";
import { font } from "./typography";

// A row of mutually exclusive choices. The small size fits the sidebar header.
export function Segmented<Value extends string>({ theme, label, options, value, onChange, disabled, small = false }: {
  theme: Theme; label: string; options: readonly { value: Value; label: string }[]; value: Value | null; onChange: (value: Value) => void;
  disabled?: boolean; small?: boolean;
}) {
  return <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: "row", padding: 3, gap: 2, borderRadius: 8,
    backgroundColor: theme.colors.surface2, alignSelf: "flex-start", opacity: disabled ? 0.5 : 1 }}>
    {options.map((option) => {
      const selected = option.value === value;
      return <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: selected }} aria-checked={selected}
        accessibilityLabel={`${label} ${option.label}`} disabled={disabled} onPress={() => onChange(option.value)}
        style={{ paddingHorizontal: small ? 8 : 12, paddingVertical: small ? 4 : 6, borderRadius: 6, backgroundColor: selected ? theme.colors.surface0 : "transparent" }}>
        <Text style={{ color: selected ? theme.colors.foreground : theme.colors.foregroundMuted, fontSize: small ? font.xs : font.sm, fontWeight: selected ? "600" : "400" }}>
          {option.label}</Text>
      </Pressable>;
    })}
  </View>;
}

