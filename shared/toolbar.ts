// The toolbar's chips, in the order the user arranges them by dragging.
export const toolbarChips = ["search", "filters", "saved", "view", "group", "sort"] as const;
export type ToolbarChip = typeof toolbarChips[number];

// A saved order with unknown chips dropped and any missing ones added at the end, so new chips always appear.
export function chipOrder(saved: readonly string[]): ToolbarChip[] {
  const known = saved.filter((chip): chip is ToolbarChip => (toolbarChips as readonly string[]).includes(chip));
  const unique = [...new Set(known)];
  return [...unique, ...toolbarChips.filter((chip) => !unique.includes(chip))];
}

// Moves a chip before or after another.
export function moveChip(order: readonly string[], chip: ToolbarChip, target: ToolbarChip, side: "before" | "after"): ToolbarChip[] {
  const rest = chipOrder(order).filter((item) => item !== chip);
  if (chip === target) return chipOrder(order);
  const at = rest.indexOf(target) + (side === "after" ? 1 : 0);
  rest.splice(at, 0, chip);
  return rest;
}

// How many chips fit on a line beside icon buttons `iconsWidth` wide; the rest wrap below. Until every width is known
// (before the first layout; an undefined icons width), all chips count as fitting.
export function firstLineCount(chipWidths: readonly (number | undefined)[], rowWidth: number, iconsWidth: number | undefined, gap: number): number {
  if (!rowWidth || iconsWidth === undefined || chipWidths.some((width) => !width)) return chipWidths.length;
  let used = iconsWidth, count = 0;
  for (const width of chipWidths as number[]) {
    if (used + gap + width > rowWidth) break;
    used += gap + width;
    count++;
  }
  return count;
}
