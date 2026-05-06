import type { NextAuthConfig } from "next-auth";

/**
 * Edge-compatible auth config — no Prisma, no Node.js modules.
 * Used by proxy.ts (Edge Runtime) for session checking.
 * The full config with Credentials + Prisma lives in auth.ts.
 */
export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;

      const publicPaths = [
        "/",
        "/login",
        "/register",
        "/api/auth",
        "/api/webhooks",
        "/api/demo",
      ];
      const isPublic = publicPaths.some((p) => pathname.startsWith(p));
      if (isPublic) return true;

      return !!auth?.user;
    },
  },
  providers: [],
};
