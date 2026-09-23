import type { Metadata } from "next";
import { RecuperarSenhaForm } from "@/components/auth/recuperar-senha-form";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function RecuperarSenhaPage() {
  return <RecuperarSenhaForm />;
}
