// Shared motion helpers. Everything here respects the system's reduce-motion setting and stays still when it is on.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, Platform } from "react-native";

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

// Repeats a 0 → 1 animation for as long as `on` is true; holds at `rest` otherwise.
function useLoop(on: boolean, duration: number, rest: number, easing: (value: number) => number) {
  const reduceMotion = useReduceMotion();
  const value = useRef(new Animated.Value(rest)).current;
  const running = on && !reduceMotion;
  useEffect(() => {
    if (!running) { value.setValue(rest); return; }
    value.setValue(0);
    const loop = Animated.loop(Animated.timing(value, { toValue: 1, duration, easing, useNativeDriver: false }));
    loop.start();
    return () => loop.stop();
  }, [running]);
  return value;
}

// Turns its content continuously, like a loading spinner.
export function Spin({ on = true, children }: { on?: boolean; children: ReactNode }) {
  const turn = useLoop(on, 1000, 0, Easing.linear);
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return <Animated.View style={{ transform: [{ rotate }] }}>{children}</Animated.View>;
}

// Fades its content gently in and out, like a heartbeat.
export function Pulse({ on = true, children }: { on?: boolean; children: ReactNode }) {
  const phase = useLoop(on, 1400, 0, Easing.inOut(Easing.sin));
  const opacity = phase.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.35, 1] });
  const scale = phase.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.8, 1] });
  return <Animated.View style={{ opacity, transform: [{ scale }] }}>{children}</Animated.View>;
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
