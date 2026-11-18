// Web-only reads of the Paseo app's own storage. Every export is a no-op on iOS and Android.
import { Platform } from "react-native";
import { isIdentityColor, type IdentityColor } from "../shared/identity-colors";
import { lucide } from "./lucide";

type Storage = { getItem(key: string): string | null };
// Paseo 0.16 keeps its host list, including each host's chosen color, under this key. Not a public contract.
const HOST_REGISTRY_KEY = "@paseo:daemon-registry";

export type HostBadge = "name" | "icon" | "hidden";
// Each host's chosen color and badge (Settings → host → Appearance). A missing badge means Paseo's default.
export function readHostAppearance(): Map<string, { color: IdentityColor | null; badge: HostBadge | null }> {
  const appearance = new Map<string, { color: IdentityColor | null; badge: HostBadge | null }>();
  if (Platform.OS !== "web") return appearance;
  try {
    const storage = Reflect.get(globalThis, "localStorage") as Storage | undefined;
    const hosts: unknown = JSON.parse(storage?.getItem(HOST_REGISTRY_KEY) ?? "[]");
    if (!Array.isArray(hosts)) return appearance;
    for (const host of hosts as { serverId?: unknown; appearance?: { color?: unknown; badgeDisplay?: unknown } }[]) {
      if (typeof host?.serverId !== "string") continue;
      const badge = host.appearance?.badgeDisplay;
      appearance.set(host.serverId, { color: isIdentityColor(host.appearance?.color) ? host.appearance.color : null,
        badge: badge === "name" || badge === "icon" || badge === "hidden" ? badge : null });
    }
  } catch { /* Unreadable or changed storage leaves hosts with Paseo's defaults. */ }
  return appearance;
}

export function readHostColors(): Map<string, IdentityColor> {
  return new Map([...readHostAppearance()].flatMap(([id, value]) => (value.color ? [[id, value.color] as const] : [])));
}

// Paseo's rule: the chosen badge, else hidden for this computer's own host and the name for every other host.
export function hostBadge(chosen: HostBadge | null | undefined, isLocal: boolean): HostBadge {
  return chosen ?? (isLocal ? "hidden" : "name");
}

type KeyEvent = { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; target?: unknown; button?: number;
  preventDefault(): void };
type EventTarget = { addEventListener(type: string, listener: (event: KeyEvent) => void, capture?: boolean): void;
  removeEventListener(type: string, listener: (event: KeyEvent) => void, capture?: boolean): void };

export function isMacPlatform(): boolean {
  const navigator = Reflect.get(globalThis, "navigator") as { platform?: string; userAgent?: string } | undefined;
  return /Mac|iPhone|iPad/i.test(navigator?.platform || navigator?.userAgent || "");
}

// Paseo's archive shortcut: Cmd+Shift+Backspace on macOS, Ctrl+Shift+Backspace elsewhere. Web and desktop only.
export function onArchiveShortcut(handler: () => void): () => void {
  if (Platform.OS !== "web") return () => {};
  const target = Reflect.get(globalThis, "window") as EventTarget | undefined;
  if (!target) return () => {};
  const mac = isMacPlatform();
  const listener = (event: KeyEvent) => {
    if (event.key !== "Backspace" || !event.shiftKey || event.altKey || !(mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey)) return;
    event.preventDefault();
    handler();
  };
  target.addEventListener("keydown", listener, true);
  return () => target.removeEventListener("keydown", listener, true);
}

// Back and forward through opened workspaces, like Chrome: Cmd+Left / Cmd+Right on macOS (Alt+Left / Alt+Right
// elsewhere), except while typing in a field or editor, where those keys move the caret; and the mouse's back and
// forward side buttons, always. Web and desktop only.
export function historyShortcutLabel(direction: -1 | 1): string {
  return isMacPlatform() ? (direction < 0 ? "⌘←" : "⌘→") : (direction < 0 ? "Alt+←" : "Alt+→");
}
export function onHistoryInput(handler: (direction: -1 | 1) => void): () => void {
  if (Platform.OS !== "web") return () => {};
  const target = Reflect.get(globalThis, "window") as EventTarget | undefined;
  if (!target) return () => {};
  const mac = isMacPlatform();
  const onKey = (event: KeyEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (event.shiftKey || (mac ? !event.metaKey || event.ctrlKey || event.altKey : !event.altKey || event.ctrlKey || event.metaKey)) return;
    const element = event.target as { tagName?: string; isContentEditable?: boolean } | null;
    if (element?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element?.tagName ?? "")) return;
    event.preventDefault();
    handler(event.key === "ArrowLeft" ? -1 : 1);
  };
  // Mouse buttons 3 and 4 are the side buttons for back and forward.
  const onMouse = (event: KeyEvent) => {
    if (event.button !== 3 && event.button !== 4) return;
    event.preventDefault();
    handler(event.button === 3 ? -1 : 1);
  };
  target.addEventListener("keydown", onKey, true);
  target.addEventListener("mouseup", onMouse, true);
  return () => { target.removeEventListener("keydown", onKey, true); target.removeEventListener("mouseup", onMouse, true); };
}

