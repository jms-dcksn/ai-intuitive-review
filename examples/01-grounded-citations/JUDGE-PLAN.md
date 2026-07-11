# Add-on to Example 01 — Online Faithfulness Judge

> **Status: built**, including the reconciliation stretch. This doc frames the
> feature and records the design decisions; the sections below describe the plan,
> and **"What actually shipped"** at the end records where the implementation
> diverged (the judge scores answer *segments*, not a free-text claim list — that's
> what made the inline reconciliation exact).

## What this adds

Example 01 today surfaces two **structural** grounding signals, both derived from
the Anthropic Citations API, both blind to meaning:

- **citations** — `[n]` markers for spans the model *claims* support a sentence
  (`data-citation` parts, rendered in `components/AnswerView.tsx`);
- **ungrounded** — a text run with no trailing citation, flagged after streaming
  ends (`AnswerView.tsx:29-44`).

Neither knows whether a claim is *true to the docs*. This add-on introduces an
**online LLM-as-judge** that reads the finished answer and the sources and returns
a **faithfulness verdict** — the semantic layer the structural signals can't reach.

The reason this is worth building here specifically: the judge is exactly the
thing that separates **uncited** from **unsupported**.

- A **cited** claim can still be unfaithful — the model attached a `cited_text`
  span that doesn't actually support the sentence (mis-citation). The `[n]` marker
  trusts it blindly.
- An **ungrounded** claim can still be faithful — supported by the docs, the model
  just didn't cite it.

The recorded mock answer already contains a clean instance of the second case: the
final sentence — *"the 14-day figure applies only to self-serve Starter/Pro plans,
not Enterprise"* (`lib/mock.ts:55`) — carries no citation and is flagged
`ungrounded`. The judge's job is to say whether that sentence is actually supported
by the corpus. That reconciliation is the demo's teaching moment.

## Decision 1 — what the judge scores against: **full docs + citation hints**

The judge sees the **full text of every document the generator saw**, plus the
answer's **claim→citation map** as structured hints. Rejected alternatives and why:

| Judge sees | Catches | Misses | Verdict |
|---|---|---|---|
| Cited spans only (`cited_text`) | Whether each cited span supports its claim | Every uncited claim (no span exists to score); contradictions with docs the model ignored | Circular & blind — measures *citation precision*, not faithfulness |
| Cited docs (full text of docs that got cited) | Above + contradictions within cited docs | Claims that cite nothing at all | Half-measure |
| **Full docs + citation hints** | Fabrications supported nowhere; contradictions; mis-citations; can adjudicate the app's own `ungrounded` flags | — | The honest faithfulness test |

Cited-spans-only can't even look at the highest-risk claims — the uncited ones —
because there's no span to compare against; it only sees evidence the generator
already chose, which is circular. Full-docs is the only option that turns a blind
`ungrounded` flag into a real semantic verdict. The token cost that normally argues
for cited-only is negligible here — the sample docs are a few hundred words.

> **At scale** you would retrieve-then-judge (judge against the top-k retrieved
> chunks, not the whole corpus). Out of scope for this demo; noted so the design
> isn't mistaken for a production pattern.

## Decision 2 — judge model: **a separate, stronger model (Opus 4.8)**

Generator is `claude-sonnet-5` (`lib/anthropic.ts:5`). The judge runs on a
**different** model — `claude-opus-4-8` — for two reasons: (1) **independence** —
same-model self-grading has a documented leniency / self-preference bias, so a
demo about *trust* shouldn't have the model grade its own homework; (2) **judgment
quality** — Opus catches subtler unfaithfulness. The judge runs once per answer, so
the extra cost/latency is a single non-streamed call, hidden behind a "Judging…"
state. Model id lives in `JUDGE_MODEL` env, defaulting to `claude-opus-4-8`.

## Decision 3 — UI: **verdict pill + score**

A pill renders **below** the answer (not inline). States:

