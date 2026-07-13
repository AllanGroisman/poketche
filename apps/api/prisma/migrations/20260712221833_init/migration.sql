-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('en', 'pt');

-- CreateEnum
CREATE TYPE "TranslationSource" AS ENUM ('pokemontcgio', 'tcgdex');

-- CreateEnum
CREATE TYPE "Condition" AS ENUM ('mint', 'near_mint', 'excellent', 'good', 'played', 'damaged');

-- CreateEnum
CREATE TYPE "Variant" AS ENUM ('normal', 'reverse_foil', 'holo');

-- CreateEnum
CREATE TYPE "CameraPref" AS ENUM ('back', 'front');

-- CreateEnum
CREATE TYPE "VisibilityStatus" AS ENUM ('private', 'public_link');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "PriceSource" AS ENUM ('liga_pokemon', 'intl_usd_fx');

-- CreateEnum
CREATE TYPE "WishlistAlertState" AS ENUM ('armed', 'notified');

-- CreateEnum
CREATE TYPE "ScanSessionStatus" AS ENUM ('active', 'pending', 'confirmed', 'discarded');

-- CreateEnum
CREATE TYPE "ScanCaptureStatus" AS ENUM ('identified', 'needs_review');

-- CreateEnum
CREATE TYPE "IdentificationMethod" AS ENUM ('ocr', 'visual_match', 'manual');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('active', 'sold', 'deactivated');

-- CreateEnum
CREATE TYPE "CheckoutStatus" AS ENUM ('pending_payment', 'paid', 'failed', 'expired');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending_payment', 'paid', 'shipped', 'received', 'released', 'cancelled', 'disputed', 'refunded');

-- CreateEnum
CREATE TYPE "Carrier" AS ENUM ('correios', 'jadlog', 'loggi', 'other');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('pix', 'credit_card');

-- CreateEnum
CREATE TYPE "DisputeReason" AS ENUM ('not_received', 'not_as_described');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('open', 'awaiting_parties', 'resolved_buyer', 'resolved_seller');

-- CreateEnum
CREATE TYPE "AuditActor" AS ENUM ('user', 'system', 'webhook');

