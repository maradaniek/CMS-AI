import assert from "node:assert/strict";
import { promoteH3, replaceSpellings } from "../lib/check-fixes";
import { safeSuggestion } from "../lib/text-audit";

const promoted = promoteH3([
  { acf_fc_layout: "text", heading_tag_title: "h3", text: "<h3>Stap</h3><p>Gewone tekst</p>" },
  { acf_fc_layout: "hero", heading_tag_hero: "h1", text: "<h2>Blijft</h2>" },
]);
assert.equal(promoted.changed, true);
const blocks = promoted.value as { heading_tag_title?: string; heading_tag_hero?: string; text: string }[];
assert.equal(blocks[0].heading_tag_title, "h2");
assert.match(blocks[0].text, /<h2>Stap<\/h2>/);
assert.equal(blocks[1].heading_tag_hero, "h1");
assert.match(blocks[1].text, /<h2>Blijft<\/h2>/);

const same = promoteH3([{ acf_fc_layout: "text", heading_tag_title: "h2", text: "<p>Alleen tekst</p>" }]);
assert.equal(same.changed, false);

const spelled = replaceSpellings(
  [{ acf_fc_layout: "text", text: "<p>Een Warmptepomp naast warmptepompen.</p>", link: "https://example.com/warmptepomp" }],
  [{ from: "warmptepomp", to: "warmtepomp" }],
);
assert.equal(spelled.changed, true);
const text = (spelled.value as { text: string; link: string }[])[0];
assert.match(text.text, /Warmtepomp/);
assert.doesNotMatch(text.text, /Warmptepomp/);
assert.match(text.text, /warmptepompen/);
assert.equal(text.link, "https://example.com/warmptepomp");

assert.equal(safeSuggestion("warmptepomp", "warmtepomp"), "warmtepomp");
assert.equal(safeSuggestion("kooistra", "tafel"), "");
