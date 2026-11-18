import type { PluginServerContext } from "@getpaseo/plugin/server";
import { registerLabelColors } from "./server/label-colors";
import { registerProjectIcons } from "./server/project-icons";
import { registerIndex } from "./server/workspace-index";
import { cards } from "./shared/cards";

export default function contribute(server: PluginServerContext) {
  const disposeIndex = registerIndex(server);
  const disposeIcons = registerProjectIcons(server);
  registerLabelColors(server);
  // Host-scoped settings are stored by the daemon, so each one must be registered here.
  server.registerSettings(cards);
  return () => { disposeIcons(); return disposeIndex(); };
}
