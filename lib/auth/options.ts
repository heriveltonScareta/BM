import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { loginSchema } from "@/lib/validation/auth";
import { authenticate } from "@/lib/services/auth.service";
import { config } from "@/lib/config";
import type { Role } from "@/lib/db/generated/enums";
import { getRateLimiter } from "@/lib/rate-limit";
import { RateLimitError } from "@/lib/errors";
import { resolveSessionUser } from "@/lib/services/auth.service";

// Forca bruta: contam-se so as FALHAS, por IP+e-mail e por e-mail (o cabecalho de IP pode ser
// forjado sem proxy confiavel). Logins corretos nunca consomem a cota.
const loginByIpEmail = getRateLimiter("login:ip-email", { limit: 10, windowMs: 15 * 60_000 });
const loginByEmail = getRateLimiter("login:email", { limit: 30, windowMs: 15 * 60_000 });

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
        const email = parsed.data.email.trim().toLowerCase();
        const ipKey = `${ip ?? "desconhecido"}|${email}`;
        try {
          await loginByIpEmail.check(ipKey);
          await loginByEmail.check(email);
        } catch (e) {
          if (e instanceof RateLimitError) return null;
          throw e;
        }
        const user = await authenticate(parsed.data.email, parsed.data.password, { ip, userAgent });
        if (!user) {
          await Promise.allSettled([loginByIpEmail.consume(ipKey), loginByEmail.consume(email)]);
          return null;
        }
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
        token.invalid = false;
        return token;
      }
      // O JWT e um retrato do login: papel, cliente e ativo/inativo sao reconciliados com o banco
      // (cache curto em memoria) para que desativacao ou troca de cliente valham antes de expirar.
      if (token.id) {
        const current = await resolveSessionUser(token.id);
        if (!current) token.invalid = true;
        else {
          token.invalid = false;
          token.role = current.role;
          token.clientId = current.clientId;
          token.name = current.name;
          token.email = current.email;
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        // sessao invalidada (usuario inativo/removido): sem id, `getSessionUser` devolve null
        id: token.invalid ? "" : (token.id as string),
        name: token.name ?? "",
        email: token.email ?? "",
        role: token.role as Role,
        clientId: (token.clientId as string | null | undefined) ?? null,
      };
      return session;
    },
  },
};
