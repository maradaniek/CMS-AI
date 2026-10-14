"use server";

import { hashSync } from "bcryptjs";
import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole, requireUser, signIn, signOut } from "@/lib/auth";
import { addExistingBlock, addMessage, catalogFor, messagesFor, runPlan } from "@/lib/content";
import { canAccess, clientById, db, userById } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { guardPrompt } from "@/lib/guard";
import { locateOnSite, pageKey, samePage } from "@/lib/locate";
import { planPrompt, type Task } from "@/lib/planner";
import type { PostKind } from "@/lib/types";
import { listContent, testConnection, WpError } from "@/lib/wp";

export async function loginAction(_state: { error: string } | null, formData: FormData) {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const user = await signIn(email, password);
  if (!user) return { error: "Onbekend e-mailadres of wachtwoord." };
  redirect("/");
}

export async function logoutAction() {
  await signOut();
  redirect("/login");
}

export async function createClientAction(_state: { error: string } | null, formData: FormData) {
  await requireRole("admin");
  const name = String(formData.get("name") || "").trim();
  const siteUrl = String(formData.get("siteUrl") || "").trim();
  const username = String(formData.get("username") || "").trim();
  const appPassword = String(formData.get("appPassword") || "").trim();
  if (!name || !siteUrl || !username || !appPassword) {
    return { error: "Naam, site, gebruiker en applicatiewachtwoord zijn nodig." };
  }
  const id = randomBytes(8).toString("hex");
  const row = {
    id,
    name,
    site_url: siteUrl,
    wp_username: username,
    wp_app_password_enc: encrypt(appPassword),
    created_at: Date.now(),
  };
  try {
    await testConnection(row);
  } catch (error) {
    const message = error instanceof WpError ? error.message : "De site reageert niet.";
    return { error: `Geen verbinding met WaaS. ${message}` };
  }
  db()
    .prepare(
      "insert into clients (id, name, site_url, wp_username, wp_app_password_enc, created_at) values (?, ?, ?, ?, ?, ?)",
    )
    .run(id, name, siteUrl, username, row.wp_app_password_enc, row.created_at);
  revalidatePath("/");
  redirect(`/klanten/${id}`);
}

export async function deleteClientAction(formData: FormData) {
  await requireRole("admin");
  const id = String(formData.get("id") || "");
  const confirm = String(formData.get("confirm") || "");
  if (confirm !== "weg") return;
  db().prepare("delete from assignments where client_id = ?").run(id);
  db().prepare("delete from schemas where client_id = ?").run(id);
  db().prepare("delete from messages where client_id = ?").run(id);
  db().prepare("delete from seo_meta where client_id = ?").run(id);
  db().prepare("delete from clients where id = ?").run(id);
  revalidatePath("/");
  redirect("/");
}

export async function revealCredentials(clientId: string) {
  await requireRole("admin");
  const client = clientById(clientId);
  if (!client) return null;
  const { decrypt } = await import("@/lib/crypto");
  return { username: client.wp_username, appPassword: decrypt(client.wp_app_password_enc), siteUrl: client.site_url };
}

export async function createUserAction(_state: { error: string } | null, formData: FormData) {
  await requireRole("admin");
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const role = String(formData.get("role") || "");
  const clients = [...new Set(formData.getAll("clients").map(String).filter(Boolean))];
  if (!name || !email || password.length < 8 || (role !== "marketeer" && role !== "klant" && role !== "admin")) {
    return { error: "Naam, e-mail, een wachtwoord van minstens 8 tekens en een rol zijn nodig." };
  }
  if (role === "klant" && clients.length > 1) {
    return { error: "Een klant koppel je aan één site." };
  }
  if (!knownClients(clients)) return { error: "Onbekende klant." };
  const id = randomBytes(8).toString("hex");
  try {
    db()
      .prepare("insert into users (id, name, email, password_hash, role) values (?, ?, ?, ?, ?)")
      .run(id, name, email, hashSync(password, 10), role);
  } catch {
    return { error: "Dit e-mailadres bestaat al." };
  }
  if (role !== "admin") saveAssignments(id, clients);
  revalidatePath("/gebruikers");
  return { error: "" };
}

export async function assignClientsAction(_state: { error: string } | null, formData: FormData) {
  await requireRole("admin");
  const userId = String(formData.get("userId") || "");
  const target = userById(userId);
  if (!target) return { error: "Gebruiker niet gevonden." };
  if (target.role === "admin") return { error: "Een beheerder ziet alle klanten. Daar valt niets aan te koppelen." };
  const clients = [...new Set(formData.getAll("clients").map(String).filter(Boolean))];
  if (target.role === "klant" && clients.length > 1) return { error: "Een klant koppel je aan één site." };
  if (!knownClients(clients)) return { error: "Onbekende klant." };
  saveAssignments(userId, clients);
  revalidatePath("/gebruikers");
  return { error: "" };
}

function knownClients(ids: string[]) {
  const known = new Set((db().prepare("select id from clients").all() as { id: string }[]).map((row) => row.id));
  return ids.every((id) => known.has(id));
}

function saveAssignments(userId: string, clientIds: string[]) {
  const database = db();
  database.exec("begin");
  try {
    database.prepare("delete from assignments where user_id = ?").run(userId);
    const insert = database.prepare("insert into assignments (user_id, client_id) values (?, ?)");
    clientIds.forEach((clientId) => insert.run(userId, clientId));
    database.exec("commit");
  } catch (error) {
    database.exec("rollback");
    throw error;
  }
}

