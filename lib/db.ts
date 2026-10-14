import { randomBytes } from "crypto";
import { mkdirSync } from "fs";
import path from "path";
import { hashSync } from "bcryptjs";
import { DatabaseSync } from "node:sqlite";
import { encrypt } from "@/lib/crypto";
import type { PublicUser, Role } from "@/lib/types";

type Sql = DatabaseSync;

const globalDb = globalThis as unknown as { waasDb?: Sql };

function database() {
  if (!globalDb.waasDb) {
    const dir = path.join(process.cwd(), "data");
    mkdirSync(dir, { recursive: true });
    const db = new DatabaseSync(path.join(dir, "cms.sqlite"));
    db.exec(`
      create table if not exists users (
        id text primary key,
        name text not null,
        email text not null unique,
        password_hash text not null,
        role text not null
      );
      create table if not exists sessions (
        id text primary key,
        user_id text not null,
        expires_at integer not null
      );
      create table if not exists clients (
        id text primary key,
        name text not null,
        site_url text not null,
        wp_username text not null,
        wp_app_password_enc text not null,
        created_at integer not null
      );
      create table if not exists assignments (
        user_id text not null,
        client_id text not null,
        primary key (user_id, client_id)
      );
      create table if not exists messages (
        id text primary key,
        client_id text not null,
        user_id text not null,
        role text not null,
        body text not null,
        created_at integer not null
      );
      create table if not exists schemas (
        client_id text primary key,
        catalog_json text not null,
        fetched_at integer not null
      );
      create table if not exists seo_meta (
        client_id text not null,
        post_type text not null,
        post_id integer not null,
        seo_title text not null default '',
        description text not null default '',
        keyword text not null default '',
        primary key (client_id, post_type, post_id)
      );
    `);
    seed(db);
    globalDb.waasDb = db;
  }
  return globalDb.waasDb;
}

function seed(db: Sql) {
  const count = db.prepare("select count(*) as n from users").get() as { n: number };
  if (count.n > 0) return;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "Woeler-admin-2026";
  const marketPassword = process.env.SEED_MARKETEER_PASSWORD || "Woeler-markt-2026";
  const clientPassword = process.env.SEED_KLANT_PASSWORD || "Woeler-klant-2026";
  const people: [string, string, Role, string][] = [
    ["Mara", process.env.SEED_ADMIN_EMAIL || "mara@woeler.nl", "admin", adminPassword],
    ["Marketeer", "marketeer@woeler.nl", "marketeer", marketPassword],
    ["Klant", "klant@woeler.nl", "klant", clientPassword],
  ];
  const insert = db.prepare(
    "insert into users (id, name, email, password_hash, role) values (?, ?, ?, ?, ?)",
  );
  const ids = people.map(([name, email, role, password]) => {
    const id = randomBytes(8).toString("hex");
    insert.run(id, name, email, hashSync(password, 10), role);
    return id;
  });

  const appPassword = process.env.WOELER_WP_APP_PASSWORD;
  if (!appPassword) return;
  const clientId = randomBytes(8).toString("hex");
  db.prepare(
    "insert into clients (id, name, site_url, wp_username, wp_app_password_enc, created_at) values (?, ?, ?, ?, ?, ?)",
  ).run(
    clientId,
    "Woeler",
    process.env.WOELER_SITE_URL || "https://www.woeler.nl",
    process.env.WOELER_WP_USER || "admin",
    encrypt(appPassword),
    Date.now(),
  );
  const assign = db.prepare("insert into assignments (user_id, client_id) values (?, ?)");
  ids.forEach((userId) => assign.run(userId, clientId));
}

export function db() {
  return database();
}

export type UserRow = PublicUser & { password_hash: string };

export function userByEmail(email: string) {
  return db().prepare("select * from users where lower(email) = lower(?)").get(email) as UserRow | undefined;
}

export function userById(id: string) {
  return db().prepare("select id, name, email, role from users where id = ?").get(id) as PublicUser | undefined;
}

export function listUsers() {
  return db().prepare("select id, name, email, role from users order by name").all() as PublicUser[];
}

export type ClientRow = {
  id: string;
  name: string;
  site_url: string;
  wp_username: string;
  wp_app_password_enc: string;
};

export function listClientsFor(user: PublicUser) {
  if (user.role === "admin") {
    return db().prepare("select id, name, site_url from clients order by name").all() as {
      id: string;
      name: string;
      site_url: string;
    }[];
  }
  return db()
    .prepare(
      `select c.id, c.name, c.site_url from clients c
       join assignments a on a.client_id = c.id
       where a.user_id = ? order by c.name`,
    )
    .all(user.id) as { id: string; name: string; site_url: string }[];
}

export function clientById(id: string) {
  return db().prepare("select * from clients where id = ?").get(id) as ClientRow | undefined;
}

export function canAccess(user: PublicUser, clientId: string) {
  if (user.role === "admin") return Boolean(clientById(clientId));
  const row = db()
    .prepare("select 1 as ok from assignments where user_id = ? and client_id = ?")
    .get(user.id, clientId) as { ok: number } | undefined;
  return Boolean(row);
}

export function assignedClientIds(userId: string) {
  return (
    db().prepare("select client_id from assignments where user_id = ?").all(userId) as { client_id: string }[]
  ).map((row) => row.client_id);
}
