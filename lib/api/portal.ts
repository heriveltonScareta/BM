import { getClientIp } from "@/lib/api/handler";
import { getRateLimiter } from "@/lib/rate-limit";
import { tokenSchema } from "@/lib/validation/approval";
import { hashToken } from "@/lib/services/auth.service";

const byIp = getRateLimiter("portal:ip", { limit: 30, windowMs: 60_000 });
const byToken = getRateLimiter("portal:token", { limit: 10, windowMs: 60_000 });

/** Rate limit por IP e por token (Secao 12) e validacao do formato do token. */
export async function portalGuard(req: Request, rawToken: string): Promise<string> {
  await byIp.consume(getClientIp(req) ?? "desconhecido");
  const token = tokenSchema.parse(rawToken);
  await byToken.consume(hashToken(token));
  return token;
}
