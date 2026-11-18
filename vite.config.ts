import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  root: "preview",
  resolve: { alias: [
    { find: /^react-native$/, replacement: "react-native-web" },
    { find: /^@getpaseo\/plugin\/client\/ui$/, replacement: fileURLToPath(new URL("./preview/ui.tsx", import.meta.url)) },
    { find: /^@getpaseo\/plugin\/client$/, replacement: fileURLToPath(new URL("./preview/host.tsx", import.meta.url)) },
  ] },
  test: { root: ".", include: ["tests/**/*.test.{ts,tsx}"], environment: "jsdom", setupFiles: ["./tests/setup.ts"] },
});
