export const queryKeys = {
  auth: {
    me: ["auth", "me"] as const,
  },
  tournaments: {
    list: (filters?: Record<string, string>) => ["tournaments", "list", filters] as const,
    detail: (slug: string) => ["tournaments", "detail", slug] as const,
  },
};
