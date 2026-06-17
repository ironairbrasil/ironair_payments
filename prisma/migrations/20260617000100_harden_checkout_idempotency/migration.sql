ALTER TABLE "AsaasShopifyOrder" ADD COLUMN "failureReason" TEXT;

CREATE UNIQUE INDEX "AsaasShopifyOrder_externalReference_key" ON "AsaasShopifyOrder"("externalReference");
