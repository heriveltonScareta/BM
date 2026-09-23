# PLANO.md — Sistema de Medição, Aprovação e Faturamento de Serviços

> Produzido na etapa 0.1. Nenhum código foi escrito ainda. Aguarda aprovação para iniciar a Fase 0.

---

## 1. Stack confirmada (versões fixadas)

Todas as versões abaixo foram verificadas no registro npm em 23/09/2026 e serão fixadas (sem `^`) no `package.json`.

| Camada      | Pacote                                    | Versão                           | Observação                                                                                                                                                                                                       |
| ----------- | ----------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework   | `next`                                    | 16.3.6                           | App Router, Turbopack, `proxy.ts` (novo nome do middleware)                                                                                                                                                      |
| React       | `react` / `react-dom`                     | 19.3.0                           |                                                                                                                                                                                                                  |
| TypeScript  | `typescript`                              | 5.9.3                            | **Não** usarei TS 7.x (compilador novo, ecossistema de lint/plugins ainda em transição)                                                                                                                          |
| UI          | `tailwindcss` + `@tailwindcss/postcss`    | 4.3.3                            |                                                                                                                                                                                                                  |
| UI          | `shadcn` (CLI)                            | 4.21.0                           | Componentes copiados para `/components/ui` (Radix por baixo)                                                                                                                                                     |
| Ícones      | `lucide-react`                            | 1.47.0                           |                                                                                                                                                                                                                  |
| Formulários | `react-hook-form` / `@hookform/resolvers` | 7.88.0 / 5.9.1                   |                                                                                                                                                                                                                  |
| Validação   | `zod`                                     | 4.6.5                            | Schemas em `/lib/validation`, usados no client e no server                                                                                                                                                       |
| Tabelas     | `@tanstack/react-table`                   | **8.21.3**                       | v9 saiu há pouco com API alterada; v8 é a versão documentada pelo shadcn e amplamente estável. Registrado em `DECISOES.md`                                                                                       |
| Gráficos    | `recharts`                                | 3.10.1                           |                                                                                                                                                                                                                  |
| Banco       | PostgreSQL                                | 16 (imagem `postgres:16-alpine`) | Via `docker compose`                                                                                                                                                                                             |
| ORM         | `prisma` / `@prisma/client`               | **7.10.0**                       | Prisma 8 ainda é RC. Prisma 7 exige _driver adapter_: `@prisma/adapter-pg` 7.10.0 + `pg` 8.23.0 e `prisma.config.ts`                                                                                             |
| Auth        | `next-auth`                               | **4.24.15**                      | É a tag `latest` estável (v5 continua `beta`). Suporta `next ^16`, Credentials + JWT httpOnly. Se surgir incompatibilidade real com App Router na Fase 0, migro para `5.0.0-beta.32` e registro em `DECISOES.md` |
| Senha       | `bcryptjs`                                | 3.0.3                            | JS puro (sem build nativo) — mais simples em Docker/CI que `argon2`. Custo 12                                                                                                                                    |
| Excel       | `xlsx`                                    | 0.18.5                           | Versão do registro npm (CDN oficial do SheetJS está bloqueado neste ambiente). Ver risco R4                                                                                                                      |
| PDF         | `@react-pdf/renderer`                     | 4.9.0                            | `renderToBuffer` server-side, sem browser                                                                                                                                                                        |
| Datas       | `date-fns` / `@date-fns/tz`               | 4.4.0 / 1.5.0                    | Locale `pt-BR`, fuso `America/Sao_Paulo` só na exibição                                                                                                                                                          |
| Decimal     | `decimal.js`                              | 10.6.0                           | Mesma lib que o `Prisma.Decimal`; todo cálculo monetário no servidor                                                                                                                                             |
| E-mail      | `nodemailer`                              | 7.0.13                           | Peer dependency do next-auth; usado só pelo adapter SMTP opcional                                                                                                                                                |
| Extenso     | `extenso`                                 | 3.0.0                            | "Valor total por extenso" no PDF                                                                                                                                                                                 |
| Testes      | `vitest`                                  | 5.0.1                            | Unidade + integração (integração contra Postgres real, banco `bm_test`)                                                                                                                                          |
| E2E         | `@playwright/test`                        | 1.63.0                           | Chromium já instalado no ambiente                                                                                                                                                                                |
| Lint        | `eslint` / `eslint-config-next`           | 10.11.0 / 16.3.6                 | Flat config                                                                                                                                                                                                      |
| Format      | `prettier` + `eslint-config-prettier`     | 3.9.9 / 10.1.8                   |                                                                                                                                                                                                                  |
| Scripts     | `tsx`                                     | 4.23.15                          | Seed e utilitários                                                                                                                                                                                               |

