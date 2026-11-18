// Mirrors Paseo 0.16's project icon resolution (custom icon, then automatic discovery in the project folder),
// which the plugin API does not expose. Keep in step with Paseo's server/utils/project-icon.js.
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join } from "node:path";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { projectIcons, type ProjectIcon } from "../shared/project-icons";

const ICON_PATTERNS = [
  "favicon.svg", "favicon.png", "favicon-*.svg", "favicon-*.png", "favico.svg", "favico.png", "icon.svg", "icon.png",
  "app-icon.svg", "app-icon.png", "apple-touch-icon.png", "apple-touch-icon-*.png", "icon-*.png", "android-chrome-*.png",
  "safari-pinned-tab.svg", "mstile-*.png", "logo.svg", "logo.png", "favicon.ico", "favico.ico",
];
const PRIORITY_DIRS = ["public", "static", "priv/static", "assets", "images", "img"];
const MONOREPO_PACKAGE_DIRS = ["packages", "apps"];
const IGNORED_DIRS = new Set([".git", "node_modules", "dist", "build", ".next", ".nuxt", ".output", "coverage", ".cache",
  "vendor", "src", "lib", "test", "tests", "__tests__"]);
const MAX_AUTOMATIC_BYTES = 32 * 1024;
const MAX_CUSTOM_BYTES = 512 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const isFile = (path: string) => stat(path).then((stats) => stats.isFile(), () => false);
const isDirectory = (path: string) => stat(path).then((stats) => stats.isDirectory(), () => false);
const list = (dir: string) => readdir(dir).catch(() => null);
const first = <T>(values: (T | null)[]) => values.find((value) => value !== null) ?? null;
const matches = (name: string, pattern: string) => pattern.includes("*")
  ? new RegExp(`^${pattern.replace(/\./g, "\\.").replace(/\*/g, ".*")}$`).test(name) : name === pattern;

async function findIconInDir(dir: string): Promise<string | null> {
  const entries = await list(dir);
  if (!entries) return null;
  const candidates = ICON_PATTERNS.flatMap((pattern) => entries.filter((entry) => matches(entry, pattern)).map((entry) => join(dir, entry)));
  const exists = await Promise.all(candidates.map(isFile));
  return candidates[exists.indexOf(true)] ?? null;
}

async function searchRecursively(dir: string, maxDepth: number, depth = 0): Promise<string | null> {
  if (depth > maxDepth) return null;
  const found = await findIconInDir(dir);
  if (found) return found;
  const entries = (await list(dir)) ?? [];
  const paths = entries.filter((entry) => !IGNORED_DIRS.has(entry)).map((entry) => join(dir, entry));
  const dirs = await Promise.all(paths.map(isDirectory));
  return first(await Promise.all(paths.map((path, index) => dirs[index] ? searchRecursively(path, maxDepth, depth + 1) : null)));
}

async function searchPriorityDirs(base: string, maxDepth: number): Promise<string | null> {
  const paths = PRIORITY_DIRS.map((dir) => join(base, dir));
  const dirs = await Promise.all(paths.map(isDirectory));
  return first(await Promise.all(paths.map((path, index) => dirs[index] ? searchRecursively(path, maxDepth) : null)));
}

async function searchOtherDirs(dir: string, depth = 0): Promise<string | null> {
  if (depth > 2) return null;
  const found = await findIconInDir(dir);
  if (found || depth === 0) return found;
  const entries = (await list(dir)) ?? [];
  const paths = entries.filter((entry) => !IGNORED_DIRS.has(entry) && !PRIORITY_DIRS.includes(entry)).map((entry) => join(dir, entry));
  const dirs = await Promise.all(paths.map(isDirectory));
  return first(await Promise.all(paths.map((path, index) => dirs[index] ? searchOtherDirs(path, depth + 1) : null)));
}

export async function findProjectIcon(projectDir: string, maxDepth = 3): Promise<string | null> {
  const priority = await searchPriorityDirs(projectDir, maxDepth - 1);
  if (priority) return priority;
  const monorepo = first(await Promise.all(MONOREPO_PACKAGE_DIRS.map(async (monoDir) => {
    const base = join(projectDir, monoDir);
    const packages = (await list(base)) ?? [];
    const paths = packages.map((name) => join(base, name));
    const dirs = await Promise.all(paths.map(isDirectory));
    return first(await Promise.all(paths.map(async (path, index) => dirs[index]
      ? (await searchPriorityDirs(path, maxDepth - 1)) ?? (await findIconInDir(path)) : null)));
  })));
  return monorepo ?? searchOtherDirs(projectDir);
}

function sniffMimeType(buffer: Buffer): string | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 6 && buffer.toString("ascii", 0, 3) === "GIF") return "image/gif";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buffer.length >= 6 && buffer.readUInt16LE(0) === 0 && buffer.readUInt16LE(2) === 1 && buffer.readUInt16LE(4) > 0) return "image/x-icon";
  return null;
}

