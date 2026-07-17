// HTML → canonical plain text + section-offset map.
//
// The extracted text is what gets sent to the Citations API, so its
// *non-whitespace* characters must match what the browser renders — the client
// anchors quotes with a whitespace-insensitive search, so whitespace itself is
// free to differ. That means: same entity decoding as the DOM, inline tags
// removed without inserting spaces (adjacent inline elements render glued),
// block tags becoming line breaks.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const html = await readFile(path.join(dir, "chgg-10k-fy2025.htm"), "utf8");

const BLOCK_TAGS =
  "div|p|table|thead|tbody|tr|td|th|br|hr|h1|h2|h3|h4|h5|h6|li|ul|ol|section";

let text = html
  // The inline-XBRL header is display:none metadata — the browser never renders it.
  .replace(/<ix:header[\s\S]*?<\/ix:header>/gi, "")
  .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
  .replace(/<!--[\s\S]*?-->/g, "")
  // Block-level boundaries become newlines; everything else vanishes without
  // inserting a character, matching how adjacent inline spans render.
  .replace(new RegExp(`</?(?:${BLOCK_TAGS})(?:\\s[^>]*)?/?>`, "gi"), "\n")
  .replace(/<[^>]+>/g, "");

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
text = text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, ent) => {
  if (ent[0] === "#") {
    const code =
      ent[1] === "x" || ent[1] === "X"
        ? parseInt(ent.slice(2), 16)
        : parseInt(ent.slice(1), 10);
    if (!Number.isNaN(code)) {
      // Decode NBSP to a plain space so the canonical text is search-friendly.
      return code === 160 ? " " : String.fromCodePoint(code);
    }
  }
  return NAMED[ent] ?? m;
});

text = text
  .replace(/[ \t ]+/g, " ")
  .replace(/ ?\n ?/g, "\n")
  .replace(/\n{3,}/g, "\n\n")
  .trim();

// Section map: each 10-K item label appears in the table of contents and again
// as the real heading in the body — line-anchored, the *last* match is the
// heading. Cross-references ("see Item 1A") are inline, not line-anchored.
const ITEMS = [
  ["item-1", /^Item 1\.\s*Business/gim, "Item 1 · Business"],
  ["item-1a", /^Item 1A\.\s*Risk Factors/gim, "Item 1A · Risk Factors"],
  ["item-1b", /^Item 1B\./gim, "Item 1B · Unresolved Staff Comments"],
  ["item-2", /^Item 2\.\s*Properties/gim, "Item 2 · Properties"],
  ["item-3", /^Item 3\.\s*Legal/gim, "Item 3 · Legal Proceedings"],
  ["item-5", /^Item 5\./gim, "Item 5 · Market for Common Equity"],
  ["item-7", /^Item 7\.\s*Management/gim, "Item 7 · MD&A"],
  ["item-7a", /^Item 7A\./gim, "Item 7A · Market Risk"],
  ["item-8", /^Item 8\./gim, "Item 8 · Financial Statements"],
  ["item-9a", /^Item 9A\./gim, "Item 9A · Controls and Procedures"],
];

const sections = [];
for (const [id, re, label] of ITEMS) {
  const matches = [...text.matchAll(re)];
  if (matches.length === 0) continue;
  const last = matches[matches.length - 1];
  sections.push({ id, label, start: last.index });
}
sections.sort((a, b) => a.start - b.start);

await writeFile(path.join(dir, "chgg-10k-fy2025.txt"), text, "utf8");
await writeFile(
  path.join(dir, "sections.json"),
  JSON.stringify(sections, null, 2),
  "utf8",
);

console.log(`text: ${text.length} chars (~${Math.round(text.length / 4 / 1000)}K tokens)`);
for (const s of sections) console.log(`  ${String(s.start).padStart(7)}  ${s.label}`);
