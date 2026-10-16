import { plainText } from "@/lib/sanitize";
import type { ClientRow } from "@/lib/db";
import { wp } from "@/lib/wp";
import type { PostKind } from "@/lib/types";

export type ParsedPage = {
  name: string;
  link: string;
  title: string;
  description: string;
  h1: string[];
  h2: string[];
  text: string;
  missingAlt: number;
  noindex: boolean;
  error?: string;
};

export type SeoHit = { name: string; link: string; detail: string };
export type SeoGroup = { title: string; hits: SeoHit[] };
export type KeywordRow = {
  name: string;
  link: string;
  inTitle: boolean;
  inH1: boolean;
  count: number;
  perHundred: number;
};

export type SeoAudit = {
  checked: number;
  unread: number;
  keyword: string;
  groups: SeoGroup[];
  keywords: KeywordRow[];
};

const TITLE_SHORT = 30;
const TITLE_LONG = 70;
const DESCRIPTION_SHORT = 70;
const DESCRIPTION_LONG = 160;

export function decodeHtml(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&ndash;|&#8211;/gi, "–")
    .replace(/&mdash;/gi, "—")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function attr(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match ? (match[2] ?? match[3] ?? match[4] ?? "") : null;
}

function metaContent(html: string, name: string) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const key = attr(tag, "name") || attr(tag, "property");
    if (key?.toLowerCase() === name) return decodeHtml(attr(tag, "content") || "").trim();
  }
  return "";
}

function headings(html: string, level: number) {
  const hits: string[] = [];
  const pattern = new RegExp(`<h${level}\\b[^>]*>([\\s\\S]*?)<\\/h${level}>`, "gi");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const text = plainText(decodeHtml(match[1]));
    if (text) hits.push(text);
  }
  return hits;
}

function withoutChrome(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ");
}

export function parseHtml(html: string): Omit<ParsedPage, "name" | "link"> {
  const title = plainText(decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""));
  const description = plainText(metaContent(html, "description"));
  const robots = metaContent(html, "robots").toLowerCase();
  const body = withoutChrome(html);
  const imgs = body.match(/<img\b[^>]*>/gi) ?? [];
  const missingAlt = imgs.filter((tag) => !attr(tag, "alt")?.trim()).length;
  return {
    title,
    description,
    h1: headings(body, 1),
    h2: headings(body, 2),
    text: plainText(decodeHtml(body)),
    missingAlt,
    noindex: robots.split(/[,\s]+/).includes("noindex"),
  };
}

