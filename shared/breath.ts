// A breathing curve over one cycle (t from 0 to 1): it rises from 0 to 1 at the midpoint and falls back to 0 the same
// way, slowing at the top and the bottom, so a glow swells and fades evenly instead of flashing past its peak.
export function breath(t: number): number {
  return (1 - Math.cos(2 * Math.PI * t)) / 2;
}