1. **off** — toggle disabled → no pill.
2. **judging** — answer has streamed, judge call in flight → pulsing `Judging…`.
3. **resolved** — `✓ Faithful  92 / 100` (green) or `✗ Unfaithful  61 / 100`
   (red). Click to expand the list of unsupported/contradicted claims, each with a
   one-line rationale and the doc it conflicts with (or "supported nowhere").

## Verdict logic

The judge returns **per-claim** verdicts and an overall score. To keep the pass/fail
interpretable rather than a mystery threshold:

- **verdict** = `fail` if any claim is `unsupported` or `contradicted`, else `pass`.
- **score** = holistic 0–100 the judge assigns (shown for texture; does not by
  itself decide the verdict).

Driving pass/fail off the claim list, not off the score crossing a magic number,
means the expanded panel always *explains* a failure.

## Data flow — in-stream, single request

The judge needs the **complete** answer, which only exists once streaming ends, so
it runs at the tail of the existing `/api/ask` request — no second round-trip, no
re-sending docs. The already-open `UIMessageStream` stays open through the judge
call and emits one final `data-judge` part.

```
POST /api/ask { question, judge: true }
  └─ createUIMessageStream.execute:
       data-mode  (transient)                     ← unchanged
       stream generator  → text-* / data-citation ← unchanged (SegmentWriter)
       [if judge] judgeFaithfulness(...)  → data-judge (persisted)
```

The client toggle governs the `judge` flag in the POST body. Flipping the toggle
applies to the **next** Ask. (Retroactively judging an already-shown answer would
need a standalone `/api/judge` route — noted as a stretch, not built.)

## The build

### `lib/types.ts` — new shapes + data part

```ts
export type ClaimStatus = "supported" | "unsupported" | "contradicted";

export interface FaithfulnessClaim {
  text: string;          // the claim lifted from the answer
  status: ClaimStatus;
  rationale: string;     // one line: why
  docId?: string;        // supporting/contradicting source, if any
}

export interface FaithfulnessVerdict {
  verdict: "pass" | "fail";
  score: number;         // 0–100
  claims: FaithfulnessClaim[];
  model: string;         // judge model id, shown in the expanded panel
}
```

Add to `ReviewDataParts`: `judge: FaithfulnessVerdict`. Non-transient, so it lands
in `message.parts` (like `data-citation`, unlike `data-mode`).

### `lib/segment-writer.ts` — expose what the judge needs

`SegmentWriter` already sees every text delta and every citation. Add two
accumulators + getters so the route can hand the judge the assembled answer and
its citation map without re-parsing the stream:

- accumulate `text` deltas → `fullText(): string`
- accumulate `citation(...)` spans → `citations(): Citation[]`

### `lib/judge.ts` — new

`judgeFaithfulness(question, docs, answerText, citations): Promise<FaithfulnessVerdict>`

- **model**: `process.env.JUDGE_MODEL ?? "claude-opus-4-8"`, non-streamed
  `messages.create`.
- **structured output**: define a `report_faithfulness` tool whose `input_schema`
  is the `FaithfulnessVerdict` shape (minus `model`); force it with
  `tool_choice: { type: "tool", name: "report_faithfulness" }`; parse the single
  `tool_use` block. (Tool-forced output is the reliable way to get strict JSON —
  see the `claude-api` skill.)
- **system prompt**: "You are a strict faithfulness judge. A claim is *supported*
  only if it is entailed by the source documents, *contradicted* if a document
  conflicts with it, *unsupported* if no document establishes it. Presence or
  absence of a citation does not by itself make a claim faithful — verify against
  the document text. Judge only faithfulness to the sources, not style or
  completeness."
- **user content**: the full docs (as `document` blocks or plain text), the
  question, the answer, and the citation map rendered as hints
  (`claim → cited span in <doc title>`).

### `app/api/ask/route.ts`

- read `judge: boolean` from the POST body;
- after the generator finishes, if `judge` and not `mocked`, call
  `judgeFaithfulness(question, SAMPLE_DOCS, out.fullText(), out.citations())` and
  `writer.write({ type: "data-judge", data: verdict })`.

