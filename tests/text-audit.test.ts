import assert from "node:assert/strict";
import { planBulk } from "../lib/bulk";
import { addressOf, auditAddress, misspellings, replaceAddress } from "../lib/text-audit";
import type { ParsedPage } from "../lib/seo-audit";

assert.deepEqual(addressOf("Wij helpen je. U kunt uw afspraak plannen."), { informal: 1, formal: 2 });
assert.equal(addressOf("jullie jezelf").informal, 2);

const page = (name: string, text: string): ParsedPage => ({
  name,
  link: `https://demo.woeler.nl/${name}`,
  title: name,
  description: "",
  h1: [],
  h2: [],
  text,
  missingAlt: 0,
  noindex: false,
});

const address = auditAddress([
  page("Home", "Wij helpen je. U kunt bellen."),
  page("Diensten", "Jouw situatie telt."),
  page("Contact", "Uw afspraak plannen we samen."),
]);
assert.equal(address.mixed.length, 1);
assert.equal(address.informal.length, 1);
assert.equal(address.formal.length, 1);

assert.equal(replaceAddress("<p>Je ziet jouw huis.</p>", "u"), "<p>U ziet uw huis.</p>");
assert.equal(replaceAddress("<p class=\"u\">U ziet uw huis.</p>", "je"), "<p class=\"u\">Je ziet jouw huis.</p>");

const mistakes = misspellings("Een warmptepomp in huis.", {
  correct: (word) => word.toLowerCase() !== "warmptepomp",
  suggest: () => ["warmtepomp"],
}, new Set());
assert.equal(mistakes[0]?.suggestion, "warmtepomp");

assert.equal(planBulk("style", "Zet de hele site op u.").kind, "style");
assert.deepEqual(planBulk("text", "Vervang gratis kennismaking door adviesgesprek."), {
  kind: "replace",
  from: "gratis kennismaking",
  to: "adviesgesprek",
  seo: false,
});
assert.equal(planBulk("text", "Vervang je door u.").kind, "clarify");

console.log("text-audit ok");
