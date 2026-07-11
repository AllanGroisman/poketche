# Research: PokeTche — Decisões técnicas (Phase 0)

**Date**: 2026-07-10 | **Plan**: [plan.md](./plan.md)

Cada item segue: Decisão → Rationale → Alternativas consideradas. Itens marcados **[SPIKE]**
têm decisão condicionada a validação prática no início da implementação da story correspondente.

## 1. Catálogo de cartas — multilíngue desde o início (pokemontcg.io EN + TCGdex PT)

**Decisão**: o modelo de dados do catálogo é **multilíngue por construção**: a carta canônica
(edição, número, raridade, tipos) tem **traduções por idioma** (nome e imagens localizados),
populadas em **inglês e português** no MVP. Fontes compostas atrás do `CatalogProvider`:

- **pokemontcg.io** (mandato original): base canônica + dados/imagens em inglês;
- **TCGdex** (open source, multilíngue): nomes e imagens em **português**, casados à carta
  canônica por set/número — a pesquisa confirma que o TCGdex mantém dados localizados PT com os
  mesmos IDs de carta entre idiomas, com completude variável conforme o que foi lançado
  oficialmente em cada idioma.

Sync completo para o PostgreSQL via job agendado (o app nunca consulta as fontes em tempo de
requisição). **Imagens**: com o Explorador de Catálogo (US10), a navegação pública expõe imagens
de cartas que nenhum usuário possui — hotlink direto das fontes não escala nem é cortês com APIs
gratuitas. Decisão: **proxy de imagens com cache próprio** (object storage + cache HTTP longo),
populado por job de **backfill priorizado**: 1º thumbnails das edições mais recentes/populares
(a grade da edição é o caso mais sensível de volume), 2º cartas em coleções/wishlists/anúncios,
3º restante; imagem fria é buscada on-demand na fonte e persistida. Tradução PT ausente →
exibição cai no fallback universal EN (FR-011); autocomplete e busca do explorador consultam os
nomes de **todos os idiomas** (usuário digita "Pikachu" ou o nome PT).

**Rationale**: suportar PT/EN por carta desde o início evita migração dolorosa depois (o idioma
já é atributo do item da coleção e o scanner identifica idioma — FR-067); compor duas fontes
gratuitas/estabelecidas atrás de uma interface única cumpre a constituição V. Risco do
pokemontcg.io (equipe migrou o foco para o Scrydex) mitigado pelo sync local + fonte trocável.

**Alternativas consideradas**: **Scrydex** (sucessor comercial, inclui preços — candidato se
pokemontcg.io degradar); **TCGdex como fonte única** (cobre PT nativamente, mas menos
estabelecida como base canônica e sem preços — adotada como fonte complementar de localização);
PokéWallet (menos estabelecido); traduzir nomes por conta própria (vetado — dado oficial existe).

## 2. Preços em BRL — Liga Pokémon primária + fallback internacional por carta

**Decisão**: camada `PriceProvider` isolada (constituição V) com cotações cacheadas em Postgres
e snapshots por carta (FR-037), atualizadas em **dois níveis**:

- **Ciclo diário (conjunto prioritário)**: cartas presentes em coleções, wishlists e anúncios
  ativos + edições recentes/populares — mesma priorização do backfill de imagens (um único
  critério de "quente" para imagens e preços).
- **Ciclo semanal rotativo (cauda)**: o restante do catálogo, fatiado ao longo da semana de modo
  que toda carta tenha cotação com no máximo 7 dias.

**Fonte primária: Liga Pokémon** (reais, mercado brasileiro); **fallback por carta**: fonte
internacional em USD com conversão cambial diária, usado quando a carta não tem preço na
primária **ou** quando a coleta falha. Toda cotação carrega **fonte e data**, exibidas ao
usuário (FR-012/FR-013).

**Fonte primária — Liga Pokémon (sem API pública). [SPIKE — viabilidade em duas frentes]:**

