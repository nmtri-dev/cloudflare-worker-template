import { z } from "zod";

export const grantMonthlySchema = z.object({
  userId: z.uuid(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

export const grantPermanentSchema = z.object({
  userId: z.uuid(),
  credits: z.number().int().positive(),
});

export const recallMonthlySchema = z.object({
  userId: z.uuid(),
  creditAccountId: z.uuid(),
});

export const recallPermanentSchema = z.object({
  userId: z.uuid(),
});

export const recallPermanentPartialSchema = z.object({
  userId: z.uuid(),
  credits: z.number().int().positive(),
});

export const resetMonthlyByUserSchema = z.object({
  userId: z.uuid(),
});

export const resetMonthlyForAllUsersSchema = z.object({});
