import { plainText } from "@/lib/sanitize";
import type { HeadingHit, SeoReport } from "@/lib/types";

type Block = Record<string, unknown>;

function levelFromTag(tag: unknown, fallback: number) {
  const match = String(tag ?? "").match(/^h([1-6])$/i);
  return match ? Number(match[1]) : fallback;
}

function htmlHeadings(html: string, where: string): HeadingHit[] {
  const hits: HeadingHit[] = [];
  const pattern = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const text = plainText(match[2]);
    if (text) hits.push({ level: Number(match[1]), text, where });
  }
  return hits;
}

function blockHeadings(block: Block, index: number): HeadingHit[] {
  const layout = String(block.acf_fc_layout ?? "blok");
  const where = `${layout} ${index + 1}`;
  const hits: HeadingHit[] = [];
  const heading = plainText(String(block.heading ?? block.title ?? block.intro_heading ?? ""));
  if (heading) {
    const fallback = layout === "hero" || layout === "simplehero" ? 1 : 2;
    const tag = block.heading_tag_hero || block.heading_tag_title || block.heading_tag_intro_title;
    hits.push({ level: levelFromTag(tag, fallback), text: heading, where });
  }
  for (const key of ["text", "wysiwyg", "description", "quote"]) {
    if (typeof block[key] === "string") hits.push(...htmlHeadings(block[key], where));
  }
  return hits;
}

export function collectHeadings(blocks: Block[]) {
  return blocks.flatMap((block, index) => blockHeadings(block, index));
}

export function bodyText(blocks: Block[]) {
  return blocks
    .map((block) =>
      ["heading", "title", "intro_heading", "text", "wysiwyg", "description", "quote", "card_subtitle"]
        .map((key) => (typeof block[key] === "string" ? plainText(block[key]) : ""))
        .filter(Boolean)
        .join(" "),
    )
    .join(" ");
}

function includes(haystack: string, needle: string) {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

export function analyzeSeo(input: {
  blocks: Block[];
  keyword: string;
  seoTitle: string;
  description: string;
}): SeoReport {
  const headings = collectHeadings(input.blocks);
  const h1 = headings.filter((item) => item.level === 1);
  const h2 = headings.filter((item) => item.level === 2);
  const h1Status = h1.length === 0 ? "missing" : h1.length === 1 ? "ok" : "multiple";
  const h1Message =
    h1Status === "ok"
      ? "Er staat één H1 op deze pagina."
      : h1Status === "missing"
        ? "Er staat geen H1 op deze pagina."
        : `Er staan ${h1.length} H1's op deze pagina. Een pagina mag één H1 hebben.`;

  const keyword = input.keyword.trim();
  const body = bodyText(input.blocks);
  const terms = keyword
    .split(",")
    .map((term) => term.trim())
    .filter(Boolean);
  const checks = terms.flatMap((term) => {
    const inBody = body.toLowerCase().split(term.toLowerCase()).length - 1;
    return [
      {
        label: `SEO-titel bevat “${term}”`,
        ok: includes(input.seoTitle, term),
        detail: includes(input.seoTitle, term) ? "Komt voor in de SEO-titel." : "Ontbreekt in de SEO-titel.",
      },
      {
        label: `Meta-omschrijving bevat “${term}”`,
        ok: includes(input.description, term),
        detail: includes(input.description, term) ? "Komt voor in de meta-omschrijving." : "Ontbreekt in de meta-omschrijving.",
      },
      {
        label: `H1 bevat “${term}”`,
        ok: h1.some((item) => includes(item.text, term)),
        detail: h1.some((item) => includes(item.text, term)) ? "Komt voor in de H1." : "Ontbreekt in de H1.",
      },
      {
        label: `H2 bevat “${term}”`,
        ok: h2.some((item) => includes(item.text, term)),
        detail: h2.some((item) => includes(item.text, term)) ? "Komt voor in een H2." : "Ontbreekt in de H2's.",
      },
      {
        label: `Tekst bevat “${term}”`,
        ok: inBody > 0,
        detail: inBody > 0 ? `${inBody} keer in de tekst.` : "Komt niet voor in de tekst.",
      },
    ];
  });

  return { h1, h2, h1Status, h1Message, keyword, checks };
}
