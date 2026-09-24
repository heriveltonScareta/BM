import { describe, expect, it } from "vitest";
import { createMemoryRateLimiter } from "@/lib/rate-limit";
import { RateLimitError } from "@/lib/errors";

describe("rate limit em memória", () => {
  it("check não conta; consume conta e bloqueia acima do limite", async () => {
    const l = createMemoryRateLimiter({ limit: 2, windowMs: 60_000 });
    await l.check("k");
    await l.check("k");
    await l.consume("k");
    await l.consume("k");
    await expect(l.check("k")).rejects.toBeInstanceOf(RateLimitError);
    await expect(l.consume("k")).rejects.toBeInstanceOf(RateLimitError);
    await l.check("outra"); // chaves independentes
  });
});
