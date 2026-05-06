-- ============================================================
-- CRM PLUS — Setup completo do banco de dados
-- Execute no Supabase → SQL Editor
-- Idempotente: seguro rodar mesmo que tabelas já existam
-- ============================================================

-- ─── Enums ───────────────────────────────────────────────────

DO $$ BEGIN CREATE TYPE "UserRole" AS ENUM ('super_admin','owner','manager','salesperson','attendant','financial','viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "TenantPlan" AS ENUM ('free','starter','pro','enterprise');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "TenantStatus" AS ENUM ('active','suspended','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "ContactStatus" AS ENUM ('lead','customer','inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "ProductStatus" AS ENUM ('active','inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "OpportunityStatus" AS ENUM ('open','won','lost');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "RevenueStatus" AS ENUM ('pending','paid','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "TaskStatus" AS ENUM ('pending','done','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "TaskPriority" AS ENUM ('low','medium','high');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "ConversationChannel" AS ENUM ('manual','whatsapp','instagram','email');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "ConversationStatus" AS ENUM ('open','pending','resolved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "SenderType" AS ENUM ('user','contact','bot');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "MessageDirection" AS ENUM ('inbound','outbound');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Tabelas ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "tenants" (
    "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
    "name"       TEXT        NOT NULL,
    "slug"       TEXT        NOT NULL,
    "plan"       "TenantPlan"   NOT NULL DEFAULT 'free',
    "status"     "TenantStatus" NOT NULL DEFAULT 'active',
    "settings"   JSONB       NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_slug_key" ON "tenants"("slug");

-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "users" (
    "id"            UUID      NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"     UUID      NOT NULL,
    "name"          TEXT      NOT NULL,
    "email"         TEXT      NOT NULL,
    "email_verified" TIMESTAMP(3),
    "password_hash" TEXT,
    "role"          "UserRole" NOT NULL DEFAULT 'salesperson',
    "avatar_url"    TEXT,
    "phone"         TEXT,
    "is_active"     BOOLEAN   NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "users_tenant_id_email_key" ON "users"("tenant_id","email");
DO $$ BEGIN ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "sessions" (
    "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_token" TEXT NOT NULL,
    "user_id"       UUID NOT NULL,
    "expires"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_session_token_key" ON "sessions"("session_token");
DO $$ BEGIN ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
    "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id"    UUID NOT NULL,
    "tenant_id"  UUID NOT NULL,
    "token"      TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at"    TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_tokens_token_key" ON "password_reset_tokens"("token");
DO $$ BEGIN ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ai_logs" (
    "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"        UUID NOT NULL,
    "user_id"          UUID,
    "entity_type"      TEXT,
    "entity_id"        UUID,
    "action"           TEXT NOT NULL,
    "model_provider"   TEXT,
    "model_id"         TEXT,
    "prompt_tokens"    INTEGER,
    "completion_tokens" INTEGER,
    "input_summary"    TEXT,
    "output_summary"   TEXT,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_logs_pkey" PRIMARY KEY ("id")
);
DO $$ BEGIN ALTER TABLE "ai_logs" ADD CONSTRAINT "ai_logs_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ai_logs" ADD CONSTRAINT "ai_logs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "companies" (
    "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"  UUID NOT NULL,
    "name"       TEXT NOT NULL,
    "domain"     TEXT,
    "phone"      TEXT,
    "address"    TEXT,
    "notes"      TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "companies_tenant_id_idx" ON "companies"("tenant_id");
DO $$ BEGIN ALTER TABLE "companies" ADD CONSTRAINT "companies_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "contacts" (
    "id"          UUID            NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"   UUID            NOT NULL,
    "company_id"  UUID,
    "name"        TEXT            NOT NULL,
    "email"       TEXT,
    "phone"       TEXT,
    "external_id" TEXT,
    "status"      "ContactStatus" NOT NULL DEFAULT 'lead',
    "created_at"  TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "contacts_tenant_id_idx" ON "contacts"("tenant_id");
CREATE INDEX IF NOT EXISTS "contacts_company_id_idx" ON "contacts"("company_id");
CREATE INDEX IF NOT EXISTS "contacts_tenant_id_external_id_idx" ON "contacts"("tenant_id","external_id");
DO $$ BEGIN ALTER TABLE "contacts" ADD CONSTRAINT "contacts_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "products" (
    "id"          UUID            NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"   UUID            NOT NULL,
    "name"        TEXT            NOT NULL,
    "description" TEXT,
    "price"       DECIMAL(12,2)   NOT NULL,
    "category"    TEXT,
    "status"      "ProductStatus" NOT NULL DEFAULT 'active',
    "created_at"  TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "products_tenant_id_idx" ON "products"("tenant_id");
DO $$ BEGIN ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "tags" (
    "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"  UUID NOT NULL,
    "name"       TEXT NOT NULL,
    "color"      TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "tags_tenant_id_idx" ON "tags"("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "tags_tenant_id_name_key" ON "tags"("tenant_id","name");
DO $$ BEGIN ALTER TABLE "tags" ADD CONSTRAINT "tags_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "contact_tags" (
    "contact_id" UUID NOT NULL,
    "tag_id"     UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contact_tags_pkey" PRIMARY KEY ("contact_id","tag_id")
);
DO $$ BEGIN ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_tag_id_fkey"
  FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "pipelines" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"   UUID NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "is_default"  BOOLEAN NOT NULL DEFAULT false,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "pipelines_tenant_id_idx" ON "pipelines"("tenant_id");
DO $$ BEGIN ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "pipeline_stages" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
    "pipeline_id" UUID NOT NULL,
    "tenant_id"   UUID NOT NULL,
    "name"        TEXT NOT NULL,
    "order"       INTEGER NOT NULL,
    "probability" INTEGER NOT NULL DEFAULT 0,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "pipeline_stages_pipeline_id_idx" ON "pipeline_stages"("pipeline_id");
CREATE INDEX IF NOT EXISTS "pipeline_stages_tenant_id_idx" ON "pipeline_stages"("tenant_id");
DO $$ BEGIN ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_pipeline_id_fkey"
  FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "opportunities" (
    "id"               UUID                NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"        UUID                NOT NULL,
    "contact_id"       UUID,
    "company_id"       UUID,
    "pipeline_id"      UUID                NOT NULL,
    "stage_id"         UUID                NOT NULL,
    "assigned_user_id" UUID,
    "title"            TEXT                NOT NULL,
    "value"            DECIMAL(14,2),
    "status"           "OpportunityStatus" NOT NULL DEFAULT 'open',
    "expected_close_at" TIMESTAMP(3),
    "closed_at"        TIMESTAMP(3),
    "notes"            TEXT,
    "created_at"       TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "opportunities_tenant_id_idx"   ON "opportunities"("tenant_id");
CREATE INDEX IF NOT EXISTS "opportunities_pipeline_id_idx" ON "opportunities"("pipeline_id");
CREATE INDEX IF NOT EXISTS "opportunities_stage_id_idx"    ON "opportunities"("stage_id");
CREATE INDEX IF NOT EXISTS "opportunities_contact_id_idx"  ON "opportunities"("contact_id");
DO $$ BEGIN ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_pipeline_id_fkey"
  FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_stage_id_fkey"
  FOREIGN KEY ("stage_id") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_assigned_user_id_fkey"
  FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "opportunity_products" (
    "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"      UUID         NOT NULL,
    "opportunity_id" UUID         NOT NULL,
    "product_id"     UUID         NOT NULL,
    "quantity"       INTEGER      NOT NULL DEFAULT 1,
    "unit_price"     DECIMAL(14,2) NOT NULL,
    "total_price"    DECIMAL(14,2) NOT NULL,
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "opportunity_products_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "opportunity_products_tenant_id_idx"      ON "opportunity_products"("tenant_id");
CREATE INDEX IF NOT EXISTS "opportunity_products_opportunity_id_idx" ON "opportunity_products"("opportunity_id");
CREATE UNIQUE INDEX IF NOT EXISTS "opportunity_products_opportunity_id_product_id_key"
  ON "opportunity_products"("opportunity_id","product_id");
DO $$ BEGIN ALTER TABLE "opportunity_products" ADD CONSTRAINT "opportunity_products_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "opportunity_products" ADD CONSTRAINT "opportunity_products_opportunity_id_fkey"
  FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "opportunity_products" ADD CONSTRAINT "opportunity_products_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "revenues" (
    "id"             UUID            NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"      UUID            NOT NULL,
    "opportunity_id" UUID            NOT NULL,
    "contact_id"     UUID,
    "company_id"     UUID,
    "amount"         DECIMAL(14,2)   NOT NULL,
    "status"         "RevenueStatus" NOT NULL DEFAULT 'pending',
    "description"    TEXT,
    "paid_at"        TIMESTAMP(3),
    "due_at"         TIMESTAMP(3),
    "created_at"     TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "revenues_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "revenues_opportunity_id_key" ON "revenues"("opportunity_id");
CREATE INDEX IF NOT EXISTS "revenues_tenant_id_idx" ON "revenues"("tenant_id");
CREATE INDEX IF NOT EXISTS "revenues_status_idx"    ON "revenues"("status");
DO $$ BEGIN ALTER TABLE "revenues" ADD CONSTRAINT "revenues_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "revenues" ADD CONSTRAINT "revenues_opportunity_id_fkey"
  FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "revenues" ADD CONSTRAINT "revenues_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "revenues" ADD CONSTRAINT "revenues_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "tasks" (
    "id"               UUID           NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"        UUID           NOT NULL,
    "contact_id"       UUID,
    "opportunity_id"   UUID,
    "assigned_user_id" UUID,
    "title"            TEXT           NOT NULL,
    "description"      TEXT,
    "due_at"           TIMESTAMP(3),
    "status"           "TaskStatus"   NOT NULL DEFAULT 'pending',
    "priority"         "TaskPriority" NOT NULL DEFAULT 'medium',
    "source"           TEXT,
    "created_at"       TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "tasks_tenant_id_idx"      ON "tasks"("tenant_id");
CREATE INDEX IF NOT EXISTS "tasks_contact_id_idx"     ON "tasks"("contact_id");
CREATE INDEX IF NOT EXISTS "tasks_opportunity_id_idx" ON "tasks"("opportunity_id");
CREATE INDEX IF NOT EXISTS "tasks_status_idx"         ON "tasks"("status");
DO $$ BEGIN ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "tasks" ADD CONSTRAINT "tasks_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "tasks" ADD CONSTRAINT "tasks_opportunity_id_fkey"
  FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_user_id_fkey"
  FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "conversations" (
    "id"               UUID                  NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"        UUID                  NOT NULL,
    "contact_id"       UUID,
    "assigned_user_id" UUID,
    "channel"          "ConversationChannel" NOT NULL DEFAULT 'manual',
    "status"           "ConversationStatus"  NOT NULL DEFAULT 'open',
    "subject"          TEXT,
    "last_message_at"  TIMESTAMP(3),
    "summary_text"     TEXT,
    "detected_intent"  TEXT,
    "created_at"       TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "conversations_tenant_id_idx"      ON "conversations"("tenant_id");
CREATE INDEX IF NOT EXISTS "conversations_contact_id_idx"     ON "conversations"("contact_id");
CREATE INDEX IF NOT EXISTS "conversations_status_idx"         ON "conversations"("status");
CREATE INDEX IF NOT EXISTS "conversations_last_message_at_idx" ON "conversations"("last_message_at");
DO $$ BEGIN ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_user_id_fkey"
  FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "messages" (
    "id"              UUID               NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID               NOT NULL,
    "tenant_id"       UUID               NOT NULL,
    "senderType"      "SenderType"       NOT NULL DEFAULT 'user',
    "sender_id"       UUID,
    "content"         TEXT               NOT NULL,
    "direction"       "MessageDirection" NOT NULL DEFAULT 'outbound',
    "external_id"     TEXT,
    "external_status" TEXT,
    "delivery_error"  TEXT,
    "sent_at"         TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at"      TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "messages_conversation_id_idx" ON "messages"("conversation_id");
CREATE INDEX IF NOT EXISTS "messages_tenant_id_idx"       ON "messages"("tenant_id");
CREATE INDEX IF NOT EXISTS "messages_sent_at_idx"         ON "messages"("sent_at");
DO $$ BEGIN ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "messages" ADD CONSTRAINT "messages_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────
-- Registra as migrations no histórico do Prisma
-- (evita que prisma migrate deploy queira re-aplicar tudo)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    VARCHAR(36)  NOT NULL,
    "checksum"              VARCHAR(64)  NOT NULL,
    "finished_at"           TIMESTAMPTZ,
    "migration_name"        VARCHAR(255) NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        TIMESTAMPTZ,
    "started_at"            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "applied_steps_count"   INTEGER      NOT NULL DEFAULT 0,
    CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
);

INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count")
VALUES
  (gen_random_uuid()::text,'manual','now()','20260505013448_init',1),
  (gen_random_uuid()::text,'manual','now()','20260505021152_add_contacts',1),
  (gen_random_uuid()::text,'manual','now()','20260505021843_add_companies',1),
  (gen_random_uuid()::text,'manual','now()','20260505022456_add_products',1),
  (gen_random_uuid()::text,'manual','now()','20260505023026_add_tags',1),
  (gen_random_uuid()::text,'manual','now()','20260505023631_add_pipelines',1),
  (gen_random_uuid()::text,'manual','now()','20260505024737_add_opportunities',1),
  (gen_random_uuid()::text,'manual','now()','20260505025338_add_opportunity_products',1),
  (gen_random_uuid()::text,'manual','now()','20260505160842_add_revenues',1),
  (gen_random_uuid()::text,'manual','now()','20260505162711_add_tasks',1),
  (gen_random_uuid()::text,'manual','now()','20260505164053_add_conversations',1),
  (gen_random_uuid()::text,'manual','now()','20260505210054_add_conversation_ai_fields',1),
  (gen_random_uuid()::text,'manual','now()','20260505211659_add_contact_external_id',1),
  (gen_random_uuid()::text,'manual','now()','20260506021750_add_message_external_fields',1)
ON CONFLICT DO NOTHING;

-- ─── Fim ──────────────────────────────────────────────────────
-- 18 tabelas + 13 enums criados com sucesso.
