-- Coleções personalizadas (feature 002): pastas nomeadas que recortam o inventário, mais o
-- vínculo M-N para `collection_item`. Não altera `collection_item` (só ganha a relação inversa).
-- Cascatas: excluir a pasta OU remover o item do inventário apaga o vínculo; nunca o contrário.

-- CreateTable
CREATE TABLE "collection" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "VisibilityStatus" NOT NULL DEFAULT 'private',
    "share_token" TEXT,
    "show_cards" BOOLEAN NOT NULL DEFAULT true,
    "show_values" BOOLEAN NOT NULL DEFAULT false,
    "show_quantities" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_membership" (
    "id" UUID NOT NULL,
    "collection_id" UUID NOT NULL,
    "collection_item_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_membership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "collection_share_token_key" ON "collection"("share_token");

-- CreateIndex
CREATE INDEX "collection_user_id_idx" ON "collection"("user_id");

-- CreateIndex
CREATE INDEX "collection_membership_collection_item_id_idx" ON "collection_membership"("collection_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "collection_membership_collection_id_collection_item_id_key" ON "collection_membership"("collection_id", "collection_item_id");

-- AddForeignKey
ALTER TABLE "collection" ADD CONSTRAINT "collection_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_membership" ADD CONSTRAINT "collection_membership_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_membership" ADD CONSTRAINT "collection_membership_collection_item_id_fkey" FOREIGN KEY ("collection_item_id") REFERENCES "collection_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
