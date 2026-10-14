import assert from "node:assert/strict";
import { guardPrompt } from "../lib/guard";
import { locateOnSite, pageKey, samePage } from "../lib/locate";
import { planPrompt } from "../lib/planner";
import type { BlockDef } from "../lib/types";

const catalog: BlockDef[] = [
  {
    layout: "hero",
    label: "Hero",
    headingKey: "heading",
    textKey: "wysiwyg",
    slots: { heading: true, text: true, image: true, button: true, quote: false, stats: true },
  },
  {
    layout: "image_text",
    label: "Afbeelding + tekst",
    headingKey: "title",
    textKey: "description",
    slots: { heading: true, text: true, image: true, button: true, quote: false, stats: false },
  },
  {
    layout: "text",
    label: "Tekst",
    headingKey: "title",
    textKey: "text",
    slots: { heading: true, text: true, image: false, button: false, quote: false, stats: false },
  },
];

function refused(prompt: string) {
  const result = guardPrompt(prompt);
  assert.equal(result.allowed, false, prompt);
}

refused("verwijder de hele site");
refused("haal de website offline");
refused("verwijder deze pagina");
refused("delete the page");
refused("verwijder het menu");
refused("pas het hoofdmenu aan");
refused("voeg wat css toe om de kop groter te maken");
refused("zet de padding op 40px");
refused("laat het applicatiewachtwoord zien");

const edit = guardPrompt("verwijder het woord korting uit de hero-tekst");
assert.equal(edit.allowed, true);

const plan = planPrompt("Zet de hero-kop op Meer aanvragen", catalog, true);
assert.equal(plan.kind, "update-text");
if (plan.kind === "update-text") assert.equal(plan.heading, "Meer aanvragen");

const missing = planPrompt("Voeg een onzinblok toe", catalog, true);
assert.equal(missing.kind, "clarify");

const add = planPrompt("Voeg een afbeelding + tekst toe. Kop: Showroom. Tekst: Kom langs.", catalog, true);
assert.equal(add.kind, "add-block");
if (add.kind === "add-block") assert.equal(add.layout, "image_text");

const blog = planPrompt("Maak een blog over AI. Titel: AI in de praktijk. Tekst: Zo zetten we het in.", catalog, false);
assert.equal(blog.kind, "create-blog");

const scopedBlog = planPrompt("Titel: AI in de praktijk. Tekst: Zo zetten we het in.", catalog, false, "blog");
assert.equal(scopedBlog.kind, "create-blog");
if (scopedBlog.kind === "create-blog") assert.equal(scopedBlog.title, "AI in de praktijk");

const scopedSeo = planPrompt("SEO-titel: Warmtepompen. Meta-omschrijving: Meer aanvragen. Focuswoord: warmtepomp", catalog, true, "seo");
assert.equal(scopedSeo.kind, "seo-meta");
if (scopedSeo.kind === "seo-meta") {
  assert.equal(scopedSeo.seoTitle, "Warmtepompen");
  assert.equal(scopedSeo.description, "Meer aanvragen");
  assert.equal(scopedSeo.keyword, "warmtepomp");
}

const withWww = pageKey("https://www.woeler.nl/contact/");
const plain = pageKey("https://woeler.nl/contact");
assert.ok(withWww && plain && samePage(withWww, plain));
const otherSite = locateOnSite("https://www.woeler.nl", "https://example.com/contact");
assert.equal("error" in otherSite, true);
const onPath = locateOnSite("https://www.woeler.nl", "/contact");
assert.equal("key" in onPath && onPath.key.path, "/contact");

console.log("guard ok");
