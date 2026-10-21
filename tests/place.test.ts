import assert from "node:assert/strict";
import { insertBlock, parsePlace, replaceSentence, snippetBlockReason, splitUrls } from "../lib/place";

const hero = { acf_fc_layout: "hero", heading: "Home" };
const text = { acf_fc_layout: "text", text: "Oude zin over de showroom." };
const footerish = { acf_fc_layout: "cta_panel", heading: "Bel ons" };

const under = insertBlock([hero, text, footerish], { acf_fc_layout: "faq" }, "under-hero", (item) => item.acf_fc_layout);
assert.equal(under.where, "onder de hero");
assert.equal(under.content[1].acf_fc_layout, "faq");

const noHero = insertBlock([text], { acf_fc_layout: "faq" }, "under-hero", (item) => item.acf_fc_layout);
assert.equal(noHero.content[0].acf_fc_layout, "faq");
assert.match(noHero.where, /geen hero/);

const end = insertBlock([hero, text], { acf_fc_layout: "faq" }, "above-footer", (item) => item.acf_fc_layout);
assert.equal(end.content.at(-1)?.acf_fc_layout, "faq");

const after = insertBlock([hero, text, footerish], { acf_fc_layout: "quote" }, parsePlace("after:1"), (item) => item.acf_fc_layout);
assert.equal(after.content[2].acf_fc_layout, "quote");

assert.deepEqual(splitUrls(" https://a.nl/x \nhttps://a.nl/y, https://a.nl/x "), ["https://a.nl/x", "https://a.nl/y"]);

const exact = replaceSentence({ acf_fc_layout: "text", text: "<p>Oude zin over de showroom.</p>" }, "Oude zin", "Nieuwe zin");
assert.equal(exact.status, "replaced");
assert.equal(exact.block.text, "<p>Nieuwe zin over de showroom.</p>");

const tagged = replaceSentence(
  { acf_fc_layout: "text", text: "<p>Oude <strong>zin</strong> over de showroom.</p>" },
  "Oude zin over de showroom.",
  "Nieuwe zin.",
);
assert.equal(tagged.status, "replaced");
assert.match(String(tagged.block.text), /Nieuwe zin/);

const missing = replaceSentence({ acf_fc_layout: "text", heading: "Showroom" }, "keukens", "badkamers");
assert.equal(missing.status, "missing");
assert.equal(missing.block.heading, "Showroom");

assert.equal(snippetBlockReason("hero"), "Een hero is de bovenkant van de pagina. Die wordt geen snippet.");
assert.equal(snippetBlockReason("text"), "");
assert.equal(parsePlace("naast"), "above-footer");
