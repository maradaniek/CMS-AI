import type { BlockDef, PostKind } from "@/lib/types";

export type Plan =
  | { kind: "clarify"; message: string }
  | { kind: "refuse"; message: string }
  | { kind: "seo"; keyword?: string }
  | { kind: "seo-meta"; seoTitle?: string; description?: string; keyword?: string }
  | { kind: "update-text"; target: string; heading?: string; text?: string }
  | { kind: "add-block"; layout: string; heading?: string; text?: string }
  | { kind: "create-case"; title: string; heading?: string; text?: string; stats: { value: string; label: string }[] }
  | { kind: "create-blog"; title: string; text: string }
  | { kind: "publish" };

const ALIASES: [RegExp, string][] = [
  [/afbeelding\s*\+\s*tekst|image[_ ]text/, "image_text"],
  [/eenvoudige hero|simple ?hero/, "simplehero"],
  [/hero-?slider/, "heroslider"],
  [/fotokaarten|image[_ ]cards/, "image_cards"],
  [/citaat|quote/, "quote"],
  [/formulier/, "simpleform"],
  [/voordelen/, "voordelen"],
  [/galerij|gallery/, "gallery"],
  [/\bfaq\b/, "faq"],
  [/oproep|cta/, "cta_panel"],
  [/\bhero\b/, "hero"],
  [/\btekstblok\b|\btekst\b/, "text"],
  [/\bafbeelding\b|\bimage\b/, "image"],
];

function after(prompt: string, label: RegExp) {
  const match = prompt.match(
    new RegExp("(?:^|[\\s-])(?:" + label.source + ")\\s*(?:op|naar|wordt|:|-)\\s*[\"“']?([\\s\\S]+)", "i"),
  );
  if (!match?.[1]) return undefined;
  return match[1]
    .split(/\s+(?:tekst|kop|titel|citaat|cijfers)\s*(?:op|naar|wordt|:|-)/i)[0]
    .replace(/[\"”'.]\s*$/g, "")
    .trim();
}

function resolveLayout(prompt: string, catalog: BlockDef[]) {
  for (const [pattern, layout] of ALIASES) {
    if (pattern.test(prompt)) {
      return catalog.find((block) => block.layout === layout) ?? null;
    }
  }
  return null;
}

function statsFrom(prompt: string) {
  const stats: { value: string; label: string }[] = [];
  const pattern = /(\d+\s*%|€\s?\d+|\d+\s*eur)\s+([^,/\n.]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(prompt))) {
    stats.push({ value: match[1].replace(/eur/i, "€").replace(/\s+/g, ""), label: match[2].trim() });
  }
  return stats.slice(0, 2);
}

export function planPrompt(prompt: string, catalog: BlockDef[], hasPage: boolean): Plan {
  const text = prompt.trim();
  const lower = text.toLowerCase();

  if (/\b(publiceer|zet live|zet online)\b/.test(lower)) {
    if (!hasPage) return { kind: "clarify", message: "Kies eerst het concept dat live mag." };
    return { kind: "publish" };
  }

  if (/\b(maak|schrijf|nieuwe)\b/.test(lower) && /\bblog\b/.test(lower)) {
    const title = after(text, /titel/) || text.match(/blog over\s+(.+?)(?:\.|tekst:|$)/i)?.[1]?.trim();
    const body = after(text, /tekst/) || "";
    if (!title) {
      return { kind: "clarify", message: "Voor een blog heb ik een titel nodig, bijvoorbeeld: Maak een blog over AI. Titel: …. Tekst: …." };
    }
    return { kind: "create-blog", title, text: body };
  }

  if (/\b(maak|nieuwe)\b/.test(lower) && /\b(case|succescase)\b/.test(lower)) {
    const title = after(text, /titel/) || text.match(/case(?:\s+voor)?\s+(.+?)(?:\.|cijfers:|tekst:|$)/i)?.[1]?.trim();
    if (!title) {
      return { kind: "clarify", message: "Voor een case heb ik een titel nodig. Zet er cijfers bij als je die in de hero wilt." };
    }
    return {
      kind: "create-case",
      title,
      heading: after(text, /kop/) || title,
      text: after(text, /tekst/) || "",
      stats: statsFrom(text),
    };
  }

  if (/\b(meta-?omschrijving|seo-?titel|focuswoord|focuskeyword|meta description)\b/.test(lower)) {
    if (!hasPage) return { kind: "clarify", message: "Kies eerst de pagina waarvan je de SEO wilt zetten." };
    return {
      kind: "seo-meta",
      seoTitle: after(text, /seo-?titel/),
      description: after(text, /meta-?omschrijving|meta description/),
      keyword: after(text, /focuswoord|focuskeyword|zoekwoord/),
    };
  }

  if (/\b(seo|h1|h2|zoekwoord|koppen)\b/.test(lower)) {
    if (!hasPage) return { kind: "clarify", message: "Kies eerst een pagina. Dan tel ik de H1, de H2's en het zoekwoord." };
    const keyword = after(text, /zoekwoord|focuswoord|keyword/) || text.match(/zoekwoord\s+(.+)$/i)?.[1]?.trim();
    return { kind: "seo", keyword };
  }

  if (/\b(voeg|nieuwe|nieuw)\b/.test(lower) && /\b(blok|hero|tekst|afbeelding|citaat|formulier|galerij)\b/.test(lower)) {
    if (!hasPage) return { kind: "clarify", message: "Kies eerst de pagina waar het blok bij moet." };
    const block = resolveLayout(text, catalog);
    if (!block) {
      return {
        kind: "clarify",
        message: "Kies het blok in het overzicht. Daar staan alleen blokken die op deze WaaS-site echt bestaan.",
      };
    }
    return {
      kind: "add-block",
      layout: block.layout,
      heading: after(text, /kop|titel/),
      text: after(text, /tekst|citaat/),
    };
  }

  if (/\b(pas aan|verander|zet|wijzig|vervang)\b/.test(lower)) {
    if (!hasPage) return { kind: "clarify", message: "Kies eerst de pagina waarvan je de tekst wilt aanpassen." };
    const heading = after(text, /kop|titel/);
    const body = after(text, /tekst|alinea|citaat/);
    if (!heading && !body) {
      return { kind: "clarify", message: "Zet erbij wat de nieuwe kop of tekst moet worden." };
    }
    const target = resolveLayout(text, catalog)?.layout ?? "first";
    return { kind: "update-text", target, heading, text: body };
  }

  return {
    kind: "clarify",
    message:
      "Dit kan ik niet plaatsen. Kies een bestaand blok, of vraag om tekst, SEO, een case of een blog. CSS, het menu en verwijderen doe ik niet.",
  };
}

export function kindLabel(kind: PostKind) {
  if (kind === "pages") return "pagina";
  if (kind === "cases") return "case";
  return "blog";
}
