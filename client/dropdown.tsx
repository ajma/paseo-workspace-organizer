// The toolbar's dropdowns (Filters, Group by, Sort by): a panel below the button row that fades and slides open and
// closed, or appears instantly when the system asks for reduced motion.
import { Icon } from "@getpaseo/plugin/client/ui";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";
import type { Theme } from "./controls";
import { useReduceMotion } from "./motion";
import { font } from "./typography";

export const DROPDOWN_MS = 140;

export function Dropdown({ theme, open, label, align = "stretch", children }: {
  theme: Theme; open: boolean; label: string; align?: "stretch" | "right"; children: () => ReactNode;
}) {
  const reduceMotion = useReduceMotion();
  const [mounted, setMounted] = useState(open);
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    if (open) setMounted(true);
    if (reduceMotion) { progress.setValue(open ? 1 : 0); if (!open) setMounted(false); return; }
    const animation = Animated.timing(progress, { toValue: open ? 1 : 0, duration: open ? DROPDOWN_MS : DROPDOWN_MS - 30,
      easing: Easing.out(Easing.cubic), useNativeDriver: false });
    animation.start(({ finished }) => { if (finished && !open) setMounted(false); });
    return () => animation.stop();
  }, [open, reduceMotion]);
  if (!mounted) return null;
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] });
  return <Animated.View accessibilityLabel={label} pointerEvents={open ? "auto" : "none"}
    style={{ position: "absolute", top: "100%", marginTop: 4, zIndex: 20, opacity: progress, transform: [{ translateY }],
      ...(align === "right" ? { right: 0, minWidth: 200 } : { left: 0, right: 0 }),
      borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, backgroundColor: theme.colors.surface1,
      shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 }}>
    {children()}
  </Animated.View>;
}

// One choice in a Group by or Sort by menu, checked when it is the current one.
export function MenuChoice({ theme, label, accessibilityLabel = label, selected = false, icon, disabled = false, onPress }: {
  theme: Theme; label: string; accessibilityLabel?: string; selected?: boolean; icon?: string; disabled?: boolean; onPress: () => void;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ selected, disabled }}
    aria-selected={selected} disabled={disabled} onPress={onPress}
    style={(state) => ({ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 6,
      opacity: disabled ? 0.45 : 1,
      backgroundColor: (state as { hovered?: boolean }).hovered ? theme.colors.surface2 : "transparent" })}>
    <View style={{ width: font.md, alignItems: "center" }}>
      {icon ? <Icon name={icon} size={font.md} color={theme.colors.foregroundMuted} />
        : selected ? <Icon name="Check" size={font.md} color={theme.colors.accent} /> : null}
    </View>
    <Text style={{ color: selected ? theme.colors.foreground : theme.colors.foregroundMuted, fontSize: font.sm,
      fontWeight: selected ? "600" : "400" }}>{label}</Text>
  </Pressable>;
}
