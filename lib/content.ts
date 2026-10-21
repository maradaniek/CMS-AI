import { randomBytes } from "crypto";
import { buildBlock, coerceAcf, patchBlockImage, patchBlockText } from "@/lib/acf";
import { analyzeSeo } from "@/lib/seo";
import { layoutLabel } from "@/lib/labels";
import { demoCatalog, isDemo, isFaqLayout } from "@/lib/demo";
import { plainText, sanitizeRichText } from "@/lib/sanitize";
import { db, type ClientRow } from "@/lib/db";
import { locateOnSite, pageKey, samePage } from "@/lib/locate";
import type { Plan } from "@/lib/planner";
import { insertBlock, replaceSentence, snippetBlockReason, splitUrls, type Place } from "@/lib/place";
import type { BlockDef, PageBlock, PostKind, SeoReport } from "@/lib/types";
import {
  createContent,
  fetchCatalog,
  getContent,
  listContent,
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

export type PageOutline = PageBlock & { hasImage: boolean; hasText: boolean; shared: boolean; preview: string };

export function outlineFrom(content: unknown, catalog: BlockDef[]): PageOutline[] {
  const records = Array.isArray(content) ? content : [];
  return blocksOf(content, catalog).map((block, index) => {
    const record = (records[index] ?? {}) as Record<string, unknown>;
    const hasImage = Boolean(
      block.def?.slots.image || "image" in record || "background_image" in record || "afbeeldingen" in record,
    );
    const hasText = Boolean(block.heading || block.text || block.def?.slots.text || block.def?.slots.heading || block.def?.slots.quote);
    return {
      ...block,
      hasImage,
      hasText,
      shared: block.layout === "snippet_reference",
      preview: (block.heading || block.text).slice(0, 110),
    };
  });
}

export function demoOutline(): PageOutline[] {
  return outlineFrom(
    [
      { acf_fc_layout: "hero", heading: "Demo hero", text: "Welkom bij de demo.", image: 1 },
      { acf_fc_layout: "text", heading: "Diensten", text: "Dit is een voorbeeldalinea over de diensten." },
      {
        acf_fc_layout: "image_text",
        heading: "Showroom",
        text: "Kom langs in de showroom.",
        image: 2,
      },
    ],
    demoCatalog(),
  );
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
  input: { heading?: string; text?: string; file: File | null; place?: Place },
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
  const placed = insertBlock(content, block, input.place ?? "above-footer", (item) => String(item.acf_fc_layout ?? ""));
  await saveContent(client, kind, postId, coerceAcf(placed.content));
  const report = await reportFor(client, catalog, kind, postId);
  return `${def.label} staat ${placed.where}. ${report.h1Message}`;
}

async function buildFaqBlock(
  client: ClientRow,
  def: BlockDef,
  items: { question: string; answer: string }[],
  heading?: string,
) {
  const block = buildBlock(def, {
    heading,
    text:
      def.layout === "faqextensive"
        ? items
            .map(
              (item) =>
                `<p><strong>${plainText(item.question)}</strong></p><p>${sanitizeRichText(item.answer)}</p>`,
            )
            .join("")
        : undefined,
  });
  if (def.layout !== "faqextensive") {
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
    block[def.layout === "faq" ? "faq" : "faqs"] = ids;
  }
  return block;
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
  if (!items.length) return "Vul minstens één vraag en antwoord in.";
  const post = await getContent(client, kind, postId);
  const content = contentArray(post);
  const block = await buildFaqBlock(client, def, items, heading);
  const placed = insertBlock(content, block, "above-footer", (item) => String(item.acf_fc_layout ?? ""));
  await saveContent(client, kind, postId, coerceAcf(placed.content));
  return `${items.length} vragen staan in ${def.label} op deze pagina, zonder snippet.`;
}

type PageHit = { id: number; kind: PostKind; title: string; link: string };

export async function matchUrls(client: ClientRow, raw: string) {
  const urls = splitUrls(raw);
  if (!urls.length) return { hits: [] as PageHit[], bad: ["Plak minstens één URL."] };
  const bad: string[] = [];
  const wanted: { url: string; key: { host: string; path: string } }[] = [];
  for (const url of urls) {
    const located = locateOnSite(client.site_url, url);
    if ("error" in located) bad.push(`${url}: ${located.error}`);
    else wanted.push({ url, key: located.key });
  }
  if (isDemo(client.id)) {
    return {
      hits: wanted.map((item) => ({
        id: 1,
        kind: "pages" as const,
        title: item.key.path,
        link: item.url,
      })),
      bad,
    };
  }
  const lists = await Promise.all(
    (["pages", "cases", "posts"] as const).map(async (kind) => ({ kind, items: await listContent(client, kind) })),
  );
  const hits: PageHit[] = [];
  for (const item of wanted) {
    let found: PageHit | null = null;
    for (const list of lists) {
      const hit = list.items.find((page) => {
        const key = pageKey(page.link);
        return key ? samePage(key, item.key) : false;
      });
      if (hit) {
        found = { id: hit.id, kind: list.kind, title: hit.title, link: hit.link };
        break;
      }
    }
    if (found) hits.push(found);
    else bad.push(`${item.url}: geen pagina, blog of case op deze site.`);
  }
  return { hits, bad };
}

async function publishedPages(client: ClientRow) {
  const items: { id: number; name: string }[] = [];
  for (let page = 1; page <= 8; page += 1) {
    let batch: { id: number; status?: string; title?: { raw?: string; rendered?: string } }[];
    try {
      batch = (await wp(
        client,
        `/wp/v2/pages?context=edit&status=publish&per_page=50&page=${page}&_fields=id,status,title`,
      )) as { id: number; status?: string; title?: { raw?: string; rendered?: string } }[];
    } catch {
      break;
    }
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const item of batch) {
      if (item.status && item.status !== "publish") continue;
      items.push({ id: item.id, name: item.title?.raw || item.title?.rendered || String(item.id) });
    }
    if (batch.length < 50) break;
  }
  return items;
}

