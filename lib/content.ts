import { randomBytes } from "crypto";
import { buildBlock, coerceAcf, patchBlockImage, patchBlockText } from "@/lib/acf";
import { analyzeSeo } from "@/lib/seo";
import { layoutLabel } from "@/lib/labels";
import { demoCatalog, isDemo, isFaqLayout } from "@/lib/demo";
import { plainText, sanitizeRichText } from "@/lib/sanitize";
import { db, type ClientRow } from "@/lib/db";
import type { Plan } from "@/lib/planner";
import type { BlockDef, PageBlock, PostKind, SeoReport } from "@/lib/types";
import {
  createContent,
  fetchCatalog,
  getContent,
  saveContent,
  updateRankMath,
  uploadMedia,
  wp,
  WpError,
} from "@/lib/wp";

const DAY = 24 * 60 * 60 * 1000;

export async function catalogFor(client: ClientRow, force = false): Promise<BlockDef[]> {
  if (isDemo(client.id)) return demoCatalog();
  const cached = (await (await db())
    .prepare("select catalog_json, fetched_at from schemas where client_id = ?")
    .get(client.id)) as { catalog_json: string; fetched_at: number } | undefined;
  if (cached && !force && Date.now() - Number(cached.fetched_at) < DAY) {
    return JSON.parse(cached.catalog_json) as BlockDef[];
  }
  const catalog = await fetchCatalog(client);
  await (await db())
    .prepare(
      `insert into schemas (client_id, catalog_json, fetched_at) values (?, ?, ?)
       on conflict(client_id) do update set catalog_json = excluded.catalog_json, fetched_at = excluded.fetched_at`,
    )
    .run(client.id, JSON.stringify(catalog), Date.now());
  return catalog;
}

export async function rememberedSeo(clientId: string, kind: PostKind, postId: number) {
  return (
    ((await (await db())
      .prepare("select seo_title, description, keyword from seo_meta where client_id = ? and post_type = ? and post_id = ?")
      .get(clientId, kind, postId)) as { seo_title: string; description: string; keyword: string } | undefined) ?? {
      seo_title: "",
      description: "",
      keyword: "",
    }
  );
}

export async function rememberSeo(
  clientId: string,
  kind: PostKind,
  postId: number,
  meta: { seoTitle?: string; description?: string; keyword?: string },
) {
  const current = await rememberedSeo(clientId, kind, postId);
  await (await db())
    .prepare(
      `insert into seo_meta (client_id, post_type, post_id, seo_title, description, keyword)
       values (?, ?, ?, ?, ?, ?)
       on conflict(client_id, post_type, post_id) do update set
         seo_title = excluded.seo_title,
         description = excluded.description,
         keyword = excluded.keyword`,
    )
    .run(
      clientId,
      kind,
      postId,
      meta.seoTitle ?? current.seo_title,
      meta.description ?? current.description,
      meta.keyword ?? current.keyword,
    );
}

export function blocksOf(content: unknown, catalog: BlockDef[]): PageBlock[] {
  if (!Array.isArray(content)) return [];
  return content.map((block, index) => {
    const record = (block ?? {}) as Record<string, unknown>;
    const layout = String(record.acf_fc_layout ?? "");
    const def = catalog.find((item) => item.layout === layout) ?? null;
    const heading = plainText(String(record.heading ?? record.title ?? record.intro_heading ?? ""));
    const text = plainText(String(record.text ?? record.wysiwyg ?? record.description ?? record.quote ?? ""));
    return { index, layout, label: def?.label ?? layoutLabel(layout), heading, text, def };
  });
}

function findLayout(catalog: BlockDef[], names: string[]) {
  for (const name of names) {
    const found = catalog.find((block) => block.layout === name);
    if (found) return found;
  }
  return null;
}

function contentArray(post: { acf?: { content?: unknown } }) {
  const content = post.acf?.content;
  if (!Array.isArray(content)) {
    throw new WpError("Deze pagina heeft geen themablokken. Ik schrijf niet in losse HTML of CSS.");
  }
  return content as Record<string, unknown>[];
}

