# Boletins de Medição — medição, aprovação e faturamento de serviços

Sistema web para uma prestadora de serviços (mineração, construção pesada e indústria) centralizar
o ciclo **prestação → medição → aprovação do cliente → assinatura → liberação → nota fiscal →
arquivamento**, substituindo planilhas e e-mails soltos.

Estado atual: **Fases 0 a 6** concluídas (fundação, clientes, medição, Excel/PDF, aprovação e
assinatura, faturamento e documentos, dashboard, relatórios e busca global). Veja `PLANO.md` para as fases e `DECISOES.md` para
as decisões técnicas.

## Como rodar em 5 passos

Pré-requisitos: Node.js ≥ 22.12, Docker (para o Postgres) e npm.

```bash
# 1. Postgres (cria os bancos bm e bm_test)
docker compose up -d

# 2. Variáveis de ambiente
cp .env.example .env            # ajuste NEXTAUTH_SECRET: openssl rand -base64 32

# 3. Dependências (gera o Prisma Client no postinstall)
npm install

# 4. Banco: migrations + dados de demonstração
npm run db:migrate && npm run db:seed

# 5. Aplicação
npm run dev                     # http://localhost:3000
```

Sem Docker? Qualquer Postgres 16 serve: crie os bancos `bm` e `bm_test` e ajuste `DATABASE_URL`
e `TEST_DATABASE_URL` no `.env`.

## Credenciais de demonstração (somente desenvolvimento)

Senha única: **`Demo@2026`** (definida por `SEED_PASSWORD` no `.env`). Não use em produção.

| Perfil        | E-mail                   | O que pode                                                     |
| ------------- | ------------------------ | -------------------------------------------------------------- |
| Administrador | `admin@demo.local`       | tudo: usuários, clientes, enviar, cancelar, faturar, auditoria |
| Operacional   | `operacional@demo.local` | criar/editar medições até o envio, relatórios operacionais     |
| Financeiro    | `financeiro@demo.local`  | medições aprovadas em diante, NF e faturamento                 |
| Cliente       | `cliente@demo.local`     | somente as medições do seu cliente (Mineração Serra Azul)      |

O seed cria 3 clientes com contratos e aprovadores, 12 medições em todos os status (4 competências),
versões com PDF, boletins assinados, 2 notas fiscais (PDF + XML) e a trilha de auditoria. Os arquivos
ficam em `./storage` (fora de `/public`; gitignored).

## Variáveis de ambiente

| Variável                                          | Padrão                                             | Descrição                                                                   |
| ------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------- |
| `DATABASE_URL`                                    | `postgresql://postgres:postgres@localhost:5432/bm` | Banco principal                                                             |
| `TEST_DATABASE_URL`                               | `...localhost:5432/bm_test`                        | Banco dos testes de integração                                              |
| `NEXTAUTH_SECRET`                                 | —                                                  | Segredo do JWT de sessão (obrigatório)                                      |
| `NEXTAUTH_URL` / `APP_URL`                        | `http://localhost:3000`                            | URL pública da aplicação                                                    |
| `SESSION_MAX_AGE`                                 | `28800`                                            | Duração da sessão em segundos (8 h)                                         |
| `APP_TIMEZONE`                                    | `America/Sao_Paulo`                                | Fuso de exibição (armazenamento é sempre UTC)                               |
| `COMPANY_NAME` / `COMPANY_CNPJ` / `COMPANY_EMAIL` | demo                                               | Dados da prestadora (cabeçalho do boletim)                                  |
| `STORAGE_PROVIDER` / `STORAGE_LOCAL_DIR`          | `local` / `./storage`                              | Armazenamento de arquivos (fora de `/public`)                               |
| `EMAIL_PROVIDER`                                  | `dev`                                              | `dev` grava e-mails em `EMAIL_DEV_DIR` e loga os links; `smtp` usa `SMTP_*` |
| `EMAIL_DEV_DIR` / `EMAIL_FROM`                    | `/tmp/bm-emails`                                   | Pasta dos e-mails de desenvolvimento e remetente                            |
| `SMTP_HOST/PORT/SECURE/USER/PASS`                 | vazio                                              | Só quando `EMAIL_PROVIDER=smtp`                                             |
| `SEED_PASSWORD`                                   | `Demo@2026`                                        | Senha dos usuários de demonstração                                          |
| `PLAYWRIGHT_CHROMIUM_PATH`                        | vazio                                              | Chromium já instalado para os E2E (opcional)                                |

Nenhum serviço externo pago é necessário. O sistema funciona 100% sem SMTP.

## Comandos

| Comando                                                 | Descrição                                                                                                              |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                                           | servidor de desenvolvimento                                                                                            |
| `npm run build` / `npm start`                           | build e execução de produção                                                                                           |
| `npm run verify`                                        | typecheck + lint + testes + build (definição de pronto)                                                                |
| `npm run typecheck` / `npm run lint` / `npm run format` | qualidade                                                                                                              |
| `npm test`                                              | Vitest: unidade e integração (usa `bm_test`)                                                                           |
| `npm run test:e2e`                                      | Playwright: **recria o seed** (`SEED_RESET=1`) e sobe o `dev` sozinho. Primeira vez: `npx playwright install chromium` |
| `npm run db:migrate`                                    | aplica migrations (`prisma migrate deploy`)                                                                            |
| `npm run db:migrate:dev`                                | cria migration em desenvolvimento                                                                                      |
| `npm run db:seed`                                       | popula dados demo (`SEED_RESET=1 npm run db:seed` recria)                                                              |
| `npm run db:reset`                                      | zera o banco, reaplica migrations e roda o seed                                                                        |

## Estrutura

Consulte `CLAUDE.md` (estrutura de pastas, convenções e regras de negócio inegociáveis).

## Limitações conhecidas

- `xlsx` 0.18.5 (npm) possui avisos de segurança para arquivos maliciosos; mitigado por limites de
  tamanho/linhas e upload restrito a usuários autenticados. Ver `DECISOES.md`.
- Provedor de storage S3 tem só a interface; a implementação fica fora do MVP.
- Rate limit é em memória (uma instância). Para múltiplas instâncias, trocar por Redis.
- Configurações é somente leitura: dados da prestadora vêm das variáveis `COMPANY_*`; não há tela
  de gestão de usuários (os quatro perfis vêm do seed) nem visualização geral da auditoria (o
  histórico de cada medição está na aba Histórico; o dashboard mostra a atividade recente).
- Exportação de relatórios limitada a 5.000 linhas por arquivo.
- Assinatura é **eletrônica simples com registro de evidências** (MP 2.200-2/2001, art. 10, §2º),
  não assinatura digital ICP-Brasil.
- Fora de escopo do MVP: ERP/SEFAZ, leitura automática do XML da NF-e, app nativo, push, multi-idioma,
  multi-empresa, SSO.
