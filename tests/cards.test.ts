import { describe, expect, it } from "vitest";
import { activeLayout, cardFields, cardPresets, cardSettingsSchema, defaultCardSettings, editCustom, effectiveCard, limitLabels, toggleField } from "../shared/cards";

describe("card settings", () => {
  it("defaults to Custom with the former Standard fields", () => {
    const settings = defaultCardSettings();
    expect(settings.mode).toBe("custom");
    expect(activeLayout(settings).fields).toContain("model");
    expect(activeLayout(settings).fields).not.toContain("subtasks");
    expect(settings.minimalOnPhones).toBe(false);
  });
  it("switches between Simple, Full and Custom without losing the custom fields", () => {
    const custom = toggleField(defaultCardSettings(), "subtasks");
    const full = { ...custom, mode: "full" as const };
    expect(activeLayout(full)).toEqual({ fields: [...cardFields], labelLimit: "all" });
    expect(activeLayout({ ...custom, mode: "simple" })).toEqual({ fields: [...cardPresets.simple.fields], labelLimit: "1" });
    expect(activeLayout({ ...full, mode: "custom" }).fields).toContain("subtasks");
  });
  it("edits Custom starting from the fields on screen", () => {
    const fromFull = toggleField({ ...defaultCardSettings(), mode: "full" }, "model");
    expect(fromFull.mode).toBe("custom");
    expect(fromFull.custom.fields).toEqual(cardFields.filter((field) => field !== "model"));
    const limited = editCustom({ ...defaultCardSettings(), mode: "simple" }, (layout) => ({ ...layout, labelLimit: "2" }));
    expect(limited).toMatchObject({ mode: "custom", custom: { fields: [...cardPresets.simple.fields], labelLimit: "2" } });
  });
  it("keeps fields in display order and drops unknown or broken values", () => {
    expect(cardSettingsSchema.parse({ custom: { fields: ["lastActivity", "contextRing", "branch"] } }).custom.fields).toEqual(["branch", "lastActivity"]);
    expect(cardSettingsSchema.parse({ mode: "huge", custom: "broken", minimalOnPhones: "yes" })).toEqual(defaultCardSettings());
  });
  it("uses the Simple card on phones only when asked", () => {
    const settings = { ...defaultCardSettings(), mode: "full" as const, minimalOnPhones: true };
    expect([...effectiveCard(settings, true).fields]).toEqual([...cardPresets.simple.fields]);
    expect(effectiveCard(settings, false).fields.has("model")).toBe(true);
    expect(effectiveCard({ ...settings, minimalOnPhones: false }, true).fields.has("model")).toBe(true);
  });
  it("keeps Simple titles to one line while Full and Custom use the chosen title lines", () => {
    const settings = defaultCardSettings();
    expect(effectiveCard({ ...settings, mode: "simple" }, false, "3").titleLines).toBe("1");
    expect(effectiveCard({ ...settings, mode: "full" }, false, "3").titleLines).toBe("3");
    expect(effectiveCard(settings, false, "all").titleLines).toBe("all");
    expect(effectiveCard({ ...settings, minimalOnPhones: true }, true, "3").titleLines).toBe("1");
  });
  it("limits labels and counts the rest", () => {
    expect(limitLabels(["a", "b", "c"], "2")).toEqual({ shown: ["a", "b"], hidden: 1 });
    expect(limitLabels(["a", "b"], "all")).toEqual({ shown: ["a", "b"], hidden: 0 });
  });
});
