import { coerceAcf } from "@/lib/acf";
import { matchUrls } from "@/lib/content";
import type { ClientRow } from "@/lib/db";
import { isDemo } from "@/lib/demo";
import { loadLivePages } from "@/lib/seo-audit";
import { allowWords, dutchSpell } from "@/lib/spell";
import { misspellings } from "@/lib/text-audit";
import { pageKey } from "@/lib/locate";
import { getContent, saveContent, wp, WpError } from "@/lib/wp";
import type { PostKind } from "@/lib/types";

function linkKey(link: string) {
  const key = pageKey(link);
  return key ? `${key.host}${key.path}` : link;
}

type Hit = { id: number; kind: PostKind; title: string; link: string };

function mapNode(value: unknown, map: (text: string, key?: string) => string): { value: unknown; changed: boolean } {
  let changed = false;
  const visit = (node: unknown, key?: string): unknown => {
    if (typeof node === "string") {
      if (key === "acf_fc_layout" || (key && /^heading_tag/.test(key)) || /^https?:\/\//i.test(node.trim())) return node;
      const next = map(node, key);
      if (next !== node) changed = true;
      return next;
    }
    if (Array.isArray(node)) return node.map((item) => visit(item));
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [childKey, child] of Object.entries(node)) out[childKey] = visit(child, childKey);
      return out;
    }
    return node;
  };
  return { value: visit(value), changed };
}

export function promoteH3(value: unknown) {
  let tags = false;
  const marked = mapNode(value, (text) => {
    const next = text.replace(/<(\/?)h3\b/gi, "<$1h2");
    if (next !== text) tags = true;
    return next;
  });
  let changed = marked.changed || tags;
  const visit = (node: unknown, key?: string): unknown => {
    if (typeof node === "string" && key && /^heading_tag/.test(key) && node.toLowerCase() === "h3") {
      changed = true;
      return "h2";
    }
    if (Array.isArray(node)) return node.map((item) => visit(item));
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [childKey, child] of Object.entries(node)) out[childKey] = visit(child, childKey);
      return out;
    }
    return node;
  };
  return { value: visit(marked.value), changed };
}

function matchCase(source: string, suggestion: string) {
  if (source === source.toUpperCase()) return suggestion.toUpperCase();
  if (source[0] === source[0].toUpperCase()) return suggestion[0].toUpperCase() + suggestion.slice(1);
  return suggestion.toLowerCase();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function replaceSpellings(value: unknown, pairs: { from: string; to: string }[]) {
  const usable = pairs.filter((pair) => pair.from && pair.to);
  return mapNode(value, (text) =>
    text.replace(/(<[^>]+>)|([^<]+)/g, (full, tag: string | undefined, plain: string | undefined) => {
      if (tag) return tag;
      let next = plain ?? "";
      for (const pair of usable) {
        const pattern = new RegExp(`(?<![A-Za-zÀ-ÿ])${escapeRegExp(pair.from)}(?![A-Za-zÀ-ÿ])`, "gi");
        next = next.replace(pattern, (word) => matchCase(word, pair.to));
      }
      return next;
    }),
  );
}

function snippetIds(value: unknown) {
  const ids = new Set<number>();
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (record.acf_fc_layout === "snippet_reference") {
      const id = Number(record.snippet);
      if (Number.isInteger(id) && id > 0) ids.add(id);
    }
    Object.values(record).forEach(visit);
  };
  visit(value);
  return [...ids];
}

async function saveSnippet(client: ClientRow, id: number, content: unknown) {
  await wp(client, `/wp/v2/snippets/${id}`, {
    method: "POST",
    body: JSON.stringify({ acf: { content: coerceAcf(content) } }),
  });
}

async function readSnippet(client: ClientRow, id: number) {
  const saved = (await wp(client, `/wp/v2/snippets/${id}?context=edit&_fields=acf`)) as { acf?: { content?: unknown } };
  return saved.acf?.content;
}

