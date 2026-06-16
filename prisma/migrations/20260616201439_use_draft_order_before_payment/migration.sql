ALTER TABLE "AsaasShopifyOrder" ADD COLUMN "draftOrderId" TEXT;
ALTER TABLE "AsaasShopifyOrder" ADD COLUMN "draftOrderName" TEXT;
ALTER TABLE "AsaasShopifyOrder" ADD COLUMN "paidAt" TIMESTAMP(3);
ALTER TABLE "AsaasShopifyOrder" ALTER COLUMN "shopifyOrderId" DROP NOT NULL;

CREATE UNIQUE INDEX "AsaasShopifyOrder_draftOrderId_key" ON "AsaasShopifyOrder"("draftOrderId");