**Sem dependência para:** rate limit (token bucket em memória, com interface para trocar por Redis), validação de MIME real (leitura de _magic bytes_ dos 5 tipos aceitos: PDF, XML, PNG, JPEG, XLSX/CSV), validação de CNPJ (dígito verificador implementado em `/lib/validation/cnpj.ts`), máscaras de moeda (formatação via `Intl.NumberFormat('pt-BR')`).

---

## 2. Estrutura de pastas

```
/app
  /(auth)/login                      # login
  /(auth)/recuperar-senha            # fluxo por e-mail (adapter dev grava em /tmp)
  /(app)                             # área interna: layout com menu lateral
    /dashboard  /clientes  /medicoes  /medicoes/nova  /aprovacoes
    /faturamento  /documentos  /relatorios  /configuracoes
  /(portal)/portal/aprovacao/[token] # portal do cliente (layout próprio, sem menu)
  /api
    /auth/[...nextauth]
    /clientes  /contratos  /medicoes  /medicoes/[id]/{itens,enviar,versoes,pdf,...}
    /portal/[token]/{abrir,aprovar,corrigir,assinar}
    /documentos/[id]/download        # único caminho para baixar arquivo
    /faturamento  /relatorios  /busca  /auditoria  /usuarios
/components
  /ui                                # shadcn
  /layout  /medicao  /clientes  /tabelas  /estados (skeleton, vazio, erro, sem permissão)
/lib
  /auth        # authOptions, getSessionUser(), can(), requireSession(), scope.ts
  /db          # prisma.ts (singleton + adapter pg), repositórios por entidade
  /services    # measurement.service, status-machine.ts, calculation.ts, approval.service,
               # signature.service, invoice.service, document.service, audit.service, client.service
  /pdf         # BoletimDocument.tsx, render.ts, extenso.ts
  /excel       # template.ts, import.ts (parse+validação), export.ts, numbers.ts (pt-BR/en)
  /storage     # StorageProvider (interface), local.ts, s3.ts (esqueleto)
  /email       # EmailProvider (interface), dev.ts (/tmp + console), smtp.ts
  /validation  # schemas Zod compartilhados, cnpj.ts, money.ts (parse/format)
  /utils       # datas (tz), formatação, ids
/prisma        # schema.prisma, migrations/, seed.ts, prisma.config.ts (raiz)
/tests
  /unit  /integration  /e2e  /fixtures (planilhas modelo e com erros)
/storage       # arquivos locais (gitignored, fora de /public)
docker-compose.yml  .env.example  CLAUDE.md  DECISOES.md  PLANO.md  README.md
```

**Invariante arquitetural:** rotas, server actions e componentes nunca importam `@prisma/client`. Toda escrita passa por `/lib/services`; toda leitura passa por `/lib/db/repositories` recebendo um `Scope` (Seção 5). Um teste de lint (regra `no-restricted-imports`) impede import do Prisma fora de `/lib/db`.

---

## 3. Modelo de dados (Prisma)

Nomes em inglês no banco; rótulos em pt-BR na UI. Chaves primárias `String @id @default(uuid(7))`.

### Enums

```
Role               ADMIN | OPERACIONAL | FINANCEIRO | CLIENTE
MeasurementStatus  RASCUNHO | EM_ELABORACAO | AGUARDANDO_ENVIO | ENVIADO_AO_CLIENTE | EM_APROVACAO
                   | APROVADO | CORRECAO_SOLICITADA | ASSINADO | LIBERADO_FATURAMENTO
                   | NF_ANEXADA | FATURADO | CANCELADO
ApprovalDecision   APPROVED | CHANGES_REQUESTED
InvoiceStatus      EMITIDA | ENVIADA | PAGA | CANCELADA
DocumentType       BOLETIM | BOLETIM_ASSINADO | NF_PDF | NF_XML | OUTRO
```

