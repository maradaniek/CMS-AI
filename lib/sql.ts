import { mkdirSync } from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { neon } from "@neondatabase/serverless";

export type Sql = {
  exec(sql: string): Promise<void>;
  prepare(sql: string): {
    get(...params: unknown[]): Promise<unknown>;
    all(...params: unknown[]): Promise<unknown[]>;
    run(...params: unknown[]): Promise<void>;
  };
};

const globalSql = globalThis as unknown as { waasSql?: Promise<Sql> };

export function databaseUrl() {
  return process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || "";
}

export function durableDatabase() {
  return Boolean(databaseUrl());
}

function numbers(row: unknown) {
  if (!row || typeof row !== "object") return row;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = typeof value === "string" && /^-?\d+$/.test(value) ? Number(value) : value;
  }
  return out;
}

function postgres(url: string): Sql {
  const query = neon(url);
  return {
    async exec(script) {
      for (const statement of script.split(";").map((part) => part.trim()).filter(Boolean)) {
        await query.query(statement);
      }
    },
    prepare(text) {
      let index = 0;
      const sql = text.replace(/\?/g, () => `$${++index}`);
      return {
        async get(...params) {
          const rows = await query.query(sql, params);
          return numbers(rows[0]);
        },
        async all(...params) {
          const rows = await query.query(sql, params);
          return rows.map((row) => numbers(row)) as unknown[];
        },
        async run(...params) {
          await query.query(sql, params);
        },
      };
    },
  };
}

function sqlite(): Sql {
  const dir = path.join(process.cwd(), "data");
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "cms.sqlite"));
  return {
    async exec(script) {
      db.exec(script);
    },
    prepare(text) {
      const statement = db.prepare(text);
      return {
        async get(...params) {
          return statement.get(...params);
        },
        async all(...params) {
          return statement.all(...params);
        },
        async run(...params) {
          statement.run(...params);
        },
      };
    },
  };
}

export function sql() {
  if (!globalSql.waasSql) {
    globalSql.waasSql = open();
  }
  return globalSql.waasSql;
}

async function open(): Promise<Sql> {
  const url = databaseUrl();
  const db = url ? postgres(url) : sqlite();
  await db.exec(`
    create table if not exists users (
      id text primary key,
      name text not null,
      email text not null unique,
      password_hash text not null,
      role text not null
    );
    create table if not exists clients (
      id text primary key,
      name text not null,
      site_url text not null,
      wp_username text not null,
      wp_app_password_enc text not null,
      created_at bigint not null
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
      created_at bigint not null
    );
    create table if not exists schemas (
      client_id text primary key,
      catalog_json text not null,
      fetched_at bigint not null
    );
    create table if not exists seo_meta (
      client_id text not null,
      post_type text not null,
      post_id integer not null,
      seo_title text not null default '',
      description text not null default '',
      keyword text not null default '',
      primary key (client_id, post_type, post_id)
    )
  `);
  return db;
}
