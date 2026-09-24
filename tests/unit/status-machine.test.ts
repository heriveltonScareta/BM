import { describe, expect, it } from "vitest";
import { MeasurementStatus as S, Role } from "@/lib/db/generated/enums";
import {
  ALL_STATUSES,
  TRANSITIONS,
  allowedTransitions,
  assertTransition,
  canTransition,
  reopensForRevision,
  isEditable,
  type Actor,
} from "@/lib/services/status-machine";
import { TransitionError } from "@/lib/errors";

const ACTORS: Actor[] = [Role.ADMIN, Role.OPERACIONAL, Role.FINANCEIRO, Role.CLIENTE, "SISTEMA"];

describe("máquina de estados — tabela da Seção 5", () => {
  const expectAllowed = (from: S, to: S, actors: Actor[]) => {
    for (const actor of ACTORS) {
      expect(canTransition(from, to, actor), `${from} -> ${to} por ${actor}`).toBe(
        actors.includes(actor),
      );
    }
  };

  it("RASCUNHO", () => {
    expectAllowed(S.RASCUNHO, S.EM_ELABORACAO, ["ADMIN", "OPERACIONAL"]);
    expectAllowed(S.RASCUNHO, S.CANCELADO, ["ADMIN"]);
  });
  it("EM_ELABORACAO", () => {
    expectAllowed(S.EM_ELABORACAO, S.AGUARDANDO_ENVIO, ["ADMIN", "OPERACIONAL"]);
    expectAllowed(S.EM_ELABORACAO, S.CANCELADO, ["ADMIN"]);
  });
  it("AGUARDANDO_ENVIO", () => {
    expectAllowed(S.AGUARDANDO_ENVIO, S.ENVIADO_AO_CLIENTE, ["ADMIN"]);
    expectAllowed(S.AGUARDANDO_ENVIO, S.EM_ELABORACAO, ["ADMIN"]);
    expectAllowed(S.AGUARDANDO_ENVIO, S.CANCELADO, ["ADMIN"]);
  });
  it("ENVIADO_AO_CLIENTE", () => {
    expectAllowed(S.ENVIADO_AO_CLIENTE, S.EM_APROVACAO, ["SISTEMA"]);
    expectAllowed(S.ENVIADO_AO_CLIENTE, S.APROVADO, ["CLIENTE"]);
    expectAllowed(S.ENVIADO_AO_CLIENTE, S.CORRECAO_SOLICITADA, ["CLIENTE"]);
  });
  it("EM_APROVACAO", () => {
    expectAllowed(S.EM_APROVACAO, S.APROVADO, ["CLIENTE"]);
    expectAllowed(S.EM_APROVACAO, S.CORRECAO_SOLICITADA, ["CLIENTE"]);
  });
  it("CORRECAO_SOLICITADA -> EM_ELABORACAO reabre para revisão", () => {
    expectAllowed(S.CORRECAO_SOLICITADA, S.EM_ELABORACAO, ["ADMIN", "OPERACIONAL"]);
    expect(reopensForRevision(S.CORRECAO_SOLICITADA, S.EM_ELABORACAO)).toBe(true);
  });
  it("APROVADO -> ASSINADO somente pelo cliente", () => {
    expectAllowed(S.APROVADO, S.ASSINADO, ["CLIENTE"]);
  });
  it("ASSINADO / LIBERADO / NF_ANEXADA pelo financeiro ou admin", () => {
    expectAllowed(S.ASSINADO, S.LIBERADO_FATURAMENTO, ["ADMIN", "FINANCEIRO"]);
    expectAllowed(S.LIBERADO_FATURAMENTO, S.NF_ANEXADA, ["ADMIN", "FINANCEIRO"]);
    expectAllowed(S.NF_ANEXADA, S.FATURADO, ["ADMIN", "FINANCEIRO"]);
  });
  it("FATURADO só sai via estorno do Admin (nova versão em EM_ELABORACAO)", () => {
    expectAllowed(S.FATURADO, S.EM_ELABORACAO, ["ADMIN"]);
    expect(reopensForRevision(S.FATURADO, S.EM_ELABORACAO)).toBe(true);
    expect(TRANSITIONS.FATURADO.find((t) => t.to === S.EM_ELABORACAO)?.guards).toContain(
      "EXIGE_MOTIVO",
    );
  });
  it("CANCELADO é terminal", () => {
    for (const actor of ACTORS) expect(allowedTransitions(S.CANCELADO, actor)).toEqual([]);
  });

  it("toda transição fora da tabela é rejeitada para todo ator", () => {
    let rejected = 0;
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        for (const actor of ACTORS) {
          const inTable = TRANSITIONS[from].some((t) => t.to === to && t.actors.includes(actor));
          if (inTable) {
            expect(() => assertTransition(from, to, actor)).not.toThrow();
          } else {
            expect(() => assertTransition(from, to, actor)).toThrow(TransitionError);
            rejected += 1;
          }
        }
      }
    }
    // 12 status x 12 status x 5 atores = 720 combinações; a grande maioria é inválida
    expect(rejected).toBeGreaterThan(650);
  });

  it("exemplos críticos de transições inválidas", () => {
    expect(() => assertTransition(S.RASCUNHO, S.FATURADO, "ADMIN")).toThrow(TransitionError);
    expect(() => assertTransition(S.APROVADO, S.LIBERADO_FATURAMENTO, "ADMIN")).toThrow();
    expect(() => assertTransition(S.EM_ELABORACAO, S.ENVIADO_AO_CLIENTE, "ADMIN")).toThrow();
    expect(() =>
      assertTransition(S.AGUARDANDO_ENVIO, S.ENVIADO_AO_CLIENTE, "OPERACIONAL"),
    ).toThrow();
    expect(() => assertTransition(S.ENVIADO_AO_CLIENTE, S.APROVADO, "ADMIN")).toThrow();
    expect(() => assertTransition(S.ASSINADO, S.LIBERADO_FATURAMENTO, "OPERACIONAL")).toThrow();
    expect(() => assertTransition(S.CANCELADO, S.RASCUNHO, "ADMIN")).toThrow();
    expect(() => assertTransition(S.FATURADO, S.FATURADO, "ADMIN")).toThrow();
  });

  it("guards: liberar exige assinatura; faturar exige NF completa; enviar exige itens e aprovador", () => {
    expect(assertTransition(S.ASSINADO, S.LIBERADO_FATURAMENTO, "FINANCEIRO").guards).toContain(
      "TEM_ASSINATURA",
    );
    expect(assertTransition(S.NF_ANEXADA, S.FATURADO, "FINANCEIRO").guards).toContain(
      "TEM_NF_COMPLETA",
    );
    const enviar = assertTransition(S.AGUARDANDO_ENVIO, S.ENVIADO_AO_CLIENTE, "ADMIN");
    expect(enviar.guards).toEqual(expect.arrayContaining(["TEM_ITENS", "TEM_APROVADOR"]));
  });

  it("itens só são editáveis até AGUARDANDO_ENVIO", () => {
    const editable = ALL_STATUSES.filter(isEditable);
    expect(editable).toEqual([S.RASCUNHO, S.EM_ELABORACAO, S.AGUARDANDO_ENVIO]);
  });
});
