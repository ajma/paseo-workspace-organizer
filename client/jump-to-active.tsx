// The "Current workspace" button: it floats at the bottom right of the sidebar while the open workspace's row is out
// of view or inside a collapsed group, and pressing it opens those groups and scrolls the row to the middle.
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Icon } from "@getpaseo/plugin/client/ui";
import { rowOutOfView, scrollOffsetFor, type Span } from "../shared/jump-to-active";
import { COLLAPSE_MS } from "./collapsible";
import { useReduceMotion } from "./motion";
import { HintBubble, useHint } from "./hint";
import type { Theme } from "./controls";
import { font } from "./typography";

type Measurable = { measureInWindow?: (callback: (x: number, y: number, width: number, height: number) => void) => void };
type Scrollable = Measurable & { scrollTo?: (options: { y: number; animated?: boolean }) => void };

// measureInWindow reports asynchronously, and not at all for a node that's gone, so this gives up rather than wait.
function measure(node: unknown): Promise<Span | null> {
  const measureInWindow = (node as Measurable | null)?.measureInWindow?.bind(node);
  if (!measureInWindow) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 500);
    try { measureInWindow((_x, y, _width, height) => { clearTimeout(timer); resolve({ y, height }); }); }
    catch { clearTimeout(timer); resolve(null); }
  });
}

export function useJumpToActive({ activeKey, listed, hiddenBy, expand }: {
  // The open workspace, whether the list includes it (search and filters may hide it), and the collapsed groups around it.
  activeKey: string | null; listed: boolean; hiddenBy: readonly string[]; expand: (ids: string[]) => void;
}) {
  const reduceMotion = useReduceMotion();
  const list = useRef<Scrollable | null>(null);
  const row = useRef<unknown>(null);
  const scrollY = useRef(0);
  const [offscreen, setOffscreen] = useState(false);
  const pending = useRef(false);
  const frame = useRef(false);

  const check = useCallback(() => {
    if (frame.current) return;
    frame.current = true;
    // Once per frame at most: scrolling reports far more often than the answer can change.
    const run = () => {
      frame.current = false;
      void Promise.all([measure(row.current), measure(list.current)]).then(([rowSpan, listSpan]) =>
        setOffscreen(Boolean(rowSpan && listSpan && rowOutOfView(rowSpan, listSpan))));
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run); else setTimeout(run, 16);
  }, []);

  const scrollToRow = useCallback(async () => {
    const [rowSpan, listSpan] = await Promise.all([measure(row.current), measure(list.current)]);
    if (!rowSpan || !listSpan) return;
    list.current?.scrollTo?.({ y: scrollOffsetFor(rowSpan, listSpan, scrollY.current), animated: !reduceMotion });
  }, [reduceMotion]);

  // After opening the groups, wait for them to finish sliding open so the row is where it will stay.
  const hidden = hiddenBy.length > 0;
  useEffect(() => {
    if (!pending.current || hidden) return;
    pending.current = false;
    const timer = setTimeout(() => { void scrollToRow().then(check); }, reduceMotion ? 0 : COLLAPSE_MS + 40);
    return () => clearTimeout(timer);
  }, [hidden]);
  useEffect(() => { check(); }, [activeKey, hidden, check]);

  return {
    show: listed && (hidden || offscreen),
    jump() {
      if (hidden) { pending.current = true; expand([...hiddenBy]); return; }
      void scrollToRow().then(check);
    },
    listRef: useCallback((node: unknown) => { list.current = node as Scrollable | null; }, []),
    // Only the open workspace's row passes its element here.
    rowRef: useCallback((node: unknown) => { row.current = node; if (node) check(); }, [check]),
    scrollProps: {
      scrollEventThrottle: 32,
      onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => { scrollY.current = event.nativeEvent.contentOffset.y; check(); },
      onLayout: check,
      onContentSizeChange: check,
    },
  };
}

// Quiet like the toolbar's icon buttons, so it doesn't compete with the rows; resting on it names what it does.
export function JumpToActiveButton({ theme, onPress }: { theme: Theme; onPress: () => void }) {
  const hint = useHint(true);
  return <View pointerEvents="box-none" style={{ position: "absolute", right: 12, bottom: 12, zIndex: 20 }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Show current workspace" onPress={onPress}
      onHoverIn={hint.onHoverIn} onHoverOut={hint.onHoverOut} onPressIn={hint.onPressIn}
      style={(state) => ({ width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 15, borderWidth: 1,
        borderColor: theme.colors.border, backgroundColor: (state as { hovered?: boolean }).hovered ? theme.colors.surface2 : theme.colors.surface1,
        shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } })}>
      <Icon name="LocateFixed" size={font.md} color={theme.colors.foregroundMuted} />
    </Pressable>
    {hint.shown ? <HintBubble theme={theme} text="Scroll to the current workspace" align="right" side="above" /> : null}
  </View>;
}
