import { describe, expect, it } from "vitest";

describe("tournament API query contract", () => {
  it("keeps empty filters out of the query string", () => {
    const params = new URLSearchParams();
    const filters = { page: 1, search: "", game: undefined };
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") params.set(key, String(value));
    });
    expect(params.toString()).toBe("page=1");
  });
});
