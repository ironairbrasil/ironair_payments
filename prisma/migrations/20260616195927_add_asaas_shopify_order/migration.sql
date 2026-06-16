-- CreateTable
CREATE TABLE "AsaasShopifyOrder" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "asaasPaymentId" TEXT NOT NULL,
    "asaasCustomerId" TEXT,
    "shopifyOrderId" TEXT NOT NULL,
    "shopifyOrderName" TEXT,
    "externalReference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "invoiceUrl" TEXT,
    "value" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "AsaasShopifyOrder_asaasPaymentId_key" ON "AsaasShopifyOrder"("asaasPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "AsaasShopifyOrder_shopifyOrderId_key" ON "AsaasShopifyOrder"("shopifyOrderId");
