ALTER TABLE "AsaasShopifyOrder"
ADD COLUMN "checkoutData" JSONB,
ADD COLUMN "baseOrderId" INTEGER,
ADD COLUMN "baseCustomerId" INTEGER,
ADD COLUMN "baseSyncStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN "baseSyncError" TEXT,
ADD COLUMN "baseSyncEvent" TEXT,
ADD COLUMN "baseSyncedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "AsaasShopifyOrder_baseOrderId_key"
ON "AsaasShopifyOrder"("baseOrderId");

CREATE TABLE "AsaasWebhookEvent" (
  "id" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "asaasPaymentId" TEXT,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "error" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "AsaasWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AsaasWebhookEvent_asaasPaymentId_idx"
ON "AsaasWebhookEvent"("asaasPaymentId");
