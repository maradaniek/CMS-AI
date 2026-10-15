import { layoutLabel } from "@/lib/labels";
import type { BlockDef, BlockSlots } from "@/lib/types";

export const DEMO_ID = "demo";

const empty: BlockSlots = {
  heading: false,
  text: false,
  image: false,
  button: false,
  quote: false,
  stats: false,
};

function block(layout: string, slots: Partial<BlockSlots>, textKey: string | null = null): BlockDef {
  const full = { ...empty, ...slots };
  return {
    layout,
    label: layoutLabel(layout),
    headingKey: full.heading ? "heading" : null,
    textKey: full.quote ? "quote" : full.text ? textKey || "text" : null,
    slots: full,
  };
}

export const demoClient = {
  id: DEMO_ID,
  name: "Demo klant",
  site_url: "https://demo.woeler.nl",
  wp_username: "demo",
  wp_app_password_enc: "",
};

export function isDemo(id: string) {
  return id === DEMO_ID;
}

export function demoCatalog(): BlockDef[] {
  return [
    block("hero", { heading: true, text: true, image: true, button: true }),
    block("image_text", { heading: true, text: true, image: true }),
    block("text", { heading: true, text: true }),
    block("quote", { quote: true }),
    block("faq", { heading: true, text: true }),
    block("cta_panel", { heading: true, text: true, button: true }),
    block("gallery", { image: true }),
    block("simpleform", { heading: true }),
  ];
}

export function demoPageTitle(path: string) {
  if (path === "/") return "Home";
  const slug = path.split("/").filter(Boolean).pop() || "Pagina";
  return slug.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function demoReply(action: string, prompt: string) {
  const asked = prompt.trim();
  return `Demo. Er is niets live gezet.\n\nJe koos “${action}”${asked ? ` en schreef: ${asked}` : ""}.\nBij een echte klant zou dit nu in het thema van die site worden gezet.`;
}