export async function runPlan(input: {
  client: ClientRow;
  plan: Plan;
  kind: PostKind | null;
  postId: number | null;
  file: File | null;
}): Promise<string> {
  const catalog = await catalogFor(input.client);
  const plan = input.plan;

  if (plan.kind === "clarify" || plan.kind === "refuse") return plan.message;

  if (plan.kind === "seo" || plan.kind === "seo-meta" || plan.kind === "update-text" || plan.kind === "update-image" || plan.kind === "add-block" || plan.kind === "publish") {
    if (!input.kind || !input.postId) return "Plak eerst de URL van de pagina.";
  }

  if (plan.kind === "seo" || plan.kind === "seo-meta") {
    return seoReply(input.client, catalog, input.kind!, input.postId!, plan);
  }
  if (plan.kind === "update-text") {
    return updateText(input.client, catalog, input.kind!, input.postId!, plan);
  }
  if (plan.kind === "update-image") {
    if (!input.file || input.file.size === 0) return "Kies de nieuwe afbeelding bij de prompt.";
    return updateImage(input.client, catalog, input.kind!, input.postId!, plan, input.file);
  }
  if (plan.kind === "add-block") {
    return addExistingBlock(input.client, catalog, input.kind!, input.postId!, plan.layout, {
      heading: plan.heading,
      text: plan.text,
      file: input.file,
    });
  }
  if (plan.kind === "publish") {
    return publishDraft(input.client, input.kind!, input.postId!);
  }
  if (plan.kind === "create-blog") return createBlog(input.client, catalog, plan, input.file);
  if (plan.kind === "create-case") return createCase(input.client, catalog, plan, input.file);
  return "Dit kan ik niet uitvoeren.";
}

async function seoReply(
  client: ClientRow,
  catalog: BlockDef[],
  kind: PostKind,
  postId: number,
  plan: Extract<Plan, { kind: "seo" | "seo-meta" }>,
) {
  if (plan.kind === "seo-meta") {
    const meta: Record<string, string> = {};
    if (plan.seoTitle) meta.rank_math_title = plan.seoTitle;
    if (plan.description) meta.rank_math_description = plan.description;
    if (plan.keyword) meta.rank_math_focus_keyword = plan.keyword;
    if (!Object.keys(meta).length) return "Zet erbij wat de SEO-titel, meta-omschrijving of het focuswoord moet worden.";
    await updateRankMath(client, postId, meta);
    await rememberSeo(client.id, kind, postId, {
      seoTitle: plan.seoTitle,
      description: plan.description,
      keyword: plan.keyword,
    });
  } else if (plan.keyword) {
    await rememberSeo(client.id, kind, postId, { keyword: plan.keyword });
    await updateRankMath(client, postId, { rank_math_focus_keyword: plan.keyword }).catch(() => undefined);
  }
  const report = await reportFor(client, catalog, kind, postId);
  return formatReport(report);
}

export async function reportFor(client: ClientRow, catalog: BlockDef[], kind: PostKind, postId: number) {
  const post = await getContent(client, kind, postId);
  const blocks = Array.isArray(post.acf?.content) ? post.acf.content : [];
  const stored = await rememberedSeo(client.id, kind, postId);
  let seoTitle = stored.seo_title;
  let description = stored.description;
  if (post.status === "publish" && post.link && (!seoTitle || !description)) {
    const { readPublicSeo } = await import("@/lib/wp");
    const live = await readPublicSeo(post.link);
    seoTitle = seoTitle || live.title;
    description = description || live.description;
  }
  return analyzeSeo({ blocks, keyword: stored.keyword, seoTitle, description });
}

function formatReport(report: SeoReport) {
  const h1 = report.h1.map((item) => item.text).join(" · ") || "geen";
  const h2 = report.h2.map((item) => item.text).join(" · ") || "geen";
  const checks = report.checks.map((check) => `${check.ok ? "wel" : "niet"}: ${check.detail}`).join(" ");
  return `${report.h1Message} H1: ${h1}. H2: ${h2}. ${checks}`.trim();
}

