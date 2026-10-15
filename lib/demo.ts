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

export function isFaqLayout(layout: string) {
  return layout === "faq" || layout === "faqsimple" || layout === "faqextensive";
}

const THEME: [string, Partial<BlockSlots>][] = [
  ["hero", { heading: true, text: true, image: true, button: true, stats: true }],
  ["simplehero", { heading: true, text: true, image: true, button: true }],
  ["heroslider", { heading: true, button: true, image: true }],
  ["image_text", { heading: true, text: true, image: true, button: true }],
  ["text", { heading: true, text: true }],
  ["simpletext", { heading: true, text: true, button: true }],
  ["image", { heading: true, text: true, image: true }],
  ["image_cards", { heading: true, image: true }],
  ["image_marquee", { heading: true, text: true, button: true }],
  ["gallery", { heading: true, text: true, image: true }],
  ["galleryfeed", { heading: true, text: true, image: true }],
  ["quote", { quote: true }],
  ["case_quote", { quote: true }],
  ["faq", { heading: true, text: true }],
  ["faqsimple", { heading: true, text: true }],
  ["faqextensive", { heading: true, text: true }],
  ["simpleform", { heading: true, text: true, image: true }],
  ["newsletter", { heading: true }],
  ["cta_panel", { heading: true, text: true, image: true, button: true }],
  ["voordelen", { heading: true, text: true, button: true }],
  ["voordelen_overzicht", { heading: true, text: true, button: true }],
  ["stappen", { heading: true, text: true }],
  ["werkwijze", { heading: true }],
  ["checklist", { heading: true, text: true, image: true }],
  ["logos", { heading: true, text: true }],
  ["certificeringen", { heading: true, text: true }],
  ["reviews", { heading: true }],
  ["team_v2", { heading: true, text: true }],
  ["contentkaarten", { heading: true, image: true }],
  ["service_cards", { heading: true }],
  ["service_block_content", { heading: true, text: true, image: true, button: true }],
  ["grid", { heading: true }],
  ["post_loop", {}],
  ["post_loop_v2", {}],
  ["cases", {}],
  ["videos", {}],
  ["showcase_slider", {}],
  ["voornaslider", { heading: true, text: true }],
  ["maps", { heading: true, text: true }],
  ["maps_extensive", {}],
  ["location_finder", {}],
  ["hotspots", { heading: true, text: true, button: true }],
  ["brochure", { heading: true, text: true, image: true }],
  ["downloads", { heading: true, text: true }],
  ["expertise", { heading: true }],
  ["goals", { heading: true, image: true }],
  ["contact_cards", {}],
  ["snippet_reference", {}],
];

export function demoCatalog(): BlockDef[] {
  return THEME.map(([layout, slots]) => block(layout, slots));
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