async function applyToHits(
  client: ClientRow,
  hits: Hit[],
  transform: (value: unknown, hit: Hit) => { value: unknown; changed: boolean },
  snippetPairs?: Map<number, { from: string; to: string }[]>,
) {
  const changed: string[] = [];
  const untouched: string[] = [];
  const failed: string[] = [];
  const snippets = new Map<number, Hit>();
  for (const hit of hits) {
    try {
      const post = await getContent(client, hit.kind, hit.id);
      const content = post.acf?.content;
      if (!Array.isArray(content)) {
        untouched.push(hit.title);
        continue;
      }
      for (const id of snippetIds(content)) snippets.set(id, hit);
      const next = transform(content, hit);
      if (!next.changed) {
        untouched.push(hit.title);
        continue;
      }
      await saveContent(client, hit.kind, hit.id, coerceAcf(next.value));
      changed.push(hit.title);
    } catch (error) {
      failed.push(`${hit.title}: ${error instanceof WpError ? error.message : "niet opgeslagen"}`);
    }
  }
  const snippetChanged: number[] = [];
  for (const [id, hit] of snippets) {
    try {
      const content = await readSnippet(client, id);
      if (!Array.isArray(content)) continue;
      const next = snippetPairs
        ? replaceSpellings(content, snippetPairs.get(id) ?? [])
        : transform(content, hit);
      if (!next.changed) continue;
      await saveSnippet(client, id, next.value);
      snippetChanged.push(id);
    } catch (error) {
      failed.push(`snippet ${id}: ${error instanceof WpError ? error.message : "niet opgeslagen"}`);
    }
  }
  return { changed, untouched, failed, snippetChanged };
}

function summarize(result: { changed: string[]; untouched: string[]; failed: string[]; snippetChanged: number[] }, lead: string) {
  const snippet = result.snippetChanged.length ? ` ${result.snippetChanged.length} snippet${result.snippetChanged.length === 1 ? "" : "s"} mee aangepast.` : "";
  const missed = result.untouched.length ? ` ${result.untouched.length} pagina's hadden dit niet in een themaveld.` : "";
  const problem = result.failed.length ? ` ${result.failed.slice(0, 3).join(" ")}` : "";
  const pages = result.changed.length === 1 ? "1 pagina" : `${result.changed.length} pagina's`;
  return `${lead} ${pages}.${snippet}${missed}${problem}`.replace(/\s+/g, " ").trim();
}

export async function promoteLiveHeadings(client: ClientRow) {
  if (isDemo(client.id)) {
    return "Demo. Er is niets live gezet.\n\nOp een echte site zet ik H3's om naar H2's, alleen op pagina's met een H1 en geen H2. Alleen in de kopvelden van het thema.";
  }
  const pages = await loadLivePages(client);
  const targets = pages.filter((page) => !page.error && page.h1.length > 0 && page.h2.length === 0 && (page.h3 ?? []).length > 0);
  if (!targets.length) return "Geen pagina met een H1 en H3's zonder H2.";
  const matched = await matchUrls(client, targets.map((page) => page.link).join("\n"));
  if (!matched.hits.length) return matched.bad[0] || "Die pagina's staan niet in WordPress.";
  const result = await applyToHits(client, matched.hits, (value) => promoteH3(value));
  const missed = matched.bad.length ? ` Niet gevonden: ${matched.bad.slice(0, 3).join(" ")}` : "";
  return `${summarize(result, "H3 staat nu als H2 op")}${missed}`;
}

export async function applyLiveSpelling(client: ClientRow) {
  if (isDemo(client.id)) {
    return "Demo. Er is niets live gezet.\n\nOp een echte site voer ik de spellingvoorstellen door, tot 8 per pagina. Een woord zonder veilig voorstel blijft staan.";
  }
  const pages = await loadLivePages(client);
  const spell = await dutchSpell();
  const allow = allowWords(client.name, client.site_url);
  const jobs = new Map<string, { from: string; to: string }[]>();
  const shown = new Map<string, string>();
  for (const page of pages) {
    if (page.error) continue;
    const pairs = misspellings(`${page.h1.join(" ")} ${page.text}`, spell, allow)
      .filter((item) => item.suggestion)
      .map((item) => ({ from: item.word, to: item.suggestion }));
    if (!pairs.length) continue;
    jobs.set(linkKey(page.link), pairs);
    for (const pair of pairs) shown.set(pair.from.toLowerCase(), `${pair.from} → ${pair.to}`);
  }
  if (!jobs.size) return "Geen spelling met een veilig voorstel. Een naam die het woordenboek niet kent, blijft staan.";
  const matched = await matchUrls(client, [...jobs.keys()].join("\n"));
  if (!matched.hits.length) return matched.bad[0] || "Die pagina's staan niet in WordPress.";
  const snippetPairs = new Map<number, { from: string; to: string }[]>();
  const result = await applyToHits(
    client,
    matched.hits,
    (value, hit) => {
      const pairs = jobs.get(linkKey(hit.link)) ?? [];
      for (const id of snippetIds(value)) {
        const current = snippetPairs.get(id) ?? [];
        snippetPairs.set(id, [...current, ...pairs]);
      }
      return replaceSpellings(value, pairs);
    },
    snippetPairs,
  );
  const examples = [...shown.values()].slice(0, 6).join(" · ");
  return `${summarize(result, "Spelling bijgewerkt op")} ${examples}`;
}
