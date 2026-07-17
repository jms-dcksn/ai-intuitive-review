// Re-download the pinned filing from SEC EDGAR. The copy in data/ is committed
// so the demo is deterministic; this script exists to reproduce it (or swap the
// accession for a different company's 10-K).
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Chegg, Inc. — Form 10-K FY2025, filed 2026-03-09.
const CIK = "1364954";
const ACCESSION = "0001364954-26-000021";
const PRIMARY_DOC = "chgg-20251231.htm";

const url = `https://www.sec.gov/Archives/edgar/data/${CIK}/${ACCESSION.replace(/-/g, "")}/${PRIMARY_DOC}`;
const out = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
  "chgg-10k-fy2025.htm",
);

// EDGAR requires a descriptive User-Agent; anonymous requests get blocked.
const res = await fetch(url, {
  headers: { "User-Agent": "ai-intuitive-review demo (jms.dcksn88@gmail.com)" },
});
if (!res.ok) throw new Error(`EDGAR fetch failed: ${res.status} ${url}`);
const html = await res.text();
await writeFile(out, html, "utf8");
console.log(`wrote ${out} (${(html.length / 1e6).toFixed(1)}MB) from ${url}`);
