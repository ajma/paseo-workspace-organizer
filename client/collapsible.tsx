import { Icon } from "@getpaseo/plugin/client/ui";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, View } from "react-native";
import { useReduceMotion } from "./motion";

export const COLLAPSE_MS = 180;

// Slides its content open and closed by animating height. Closed content is unmounted once the animation ends, and
// `animate` false (for example while searching) switches instantly. Open content keeps its natural height so rows
// that grow or shrink are never clipped.
export function Collapsible({ open, animate = true, children }: { open: boolean; animate?: boolean; children: () => ReactNode }) {
  const reduceMotion = useReduceMotion();
  const [mounted, setMounted] = useState(open);
  const [animating, setAnimating] = useState(false);
  const height = useRef(new Animated.Value(0)).current;
  const contentHeight = useRef(0);
  const waitingForLayout = useRef(false);
  const first = useRef(true);
  const run = (to: number, done: () => void) => {
    Animated.timing(height, { toValue: to, duration: COLLAPSE_MS, easing: Easing.out(Easing.cubic), useNativeDriver: false })
      .start(({ finished }) => { if (finished) done(); });
  };
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    height.stopAnimation();
    if (!animate || reduceMotion) { setMounted(open); setAnimating(false); return; }
    if (open) {
      // Mount at zero height, then grow to the content's measured height once it lays out.
      height.setValue(0);
      waitingForLayout.current = true;
      setMounted(true);
      setAnimating(true);
    } else {
      height.setValue(contentHeight.current);
      setAnimating(true);
      run(0, () => { setMounted(false); setAnimating(false); });
    }
  }, [open]);
  if (!mounted) return null;
  return <Animated.View style={{ overflow: animating ? "hidden" : "visible", height: animating ? height : undefined }}>
    <View onLayout={(event) => {
      contentHeight.current = event.nativeEvent.layout.height;
      if (waitingForLayout.current) {
        waitingForLayout.current = false;
        run(contentHeight.current, () => setAnimating(false));
      }
    }}>{children()}</View>
  </Animated.View>;
}

// A chevron that turns from ">" (closed) to "v" (open) along with its group.
export function TurningChevron({ open, size, color, animate = true }: { open: boolean; size: number; color: string; animate?: boolean }) {
  const reduceMotion = useReduceMotion();
  const turn = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    if (!animate || reduceMotion) { turn.setValue(open ? 1 : 0); return; }
    Animated.timing(turn, { toValue: open ? 1 : 0, duration: COLLAPSE_MS, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [open]);
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "90deg"] });
  return <Animated.View style={{ transform: [{ rotate }] }}><Icon name="ChevronRight" size={size} color={color} /></Animated.View>;
}
