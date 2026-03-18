import { z } from "zod";

export const mediaUpdateSchema = z.object({
  displayName: z.string().min(1).max(200),
  alias: z.preprocess(
    (v) => (v === "" ? null : v),
    z.string().regex(/^[a-z0-9-]+$/).max(100).nullable().optional(),
  ),
});
