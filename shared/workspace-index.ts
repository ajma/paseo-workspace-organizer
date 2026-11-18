import { defineSubscription } from "@getpaseo/plugin";
import { z } from "zod";
import { githubLinkSchema, organizationSchema } from "./organization";
import { githubStatusSchema } from "./github-status";

export const indexEntrySchema = z.object({
  id: z.string(), name: z.string(), branch: z.string().nullable(),
  labels: z.array(z.string()), links: z.array(githubLinkSchema),
  // Git status is only known for workspaces on the installation's host.
  git: z.object({ dirty: z.boolean().nullable(), ahead: z.number().nullable(), behind: z.number().nullable() }).nullable().default(null),
  // The group picked for it on the New workspace screen, until the sidebar files it there.
  group: z.string().nullable().default(null),
});
export type IndexEntry = z.infer<typeof indexEntrySchema>;
export const indexEventSchema = z.object({
  hostId: z.string(), entries: z.array(indexEntrySchema),
  organization: organizationSchema.nullable(), error: z.string().nullable(),
  github: z.record(z.string(), githubStatusSchema).default({}),
});
export type IndexEvent = z.infer<typeof indexEventSchema>;
export const workspaceIndex = defineSubscription({ name: "organization.watch", input: z.object({}), event: indexEventSchema });
