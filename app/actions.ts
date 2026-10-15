"use server";

import { hashSync } from "bcryptjs";
import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole, requireUser, signIn, signOut } from "@/lib/auth";
import { addExistingBlock, addMessage, catalogFor, messagesFor, runPlan } from "@/lib/content";
import { canAccess, clientById, db, userById } from "@/lib/db";
import { durableDatabase } from "@/lib/sql";
import { encrypt } from "@/lib/crypto";
import { guardPrompt } from "@/lib/guard";
import { demoPageTitle, demoReply, isDemo } from "@/lib/demo";
import { locateOnSite, pageKey, samePage } from "@/lib/locate";
import { planPrompt, type Task } from "@/lib/planner";
import type { PostKind } from "@/lib/types";
import { listContent, testConnection, WpError } from "@/lib/wp";

export async function loginAction(_state: { error: string } | null, formData: FormData) {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  let user: Awaited<ReturnType<typeof signIn>> = null;
  try {
    user = await signIn(email, password);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Inloggen lukt niet." };
  }
  if (!user) return { error: "Onbekend e-mailadres of wachtwoord." };
  redirect("/");
}

export async function logoutAction() {
  await signOut();
  redirect("/login");
}

export async function createClientAction(_state: { error: string } | null, formData: FormData) {
  await requireRole("admin");
  if (process.env.VERCEL && !durableDatabase()) {
    return {
      error:
        "Klanten blijven zo niet staan. Koppel in Vercel bij Storage een Postgres-database aan dit project, en zet APP_SECRET bij Environment Variables.",
    };
  }
  const name = String(formData.get("name") || "").trim();
  const siteUrl = String(formData.get("siteUrl") || "").trim();
  const username = String(formData.get("username") || "").trim();
  const appPassword = String(formData.get("appPassword") || "").trim();
  if (!name || !siteUrl || !username || !appPassword) {
    return { error: "Naam, site, gebruiker en applicatiewachtwoord zijn nodig." };
  }
  const id = randomBytes(8).toString("hex");
  let encrypted = "";
  try {
    encrypted = encrypt(appPassword);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Het wachtwoord kan niet worden opgeslagen." };
  }
  const row = {
    id,
    name,
    site_url: siteUrl,
    wp_username: username,
    wp_app_password_enc: encrypted,
    created_at: Date.now(),
  };
  try {
    await testConnection(row);
  } catch (error) {
    const message = error instanceof WpError ? error.message : "De site reageert niet.";
    return { error: `Geen verbinding met WaaS. ${message}` };
  }
  try {
    await (await db())
      .prepare(
        "insert into clients (id, name, site_url, wp_username, wp_app_password_enc, created_at) values (?, ?, ?, ?, ?, ?)",
      )
      .run(id, name, siteUrl, username, row.wp_app_password_enc, row.created_at);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "De klant is niet opgeslagen." };
  }
  revalidatePath("/");
  redirect(`/klanten/${id}`);
}

export async function deleteClientAction(formData: FormData) {
  await requireRole("admin");
  const id = String(formData.get("id") || "");
  if (String(formData.get("sure") || "") !== "ja") return;
  const database = await db();
  await database.prepare("delete from assignments where client_id = ?").run(id);
  await database.prepare("delete from schemas where client_id = ?").run(id);
  await database.prepare("delete from messages where client_id = ?").run(id);
  await database.prepare("delete from seo_meta where client_id = ?").run(id);
  await database.prepare("delete from clients where id = ?").run(id);
  revalidatePath("/");
  redirect("/");
}

export async function revealCredentials(clientId: string) {
  await requireRole("admin");
  const client = await clientById(clientId);
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
  if (!(await knownClients(clients))) return { error: "Onbekende klant." };
  const id = randomBytes(8).toString("hex");
  try {
    await (await db())
      .prepare("insert into users (id, name, email, password_hash, role) values (?, ?, ?, ?, ?)")
      .run(id, name, email, hashSync(password, 10), role);
  } catch {
    return { error: "Dit e-mailadres bestaat al." };
  }
  if (role !== "admin") await saveAssignments(id, clients);
  revalidatePath("/gebruikers");
  return { error: "" };
}