- **Legal**: revisar os termos de uso da LigaPokemon/LigaMagic (a pesquisa não localizou
  autorização expressa nem proibição pública de coleta) e **contatar a Liga para acesso
  autorizado/parceria** como caminho preferencial. Coleta sem esse parecer não entra em produção
  — risco contratual e concorrencial (a Liga é concorrente indireta do nosso marketplace).
- **Técnica** (condicionada à legal): coleta **estruturada e isolada** no adapter
  `LigaPriceCollector` — o modelo em dois níveis reduz drasticamente o volume diário: só o
  conjunto prioritário (ordem de poucos milhares de cartas em vez de ~20k) é coletado por dia,
  fora de pico, com rate-limit próprio e headers identificáveis; a cauda entra na rotação
  semanal diluída. Parsing resiliente a mudanças de HTML (seletores centralizados, testes de
  contrato com fixtures das páginas, validação de sanidade dos valores extraídos — variação
  brusca > X% marca a cotação como suspeita em vez de publicar) e **alerta + fallback automático**
  quando a estrutura mudar: o ciclo continua com a fonte internacional sem intervenção.

**Fallback internacional (funcional desde o dia 1)**: preços USD — avaliar na implementação:
TCGplayer API direta (acesso restrito a parceiros aprovados; solicitar), agregadores com preços
TCGplayer (Scrydex; a própria pokemontcg.io expõe blocos de preço TCGplayer nas cartas) —
convertidos a BRL pela **PTAX** (API pública do Banco Central), atualizada diariamente. O rótulo
de fonte deixa claro que é referência internacional convertida.

O marketplace próprio, quando ativo, gera um terceiro sinal de preço (vendas concluídas) para
fases futuras — fora do MVP.

**Rationale**: prioriza o preço que o colecionador brasileiro reconhece, sem bloquear US3/US8 no
risco jurídico (fallback operante primeiro); resolução por carta maximiza cobertura; a interface
única + coletor isolado permitem trocar/compor fontes sem tocar o resto do app.

**Alternativas consideradas**: coleta da Liga sem parecer legal (vetada); TCGplayer API direta
como primária (fechada a novos devs e em USD); Cardmarket (EUR, mercado europeu, pouco
representativo do Brasil); depender só do marketplace próprio (sem liquidez no início).

## 3. Detecção de cartas por câmera — OCR-first com fallback visual, atrás de interface trocável

**Decisão**: molduras em tempo real ficam **on-device** (`react-native-vision-camera` + frame
processor detectando o retângulo/quadrilátero da carta a ~30 fps — FR-021); quando o retângulo
está estável, um still recortado alimenta o pipeline de **identificação em duas etapas**:

1. **OCR-first**: extrair do crop o **nome** e o **número da carta** (ex.: "025/165") — juntos
   identificam a carta **unicamente** no catálogo e o texto revela o **idioma** (PT/EN, FR-067).
   OCR on-device é viável e barato (ML Kit reconhece texto offline em fração de segundo).
2. **Fallback visual**: se o OCR não resolver com confiança (texto ilegível, foil, reflexo),
   **matching da imagem** contra as artes do catálogo — começar por **perceptual hashing**
   (phash/dhash, barato e sem GPU) e evoluir para **embeddings + pgvector** só se a precisão do
   hashing for insuficiente. Match abaixo do limiar → "a revisar" com top-N (FR-023/FR-060).

**Arquitetura**: a identificação fica atrás da interface **`CardIdentifier`**
(`identify(crop) → {card, language, confidence, candidates[], method}`), consumida pelo fluxo de
sessões — trocar OCR↔matching, on-device↔backend ou fornecedor **não toca** sessões, molduras,
feedbacks ou gravação (constituição V aplicada internamente).

**[SPIKE — comparativo antes de fixar]** on-device vs. backend para cada etapa, medindo
latência (SC-006a ≤ 2 s), custo, precisão (SC-006 ≥ 80%) e funcionamento offline:

