// A small hint naming a control, shown after the pointer rests on it, for controls that show only an icon.
import { useEffect, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import type { Theme } from "./controls";
import { font } from "./typography";

export const HINT_DELAY_MS = 500;

export function useHint(enabled: boolean) {
  const [shown, setShown] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  useEffect(() => () => clear(), []);
  useEffect(() => { if (!enabled) { clear(); setShown(false); } }, [enabled]);
  const hide = () => { clear(); setShown(false); };
  return {
    shown: enabled && shown,
    onHoverIn: () => { if (!enabled) return; clear(); timer.current = setTimeout(() => setShown(true), HINT_DELAY_MS); },
    onHoverOut: hide,
    // Pressing the control acts on it, so the hint gets out of the way.
    onPressIn: hide,
  };
}

// Drawn just below the control, in the opposite colors of the sidebar so it stands out like a native tooltip.
// A control at the bottom of the sidebar shows it above instead, where there's room.
export function HintBubble({ theme, text, align = "left", side = "below" }: { theme: Theme; text: string; align?: "left" | "right"; side?: "below" | "above" }) {
  return <View role="tooltip" pointerEvents="none" style={{ position: "absolute", zIndex: 100,
    ...(side === "above" ? { bottom: "100%", marginBottom: 6 } : { top: "100%", marginTop: 6 }),
    // "max-content" sizes the bubble to its text on the web; phones never hover, and would crash on a CSS-only width.
    ...(align === "right" ? { right: 0 } : { left: 0 }), ...(Platform.OS === "web" ? { width: "max-content" } : {}), maxWidth: 240,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: theme.colors.foreground,
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } } as object}>
    <Text numberOfLines={2} style={{ color: theme.colors.surface0, fontSize: font.xs, fontWeight: "500" }}>{text}</Text>
  </View>;
}
