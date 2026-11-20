import { watch } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

// Paseo only announces settings changes it saves itself, so a tool that writes the file directly (like a script
// adding links) would stay unseen until a reload. Paseo keeps each plugin's settings in plugin-settings/<plugin id>/
// and doesn't tell the plugin its id, so this watches the whole folder for the document's file and leaves telling
// real changes apart to the caller (by revision). Unwatchable folders are skipped quietly.
export type SettingsWatcher = (document: string, onChange: () => void) => () => void;
export const watchSettingsFile: SettingsWatcher = (document, onChange) => {
  const folder = join(process.env.PASEO_HOME ?? join(homedir(), ".paseo"), "plugin-settings");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const watcher = watch(folder, { recursive: true }, (_event, filename) => {
      if (!filename || basename(String(filename)) !== `${document}.json`) return;
      clearTimeout(timer);
      timer = setTimeout(onChange, 200);
    });
    watcher.on("error", () => {});
    return () => { clearTimeout(timer); watcher.close(); };
  } catch { return () => {}; }
};
