import { z } from "zod";

const slugPattern = /^[a-z0-9-]+$/;

export const contentUpdateSchema = z.object({
  content: z.string().max(100_000),
});

export const contentMetaSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(slugPattern, "Nur Kleinbuchstaben, Zahlen und Bindestriche erlaubt")
    .optional(),
  status: z.enum(["draft", "published", "hidden"]).optional(),
  showTitle: z.boolean().optional(),
});

export const contentCreateSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(slugPattern, "Nur Kleinbuchstaben, Zahlen und Bindestriche erlaubt"),
  title: z.string().min(1).max(200),
  status: z.enum(["draft", "published", "hidden"]).optional(),
});
