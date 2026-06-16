-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AsaasShopifyOrder" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "asaasPaymentId" TEXT NOT NULL,
    "asaasCustomerId" TEXT,
    "draftOrderId" TEXT,
    "draftOrderName" TEXT,
    "shopifyOrderId" TEXT,
    "shopifyOrderName" TEXT,
    "externalReference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "invoiceUrl" TEXT,
    "value" REAL NOT NULL,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AsaasShopifyOrder" ("asaasCustomerId", "asaasPaymentId", "createdAt", "externalReference", "id", "invoiceUrl", "shopifyOrderId", "shopifyOrderName", "status", "updatedAt", "value") SELECT "asaasCustomerId", "asaasPaymentId", "createdAt", "externalReference", "id", "invoiceUrl", "shopifyOrderId", "shopifyOrderName", "status", "updatedAt", "value" FROM "AsaasShopifyOrder";
DROP TABLE "AsaasShopifyOrder";
ALTER TABLE "new_AsaasShopifyOrder" RENAME TO "AsaasShopifyOrder";
CREATE UNIQUE INDEX "AsaasShopifyOrder_asaasPaymentId_key" ON "AsaasShopifyOrder"("asaasPaymentId");
CREATE UNIQUE INDEX "AsaasShopifyOrder_draftOrderId_key" ON "AsaasShopifyOrder"("draftOrderId");
CREATE UNIQUE INDEX "AsaasShopifyOrder_shopifyOrderId_key" ON "AsaasShopifyOrder"("shopifyOrderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
