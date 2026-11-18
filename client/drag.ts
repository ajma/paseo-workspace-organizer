// Drag and drop for rows and group headers, using the browser's own drag and drop (the desktop app and web). React
// Native has none, so on iOS and Android nothing is draggable and workspaces move with Edit details instead.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Platform } from "react-native";

export type DragPayload = { kind: "workspace"; key: string; bucket: string } | { kind: "group"; id: string } | { kind: "chip"; id: string };
export type DropPosition = "before" | "after" | "inside";

type Listener = () => void;
type DragEventLike = { clientX: number; clientY: number; preventDefault(): void; stopPropagation(): void; relatedTarget?: unknown;
  dataTransfer?: { effectAllowed?: string; dropEffect?: string; setData?(type: string, value: string): void } | null };
type ElementLike = { setAttribute(name: string, value: string): void; removeAttribute(name: string): void;
  addEventListener(type: string, listener: (event: DragEventLike) => void): void;
  removeEventListener(type: string, listener: (event: DragEventLike) => void): void;
  getBoundingClientRect(): { top: number; height: number; left: number; width: number }; contains?(node: unknown): boolean };

// The one drag in progress, shared by every row and header, and the group a drop would land in (highlighted whole).
let current: DragPayload | null = null;
let targetGroup: string | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();
const notify = () => { for (const listener of listeners) listener(); };
function setCurrent(payload: DragPayload | null) {
  current = payload;
  if (!payload) { targetGroup = null; if (clearTimer) clearTimeout(clearTimer); clearTimer = null; }
  notify();
}
// Moving between rows of one group leaves one and enters the next; a short delay keeps the highlight from flickering.
export function setTargetGroup(group: string | null) {
  if (clearTimer) { clearTimeout(clearTimer); clearTimer = null; }
  if (group !== null) { if (targetGroup !== group) { targetGroup = group; notify(); } return; }
  clearTimer = setTimeout(() => { clearTimer = null; if (targetGroup !== null) { targetGroup = null; notify(); } }, 80);
}
export function useTargetGroup(): string | null {
  return useSyncExternalStore(subscribe, () => targetGroup, () => null);
}
const subscribe = (listener: Listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export const canDrag = () => Platform.OS === "web";

// What is being dragged, or null; updates every subscriber when a drag starts or ends.
export function useDragging(): DragPayload | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

// Makes an element draggable while `payload` is set, and a drop target while `decide` is given: `decide` turns the
// dragged item and the pointer's height within the element (0 top, 1 bottom) into a position, or null to refuse.
// Attach `ref` to the element; `position` is where an accepted drop would land, for drawing the indicator.
export function useDragDrop({ payload, label, decide, onDrop, group, axis = "y" }: {
  payload: DragPayload | null; label: string;
  decide?: (payload: DragPayload, ratio: number) => DropPosition | null;
  onDrop?: (payload: DragPayload, position: DropPosition) => void;
  // The group a drop "inside" this element lands in, highlighted while the pointer is over it.
  group?: string;
  // "x" measures the pointer across the element (0 left, 1 right) instead of down it, for side-by-side items.
  axis?: "x" | "y";
}): { ref: (node: unknown) => void; position: DropPosition | null } {
  const [node, setNode] = useState<ElementLike | null>(null);
  const [position, setPosition] = useState<DropPosition | null>(null);
  const latest = useRef({ payload, decide, onDrop, group });
  latest.current = { payload, decide, onDrop, group };
  const dragging = useDragging();
  useEffect(() => { if (!dragging) setPosition(null); }, [dragging]);
  const draggable = payload !== null && canDrag();
  useEffect(() => {
    if (!node || !draggable) return;
    node.setAttribute("draggable", "true");
    const start = (event: DragEventLike) => {
      event.stopPropagation();
      if (event.dataTransfer) { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData?.("text/plain", label); }
      // Marking the drag after the browser takes its snapshot keeps the row's normal look in the drag image.
      const dragged = latest.current.payload;
      setTimeout(() => setCurrent(dragged), 0);
    };
    const end = () => setCurrent(null);
    node.addEventListener("dragstart", start);
    node.addEventListener("dragend", end);
    return () => { node.removeAttribute("draggable"); node.removeEventListener("dragstart", start); node.removeEventListener("dragend", end); };
  }, [node, draggable, label]);
  const droppable = Boolean(decide) && canDrag();
  useEffect(() => {
    if (!node || !droppable) return;
    const at = (event: DragEventLike) => {
      const decideNow = latest.current.decide;
      if (!current || !decideNow) return null;
      const rect = node.getBoundingClientRect();
      if (axis === "x") return decideNow(current, rect.width ? (event.clientX - rect.left) / rect.width : 0.5);
      return decideNow(current, rect.height ? (event.clientY - rect.top) / rect.height : 0.5);
    };
    const over = (event: DragEventLike) => {
      const next = at(event);
      if (next) {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      }
      setPosition(next);
      if (latest.current.group !== undefined) setTargetGroup(next === "inside" ? latest.current.group : null);
    };
    const leave = (event: DragEventLike) => {
      if (node.contains?.(event.relatedTarget)) return;
      setPosition(null);
      if (latest.current.group !== undefined) setTargetGroup(null);
    };
    const drop = (event: DragEventLike) => {
      const next = at(event);
      setPosition(null);
      if (!next || !current) return;
      event.preventDefault();
      event.stopPropagation();
      const dropped = current;
      setCurrent(null);
      latest.current.onDrop?.(dropped, next);
    };
    node.addEventListener("dragover", over);
    node.addEventListener("dragleave", leave);
    node.addEventListener("drop", drop);
    return () => { node.removeEventListener("dragover", over); node.removeEventListener("dragleave", leave); node.removeEventListener("drop", drop); };
  }, [node, droppable]);
  return { ref: setNode as (node: unknown) => void, position };
}
