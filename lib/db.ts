import { randomBytes } from "crypto";
import { hashSync } from "bcryptjs";
import { encrypt } from "@/lib/crypto";
import { demoClient, isDemo } from "@/lib/demo";
import { sql, type Sql } from "@/lib/sql";
import type { PublicUser, Role } from "@/lib/types";

export async function db() {
  const database = await sql();
  await seed(database);
  return database;
}

async function seed(database: Sql) {
  const count = (await database.prepare("select count(*) as n from users").get()) as { n: number };
  if (Number(count.n) > 0) return;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "Woeler-admin-2026";
  const marketPassword = process.env.SEED_MARKETEER_PASSWORD || "Woeler-markt-2026";
  const clientPassword = process.env.SEED_KLANT_PASSWORD || "Woeler-klant-2026";
  const people: [string, string, Role, string][] = [
    ["Mara", process.env.SEED_ADMIN_EMAIL || "mara@woeler.nl", "admin", adminPassword],
    ["Marketeer", "marketeer@woeler.nl", "marketeer", marketPassword],
    ["Klant", "klant@woeler.nl", "klant", clientPassword],
  ];
  const insert = database.prepare(
    "insert into users (id, name, email, password_hash, role) values (?, ?, ?, ?, ?)",
  );
  const ids: string[] = [];
  for (const [name, email, role, password] of people) {
    const id = randomBytes(8).toString("hex");
    await insert.run(id, name, email, hashSync(password, 10), role);
    ids.push(id);
  }

  const appPassword = process.env.WOELER_WP_APP_PASSWORD;
  if (!appPassword) return;
  const clientId = randomBytes(8).toString("hex");
  await database
    .prepare(
      "insert into clients (id, name, site_url, wp_username, wp_app_password_enc, created_at) values (?, ?, ?, ?, ?, ?)",
    )
    .run(
      clientId,
      "Woeler",
      process.env.WOELER_SITE_URL || "https://www.woeler.nl",
      process.env.WOELER_WP_USER || "admin",
      encrypt(appPassword),
      Date.now(),
    );
  const assign = database.prepare("insert into assignments (user_id, client_id) values (?, ?)");
  for (const userId of ids) await assign.run(userId, clientId);
}

export type UserRow = PublicUser & { password_hash: string };

export async function userByEmail(email: string) {
  return (await db()).prepare("select * from users where lower(email) = lower(?)").get(email) as Promise<
    UserRow | undefined
  >;
}

export async function userById(id: string) {
  return (await db()).prepare("select id, name, email, role from users where id = ?").get(id) as Promise<
    PublicUser | undefined
  >;
}

export async function listUsers() {
  return (await db()).prepare("select id, name, email, role from users order by name").all() as Promise<PublicUser[]>;
}

export type ClientRow = {
  id: string;
  name: string;
  site_url: string;
  wp_username: string;
  wp_app_password_enc: string;
};

function withDemo(rows: { id: string; name: string; site_url: string }[]) {
  if (rows.some((row) => row.id === demoClient.id)) return rows;
  return [{ id: demoClient.id, name: demoClient.name, site_url: demoClient.site_url }, ...rows];
}

export async function listClientsFor(user: PublicUser) {
  try {
    if (user.role === "admin") {
      const rows = (await (await db()).prepare("select id, name, site_url from clients order by name").all()) as {
        id: string;
        name: string;
        site_url: string;
      }[];
      return withDemo(rows);
    }
    const rows = (await (await db())
      .prepare(
        `select c.id, c.name, c.site_url from clients c
         join assignments a on a.client_id = c.id
         where a.user_id = ? order by c.name`,
      )
      .all(user.id)) as { id: string; name: string; site_url: string }[];
    return withDemo(rows);
  } catch {
    return withDemo([]);
  }
}

export async function clientById(id: string) {
  if (isDemo(id)) return demoClient;
  return (await db()).prepare("select * from clients where id = ?").get(id) as Promise<ClientRow | undefined>;
}

export async function canAccess(user: PublicUser, clientId: string) {
  if (isDemo(clientId)) return true;
  if (user.role === "admin") return Boolean(await clientById(clientId));
  const row = (await (await db())
    .prepare("select 1 as ok from assignments where user_id = ? and client_id = ?")
    .get(user.id, clientId)) as { ok: number } | undefined;
  return Boolean(row);
}

export async function assignedClientIds(userId: string) {
  const rows = (await (await db()).prepare("select client_id from assignments where user_id = ?").all(userId)) as {
    client_id: string;
  }[];
  return rows.map((row) => row.client_id);
}

export async function listClientOptions() {
  return (await db()).prepare("select id, name, site_url from clients order by name").all() as Promise<
    { id: string; name: string; site_url: string }[]
  >;
}
