// Shared motion helpers. Everything here respects the system's reduce-motion setting and stays still when it is on.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { breath } from "../shared/breath";
import { AccessibilityInfo, Animated, Easing, Platform, type ViewStyle } from "react-native";

// React Native Web stops animations through Metro's `global`. Paseo's own bundle defines it; make sure it exists so
// stopping a spinner or slide can never throw.
if (Platform.OS === "web" && !Reflect.has(globalThis, "global")) Reflect.set(globalThis, "global", globalThis);

export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((value) => { if (active) setReduce(value); }, () => {});
    const subscription = AccessibilityInfo.addEventListener?.("reduceMotionChanged", setReduce);
    return () => { active = false; subscription?.remove?.(); };
  }, []);
  return reduce;
}

// Repeating animations are shared per kind, so every row's glow, pulse or spinner moves in step instead of drifting
// apart by when each row appeared. The first user starts a kind's loop and the last one stops it. Each value starts at
// 0, which a loop resets to between cycles. Off, or with reduced motion, a user holds still at `rest`.
type SharedLoop = { value: Animated.Value; users: number; loop: Animated.CompositeAnimation | null };
const sharedLoops = new Map<string, SharedLoop>();
function useSharedLoop(kind: string, on: boolean, duration: number, rest: number, easing: (value: number) => number) {
  const reduceMotion = useReduceMotion();
  const still = useRef(new Animated.Value(rest)).current;
  let shared = sharedLoops.get(kind);
  if (!shared) { shared = { value: new Animated.Value(0), users: 0, loop: null }; sharedLoops.set(kind, shared); }
  const entry = shared;
  const running = on && !reduceMotion;
  useEffect(() => {
    if (!running) return;
    entry.users++;
    if (!entry.loop) {
      entry.value.setValue(0);
      entry.loop = Animated.loop(Animated.timing(entry.value, { toValue: 1, duration, easing, useNativeDriver: false }));
      entry.loop.start();
    }
    return () => {
      entry.users--;
      if (entry.users === 0 && entry.loop) { entry.loop.stop(); entry.loop = null; }
    };
  }, [running]);
  return running ? entry.value : still;
}

// Turns its content continuously, like a loading spinner.
export function Spin({ on = true, children }: { on?: boolean; children: ReactNode }) {
  const turn = useSharedLoop("spin", on, 1000, 0, Easing.linear);
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return <Animated.View style={{ transform: [{ rotate }] }}>{children}</Animated.View>;
}

// Fades its content gently in and out, like a heartbeat.
export function Pulse({ on = true, style, children }: { on?: boolean; style?: ViewStyle; children: ReactNode }) {
  // Steady time shaped by the breathing curve: it dims and shrinks, then returns, evenly.
  const phase = useSharedLoop("pulse", on, 1400, 0, Easing.linear);
  const opacity = phase.interpolate({ inputRange: CURVE_STEPS, outputRange: CURVE_STEPS.map((t) => 1 - 0.65 * breath(t)) });
  const scale = phase.interpolate({ inputRange: CURVE_STEPS, outputRange: CURVE_STEPS.map((t) => 1 - 0.2 * breath(t)) });
  return <Animated.View style={[style, { opacity, transform: [{ scale }] }]}>{children}</Animated.View>;
}

// Kept subtle, but the same wash reads far weaker over a dark surface than a light one, so dark themes get more:
// 1% to 5% on light, 3% to 12% on dark, over a slow three-second breath.
export const WORKING_GLOW = { light: { low: 0.01, high: 0.05 }, dark: { low: 0.03, high: 0.12 }, cycleMs: 3000 };
// Points along a cycle at which the breathing curve is sampled for Animated's interpolation.
const CURVE_STEPS = Array.from({ length: 25 }, (_, i) => i / 24);
// A faint wash of `color` over its parent that slowly brightens and fades, for a row whose workspace is working. When
// the animation is paused or reduced, it holds a steady faint tint.
export function Glow({ color, radius, dark, on = true }: { color: string; radius: number; dark: boolean; on?: boolean }) {
  const range = dark ? WORKING_GLOW.dark : WORKING_GLOW.light;
  // Time runs steadily; the breathing curve shapes it into an even rise and fall.
  const phase = useSharedLoop("glow", on, WORKING_GLOW.cycleMs, 0.25, Easing.linear);
  const opacity = phase.interpolate({ inputRange: CURVE_STEPS, outputRange: CURVE_STEPS.map((t) => range.low + (range.high - range.low) * breath(t)) });
  return <Animated.View testID="working-glow" pointerEvents="none"
    style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, borderRadius: radius, backgroundColor: color, opacity, zIndex: 15 }} />;
}

export const LEAVE_MS = 220;

// Animates its content away (fading, sliding left and collapsing its height) while `leaving`, then calls `onGone`.
// Turning `leaving` off brings it back. With reduced motion, `onGone` runs at once. If it unmounts mid-animation (its
// group collapses, a filter hides it), `onGone` still runs, so what the animation was for still happens.
export function Leaving({ leaving, onGone, children }: { leaving: boolean; onGone: () => void; children: ReactNode }) {
  const reduceMotion = useReduceMotion();
  const progress = useRef(new Animated.Value(1)).current;
  const height = useRef(0);
  const [from, setFrom] = useState<number | null>(null);
  const gone = useRef(onGone);
  gone.current = onGone;
  // Whether a leave is under way that has not yet called `onGone`.
  const pending = useRef(false);
  const finish = () => { if (pending.current) { pending.current = false; gone.current(); } };
  useEffect(() => () => finish(), []);
  useEffect(() => {
    if (!leaving) { pending.current = false; progress.setValue(1); setFrom(null); return; }
    pending.current = true;
    if (reduceMotion) { finish(); return; }
    setFrom(height.current);
    const animation = Animated.timing(progress, { toValue: 0, duration: LEAVE_MS, easing: Easing.in(Easing.cubic), useNativeDriver: false });
    animation.start(({ finished }) => { if (finished) finish(); });
    return () => animation.stop();
  }, [leaving]);
  const animating = leaving && from !== null;
  // The same element throughout, so starting or undoing a leave never remounts the content. At rest on the web it adds
  // no layer of its own (z-index auto), so the row's menus still show over the rows below; iOS and Android take only
  // numbers for zIndex and crash on "auto", and need no such override. While leaving it takes no input.
  return <Animated.View onLayout={(event) => { if (!leaving) height.current = event.nativeEvent.layout.height; }}
    pointerEvents={leaving ? "none" : "auto"} aria-hidden={leaving || undefined}
    style={(animating ? { overflow: "hidden", opacity: progress,
      height: progress.interpolate({ inputRange: [0, 1], outputRange: [0, from] }),
      transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }] }
      : Platform.OS === "web" ? { zIndex: "auto" } : {}) as object}>
    {children}
  </Animated.View>;
}