function includes(haystack: string, needle: string) {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function countPhrase(haystack: string, phrase: string) {
  const text = haystack.toLowerCase();
  const term = phrase.toLowerCase();
  if (!term) return 0;
  let count = 0;
  let index = 0;
  while (index <= text.length) {
    const found = text.indexOf(term, index);
    if (found === -1) break;
    count += 1;
    index = found + term.length;
  }
  return count;
}

function words(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

export function auditPages(pages: ParsedPage[], keyword: string): SeoAudit {
  const term = keyword.trim();
  const readable = pages.filter((page) => !page.error);
  const groups: { title: string; hits: SeoHit[] }[] = [
    { title: "Geen H1", hits: [] },
    { title: "Meerdere H1's", hits: [] },
    { title: "Geen titel-tag", hits: [] },
    { title: `Titel-tag te kort, ${TITLE_SHORT} tekens of minder`, hits: [] },
    { title: `Titel-tag te lang, ${TITLE_LONG} tekens of meer`, hits: [] },
    { title: "H1 staat niet in de titel-tag", hits: [] },
    { title: "Geen meta-omschrijving", hits: [] },
    { title: `Meta-omschrijving te kort, ${DESCRIPTION_SHORT} tekens of minder`, hits: [] },
    { title: `Meta-omschrijving te lang, ${DESCRIPTION_LONG} tekens of meer`, hits: [] },
    { title: "Dezelfde titel-tag", hits: [] },
    { title: "Dezelfde H1", hits: [] },
    { title: "Geen H2", hits: [] },
    { title: "Afbeeldingen zonder alt", hits: [] },
    { title: "Staat op noindex", hits: [] },
    { title: "Focuswoord ontbreekt in de titel-tag", hits: [] },
    { title: "Focuswoord ontbreekt in de H1", hits: [] },
    { title: "Focuswoord ontbreekt in de tekst", hits: [] },
    { title: "Focuswoord staat te vaak in de tekst", hits: [] },
    { title: "Niet gelezen", hits: [] },
  ];
  const bucket = (title: string) => groups.find((group) => group.title === title)!;

  for (const page of pages) {
    if (page.error) {
      bucket("Niet gelezen").hits.push({ name: page.name, link: page.link, detail: page.error });
      continue;
    }
    if (page.h1.length === 0) bucket("Geen H1").hits.push({ name: page.name, link: page.link, detail: "Geen H1 in de pagina." });
    if (page.h1.length > 1) {
      bucket("Meerdere H1's").hits.push({ name: page.name, link: page.link, detail: page.h1.join(" · ") });
    }
    if (!page.title) bucket("Geen titel-tag").hits.push({ name: page.name, link: page.link, detail: "De titel-tag is leeg." });
    else if (page.title.length <= TITLE_SHORT) {
      bucket(`Titel-tag te kort, ${TITLE_SHORT} tekens of minder`).hits.push({
        name: page.name,
        link: page.link,
        detail: `${page.title} · ${page.title.length} tekens`,
      });
    } else if (page.title.length >= TITLE_LONG) {
      bucket(`Titel-tag te lang, ${TITLE_LONG} tekens of meer`).hits.push({
        name: page.name,
        link: page.link,
        detail: `${page.title} · ${page.title.length} tekens`,
      });
    }
    if (page.h1[0] && page.title && !includes(page.title, page.h1[0])) {
      bucket("H1 staat niet in de titel-tag").hits.push({
        name: page.name,
        link: page.link,
        detail: page.h1[0],
      });
    }
    if (!page.description) {
      bucket("Geen meta-omschrijving").hits.push({ name: page.name, link: page.link, detail: "Geen meta-omschrijving." });
    } else if (page.description.length <= DESCRIPTION_SHORT) {
      bucket(`Meta-omschrijving te kort, ${DESCRIPTION_SHORT} tekens of minder`).hits.push({
        name: page.name,
        link: page.link,
        detail: `${page.description.length} tekens`,
      });
    } else if (page.description.length >= DESCRIPTION_LONG) {
      bucket(`Meta-omschrijving te lang, ${DESCRIPTION_LONG} tekens of meer`).hits.push({
        name: page.name,
        link: page.link,
        detail: `${page.description.length} tekens`,
      });
    }
    if (page.h2.length === 0) bucket("Geen H2").hits.push({ name: page.name, link: page.link, detail: "Geen H2 in de pagina." });
    if (page.missingAlt > 0) {
      bucket("Afbeeldingen zonder alt").hits.push({
        name: page.name,
        link: page.link,
        detail: page.missingAlt === 1 ? "1 afbeelding zonder alt." : `${page.missingAlt} afbeeldingen zonder alt.`,
      });
    }
    if (page.noindex) bucket("Staat op noindex").hits.push({ name: page.name, link: page.link, detail: "Zoekmachines mogen deze pagina niet indexeren." });
  }

  const titles = new Map<string, ParsedPage[]>();
  const h1s = new Map<string, ParsedPage[]>();
  for (const page of readable) {
    const titleKey = page.title.trim().toLowerCase();
    if (titleKey) titles.set(titleKey, [...(titles.get(titleKey) ?? []), page]);
    for (const heading of new Set(page.h1.map((item) => item.toLowerCase()))) {
      h1s.set(heading, [...(h1s.get(heading) ?? []), page]);
    }
  }
  for (const group of titles.values()) {
    if (group.length < 2) continue;
    for (const page of group) {
      bucket("Dezelfde titel-tag").hits.push({ name: page.name, link: page.link, detail: page.title });
    }
  }
  for (const [heading, group] of h1s) {
    if (group.length < 2) continue;
    const label = group[0].h1.find((item) => item.toLowerCase() === heading) ?? heading;
    for (const page of group) {
      bucket("Dezelfde H1").hits.push({ name: page.name, link: page.link, detail: label });
    }
  }

  const keywords: KeywordRow[] = [];
  if (term) {
    for (const page of readable) {
      const count = countPhrase(page.text, term);
      const perHundred = words(page.text) ? (count / words(page.text)) * 100 : 0;
      const inTitle = includes(page.title, term);
      const inH1 = page.h1.some((item) => includes(item, term));
      keywords.push({ name: page.name, link: page.link, inTitle, inH1, count, perHundred });
      if (!inTitle) bucket("Focuswoord ontbreekt in de titel-tag").hits.push({ name: page.name, link: page.link, detail: page.title || "Geen titel-tag" });
      if (!inH1) bucket("Focuswoord ontbreekt in de H1").hits.push({ name: page.name, link: page.link, detail: page.h1.join(" · ") || "Geen H1" });
      if (count === 0) bucket("Focuswoord ontbreekt in de tekst").hits.push({ name: page.name, link: page.link, detail: "0 keer in de tekst." });
      else if (perHundred >= 3 && count >= 3) {
        bucket("Focuswoord staat te vaak in de tekst").hits.push({
          name: page.name,
          link: page.link,
          detail: `${count} keer, ${perHundred.toFixed(1).replace(".", ",")} per 100 woorden`,
        });
      }
    }
  }

  return {
    checked: readable.length,
    unread: pages.length - readable.length,
    keyword: term,
    groups: groups.filter((group) => group.hits.length > 0),
    keywords,
  };
}

export function demoSeoAudit(keyword: string): SeoAudit {
  const description = "Een omschrijving die lang genoeg is om als meta-omschrijving door de check te komen zonder afgekeurd te worden.";
  return auditPages(
    [
      {
        name: "Home",
        link: "https://demo.woeler.nl/",
        title: "Demo klant helpt je met websites, marketing, content en een titel die duidelijk te lang is geworden",
        description: "",
        h1: ["Demo klant", "Welkom"],
        h2: ["Werkwijze"],
        text: "Marketing en websites voor bedrijven die online gevonden willen worden.",
        missingAlt: 2,
        noindex: false,
      },
      {
        name: "Diensten",
        link: "https://demo.woeler.nl/diensten",
        title: "Diensten",
        description: "Te kort.",
        h1: [],
        h2: [],
        text: "Overzicht van diensten.",
        missingAlt: 0,
        noindex: false,
      },
      {
        name: "Contact",
        link: "https://demo.woeler.nl/contact",
        title: "Contact opnemen met Demo klant vandaag",
        description,
        h1: ["Contact opnemen met Demo klant vandaag"],
        h2: ["Adres"],
        text: `Bel of mail ons over ${keyword || "een nieuwe site"}.`,
        missingAlt: 0,
        noindex: false,
      },
      {
        name: "Afspraak",
        link: "https://demo.woeler.nl/afspraak",
        title: "Contact opnemen met Demo klant vandaag",
        description,
        h1: ["Contact opnemen met Demo klant vandaag"],
        h2: ["Planning"],
        text: "Plan een afspraak in de showroom.",
        missingAlt: 0,
        noindex: true,
      },
    ],
    keyword,
  );
}

async function published(client: ClientRow, kind: PostKind) {
  const items: { name: string; link: string }[] = [];
  for (let page = 1; page <= 10; page += 1) {
    let batch: { link?: string; status?: string; title?: { raw?: string; rendered?: string } }[];
    try {
      batch = (await wp(
        client,
        `/wp/v2/${kind}?context=edit&status=publish&per_page=100&page=${page}&_fields=link,status,title`,
      )) as { link?: string; status?: string; title?: { raw?: string; rendered?: string } }[];
    } catch {
      break;
    }
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const item of batch) {
      if (!item.link || (item.status && item.status !== "publish")) continue;
      const name = plainText(item.title?.raw || item.title?.rendered || item.link);
      items.push({ name, link: item.link });
    }
    if (batch.length < 100) break;
  }
  return items;
}

async function readLive(link: string, name: string): Promise<ParsedPage> {
  try {
    const response = await fetch(link, {
      cache: "no-store",
      headers: { "User-Agent": "WoelerCMS" },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      return { name, link, title: "", description: "", h1: [], h2: [], text: "", missingAlt: 0, noindex: false, error: `De pagina antwoordde ${response.status}.` };
    }
    return { name, link, ...parseHtml(await response.text()) };
  } catch {
    return { name, link, title: "", description: "", h1: [], h2: [], text: "", missingAlt: 0, noindex: false, error: "De pagina was niet bereikbaar." };
  }
}

async function pool<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export async function runSeoAudit(client: ClientRow, keyword: string) {
  const lists = await Promise.all([published(client, "pages"), published(client, "posts"), published(client, "cases")]);
  const seen = new Set<string>();
  const targets = lists.flat().filter((item) => {
    if (seen.has(item.link)) return false;
    seen.add(item.link);
    return true;
  });
  const pages = await pool(targets, 6, (item) => readLive(item.link, item.name));
  return auditPages(pages, keyword);
}
