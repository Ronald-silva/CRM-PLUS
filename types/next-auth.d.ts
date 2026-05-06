import type { UserRole } from "@/lib/generated/prisma/enums";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      tenantId: string;
      tenantSlug: string;
      role: UserRole;
    };
  }

  interface User {
    tenantId: string;
    tenantSlug: string;
    role: UserRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    tenantId: string;
    tenantSlug: string;
    role: UserRole;
  }
}