// A details panel floating beside a row, above the rest of the app, like Paseo's own sidebar hover cards. Plugins have
// no portal outside their sidebar, so it is built from plain page elements and text nodes (never HTML strings).
type PanelPiece = { icon?: string; text?: string; color: string; bold?: boolean; mono?: boolean; dot?: boolean; spin?: boolean };
// A line of the panel; one with `onOpen` (a PR or issue) is a link.
export type PanelLine = { pieces: readonly PanelPiece[]; onOpen?: () => void; label?: string };
export type FloatingPanel = {
  anchor: { x: number; y: number; width: number; height: number };
  // The row's own element, whose text font the panel copies so it matches the sidebar.
  fontSource?: unknown;
  title: string; lines: readonly PanelLine[]; notes: string | null;
  labels: readonly { name: string; color: string; background: string }[];
  colors: { background: string; border: string; foreground: string; muted: string };
  fontSize: { title: number; body: number };
  // The pointer moving onto (true) or off (false) the panel, so the row can keep it open while it is in use.
  onPointer?: (inside: boolean) => void;
};
type Node = { style: Record<string, string>; textContent: string | null; appendChild(child: Node): void; remove(): void;
  setAttribute(name: string, value: string): void; getBoundingClientRect(): { width: number; height: number };
  addEventListener(type: string, listener: () => void): void;
  querySelector?(selector: string): Node | null };
type DocumentLike = { createElement(tag: string): Node; createElementNS(namespace: string, tag: string): Node; body: Node | null };
const SVG = "http://www.w3.org/2000/svg";
const SYSTEM_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export function canFloat(): boolean {
  return Platform.OS === "web" && Boolean(Reflect.get(globalThis, "document"));
}

function fontOf(source: unknown): string {
  const getStyle = Reflect.get(globalThis, "getComputedStyle") as ((node: unknown) => { fontFamily?: string }) | undefined;
  const node = source as Node | undefined;
  const text = node?.querySelector?.("[dir]") ?? node;
  try { return (text && getStyle?.(text).fontFamily) || SYSTEM_FONT; } catch { return SYSTEM_FONT; }
}

function prefersReducedMotion(): boolean {
  const media = Reflect.get(globalThis, "matchMedia") as ((query: string) => { matches: boolean }) | undefined;
  try { return media?.("(prefers-reduced-motion: reduce)").matches ?? false; } catch { return false; }
}

// Turns a panel icon like a spinner, unless the system asks for reduced motion.
function spin(node: Node) {
  const animate = Reflect.get(node, "animate") as ((frames: object[], options: object) => unknown) | undefined;
  if (typeof animate !== "function" || prefersReducedMotion()) return;
  animate.call(node, [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], { duration: 1000, iterations: Infinity });
}

