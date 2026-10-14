import { sanitizeRichText, plainText } from "@/lib/sanitize";
import type { BlockDef } from "@/lib/types";

const NUMERIC = new Set([
  "background_image",
  "block_background_image",
  "border_radius",
  "bottom_left",
  "bottom_right",
  "faq",
  "flat_overlay_opacity",
  "gradient_end",
  "gradient_end_opacity",
  "gradient_offset_y",
  "gradient_start",
  "gradient_start_opacity",
  "height_desktop_px",
  "height_mobile_px",
  "image",
  "image_secondary",
  "logo_group",
  "margin_bottom",
  "margin_top",
  "marquee_speed",
  "marquee_visible",
  "padding",
  "snippet",
  "style_button_2_button_theme",
  "style_content_button_theme",
  "style_cta_button_theme",
  "top_left",
  "top_right",
  "shape",
  "content_width",
  "slide_interval",
  "band_height",
  "image_height_px",
  "image_protrusion_mobile",
  "image_protrusion_top",
  "image_protrusion_bottom",
]);

const EMPTY_LINK = new Set(["button_secondary", "link"]);

export function coerceAcf(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) return value.map((item) => coerceAcf(item));
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("url" in record && "title" in record && !record.url) return null;
    const out: Record<string, unknown> = {};
    for (const [childKey, child] of Object.entries(record)) {
      if (childKey === "") continue;
      out[childKey] = coerceAcf(child, childKey);
    }
    return out;
  }
  if (value === "" && key && (NUMERIC.has(key) || EMPTY_LINK.has(key))) return null;
  return value;
}

export function buildBlock(
  def: BlockDef,
  input: {
    heading?: string;
    text?: string;
    imageId?: number | null;
    stats?: { value: string; label: string }[];
  },
) {
  const block: Record<string, unknown> = { acf_fc_layout: def.layout };
  if (def.headingKey && input.heading) block[def.headingKey] = plainText(input.heading);
  if (def.textKey && input.text) {
    block[def.textKey] =
      def.textKey === "quote" ? plainText(input.text) : sanitizeRichText(input.text);
  }
  if (def.slots.image) block.image = input.imageId ?? null;
  if (def.slots.button) {
    block.button = null;
    block.button_secondary = null;
  }
  if (def.slots.stats && input.stats?.length) {
    block.stats = input.stats.map((stat) => ({
      value: plainText(stat.value),
      label: plainText(stat.label),
    }));
  }
  if (def.layout === "hero") block.heading_tag_hero = "h2";
  if (def.headingKey === "heading" || def.headingKey === "title") {
    block.heading_tag_title = def.layout === "simplehero" ? "h1" : "h2";
  }
  if (def.layout === "hero") {
    block.variant = "3";
    block.overlay_type = "gradient";
    block.content_alignment = "left";
    block.content_width = "50";
    block.height_mode = "content";
    block.heading_tag_hero = "h1";
  }
  return block;
}

const TEXT_FIELDS = new Set([
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

export function patchBlockText(
  block: Record<string, unknown>,
  input: { heading?: string; text?: string },
) {
  if (input.heading) {
    const key = ["heading", "title", "intro_heading"].find((name) => name in block);
    if (key) block[key] = plainText(input.heading);
  }
  if (input.text) {
    const key = ["text", "wysiwyg", "description", "quote"].find((name) => name in block);
    if (key) block[key] = key === "quote" ? plainText(input.text) : sanitizeRichText(input.text);
  }
  for (const key of Object.keys(block)) {
    if (!TEXT_FIELDS.has(key) && key !== "acf_fc_layout" && key !== "stats") continue;
  }
  return block;
}

export function patchBlockImage(block: Record<string, unknown>, imageId: number) {
  if ("background_image" in block && !("image" in block)) {
    block.background_image = imageId;
    return block;
  }
  block.image = imageId;
  return block;
}