### Entidades

| Entidade               | Campos principais                                                                                                                                                                                                                                                                                                                                              | Índices / regras                                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User**               | id, name, email @unique, passwordHash, role, clientId?, isActive, lastLoginAt?, createdAt, updatedAt                                                                                                                                                                                                                                                           | `role = CLIENTE` ⇒ `clientId` obrigatório (validado no service)                                                                                   |
| **Client**             | id, code @unique, legalName, tradeName, cnpj @unique, email, phone, address, notes, isActive, deletedAt?                                                                                                                                                                                                                                                       | cnpj armazenado só com dígitos                                                                                                                    |
| **ClientContact**      | id, clientId, name, role, email, isApprover, isActive                                                                                                                                                                                                                                                                                                          | `(clientId)`                                                                                                                                      |
| **Contract**           | id, clientId, code, name, unit, startDate, endDate?, isActive                                                                                                                                                                                                                                                                                                  | `@@unique([clientId, code])`                                                                                                                      |
| **Measurement**        | id, number @unique (`BM-AAAA-NNNN`), clientId, contractId, competence (`AAAA-MM`), startDate, endDate, issueDate, ownerUserId, frs?, purchaseOrder?, status, currentVersion (int, default 0), otherAmount, discountAmount, additionAmount, taxAmount, laborTotal, equipmentTotal, subtotal, totalAmount, notes?, createdAt, updatedAt, canceledAt?, deletedAt? | `(clientId,status)`, `(clientId,competence)`, `frs`, `purchaseOrder`, `number`. Totais persistidos (`Decimal(18,2)`) para listagens sem recálculo |
| **MeasurementCounter** | year @id, lastNumber                                                                                                                                                                                                                                                                                                                                           | Numeração segura: `update … lastNumber: { increment: 1 }` dentro de transação (lock de linha, sem `count()+1`)                                    |
| **LaborItem**          | id, measurementId, code, role, description?, quantity `Decimal(18,6)`, unit, daysHours `Decimal(18,6)`, unitPrice `Decimal(18,6)`, totalPrice `Decimal(18,2)`, sortOrder                                                                                                                                                                                       | `(measurementId, sortOrder)`                                                                                                                      |
| **EquipmentItem**      | idem com `name` no lugar de `role`                                                                                                                                                                                                                                                                                                                             | idem                                                                                                                                              |
| **MeasurementVersion** | id, measurementId, version, snapshot Json, pdfDocumentId?, createdByUserId, reason?, createdAt                                                                                                                                                                                                                                                                 | `@@unique([measurementId, version])`; imutável                                                                                                    |
| **ApprovalRequest**    | id, measurementId, versionId, tokenHash @unique (SHA-256), expiresAt, sentToEmail, sentToName, sentAt, openedAt?, decidedAt?, decision?, comment?, usedAt?                                                                                                                                                                                                     | token bruto nunca persistido                                                                                                                      |
| **Signature**          | id, measurementId, versionId, approvalRequestId, signerName, signerEmail, signedAt, ipAddress, userAgent, documentHash (SHA-256 do PDF assinado), signatureImage? (storageKey)                                                                                                                                                                                 | imutável                                                                                                                                          |
| **Invoice**            | id, measurementId @unique, number, series?, issueDate, amount `Decimal(18,2)`, sentAt?, status, notes?, pdfDocumentId?, xmlDocumentId?                                                                                                                                                                                                                         | índice `number`                                                                                                                                   |
| **Document**           | id, measurementId?, clientId?, type, fileName (sanitizado), mimeType, sizeBytes, storageKey (uuid), checksum (SHA-256), uploadedByUserId?, createdAt, deletedAt?                                                                                                                                                                                               | `(measurementId)`, `(clientId)`                                                                                                                   |
| **AuditLog**           | id, entity, entityId, action, actorUserId?, actorLabel, before Json?, after Json?, ip?, userAgent?, createdAt                                                                                                                                                                                                                                                  | `(entity, entityId, createdAt)`; append-only (sem `update/delete` no repositório; relações sem `onDelete: Cascade`)                               |
| **PasswordResetToken** | id, userId, tokenHash, expiresAt, usedAt?                                                                                                                                                                                                                                                                                                                      | suporte a `/recuperar-senha`                                                                                                                      |

