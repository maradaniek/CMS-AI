import { randomBytes } from "crypto";
import { compareSync } from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hashToken } from "@/lib/crypto";
import { db, userByEmail, userById } from "@/lib/db";
import type { PublicUser, Role } from "@/lib/types";

const COOKIE = "waas_session";
const TWO_WEEKS = 60 * 60 * 24 * 14;

export async function signIn(email: string, password: string) {
  const user = userByEmail(email.trim());
  if (!user || !compareSync(password, user.password_hash)) return null;
  const token = randomBytes(32).toString("hex");
  db()
    .prepare("insert into sessions (id, user_id, expires_at) values (?, ?, ?)")
    .run(hashToken(token), user.id, Date.now() + TWO_WEEKS * 1000);
  const jar = await cookies();
  jar.set(COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: TWO_WEEKS });
  return { id: user.id, name: user.name, email: user.email, role: user.role } satisfies PublicUser;
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) db().prepare("delete from sessions where id = ?").run(hashToken(token));
  jar.delete(COOKIE);
}

export async function currentUser() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const session = db()
    .prepare("select user_id, expires_at from sessions where id = ?")
    .get(hashToken(token)) as { user_id: string; expires_at: number } | undefined;
  if (!session || session.expires_at < Date.now()) return null;
  return userById(session.user_id) ?? null;
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(role: Role) {
  const user = await requireUser();
  if (user.role !== role) redirect("/");
  return user;
}
