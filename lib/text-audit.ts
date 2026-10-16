import type { ParsedPage } from "@/lib/seo-audit";

const INFORMAL = new Set(["je", "jij", "jou", "jouw", "jullie", "jezelf"]);
const FORMAL = new Set(["u", "uw", "uzelf"]);

export type TextHit = { name: string; link: string; detail: string };

export type AddressAudit = {
  checked: number;
  unread: number;
  mixed: TextHit[];
  informal: TextHit[];
  formal: TextHit[];
};

export type SpellAudit = {
  checked: number;
  unread: number;
  hits: TextHit[];
};

function tokens(text: string) {
  return text.toLowerCase().match(/[a-zà-ÿ]+/g) ?? [];
}

export function addressOf(text: string) {
  let informal = 0;
  let formal = 0;
  for (const token of tokens(text)) {
    if (INFORMAL.has(token)) informal += 1;
    if (FORMAL.has(token)) formal += 1;
  }
  return { informal, formal };
}

export function auditAddress(pages: ParsedPage[]): AddressAudit {
  const mixed: TextHit[] = [];
  const informal: TextHit[] = [];
  const formal: TextHit[] = [];
  for (const page of pages) {
    if (page.error) continue;
    const count = addressOf(`${page.title} ${page.h1.join(" ")} ${page.text}`);
    const detail = `je/jij/jouw ${count.informal}× · u/uw ${count.formal}×`;
    const hit = { name: page.name, link: page.link, detail };
    if (count.informal > 0 && count.formal > 0) mixed.push(hit);
    else if (count.informal > 0) informal.push(hit);
    else if (count.formal > 0) formal.push(hit);
  }
  return {
    checked: pages.filter((page) => !page.error).length,
    unread: pages.filter((page) => page.error).length,
    mixed,
    informal,
    formal,
  };
}

export function demoAddressAudit(): AddressAudit {
  return auditAddress([
    {
      name: "Home",
      link: "https://demo.woeler.nl/",
      title: "Demo",
      description: "",
      h1: ["Welkom"],
      h2: [],
      text: "Wij helpen je op weg. U kunt bellen voor een afspraak.",
      missingAlt: 0,
      noindex: false,
    },
    {
      name: "Diensten",
      link: "https://demo.woeler.nl/diensten",
      title: "Diensten",
      description: "",
      h1: [],
      h2: [],
      text: "Bekijk wat we voor je kunnen doen. Jouw situatie is het vertrekpunt.",
      missingAlt: 0,
      noindex: false,
    },
    {
      name: "Contact",
      link: "https://demo.woeler.nl/contact",
      title: "Contact",
      description: "",
      h1: ["Contact"],
      h2: [],
      text: "U bereikt ons op werkdagen. Uw afspraak plannen we samen.",
      missingAlt: 0,
      noindex: false,
    },
  ]);
}

type Spellbook = {
  correct: (word: string) => boolean;
  suggest: (word: string) => string[];
};

function pieces(word: string) {
  return word.split(/[-’']/).filter(Boolean);
}

export function misspellings(text: string, spell: Spellbook, allow: Set<string>) {
  const seen = new Set<string>();
  const found: { word: string; suggestion: string }[] = [];
  const words = text.match(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ’'-]*/g) ?? [];
  for (const word of words) {
    if (word.length < 3 || seen.has(word.toLowerCase())) continue;
    if (word === word.toUpperCase() && word.length <= 5) continue;
    const key = word.toLowerCase();
    if (allow.has(key)) continue;
    const parts = pieces(word);
    const known =
      spell.correct(word) ||
      spell.correct(key) ||
      (parts.length > 1 && parts.every((part) => part.length < 3 || spell.correct(part) || spell.correct(part.toLowerCase())));
    if (known) continue;
    seen.add(key);
    const suggestion = spell.suggest(key).find((item) => item.toLowerCase() !== key) ?? "";
    found.push({ word, suggestion });
    if (found.length >= 8) break;
  }
  return found;
}

export function auditSpelling(pages: ParsedPage[], spell: Spellbook, allow: Set<string>): SpellAudit {
  const hits: TextHit[] = [];
  for (const page of pages) {
    if (page.error) continue;
    const mistakes = misspellings(`${page.h1.join(" ")} ${page.text}`, spell, allow);
    if (!mistakes.length) continue;
    hits.push({
      name: page.name,
      link: page.link,
      detail: mistakes.map((item) => (item.suggestion ? `${item.word} → ${item.suggestion}` : item.word)).join(" · "),
    });
  }
  return {
    checked: pages.filter((page) => !page.error).length,
    unread: pages.filter((page) => page.error).length,
    hits,
  };
}

export function demoSpellAudit(): SpellAudit {
  return {
    checked: 3,
    unread: 0,
    hits: [
      {
        name: "Diensten",
        link: "https://demo.woeler.nl/diensten",
        detail: "warmptepomp → warmtepomp",
      },
    ],
  };
}

const TO_U: Record<string, string> = { je: "u", jij: "u", jou: "u", jouw: "uw", jezelf: "uzelf" };
const TO_JE: Record<string, string> = { u: "je", uw: "jouw", uzelf: "jezelf" };

export function replaceAddress(html: string, to: "u" | "je") {
  const map = to === "u" ? TO_U : TO_JE;
  return html.replace(/(<[^>]+>)|([^<]+)/g, (full, tag: string | undefined, text: string | undefined) => {
    if (tag) return tag;
    return (text ?? "").replace(/\b(jezelf|jullie|jouw|jij|jou|je|uzelf|uw|u)\b/gi, (word) => {
      const next = map[word.toLowerCase()];
      if (!next) return word;
      return word[0] === word[0].toUpperCase() ? next[0].toUpperCase() + next.slice(1) : next;
    });
  });
}

export function replacePhrase(html: string, from: string, to: string) {
  if (!from) return html;
  return html.replace(/(<[^>]+>)|([^<]+)/g, (full, tag: string | undefined, text: string | undefined) => {
    if (tag) return tag;
    return (text ?? "").split(from).join(to);
  });
}