-- CreateTable
CREATE TABLE "card_set" (
    "id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "total_cards" INTEGER NOT NULL,
    "release_date" DATE,
    "logo_url" TEXT,
    "synced_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "card_set_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card" (
    "id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "set_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "supertype" TEXT NOT NULL,
    "subtypes" TEXT[],
    "types" TEXT[],
    "synced_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_translation" (
    "id" UUID NOT NULL,
    "card_id" UUID NOT NULL,
    "language" "Language" NOT NULL,
    "name" TEXT NOT NULL,
    "image_small_url" TEXT NOT NULL,
    "image_large_url" TEXT NOT NULL,
    "image_hash" TEXT,
    "image_embedding" vector,
    "source" "TranslationSource" NOT NULL,
    "synced_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_translation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profile" (
    "id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
    "wishlist_auto_remove" BOOLEAN NOT NULL DEFAULT false,
    "scanner_sounds_enabled" BOOLEAN NOT NULL DEFAULT true,
    "preferred_camera" "CameraPref" NOT NULL DEFAULT 'back',
    "buyer_rating_avg" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "buyer_rating_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_visibility" (
    "user_id" UUID NOT NULL,
    "status" "VisibilityStatus" NOT NULL DEFAULT 'private',
    "share_token" TEXT,
    "show_cards" BOOLEAN NOT NULL DEFAULT true,
    "show_values" BOOLEAN NOT NULL DEFAULT false,
    "show_quantities" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "collection_visibility_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "seller_profile" (
    "user_id" UUID NOT NULL,
    "provider_recipient_id" TEXT,
    "kyc_status" "KycStatus" NOT NULL DEFAULT 'pending',
    "rating_avg" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "seller_profile_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_address" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "label" TEXT,
    "recipient_name" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "complement" TEXT,
    "district" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zip_code" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_item" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "card_id" UUID NOT NULL,
    "condition" "Condition" NOT NULL,
    "language" "Language" NOT NULL,
    "variant" "Variant" NOT NULL DEFAULT 'normal',
    "quantity" INTEGER NOT NULL,
    "acquisition_price_cents" INTEGER,
    "added_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "collection_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_price" (
    "id" UUID NOT NULL,
    "card_id" UUID NOT NULL,
    "condition" "Condition",
    "variant" "Variant" NOT NULL DEFAULT 'normal',
    "price_cents" INTEGER NOT NULL,
    "source" "PriceSource" NOT NULL,
    "fx_rate" DECIMAL(10,4),
    "fetched_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_price_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_price_snapshot" (
    "id" UUID NOT NULL,
    "card_id" UUID NOT NULL,
    "condition" "Condition",
    "variant" "Variant" NOT NULL DEFAULT 'normal',
    "price_cents" INTEGER NOT NULL,
    "source" "PriceSource" NOT NULL,
    "fx_rate" DECIMAL(10,4),
    "fetched_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "card_price_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_value_snapshot" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "priced_items" INTEGER NOT NULL,
    "unpriced_items" INTEGER NOT NULL,
    "taken_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_value_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlist" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "wishlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlist_item" (
    "id" UUID NOT NULL,
    "wishlist_id" UUID NOT NULL,
    "card_id" UUID NOT NULL,
    "target_price_cents" INTEGER,
    "alert_state" "WishlistAlertState" NOT NULL DEFAULT 'armed',
    "last_notified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wishlist_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_session" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "ScanSessionStatus" NOT NULL DEFAULT 'active',
    "camera" "CameraPref" NOT NULL DEFAULT 'back',
    "recorded" BOOLEAN NOT NULL DEFAULT false,
    "confirmed_at" TIMESTAMPTZ,
    "discarded_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "scan_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_capture" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "card_id" UUID,
    "status" "ScanCaptureStatus" NOT NULL,
    "candidates" JSONB NOT NULL DEFAULT '[]',
    "condition" "Condition",
    "language" "Language",
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "language_detected" BOOLEAN NOT NULL DEFAULT false,
    "variant" "Variant" NOT NULL DEFAULT 'normal',
    "identification_method" "IdentificationMethod" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scan_capture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing" (
    "id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "collection_item_id" UUID NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "shipping_price_cents" INTEGER NOT NULL DEFAULT 0,
    "condition" "Condition" NOT NULL,
    "language" "Language" NOT NULL,
    "variant" "Variant" NOT NULL DEFAULT 'normal',
    "quantity" INTEGER NOT NULL,
    "quantity_reserved" INTEGER NOT NULL DEFAULT 0,
    "quantity_sold" INTEGER NOT NULL DEFAULT 0,
    "status" "ListingStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_item" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "added_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cart_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkout" (
    "id" UUID NOT NULL,
    "buyer_id" UUID NOT NULL,
    "status" "CheckoutStatus" NOT NULL DEFAULT 'pending_payment',
    "total_cents" INTEGER NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "provider_charge_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "checkout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order" (
    "id" UUID NOT NULL,
    "checkout_id" UUID NOT NULL,
    "buyer_id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'pending_payment',
    "items_total_cents" INTEGER NOT NULL,
    "shipping_price_cents" INTEGER NOT NULL DEFAULT 0,
    "total_cents" INTEGER NOT NULL,
    "commission_cents" INTEGER NOT NULL,
    "seller_net_cents" INTEGER NOT NULL,
    "commission_pct" DECIMAL(5,4) NOT NULL,
    "shipping_address" JSONB NOT NULL,
    "carrier" "Carrier",
    "carrier_name" TEXT,
    "tracking_code" TEXT,
    "paid_at" TIMESTAMPTZ,
    "shipped_at" TIMESTAMPTZ,
    "received_at" TIMESTAMPTZ,
    "released_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "card_id" UUID NOT NULL,
    "condition" "Condition" NOT NULL,
    "language" "Language" NOT NULL,
    "variant" "Variant" NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    "line_total_cents" INTEGER NOT NULL,

    CONSTRAINT "order_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispute" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "opened_by" UUID NOT NULL,
    "reason" "DisputeReason" NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'open',
    "info_request_note" TEXT,
    "info_requested_at" TIMESTAMPTZ,
    "info_response_deadline" TIMESTAMPTZ,
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ,
    "resolution_notes" TEXT,
    "opened_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispute_evidence" (
    "id" UUID NOT NULL,
    "dispute_id" UUID NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "object_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispute_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "rater_id" UUID NOT NULL,
    "rated_id" UUID NOT NULL,
    "stars" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_audit_log" (
    "id" BIGSERIAL NOT NULL,
    "order_id" UUID,
    "actor" "AuditActor" NOT NULL,
    "action" TEXT NOT NULL,
    "amount_cents" INTEGER,
    "state_before" TEXT,
    "state_after" TEXT,
    "provider_event_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_token" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "expo_token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "card_set_external_id_key" ON "card_set"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "card_external_id_key" ON "card"("external_id");

-- CreateIndex
CREATE INDEX "card_rarity_idx" ON "card"("rarity");

-- CreateIndex
CREATE INDEX "card_types_idx" ON "card" USING GIN ("types");

-- CreateIndex
CREATE UNIQUE INDEX "card_set_id_number_key" ON "card"("set_id", "number");

-- CreateIndex
CREATE INDEX "card_translation_name_idx" ON "card_translation" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "card_translation_card_id_language_key" ON "card_translation"("card_id", "language");

-- CreateIndex
CREATE UNIQUE INDEX "collection_visibility_share_token_key" ON "collection_visibility"("share_token");

-- CreateIndex
CREATE INDEX "user_address_user_id_idx" ON "user_address"("user_id");

-- CreateIndex
CREATE INDEX "collection_item_user_id_idx" ON "collection_item"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "collection_item_user_id_card_id_condition_language_variant_key" ON "collection_item"("user_id", "card_id", "condition", "language", "variant");

-- CreateIndex
CREATE INDEX "card_price_card_id_price_cents_idx" ON "card_price"("card_id", "price_cents");

-- CreateIndex
CREATE UNIQUE INDEX "card_price_card_id_condition_variant_source_key" ON "card_price"("card_id", "condition", "variant", "source");

-- CreateIndex
CREATE INDEX "card_price_snapshot_card_id_fetched_at_idx" ON "card_price_snapshot"("card_id", "fetched_at");

-- CreateIndex
CREATE INDEX "collection_value_snapshot_user_id_taken_at_idx" ON "collection_value_snapshot"("user_id", "taken_at");

-- CreateIndex
CREATE INDEX "wishlist_user_id_idx" ON "wishlist"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "wishlist_item_wishlist_id_card_id_key" ON "wishlist_item"("wishlist_id", "card_id");

-- CreateIndex
CREATE INDEX "scan_session_user_id_status_idx" ON "scan_session"("user_id", "status");

-- CreateIndex
CREATE INDEX "scan_capture_session_id_idx" ON "scan_capture"("session_id");

-- CreateIndex
CREATE INDEX "listing_status_idx" ON "listing"("status");

-- CreateIndex
CREATE UNIQUE INDEX "cart_item_user_id_listing_id_key" ON "cart_item"("user_id", "listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "checkout_idempotency_key_key" ON "checkout"("idempotency_key");

-- CreateIndex
CREATE INDEX "order_buyer_id_idx" ON "order"("buyer_id");

-- CreateIndex
CREATE INDEX "order_seller_id_idx" ON "order"("seller_id");

-- CreateIndex
CREATE INDEX "order_status_idx" ON "order"("status");

-- CreateIndex
CREATE INDEX "order_item_order_id_idx" ON "order_item"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "dispute_order_id_key" ON "dispute"("order_id");

-- CreateIndex
CREATE INDEX "dispute_evidence_dispute_id_idx" ON "dispute_evidence"("dispute_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_order_id_rater_id_key" ON "review"("order_id", "rater_id");

-- CreateIndex
CREATE INDEX "financial_audit_log_order_id_idx" ON "financial_audit_log"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "push_token_expo_token_key" ON "push_token"("expo_token");

-- CreateIndex
CREATE INDEX "push_token_user_id_idx" ON "push_token"("user_id");

-- AddForeignKey
ALTER TABLE "card" ADD CONSTRAINT "card_set_id_fkey" FOREIGN KEY ("set_id") REFERENCES "card_set"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_translation" ADD CONSTRAINT "card_translation_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_visibility" ADD CONSTRAINT "collection_visibility_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_profile" ADD CONSTRAINT "seller_profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_address" ADD CONSTRAINT "user_address_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_item" ADD CONSTRAINT "collection_item_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_item" ADD CONSTRAINT "collection_item_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_price" ADD CONSTRAINT "card_price_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_price_snapshot" ADD CONSTRAINT "card_price_snapshot_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_value_snapshot" ADD CONSTRAINT "collection_value_snapshot_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist" ADD CONSTRAINT "wishlist_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_item" ADD CONSTRAINT "wishlist_item_wishlist_id_fkey" FOREIGN KEY ("wishlist_id") REFERENCES "wishlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_item" ADD CONSTRAINT "wishlist_item_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_session" ADD CONSTRAINT "scan_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_capture" ADD CONSTRAINT "scan_capture_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "scan_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_capture" ADD CONSTRAINT "scan_capture_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing" ADD CONSTRAINT "listing_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "user_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing" ADD CONSTRAINT "listing_collection_item_id_fkey" FOREIGN KEY ("collection_item_id") REFERENCES "collection_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_item" ADD CONSTRAINT "cart_item_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_item" ADD CONSTRAINT "cart_item_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout" ADD CONSTRAINT "checkout_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "user_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_checkout_id_fkey" FOREIGN KEY ("checkout_id") REFERENCES "checkout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "user_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "user_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute" ADD CONSTRAINT "dispute_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_evidence" ADD CONSTRAINT "dispute_evidence_dispute_id_fkey" FOREIGN KEY ("dispute_id") REFERENCES "dispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review" ADD CONSTRAINT "review_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_audit_log" ADD CONSTRAINT "financial_audit_log_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_token" ADD CONSTRAINT "push_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
