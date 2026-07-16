-- Índices de apoio do explorador de catálogo (US10/T055, SC-021: busca com filtros < 1s).
-- Aplicar após `prisma migrate` (ou incorporar à migration gerada), como o 0001.
-- Idempotente: pode rodar de novo sem quebrar.

-- Grade da edição (FR-068) e ordenação do catálogo: `card.number` é texto vindo do provedor
-- ("2", "10", "SV49"), então a ordem de exibição é pelo prefixo numérico — uma expressão que o
-- Prisma não expressa no schema. Sem este índice a grade ordena com sort em memória.
CREATE INDEX IF NOT EXISTS card_set_number_num_idx
  ON card (set_id, (NULLIF(regexp_replace(number, '\D', '', 'g'), '')::int), number);

-- Lista de edições ordenada por lançamento (FR-068).
CREATE INDEX IF NOT EXISTS card_set_release_date_idx
  ON card_set (release_date DESC NULLS LAST);

-- Anúncios ativos de uma carta (FR-071): a listing não referencia a carta direto — o caminho é
-- card → collection_item → listing. O índice de `status` sozinho não sustenta o join.
CREATE INDEX IF NOT EXISTS listing_collection_item_status_idx
  ON listing (collection_item_id, status);
