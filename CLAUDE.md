# CLAUDE.md — Sistema de Medição, Aprovação e Faturamento

Guia operacional do projeto. Leia antes de alterar qualquer coisa. Regras das Seções
"Inegociáveis" abaixo nunca são relaxadas sem registro em `DECISOES.md` e aviso ao dono.

## Comandos

```bash
docker compose up -d          # Postgres 16 (bancos bm e bm_test)
npm install                   # roda prisma generate no postinstall
npm run db:migrate            # prisma migrate deploy
npm run db:migrate:dev        # cria/aplica migration em desenvolvimento (nunca db push)
npm run db:seed               # dados demo (recusa banco populado; SEED_RESET=1 para recriar)
npm run dev                   # http://localhost:3000
npm run verify                # typecheck + lint + test + build — obrigatório antes de concluir
npm run test                  # Vitest (unidade + integração; usa TEST_DATABASE_URL)
npm run test:e2e              # Playwright (exige banco seedado; sobe o dev server sozinho)
npm run format                # Prettier
```

## Stack (versões fixadas em package.json)

Next.js 16 (App Router, `proxy.ts`) · React 19 · TypeScript 5.9 strict · Tailwind 4 + shadcn/ui
(componentes em `components/ui`, base Radix) · React Hook Form + Zod 4 · TanStack Table 8 ·
Recharts 3 · PostgreSQL 16 · Prisma 7 (driver adapter `@prisma/adapter-pg`, cliente gerado em
`lib/db/generated`, gitignored) · Auth.js (next-auth 4, Credentials + JWT httpOnly) · bcryptjs ·
SheetJS (`xlsx`) · @react-pdf/renderer · date-fns 4 + @date-fns/tz · decimal.js · Vitest 5 ·
Playwright · ESLint 9 + Prettier.

## Estrutura

```
app/(auth)      login, recuperar-senha            app/(app)      área interna (menu lateral)
app/(portal)    portal do cliente por token       app/api        route handlers (sempre withApi)
components/ui   shadcn                            components/*   layout, estados, medicao, auth…
lib/auth        options, session, rbac (can), scope, password
lib/db          prisma.ts (singleton), repositories/, generated/ (não editar)
lib/services    regras de negócio: status-machine, calculation, audit, measurement-number, snapshot, auth…
lib/validation  schemas Zod compartilhados (cnpj, money, common, auth)
lib/email       adapter (dev grava em /tmp/bm-emails; smtp por env)
lib/storage     adapter (local em ./storage; s3 esqueleto)
lib/pdf         boletim (Fase 3)     lib/excel   import/export (Fase 3)
prisma/         schema, migrations, seed.ts       tests/  unit, integration, e2e, setup, fixtures
```

## Convenções

- **Idioma:** código e banco em inglês; UI, mensagens de erro, commits e docs em pt-BR.
- **Commits:** pequenos e atômicos, `tipo(escopo): descrição` (`feat(medicao): calculo de totais`).
- **Arquitetura:** rotas/componentes **nunca** importam Prisma (regra ESLint `no-restricted-imports`).
  Leitura via `lib/db/repositories` com `Scope`; escrita via `lib/services`.
- **Leitura × escrita:** páginas (server components) leem via service com `requireSession` + `can` +
  `getScope`; o navegador escreve (e lê listas dinâmicas) via route handlers. Nunca `fetch` da própria
  API dentro de server components.
- **Listagens:** estado (q, status, sort, order, page, pageSize) na URL via `useUrlState`; tabela com
  `components/tabelas/data-table.tsx` (`renderCard` obrigatório para o celular).
- **API:** todo route handler usa `withApi()` e começa com `requireSession()`/`requireAction()`.
  Erros: lançar `AppError`/`NotFoundError`/`ForbiddenError`/`ValidationError`/`TransitionError`.
- **Validação:** um schema Zod em `lib/validation`, usado no formulário (client) e na rota (server).
- **Dinheiro/quantidade:** `Decimal` (Prisma/decimal.js). Nunca `Float`/`Number`. Calcular só em
  `lib/services/calculation.ts`. Exibir com `formatCurrency` (`R$ 1.234.567,89`) e classe `tabular`.
- **Datas:** armazenar UTC. Instantes (`createdAt`, `signedAt`…) exibem em `America/Sao_Paulo` com
  `formatDateTime`/`formatTimestampAsDate`. Datas puras (`@db.Date`: `startDate`, `issueDate`…) ficam a
  meia-noite UTC e usam `formatDate` **sem** conversão de fuso (senão mostram o dia anterior).
  Competência armazenada `AAAA-MM`, exibida `MM/AAAA`.
