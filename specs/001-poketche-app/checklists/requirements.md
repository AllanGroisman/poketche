# Specification Quality Checklist: PokeTche — App de Coleção e Marketplace de Pokémon TCG

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-10
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — o marcador de FR-060 (foil/
  reflexos) foi resolvido na sessão de clarificação de 2026-07-10
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Validação executada em 2026-07-10: todos os itens passaram na primeira iteração.
- Revalidação em 2026-07-10 após adição da US7 (acesso de visitante não autenticado),
  FR-003a/b/c, FR-026a, SC-012/SC-013 e entidades Visitante/Configuração de
  Visibilidade: todos os itens continuam passando.
- Lacunas da descrição original foram resolvidas como Assumptions explícitas
  (comissão configurável, prazos de liberação/envio, escala de condição, fontes
  externas de catálogo e preços) em vez de marcadores de clarificação.
- Revalidação em 2026-07-10 após adição da US8 (estatísticas e histórico de valor
  por carta), FR-037–FR-043, FR-020a, preço de aquisição opcional (FR-008/FR-010),
  histórico no detalhe de anúncios (US6), rankings derivados no dashboard (US4),
  SC-014–SC-016 e entidade Snapshot de Preço da Carta: todos os itens continuam
  passando.
- Revalidação em 2026-07-10 após adição da US9 (wishlists com preço-alvo),
  FR-044–FR-052, FR-026a estendido (wishlist exige conta), SC-017–SC-019,
  entidades Wishlist/Item de Wishlist e edge cases de notificação (rearme,
  intervalo mínimo, permissão negada, fonte indisponível): todos os itens
  continuam passando.
- Revalidação em 2026-07-10 após expansão da US5 (sessões de escaneamento):
  15 cenários, FR-021–FR-023 reescritos, FR-053–FR-060 adicionados, entidade
  Sessão de Escaneamento, SC-006a–SC-006c e assumptions de duplicatas/tiers de
  raridade/limiar de valor/sessão pendente única. Todos os itens passam, exceto
  o marcador intencional em FR-060 (acima).
- Revalidação em 2026-07-10 após adição de escolha de câmera e gravação/
  compartilhamento de sessão à US5: cenários 15–21 (caminho alternativo
  renumerado para 22), FR-061–FR-066, entidade Gravação de Sessão, SC-006d/
  SC-006e e edge cases de armazenamento/permissão de galeria/vídeo parcial.
  Todos os itens passam, exceto o marcador intencional em FR-060 (acima).
- Sessão de clarificação executada em 2026-07-10 (5 perguntas): FR-060 resolvido
  (foil = melhor esforço → "a revisar"), pagamentos Pix + cartão (FR-027), login
  social Google + Apple (FR-002), KYC delegado ao provedor de pagamentos (FR-004,
  entidade Perfil de Vendedor) e escala ~10k usuários (Assumptions). Checklist
  100% aprovado. Pronto para `/speckit-plan`.
- Atualização em 2026-07-11 (revisão do data model): ciclo de vida estoque×anúncio×
  pedido (compra parcial, reserva atômica, snapshot no pedido), evidências de
  disputa em bucket privado, upsert/unique de card_price e regra de variante no
  alvo de wishlist; 3 assumptions novas na spec. 16/16 itens seguem passando.
- Atualização em 2026-07-11 (revisão do plano): FR-013/SC-004/SC-016 ajustados
  para cotações em dois níveis (diário prioritário + semanal rotativo). Lacuna
  apontada (plan.md): a spec não especifica o ator administrador de disputas —
  addendum recomendado antes da US6. 16/16 itens seguem passando.
- Atualização em 2026-07-11: US10 (Explorador de Catálogo, P3) com 8 cenários,
  FR-068–FR-072, FR-026a estendido (ações do catálogo), SC-020/SC-021, logo/data
  na entidade Edição, edge cases de catálogo e assumptions; propagado a
  data-model.md (logo_url), contracts/rest-api.md (busca unificada com filtros,
  grade/completude da edição, anúncios por carta) e quickstart.md. 16/16 itens ok.
- Atualização em 2026-07-11 (definições técnicas): catálogo multilíngue por carta
  (card_translation EN+PT), preços com Liga Pokémon primária + fallback internacional
  por carta com fonte/data exibidas (FR-012 estendido), pipeline de identificação
  OCR-first + matching visual atrás de interface trocável; propagado a plan.md,
  research.md, data-model.md, contracts/rest-api.md e quickstart.md. 16/16 itens ok.
- Atualização em 2026-07-11: identificação automática de idioma no scanner (FR-067,
  cenários 6–7 da US5, SC-006f) e imagens correspondentes ao idioma com fallback EN
  (FR-011 estendido); propagado a data-model.md, contracts/rest-api.md e research.md.
  Todos os 16 itens continuam passando.
- Review final item a item em 2026-07-10: 16/16 itens atendidos e marcados.
  Observações (não bloqueantes): menções a Google/Apple e Pix/cartão são
  restrições de negócio/compliance definidas em clarificação, não detalhes de
  implementação; US4 (dashboard) é a story com cobertura mais fraca em Success
  Criteria dedicados (apoia-se em SC-011/SC-014/SC-015) — considerar um SC
  próprio se o dashboard virar foco de release.
