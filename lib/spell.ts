import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";

type Spell = {
  correct: (word: string) => boolean;
  suggest: (word: string) => string[];
};

const require = createRequire(import.meta.url);
const nspell = require("nspell") as (aff: Buffer, dic: Buffer) => Spell;

let pending: Promise<Spell> | null = null;

export function dutchSpell() {
  if (!pending) {
    const dir = path.join(process.cwd(), "node_modules", "dictionary-nl");
    pending = Promise.all([readFile(path.join(dir, "index.aff")), readFile(path.join(dir, "index.dic"))]).then(
      ([aff, dic]) => nspell(aff, dic),
    );
  }
  return pending;
}

export function allowWords(name: string, siteUrl: string) {
  const host = siteUrl.replace(/^https?:\/\//i, "").split("/")[0] ?? "";
  const words = new Set<string>();
  for (const piece of `${name} ${host}`.toLowerCase().split(/[^a-zà-ÿ]+/)) {
    if (piece.length >= 3 && piece !== "www") words.add(piece);
  }
  return words;
}
