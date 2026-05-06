-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "external_id" TEXT;

-- CreateIndex
CREATE INDEX "contacts_tenant_id_external_id_idx" ON "contacts"("tenant_id", "external_id");
