import type { Metadata } from "next";
import { RedefinirSenhaForm } from "@/components/auth/redefinir-senha-form";

export const metadata: Metadata = { title: "Nova senha" };

export default async function RedefinirSenhaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <RedefinirSenhaForm token={token} />;
}
