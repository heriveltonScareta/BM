import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { loginSchema } from "@/lib/validation/auth";
import { authenticate } from "@/lib/services/auth.service";
import { config } from "@/lib/config";
import type { Role } from "@/lib/db/generated/enums";

/**
 * Auth.js (NextAuth v4) com Credentials e sessao JWT em cookie httpOnly.
 * Nada de sessao em localStorage. A senha e verificada com bcrypt no servidor.
 */
export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: config.sessionMaxAge },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    CredentialsProvider({
      name: "E-mail e senha",
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials, req) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const headers = req?.headers ?? {};
        const forwarded = headers["x-forwarded-for"];
        const ip = typeof forwarded === "string" ? forwarded.split(",")[0]!.trim() : null;
        const userAgent = typeof headers["user-agent"] === "string" ? headers["user-agent"] : null;
        const user = await authenticate(parsed.data.email, parsed.data.password, { ip, userAgent });
        if (!user) return null;
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          clientId: user.clientId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.clientId = user.clientId;
        token.name = user.name;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        id: token.id as string,
        name: token.name ?? "",
        email: token.email ?? "",
        role: token.role as Role,
        clientId: (token.clientId as string | null | undefined) ?? null,
      };
      return session;
    },
  },
};