- **TypeScript:** `any` proibido (`eslint-disable` só com justificativa). `noUncheckedIndexedAccess` ligado.
- **Estados de tela:** usar `components/estados` (carregando, vazio, erro, sem permissão).
- **Documentos permitidos:** `README.md`, `CLAUDE.md`, `DECISOES.md`, `PLANO.md`, relatório da Fase 7.
- **Sem dados mockados no front:** toda tela consome a API real. Único dado fabricado: seed.

## Inegociáveis — máquina de estados (Seção 5 do briefing)

Tabela em `lib/services/status-machine.ts` (`TRANSITIONS`). Toda mudança de status passa por
`assertTransition(from, to, actor)`; fora da tabela ⇒ `TransitionError` (409). Nunca confiar no front.

| De                                | Para                                                  | Quem                                 |
| --------------------------------- | ----------------------------------------------------- | ------------------------------------ |
| RASCUNHO                          | EM_ELABORACAO, CANCELADO                              | Admin, Operacional (cancelar: Admin) |
| EM_ELABORACAO                     | AGUARDANDO_ENVIO, CANCELADO                           | Admin, Operacional (cancelar: Admin) |
| AGUARDANDO_ENVIO                  | ENVIADO_AO_CLIENTE, EM_ELABORACAO, CANCELADO          | Admin                                |
| ENVIADO_AO_CLIENTE                | EM_APROVACAO                                          | Sistema (cliente abriu o link)       |
| ENVIADO_AO_CLIENTE / EM_APROVACAO | APROVADO, CORRECAO_SOLICITADA                         | Cliente (portal)                     |
| CORRECAO_SOLICITADA               | EM_ELABORACAO (nova versão)                           | Admin, Operacional                   |
| APROVADO                          | ASSINADO                                              | Cliente (portal)                     |
| ASSINADO                          | LIBERADO_FATURAMENTO                                  | Admin, Financeiro                    |
| LIBERADO_FATURAMENTO              | NF_ANEXADA                                            | Admin, Financeiro                    |
| NF_ANEXADA                        | FATURADO                                              | Admin, Financeiro                    |
| FATURADO                          | EM_ELABORACAO só via estorno com motivo (nova versão) | Admin                                |
| CANCELADO                         | terminal                                              | —                                    |

Travas: itens bloqueados a partir de `ENVIADO_AO_CLIENTE` (`isEditable`); sem liberação sem
`Signature`; sem `FATURADO` sem `Invoice` completa; alerta (não bloqueio) se `Invoice.amount ≠ totalAmount`.

## Inegociáveis — isolamento por cliente (Seção 7)

1. Escopo (`lib/auth/scope.ts`) deriva **só** da sessão do servidor. Nunca de query/body.
2. Todo repositório de medição/documento/NF/versão/assinatura recebe `Scope` como primeiro argumento.
3. Registro fora do escopo ⇒ `NotFoundError` (404, nunca 403).
   Buscar por id **sempre** com `where: { AND: [{ id }, scopeWhere(scope)] }`. Nunca `{ id, ...scopeWhere }`:
   o spread deixa o `id` do escopo sobrescrever o `id` pedido (bug real pego por teste na Fase 1).
4. Download de arquivo só por rota autenticada com verificação de escopo; chave de storage é UUID.
5. Teste dedicado de isolamento (Cliente A × Cliente B em todas as rotas) faz parte do DoD.

## Inegociáveis — cálculo (Seção 8)

`totalPrice = round2(quantity × unitPrice)` (half-up) na gravação. `Subtotal = MdO + Equip + Outros`.
`Total = Subtotal − Descontos + Acréscimos + Impostos`. Sempre no servidor; o front só exibe prévia.

## Permissões (Seção 6)

Helper único `can(user, action, resource?)` em `lib/auth/rbac.ts`. Financeiro só vê medições de
`APROVADO` em diante; Cliente só vê o próprio `clientId` a partir de `ENVIADO_AO_CLIENTE`.
Enviar/cancelar/estornar: só Admin. Aprovar/assinar: só o cliente pelo portal (token), nunca por sessão.

## Auditoria

`lib/services/audit.service.ts` é o único escritor de `AuditLog`; não existe update/delete.
Registrar: criação/edição/exclusão de medição e itens, mudança de status, envio, abertura pelo cliente,
aprovação, correção, assinatura, documentos, NF, login/falha de login, alteração de usuário.

## Definição de pronto de uma fase

`npm run verify` verde, E2E da fase verdes, aceite da fase demonstrado, `DECISOES.md` atualizado.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
