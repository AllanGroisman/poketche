# Quickstart & Validação: PokeTche (Phase 1)

**Plan**: [plan.md](./plan.md) · **Contratos**: [contracts/rest-api.md](./contracts/rest-api.md) · **Modelo**: [data-model.md](./data-model.md)

## Pré-requisitos

- Node.js 22 LTS + pnpm; Docker (Postgres local); Expo CLI + app Expo Go (ou dev build para o scanner)
- Contas/chaves em `.env` (nunca commitadas): Supabase (auth), Pagar.me **sandbox**, pokemontcg.io API key, Expo push
- `docker compose up -d postgres` · `pnpm install` · `pnpm --filter api db:migrate`

## Subir o ambiente

```bash
pnpm --filter api dev          # API em http://localhost:3000 (jobs pg_boss inclusos)
pnpm --filter api jobs:run catalog-sync   # popular catálogo (primeira vez)
pnpm --filter api jobs:run price-refresh  # popular cotações (fallback USD+PTAX)
pnpm --filter mobile start     # Expo dev server
```

## Testes automatizados (gate da constituição — I e IV)

```bash
pnpm --filter api test:unit          # preços, comissão/split, variações, regras de wishlist
pnpm --filter api test:integration   # máquina de estados do pedido com provedor mockado + banco efêmero
pnpm --filter api test:contract      # adapters: catálogo, preços, pagamentos (fixtures/sandbox)
pnpm --filter mobile test
```

Critério: 100% verde antes de qualquer merge que toque dinheiro; invariante
`item_price = commission + seller_net` coberta por propriedade nos testes de unidade (SC-010).

## Validação end-to-end por user story

| Story | Cenário de validação | Resultado esperado |
|---|---|---|
| US1 Contas | Cadastrar por e-mail, logar com Google/Apple (sandbox), alternar visibilidade, gerar link | Coleção privada por padrão; link abre visão pública; revogar → 404 (SC-012) |
| US2 Coleção | Buscar "Charizard" no autocomplete, adicionar com condição/idioma/preço de aquisição, editar, remover | Sugestões < 1 s (SC-003); item com imagem e atributos; merge de duplicata por (carta, condição, idioma) |
| US3 Preços | Rodar `price-refresh`; derrubar a fonte (flag no adapter) e rodar de novo | Preço BRL + data em cada carta; com fonte fora, última cotação mantida e app funcional (SC-005) |
| US8 Por carta | Rodar refresh em dias distintos (ou fixtures de snapshot); abrir detalhes | Gráfico, variações 7/30/90d, maior/menor, ganho/perda vs. aquisição (SC-014/015); "histórico indisponível" com <2 snapshots |
| US4 Dashboard | Coleção com fixtures variadas; abrir stats | Total = Σ preço×qtd; distribuições, rankings, completude batem com fixtures |
| US9 Wishlists | Criar wishlist com alvo acima do preço; baixar preço via fixture; rodar `wishlist-alerts` 2× | 1 push recebido (Expo), sem repetição (SC-018); indicador de alvo na tela; carta possuída sinalizada |
| US5 Scanner | Dev build em aparelho físico: sessão sobre ~10 cartas reais (com foil e duplicata); interromper app no meio; gravar uma sessão | ≥80% identificadas (SC-006), captura ≤2 s (SC-006a); foil → "a revisar"; duplicata incrementa; sessão recuperável (SC-006c); nada na coleção antes de confirmar (SC-006b); vídeo só no aparelho (SC-006e) |
| US6 Marketplace | Dois usuários (vendedor com KYC sandbox aprovado): anunciar → comprar com Pix sandbox → tracking → confirmar recebimento | Estados pending_payment→paid→shipped→received→released; net = preço − comissão (SC-010); cada transição em `financial_audit_log` (SC-009); pagamento recusado não trava anúncio |
| US6 Disputa | Pedido shipped → abrir disputa → resolver a favor do comprador | Liberação suspensa; reembolso via sandbox; auditoria completa |
| US7 Visitante | Sem sessão autenticada: abrir link público e `/listings`; tentar comprar | Navegação livre; ação restrita → fluxo de cadastro com retorno ao contexto (SC-013) |

## Checks transversais

- **Auditoria**: `SELECT` em `financial_audit_log` após o fluxo de compra — toda mutação
  financeira presente, tabela sem UPDATE/DELETE (testar que o role da API não consegue).
- **Idempotência**: repetir `POST /orders` com a mesma `Idempotency-Key` → mesmo pedido, sem
  cobrança duplicada.
- **Fallback de terceiros**: desligar adapters (catálogo/preços) por flag — app segue operável.
- **Sem câmera**: revogar permissão no aparelho → todos os fluxos completáveis (SC-007).
