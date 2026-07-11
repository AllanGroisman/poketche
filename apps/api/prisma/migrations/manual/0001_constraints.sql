-- Constraints e índices que o Prisma schema não expressa.
-- Aplicar após `prisma migrate` (ou incorporar à migration gerada).

-- Extensões
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

-- card_price: unicidade tratando `condition` nula como valor único (PG16).
-- Substitui o índice único padrão gerado pelo Prisma por um NULLS NOT DISTINCT.
ALTER TABLE card_price
  DROP CONSTRAINT IF EXISTS "card_price_card_id_condition_variant_source_key";
CREATE UNIQUE INDEX IF NOT EXISTS card_price_unique_nnd
  ON card_price (card_id, condition, variant, source) NULLS NOT DISTINCT;

-- listing: anti-oversell (reservado + vendido nunca excede o total).
ALTER TABLE listing
  ADD CONSTRAINT listing_stock_check
  CHECK (quantity_reserved >= 0 AND quantity_sold >= 0
         AND quantity_reserved + quantity_sold <= quantity);

-- order: total = itens + frete; net = itens - comissão + frete (comissão só sobre itens).
ALTER TABLE "order"
  ADD CONSTRAINT order_totals_check
  CHECK (total_cents = items_total_cents + shipping_price_cents
         AND seller_net_cents = items_total_cents - commission_cents + shipping_price_cents);

-- review: nota entre 1 e 5.
ALTER TABLE review ADD CONSTRAINT review_stars_check CHECK (stars BETWEEN 1 AND 5);

-- financial_audit_log: append-only (FR-035). Revogar UPDATE/DELETE do papel da aplicação.
-- Ajustar o nome do role conforme o deploy (ex.: poketche_app).
REVOKE UPDATE, DELETE ON financial_audit_log FROM PUBLIC;
