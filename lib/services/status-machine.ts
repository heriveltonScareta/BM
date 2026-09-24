import { MeasurementStatus, Role } from "@/lib/db/generated/enums";
import { TransitionError } from "@/lib/errors";

/**
 * Maquina de estados da medicao (Secao 5 do briefing). REGRA INEGOCIAVEL.
 * Qualquer transicao fora desta tabela lanca TransitionError e e rejeitada pela API.
 *
 * Atores:
 *  - papeis de usuario logado (ADMIN, OPERACIONAL, FINANCEIRO)
 *  - CLIENTE: o cliente agindo pelo portal com token (nunca via sessao)
 *  - SISTEMA: acoes automaticas (ex.: cliente abriu o link)
 */
export type Actor = Role | "SISTEMA";

export interface Transition {
  to: MeasurementStatus;
  actors: readonly Actor[];
  /** Pre-condicoes verificadas pelo service antes de aplicar a transicao. */
  guards?: readonly TransitionGuard[];
}

export type TransitionGuard =
  "TEM_ITENS" | "TEM_APROVADOR" | "TEM_ASSINATURA" | "TEM_NF_COMPLETA" | "EXIGE_MOTIVO";

const S = MeasurementStatus;

export const TRANSITIONS: Readonly<Record<MeasurementStatus, readonly Transition[]>> = {
  [S.RASCUNHO]: [
    { to: S.EM_ELABORACAO, actors: ["ADMIN", "OPERACIONAL"] },
    { to: S.CANCELADO, actors: ["ADMIN"], guards: ["EXIGE_MOTIVO"] },
  ],
  [S.EM_ELABORACAO]: [
    { to: S.AGUARDANDO_ENVIO, actors: ["ADMIN", "OPERACIONAL"], guards: ["TEM_ITENS"] },
    { to: S.CANCELADO, actors: ["ADMIN"], guards: ["EXIGE_MOTIVO"] },
  ],
  [S.AGUARDANDO_ENVIO]: [
    {
      to: S.ENVIADO_AO_CLIENTE,
      actors: ["ADMIN"],
      guards: ["TEM_ITENS", "TEM_APROVADOR"],
    },
    { to: S.EM_ELABORACAO, actors: ["ADMIN"] },
    { to: S.CANCELADO, actors: ["ADMIN"], guards: ["EXIGE_MOTIVO"] },
  ],
  [S.ENVIADO_AO_CLIENTE]: [
    { to: S.EM_APROVACAO, actors: ["SISTEMA"] },
    { to: S.APROVADO, actors: ["CLIENTE"] },
    { to: S.CORRECAO_SOLICITADA, actors: ["CLIENTE"], guards: ["EXIGE_MOTIVO"] },
  ],
  [S.EM_APROVACAO]: [
    { to: S.APROVADO, actors: ["CLIENTE"] },
    { to: S.CORRECAO_SOLICITADA, actors: ["CLIENTE"], guards: ["EXIGE_MOTIVO"] },
  ],
  [S.CORRECAO_SOLICITADA]: [{ to: S.EM_ELABORACAO, actors: ["ADMIN", "OPERACIONAL"] }],
  [S.APROVADO]: [{ to: S.ASSINADO, actors: ["CLIENTE"] }],
  [S.ASSINADO]: [
    {
      to: S.LIBERADO_FATURAMENTO,
      actors: ["ADMIN", "FINANCEIRO"],
      guards: ["TEM_ASSINATURA"],
    },
  ],
  [S.LIBERADO_FATURAMENTO]: [
    { to: S.NF_ANEXADA, actors: ["ADMIN", "FINANCEIRO"], guards: ["TEM_NF_COMPLETA"] },
  ],
  [S.NF_ANEXADA]: [
    { to: S.FATURADO, actors: ["ADMIN", "FINANCEIRO"], guards: ["TEM_NF_COMPLETA"] },
  ],
  // Terminal: so muda via estorno explicito (Admin), que cria nova versao em EM_ELABORACAO.
  [S.FATURADO]: [{ to: S.EM_ELABORACAO, actors: ["ADMIN"], guards: ["EXIGE_MOTIVO"] }],
  [S.CANCELADO]: [],
};

/** Status em que mao de obra/equipamentos e cabecalho podem ser editados. */
export const EDITABLE_STATUSES: readonly MeasurementStatus[] = [
  S.RASCUNHO,
  S.EM_ELABORACAO,
  S.AGUARDANDO_ENVIO,
];

