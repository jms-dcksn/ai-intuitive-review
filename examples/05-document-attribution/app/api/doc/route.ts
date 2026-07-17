import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

let cached: string | null = null;

/**
 * Serve the filing's body HTML for the source pane. The document is rendered
 * as EDGAR authored it (inline styles and all) — the only edits are removing
 * the invisible inline-XBRL header and anything executable.
 */
export async function GET(): Promise<Response> {
  if (!cached) {
    const file = path.join(process.cwd(), "data", "chgg-10k-fy2025.htm");
    const html = await readFile(file, "utf8");
    const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;
    cached = body
      .replace(/<ix:header[\s\S]*?<\/ix:header>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/\son[a-z]+="[^"]*"/gi, "")
      // Relative image refs (the logo) live next to the filing on EDGAR.
      .replace(
        /(<img[^>]+src=")(?!https?:|data:)/gi,
        "$1https://www.sec.gov/Archives/edgar/data/1364954/000136495426000021/",
      );
  }
  return new Response(cached, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
