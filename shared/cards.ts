import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import type { IdentityColor } from "./identity-colors";

// Card fields in display order. Paseo exposes no context usage or plan data to plugins, so those are absent.
export const cardFields = [
  "host", "agentBrand", "model", "thinking", "project", "projectIcon", "workspaceName", "branch", "gitStatus",
  "folder", "fullPath", "labels", "links", "notes", "subtasks", "timer", "lastActivity",
] as const;
export type CardField = typeof cardFields[number];
export const cardFieldLabels: Record<CardField, string> = {
  host: "Host", agentBrand: "Agent brand mark", model: "Model", thinking: "Thinking level", project: "Project", projectIcon: "Project icon",
  workspaceName: "Workspace name", branch: "Branch", gitStatus: "Git status", folder: "Folder", fullPath: "Full path",
  labels: "Labels", links: "Linked PRs and issues", notes: "Notes", subtasks: "Subtask summary",
  timer: "Timer / finished at", lastActivity: "Last activity",
};

// Each field's color on the card, from Paseo's identity palette. Labels use their own label colors.
export const fieldColors: Partial<Record<CardField | "issues", IdentityColor>> = {
  host: "blue", project: "emerald", projectIcon: "emerald", workspaceName: "emerald", agentBrand: "violet", model: "violet", thinking: "violet",
  branch: "sky", gitStatus: "sky", folder: "amber", fullPath: "amber", subtasks: "teal", links: "indigo", issues: "pink",
  timer: "orange",
};
// Last activity and notes stay grey, like the time in Paseo's own list.

export const labelLimits = ["1", "2", "3", "all"] as const;
export type LabelLimit = typeof labelLimits[number];
export const titleLineOptions = ["1", "2", "3", "4", "all"] as const;
export type TitleLines = typeof titleLineOptions[number];

// Simple and Full are fixed presets; Custom is the user's own field set, kept while they switch modes.
export const cardModes = ["simple", "full", "custom"] as const;
export type CardMode = typeof cardModes[number];
export const cardModeLabels: Record<CardMode, string> = { simple: "Simple", full: "Full", custom: "Custom" };
type CardLayout = { fields: CardField[]; labelLimit: LabelLimit };
// Field lists are always kept in display order.
const inOrder = (fields: readonly CardField[]) => cardFields.filter((field) => fields.includes(field));
export const cardPresets: Record<Exclude<CardMode, "custom">, { fields: readonly CardField[]; labelLimit: LabelLimit }> = {
  simple: { fields: inOrder(["host", "projectIcon", "project", "labels", "links", "lastActivity"]), labelLimit: "1" },
  full: { fields: cardFields, labelLimit: "all" },
};
const defaultCustom = (): CardLayout => ({
  fields: inOrder(["host", "agentBrand", "model", "projectIcon", "project", "branch", "gitStatus", "labels", "links", "notes", "lastActivity"]), labelLimit: "3" });

const fieldsSchema = z.array(z.string()).transform((fields) => cardFields.filter((field) => fields.includes(field)));
const layoutSchema = z.object({
  fields: fieldsSchema.catch(() => defaultCustom().fields),
  labelLimit: z.enum(labelLimits).catch("3"),
});
export const cardSettingsSchema = z.object({
  mode: z.enum(cardModes).catch("custom").default("custom"),
  custom: layoutSchema.catch(defaultCustom).default(defaultCustom),
  minimalOnPhones: z.boolean().catch(false).default(false),
});
export type CardSettings = z.infer<typeof cardSettingsSchema>;
export const defaultCardSettings = (): CardSettings => cardSettingsSchema.parse({});

// Shared by the installation's clients; title lines are kept per device with the other preferences.
export const cards = defineSettings({ id: "cards", scope: "host", version: 1, schema: cardSettingsSchema });

// The fields and label limit the chosen mode draws.
export function activeLayout(settings: CardSettings): CardLayout {
  return settings.mode === "custom" ? settings.custom : { fields: [...cardPresets[settings.mode].fields], labelLimit: cardPresets[settings.mode].labelLimit };
}
// Editing fields or the label limit edits Custom, starting from what is on screen.
export function editCustom(settings: CardSettings, edit: (layout: CardLayout) => CardLayout): CardSettings {
  const next = edit(activeLayout(settings));
  return { ...settings, mode: "custom", custom: { fields: cardFields.filter((field) => next.fields.includes(field)), labelLimit: next.labelLimit } };
}
export function toggleField(settings: CardSettings, field: CardField): CardSettings {
  return editCustom(settings, (layout) => ({ ...layout,
    fields: layout.fields.includes(field) ? layout.fields.filter((item) => item !== field) : [...layout.fields, field] }));
}
// What a card draws: phones use the Simple card when asked to.
// Simple rows always keep the title to one line; Full and Custom use the device's Title lines setting.
export function titleLinesFor(mode: CardMode, chosen: TitleLines): TitleLines {
  return mode === "simple" ? "1" : chosen;
}
export function effectiveCard(settings: CardSettings, compact: boolean, titleLines: TitleLines = "2"):
  { fields: ReadonlySet<CardField>; labelLimit: LabelLimit; titleLines: TitleLines } {
  const mode = compact && settings.minimalOnPhones ? "simple" : settings.mode;
  const layout = activeLayout({ ...settings, mode });
  return { fields: new Set(layout.fields), labelLimit: layout.labelLimit, titleLines: titleLinesFor(mode, titleLines) };
}
export function limitLabels<T>(labels: readonly T[], limit: LabelLimit): { shown: T[]; hidden: number } {
  const count = limit === "all" ? labels.length : Number(limit);
  return { shown: labels.slice(0, count), hidden: Math.max(0, labels.length - count) };
}
