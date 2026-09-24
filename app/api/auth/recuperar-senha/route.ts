import { NextResponse } from "next/server";
import { withApi, readJson, getClientIp, getUserAgent } from "@/lib/api/handler";
import { requestPasswordResetSchema } from "@/lib/validation/auth";
import { requestPasswordReset } from "@/lib/services/auth.service";
import { getRateLimiter } from "@/lib/rate-limit";

const limiter = getRateLimiter("recuperar-senha", { limit: 5, windowMs: 15 * 60_000 });
// tambem por e-mail alvo: o cabecalho de IP pode ser forjado sem proxy confiavel
const byEmail = getRateLimiter("recuperar-senha:email", { limit: 3, windowMs: 15 * 60_000 });

export const POST = withApi(async (req) => {
  const ip = getClientIp(req) ?? "desconhecido";
  await limiter.consume(ip);
  const body = requestPasswordResetSchema.parse(await readJson(req));
  await byEmail.consume(body.email.trim().toLowerCase());
  await requestPasswordReset(body.email, { ip, userAgent: getUserAgent(req) });
  return NextResponse.json({ ok: true });
});