| Opção                                 | Prós                                                  | Contras                                                                                              |
| ------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| OCR on-device (ML Kit) + lookup local | Rápido, offline, sem custo por captura                | Requer o **índice de identificação distribuído** (ver abaixo) — componente novo a construir e manter |
| OCR no backend                        | Um só lugar para evoluir; sem índice no app           | Latência de rede em cada captura, custo                                                              |
| phash on-device                       | Offline total, projetos existentes provam viabilidade | Também requer o índice distribuído (hashes); robustez a iluminação varia                             |
| Embeddings no backend (pgvector)      | Maior precisão em casos difíceis                      | Rede + infraestrutura de embedding; só se hashing falhar                                             |

**Custo estrutural da opção on-device — índice de identificação distribuído**: o sync atual é
apenas fonte→Postgres; identificar no aparelho exige um artefato **gerado no backend a partir do
catálogo sincronizado** — índice compacto de `nome+número+idioma` (lookup do OCR) e perceptual
hashes por tradução/variante (fallback visual) — com **mecanismo de download e atualização
versionado no app** (novo set publicado → índice incrementado). É um componente adicional de
build, distribuição e compatibilidade que a opção backend não tem; entra na balança do spike
como custo fixo da via on-device.

**Casos obrigatórios na validação do spike** (além de cartas comuns PT/EN, foil e duplicatas):

- **Promos com numeração fora do padrão** (ex.: "SWSH001", numeração sem "NNN/MMM") — o parse de
  número do OCR não pode assumir o formato `NNN/MMM`;
- **Sets antigos com layout diferente** (posição/tipografia do nome e número mudam entre eras) —
  as regiões de OCR não podem ser fixas por template único;
- **Variantes que compartilham número** (reverse foil vs. normal): mesma carta canônica e mesmo
  `(set, number)`, preços distintos — o OCR sozinho **não distingue** variantes; a distinção é
  visual (brilho/padrão) ou manual na revisão.

**Representação de variantes (modelo de dados + CardIdentifier)**: a carta canônica permanece
única por `(set, number)`; a **variante** (normal, reverse foil, holo…) é uma dimensão dos
registros que dependem dela — item da coleção, cotação/snapshot de preço e anúncio. O
`CardIdentifier` retorna `variant` com default `normal` e confiança própria: quando não
determinável automaticamente, a captura entra com `normal` e a variante é ajustável na tela de
revisão (mesmo padrão do idioma indeterminado, FR-067).

**Projetos existentes a estudar antes de construir do zero** (aprendizado/reuso de técnica):
pokemon-card-recognizer (reconhecimento em imagem/vídeo), Pokemon-Card-Scanner e
PokeCard-TCG-detector (OpenCV + ImageHash: phash/dhash/whash contra imagens do catálogo),
pokemon-scanner (OpenCV + Tesseract OCR + Pokémon TCG API). Nenhum é produto pronto para RN,
mas validam o pipeline OCR+hash e fornecem referência de parâmetros.

**Rationale**: OCR de nome+número é a rota mais simples e certeira (identificador único + idioma
de graça, sem treinar modelo); o fallback visual cobre o que o OCR não lê; tudo o que roda por
captura é 1 imagem pequena — compatível com scanner contínuo, molduras, feedbacks e gravação
simultâneos. Foil/reflexo cai naturalmente em "a revisar" (FR-060).

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
auditoria própria (constituição IV). Nunca processamos pagamento diretamente. Envio sem
integração de transportadoras no MVP: vendedor informa transportadora + rastreio e a liberação
automática conta da postagem; **evolução futura registrada**: integração com APIs de rastreio
(Correios/agregadores) para detectar a entrega automaticamente e encurtar a liberação.

**Rationale**: a pesquisa aponta o Pagar.me como o gateway mais usado por marketplaces brasileiros
para split, com regras customizáveis, API de recipients (onboarding/KYC de vendedores) e suporte
pleno a Pix; o modelo split é inclusive a prática regulatória esperada para marketplaces no Brasil.

