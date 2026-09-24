import type { Role } from "@/lib/db/generated/enums";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: Role;
      clientId: string | null;
    } & Omit<DefaultSession["user"], "name" | "email">;
  }
  interface User {
    id: string;
    role: Role;
    clientId: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    clientId?: string | null;
    /** Usuario inativo/removido depois do login: a sessao deixa de valer. */
    invalid?: boolean;
  }
}
