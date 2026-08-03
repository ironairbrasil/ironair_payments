ALTER TABLE "AsaasShopifyOrder"
ADD COLUMN "correiosReceiptId" TEXT,
ADD COLUMN "correiosStatus" TEXT,
ADD COLUMN "correiosRawResponse" JSONB,
ADD COLUMN "correiosAttemptedAt" TIMESTAMP(3),
ADD COLUMN "correiosPrePostedAt" TIMESTAMP(3),
ADD COLUMN "correiosLabelGeneratedAt" TIMESTAMP(3);
