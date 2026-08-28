import { z } from "zod";

export const tournamentSearchSchema = z.object({ search: z.string().trim().max(80) });
export const tournamentSlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
