import type { Metadata } from "next";
import { headers } from "next/headers";
import { Link2Off, TimerOff } from "lucide-react";
import { openPortal, type PortalView } from "@/lib/services/approval.service";
import { AppError, NotFoundError } from "@/lib/errors";
import { tokenSchema } from "@/lib/validation/approval";
import { getRateLimiter } from "@/lib/rate-limit";
import { hashToken } from "@/lib/services/auth.service";
import { PortalBoletim, type PortalViewDto } from "@/components/portal/portal-boletim";

export const metadata: Metadata = { title: "Aprovação de medição" };

const byIp = getRateLimiter("portal:page:ip", { limit: 30, windowMs: 60_000 });
const byToken = getRateLimiter("portal:page:token", { limit: 10, windowMs: 60_000 });

function serialize(v: PortalView): PortalViewDto {
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  return {
    ...v,
    request: {
      ...v.request,
      sentAt: v.request.sentAt.toISOString(),
      expiresAt: v.request.expiresAt.toISOString(),
      openedAt: iso(v.request.openedAt),
      decidedAt: iso(v.request.decidedAt),
    },
    signature: v.signature
      ? { ...v.signature, signedAt: v.signature.signedAt.toISOString() }
      : null,
  };
}

function Aviso({
  icon: Icon,
  titulo,
  descricao,
}: {
  icon: typeof Link2Off;
  titulo: string;
  descricao: string;
}) {
  return (
    <div className="mx-auto max-w-lg rounded-lg border bg-background p-8 text-center">
      <Icon className="mx-auto mb-3 size-8 text-muted-foreground" aria-hidden />
      <h1 className="text-lg font-semibold">{titulo}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{descricao}</p>
    </div>
  );
}

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const parsed = tokenSchema.safeParse(raw);
  if (!parsed.success) {
    return (
      <Aviso
        icon={Link2Off}
        titulo="Link inválido"
        descricao="Este endereço não corresponde a nenhuma solicitação de aprovação. Confira o link recebido por e-mail."
      />
    );
  }
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
  const userAgent = h.get("user-agent");
  // carrega fora do JSX: erros conhecidos viram avisos, o resto sobe para o error boundary
  let view: PortalView | null = null;
  let aviso: { titulo: string; descricao: string; icon: typeof Link2Off } | null = null;
  try {
    await byIp.consume(ip ?? "desconhecido");
    await byToken.consume(hashToken(parsed.data));
    view = await openPortal(parsed.data, { ip, userAgent });
  } catch (e) {
    if (e instanceof NotFoundError) {
      aviso = {
        icon: Link2Off,
        titulo: "Link inválido",
        descricao:
          "Este endereço não corresponde a nenhuma solicitação de aprovação. Confira o link recebido por e-mail.",
      };
    } else if (e instanceof AppError && e.code === "TOKEN_EXPIRED") {
      aviso = {
        icon: TimerOff,
        titulo: "Link expirado",
        descricao:
          "Os links de aprovação valem por 7 dias. Peça à prestadora que reenvie o boletim.",
      };
    } else if (e instanceof AppError && e.code === "RATE_LIMITED") {
      aviso = {
        icon: TimerOff,
        titulo: "Muitas tentativas",
        descricao: "Aguarde alguns instantes e tente novamente.",
      };
    } else {
      throw e;
    }
  }
  if (aviso || !view) {
    const a = aviso ?? {
      icon: Link2Off,
      titulo: "Link inválido",
      descricao: "Este endereço não corresponde a nenhuma solicitação de aprovação.",
    };
    return <Aviso icon={a.icon} titulo={a.titulo} descricao={a.descricao} />;
  }
  return <PortalBoletim token={parsed.data} view={serialize(view)} />;
}
