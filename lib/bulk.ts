import { coerceAcf } from "@/lib/acf";
import type { ClientRow } from "@/lib/db";
import { replaceAddress, replacePhrase } from "@/lib/text-audit";
import type { PostKind } from "@/lib/types";
import { getContent, saveContent, wp, WpError } from "@/lib/wp";

const TEXT_KEYS = new Set([
  "heading",
  "title",
  "intro_heading",
  "subtitle",
  "text",
  "wysiwyg",
  "description",
  "quote",
  "toptitle",
  "card_subtitle",
]);

export type BulkPlan =
  | { kind: "style"; to: "u" | "je" }
  | { kind: "replace"; from: string; to: string; seo: boolean }
  | { kind: "clarify"; message: string };

export function planBulk(task: string, prompt: string): BulkPlan {
  const text = prompt.trim();
  const lower = text.toLowerCase();
  if (task === "style") {
    const toU = /\b(naar|op|gebruik|alles)\s+u\b|\bu-vorm\b|\bformeel\b/.test(lower);
    const toJe = /\b(naar|op|gebruik|alles)\s+je\b|\bje-vorm\b|\binformeel\b/.test(lower);
    if (toU && toJe) return { kind: "clarify", message: "Kies één vorm: de hele site op u, of de hele site op je." };
    if (toU) return { kind: "style", to: "u" };
    if (toJe) return { kind: "style", to: "je" };
    return { kind: "clarify", message: "Schrijf bijvoorbeeld: Zet de hele site op u. Of: Zet de hele site op je." };
  }
  const match = text.match(/vervang\s+["“']?(.+?)["”']?\s+door\s+["“']?([\s\S]+?)["”']?$/i);
  const from = match?.[1]?.trim() ?? "";
  const to = match?.[2]?.trim().replace(/[.。]+$/, "") ?? "";
  if (from.length < 2 || !to) {
    return { kind: "clarify", message: "Schrijf wat er overal moet veranderen. Bijvoorbeeld: Vervang gratis kennismaking door adviesgesprek." };
  }
  if (["je", "jij", "jou", "jouw", "u", "uw"].includes(from.toLowerCase())) {
    return { kind: "clarify", message: "Voor je of u kies je Aanspreekvorm." };
  }
  return { kind: "replace", from, to, seo: task === "seo" };
}

function mapText(value: unknown, replace: (html: string) => string): { value: unknown; changed: boolean } {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const result = mapText(item, replace);
      changed = changed || result.changed;
      return result.value;
    });
    return { value: next, changed };
  }
  if (value && typeof value === "object") {
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (TEXT_KEYS.has(key) && typeof child === "string") {
        const updated = replace(child);
        out[key] = updated;
        changed = changed || updated !== child;
      } else {
        const result = mapText(child, replace);
        out[key] = result.value;
        changed = changed || result.changed;
      }
    }
    return { value: out, changed };
  }
  return { value, changed: false };
}

function clean(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) return value.map((item) => clean(item));
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("url" in record && "title" in record && !record.url) return null;
    const out: Record<string, unknown> = {};
    for (const [childKey, child] of Object.entries(record)) {
      if (childKey === "") continue;
      out[childKey] = clean(child, childKey);
    }
    return out;
  }
  if (value === "" && key && (key === "button" || key === "button_secondary" || key === "link")) return null;
  return value;
}

async function targets(client: ClientRow) {
  const items: { id: number; kind: PostKind; name: string }[] = [];
  for (const kind of ["pages", "posts", "cases"] as const) {
    for (let page = 1; page <= 8; page += 1) {
      let batch: { id: number; status?: string; title?: { raw?: string; rendered?: string } }[];
      try {
        batch = (await wp(
          client,
          `/wp/v2/${kind}?context=edit&status=publish&per_page=50&page=${page}&_fields=id,status,title`,
        )) as { id: number; status?: string; title?: { raw?: string; rendered?: string } }[];
      } catch {
        break;
      }
      if (!Array.isArray(batch) || batch.length === 0) break;
      for (const item of batch) {
        if (item.status && item.status !== "publish") continue;
        items.push({ id: item.id, kind, name: item.title?.raw || item.title?.rendered || String(item.id) });
      }
      if (batch.length < 50) break;
    }
  }
  return items;
}

export async function applyBulk(client: ClientRow, plan: Exclude<BulkPlan, { kind: "clarify" }>) {
  const replace = (html: string) =>
    plan.kind === "style" ? replaceAddress(html, plan.to) : replacePhrase(html, plan.from, plan.to);
  const pages = await targets(client);
  let changed = 0;
  const failed: string[] = [];
  for (const page of pages) {
    try {
      const post = await getContent(client, page.kind, page.id);
      const content = post.acf?.content;
      if (!Array.isArray(content)) continue;
      const mapped = mapText(content, replace);
      if (!mapped.changed) continue;
      await saveContent(client, page.kind, page.id, coerceAcf(clean(mapped.value)));
      changed += 1;
    } catch (error) {
      failed.push(`${page.name}: ${error instanceof WpError ? error.message : "niet opgeslagen"}`);
    }
  }
  let seoNote = "";
  if (plan.kind === "replace" && plan.seo) {
    seoNote = " SEO-titel en meta-omschrijving pas ik per pagina aan via SEO aanpassen, niet in één bulk op Rank Math.";
  }
  const problem = failed.length ? ` ${failed.slice(0, 3).join(" ")}` : "";
  if (plan.kind === "style") {
    return `Aanspreekvorm staat op ${plan.to === "u" ? "u/uw" : "je/jouw"} in ${changed} van ${pages.length} pagina's.${problem}`;
  }
  return `“${plan.from}” is vervangen door “${plan.to}” in ${changed} van ${pages.length} pagina's.${seoNote}${problem}`;
}