**[SPIKE — custódia, obrigatório antes de iniciar a US6]**: validar em sandbox que o fluxo
`pago → enviado → recebido → liberado` é implementável com recipients do Pagar.me — em
particular: (a) reter o valor na plataforma após a captura **sem** repasse automático imediato ao
recebedor; (b) liberar ao vendedor (menos comissão) apenas por comando nosso na confirmação de
recebimento/prazo; (c) reembolsar integralmente durante disputa após a retenção; (d) prazos
máximos de retenção permitidos pelo provedor compatíveis com nossos prazos (5 dias úteis de envio

- 21 dias corridos pós-postagem — sem integração de rastreio, a liberação automática conta da
  postagem, não da entrega); (e) **frete no split**: o valor retido é o total (item + frete) e a
  comissão incide só sobre o item — validar regra de split com frete 100% ao vendedor na liberação
  e reembolso do total (item + frete) ao comprador; (f) **checkout multi-vendedor** (clarificação
  de 2026-07-11): uma cobrança única com split para múltiplos recebedores (um pedido por vendedor)
  e **reembolso parcial** dessa cobrança — necessário tanto para o cancelamento livre do comprador
  antes do envio quanto para disputa de um pedido do grupo sem afetar os demais. Se a cobrança
  única multi-recebedor não for viável, plano B: uma cobrança por pedido no mesmo checkout (pior
  UX no Pix — múltiplos QRs — mas mesmo contrato). Se o split nativo não suportar liberação controlada, avaliar
  o modo alternativo do próprio provedor (recebimento na conta da plataforma + transferência via
  API) ou o Mercado Pago — a decisão do provedor só é definitiva após este spike.

**Administração de disputas no MVP**: quem opera é a **equipe da plataforma** (operação humana,
como assumido na spec), através de um **back-office mínimo**: endpoints `/admin/*` na própria API
(módulo `modules/admin/`), protegidos por papel `admin` (claim no Supabase Auth), com uma tela
web interna simples servida pela API — fila de disputas abertas, evidências das partes, decisão
(reembolsar comprador | liberar vendedor) que executa a ação financeira via `PaymentProvider` e
grava auditoria. Sem ferramenta externa nem app mobile para admin no MVP. **Ator administrador
especificado na spec** (addendum de 2026-07-11): US11 com fila, detalhes/evidências, solicitação
de informações às partes (prazo 3d), decisão (refund total item+frete | liberação do net) com
auditoria e `resolved_by`, impedimento por conflito de interesse (FR-078–FR-081) e prazos-alvo
da operação (1ª resposta 1 dia útil, resolução 7d — SC-022/SC-023); a lacuna anteriormente
apontada aqui e no plan.md está resolvida.

**Alternativas consideradas**: **Mercado Pago Split** (forte em Pix e marca conhecida; segunda
opção — a abstração `PaymentProvider` mantém a troca barata); **Stripe Connect** (excelente API,
mas cobertura de Pix/split e onboarding de vendedores PF no Brasil menos madura que os locais);
Asaas/PagBrasil (menos tração no perfil marketplace C2C); para o admin: ferramenta low-code
externa (Retool e similares — dependência e custo extra para uma fila simples) e decisão direto
no banco (vetada — sem trilha de auditoria nem controle de acesso).

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
de catálogo, backfill de imagens, cotações em dois níveis, snapshots, avaliação de wishlists,
liberação automática/prazos do marketplace) rodando no mesmo deploy da API; **um ambiente de
produção** em PaaS (Railway ou Render) com PostgreSQL gerenciado; deploy por push. **Object
storage para o cache de imagens: Cloudflare R2** — Railway/Render não têm object storage nativo,
e o R2 tem egress gratuito (imagens de catálogo são exatamente o perfil de tráfego de saída
alto); alternativa: AWS S3 + CloudFront (mais peças e custo de egress). Dinheiro sempre em **centavos inteiros**;
rotas financeiras exigem **chave de idempotência**; auditoria em tabela **append-only**.

**Rationale**: pilha estabelecida e enxuta (constituição II); pg_boss usa o próprio Postgres
(zero infra extra vs. Redis/filas); PaaS único atende ~10k usuários com folga e mantém o deploy
simples como pedido.

**Alternativas consideradas**: NestJS (mais cerimônia que o necessário); BullMQ+Redis (infra a
mais); cron do PaaS (menos observável que pg_boss); AWS direto (complexidade prematura).