export function showFloatingPanel(panel: FloatingPanel): () => void {
  if (!canFloat()) return () => {};
  const document = Reflect.get(globalThis, "document") as DocumentLike;
  const view = Reflect.get(globalThis, "window") as { innerWidth: number; innerHeight: number };
  if (!document.body) return () => {};
  const element = (style: Record<string, string>, text?: string) => {
    const node = document.createElement("div");
    Object.assign(node.style, style);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const icon = (name: string, color: string, size: number) => {
    const svg = document.createElementNS(SVG, "svg");
    for (const [key, value] of Object.entries({ width: String(size), height: String(size), viewBox: "0 0 24 24", fill: "none", stroke: color,
      "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" })) svg.setAttribute(key, value);
    Object.assign(svg.style, { flex: "none" });
    for (const [tag, attributes] of lucide[name] ?? []) {
      const shape = document.createElementNS(SVG, tag);
      for (const [key, value] of Object.entries(attributes)) shape.setAttribute(key, value);
      svg.appendChild(shape);
    }
    return svg;
  };
  const gap = 8, margin = 12;
  // An invisible frame as wide as the gap on each side, so the pointer crossing from the row to the panel never leaves
  // both; the visible panel sits inside it.
  const root = element({
    position: "fixed", zIndex: "2147483000", pointerEvents: "auto", boxSizing: "border-box", visibility: "hidden",
    width: "max-content", maxWidth: "min(436px, calc(100vw - 8px))", padding: `0 ${gap}px`, cursor: "auto",
    fontFamily: fontOf(panel.fontSource), fontSize: `${panel.fontSize.body}px`, lineHeight: "1.4", textAlign: "left", letterSpacing: "normal",
  });
  root.setAttribute("role", "tooltip");
  root.setAttribute("aria-label", "Workspace details");
  root.addEventListener("pointerenter", () => panel.onPointer?.(true));
  root.addEventListener("pointerleave", () => panel.onPointer?.(false));
  const card = element({
    boxSizing: "border-box", minWidth: "220px", padding: "12px 14px", borderRadius: "12px",
    border: `1px solid ${panel.colors.border}`, background: panel.colors.background, color: panel.colors.foreground,
    boxShadow: "0 12px 32px rgba(0,0,0,0.22)", display: "flex", flexDirection: "column", gap: "7px",
  });
  root.appendChild(card);
  card.appendChild(element({ fontSize: `${panel.fontSize.title}px`, fontWeight: "500", marginBottom: "2px", overflowWrap: "anywhere" }, panel.title));
  // Each field on its own line: its icon and text in the same colors as the row. PRs and issues open when clicked.
  for (const { pieces, onOpen, label } of panel.lines) {
    const line = element({ display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: "8px", rowGap: "2px", alignSelf: "flex-start" });
    let firstText: Node | null = null;
    if (onOpen) {
      line.setAttribute("role", "link");
      if (label) line.setAttribute("aria-label", label);
      line.style.cursor = "pointer";
      line.addEventListener("click", onOpen);
      line.addEventListener("pointerenter", () => { if (firstText) firstText.style.textDecoration = "underline"; });
      line.addEventListener("pointerleave", () => { if (firstText) firstText.style.textDecoration = "none"; });
    }
    for (const piece of pieces) {
      const part = element({ display: "inline-flex", alignItems: "center", gap: "5px", color: piece.color, minWidth: "0" });
      if (piece.icon) {
        const glyph = icon(piece.icon, piece.color, panel.fontSize.body + 1);
        if (piece.spin) spin(glyph);
        part.appendChild(glyph);
      }
      if (piece.dot) part.appendChild(element({ width: "6px", height: "6px", borderRadius: "3px", background: piece.color, flex: "none" }));
      if (piece.text) {
        const text = element({ overflowWrap: "anywhere", fontWeight: piece.bold ? "600" : "400",
          fontFamily: piece.mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : "inherit" }, piece.text);
        firstText ??= text;
        part.appendChild(text);
      }
      line.appendChild(part);
    }
    card.appendChild(line);
  }
  if (panel.labels.length) {
    const labels = element({ display: "flex", flexWrap: "wrap", gap: "5px", paddingTop: "1px" });
    for (const label of panel.labels) labels.appendChild(element({ color: label.color, background: label.background,
      borderRadius: "999px", padding: "1px 8px", fontSize: `${panel.fontSize.body - 1}px` }, label.name));
    card.appendChild(labels);
  }
  if (panel.notes) card.appendChild(element({ color: panel.colors.muted, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }, panel.notes));
  document.body.appendChild(root);
  // Beside the row on the right (the frame starts at the row's edge); flipped to the left or nudged up when the window is
  // too small.
  const size = root.getBoundingClientRect();
  let left = panel.anchor.x + panel.anchor.width;
  if (left + size.width > view.innerWidth - margin + gap) left = Math.max(margin - gap, panel.anchor.x - size.width);
  const top = Math.max(margin, Math.min(panel.anchor.y, view.innerHeight - margin - size.height));
  Object.assign(root.style, { left: `${left}px`, top: `${top}px`, visibility: "visible" });
  return () => root.remove();
}

// The first opaque background color behind an element, so something drawn over a list can match the list's color.
export function backgroundBehind(node: unknown): string | null {
  if (!canFloat()) return null;
  const getStyle = Reflect.get(globalThis, "getComputedStyle") as ((element: unknown) => { backgroundColor?: string }) | undefined;
  for (let element = node as { parentElement?: unknown } | null; element; element = element.parentElement as typeof element) {
    let color: string | undefined;
    try { color = getStyle?.(element).backgroundColor; } catch { return null; }
    if (color && color !== "transparent" && !/^rgba\(.*,\s*0\)$/.test(color)) return color;
  }
  return null;
}

// The Paseo desktop app runs on Electron; only it has workspace browser tabs.
export function isElectron(): boolean {
  if (Platform.OS !== "web") return false;
  const navigator = Reflect.get(globalThis, "navigator") as { userAgent?: string } | undefined;
  return /Electron/i.test(navigator?.userAgent ?? "");
}
