import { NextResponse } from "next/server";
import { ZodError, type z } from "zod";
import { AppError } from "@/lib/errors";
import { Prisma } from "@/lib/db/generated/client";
import type { SessionUser } from "@/lib/auth/rbac";
import { actorFromUser, type AuditActor } from "@/lib/services/audit.service";

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

/** Converte ZodError em lista { campo, mensagem } para exibir na UI. */
export function zodIssues(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

export function errorResponse(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Dados inválidos.",
          details: zodIssues(error),
        },
      },
      { status: 422 },
    );
  }
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002: violacao de unicidade em operacao concorrente (ex.: duas assinaturas ou duas versoes)
    if (error.code === "P2002")
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "Esta operação já foi realizada por outra requisição. Recarregue a página.",
          },
        },
        { status: 409 },
      );
    // P2020: valor fora do intervalo da coluna (ex.: numero maior que o permitido)
    if (error.code === "P2020")
      return NextResponse.json(
        {
          error: { code: "VALIDATION_ERROR", message: "Valor numérico fora do limite permitido." },
        },
        { status: 422 },
      );
  }
  console.error("[api] erro não tratado:", error);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Erro interno. Tente novamente." } },
    { status: 500 },
  );
}

type RouteContext = { params: Promise<Record<string, string>> };
type Handler = (req: Request, ctx: RouteContext) => Promise<Response>;

/**
 * Envolve um route handler: erros de aplicacao e de validacao viram respostas JSON
 * padronizadas; qualquer outro erro vira 500 sem vazar detalhes.
 */
export function withApi(handler: Handler): Handler {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/** IP do cliente considerando proxies confiaveis. */
export function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip");
}

export function getUserAgent(req: Request): string | null {
  return req.headers.get("user-agent");
}

export async function readJson<T = unknown>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new AppError("Corpo da requisição inválido (JSON esperado).", 400, "BAD_JSON");
  }
}

/** Ator de auditoria a partir da sessao + request (IP e user-agent). */
export function actorFromRequest(user: SessionUser, req: Request): AuditActor {
  return actorFromUser(user, { ip: getClientIp(req), userAgent: getUserAgent(req) });
}

/** Le e valida os query params com um schema Zod. */
export function parseQuery<T extends z.ZodTypeAny>(req: Request, schema: T): z.output<T> {
  const url = new URL(req.url);
  return schema.parse(Object.fromEntries(url.searchParams.entries()));
}

/** Corpo JSON opcional (requisicoes sem corpo retornam {}). */
export async function readJsonOptional<T = Record<string, unknown>>(req: Request): Promise<T> {
  const text = await req.text();
  if (!text.trim()) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AppError("Corpo da requisição inválido (JSON esperado).", 400, "BAD_JSON");
  }
}

/** Corpo de resposta binario sem copiar o Buffer (view sobre a mesma memoria). */
export function bufferBody(data: Buffer | Uint8Array): BodyInit {
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength) as Uint8Array<ArrayBuffer>;
}
