import { NextResponse } from "next/server";
import { withApi, readJson, getClientIp, getUserAgent } from "@/lib/api/handler";
import { resetPasswordSchema } from "@/lib/validation/auth";
import { resetPassword } from "@/lib/services/auth.service";
import { getRateLimiter } from "@/lib/rate-limit";

const limiter = getRateLimiter("redefinir-senha", { limit: 10, windowMs: 15 * 60_000 });

export const POST = withApi(async (req) => {
  const ip = getClientIp(req) ?? "desconhecido";
  await limiter.consume(ip);
  const body = resetPasswordSchema.parse(await readJson(req));
  await resetPassword(body.token, body.password, { ip, userAgent: getUserAgent(req) });
  return NextResponse.json({ ok: true });
});