async function createSnippet(client: ClientRow, title: string, block: Record<string, unknown>) {
  const created = (await wp(client, "/wp/v2/snippets", {
    method: "POST",
    body: JSON.stringify({
      title,
      status: "publish",
      acf: { content: coerceAcf([block]) },
    }),
  })) as { id?: number };
  if (!created.id) throw new WpError("De snippet is niet aangemaakt.");
  const saved = (await wp(client, `/wp/v2/snippets/${created.id}?context=edit&_fields=acf`)) as {
    acf?: { content?: unknown };
  };
  if (!Array.isArray(saved.acf?.content) || saved.acf.content.length === 0) {
    throw new WpError(
      `Snippet ${created.id} is aangemaakt, maar het thema bewaarde het blok niet. Er is niets op de pagina’s gezet.`,
    );
  }
  return created.id;
}

function referenceBlock(snippetId: number) {
  return { acf_fc_layout: "snippet_reference", snippet: snippetId };
}

async function placeReference(client: ClientRow, hit: { id: number; kind: PostKind }, snippetId: number, place: Place) {
  const post = await getContent(client, hit.kind, hit.id);
  const content = contentArray(post);
  const placed = insertBlock(content, referenceBlock(snippetId), place, (item) => String(item.acf_fc_layout ?? ""));
  await saveContent(client, hit.kind, hit.id, coerceAcf(placed.content));
  return placed.where;
}

export async function addSharedFaq(
  client: ClientRow,
  catalog: BlockDef[],
  hits: PageHit[],
  layout: string,
  items: { question: string; answer: string }[],
  heading?: string,
) {
  if (!hits.length) return "Geen pagina gevonden om de FAQ op te zetten.";
  const def = catalog.find((block) => block.layout === layout && isFaqLayout(block.layout));
  if (!def) return "Kies een FAQ-blok dat in dit thema bestaat: faq, faqsimple of faqextensive.";
  if (!catalog.some((block) => block.layout === "snippet_reference")) {
    return "Deze site heeft geen snippet-blok. Zet de FAQ dan per pagina, zonder snippet.";
  }
  const block = await buildFaqBlock(client, def, items, heading);
  const snippetId = await createSnippet(client, heading || `FAQ ${items.length} vragen`, block);
  const failed: string[] = [];
  let done = 0;
  for (const hit of hits) {
    try {
      await placeReference(client, hit, snippetId, "above-footer");
      done += 1;
    } catch (error) {
      failed.push(`${hit.title}: ${error instanceof WpError ? error.message : "niet opgeslagen"}`);
    }
  }
  const problem = failed.length ? ` ${failed.slice(0, 3).join(" ")}` : "";
  return `Snippet ${snippetId} met ${items.length} vragen staat boven de footer op ${done} van ${hits.length} pagina's.${problem}`;
}