async function updateText(
  client: ClientRow,
  catalog: BlockDef[],
  kind: PostKind,
  postId: number,
  plan: Extract<Plan, { kind: "update-text" }>,
) {
  const post = await getContent(client, kind, postId);
  const content = contentArray(post);
  const index =
    plan.target === "first"
      ? content.findIndex((block) => block && typeof block === "object")
      : content.findIndex((block) => block.acf_fc_layout === plan.target);
  if (index < 0) {
    return `Ik vind geen ${layoutLabel(plan.target)} op deze pagina. Kies een blok dat er al staat, of voeg er een toe uit het thema.`;
  }
  patchBlockText(content[index], { heading: plan.heading, text: plan.text });
  await saveContent(client, kind, postId, coerceAcf(content));
  const report = await reportFor(client, catalog, kind, postId);
  return `De tekst staat in ${layoutLabel(String(content[index].acf_fc_layout))}. ${report.h1Message}`;
}

async function updateImage(
  client: ClientRow,
  catalog: BlockDef[],
  kind: PostKind,
  postId: number,
  plan: Extract<Plan, { kind: "update-image" }>,
  file: File,
) {
  const post = await getContent(client, kind, postId);
  const content = contentArray(post);
  const index =
    plan.target === "first"
      ? content.findIndex((block) => catalog.find((item) => item.layout === block.acf_fc_layout)?.slots.image)
      : content.findIndex((block) => block.acf_fc_layout === plan.target);
  if (index < 0) return "Op deze pagina vind ik geen blok met een afbeelding. Kies in de prompt het blok, bijvoorbeeld de hero.";
  const layout = String(content[index].acf_fc_layout);
  const def = catalog.find((item) => item.layout === layout);
  if (def && !def.slots.image) return `${def.label} heeft geen afbeeldingsveld in dit thema.`;
  const imageId = await uploadMedia(client, file, def?.label || layout, def?.label || layout);
  patchBlockImage(content[index], imageId);
  await saveContent(client, kind, postId, coerceAcf(content));
  return `De afbeelding staat in ${layoutLabel(layout)}.`;
}

export async function addExistingBlock(
  client: ClientRow,
  catalog: BlockDef[],
  kind: PostKind,
  postId: number,
  layout: string,
  input: { heading?: string; text?: string; file: File | null },
) {
  const def = catalog.find((block) => block.layout === layout);
  if (!def) {
    return `“${layout}” bestaat niet in het thema van deze site. Kies een blok uit het overzicht.`;
  }
  const post = await getContent(client, kind, postId);
  const content = contentArray(post);
  let imageId: number | null = null;
  if (input.file && input.file.size > 0) {
    if (!def.slots.image) return `${def.label} heeft geen afbeeldingsveld in dit thema.`;
    imageId = await uploadMedia(client, input.file, def.label, input.heading || def.label);
  }
  const hasH1 = content.some((block) => String(block.heading_tag_hero) === "h1" || String(block.heading_tag_title) === "h1");
  const block = buildBlock(def, { heading: input.heading, text: input.text, imageId });
  if (def.layout === "hero" && hasH1) block.heading_tag_hero = "h2";
  content.push(block);
  await saveContent(client, kind, postId, coerceAcf(content));
  const report = await reportFor(client, catalog, kind, postId);
  return `${def.label} is toegevoegd via het themaveld. ${report.h1Message}`;
}

export async function addFaqBlock(
  client: ClientRow,
  catalog: BlockDef[],
  kind: PostKind,
  postId: number,
  layout: string,
  items: { question: string; answer: string }[],
  heading?: string,
) {
  const def = catalog.find((block) => block.layout === layout && isFaqLayout(block.layout));
  if (!def) return "Kies een FAQ-blok dat in dit thema bestaat: faq, faqsimple of faqextensive.";
  if (!items.length) return "Zet elke vraag zo: Vraag: …. Antwoord: ….";
  const post = await getContent(client, kind, postId);
  const content = contentArray(post);
  const block = buildBlock(def, {
    heading,
    text:
      layout === "faqextensive"
        ? items
            .map(
              (item) =>
                `<p><strong>${plainText(item.question)}</strong></p><p>${sanitizeRichText(item.answer)}</p>`,
            )
            .join("")
        : undefined,
  });
  if (layout !== "faqextensive") {
    const ids: number[] = [];
    for (const item of items) {
      const created = (await wp(client, "/wp/v2/faqs", {
        method: "POST",
        body: JSON.stringify({
          title: plainText(item.question),
          content: sanitizeRichText(item.answer),
          status: "publish",
        }),
      })) as { id: number };
      ids.push(created.id);
    }
    block[layout === "faq" ? "faq" : "faqs"] = ids;
  }
  content.push(block);
  await saveContent(client, kind, postId, coerceAcf(content));
  return `${items.length} vragen staan in ${def.label} (${def.layout}).`;
}

