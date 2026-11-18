import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { extractIcoPngFrame, findProjectIcon, registerProjectIcons } from "../server/project-icons";

const png = (width: number, height = width) => {
  const buffer = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer);
  buffer.writeUInt32BE(width, 16); buffer.writeUInt32BE(height, 20);
  return buffer;
};
async function project(files: Record<string, Buffer | string>) {
  const root = await mkdtemp(join(tmpdir(), "organizer-icons-"));
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), content);
  }
  return root;
}
function serve(projects: object[], home = tmpdir()) {
  let handler: (input: { projectIds: string[] }, context: unknown) => Promise<{ icons: Record<string, unknown> }>;
  registerProjectIcons({ handle: (_contract: unknown, fn: typeof handler) => { handler = fn; } } as never, home);
  return (projectIds: string[]) => handler({ projectIds }, { paseo: { projects: { list: async () => ({ projects }) } } });
}

it("prefers priority directories, then monorepo packages, then the project root", async () => {
  const root = await project({ "logo.svg": "<svg/>", "apps/web/public/favicon.png": png(32), "public/icon.png": png(32) });
  expect(await findProjectIcon(root)).toBe(join(root, "public/icon.png"));
  const mono = await project({ "logo.svg": "<svg/>", "apps/web/public/favicon.png": png(32) });
  expect(await findProjectIcon(mono)).toBe(join(mono, "apps/web/public/favicon.png"));
  const plain = await project({ "logo.svg": "<svg/>", "node_modules/x/favicon.png": png(32) });
  expect(await findProjectIcon(plain)).toBe(join(plain, "logo.svg"));
});

it("returns square icons, skips non-square ones and serves PNG frames from ICO files", async () => {
  const square = await project({ "public/favicon.png": png(64) });
  const wide = await project({ "public/favicon.png": png(64, 32) });
  const ico = Buffer.alloc(6 + 16);
  ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4); ico[6] = 48;
  ico.writeUInt32LE(24, 6 + 8); ico.writeUInt32LE(22, 6 + 12);
  const icoFile = Buffer.concat([ico, png(48)]);
  expect(extractIcoPngFrame(icoFile)?.equals(png(48))).toBe(true);
  const favicon = await project({ "favicon.ico": icoFile });
  const read = serve([
    { projectId: "square", projectRootPath: square, projectIconRevision: "a" },
    { projectId: "wide", projectRootPath: wide, projectIconRevision: "b" },
    { projectId: "ico", projectRootPath: favicon, projectIconRevision: "c" },
  ]);
  const { icons } = await read(["square", "wide", "ico", "missing"]);
  expect(icons.square).toEqual({ data: png(64).toString("base64"), mimeType: "image/png" });
  expect(icons.wide).toBeNull();
  expect(icons.ico).toEqual({ data: png(48).toString("base64"), mimeType: "image/png" });
  expect(icons.missing).toBeNull();
});

it("uses Paseo's stored custom icon when the project has one", async () => {
  const home = await mkdtemp(join(tmpdir(), "organizer-home-"));
  const root = await project({ "public/favicon.png": png(32) });
  await mkdir(join(home, "projects", "icons"), { recursive: true });
  await writeFile(join(home, "projects", "icons", `${createHash("sha256").update("custom").digest("hex")}.bin`), png(128));
  const read = serve([{ projectId: "custom", projectRootPath: root, projectCustomIconRevision: "r1", projectIconRevision: "x" }], home);
  expect((await read(["custom"])).icons.custom).toEqual({ data: png(128).toString("base64"), mimeType: "image/png" });
});
