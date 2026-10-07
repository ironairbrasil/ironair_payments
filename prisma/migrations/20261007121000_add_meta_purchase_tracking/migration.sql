ALTER TABLE "AsaasShopifyOrder"
ADD COLUMN "metaPurchaseEventId" TEXT,
ADD COLUMN "metaPurchaseStatus" TEXT,
ADD COLUMN "metaPurchaseAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "metaPurchaseLastError" TEXT,
ADD COLUMN "metaPurchaseLastResponse" JSONB,
ADD COLUMN "metaPurchaseAttemptedAt" TIMESTAMP(3),
ADD COLUMN "metaPurchaseSentAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "AsaasShopifyOrder_metaPurchaseEventId_key"
ON "AsaasShopifyOrder"("metaPurchaseEventId");

UPDATE "AsaasShopifyOrder"
SET "metaPurchaseStatus" = 'LEGACY_SKIPPED'
WHERE "status" = 'PAID'
  AND "metaPurchaseStatus" IS NULL;
