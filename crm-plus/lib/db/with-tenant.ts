import { prisma } from "./client";

/**
 * Returns a Prisma client scoped to a tenant.
 * Passes tenantId automatically on create; callers must still
 * filter by tenantId on reads (API routes handle this explicitly).
 *
 * For automatic read filtering, use the tenant-scoped helpers in each module.
 */
export function withTenant(tenantId: string) {
  return {
    tenantId,
    db: prisma,

    /** Convenience: add tenantId to any create data object */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    withId<T extends Record<string, any>>(data: T): T & { tenantId: string } {
      return { ...data, tenantId };
    },

    /** Standard where clause including tenant isolation */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    where<T extends Record<string, any>>(extra?: T) {
      return { tenantId, ...(extra ?? {}) } as { tenantId: string } & T;
    },
  };
}

export type TenantContext = ReturnType<typeof withTenant>;
