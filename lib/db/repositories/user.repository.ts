import type { Db } from "@/lib/db/prisma";

export function findUserByEmail(db: Db, email: string) {
  return db.user.findUnique({ where: { email: email.toLowerCase() } });
}

export function findUserById(db: Db, id: string) {
  return db.user.findUnique({ where: { id } });
}
