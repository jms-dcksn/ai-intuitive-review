// Quote → DOM Range resolution over the rendered filing.
//
// The model's `cited_text` comes from the extracted plain text; the doc pane
// renders the original EDGAR HTML. The two agree on every *non-whitespace*
// character (same text nodes, same entity decoding) but not on whitespace —
// tag boundaries became newlines during extraction, &nbsp; became a space,
// etc. So the index is built over a "squashed" view of the document (all
// whitespace removed) with a per-character map back to (text node, offset).
// Anchoring is then an exact substring search that whitespace can't break.
// A quote that still can't be found is reported as failed — the UI flags it
// rather than faking a highlight.

export interface AnchorIndex {
  squashed: string;
  nodes: Text[];
  /** For each squashed char: index into `nodes`. */
  nodeAt: Int32Array;
  /** For each squashed char: offset within that text node. */
  offsetAt: Int32Array;
}

export function buildAnchorIndex(root: HTMLElement): AnchorIndex {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let total = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    nodes.push(n as Text);
    total += (n as Text).data.length;
  }

  const chars: string[] = [];
  const nodeAt = new Int32Array(total);
  const offsetAt = new Int32Array(total);
  let k = 0;
  for (let i = 0; i < nodes.length; i++) {
    const data = nodes[i].data;
    for (let j = 0; j < data.length; j++) {
      const c = data[j];
      if (isWhitespace(c)) continue;
      chars.push(c);
      nodeAt[k] = i;
      offsetAt[k] = j;
      k++;
    }
  }

  return {
    squashed: chars.join(""),
    nodes,
    nodeAt: nodeAt.subarray(0, k),
    offsetAt: offsetAt.subarray(0, k),
  };
}

/** Includes NBSP and the usual suspects — must match the extraction script's idea of whitespace. */
function isWhitespace(c: string): boolean {
  return /\s/.test(c);
}

/** Resolve a verbatim quote to a live DOM Range, or null if it isn't in the document. */
export function findRange(index: AnchorIndex, quote: string): Range | null {
  const needle = quote.replace(/\s+/g, "");
  if (!needle) return null;
  const start = index.squashed.indexOf(needle);
  if (start === -1) return null;
  const end = start + needle.length - 1; // inclusive last char

  const range = document.createRange();
  range.setStart(index.nodes[index.nodeAt[start]], index.offsetAt[start]);
  range.setEnd(index.nodes[index.nodeAt[end]], index.offsetAt[end] + 1);
  return range;
}

// --- CSS Custom Highlight registry -----------------------------------------
// Highlights paint ranges without touching the DOM — critical for a 2MB
// document where injecting <mark> nodes would both be slow and invalidate
// every previously computed Range. Typed loosely because lib.dom's Highlight
// API typings lag behind shipping browsers.

type HighlightCtor = new (...ranges: Range[]) => unknown;

function registry(): Map<string, unknown> | null {
  const css = globalThis.CSS as unknown as { highlights?: Map<string, unknown> };
  return css?.highlights ?? null;
}

export function highlightsSupported(): boolean {
  return registry() !== null;
}

export function setHighlight(name: string, ranges: Range[]): void {
  const reg = registry();
  if (!reg) return;
  if (ranges.length === 0) {
    reg.delete(name);
    return;
  }
  const Highlight = (globalThis as Record<string, unknown>)
    .Highlight as HighlightCtor;
  reg.set(name, new Highlight(...ranges));
}

export function clearHighlight(name: string): void {
  registry()?.delete(name);
}