**Regras de dados:** `Decimal` em tudo que é dinheiro/quantidade; exclusão lógica (`deletedAt`) em Measurement, Client e Document, com filtro padrão nos repositórios; `AuditLog`, `MeasurementVersion` e `Signature` sem `delete` nem `onDelete: Cascade`; datas em UTC (`timestamptz`), competência como string `AAAA-MM` validada por Zod.

---

## 4. Regras de negócio centrais (resumo do que vai para `CLAUDE.md`)

### 4.1 Máquina de estados

Implementada em `/lib/services/status-machine.ts` como tabela `TRANSITIONS: Record<Status, Array<{ to, roles }>>` exatamente conforme a Seção 5 do briefing. `transition(measurement, to, actor)` valida (a) se a transição existe, (b) se o papel do ator é permitido (`SYSTEM` e `CLIENTE_PORTAL` como atores especiais), (c) pré-condições:

- `→ ENVIADO_AO_CLIENTE`: ao menos 1 item, contato aprovador válido, cria `MeasurementVersion` e `ApprovalRequest`.
- `→ EM_ELABORACAO` a partir de `CORRECAO_SOLICITADA` ou estorno de `FATURADO`: incrementa `currentVersion`, exige `reason` no estorno.
- `→ LIBERADO_FATURAMENTO`: exige `Signature` da versão vigente.
- `→ FATURADO`: exige `Invoice` com `number`, `issueDate`, `amount`; se `amount ≠ totalAmount`, retorna alerta (não bloqueia).
- Itens bloqueados para escrita quando `status ∉ {RASCUNHO, EM_ELABORACAO, AGUARDANDO_ENVIO}`.
  Toda transição grava `AuditLog` com before/after na mesma transação.

### 4.2 Cálculo (`/lib/services/calculation.ts`)

Funções puras sobre `Decimal`: `itemTotal = round2(quantity × unitPrice)` (ROUND_HALF_UP) na gravação; totais recomputados e persistidos no servidor a cada mutação de item ou cabeçalho. O front mostra prévia com a **mesma função** (compartilhada), mas o valor gravado é sempre o do servidor.

> Nota: o briefing define `totalPrice = quantity × unitPrice`. O campo `daysHours` é armazenado e exibido, mas **não** entra na multiplicação (premissa P3, abaixo).

### 4.3 Permissões

`can(user, action, resource?)` em `/lib/auth/rbac.ts`, matriz literal da Seção 6. Todo route handler começa com `const user = await requireSession(); if (!can(user, 'x', r)) return 403/404`.

### 4.4 Isolamento por cliente (`/lib/auth/scope.ts`)

`getScope(session)` retorna `{ kind: 'ALL' } | { kind: 'CLIENT', clientId } | { kind: 'FINANCEIRO' }` derivado **somente** da sessão. Todos os repositórios de medição/documento/NF/versão/assinatura recebem `scope` como primeiro argumento e aplicam o `where`. Registro fora do escopo ⇒ `NotFoundError` ⇒ HTTP 404. Teste de integração `tests/integration/isolamento.test.ts` percorre **todas** as rotas com IDs do Cliente B autenticado como Cliente A, mais o E2E equivalente.

---

## 5. Fases de entrega

Ao final de cada fase: `npm run verify` (typecheck + lint + test + build), demonstração do aceite e **parada** para aprovação.

