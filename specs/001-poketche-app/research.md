# Research: PokeTche — Decisões técnicas (Phase 0)

**Date**: 2026-07-10 | **Plan**: [plan.md](./plan.md)

Cada item segue: Decisão → Rationale → Alternativas consideradas. Itens marcados **[SPIKE]**
têm decisão condicionada a validação prática no início da implementação da story correspondente.

## 1. Catálogo de cartas — pokemontcg.io com sync local

**Decisão**: usar a Pokémon TCG API (pokemontcg.io) como fonte do catálogo (mandato do usuário),
com **sincronização completa para o nosso PostgreSQL** via job agendado — o app nunca consulta
a API externa em tempo de requisição. Imagens servidas pelas URLs da fonte (sem re-hospedagem).
Cartas em português: o catálogo da pokemontcg.io é em inglês; o idioma PT/EN é um **atributo do
item da coleção** (como já especificado, FR-007/FR-009), não uma entrada separada de catálogo.

**Rationale**: sync local dá autocomplete < 1 s (SC-003) sem depender da latência/disponibilidade
da fonte, e cumpre o princípio V da constituição (cache + fallback). A pesquisa indica que a
equipe do pokemontcg.io migrou o foco para o produto comercial Scrydex — a API segue gratuita e
funcional, mas o risco de descontinuação existe e fica mitigado pelo sync local + interface
`CatalogProvider` trocável.

**Alternativas consideradas**: **Scrydex** (sucessor comercial, inclui preços — candidato natural
se pokemontcg.io degradar); **TCGdex** (open source, multilíngue com português — melhor opção
futura para nomes/imagens localizados em PT; anotado como evolução do `CatalogProvider`, fora do
MVP); PokéWallet (menos estabelecido).

## 2. Preços em BRL — camada isolada com fonte primária a validar

**Decisão**: camada `PriceProvider` isolada (constituição V) com cotações cacheadas em Postgres,
job diário de atualização e snapshots por carta (FR-037).

- **Fonte primária pretendida (mercado BR)**: Liga Pokémon. **Não há API pública** e os termos de
  uso não autorizam expressamente scraping. **[SPIKE — viabilidade legal]**: contatar a Liga
  (LigaMagic) para acesso autorizado/parceria antes de qualquer coleta automatizada; scraping sem
  autorização fica **vetado** enquanto não houver parecer (risco contratual/concorrencial — a Liga
  é também concorrente indireta do nosso marketplace).
- **Fallback funcional desde o dia 1**: preços em USD (TCGplayer via Scrydex/agregadores — o
  acesso direto à API TCGplayer é restrito a parceiros aprovados) **convertidos a BRL pela PTAX**
  (API pública do Banco Central), com marcação visível de que o preço é referência internacional
  convertida.
- O marketplace próprio, quando ativo, gera um terceiro sinal de preço (vendas concluídas) para
  fases futuras — fora do MVP.

**Rationale**: destrava US3/US8 sem bloquear no risco jurídico; a interface única permite trocar
ou compor fontes sem tocar o resto do app. A conversão PTAX é oficial, gratuita e auditável.

**Alternativas consideradas**: scraping direto da Liga (vetado sem autorização); TCGplayer API
direta (acesso fechado para novos desenvolvedores); Cardmarket (mercado europeu, EUR, menos
representativo para o Brasil).

## 3. Detecção de cartas por câmera — híbrido: detecção on-device + identificação no backend

**Decisão**: pipeline em duas etapas, priorizando a solução mais simples que atende o caso de uso:

1. **On-device (tempo real)**: `react-native-vision-camera` com frame processor para detectar o
   *retângulo* da carta no enquadramento (detecção de contorno/quadrilátero — leve, roda a 30 fps)
   → desenha as molduras (FR-021) e dispara a captura de um still recortado quando o retângulo
   está estável.
2. **Backend (identificação)**: o crop é enviado à API, que identifica a carta por **embedding de
   imagem + busca de vizinho mais próximo (pgvector)** sobre as imagens do catálogo; retorna o
   match com confiança + top-N alternativas (alimenta "capturada" vs. "a revisar", FR-022/FR-023).

**Rationale**: identificar ~20k cartas com modelo totalmente on-device exigiria treinar/embarcar
um modelo específico (complexo, contra a constituição II); enviar *stream* de frames ao backend é
caro e frágil em rede móvel. O híbrido manda apenas 1 imagem pequena por captura, mantém o
tempo-real (molduras) 100% local e coexiste com gravação e feedbacks. Foil/reflexo cai
naturalmente em "a revisar" quando a confiança do match é baixa (FR-060).

**[SPIKE — gravação da sessão]**: a gravação precisa capturar câmera + overlays (FR-062). Opções,
da mais simples à mais complexa: (a) gravação de tela nativa do SO limitada à view da sessão
(ReplayKit/MediaProjection via módulo Expo); (b) vision-camera + Skia frame processor gravando
frames compostos. Validar (a) primeiro; se degradar a detecção (FR-063), aplicar o comportamento
especificado: desativar gravação com aviso.

**Alternativas consideradas**: modelo on-device completo (CoreML/TFLite — mais complexo, atualização
de catálogo exige redistribuir modelo); APIs de visão genéricas (Google Vision/OCR — identificam
texto, não a arte/edição da carta, insuficiente para distinguir versões); serviços prontos de
identificação de cartas (avaliar caso o spike do pipeline próprio falhe).

## 4. Pagamentos do marketplace — Pagar.me (split nativo)