export async function refreshCatalogAction(formData: FormData) {
  const user = await requireUser();
  const clientId = String(formData.get("clientId") || "");
  if (!canAccess(user, clientId)) return;
  const client = clientById(clientId);
  if (!client) return;
  await catalogFor(client, true);
  revalidatePath(`/klanten/${clientId}`);
}

const TASKS: Task[] = ["seo", "text", "image", "case", "blog", "block"];

export type UrlMatch = {
  title: string;
  kind: PostKind | null;
  postId: number | null;
  link: string;
};

export async function resolveUrlAction(
  _state: { error: string; match: UrlMatch | null } | null,
  formData: FormData,
): Promise<{ error: string; match: UrlMatch | null }> {
  const user = await requireUser();
  const clientId = String(formData.get("clientId") || "");
  if (!canAccess(user, clientId)) return { error: "Geen toegang tot deze klant.", match: null };
  const client = clientById(clientId);
  if (!client) return { error: "Klant niet gevonden.", match: null };
  const located = locateOnSite(client.site_url, String(formData.get("url") || ""));
  if ("error" in located) return { error: located.error, match: null };
  const kinds: PostKind[] = ["pages", "cases", "posts"];
  try {
    for (const kind of kinds) {
      const items = await listContent(client, kind);
      const hit = items.find((item) => {
        const key = pageKey(item.link);
        return key ? samePage(key, located.key) : false;
      });
      if (hit) {
        return { error: "", match: { title: hit.title, kind, postId: hit.id, link: hit.link } satisfies UrlMatch };
      }
    }
  } catch (error) {
    return {
      error: error instanceof WpError ? error.message : "De pagina's van deze site zijn niet opgehaald.",
      match: null,
    };
  }
  return { error: "", match: { title: client.name, kind: null, postId: null, link: String(formData.get("url") || "").trim() } };
}

export async function promptAction(_state: { error: string } | null, formData: FormData) {
  const user = await requireUser();
  const clientId = String(formData.get("clientId") || "");
  if (!canAccess(user, clientId)) return { error: "Geen toegang tot deze klant." };
  const client = clientById(clientId);
  if (!client) return { error: "Klant niet gevonden." };
  const prompt = String(formData.get("prompt") || "").trim();
  if (!prompt) return { error: "Schrijf eerst wat er moet gebeuren." };
  const kindValue = String(formData.get("kind") || "");
  const kind = kindValue === "pages" || kindValue === "cases" || kindValue === "posts" ? kindValue : null;
  const postId = Number(formData.get("postId") || 0) || null;
  const taskValue = String(formData.get("task") || "");
  const task = TASKS.find((item) => item === taskValue) ?? null;
  const file = formData.get("image");
  addMessage(clientId, user.id, "user", prompt);
  const guard = guardPrompt(prompt);
  let reply = guard.allowed ? "" : guard.message;
  if (guard.allowed) {
    try {
      const catalog = await catalogFor(client);
      const plan = planPrompt(prompt, catalog, Boolean(kind && postId), task);
      reply = await runPlan({
        client,
        plan,
        kind,
        postId,
        file: file instanceof File ? file : null,
      });
    } catch (error) {
      reply = error instanceof WpError ? error.message : "De site gaf een fout. Er is niets verwijderd.";
    }
  }
  addMessage(clientId, user.id, "assistant", reply);
  revalidatePath(`/klanten/${clientId}`);
  return { error: "" };
}

export async function addBlockAction(_state: { error: string } | null, formData: FormData) {
  const user = await requireUser();
  const clientId = String(formData.get("clientId") || "");
  if (!canAccess(user, clientId)) return { error: "Geen toegang tot deze klant." };
  const client = clientById(clientId);
  if (!client) return { error: "Klant niet gevonden." };
  const layout = String(formData.get("layout") || "");
  const kindValue = String(formData.get("kind") || "");
  const kind: PostKind | null = kindValue === "pages" || kindValue === "cases" || kindValue === "posts" ? kindValue : null;
  const postId = Number(formData.get("postId") || 0) || null;
  const heading = String(formData.get("heading") || "").trim();
  const text = String(formData.get("text") || "").trim();
  const file = formData.get("image");
  if (!kind || !postId) return { error: "Kies eerst een pagina, case of blog." };
  const guarded = guardPrompt(`${heading}\n${text}`);
  if (!guarded.allowed) return { error: guarded.message };
  addMessage(clientId, user.id, "user", `Voeg blok ${layout} toe. ${heading} ${text}`.trim());
  let reply = "";
  try {
    const catalog = await catalogFor(client);
    reply = await addExistingBlock(client, catalog, kind, postId, layout, {
      heading,
      text,
      file: file instanceof File ? file : null,
    });
  } catch (error) {
    reply = error instanceof WpError ? error.message : "Het blok is niet toegevoegd.";
  }
  addMessage(clientId, user.id, "assistant", reply);
  revalidatePath(`/klanten/${clientId}`);
  return { error: reply.startsWith("“") || reply.includes("niet") ? reply : "" };
}

export async function loadMessages(clientId: string) {
  return messagesFor(clientId);
}
