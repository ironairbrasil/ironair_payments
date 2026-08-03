ALTER TABLE "AsaasShopifyOrder"
ADD COLUMN "shippingCarrier" TEXT,
ADD COLUMN "shippingService" TEXT,
ADD COLUMN "shippingServiceCode" TEXT,
ADD COLUMN "shippingPrice" DOUBLE PRECISION,
ADD COLUMN "shippingDeadlineDays" INTEGER,
ADD COLUMN "shippingDestinationCep" TEXT;
