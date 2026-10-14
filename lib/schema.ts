import { layoutLabel, PREFERRED_LAYOUTS } from "@/lib/labels";
import type { BlockDef, BlockSlots } from "@/lib/types";

const HEADING_KEYS = ["heading", "title", "intro_heading", "subtitle"];
const TEXT_KEYS = ["text", "wysiwyg", "description", "quote"];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function extractLayouts(schema: unknown): BlockDef[] {
  const found = new Map<string, BlockDef>();

  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const record = asRecord(node);
    if (!record) return;
    const props = asRecord(record.properties);
    const layoutSpec = props ? asRecord(props.acf_fc_layout) : null;
    const pattern = layoutSpec?.pattern;
    if (props && typeof pattern === "string") {
      const layout = pattern.replace(/^\^|\$$/g, "");
      if (layout && !found.has(layout)) {
        found.set(layout, toDef(layout, props));
      }
    }
    Object.values(record).forEach(walk);
  };

  walk(schema);
  return [...found.values()].sort((a, b) => {
    const ai = PREFERRED_LAYOUTS.indexOf(a.layout);
    const bi = PREFERRED_LAYOUTS.indexOf(b.layout);
    if (ai !== -1 || bi !== -1) {
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    }
    return a.label.localeCompare(b.label, "nl");
  });
}

function toDef(layout: string, props: Record<string, unknown>): BlockDef {
  const keys = Object.keys(props);
  const headingKey = HEADING_KEYS.find((key) => keys.includes(key)) ?? null;
  const textKey =
    TEXT_KEYS.find((key) => keys.includes(key) && key !== headingKey) ??
    (keys.includes("quote") ? "quote" : null);
  const slots: BlockSlots = {
    heading: Boolean(headingKey),
    text: Boolean(textKey),
    image: ["image", "background_image", "afbeeldingen"].some((key) => keys.includes(key)),
    button: keys.includes("button"),
    quote: keys.includes("quote") || layout.includes("quote"),
    stats: keys.includes("stats"),
  };
  return { layout, label: layoutLabel(layout), headingKey, textKey, slots };
}
