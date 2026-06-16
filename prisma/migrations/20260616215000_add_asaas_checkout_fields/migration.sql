ALTER TABLE "AsaasShopifyOrder" ADD COLUMN "asaasCheckoutId" TEXT;
ALTER TABLE "AsaasShopifyOrder" ADD COLUMN "asaasCheckoutUrl" TEXT;
CREATE UNIQUE INDEX "AsaasShopifyOrder_asaasCheckoutId_key" ON "AsaasShopifyOrder"("asaasCheckoutId");
