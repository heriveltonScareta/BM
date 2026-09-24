import { RateLimitError } from "@/lib/errors";

/**
 * Rate limit em memoria (token bucket simples por chave). Suficiente para uma instancia;
 * a interface permite trocar por Redis sem alterar os chamadores.
 */
export interface RateLimiter {
  /** Conta uma ocorrencia; lanca RateLimitError acima do limite. */
  consume(key: string): Promise<void>;
  /** So verifica (sem contar): lanca RateLimitError se o limite ja foi atingido. */
  check(key: string): Promise<void>;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export function createMemoryRateLimiter(options: { limit: number; windowMs: number }): RateLimiter {
  const buckets = new Map<string, Bucket>();
  return {
    async consume(key: string) {
      const now = Date.now();
      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + options.windowMs });
        if (buckets.size > 10_000) {
          for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
        }
        return;
      }
      bucket.count += 1;
      if (bucket.count > options.limit) throw new RateLimitError();
    },
    async check(key: string) {
      const bucket = buckets.get(key);
      if (bucket && bucket.resetAt > Date.now() && bucket.count >= options.limit)
        throw new RateLimitError();
    },
  };
}

const globalLimiters = globalThis as unknown as { __bmLimiters?: Map<string, RateLimiter> };
globalLimiters.__bmLimiters ??= new Map();

/** Obtem (ou cria) um limitador nomeado, estavel entre hot reloads. */
export function getRateLimiter(
  name: string,
  options: { limit: number; windowMs: number },
): RateLimiter {
  const existing = globalLimiters.__bmLimiters!.get(name);
  if (existing) return existing;
  const limiter = createMemoryRateLimiter(options);
  globalLimiters.__bmLimiters!.set(name, limiter);
  return limiter;
}