/** Status a partir dos quais o Financeiro enxerga a medicao ("aprovadas em diante"). */
export const FINANCEIRO_VISIBLE_STATUSES: readonly MeasurementStatus[] = [
  S.APROVADO,
  S.ASSINADO,
  S.LIBERADO_FATURAMENTO,
  S.NF_ANEXADA,
  S.FATURADO,
];

/** Status a partir dos quais o cliente (logado) enxerga a medicao. */
export const CLIENT_VISIBLE_STATUSES: readonly MeasurementStatus[] = [
  S.ENVIADO_AO_CLIENTE,
  S.EM_APROVACAO,
  S.APROVADO,
  S.CORRECAO_SOLICITADA,
  S.ASSINADO,
  S.LIBERADO_FATURAMENTO,
  S.NF_ANEXADA,
  S.FATURADO,
];

/**
 * Transicoes que reabrem a edicao para uma revisao (correcao solicitada ou estorno).
 * A nova versao em si so e congelada no proximo envio ao cliente.
 */
export function reopensForRevision(from: MeasurementStatus, to: MeasurementStatus): boolean {
  return (from === S.CORRECAO_SOLICITADA || from === S.FATURADO) && to === S.EM_ELABORACAO;
}

export function isEditable(status: MeasurementStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}

export function isTerminal(status: MeasurementStatus): boolean {
  return status === S.CANCELADO;
}

export function findTransition(
  from: MeasurementStatus,
  to: MeasurementStatus,
): Transition | undefined {
  return TRANSITIONS[from].find((t) => t.to === to);
}

export function canTransition(
  from: MeasurementStatus,
  to: MeasurementStatus,
  actor: Actor,
): boolean {
  const t = findTransition(from, to);
  return !!t && t.actors.includes(actor);
}

/** Lista os destinos permitidos para um ator a partir de um status. */
export function allowedTransitions(from: MeasurementStatus, actor: Actor): MeasurementStatus[] {
  return TRANSITIONS[from].filter((t) => t.actors.includes(actor)).map((t) => t.to);
}

/**
 * Garante que a transicao existe e que o ator pode executa-la.
 * Retorna a transicao (com guards) para o service verificar as pre-condicoes.
 */
export function assertTransition(
  from: MeasurementStatus,
  to: MeasurementStatus,
  actor: Actor,
): Transition {
  const t = findTransition(from, to);
  if (!t) {
    throw new TransitionError(
      `Transição de ${STATUS_LABELS[from]} para ${STATUS_LABELS[to]} não é permitida.`,
      { from, to, actor },
    );
  }
  if (!t.actors.includes(actor)) {
    throw new TransitionError(
      `Seu perfil não pode alterar a medição de ${STATUS_LABELS[from]} para ${STATUS_LABELS[to]}.`,
      { from, to, actor },
    );
  }
  return t;
}

export const STATUS_LABELS: Readonly<Record<MeasurementStatus, string>> = {
  RASCUNHO: "Rascunho",
  EM_ELABORACAO: "Em elaboração",
  AGUARDANDO_ENVIO: "Aguardando envio",
  ENVIADO_AO_CLIENTE: "Enviado ao cliente",
  EM_APROVACAO: "Em aprovação",
  APROVADO: "Aprovado",
  CORRECAO_SOLICITADA: "Correção solicitada",
  ASSINADO: "Assinado",
  LIBERADO_FATURAMENTO: "Liberado p/ faturamento",
  NF_ANEXADA: "NF anexada",
  FATURADO: "Faturado",
  CANCELADO: "Cancelado",
};

/** Cor semantica por status: cinza, ambar, azul, verde, vermelho. */
export type StatusTone = "gray" | "amber" | "blue" | "green" | "red";

export const STATUS_TONES: Readonly<Record<MeasurementStatus, StatusTone>> = {
  RASCUNHO: "gray",
  EM_ELABORACAO: "gray",
  AGUARDANDO_ENVIO: "amber",
  ENVIADO_AO_CLIENTE: "blue",
  EM_APROVACAO: "blue",
  APROVADO: "green",
  CORRECAO_SOLICITADA: "amber",
  ASSINADO: "green",
  LIBERADO_FATURAMENTO: "blue",
  NF_ANEXADA: "blue",
  FATURADO: "green",
  CANCELADO: "red",
};

export const ALL_STATUSES: readonly MeasurementStatus[] = Object.values(S);
