import { plainText, sanitizeRichText } from "@/lib/sanitize";

export const HERO_LAYOUTS = new Set(["hero", "simplehero", "heroslider"]);

const QUERY_LAYOUTS = new Set(["post_loop", "post_loop_v2", "cases", "videos", "showcase_slider"]);

export type Place = "under-hero" | "above-footer" | `after:${number}`;

export function parsePlace(value: string): Place {
  if (value === "under-hero" || value === "above-footer") return value;
  const match = /^after:(\d+)$/.exec(value.trim());
  if (match) return `after:${Number(match[1])}`;
  return "above-footer";
}

export function splitUrls(value: string) {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const part of value.split(/[\s,;]+/)) {
    const url = part.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

export function snippetBlockReason(layout: string) {
  if (HERO_LAYOUTS.has(layout)) return "Een hero is de bovenkant van de pagina. Die wordt geen snippet.";
  if (layout === "snippet_reference") return "Een snippet kan niet nog een snippet worden.";
  return "";
}

export function snippetHint(layout: string) {
  if (QUERY_LAYOUTS.has(layout)) {
    return "Dit is een overzicht. Als snippet toont het op elke pagina dezelfde lijst.";
  }
  return "";
}

export function insertBlock<T>(content: T[], block: T, place: Place, layoutOf: (item: T) => string) {
  const next = content.slice();
  if (place === "above-footer") {
    next.push(block);
    return { content: next, where: "boven de footer" };
  }
  if (place === "under-hero") {
    const heroIndex = next.findIndex((item) => HERO_LAYOUTS.has(layoutOf(item)));
    if (heroIndex < 0) {
      next.unshift(block);
      return { content: next, where: "bovenaan, want er is geen hero" };
    }
    next.splice(heroIndex + 1, 0, block);
    return { content: next, where: "onder de hero" };
  }
  const index = Number(place.slice("after:".length));
  const at = Math.min(Math.max(index + 1, 0), next.length);
  next.splice(at, 0, block);
  return { content: next, where: `na blok ${index + 1}` };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function replaceInText(value: string, from: string, to: string): { value: string; status: "replaced" | "missing" | "split" } {
  const needle = from.replace(/\s+/g, " ").trim();
  if (needle.length < 2 || /^https?:\/\//i.test(value.trim())) return { value, status: "missing" };
  const clean = sanitizeRichText(to);
  if (value.includes(needle)) return { value: value.replaceAll(needle, clean), status: "replaced" };
  const lower = value.toLowerCase();
  const at = lower.indexOf(needle.toLowerCase());
  if (at >= 0) {
    return { value: value.slice(0, at) + clean + value.slice(at + needle.length), status: "replaced" };
  }
  const words = needle.split(/\s+/).filter(Boolean);
  const pattern = new RegExp(words.map(escapeRegExp).join("(?:\\s|&nbsp;|<[^>]+>)+"), "i");
  if (pattern.test(value)) return { value: value.replace(pattern, clean), status: "replaced" };
  if (plainText(value).toLowerCase().includes(needle.toLowerCase())) return { value, status: "split" };
  return { value, status: "missing" };
}

export function replaceSentence(block: Record<string, unknown>, from: string, to: string) {
  let replaced = false;
  let split = false;
  const visit = (node: unknown, key?: string): unknown => {
    if (typeof node === "string") {
      if (key === "acf_fc_layout") return node;
      const result = replaceInText(node, from, to);
      if (result.status === "replaced") replaced = true;
      if (result.status === "split") split = true;
      return result.status === "replaced" ? result.value : node;
    }
    if (Array.isArray(node)) return node.map((item) => visit(item));
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [childKey, child] of Object.entries(node)) {
        out[childKey] = visit(child, childKey);
      }
      return out;
    }
    return node;
  };
  const next = visit(block) as Record<string, unknown>;
  const status = replaced ? "replaced" : split ? "split" : "missing";
  return { block: next, status };
}
