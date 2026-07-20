-- Relaxa a unicidade de (set_id, number): sets especiais (Celebrations Classic Collection,
-- Black Bolt) reusam o mesmo `number` dentro do set na pokemontcg.io. A identidade real da
-- carta é `external_id` (que permanece @unique). Troca o índice UNIQUE por um índice comum.
DROP INDEX "card_set_id_number_key";
CREATE INDEX "card_set_id_number_idx" ON "card"("set_id", "number");