## 8. Riscos registrados

| Risco                                                                                                                         | Mitigação                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pokemontcg.io descontinuar/degradar (foco da equipe migrou p/ Scrydex)                                                        | Sync local completo + `CatalogProvider` trocável (Scrydex/TCGdex)                                                                                                                                                                                                                                                                                  |
| Cobertura parcial de PT no TCGdex (edições sem lançamento oficial em português)                                               | Fallback universal EN por carta (FR-011); medir cobertura real no job de sync                                                                                                                                                                                                                                                                      |
| Sem acordo com a Liga Pokémon para preços BR                                                                                  | Fallback USD+PTAX operante desde o dia 1, com rótulo de fonte/data no preço                                                                                                                                                                                                                                                                        |
| Coleta da Liga quebrar por mudança de HTML                                                                                    | Parser isolado com testes de contrato/fixtures, validação de sanidade, alerta + fallback automático para a fonte internacional                                                                                                                                                                                                                     |
| **Propriedade intelectual das imagens re-hospedadas** — as artes das cartas são IP da The Pokémon Company e o app é comercial | Incluir no **mesmo parecer legal** previsto para a coleta da Liga: verificar os termos do pokemontcg.io e do TCGdex sobre redistribuição/cache de imagens; enquanto pendente, o proxy opera como cache técnico com atribuição de origem, e o plano B é servir hotlink das fontes com cache HTTP curto (degrada custo/latência, não funcionalidade) |
| Custódia (retenção + liberação controlada) não suportada como assumido pelo split do Pagar.me                                 | Spike obrigatório em sandbox antes da US6 (research §4); alternativas: modo conta-da-plataforma + transferência via API, ou Mercado Pago — troca barata via `PaymentProvider`                                                                                                                                                                      |
| Pipeline OCR+hash insuficiente p/ SC-006 (80%) ou SC-006a (2 s)                                                               | Spike comparativo no início da US5; `CardIdentifier` trocável permite escalar para embeddings/serviço pronto sem tocar o fluxo de sessões; scanner não bloqueia o resto (constituição III)                                                                                                                                                         |
| Gravação degradar detecção (FR-063)                                                                                           | Comportamento já especificado: desativar gravação com aviso; spike valida cedo                                                                                                                                                                                                                                                                     |
| Latência de webhook do provedor de pagamento                                                                                  | Estados de pedido tolerantes a atraso + reconciliação periódica via job                                                                                                                                                                                                                                                                            |

**Sources**: [pokemontcg.io](https://pokemontcg.io/) (aviso "Now part of Scrydex"),
[TCGdex — The Multilingual Pokemon TCG API](https://tcgdex.dev/) e
[TCGdex — Searching for cards](https://tcgdex.dev/rest/cards) (dados/imagens localizados, PT
entre os idiomas suportados),
[pokemon-card-recognizer](https://github.com/prateekt/pokemon-card-recognizer),
[Pokemon-Card-Scanner (ImageHash)](https://github.com/NolanAmblard/Pokemon-Card-Scanner),
[PokeCard-TCG-detector (OpenCV + imagehash)](https://github.com/em4go/PokeCard-TCG-detector),
[pokemon-scanner (OpenCV + Tesseract + TCG API)](https://github.com/t-sinclair2500/pokemon-scanner),
[CardGrader — TCGplayer API Alternatives (2026)](https://cardgrader.ai/blog/tcgplayer-api-alternatives),
[LigaPokemon](https://www.ligapokemon.com.br/?view=newuser),
[Mercado Pago Developers — Split Payments](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/overview),
[Pagar.me — Marketplace: transação com split](https://pagarme.helpjuice.com/pt_BR/p2-funcionalidades/12marketplace-criando-uma-transa%C3%A7%C3%A3o-com-split),
[Asaas — Qual API oferece split de pagamentos?](https://blog.asaas.com/qual-api-oferece-split-de-pagamentos/),
[VisionCamera — docs](https://react-native-vision-camera.com/docs/guides/code-scanning).
