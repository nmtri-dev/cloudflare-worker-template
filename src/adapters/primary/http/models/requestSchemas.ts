import { z } from "zod";

export const createWidgetSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(255)
    .regex(/[a-zA-Z0-9]/, "name must contain at least one letter or digit"),
  description: z.string().max(1000).optional().nullable(),
});

export const updateWidgetSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(255)
    .regex(/[a-zA-Z0-9]/, "name must contain at least one letter or digit")
    .optional(),
  description: z.string().max(1000).optional().nullable(),
});