| Fase                                  | Entregas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Critério de aceite                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **0 — Fundação**                      | `create-next-app` + TS strict; Tailwind 4 + shadcn (tema neutro, uma cor de ação azul-petróleo); Docker Compose (Postgres 16, bancos `bm` e `bm_test`); Prisma 7 + schema completo + migration inicial; seed completo (Seção 17); Auth.js Credentials + JWT httpOnly; `proxy.ts` protegendo `(app)`; `can()`, `getScope()`, `requireSession()`; layout com menu lateral colapsável e os 9 itens; `AuditLog` de login/falha de login; adapters de e-mail e storage (dev); `CLAUDE.md`, `DECISOES.md`, `README.md`, `.env.example`; scripts npm; Vitest + Playwright configurados; testes: cálculo, máquina de estados, CNPJ, numeração concorrente | `npm run verify` passa; login com os 4 perfis; rota protegida redireciona para `/login`; seed sobe do zero   |
| **1 — Clientes e contratos**          | CRUD de clientes (CNPJ com DV + máscara), contatos (aprovadores), contratos, ativar/inativar, busca + paginação + ordenação server-side; telas com skeleton/vazio/erro/sem permissão; auditoria                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Criar/editar/listar; CNPJ inválido rejeitado (client e server); cliente inativo não aparece ao criar medição |
| **2 — Medição, MdO e equipamentos**   | Nova medição com numeração automática; abas Mão de Obra / Equipamentos com grade editável (adicionar, inline, duplicar, excluir, reordenar via teclado e botões); cards no mobile; recálculo server-side; resumo financeiro; FRS/PC; status RASCUNHO/EM_ELABORACAO; timeline inicial                                                                                                                                                                                                                                                                                                                                                              | 20 itens com totais corretos; reload mantém tudo; editar item recalcula no servidor                          |
| **3 — Excel e PDF**                   | Modelo `.xlsx` para download; importação `.xlsx/.csv` com validação tudo-ou-nada e tabela de erros `{aba, linha, coluna, valorRecebido, motivo}`; modo substituir/adicionar; exportação; PDF do boletim (Seção 11) com marca d'água RASCUNHO, `Página X de Y`, cabeçalho repetido                                                                                                                                                                                                                                                                                                                                                                 | Modelo importa; planilha com 3 erros retorna as 3 linhas/colunas; PDF bate com a tela                        |
| **4 — Aprovação e assinatura**        | Enviar (Admin) ⇒ versão congelada + token 32 bytes (hash) 7 dias uso único + e-mail; portal por token (abrir ⇒ EM_APROVACAO, aprovar, solicitar correção, assinar com evidências e PDF `BOLETIM_ASSINADO`); rate limit; nova versão após correção; comparação de versões; timeline; aviso sobre assinatura eletrônica simples (MP 2.200-2/2001, art. 10, §2º)                                                                                                                                                                                                                                                                                     | Ciclo enviar → correção → v2 → reenviar → aprovar → assinar; link expirado/usado rejeitado                   |
| **5 — Faturamento e documentos**      | Liberar (exige assinatura), anexar NF PDF+XML (validação de extensão, MIME real, tamanho, checksum), status de faturamento, alerta de divergência de valor, estorno com motivo, aba Documentos por medição, download por rota autenticada                                                                                                                                                                                                                                                                                                                                                                                                         | Não libera sem assinatura; download de NF só com escopo                                                      |
| **6 — Dashboard, relatórios e busca** | Cards + gráficos Recharts; visão por cliente; relatórios (medições, financeiro, faturamento) com filtros combinados e exportação Excel/PDF; busca global (cliente, BM, FRS, PC, NF, contrato)                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Soma dos cards = soma das tabelas com filtros combinados                                                     |
| **7 — Revisão final**                 | Auditoria própria: status, isolamento, arredondamento, permissões, responsividade (375/768/1440), N+1, estado após correção; correções; relatório em `RELATORIO-FASE-7.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Definition of Done (Seção 20) integralmente verdadeira                                                       |

---

## 6. Riscos e mitigações

| #   | Risco                                                                                                                                             | Mitigação                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | **next-auth v4 em Next 16**: `latest` é v4, mas a linha "App Router" oficial é a v5 beta. Possível atrito com `proxy.ts` e cookies                | Guard real feito por `requireSession()` em layouts e route handlers (não depender só do middleware). Se v4 falhar na Fase 0, migrar para v5 beta e registrar                               |
| R2  | **Prisma 7** mudou o modelo (driver adapter, `prisma.config.ts`, sem `url` no schema)                                                             | Seguir o guia do Prisma 7; validar `migrate` + `seed` já na Fase 0                                                                                                                         |
| R3  | **@react-pdf/renderer** e fontes: "Página X de Y", cabeçalho repetido (`fixed`) e Inter embarcada                                                 | Fonte incluída em `/lib/pdf/fonts` (Inter, licença OFL); teste de renderização em `tests/integration/pdf.test.ts`                                                                          |
| R4  | **xlsx 0.18.5** (npm) tem avisos de segurança conhecidos (ReDoS / prototype pollution em arquivos maliciosos) e o CDN oficial está bloqueado aqui | Arquivo só aceito de usuário autenticado; limites de 10 MB / 5.000 linhas aplicados antes do parse; parse em `try/catch` com timeout; registrado em `DECISOES.md` como limitação conhecida |
| R5  | **Concorrência na numeração**                                                                                                                     | `MeasurementCounter` com `increment` atômico em transação + `@unique` em `number`; teste com `Promise.all` de criações simultâneas                                                         |
| R6  | **Isolamento por cliente**                                                                                                                        | Escopo obrigatório na assinatura de todo repositório (TypeScript não deixa esquecer); teste dedicado percorrendo todas as rotas; 404 padrão                                                |
| R7  | **Grade tipo planilha responsiva e acessível**                                                                                                    | TanStack Table + inputs controlados, navegação Tab/Enter/Esc; no mobile vira lista de cards com os mesmos campos                                                                           |
| R8  | **Tamanho do escopo × commits atômicos**                                                                                                          | Uma fase por vez, commits por funcionalidade, `verify` ao fim de cada fase                                                                                                                 |
| R9  | **Fuso horário**                                                                                                                                  | Servidor em UTC; `formatInTimeZone(date, 'America/Sao_Paulo', 'dd/MM/yyyy')` centralizado em `/lib/utils/dates.ts`                                                                         |

---

## 7. Premissas adotadas (decisões que tomei para não bloquear; irão para `DECISOES.md`)

- **P1** Dados da empresa prestadora (nome, CNPJ, logo) vêm de variáveis `COMPANY_*` no `.env` e de `/public/logo.png`; editáveis por Admin em _Configurações_ a partir da Fase 6. No seed: "Prestadora Demo Ltda".
- **P2** `Outros` do subtotal é um campo de cabeçalho `otherAmount` (valor, sem itens), assim como descontos, acréscimos e impostos são **valores** (não percentuais). A UI oferece um auxiliar de percentual que apenas preenche o valor.
- **P3** `daysHours` é informativo e não entra no cálculo (`totalPrice = quantity × unitPrice`, conforme Seção 8).
- **P4** Envio para aprovação é feito para **um** contato aprovador escolhido na tela de envio (padrão: primeiro `isApprover` ativo). Um `ApprovalRequest` por envio.
- **P5** Usuário `CLIENTE` logado vê **somente leitura** as medições e documentos do próprio `clientId` (a partir de `ENVIADO_AO_CLIENTE`); aprovação e assinatura acontecem no portal por token (o link também aparece na área logada quando há solicitação pendente).
- **P6** `FINANCEIRO` enxerga status `APROVADO, ASSINADO, LIBERADO_FATURAMENTO, NF_ANEXADA, FATURADO`.
- **P7** Assinatura: campo de nome digitado + confirmação de e-mail + checkbox de ciência; `signatureImage` (desenho) fica opcional e é armazenado como documento.
- **P8** `InvoiceStatus`: `EMITIDA | ENVIADA | PAGA | CANCELADA` (o status da medição continua sendo a fonte da verdade do ciclo).
- **P9** Recuperação de senha via token por e-mail (mesmo adapter dev), expiração 1 h.
- **P10** Rate limit do portal: 30 req/min por IP e 10 req/min por token, em memória.

---

## 8. Dúvidas

Nenhuma das dúvidas encontradas é bloqueante: todas foram resolvidas pelas premissas P1–P10 acima. Caso alguma premissa esteja errada, basta indicar qual e eu ajusto antes da fase correspondente. As que mais mudariam o resultado são:

1. **P3** — `daysHours` realmente não multiplica? Em algumas planilhas de campo, `Quantidade × Dias/Horas × Valor Unitário` é o total. Sigo a Seção 8 ao pé da letra até segunda ordem.
2. **P4** — envio para um único aprovador por vez atende, ou o cliente costuma ter dois aprovadores simultâneos?
3. **P1** — há logo/nome/CNPJ reais da prestadora para o cabeçalho do PDF, ou o placeholder configurável basta para o MVP?

---

## 9. Próximo passo

Com a aprovação deste plano, inicio a **Fase 0** e paro ao final dela com `npm run verify` verde.
