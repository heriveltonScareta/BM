import { EstadoVazio } from "@/components/estados";

export default function NotFound() {
  return (
    <EstadoVazio
      titulo="Página não encontrada"
      descricao="O registro pode ter sido removido ou você não tem acesso a ele."
      acao={{ label: "Voltar ao início", href: "/dashboard" }}
    />
  );
}
