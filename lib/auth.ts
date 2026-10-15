import { createHmac, timingSafeEqual } from "crypto";
import { compareSync } from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { userByEmail } from "@/lib/db";
import type { PublicUser, Role } from "@/lib/types";

const COOKIE = "waas_session";
const TWO_WEEKS = 60 * 60 * 24 * 14;

function cookieValue(header: string | null, name: string) {
  if (!header) return null;
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

function secret() {
  return process.env.APP_SECRET || "waas-cms-demo";
}

function sign(user: PublicUser) {
  const body = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + TWO_WEEKS * 1000 })).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function read(token: string): PublicUser | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as PublicUser & { exp: number };
  if (!payload.exp || payload.exp < Date.now() || !payload.id || !payload.role) return null;
  return { id: payload.id, name: payload.name, email: payload.email, role: payload.role };
}

export async function signIn(email: string, password: string) {
  const user = await userByEmail(email.trim());
  if (!user || !compareSync(password, user.password_hash)) return null;
  const jar = await cookies();
  jar.set(COOKIE, sign(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TWO_WEEKS,
  });
  return { id: user.id, name: user.name, email: user.email, role: user.role } satisfies PublicUser;
}

export async function signOut() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function currentUser() {
  const token = cookieValue((await headers()).get("cookie"), COOKIE);
  if (!token) return null;
  try {
    return read(token);
  } catch {
    return null;
  }
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
