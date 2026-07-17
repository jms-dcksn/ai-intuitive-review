# Example 05 (plan) — Document Attribution & Highlighting

> The design decisions of record for this example, agreed before the code. The
> top-level [README](../../README.md) sketch ("PDF.js + bounding boxes +
> react-pdf-highlighter") is the seed; this pins the actual document, a
> deliberate deviation from the PDF approach, and the exact pipeline.

## The trust question

**"Jump me to the exact place in the source."** Example 01 proved a claim can
carry a verbatim quote. But at 10-K scale (~400K characters, hundreds of pages'
worth of prose) a quote alone isn't verification — the user needs to see the
span *in situ*: which section it lives in, what surrounds it, and how the
evidence is distributed across the whole filing. 05 is 01 scaled up to a long
document, where **navigation is the trust feature**: click a finding → the
document scrolls to the exact sentence, highlighted; a minimap shows where
every finding lands so the user can see at a glance whether the evidence
clusters where it should (Risk Factors, MD&A) or is scattered noise.

Failure modes to avoid:

1. **Quote-without-place.** A findings list with quotes but no way into the
   source document is a claim, not evidence. The doc pane is the primary
   verification surface, always visible — never a modal or a link out.
2. **Silent anchor failure.** If a model quote can't be located in the rendered
   document, showing the finding without a highlight quietly breaks the
   contract. Unresolvable quotes must be visibly flagged ("could not locate
   this span"), because an honest miss preserves trust and a silent one
   destroys it.

## Scenario

**One real SEC filing, pulled from the internet, committed to the repo.**

- **Document:** Chegg, Inc. Form 10-K for fiscal year 2025, filed 2026-03-09.
  SEC EDGAR accession `0001364954-26-000021`, primary document
  `chgg-20251231.htm` (CIK 1364954). Committed at
  [`data/chgg-10k-fy2025.htm`](./data/chgg-10k-fy2025.htm): ~2.2MB inline-XBRL
  HTML, ~399K chars of extracted text ≈ **100K tokens** — fits in one Claude
  context, so no chunking or vector store.
- **Agent task:** *"Find every statement in this 10-K where Chegg attributes
  business risk, competitive pressure, or revenue decline to generative AI."*
  Chegg is the canonical AI-disruption story — the filing mentions generative
  AI 14 times across Risk Factors, MD&A, and Business — so the findings
  genuinely spread across the document and the minimap has a story to tell.
  Findings carry a category (`risk-factor`, `competitive`, `financial-impact`,
  `strategy`) and severity so the left panel reads as an analysis, not a grep.

## Key decision: render the filing's own HTML, not a PDF

The README sketched the PDF path (spatial metadata, bounding boxes, PDF.js
text-layer drift). **We deviate deliberately:** EDGAR's native format *is*
HTML — a PDF of a 10-K is a derived artifact. Rendering the filing's actual
HTML in the source pane means:

- The text the model cited and the text on screen come from the same bytes, so
  attribution reduces to **text anchoring** (quote → DOM Range), which is
  deterministic — no OCR, no PDF.js whitespace drift, no coordinate math.
- The document looks like the real filing (EDGAR HTML renders natively in
  browsers), which is itself a trust cue.
- The pattern's UX — click-to-span, highlight overlay, minimap — is identical
  to what the PDF version would show.

The PDF/bounding-box variant (contracts, scanned docs) is a real topic but a
different pipeline; it's recorded under non-goals with a note on where it would
slot in.

## UX rules (the actual pattern)

1. **Split view, document always visible.** Findings panel left, the 10-K
   right in a scrollable pane. The doc is the primary evidence surface; the
   findings are an index into it.
2. **Click = jump + highlight.** Clicking a finding scrolls the doc to the
   exact span and highlights it (persistent highlight + brief pulse on
   arrival). The finding card shows the verbatim quote and its section
   breadcrumb ("Item 1A · Risk Factors"), so claim-vs-source comparison starts
   before the jump.
3. **Minimap of all findings.** A thin vertical strip beside the doc pane maps
   the full scroll height; one marker per finding (colored by category), plus a
   viewport indicator. Clicking a marker jumps. This answers the at-a-glance
   question no list can: *where does the evidence live in this document?*
4. **All-spans ghost mode.** A toggle renders every finding's span as a faint
   highlight simultaneously, so scrolling the document reads like a marked-up
   copy of the filing.
5. **Honest anchoring.** Quote resolution is fuzzy (whitespace-normalized) but
   failure is loud: a finding whose quote can't be located renders with an
   explicit "span not located in document" badge and no fake highlight.
6. **Streamed arrival.** Findings stream into the left panel one at a time
   (recorded-run replay), each dropping its minimap marker as it lands —
   the "agent is reading the document" feel, consistent with 01/03/04.

## Tech approach

Same spine as 01/03/04: **Next.js + Vercel AI SDK (`useChat` +
`createUIMessageStream`) + Anthropic SDK**, with findings as a typed custom
data part (`data-finding`).

**Generation (offline script, recorded like 03/04's mock runs):**
`scripts/generate-findings.mjs` makes **one Citations API call** — the full
extracted text as a single plain-text `document` content block with
`citations: {enabled: true}` (no beta header), streamed. Citations arrive as
`citations_delta` events carrying `char_location` (`cited_text`,
`start_char_index`/`end_char_index`) — API-computed ranges, not
model-invented markers, exactly as in 01. Note citations are **incompatible
with structured outputs** (400), so the finding structure (title, category,
severity) comes from lightweight prompted formatting of the text stream, with
the quotes taken verbatim from `cited_text`. Output is committed as
`lib/findings.json`, so the demo runs deterministic and key-free; the script
re-runs with `ANTHROPIC_API_KEY` (default model `claude-opus-4-8`, streaming —
~100K input tokens per run).

**Text extraction:** `scripts/extract-text.mjs` walks the HTML (strip the
hidden `ix:header`, decode entities, collapse whitespace) to produce the
canonical text sent to the API, plus a map of `Item 1/1A/7/7A/8` heading
offsets so each finding gets a section label from its char range.

**Client anchoring — quote is the anchor, offsets are metadata.** The doc pane
renders the committed EDGAR HTML directly (`ix:header` stripped) in a scroll
container. `lib/anchor.ts` resolves each finding's `cited_text` to a DOM
`Range` via a TreeWalker over text nodes with whitespace-normalized matching —
robust to extraction-vs-DOM whitespace differences, no offset↔DOM bookkeeping.
Char offsets are used server-side only (ordering, section mapping).
Highlights render via the **CSS Custom Highlight API**
(`CSS.highlights.set(...)`) — no `<mark>` injection into a 2MB DOM, so ghost
mode with dozens of ranges stays cheap. Anchor failures surface per rule 5.

**Minimap:** after anchoring, each Range's `getBoundingClientRect().top`
relative to the scroll container's `scrollHeight` positions its marker;
a scroll listener drives the viewport indicator. Pure division, no library.

## Files

| File | Role |
|------|------|
| `data/chgg-10k-fy2025.htm` | The committed EDGAR filing (fetched via script, checked in for determinism) |
| `scripts/fetch-10k.mjs` | Re-download from EDGAR (pinned accession, proper User-Agent) |
| `scripts/extract-text.mjs` | HTML → canonical plain text + section-offset map |
| `scripts/generate-findings.mjs` | One streamed Citations API call → `lib/findings.json` |
| `lib/findings.json` | Recorded findings: `{id, title, category, severity, summary, section, quote, charStart, charEnd}` |
| `lib/types.ts` | `Finding`, `data-finding` part, typed UI message |
| `lib/anchor.ts` | `cited_text` → DOM Range (normalized TreeWalker search) + highlight registry |
| `app/api/analyze/route.ts` | `createUIMessageStream`: replays findings.json with cadence (live regen stays in the script) |
| `components/FindingsPanel.tsx` | Streaming finding cards: quote, section breadcrumb, category/severity |
| `components/DocPane.tsx` | Rendered 10-K + CSS Custom Highlights + scroll-to-span |
| `components/Minimap.tsx` | Full-height strip: finding markers + viewport indicator |
| `app/page.tsx` | Split layout, selection state, ghost-mode toggle |

## Non-goals

- **No PDF pipeline.** Bounding boxes / `react-pdf-highlighter` / text-layer
  drift belong to a source that's natively paginated (contracts, scans). If
  swapped in, only `DocPane` + `anchor.ts` change; findings and quotes are
  format-agnostic.
- **No retrieval layer.** The doc fits in one context window; chunking + a
  vector store carrying offsets through retrieval is the scale-out story, not
  this demo's.
- **No chat.** One canned task, one analysis run. The interaction budget goes
  to navigation (jump, minimap, ghost mode), which is the pattern.
- **No live API call in the request path.** The 100K-token call runs once in a
  script; the app replays the recording — same convention as 03/04.
