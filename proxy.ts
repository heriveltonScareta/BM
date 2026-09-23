import { withAuth } from "next-auth/middleware";

/**
 * Protege a area interna: sem sessao, redireciona para /login.
 * A verificacao definitiva de permissao acontece no servidor (requireSession/can);
 * aqui e apenas a barreira de entrada.
 */
export const proxy = withAuth({
  pages: { signIn: "/login" },
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/clientes/:path*",
    "/medicoes/:path*",
    "/aprovacoes/:path*",
    "/faturamento/:path*",
    "/documentos/:path*",
    "/relatorios/:path*",
    "/configuracoes/:path*",
  ],
};
