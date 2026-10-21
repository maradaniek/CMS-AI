import assert from "node:assert/strict";
import { auditPages, parseHtml, type ParsedPage } from "../lib/seo-audit";

const html = `<!doctype html><html><head>
<title>Warmtepompen &#8211; Aarts</title>
<meta name="description" content="Een warmtepomp voor thuis, met installatie en advies.">
<meta name="robots" content="index, follow">
</head><body>
<header><h1>Menu</h1></header>
<main>
<h1>Warmtepompen voor thuis</h1>
<h2>Hybride</h2>
<p>Een warmtepomp haalt warmte uit de lucht.</p>
<img src="/huis.jpg">
<img src="/logo.jpg" alt="Aarts">
</main>
<footer><p>Footer</p></footer>
</body></html>`;

const parsed = parseHtml(html);
assert.equal(parsed.title, "Warmtepompen – Aarts");
assert.equal(parsed.description, "Een warmtepomp voor thuis, met installatie en advies.");
assert.deepEqual(parsed.h1, ["Warmtepompen voor thuis"]);
assert.deepEqual(parsed.h2, ["Hybride"]);
assert.equal(parsed.missingAlt, 1);
assert.equal(parsed.noindex, false);
assert.equal(parsed.text.includes("Menu"), false);

function page(patch: Partial<ParsedPage>): ParsedPage {
  return {
    name: "Pagina",
    link: "https://demo.woeler.nl/pagina",
    title: "x".repeat(40),
    description: "y".repeat(90),
    h1: ["Kop"],
    h2: ["Tussenkop"],
    text: "Gewone tekst over de pagina.",
    missingAlt: 0,
    noindex: false,
    ...patch,
  };
}

const report = auditPages(
  [
    page({ name: "Leeg", link: "https://demo.woeler.nl/leeg", title: "", h1: [], h2: [], description: "" }),
    page({ name: "Kort", link: "https://demo.woeler.nl/kort", title: "x".repeat(30) }),
    page({ name: "Lang", link: "https://demo.woeler.nl/lang", title: "x".repeat(70) }),
    page({ name: "Dubbel", link: "https://demo.woeler.nl/dubbel", h1: ["Eerste", "Tweede"] }),
    page({ name: "Zelfde", link: "https://demo.woeler.nl/zelfde", title: "Zelfde titel voor twee pagina", h1: ["Gedeeld"] }),
    page({ name: "Zelfde 2", link: "https://demo.woeler.nl/zelfde-2", title: "Zelfde titel voor twee pagina", h1: ["Gedeeld"] }),
    page({
      name: "Woord",
      link: "https://demo.woeler.nl/woord",
      title: "Warmtepomp in de titel-tag van deze pagina",
      h1: ["Warmtepomp"],
      text: "warmtepomp warmtepomp warmtepomp",
    }),
  ],
  "warmtepomp",
);

function titles() {
  return report.groups.map((group) => group.title);
}

assert.deepEqual(parsed.h3, []);
assert.ok(titles().includes("Geen H1"));
assert.ok(titles().includes("Geen titel-tag"));
assert.ok(titles().some((title) => title.startsWith("Titel-tag te kort")));
assert.ok(titles().some((title) => title.startsWith("Titel-tag te lang")));
assert.ok(titles().includes("Meerdere H1's"));
assert.ok(titles().includes("Dezelfde titel-tag"));
assert.ok(titles().includes("Dezelfde H1"));
assert.equal(report.keywords.find((row) => row.name === "Woord")?.inTitle, true);
assert.equal(report.keywords.find((row) => row.name === "Woord")?.inH1, true);
assert.equal(report.keywords.find((row) => row.name === "Leeg")?.count, 0);
assert.ok(titles().includes("Focuswoord ontbreekt in de titel-tag"));
assert.equal(report.checked, 7);

const headings = auditPages(
  [
    page({ name: "Sprong", link: "https://demo.woeler.nl/sprong", h1: ["Kop"], h2: [], h3: ["Stap een", "Stap twee"] }),
    page({ name: "Netjes", link: "https://demo.woeler.nl/netjes", h1: ["Kop"], h2: ["Tussen"], h3: ["Dieper"] }),
  ],
  "",
);
const jump = headings.groups.find((group) => group.title === "H1 en H3, geen H2");
assert.deepEqual(jump?.hits.map((hit) => hit.name), ["Sprong"]);

console.log("seo-audit ok");
