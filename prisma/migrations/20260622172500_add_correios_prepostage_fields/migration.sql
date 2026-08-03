ALTER TABLE "AsaasShopifyOrder"
ADD COLUMN "shippingStatus" TEXT,
ADD COLUMN "correiosPrePostageId" TEXT,
ADD COLUMN "correiosTrackingCode" TEXT,
ADD COLUMN "correiosLabelUrl" TEXT,
ADD COLUMN "correiosLabelBase64" TEXT,
ADD COLUMN "correiosError" TEXT;
