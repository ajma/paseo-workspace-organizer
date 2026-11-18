// Paseo's identity palette, used for label and host colors (copied from the Paseo 0.16 app, which does not expose it).
export const identityColorNames = ["violet", "sky", "emerald", "orange", "pink", "indigo", "teal", "red", "amber", "blue"] as const;
export type IdentityColor = typeof identityColorNames[number];
const base: Record<IdentityColor, string> = { violet: "#7a6aa8", sky: "#3d7ea6", emerald: "#388068", orange: "#a4673a", pink: "#b05c80",
  indigo: "#6a70b8", teal: "#368080", red: "#b06260", amber: "#8f7838", blue: "#5179b0" };
const lightText: Record<IdentityColor, string> = { violet: "#6d49b5", sky: "#3d6985", emerald: "#3e6e5d", orange: "#845838", pink: "#974168",
  indigo: "#5251c2", teal: "#3e6d6c", red: "#9c4243", amber: "#716239", blue: "#39649e" };
const darkText: Record<IdentityColor, string> = { violet: "#a392d5", sky: "#6aa6ce", emerald: "#6cae96", orange: "#cc8f64", pink: "#d87da3",
  indigo: "#9299d5", teal: "#6cacab", red: "#d88381", amber: "#b29d64", blue: "#7ba1d5" };

export const isIdentityColor = (value: unknown): value is IdentityColor => identityColorNames.includes(value as IdentityColor);
export const identityColor = (name: IdentityColor) => base[name];
export const identityTint = (name: IdentityColor) => `${base[name]}1a`;
export const identityText = (name: IdentityColor, dark: boolean) => (dark ? darkText : lightText)[name];

// Plugin themes carry no light/dark flag, so judge by the surface color.
export function isDarkSurface(color: string): boolean {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(color);
  if (!match) return true;
  const [r, g, b] = match.slice(1).map((part) => parseInt(part, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
}

// A filter tag's color: the label with exactly that name, else the first colored label grouped under it.
export function tagGroupColor(group: string, labels: readonly { name: string; color: IdentityColor }[], groupOf: (name: string) => string): IdentityColor | null {
  const key = group.toLowerCase();
  return labels.find((label) => label.name.toLowerCase() === key)?.color
    ?? labels.find((label) => groupOf(label.name).toLowerCase() === key)?.color ?? null;
}
