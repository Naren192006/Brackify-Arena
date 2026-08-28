import { z } from "zod";

export const profileSchema = z.object({
  display_name: z.string().trim().min(2).max(60),
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/, "Use letters, numbers, and underscores only."),
  riot_id: z.string().trim().max(40).refine((value) => value === "" || /^[^#\s]{2,16}#[^#\s]{2,8}$/.test(value), "Use Riot ID format Name#TAG."),
  region: z.string().trim().max(32),
  bio: z.string().trim().max(240),
});

export const teamSchema = z.object({ name: z.string().trim().min(2).max(40) });

export const invitationSchema = z.object({
  target: z.string().trim().min(3).max(120),
});