const MIME_BY_EXTENSION: Record<string, string> = { ".ico": "image/x-icon", ".png": "image/png", ".svg": "image/svg+xml",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" };

// Native clients cannot decode ICO containers, so serve the largest embedded PNG frame instead.
export function extractIcoPngFrame(buffer: Buffer): Buffer | null {
  if (buffer.length < 6 || buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) return null;
  let best: Buffer | null = null, bestWidth = -1;
  for (let index = 0; index < buffer.readUInt16LE(4); index += 1) {
    const entry = 6 + index * 16;
    if (entry + 16 > buffer.length) break;
    const width = buffer[entry] === 0 ? 256 : buffer[entry];
    const size = buffer.readUInt32LE(entry + 8), offset = buffer.readUInt32LE(entry + 12);
    if (offset + size > buffer.length) continue;
    const frame = buffer.subarray(offset, offset + size);
    if (frame.length >= 8 && frame.subarray(0, 8).equals(PNG_SIGNATURE) && width > bestWidth) { best = frame; bestWidth = width; }
  }
  return best;
}

function dimensions(buffer: Buffer, mimeType: string): { width: number; height: number } | null {
  if (mimeType === "image/png") return buffer.length >= 24 && buffer.subarray(0, 4).equals(PNG_SIGNATURE.subarray(0, 4))
    ? { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) } : null;
  if (mimeType === "image/gif") return buffer.length >= 10 ? { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) } : null;
  if (mimeType === "image/jpeg") {
    for (let offset = 2; offset < buffer.length - 8;) {
      if (buffer[offset] !== 0xff) { offset++; continue; }
      const marker = buffer[offset + 1];
      if (marker >= 0xc0 && marker <= 0xc2) return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      offset += 2 + buffer.readUInt16BE(offset + 2);
    }
    return null;
  }
  if (mimeType === "image/webp") {
    if (buffer.length < 30) return null;
    const chunk = buffer.toString("ascii", 12, 16);
    if (chunk === "VP8 ") return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    if (chunk === "VP8L") { const bits = buffer.readUInt32LE(21); return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }; }
    return null;
  }
  // Paseo trusts ICO and SVG icons to be square.
  return mimeType === "image/x-icon" || mimeType === "image/svg+xml" ? { width: 1, height: 1 } : null;
}

async function readAutomaticIcon(projectDir: string): Promise<ProjectIcon | null> {
  const path = await findProjectIcon(projectDir);
  if (!path) return null;
  try {
    if ((await stat(path)).size > MAX_AUTOMATIC_BYTES) return null;
    let buffer: Buffer = await readFile(path);
    let mimeType = sniffMimeType(buffer) ?? MIME_BY_EXTENSION[extname(path).toLowerCase()] ?? "application/octet-stream";
    if (mimeType === "image/x-icon") {
      const frame = extractIcoPngFrame(buffer);
      if (frame) { buffer = frame; mimeType = "image/png"; }
    }
    const size = dimensions(buffer, mimeType);
    return size && size.width === size.height ? { data: buffer.toString("base64"), mimeType } : null;
  } catch { return null; }
}

async function readCustomIcon(paseoHome: string, projectId: string): Promise<ProjectIcon | null> {
  try {
    const key = createHash("sha256").update(projectId).digest("hex");
    const buffer = await readFile(join(paseoHome, "projects", "icons", `${key}.bin`));
    if (!buffer.length || buffer.length > MAX_CUSTOM_BYTES) return null;
    const mimeType = sniffMimeType(buffer) ?? (buffer.toString("utf8", 0, 512).includes("<svg") ? "image/svg+xml" : null);
    const size = mimeType ? dimensions(buffer, mimeType) : null;
    return mimeType && size && size.width > 0 && size.width === size.height && size.width <= 1024
      ? { data: buffer.toString("base64"), mimeType } : null;
  } catch { return null; }
}

export function registerProjectIcons(server: PluginServerContext, paseoHome = process.env.PASEO_HOME ?? join(homedir(), ".paseo")) {
  // Keyed by project and Paseo's icon revision, so a changed icon is read again.
  const cache = new Map<string, Promise<ProjectIcon | null>>();
  server.handle(projectIcons, async ({ projectIds }, { paseo }) => {
    const { projects } = await paseo.projects.list();
    const icons: Record<string, ProjectIcon | null> = {};
    await Promise.all(projectIds.map(async (projectId) => {
      const project = projects.find((item) => item.projectId === projectId);
      if (!project) { icons[projectId] = null; return; }
      const key = JSON.stringify([projectId, project.projectIconRevision ?? null, project.projectCustomIconRevision ?? null, project.projectRootPath]);
      if (!cache.has(key)) cache.set(key, project.projectCustomIconRevision
        ? readCustomIcon(paseoHome, projectId) : readAutomaticIcon(project.projectRootPath));
      icons[projectId] = await cache.get(key)!;
    }));
    return { icons };
  });
  return () => cache.clear();
}
