# PokeTche

App mobile (iOS/Android) para colecionadores de Pokémon TCG no Brasil registrarem, precificarem
e negociarem suas coleções. Monorepo com app Expo (`apps/mobile`) e API Fastify (`apps/api`).

A especificação, o plano e as tarefas vivem em [`specs/001-poketche-app/`](specs/001-poketche-app/).

## Requisitos

- Node.js 22 LTS
- pnpm 11
- Docker (Postgres 16 local)

## Setup

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # preencher segredos (nunca commitar)
docker compose up -d db                  # Postgres de desenvolvimento
pnpm --filter @poketche/api prisma:generate
pnpm --filter @poketche/api prisma:migrate
```

## Comandos

```bash
pnpm test                        # testes de todos os pacotes
pnpm --filter @poketche/api test # testes da API (dinheiro, idempotência, auditoria)
pnpm --filter @poketche/api dev  # API em modo watch
pnpm --filter @poketche/mobile start
pnpm lint
pnpm format
```

## Estado da implementação

Fundação (Fases 1–2 de `tasks.md`) implementada: monorepo, tooling, schema Prisma completo e
bibliotecas críticas de dinheiro (centavos inteiros), idempotência e auditoria imutável, com
testes. As user stories (Fases 3+) são construídas sobre essa base. Consulte
[`specs/001-poketche-app/tasks.md`](specs/001-poketche-app/tasks.md) para o progresso por tarefa.

### Pendências externas (antes das fases de dinheiro/integração)

- **T034** — parecer legal (coleta Liga Pokémon + redistribuição de imagens) antes de ativar a coleta.
- **T066** — spike do pipeline de identificação (scanner) antes da US5.
- **T076** — spike de custódia no Pagar.me (sandbox) antes da US6.
- Credenciais: Supabase (auth), Cloudflare R2 (imagens), pokemontcg.io/TCGdex (catálogo).
