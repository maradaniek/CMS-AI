"use server";

import { hashSync } from "bcryptjs";
import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole, requireUser, signIn, signOut } from "@/lib/auth";
import {
  addExistingBlock,
  addFaqBlock,
  addMessage,
  addSharedBlock,
  addSharedFaq,
  catalogFor,
  demoOutline,
  matchUrls,
  messagesFor,
  outlineFrom,
  replacePageImage,
  replacePageText,
  runPlan,
} from "@/lib/content";
import { canAccess, clientById, db, userById } from "@/lib/db";
import { durableDatabase } from "@/lib/sql";
import { encrypt } from "@/lib/crypto";
import { guardPrompt } from "@/lib/guard";
import { demoPageTitle, demoReply, isDemo, isFaqLayout } from "@/lib/demo";
import { parseFaqs } from "@/lib/faq";
import { locateOnSite, pageKey, samePage } from "@/lib/locate";
import { parsePlace, snippetBlockReason, snippetHint } from "@/lib/place";
import { planPrompt, type Task } from "@/lib/planner";
import type { PostKind } from "@/lib/types";
import { applyBulk, planBulk } from "@/lib/bulk";
import { applyLiveSpelling, promoteLiveHeadings } from "@/lib/check-fixes";
import { demoSeoAudit, loadLivePages, runSeoAudit, type SeoAudit } from "@/lib/seo-audit";
import { allowWords, dutchSpell } from "@/lib/spell";
import { auditAddress, auditSpelling, demoAddressAudit, demoSpellAudit, type AddressAudit, type SpellAudit } from "@/lib/text-audit";
import { getContent, listContent, testConnection, WpError } from "@/lib/wp";

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