**Decisão**: **Pagar.me** (grupo Stone) como provedor, atrás da interface `PaymentProvider`:
recebedores (recipients) com KYC feito pelo provedor (clarificação de 2026-07-10), cobrança
Pix + cartão de crédito, **split com comissão da plataforma** na transação, liberação ao vendedor
controlada pelo fluxo de custódia do pedido (pago → enviado → recebido → liberado), reembolso via
API em disputas. Webhooks assinados atualizam o estado do pedido; toda mutação financeira grava
auditoria própria (constituição IV). Nunca processamos pagamento diretamente.

**Rationale**: a pesquisa aponta o Pagar.me como o gateway mais usado por marketplaces brasileiros
para split, com regras customizáveis, API de recipients (onboarding/KYC de vendedores) e suporte
pleno a Pix; o modelo split é inclusive a prática regulatória esperada para marketplaces no Brasil.

**Alternativas consideradas**: **Mercado Pago Split** (forte em Pix e marca conhecida; segunda
opção — a abstração `PaymentProvider` mantém a troca barata); **Stripe Connect** (excelente API,
mas cobertura de Pix/split e onboarding de vendedores PF no Brasil menos madura que os locais);
Asaas/PagBrasil (menos tração no perfil marketplace C2C).

## 5. Autenticação — Supabase Auth

**Decisão**: Supabase Auth como serviço gerenciado: e-mail/senha com verificação e recuperação
(FR-001) + login social Google e Apple (FR-002, clarificação). O backend valida os JWTs emitidos;
o app usa o SDK do Supabase apenas para o fluxo de auth.

**Rationale**: gerenciado (constituição II), nativo em Postgres (alinha com o stack), suporta os
dois provedores exigidos e Sign in with Apple. Evita dependência do ecossistema Firebase quando o
restante do stack não o usa.

**Alternativas consideradas**: Firebase Auth (maduro, mas adiciona um segundo ecossistema);
Auth0/Clerk (custo por MAU mais alto no perfil 10k usuários); auth próprio (vetado pela constituição).

## 6. Notificações push — Expo Notifications

**Decisão**: Expo Notifications (Expo Push Service) para as notificações de wishlist (FR-046),
disparadas pelo job de avaliação de alvo após cada ciclo de cotações; estado de rearme/intervalo
mínimo (FR-047) mantido no nosso banco (entidade Item de Wishlist).

**Rationale**: integração de menor atrito no workflow Expo (um serviço, iOS+Android), suficiente
para o volume (~10k usuários). A lógica anti-spam é nossa (dados no Postgres), o envio é do serviço.

**Alternativas consideradas**: FCM/APNs diretos (mais controle, mais manutenção); OneSignal
(recursos de marketing desnecessários no MVP).

## 7. Backend, jobs e infraestrutura

**Decisão**: Fastify + Prisma + Zod em Node 22/TypeScript; **pg_boss** para jobs agendados (sync
de catálogo, cotações diárias, snapshots, avaliação de wishlists, liberação automática/prazos do
marketplace) rodando no mesmo deploy da API; **um ambiente de produção** em PaaS (Railway ou
Render) com PostgreSQL gerenciado; deploy por push. Dinheiro sempre em **centavos inteiros**;
rotas financeiras exigem **chave de idempotência**; auditoria em tabela **append-only**.

**Rationale**: pilha estabelecida e enxuta (constituição II); pg_boss usa o próprio Postgres
(zero infra extra vs. Redis/filas); PaaS único atende ~10k usuários com folga e mantém o deploy
simples como pedido.

**Alternativas consideradas**: NestJS (mais cerimônia que o necessário); BullMQ+Redis (infra a
mais); cron do PaaS (menos observável que pg_boss); AWS direto (complexidade prematura).

## 8. Riscos registrados

| Risco | Mitigação |
|-------|-----------|
| pokemontcg.io descontinuar/degradar (foco da equipe migrou p/ Scrydex) | Sync local completo + `CatalogProvider` trocável (Scrydex/TCGdex) |
| Sem acordo com a Liga Pokémon para preços BR | Fallback USD+PTAX operante desde o dia 1, com rótulo de origem do preço |
| Identificação por embedding insuficiente p/ SC-006 (80%) | Spike no início da US5; alternativa: serviço pronto de identificação; scanner não bloqueia o resto (constituição III) |
| Gravação degradar detecção (FR-063) | Comportamento já especificado: desativar gravação com aviso; spike valida cedo |
| Latência de webhook do provedor de pagamento | Estados de pedido tolerantes a atraso + reconciliação periódica via job |

**Sources**: [pokemontcg.io](https://pokemontcg.io/) (aviso "Now part of Scrydex"),
[TCGdex — The Multilingual Pokemon TCG API](https://tcgdex.dev/),
[CardGrader — TCGplayer API Alternatives (2026)](https://cardgrader.ai/blog/tcgplayer-api-alternatives),
[LigaPokemon](https://www.ligapokemon.com.br/?view=newuser),
[Mercado Pago Developers — Split Payments](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/overview),
[Pagar.me — Marketplace: transação com split](https://pagarme.helpjuice.com/pt_BR/p2-funcionalidades/12marketplace-criando-uma-transa%C3%A7%C3%A3o-com-split),
[Asaas — Qual API oferece split de pagamentos?](https://blog.asaas.com/qual-api-oferece-split-de-pagamentos/),
[VisionCamera — docs](https://react-native-vision-camera.com/docs/guides/code-scanning).