### `lib/mock.ts` — canned verdict for keyless mode

Add `mockFaithfulnessVerdict()` returning a verdict that **adjudicates the recorded
answer's `ungrounded` sentence** (the 14-day Starter/Pro line, `mock.ts:55`). Pick
the outcome that best tells the story against the sample docs — if the docs do
establish the 14-day self-serve figure, mark it `supported` so the pill shows the
reconciliation ("flagged ungrounded, but the judge confirms it's backed by
`enterprise-terms`"); otherwise `unsupported`. Route emits it when `mocked && judge`.

### `components/JudgeVerdict.tsx` — new

Pill component. Props: `verdict: FaithfulnessVerdict | null`, `judging: boolean`.
Renders the three states above; expandable claim list on click. Color by verdict.

### `app/page.tsx`

- `const [judgeEnabled, setJudgeEnabled] = useState(false)` + a checkbox/switch in
  `.controls`;
- include `judge: judgeEnabled` in the `prepareSendMessagesRequest` body;
- derive the judge part from `assistant.parts.find(p => p.type === "data-judge")`;
- `judging = judgeEnabled && streaming && assistantHasText && !judgePart`;
- render `<JudgeVerdict verdict={judgePart?.data ?? null} judging={judging} />`
  below `<AnswerView>`.

### `app/globals.css`

Pill + score + expand styles; green/red verdict variants; pulse for `Judging…`.

## Stretch

- **Reconciliation callouts** — **BUILT.** Cross the judge's per-segment verdicts
  with the structural signals and label the disagreements inline: *cited but the
  judge won't support it* (mis-citation, red), and *flagged ungrounded but the
  judge does support it* (false alarm, green). See "What actually shipped" for how
  the alignment problem was solved.
- **`/api/judge` route** — not built. Judge an already-shown answer when the toggle
  is flipped on after the fact. (The judge currently runs at the tail of the same
  `/api/ask` stream, so it applies to the next Ask, not retroactively.)

## What actually shipped (diverges from the plan above)

The plan had the judge return a **free-text claim list** scored against the answer
string. That can't be mapped back onto the rendered answer, so the reconciliation
stretch would have needed fuzzy claim-span matching. Instead:

- **The judge scores answer *segments*.** A segment is one text run between
  citations — exactly the unit the `ungrounded` flag is already computed over.
  `SegmentWriter` now records each run and its citations (`segments()`); the judge
  returns a verdict per run *index*; the k-th rendered text part maps to
  `judge.segments[k]`. Alignment is exact by construction — no fuzzy matching.
- **`FaithfulnessVerdict` carries `segments: FaithfulnessSegment[]`** (`index`,
  `text`, `cited`, `status`, `rationale`, `docId?`), not `claims`. The structural
  facts (`text`, `cited`) are stamped server-side; the judge only decides `status`.
- **`assembleVerdict`** (in `lib/judge.ts`, shared with the mock) merges the judge's
  per-segment status onto those facts and derives `verdict` deterministically
  (`fail` if any segment isn't supported), so a skipped segment can't silently pass.
- **`AnswerView.reconcile()`** renders the four-cell matrix inline; **`JudgeVerdict`**
  lists only the *interesting* segments (disagreements + any unsupported), hiding
  the cited-and-supported agreements.

The plan's remaining details (in-stream trigger, Opus judge via forced tool-use,
the pill's three states, the toggle wiring) shipped as written.

## Files touched

New: `lib/judge.ts`, `components/JudgeVerdict.tsx`.
Changed: `lib/types.ts`, `lib/segment-writer.ts`, `lib/mock.ts`,
`app/api/ask/route.ts`, `components/AnswerView.tsx`, `app/page.tsx`,
`app/globals.css`.
Env: `JUDGE_MODEL` (default `claude-opus-4-8`) added to `.env.example`.
