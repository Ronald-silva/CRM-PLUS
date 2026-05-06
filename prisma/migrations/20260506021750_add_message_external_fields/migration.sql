-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "delivery_error" TEXT,
ADD COLUMN     "external_id" TEXT,
ADD COLUMN     "external_status" TEXT;
