// Reads Paseo 0.16's label definitions from <paseo home>/projects/workspace-labels.json.
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { isIdentityColor } from "../shared/identity-colors";
import { labelColors } from "../shared/label-colors";

export async function readLabelColors(paseoHome: string) {
  try {
    const stored: unknown = JSON.parse(await readFile(join(paseoHome, "projects", "workspace-labels.json"), "utf8"));
    if (!Array.isArray(stored)) return [];
    return stored.flatMap((item: unknown) => {
      const label = item as { name?: unknown; color?: unknown };
      return typeof label?.name === "string" && isIdentityColor(label.color) ? [{ name: label.name, color: label.color }] : [];
    });
  } catch { return []; }
}

export function registerLabelColors(server: PluginServerContext, paseoHome = process.env.PASEO_HOME ?? join(homedir(), ".paseo")) {
  server.handle(labelColors, async () => ({ labels: await readLabelColors(paseoHome) }));
}