export async function addSharedBlock(
  client: ClientRow,
  catalog: BlockDef[],
  layout: string,
  input: { heading?: string; text?: string; file: File | null; place: Place },
) {
  const reason = snippetBlockReason(layout);
  if (reason) return reason;
  const def = catalog.find((block) => block.layout === layout);
  if (!def) return `“${layout}” bestaat niet in het thema van deze site.`;
  if (!catalog.some((block) => block.layout === "snippet_reference")) {
    return "Deze site heeft geen snippet-blok, dus een bulk-blok kan niet op elke pagina dezelfde inhoud delen.";
  }
  let imageId: number | null = null;
  if (input.file && input.file.size > 0) {
    if (!def.slots.image) return `${def.label} heeft geen afbeeldingsveld in dit thema.`;
    imageId = await uploadMedia(client, input.file, def.label, input.heading || def.label);
  }
  const block = buildBlock(def, { heading: input.heading, text: input.text, imageId });
  const snippetId = await createSnippet(client, input.heading || def.label, block);
  const pages = await publishedPages(client);
  const failed: string[] = [];
  let done = 0;
  let where = input.place === "under-hero" ? "onder de hero" : "boven de footer";
  for (const page of pages) {
    try {
      where = await placeReference(client, { id: page.id, kind: "pages" }, snippetId, input.place);
      done += 1;
    } catch (error) {
      failed.push(`${page.name}: ${error instanceof WpError ? error.message : "niet opgeslagen"}`);
    }
  }
  const problem = failed.length ? ` ${failed.slice(0, 3).join(" ")}` : "";
  return `Snippet ${snippetId} (${def.label}) staat ${where} op ${done} van ${pages.length} pagina's.${problem}`;
}

export async function replacePageText(
  client: ClientRow,
  catalog: BlockDef[],
  kind: PostKind,
  postId: number,
  index: number,
  from: string,
  to: string,
) {
  const post = await getContent(client, kind, postId);
  const content = contentArray(post);
  const block = content[index];
  if (!block) return "Dat blok staat niet (meer) op deze pagina. Haal de pagina opnieuw op.";
  if (String(block.acf_fc_layout) === "snippet_reference") {
    return "Dit is een snippet. De tekst staat niet op deze pagina alleen. Kies een blok dat op de pagina zelf staat.";
  }
  const result = replaceSentence(block, from, to);
  const label = layoutLabel(String(block.acf_fc_layout ?? ""));
  if (result.status === "missing") return `“${from}” staat niet in ${label}. Plak de zin zoals hij op de pagina staat.`;
  if (result.status === "split") {
    return `“${from}” staat in ${label}, maar de opmaak knipt de zin. Plak een korter stuk zonder de hele opgemaakte alinea.`;
  }
  content[index] = result.block;
  await saveContent(client, kind, postId, coerceAcf(content));
  const report = await reportFor(client, catalog, kind, postId);
  return `De zin in ${label} is vervangen. ${report.h1Message}`;
}

export async function replacePageImage(
  client: ClientRow,
  catalog: BlockDef[],
  kind: PostKind,
  postId: number,
  index: number,
  file: File,
) {
  const post = await getContent(client, kind, postId);
  const content = contentArray(post);
  const block = content[index];
  if (!block) return "Dat blok staat niet (meer) op deze pagina. Haal de pagina opnieuw op.";
  const layout = String(block.acf_fc_layout ?? "");
  if (layout === "snippet_reference") {
    return "Dit is een snippet. Het beeld staat niet op deze pagina alleen. Kies een blok dat op de pagina zelf staat.";
  }
  const def = catalog.find((item) => item.layout === layout);
  if (def && !def.slots.image && !("image" in block) && !("background_image" in block)) {
    return `${def.label} heeft geen afbeelding.`;
  }
  const imageId = await uploadMedia(client, file, def?.label || layout, def?.label || layout);
  patchBlockImage(block, imageId);
  await saveContent(client, kind, postId, coerceAcf(content));
  return `De afbeelding staat in ${layoutLabel(layout)}.`;
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