export async function assignClientsAction(_state: { error: string } | null, formData: FormData) {
  await requireRole("admin");
  const userId = String(formData.get("userId") || "");
  const target = await userById(userId);
  if (!target) return { error: "Gebruiker niet gevonden." };
  if (target.role === "admin") return { error: "Een beheerder ziet alle klanten. Daar valt niets aan te koppelen." };
  const clients = [...new Set(formData.getAll("clients").map(String).filter(Boolean))];
  if (target.role === "klant" && clients.length > 1) return { error: "Een klant koppel je aan één site." };
  if (!(await knownClients(clients))) return { error: "Onbekende klant." };
  await saveAssignments(userId, clients);
  revalidatePath("/gebruikers");
  return { error: "" };
}

async function knownClients(ids: string[]) {
  const rows = (await (await db()).prepare("select id from clients").all()) as { id: string }[];
  const known = new Set(rows.map((row) => row.id));
  return ids.every((id) => known.has(id));
}

async function saveAssignments(userId: string, clientIds: string[]) {
  const database = await db();
  await database.prepare("delete from assignments where user_id = ?").run(userId);
  const insert = database.prepare("insert into assignments (user_id, client_id) values (?, ?)");
  for (const clientId of clientIds) await insert.run(userId, clientId);
}

export async function refreshCatalogAction(formData: FormData) {
  const user = await requireUser();
  const clientId = String(formData.get("clientId") || "");
  if (!(await canAccess(user, clientId))) return;
  const client = await clientById(clientId);
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
  if (!(await canAccess(user, clientId))) return { error: "Geen toegang tot deze klant.", match: null };
  const client = await clientById(clientId);
  if (!client) return { error: "Klant niet gevonden.", match: null };
  const located = locateOnSite(client.site_url, String(formData.get("url") || ""));
  if ("error" in located) return { error: located.error, match: null };
  if (isDemo(client.id)) {
    const link = String(formData.get("url") || "").trim();
    return {
      error: "",
      match: { title: demoPageTitle(located.key.path), kind: "pages", postId: 1, link },
    };
  }
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
  if (!(await canAccess(user, clientId))) return { error: "Geen toegang tot deze klant." };
  const client = await clientById(clientId);
  if (!client) return { error: "Klant niet gevonden." };
  const prompt = String(formData.get("prompt") || "").trim();
  if (!prompt) return { error: "Schrijf eerst wat er moet gebeuren." };
  const kindValue = String(formData.get("kind") || "");
  const kind = kindValue === "pages" || kindValue === "cases" || kindValue === "posts" ? kindValue : null;
  const postId = Number(formData.get("postId") || 0) || null;
  const taskValue = String(formData.get("task") || "");
  const task = TASKS.find((item) => item === taskValue) ?? null;
  const file = formData.get("image");
  if (isDemo(client.id)) {
    const names: Record<string, string> = {
      seo: "SEO aanpassen",
      text: "Tekst wijzigen",
      image: "Afbeelding wijzigen",
      case: "Case toevoegen",
      blog: "Blog toevoegen",
      block: "Nieuw blok toevoegen",
    };
    return { error: "", notice: demoReply(names[task || ""] || "aanpassing", prompt) };
  }
  await addMessage(clientId, user.id, "user", prompt);
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
  await addMessage(clientId, user.id, "assistant", reply);
  revalidatePath(`/klanten/${clientId}`);
  return { error: "", notice: reply };
}

export async function addBlockAction(_state: { error: string } | null, formData: FormData) {
  const user = await requireUser();
  const clientId = String(formData.get("clientId") || "");
  if (!(await canAccess(user, clientId))) return { error: "Geen toegang tot deze klant." };
  const client = await clientById(clientId);
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
  if (isDemo(client.id)) {
    return { error: "", notice: demoReply("Nieuw blok toevoegen", `${layout}\n${heading}\n${text}`) };
  }
  await addMessage(clientId, user.id, "user", `Voeg blok ${layout} toe. ${heading} ${text}`.trim());
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
  await addMessage(clientId, user.id, "assistant", reply);
  revalidatePath(`/klanten/${clientId}`);
  return { error: reply.startsWith("“") || reply.includes("niet") ? reply : "", notice: reply };
}

export async function loadMessages(clientId: string) {
  return messagesFor(clientId);
}
