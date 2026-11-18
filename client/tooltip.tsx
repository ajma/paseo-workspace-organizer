import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Pressable, type AccessibilityRole, type AccessibilityState } from "react-native";

// Brief passes over a card don't open its details; resting on a field does.
export const HOVER_DELAY_MS = 500;
// Moving from one field to the next keeps the details open instead of closing and waiting again.
const LEAVE_GRACE_MS = 100;
// React Native Web moves hover from the row to the part under the pointer within the same moment, so a very short
// delay is enough to treat that as staying on the row, and leaving the row clears its highlight right away.
const PRESENCE_GRACE_MS = 30;
// Touch has no hover-out, so details opened by a long press close themselves.
const PRESS_OPEN_MS = 5000;

// `touch` reports the pointer on or off any part of the card (fields, buttons, padding). React Native Web hands hover
// from a parent to the child under the pointer, so the card cannot tell on its own.
type HoverControls = { enter: (id: string) => void; leave: () => void; press: (id: string) => void; touch: (inside: boolean) => void;
  openAt: string | null };
const CardHover = createContext<HoverControls>({ enter: () => {}, leave: () => {}, press: () => {}, touch: () => {}, openAt: null });
export const useCardHoverControls = () => useContext(CardHover);
export const CardHoverProvider = CardHover.Provider;

// One details bubble per card, opened by resting on any of its fields; the card draws it just below itself.
export function useCardHover(): HoverControls & { open: boolean; pointerInside: boolean } {
  const [state, setState] = useState<{ at: string | null; how: false | "hover" | "press" }>({ at: null, how: false });
  const [pointerInside, setPointerInside] = useState(false);
  const outsideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hovered = useRef<string | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = (timer: typeof openTimer) => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  useEffect(() => () => { clear(openTimer); clear(closeTimer); clear(outsideTimer); }, []);
  const touch = (inside: boolean) => {
    clear(outsideTimer);
    if (inside) setPointerInside(true);
    else outsideTimer.current = setTimeout(() => { outsideTimer.current = null; setPointerInside(false); }, PRESENCE_GRACE_MS);
  };
  useEffect(() => {
    if (state.how !== "press") return;
    const timer = setTimeout(() => setState({ at: null, how: false }), PRESS_OPEN_MS);
    return () => clearTimeout(timer);
  }, [state]);
  return {
    pointerInside, touch,
    open: Boolean(state.how),
    openAt: state.how ? state.at : null,
    enter: (id) => {
      touch(true);
      hovered.current = id;
      clear(closeTimer);
      if (state.how) { setState({ at: id, how: "hover" }); return; }
      if (!openTimer.current) openTimer.current = setTimeout(() => {
        openTimer.current = null;
        setState({ at: hovered.current, how: "hover" });
      }, HOVER_DELAY_MS);
    },
    leave: () => {
      touch(false);
      hovered.current = null;
      clear(closeTimer);
      closeTimer.current = setTimeout(() => {
        closeTimer.current = null;
        clear(openTimer);
        if (!hovered.current) setState({ at: null, how: false });
      }, LEAVE_GRACE_MS);
    },
    press: (id) => { clear(openTimer); clear(closeTimer); setState((value) => (value.how ? { at: null, how: false } : { at: id, how: "press" })); },
  };
}

// A card field: reports hover and long press to its card. Its own press still opens the workspace or link.
// `children` may be a function of whether the pointer is on this part, so links can underline themselves on hover.
export function Tip({ children, onPress, accessibilityRole, accessibilityLabel, accessibilityState, grow = false, layer }: {
  children: ReactNode | ((hovered: boolean) => ReactNode); onPress?: () => void; accessibilityRole?: AccessibilityRole; accessibilityLabel?: string;
  accessibilityState?: AccessibilityState; grow?: boolean; layer?: number;
}) {
  const id = useId();
  const hover = useContext(CardHover);
  const [hovered, setHovered] = useState(false);
  return <Pressable accessibilityRole={accessibilityRole} accessibilityLabel={accessibilityLabel} accessibilityState={accessibilityState}
    onPress={onPress} onHoverIn={() => { setHovered(true); hover.enter(id); }} onHoverOut={() => { setHovered(false); hover.leave(); }}
    onLongPress={() => hover.press(id)} delayLongPress={350}
    style={{ position: "relative", zIndex: layer, maxWidth: "100%", flexShrink: grow ? 1 : 0, flexGrow: grow ? 1 : 0 }}>
    {typeof children === "function" ? children(hovered) : children}
  </Pressable>;
}
