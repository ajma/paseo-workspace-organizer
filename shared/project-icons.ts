import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const projectIconSchema = z.object({ data: z.string(), mimeType: z.string() });
export type ProjectIcon = z.infer<typeof projectIconSchema>;

// Paseo does not expose project icons to plugins, so the daemon side resolves them the way Paseo does.
export const projectIcons = defineRpc({
  name: "project-icons.read",
  input: z.object({ projectIds: z.array(z.string().min(1)).max(200) }),
  output: z.object({ icons: z.record(z.string(), projectIconSchema.nullable()) }),
});