const TASKS: Task[] = ["seo", "text", "image", "case", "blog", "block", "faq"];

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
  const names: Record<string, string> = {
    seo: "SEO aanpassen",
    text: "Tekst wijzigen",
    image: "Afbeelding wijzigen",
    case: "Case toevoegen",
    blog: "Blog toevoegen",
    block: "Nieuw blok toevoegen",
    faq: "FAQ toevoegen",
  };
  if (task === "faq") {
    const items = parseFaqs(prompt);
    if (!items.length) {
      return { error: "Zet elke vraag op zichzelf. Bijvoorbeeld:\n\nVraag: Wat kost het?\nAntwoord: Vanaf 6.900 euro." };
    }
    const faqLayout = String(formData.get("faqLayout") || "");
    const layout = isFaqLayout(faqLayout) ? faqLayout : "faqsimple";
    if (!kind || !postId) return { error: "Plak eerst de URL van de pagina waar de FAQ op moet." };
    if (isDemo(client.id)) {
      return {
        error: "",
        notice: `${demoReply(names.faq, prompt)}\n\n${items.length} vragen zouden in ${layout} komen. Er is niets live gezet.`,
      };
    }
    await addMessage(clientId, user.id, "user", prompt);
    let reply = "";
    try {
      const catalog = await catalogFor(client);
      const heading = prompt.match(/^\s*kop\s*:\s*(.+)$/im)?.[1]?.trim();
      reply = await addFaqBlock(client, catalog, kind, postId, layout, items, heading);
    } catch (error) {
      reply = error instanceof WpError ? error.message : "De FAQ is niet toegevoegd.";
    }
    await addMessage(clientId, user.id, "assistant", reply);
    revalidatePath(`/klanten/${clientId}`);
    return { error: "", notice: reply };
  }
  if (isDemo(client.id)) {
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
      place: parsePlace(String(formData.get("place") || "")),
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

export async function seoAuditAction(
  _state: { error: string; report: SeoAudit | null } | null,
  formData: FormData,
) {
  const user = await requireUser();
  const clientId = String(formData.get("clientId") || "");
  if (!(await canAccess(user, clientId))) return { error: "Geen toegang tot deze klant.", report: null };
  const client = await clientById(clientId);
  if (!client) return { error: "Klant niet gevonden.", report: null };
  const keyword = String(formData.get("keyword") || "").trim();
  if (isDemo(client.id)) return { error: "", report: demoSeoAudit(keyword) };
  try {
    return { error: "", report: await runSeoAudit(client, keyword) };
  } catch (error) {
    return { error: error instanceof WpError ? error.message : "De SEO-check is niet gelukt.", report: null };
  }
}

export async function spellingAuditAction(
  _state: { error: string; report: SpellAudit | null } | null,
  formData: FormData,
) {
  const user = await requireUser();
  const clientId = String(formData.get("clientId") || "");
  if (!(await canAccess(user, clientId))) return { error: "Geen toegang tot deze klant.", report: null };
  const client = await clientById(clientId);
  if (!client) return { error: "Klant niet gevonden.", report: null };
  if (isDemo(client.id)) return { error: "", report: demoSpellAudit() };
  try {
    const pages = await loadLivePages(client);
    const spell = await dutchSpell();
    return { error: "", report: auditSpelling(pages, spell, allowWords(client.name, client.site_url)) };
  } catch (error) {
    return { error: error instanceof WpError ? error.message : "De spellingcheck is niet gelukt.", report: null };
  }
}

export async function styleAuditAction(
  _state: { error: string; report: AddressAudit | null } | null,
  formData: FormData,
) {
  const user = await requireUser();
  const clientId = String(formData.get("clientId") || "");
  if (!(await canAccess(user, clientId))) return { error: "Geen toegang tot deze klant.", report: null };
  const client = await clientById(clientId);
  if (!client) return { error: "Klant niet gevonden.", report: null };
  if (isDemo(client.id)) return { error: "", report: demoAddressAudit() };
  try {
    return { error: "", report: auditAddress(await loadLivePages(client)) };
  } catch (error) {
    return { error: error instanceof WpError ? error.message : "De stijlcheck is niet gelukt.", report: null };
  }
}

export async function bulkAction(_state: { error: string; notice: string } | null, formData: FormData) {
  const user = await requireUser();
  const clientId = String(formData.get("clientId") || "");
  if (!(await canAccess(user, clientId))) return { error: "Geen toegang tot deze klant.", notice: "" };
  const client = await clientById(clientId);
  if (!client) return { error: "Klant niet gevonden.", notice: "" };
  const prompt = String(formData.get("prompt") || "").trim();
  if (!prompt) return { error: "Schrijf eerst wat er moet gebeuren.", notice: "" };
  const task = String(formData.get("task") || "");
  const guarded = guardPrompt(prompt);
  if (!guarded.allowed) return { error: guarded.message, notice: "" };
  const plan = planBulk(task, prompt);
  if (plan.kind === "clarify") return { error: plan.message, notice: "" };
  if (isDemo(client.id)) {
    return { error: "", notice: `${demoReply("bulk op de hele site", prompt)}\nEr is niets op de pagina’s gezet.` };
  }
  try {
    const notice = await applyBulk(client, plan);
    await addMessage(clientId, user.id, "user", prompt);
    await addMessage(clientId, user.id, "assistant", notice);
    revalidatePath(`/klanten/${clientId}`);
    return { error: "", notice };
  } catch (error) {
    return { error: error instanceof WpError ? error.message : "De bulk-wijziging is niet gelukt.", notice: "" };
  }
}

async function openClient(formData: FormData) {
  const user = await requireUser();
  const clientId = String(formData.get("clientId") || "");
  if (!(await canAccess(user, clientId))) return { error: "Geen toegang tot deze klant." };
  const client = await clientById(clientId);
  if (!client) return { error: "Klant niet gevonden." };
  return { error: "", user, clientId, client };
}

function faqItems(formData: FormData) {
  return parseFaqs(String(formData.get("faqs") || ""));
}

function fileOf(formData: FormData) {
  const file = formData.get("image");
  return file instanceof File && file.size > 0 ? file : null;
}

export async function createDraftAction(_state: { error: string; notice: string } | null, formData: FormData) {
  const opened = await openClient(formData);
  if (!opened.client) return { error: opened.error, notice: "" };
  const task = formData.get("task") === "case" ? "case" : "blog";
  const title = String(formData.get("title") || "").trim();
  const text = String(formData.get("text") || "").trim();
  const stats = String(formData.get("stats") || "").trim();
  if (!title) return { error: "Vul een titel in.", notice: "" };
  const guarded = guardPrompt(`${title}\n${text}\n${stats}`);
  if (!guarded.allowed) return { error: guarded.message, notice: "" };
  const prompt = [`Titel: ${title}`, text ? `Tekst: ${text}` : "", stats ? `Cijfers: ${stats}` : ""].filter(Boolean).join("\n");
  if (isDemo(opened.client.id)) {
    return { error: "", notice: demoReply(task === "case" ? "Case toevoegen" : "Blog toevoegen", prompt) };
  }
  await addMessage(opened.clientId, opened.user.id, "user", prompt);
  let reply = "";
  try {
    const catalog = await catalogFor(opened.client);
    const plan = planPrompt(prompt, catalog, false, task);
    reply = await runPlan({ client: opened.client, plan, kind: null, postId: null, file: fileOf(formData) });
  } catch (error) {
    reply = error instanceof WpError ? error.message : "Het concept is niet aangemaakt.";
  }
  await addMessage(opened.clientId, opened.user.id, "assistant", reply);
  revalidatePath(`/klanten/${opened.clientId}`);
  return { error: "", notice: reply };
}

export async function inspectPageAction(
  _state: {
    error: string;
    title: string;
    link: string;
    kind: PostKind | null;
    postId: number | null;
    blocks: { index: number; layout: string; label: string; preview: string; hasImage: boolean; hasText: boolean; shared: boolean }[];
  } | null,
  formData: FormData,
) {
  const empty = { error: "", title: "", link: "", kind: null, postId: null, blocks: [] };
  const opened = await openClient(formData);
  if (!opened.client) return { ...empty, error: opened.error };
  const located = locateOnSite(opened.client.site_url, String(formData.get("url") || ""));
  if ("error" in located) return { ...empty, error: located.error };
  if (isDemo(opened.client.id)) {
    const link = String(formData.get("url") || "").trim();
    return {
      error: "",
      title: demoPageTitle(located.key.path),
      link,
      kind: "pages" as const,
      postId: 1,
      blocks: demoOutline().map(({ index, layout, label, preview, hasImage, hasText, shared }) => ({
        index,
        layout,
        label,
        preview,
        hasImage,
        hasText,
        shared,
      })),
    };
  }
  const kinds: PostKind[] = ["pages", "cases", "posts"];
  try {
    for (const kind of kinds) {
      const items = await listContent(opened.client, kind);
      const hit = items.find((item) => {
        const key = pageKey(item.link);
        return key ? samePage(key, located.key) : false;
      });
      if (!hit) continue;
      const post = await getContent(opened.client, kind, hit.id);
      const catalog = await catalogFor(opened.client);
      return {
        error: "",
        title: hit.title,
        link: hit.link,
        kind,
        postId: hit.id,
        blocks: outlineFrom(post.acf?.content, catalog).map(({ index, layout, label, preview, hasImage, hasText, shared }) => ({
          index,
          layout,
          label,
          preview,
          hasImage,
          hasText,
          shared,
        })),
      };
    }
  } catch (error) {
    return { ...empty, error: error instanceof WpError ? error.message : "De pagina is niet opgehaald." };
  }
  return { ...empty, error: "Deze URL is geen pagina, blog of case op deze site." };
}

export async function faqAction(_state: { error: string; notice: string } | null, formData: FormData) {
  const opened = await openClient(formData);
  if (!opened.client) return { error: opened.error, notice: "" };
  const items = faqItems(formData);
  if (!items.length) {
    return {
      error: "Plak de vragen in één keer. Bijvoorbeeld:\n\nVraag: Wat kost het?\nAntwoord: Vanaf 6.900 euro.",
      notice: "",
    };
  }
  const many = String(formData.get("many") || "") === "yes";
  const layout = isFaqLayout(String(formData.get("faqLayout") || "")) ? String(formData.get("faqLayout") || "") : "faqsimple";
  const heading = String(formData.get("heading") || "").trim();
  const guarded = guardPrompt(items.map((item) => `${item.question} ${item.answer}`).join("\n") + heading);
  if (!guarded.allowed) return { error: guarded.message, notice: "" };
  if (many) {
    const matched = await matchUrls(opened.client, String(formData.get("urls") || ""));
    if (!matched.hits.length) return { error: matched.bad[0] || "Plak de URL's van de pagina's.", notice: "" };
    if (isDemo(opened.client.id)) {
      return {
        error: "",
        notice: `${demoReply("FAQ toevoegen", items.map((item) => item.question).join(", "))}\nEr zou één snippet komen op ${matched.hits.length} pagina's, boven de footer.${matched.bad.length ? ` Overgeslagen: ${matched.bad.join(" ")}` : ""}`,
      };
    }
    let reply = "";
    try {
      const catalog = await catalogFor(opened.client);
      reply = await addSharedFaq(opened.client, catalog, matched.hits, layout, items, heading);
      if (matched.bad.length) reply += ` Overgeslagen: ${matched.bad.join(" ")}`;
    } catch (error) {
      reply = error instanceof WpError ? error.message : "De FAQ-snippet is niet gezet.";
    }
    await addMessage(opened.clientId, opened.user.id, "user", `FAQ op ${matched.hits.length} pagina's`);
    await addMessage(opened.clientId, opened.user.id, "assistant", reply);
    revalidatePath(`/klanten/${opened.clientId}`);
    return { error: "", notice: reply };
  }
  const kindValue = String(formData.get("kind") || "");
  const kind = kindValue === "pages" || kindValue === "cases" || kindValue === "posts" ? kindValue : null;
  const postId = Number(formData.get("postId") || 0) || null;
  if (!kind || !postId) return { error: "Plak eerst de URL van die ene pagina.", notice: "" };
  if (isDemo(opened.client.id)) {
    return { error: "", notice: `${demoReply("FAQ toevoegen", items[0].question)}\n${items.length} vragen zouden direct op de pagina komen, zonder snippet.` };
  }
  let reply = "";
  try {
    const catalog = await catalogFor(opened.client);
    reply = await addFaqBlock(opened.client, catalog, kind, postId, layout, items, heading);
  } catch (error) {
    reply = error instanceof WpError ? error.message : "De FAQ is niet toegevoegd.";
  }
  await addMessage(opened.clientId, opened.user.id, "user", `FAQ op één pagina`);
  await addMessage(opened.clientId, opened.user.id, "assistant", reply);
  revalidatePath(`/klanten/${opened.clientId}`);
  return { error: "", notice: reply };
}

export async function seoFieldsAction(_state: { error: string; notice: string } | null, formData: FormData) {
  const opened = await openClient(formData);
  if (!opened.client) return { error: opened.error, notice: "" };
  const seoTitle = String(formData.get("seoTitle") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const keyword = String(formData.get("keyword") || "").trim();
  if (!seoTitle && !description && !keyword) return { error: "Vul een SEO-titel, meta-omschrijving of focuswoord in.", notice: "" };
  const kindValue = String(formData.get("kind") || "");
  const kind = kindValue === "pages" || kindValue === "cases" || kindValue === "posts" ? kindValue : null;
  const postId = Number(formData.get("postId") || 0) || null;
  if (!kind || !postId) return { error: "Plak eerst de URL van de pagina.", notice: "" };
  const prompt = `SEO-titel: ${seoTitle}. Meta-omschrijving: ${description}. Focuswoord: ${keyword}`;
  const guarded = guardPrompt(prompt);
  if (!guarded.allowed) return { error: guarded.message, notice: "" };
  if (isDemo(opened.client.id)) return { error: "", notice: demoReply("SEO aanpassen", prompt) };
  let reply = "";
  try {
    reply = await runPlan({
      client: opened.client,
      plan: { kind: "seo-meta", seoTitle, description, keyword },
      kind,
      postId,
      file: null,
    });
  } catch (error) {
    reply = error instanceof WpError ? error.message : "De SEO is niet opgeslagen.";
  }
  await addMessage(opened.clientId, opened.user.id, "user", prompt);
  await addMessage(opened.clientId, opened.user.id, "assistant", reply);
  revalidatePath(`/klanten/${opened.clientId}`);
  return { error: "", notice: reply };
}

export async function replaceTextAction(_state: { error: string; notice: string } | null, formData: FormData) {
  const opened = await openClient(formData);
  if (!opened.client) return { error: opened.error, notice: "" };
  const from = String(formData.get("from") || "").trim();
  const to = String(formData.get("to") || "").trim();
  const index = Number(formData.get("index"));
  if (!from || !to) return { error: "Plak de oude zin en schrijf de nieuwe zin.", notice: "" };
  if (!Number.isInteger(index) || index < 0) return { error: "Kies eerst het blok op de pagina.", notice: "" };
  const kindValue = String(formData.get("kind") || "");
  const kind = kindValue === "pages" || kindValue === "cases" || kindValue === "posts" ? kindValue : null;
  const postId = Number(formData.get("postId") || 0) || null;
  if (!kind || !postId) return { error: "Plak eerst de URL.", notice: "" };
  const guarded = guardPrompt(`${from}\n${to}`);
  if (!guarded.allowed) return { error: guarded.message, notice: "" };
  if (isDemo(opened.client.id)) return { error: "", notice: demoReply("Tekst wijzigen", `${from} → ${to}`) };
  let reply = "";
  try {
    const catalog = await catalogFor(opened.client);
    reply = await replacePageText(opened.client, catalog, kind, postId, index, from, to);
  } catch (error) {
    reply = error instanceof WpError ? error.message : "De tekst is niet gewijzigd.";
  }
  await addMessage(opened.clientId, opened.user.id, "user", `Vervang “${from}” door “${to}”`);
  await addMessage(opened.clientId, opened.user.id, "assistant", reply);
  revalidatePath(`/klanten/${opened.clientId}`);
  return { error: "", notice: reply };
}

export async function replaceImageAction(_state: { error: string; notice: string } | null, formData: FormData) {
  const opened = await openClient(formData);
  if (!opened.client) return { error: opened.error, notice: "" };
  const file = fileOf(formData);
  const index = Number(formData.get("index"));
  if (!file) return { error: "Kies de nieuwe afbeelding.", notice: "" };
  if (!Number.isInteger(index) || index < 0) return { error: "Kies eerst het blok op de pagina.", notice: "" };
  const kindValue = String(formData.get("kind") || "");
  const kind = kindValue === "pages" || kindValue === "cases" || kindValue === "posts" ? kindValue : null;
  const postId = Number(formData.get("postId") || 0) || null;
  if (!kind || !postId) return { error: "Plak eerst de URL.", notice: "" };
  if (isDemo(opened.client.id)) return { error: "", notice: demoReply("Afbeelding wijzigen", `blok ${index + 1}`) };
  let reply = "";
  try {
    const catalog = await catalogFor(opened.client);
    reply = await replacePageImage(opened.client, catalog, kind, postId, index, file);
  } catch (error) {
    reply = error instanceof WpError ? error.message : "De afbeelding is niet gewijzigd.";
  }
  await addMessage(opened.clientId, opened.user.id, "user", `Nieuwe afbeelding in blok ${index + 1}`);
  await addMessage(opened.clientId, opened.user.id, "assistant", reply);
  revalidatePath(`/klanten/${opened.clientId}`);
  return { error: "", notice: reply };
}

export async function addSharedBlockAction(_state: { error: string; notice?: string } | null, formData: FormData) {
  const opened = await openClient(formData);
  if (!opened.client) return { error: opened.error, notice: "" };
  const layout = String(formData.get("layout") || "");
  const reason = snippetBlockReason(layout);
  if (reason) return { error: reason, notice: "" };
  const heading = String(formData.get("heading") || "").trim();
  const text = String(formData.get("text") || "").trim();
  const guarded = guardPrompt(`${heading}\n${text}`);
  if (!guarded.allowed) return { error: guarded.message, notice: "" };
  const place = parsePlace(String(formData.get("place") || ""));
  if (place.startsWith("after:")) return { error: "In bulk kan de plek alleen onder de hero of boven de footer.", notice: "" };
  if (isDemo(opened.client.id)) {
    const hint = snippetHint(layout);
    return {
      error: "",
      notice: `${demoReply("Nieuw blok toevoegen", layout)}\nEr zou één snippet komen, ${place === "under-hero" ? "onder de hero" : "boven de footer"}, op elke gepubliceerde pagina.${hint ? ` ${hint}` : ""}`,
    };
  }
  let reply = "";
  try {
    const catalog = await catalogFor(opened.client);
    reply = await addSharedBlock(opened.client, catalog, layout, { heading, text, file: fileOf(formData), place });
    const hint = snippetHint(layout);
    if (hint) reply += ` ${hint}`;
  } catch (error) {
    reply = error instanceof WpError ? error.message : "Het blok is niet op de pagina's gezet.";
  }
  await addMessage(opened.clientId, opened.user.id, "user", `Snippet ${layout} ${place}`);
  await addMessage(opened.clientId, opened.user.id, "assistant", reply);
  revalidatePath(`/klanten/${opened.clientId}`);
  return { error: "", notice: reply };
}

export async function promoteHeadingsAction(_state: { error: string; notice: string } | null, formData: FormData) {
  const opened = await openClient(formData);
  if (!opened.client) return { error: opened.error, notice: "" };
  let notice = "";
  try {
    notice = await promoteLiveHeadings(opened.client);
  } catch (error) {
    return { error: error instanceof WpError ? error.message : "De koppen zijn niet aangepast.", notice: "" };
  }
  if (!isDemo(opened.client.id)) {
    await addMessage(opened.clientId, opened.user.id, "user", "H3's vervangen door H2's");
    await addMessage(opened.clientId, opened.user.id, "assistant", notice);
    revalidatePath(`/klanten/${opened.clientId}`);
  }
  return { error: "", notice };
}

export async function applySpellingAction(_state: { error: string; notice: string } | null, formData: FormData) {
  const opened = await openClient(formData);
  if (!opened.client) return { error: opened.error, notice: "" };
  let notice = "";
  try {
    notice = await applyLiveSpelling(opened.client);
  } catch (error) {
    return { error: error instanceof WpError ? error.message : "De spelling is niet doorgevoerd.", notice: "" };
  }
  if (!isDemo(opened.client.id)) {
    await addMessage(opened.clientId, opened.user.id, "user", "Spelling doorvoeren");
    await addMessage(opened.clientId, opened.user.id, "assistant", notice);
    revalidatePath(`/klanten/${opened.clientId}`);
  }
  return { error: "", notice };
}
