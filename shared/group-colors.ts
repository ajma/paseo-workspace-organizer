// Group colors: a palette of clearly different hues, drawn as a see-through tint so the same choice works on light
// and dark themes. A header is tinted more than the workspaces under it, and dark surfaces get more, as the same
// tint reads far weaker over them. (Paseo's label palette is too muted and too close in hue to tell groups apart.)
import { z } from "zod";

export const groupColorNames = ["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "gray"] as const;
export type GroupColor = typeof groupColorNames[number];
const hex: Record<GroupColor, string> = { red: "#ef4444", orange: "#f97316", yellow: "#eab308", green: "#22c55e", teal: "#14b8a6",
  blue: "#3b82f6", purple: "#a855f7", pink: "#ec4899", gray: "#6b7280" };
export const groupColorHex = (color: GroupColor) => hex[color];
// Colors first saved under Paseo's label palette names, before groups had their own palette.
const earlier: Record<string, GroupColor> = { violet: "purple", indigo: "purple", sky: "blue", emerald: "green", amber: "yellow" };
// A saved group color; a missing or unknown one means none.
export const groupColorSchema = z.preprocess((value) => (typeof value === "string" ? earlier[value] ?? value : value),
  z.enum(groupColorNames).nullable()).catch(null).default(null);

export const GROUP_TINT = { light: { header: 0.16, body: 0.07 }, dark: { header: 0.26, body: 0.11 } };
// The header and every workspace and subgroup under it (the default), or the header only.
export const groupColorFills = ["header", "group"] as const;
export type GroupColorFill = typeof groupColorFills[number];

export function groupTint(color: GroupColor, dark: boolean, part: "header" | "body"): string {
  const value = hex[color];
  const [r, g, b] = [1, 3, 5].map((start) => parseInt(value.slice(start, start + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${GROUP_TINT[dark ? "dark" : "light"][part]})`;
}

function parse(color: string): [number, number, number, number] | null {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i.exec(color.trim());
  if (hex) return [parseInt(hex[1], 16), parseInt(hex[2], 16), parseInt(hex[3], 16), hex[4] ? parseInt(hex[4], 16) / 255 : 1];
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(color.trim());
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])];
  return null;
}

// Tints laid over a solid background, as one solid color: a pinned header has to hide the rows scrolling beneath it,
// so it can't be see-through, yet should look the same as when it isn't pinned. Unreadable input is returned as is.
export function blend(background: string, tints: readonly string[]): string {
  const base = parse(background);
  if (!base) return background;
  let [r, g, b] = base;
  for (const tint of tints) {
    const over = parse(tint);
    if (!over) continue;
    const [tr, tg, tb, alpha] = over;
    r = r + (tr - r) * alpha; g = g + (tg - g) * alpha; b = b + (tb - b) * alpha;
  }
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}
