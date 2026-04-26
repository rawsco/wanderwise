import type { NextAuthOptions } from "next-auth";
import CognitoProvider from "next-auth/providers/cognito";
import { UserEntity } from "./db/user.entity";

// Gate cookie naming on the URL protocol, not on NODE_ENV. NextAuth's
// middleware (`getToken({ req })` inside withAuth) infers cookie name from
// request protocol — HTTPS → look for `__Secure-` prefix. If we keyed off
// NODE_ENV instead, the cookie write (no prefix in dev) and the cookie read
// (with prefix because URL is HTTPS) disagreed and middleware never saw the
// session, infinite-redirect-looping the user back to /login. Bug surfaced
// when worktree dev envs moved to HTTPS for Cognito compatibility.
const useSecure = (process.env.NEXTAUTH_URL ?? "").startsWith("https://");
const cookiePrefix = useSecure ? "__Secure-" : "";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  useSecureCookies: useSecure,
  cookies: {
    sessionToken: {
      name: `${cookiePrefix}next-auth.session-token`,
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: useSecure },
    },
    callbackUrl: {
      name: `${cookiePrefix}next-auth.callback-url`,
      options: { sameSite: "lax", path: "/", secure: useSecure },
    },
    csrfToken: {
      name: `${cookiePrefix}next-auth.csrf-token`,
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: useSecure },
    },
  },
  providers: [
    CognitoProvider({
      clientId: process.env.COGNITO_CLIENT_ID!,
      clientSecret: process.env.COGNITO_CLIENT_SECRET!,
      issuer: process.env.COGNITO_ISSUER!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.id || !user.email) return false;
      const existing = await UserEntity.get({ id: user.id }).go();
      if (!existing.data) {
        await UserEntity.put({
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
        }).go();
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user) session.user.id = token.id as string;
      return session;
    },
  },
};
