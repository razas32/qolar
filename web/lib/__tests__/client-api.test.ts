import { afterEach, describe, expect, it, vi } from "vitest";
import { bulkSetCategory } from "@/lib/client-api";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("bulkSetCategory", () => {
  it("posts a single request when under the chunk size", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ updated: 3 }) });
    vi.stubGlobal("fetch", fetchMock);

    const ids = ["a", "b", "c"];
    const result = await bulkSetCategory(ids, "Coffee");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ updated: 3 });
  });

  it("splits more than 500 ids into sequential chunks of 500", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      return { ok: true, json: async () => ({ updated: body.transaction_ids.length }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const ids = Array.from({ length: 1200 }, (_, i) => `id-${i}`);
    const result = await bulkSetCategory(ids, "Coffee");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const sizes = fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string).transaction_ids.length);
    expect(sizes).toEqual([500, 500, 200]);
    expect(result).toEqual({ updated: 1200 });
  });
});
