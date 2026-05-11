import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;

      // Paths that require authentication
      const isProtected =
        pathname.startsWith("/notes") ||
        pathname.startsWith("/app") ||
        pathname === "/";

      if (isProtected) {
        if (isLoggedIn) return true;
        return false; // Redirect to /login
      }

      // Already logged in — redirect away from auth pages
      if (isLoggedIn && (pathname === "/login" || pathname === "/register")) {
        return Response.redirect(new URL("/notes", request.nextUrl));
      }

      return true;
    },
  },
  providers: [], // Providers are added in auth.ts (Node.js only)
};
