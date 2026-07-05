# Walkthrough 02 — Progressive Disclosure

> Code: [`examples/02-progressive-disclosure`](../examples/02-progressive-disclosure)

Example 01 grounded individual claims. This one handles the opposite failure mode:
not "where did this come from?" but "**you've given me too much — let me choose
how deep to go.**" An agent that dumps a wall of analysis is untrustworthy in a
different way: the user can't tell the headline from the footnote, so they either
skim and miss the critical item, or drown and disengage.

The fix is to make the model **tier** its output and let the UI reveal it lazily.

## The core idea: the schema *is* the design

If you ask a model for "a report," you get prose, and prose has no tiers — every
sentence renders at the same weight. So instead we make the tiers *structural*, in
a schema the model must fill
([`lib/schema.ts`](../examples/02-progressive-disclosure/lib/schema.ts)):

```ts
reportSchema = {
  verdict, recommendation, confidence,     // tier 0 — always visible
  findings: [{
    title, severity, summary,              // tier 1 — collapsed card header
    detail,                                // tier 2 — revealed on expand
    evidence: [{ label, detail, source }], // tier 3 — one level deeper
  }],
}
```

Now the model *can't* dump a wall of text even if it wants to — a one-sentence
`summary` and a paragraph `detail` are different fields. The UI's only job is to
decide when to show each field. The `.describe()` on each field is load-bearing:
it tells the model what belongs at each tier ("one sentence a busy reviewer can
scan" vs. "the raw underlying facts, quoted closely").

## Two axes of reveal

Keep these separate in your head — the example is built around the distinction:

| | Controlled by | Mechanism |
|---|---|---|
| **Streaming** | the model | `streamObject` fills the tree top-down over time |
| **Disclosure** | the user | expand / show-evidence toggles |

Streaming makes the wait feel productive (the verdict is useful before the last
finding lands). Disclosure keeps the finished view scannable (depth is opt-in).
Neither replaces the other.

## Data flow

```
sample-data.ts (raw vendor material) ─► streamObject({ schema: reportSchema })
                                              │  serialized partial JSON
                                              ▼
         /api/assess  ──(text stream)──►  useObject({ schema })
                                              │  DeepPartial<Report>, re-parsed per chunk
                                              ▼
              ReportView (verdict + card list) → FindingCard (tiers 2 & 3)
```

## Step 1 — The input: deliberately mixed material

[`lib/sample-data.ts`](../examples/02-progressive-disclosure/lib/sample-data.ts)
is a vendor's raw paperwork — a security questionnaire, a SOC 2 summary, a DPA
excerpt, a subprocessor list, an incident log. It's mixed on purpose: a strong
security baseline, but a US-only residency constraint, an off-list subprocessor,
and an **unresolved P1 near-miss with no post-mortem**. That spread is what gives
the report genuinely different severities to tier — and a clear "most
decision-relevant" finding that should surface first.

## Step 2 — Streaming a structured object

[`lib/assess.ts`](../examples/02-progressive-disclosure/lib/assess.ts) is the whole
live path:

```ts
return streamObject({
  model: anthropic(MODEL),
  schema: reportSchema,
  system: SYSTEM,   // "put the most decision-relevant findings first…"
  prompt: `${TASK}\n\n=== SOURCE MATERIAL ===\n${SOURCE_MATERIAL}`,
});
```

The route returns `result.toTextStreamResponse()`, which streams the object
serialized as it's generated. This is a **different AI SDK primitive** from
example 01: 01 streamed text plus typed `data-citation` parts; 02 streams one
partial object. The rule of thumb — match the primitive to the shape of the data:
text-with-annotations → data parts; a nested tree → `streamObject`.

## Step 3 — Consuming the partial object

[`app/page.tsx`](../examples/02-progressive-disclosure/app/page.tsx) uses
`experimental_useObject`:

```ts
const { object, submit, isLoading, error } = useObject({
  api: "/api/assess",
  schema: reportSchema,
});
```

`object` is a `DeepPartial<Report>` that updates on every chunk — the hook runs a
partial-JSON parser over the accumulating text, so `verdict` resolves first, then
`findings[0]`, then `findings[1]`, each field at a time. The UI just renders
whatever is present. That's why every component treats fields as maybe-missing and
drops a `.skeleton` shimmer where something hasn't arrived yet.

## Step 4 — Tier 0 and the card list

[`components/ReportView.tsx`](../examples/02-progressive-disclosure/components/ReportView.tsx)
renders the verdict (recommendation badge + confidence + one-liner) and maps the
findings to cards. Because array elements can be momentarily `undefined` mid-parse,
it guards each item (`f ? <FindingCard … /> : null`) rather than trusting the
array to be dense.

## Step 5 — The disclosure primitive

[`components/FindingCard.tsx`](../examples/02-progressive-disclosure/components/FindingCard.tsx)
holds the two independent reveal controls as local state:

```ts
const [open, setOpen] = useState(false);          // tier 2
const [showEvidence, setShowEvidence] = useState(false);  // tier 3
```

- **Tier 1** (always shown): title, a severity chip, one-line summary — enough to
  triage without opening anything.
- **Tier 2** (`open`): the `detail` paragraph.
- **Tier 3** (`showEvidence`, nested inside tier 2): the raw `evidence` items with
  their sources.

Both controls are real buttons with `aria-expanded`, so the disclosure is
keyboard- and screen-reader-accessible — the accessibility is the reason to reach
for Radix/shadcn `Collapsible` in production, but the pattern is exactly this.
Crucially, both default to **closed**: no matter how much the model produced, the
first paint is a scannable list.

## Step 6 — Streaming affordances

While `isLoading` is true, `FindingCard` shows a shimmer where a field will land,
and `ReportView` shows a "streaming findings…" pulse. These aren't decoration —
they tell the user the difference between "the model didn't find anything here" and
"it hasn't gotten here yet," which matters when you're deciding whether it's safe
to act on what you can already see.

## Step 7 — Running without a key

[`lib/mock.ts`](../examples/02-progressive-disclosure/lib/mock.ts) reproduces the
streaming exactly, without a model: it `JSON.stringify`s the recorded report and
enqueues it in 22-character slices with small delays. Because it slices the
*serialized* object left-to-right, the partial-JSON parser on the client sees the
verdict complete first and each finding fill in after — the same top-down reveal as
a live call. A sibling `GET /api/assess` tells the client whether it's live or
mock (the object stream itself carries only the report, so the banner flag rides a
separate request). Same philosophy as `rlm-deep-agents`: the example demonstrates
itself, streaming and all, with no credentials.

## What to take to the other examples

- **Make structure carry the meaning.** A schema with tiers forces the model to
  separate headline from detail from evidence. You can't get progressive
  disclosure out of prose.
- **Two reveal axes, kept separate.** Streaming (model-paced) and disclosure
  (user-paced) solve different problems; build both.
- **Render partial, always.** With `streamObject`/`useObject`, every field is
  maybe-absent mid-stream — guard for it and show *where* the gap is.
- **Pick the primitive by data shape.** Trees want `streamObject`; annotated text
  wants custom data parts (01); an event trajectory wants message parts (03).