async function publishDraft(client: ClientRow, kind: PostKind, postId: number) {
  const post = await getContent(client, kind, postId);
  if (post.status === "publish") return "Deze staat al live.";
  if (post.status !== "draft") return "Alleen een concept zet ik live. Verwijderen of offline halen doe ik niet.";
  await wpPublish(client, kind, postId);
  return "Het concept staat live.";
}

async function wpPublish(client: ClientRow, kind: PostKind, postId: number) {
  const { wp } = await import("@/lib/wp");
  await wp(client, `/wp/v2/${kind}/${postId}`, {
    method: "POST",
    body: JSON.stringify({ status: "publish" }),
  });
}

async function createBlog(client: ClientRow, catalog: BlockDef[], plan: Extract<Plan, { kind: "create-blog" }>, file: File | null) {
  const text = findLayout(catalog, ["text", "simpletext"]);
  if (!text) return "Op deze site vind ik geen tekstblok in het thema, dus ik maak de blog niet in losse HTML.";
  let imageId: number | null = null;
  if (file && file.size > 0) imageId = await uploadMedia(client, file, plan.title, plan.title);
  const image = imageId ? findLayout(catalog, ["image", "image_text"]) : null;
  const content = [buildBlock(text, { heading: plan.title, text: plan.text || plan.title })];
  if (image && imageId) content.push(buildBlock(image, { heading: "", text: "", imageId }));
  const created = await createContent(client, "posts", {
    title: plan.title,
    status: "draft",
    acf: { content: coerceAcf(content) },
  });
  return `Concept-blog “${plan.title}” staat klaar (${created.link}). Zeg “publiceer” als hij live mag.`;
}

async function createCase(
  client: ClientRow,
  catalog: BlockDef[],
  plan: Extract<Plan, { kind: "create-case" }>,
  file: File | null,
) {
  const hero = findLayout(catalog, ["hero", "simplehero"]);
  const text = findLayout(catalog, ["text", "simpletext"]);
  if (!hero || !text) return "Voor een case heb ik een hero- en tekstblok uit dit thema nodig. Die zie ik hier niet.";
  let imageId: number | null = null;
  if (file && file.size > 0) imageId = await uploadMedia(client, file, plan.title, plan.title);
  const heroBlock = buildBlock(hero, {
    heading: plan.heading || plan.title,
    text: plan.text,
    imageId,
    stats: plan.stats,
  });
  heroBlock.heading_tag_hero = "h1";
  const content = [heroBlock, buildBlock(text, { text: plan.text || plan.title })];
  const created = await createContent(client, "cases", {
    title: plan.title,
    status: "draft",
    featured_media: imageId ?? undefined,
    acf: { content: coerceAcf(content) },
  });
  return `Concept-case “${plan.title}” staat klaar (${created.link}). Zeg “publiceer” als hij live mag.`;
}

export async function addMessage(clientId: string, userId: string, role: "user" | "assistant", body: string) {
  await (await db())
    .prepare("insert into messages (id, client_id, user_id, role, body, created_at) values (?, ?, ?, ?, ?, ?)")
    .run(randomBytes(8).toString("hex"), clientId, userId, role, body, Date.now());
}

export async function messagesFor(clientId: string) {
  if (isDemo(clientId)) return [];
  return (await db())
    .prepare("select role, body, created_at from messages where client_id = ? order by created_at asc limit 80")
    .all(clientId) as Promise<{ role: string; body: string; created_at: number }[]>;
}
