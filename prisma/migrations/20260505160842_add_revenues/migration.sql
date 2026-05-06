-- CreateEnum
CREATE TYPE "RevenueStatus" AS ENUM ('pending', 'paid', 'cancelled');

-- CreateTable
CREATE TABLE "revenues" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "opportunity_id" UUID NOT NULL,
    "contact_id" UUID,
    "company_id" UUID,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "RevenueStatus" NOT NULL DEFAULT 'pending',
    "description" TEXT,
    "paid_at" TIMESTAMP(3),
    "due_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "revenues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "revenues_tenant_id_idx" ON "revenues"("tenant_id");

-- CreateIndex
CREATE INDEX "revenues_status_idx" ON "revenues"("status");

-- CreateIndex
CREATE UNIQUE INDEX "revenues_opportunity_id_key" ON "revenues"("opportunity_id");

-- AddForeignKey
ALTER TABLE "revenues" ADD CONSTRAINT "revenues_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenues" ADD CONSTRAINT "revenues_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenues" ADD CONSTRAINT "revenues_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenues" ADD CONSTRAINT "revenues_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
