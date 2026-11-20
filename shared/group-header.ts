// Group header heights, for pinning headers under one another: a top-level header is 42px (a 28px line, 6px padding
// above and below, a 1px border); a subgroup's is about a fifth shorter, 34px (a 24px line, 4px padding).
export const GROUP_HEADER = { height: 42, line: 28, padding: 6 };
export const SUBGROUP_HEADER = { height: 34, line: 24, padding: 4 };

// Where a header at this depth pins: below its top-level ancestor's header and every subgroup header between.
export function stickyTop(depth: number): number {
  return depth <= 0 ? 0 : GROUP_HEADER.height + (depth - 1) * SUBGROUP_HEADER.height;
}
