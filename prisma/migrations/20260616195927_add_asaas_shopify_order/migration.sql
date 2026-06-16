-- CreateTable
CREATE TABLE "AsaasShopifyOrder" (
    "id" SERIAL NOT NULL,
    "asaasPaymentId" TEXT NOT NULL,
    "asaasCustomerId" TEXT,
    "shopifyOrderId" TEXT NOT NULL,
    "shopifyOrderName" TEXT,
    "externalReference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "invoiceUrl" TEXT,
    "value" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AsaasShopifyOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AsaasShopifyOrder_asaasPaymentId_key" ON "AsaasShopifyOrder"("asaasPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "AsaasShopifyOrder_shopifyOrderId_key" ON "AsaasShopifyOrder"("shopifyOrderId");
