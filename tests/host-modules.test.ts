// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, it } from "vitest";

// An installed plugin has no node_modules: Paseo provides only these packages, even for type-only imports, and a
// plugin that imports anything else fails to build once installed from npm.
const HOST_MODULES = [/^react$/, /^react-native$/, /^zod$/, /^@tanstack\/react-query$/, /^@getpaseo\/plugin(\/.*)?$/];
const root = join(__dirname, "..");

function sources(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

it("imports only packages Paseo provides to plugins, plus Node's built-ins on the daemon", () => {
  const files = [...sources(join(root, "client")), ...sources(join(root, "server")), ...sources(join(root, "shared")),
    join(root, "index.client.tsx"), join(root, "index.server.ts")];
  const offenders = files.flatMap((file) => {
    const daemon = relative(root, file).startsWith("server") || file.endsWith("index.server.ts");
    // Import and export statements (possibly over several lines), bare imports and dynamic import() calls.
    const pattern = /^\s*(?:import|export)\b[^;"]*?\sfrom\s*"([^"]+)"|^\s*import\s*"([^"]+)"|\bimport\(\s*"([^"]+)"\s*\)/gm;
    const specifiers = [...readFileSync(file, "utf8").matchAll(pattern)].map((match) => match[1] ?? match[2] ?? match[3]);
    return specifiers.filter((specifier) => !specifier.startsWith(".") && !(daemon && specifier.startsWith("node:"))
      && !HOST_MODULES.some((pattern) => pattern.test(specifier))).map((specifier) => `${relative(root, file)}: ${specifier}`);
  });
  expect(offenders).toEqual([]);
});
