import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { identityColorNames } from "./identity-colors";

// Paseo's label definitions (name and color); the plugin API does not list them, so the daemon side reads them.
export const labelColors = defineRpc({
  name: "label-colors.read",
  input: z.object({}),
  output: z.object({ labels: z.array(z.object({ name: z.string(), color: z.enum(identityColorNames) })) }),
});
