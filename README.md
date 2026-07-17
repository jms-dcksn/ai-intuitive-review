# AI Intuitive Review

Human validation of LLM and agent outputs. A set of small, runnable **agentic UX
patterns** that make an AI's work *explainable* and *trustable* — so a user can
glance at a recommendation, understand where it came from, verify it, and decide
whether to let the agent act.

The thesis (from [`IDEA.md`](./IDEA.md)): enterprise adoption is gated less by raw
model quality than by **trust**. Trust is built progressively, through UX, by
answering four questions the user always has:

1. **Where did this come from?** → citations & attribution
2. **How did you get here?** → walkthroughs & reasoning
3. **Can I see more without drowning?** → progressive disclosure
4. **Are you about to do something I didn't approve?** → human-in-the-loop

Each idea in `IDEA.md` becomes one **discrete, self-contained example**: a defined
input, a UX pattern, and a concrete tech approach. You can build them one at a
time and demo each on its own.

---

## The six examples

| # | Example | IDEA topic | The trust question it answers |
|---|---------|-----------|-------------------------------|
| 01 | **Grounded Citations** | Citations | *"Where did this specific claim come from?"* |
| 02 | **Progressive Disclosure** | Expandable cards / links | *"Show me more — but only when I ask."* |
| 03 | **Working in the Open** | Iterative walkthroughs | *"Reveal your decisions as you go — don't make me validate 300 at the end."* |
| 04 | **Reasoning as Proof** | Reasoning tokens as proof | *"Show your working, not just the answer."* |
| 05 | **Document Attribution** | Clickable nav + highlighting | *"Jump me to the exact place in the source."* |
| 06 | **Approval / Human-in-the-loop** | (from README: *act with approval*) | *"Ask me before you actually do it."* |

Examples 01–05 build **understanding**; 06 gates **action**. Together they cover
the full "review → trust → authorize" arc.

---

## Example breakdowns

### 01 · Grounded Citations
**What the user sees.** An answer where individual sentences carry inline
footnote markers `[1]`. Hovering a marker pops a card with the exact quoted source
span; clicking scrolls the source panel to it. Uncited sentences are visually
flagged so the user knows what is *not* grounded.

**Sample input.** A small corpus (3–5 markdown/PDF docs — e.g. a product spec, a
policy doc, a support-ticket thread) + a question like *"What's our refund window
for enterprise plans?"*

**Approach.** Don't ask the model to invent `[1]` markers in prose — that's where
hallucinated citations come from. Instead use a **structured, grounded** citation
layer:
- **Anthropic Citations API** (native): pass documents as `content` blocks with
  `citations: {enabled: true}`; the model returns text blocks each carrying
  `cited_text` + char/page ranges you render deterministically. This is the
  highest-trust path — the range comes from the API, not a prompt.
- **Provider-agnostic fallback:** have the model emit a JSON array of
  `{claim, source_id, quote}` and resolve `quote` back to a character offset in
  the source yourself (fuzzy-match to survive chunking whitespace drift).

**Stack.** Anthropic SDK for the grounded call; a `<Citation>` React component
(marker + hover-card) driving a synced source pane.

---

### 02 · Progressive Disclosure
**What the user sees.** A concise headline recommendation. Beneath it, collapsed
**evidence cards** ("3 supporting findings", "1 caveat") that expand on click.
Deep detail (raw tool output, full row data) lives one more level down. The user
controls depth; the default view stays scannable.

**Sample input.** An agent analysis result with tiers of detail, e.g. a vendor
risk summary: verdict → 3 findings → per-finding raw evidence + links.

**Approach.** Make the agent **emit a tree, not a wall of text**. Define a small
schema — `summary`, `findings[]`, each finding with `detail` and `evidence[]` —
and render each level as an expandable region. The model's job is to *tier* the
information; the UI's job is to reveal it lazily.

**Stack.** Radix UI `Collapsible`/`Accordion` (or shadcn/ui) for accessible
expandable cards; structured output via AI SDK `streamObject` / Anthropic tool
schema so the tree streams in and renders top-down.

---

### 03 · Working in the Open  ✅ *built — [`examples/03-agent-walkthrough`](./examples/03-agent-walkthrough)*
**Reframed from "trajectory replay."** Passive replay of a finished run is too
late: when an agent works for 30 minutes over a large corpus, it makes hundreds of
implicit decisions, and dumping them all at the end forces the user to validate
everything cold. So 03 is **live, incremental decision surfacing** — the agent
reveals its consequential calls *as it works* and gets them validated in flight.

**What the user sees.** An agent runs a **pre-visit clinical chart review** over a
7-document patient chart, streaming routine checks into a live **decision ledger**
as auditable receipts. Three consequential calls become **checkpoints** that stop
the run — each one pairing **verbatim document excerpts** (click to open the full
source, span highlighted) with a recommendation, its rationale, and
consequence-labeled Agree / Disagree buttons. A **trust dial** sets how much it
interrupts.

**The core idea.** Make the user's validation effort grow **sublinearly** with the
corpus: **confidence-gating** (only uncertain/high-impact calls interrupt),
**category-gating** (a safety call blocks at every dial setting), **policy
promotion** (one source-of-truth call reconciles three conflicting records — the
demo's "1 decision → 3 records" moment), and decisions that **build on each
other** (the dose flag explicitly cites the reconciliation call it depends on).
This pulls human-in-the-loop forward from 06 (06 gates an external *action*; 03
validates analytical *decisions*).

**Stack.** Same `useChat` + custom-data-parts spine as 01, extended to a stateful,
interruptible, pause/resume run. Production HITL swaps in LangGraph `interrupt()`
or the AI SDK tool-approval flow. See [`PLAN.md`](./examples/03-agent-walkthrough/PLAN.md)
for the full design rationale.

---

### 04 · Reasoning as Proof  ✅ *built — [`examples/04-reasoning-as-proof`](./examples/04-reasoning-as-proof)*
**What the user sees.** The model's **extended-thinking** stream in a distinct,
de-emphasized reasoning channel — a live, auto-scrolling ticker while the model
works, auto-collapsing to a receipt ("reasoned for 12s · 340 words — show
working") the moment the answer starts. Turns invisible chain-of-thought into
inspectable proof-of-work that never visually outranks the answer.

**Sample input.** A contract-termination judgment call with real arithmetic: a
customer with three consecutive SLA misses wants out of a prepaid annual deal —
is that a for-cause termination, and what exactly is the refund? Two clauses
interact (chronic failure vs. sole-remedy), so the working genuinely matters.

**Approach.** Use **native reasoning tokens**, not a "think step by step" hack:
Anthropic **adaptive thinking** (`thinking: {type: "adaptive", display:
"summarized"}` — the current API; fixed `budget_tokens` is gone) returns
`thinking` content blocks separate from the answer. Stream `thinking_delta` vs
`text_delta` into the AI SDK's **first-class `reasoning` parts** vs text parts.
Key UX rules: label it as *deliberation* (not fact), collapse it once the answer
lands, and be honest about provenance — the trace is a summarized view, and an
easy question may produce no trace at all.

**Stack.** Same `useChat` + `createUIMessageStream` spine as 01/03; the
reasoning channel rides the AI SDK's native `reasoning-start/-delta/-end`
chunks, so any AI-SDK-compatible chat surface renders it unmodified. See
[`PLAN.md`](./examples/04-reasoning-as-proof/PLAN.md) for the design rationale.

---

### 05 · Document Attribution & Highlighting
**What the user sees.** A split view: agent findings on the left, the source
document on the right. Clicking a finding scrolls the doc and **highlights the
exact span** (with a colored overlay); a mini-map/scrollbar shows where all
findings land. This is example 01 scaled up to long documents.

**Sample input.** One long PDF (a contract, a 10-K, a research paper) + an agent
task like *"find every clause that limits liability."*

**Approach.** Attribution needs **coordinates**, so preserve spatial metadata
through the pipeline: chunk with page + bounding-box info, keep it in the vector
store, and have the model return chunk/sentence IDs you resolve back to
coordinates for the highlight overlay. Fuzzy-match model quotes to rendered text
to survive PDF.js whitespace drift.

**Stack.** PDF.js (or a React PDF SDK like **Papyrus**) for rendering +
text-layer highlighting; `react-pdf-highlighter` for the overlay UX; retrieval
that carries bounding boxes through to the client.

---

### 06 · Approval / Human-in-the-loop
**What the user sees.** When the agent wants to *act* (send an email, write to a
DB, file a ticket), it pauses and renders an **approval card**: the proposed
action, its arguments, a plain-language "what this will do", and Approve / Edit /
Reject. Nothing fires without a click. This is the bridge from *review* to
*authorize*.

**Sample input.** An agent with one "dangerous" tool (mock `send_email` /
`create_ticket`) and a task that triggers it.

**Approach.** Model the tool as **interrupt-and-resume**, not fire-and-forget:
- **LangGraph:** `interrupt()` before the tool node → surface to UI → resume with
  the human's decision.
- **AI SDK 6:** tool-execution **approval** (`needsApproval`) with human-in-the-loop.
- **AG-UI/CopilotKit:** tools that request human confirmation before firing.

The UX rule: render the *arguments* the model chose, let the human edit them, and
make reject/edit as easy as approve.

**Stack.** LangGraph `interrupt` + assistant-ui / Agent Chat UI (both ship
human-in-the-loop components), or CopilotKit generative-UI approval cards.

---

## Framework research (current as of mid-2026)

The chat/agentic-UX layer has consolidated around a few open-source stacks. For
this repo (React/Next front end, model-agnostic back end) the shortlist:

| Tool | What it is | Best for here |
|------|-----------|---------------|
| [**Vercel AI SDK**](https://vercel.com/blog/ai-sdk-6) (v5, `ai` + `@ai-sdk/react`) | TS toolkit: streaming, **generative UI**, typed **custom data parts**, `useChat`, tool **approval** | **The streaming transport + client for every example** (01–06) |
| [**assistant-ui**](https://www.assistant-ui.com/docs/runtimes/langchain) | Embeddable React chat: streaming, generative UI, human-in-the-loop; tight **LangGraph** runtime | The chat shell for all examples |
| [**Agent Chat UI**](https://github.com/langchain-ai/agent-chat-ui) | LangChain's Next.js app that streams any LangGraph agent incl. tool calls & reasoning | Examples 03, 04 — clone-and-go trajectory/reasoning UI |
| [**AG-UI / CopilotKit**](https://github.com/ag-ui-protocol/ag-ui) | Open **agent↔frontend event protocol** (adopted by Google, AWS, MS, LangChain, Mastra) + React stack | Example 03, 06 — standardized event stream + HITL |
| **Anthropic SDK** | Native **Citations API** and **extended thinking**, streamed into AI SDK data parts | Examples 01, 04 — the *grounded* (non-hallucinated) primitives |
| **PDF.js / Papyrus / react-pdf-highlighter** | Document rendering + text-layer highlighting | Example 05 |

**Recommended default stack:** Next.js + **Vercel AI SDK** (`useChat` +
`createUIMessageStream`) as the streaming shell for **every** example, with the
**Anthropic SDK** supplying the grounded primitives (citation char-ranges,
reasoning tokens) *inside* that stream as typed custom data parts, and a
**LangGraph** agent behind **AG-UI** for anything with tools or approval (03, 06).
Streaming is the baseline, not an add-on: partial output with live provenance is
itself a trust feature. This keeps every example a thin, swappable slice rather
than one monolithic app.

---

## Suggested repo structure

Monorepo: a shared UI/agent core, then one folder per example that each stands
alone and boots independently. Mirrors the sibling
[`rlm-deep-agents`](../rlm-deep-agents) layout (common core + one module per
pattern + a walkthrough each).

```
ai-intuitive-review/
├── README.md                       # this file
├── IDEA.md                         # the seed notes
├── package.json                    # workspaces / turborepo
├── common/                         # shared, reused by every example
│   ├── ui/                         # <Citation>, <EvidenceCard>, <StepTimeline>,
│   │                               #   <ReasoningPane>, <ApprovalCard>, <SourcePane>
│   ├── agent/                      # build_agent() + AG-UI event plumbing
│   ├── schemas/                    # zod: Finding, Citation, Trajectory, Action
│   └── theme/                      # tokens so all demos look like one system
├── sample-data/                    # shared, versioned inputs (the "known" set)
│   ├── docs/                       # the small corpus: spec.md, policy.pdf, 10k.pdf
│   ├── traces/                     # recorded agent runs (JSON) for replay demos
│   └── questions.json              # canonical prompts per example
├── examples/
│   ├── 01-grounded-citations/
│   ├── 02-progressive-disclosure/
│   ├── 03-agent-walkthrough/
│   ├── 04-reasoning-as-proof/
│   ├── 05-document-attribution/
│   └── 06-approval-hitl/           # each: app/ + agent/ + README.md walkthrough
└── walkthroughs/                   # one markdown write-up per example (the "why")
```

**Common items worth centralizing early:**
- **Component kit** — the review primitives (`<Citation>`, `<EvidenceCard>`,
  `<StepTimeline>`, `<ReasoningPane>`, `<ApprovalCard>`) are reused across
  examples; build them once against a shared theme so the demos read as one
  product.
- **Schemas** — `Finding`, `Citation`, `Trajectory`, `Action` as zod types shared
  by agent output and UI props; this is what makes structured output reliable.
- **Sample data** — one small, versioned, *known* corpus + recorded traces, so
  every demo is deterministic and reviewable without live keys (same trick as
  `rlm-deep-agents`: construct/replay even without an API key).
- **Agent factory + AG-UI plumbing** — one `build_agent()` and one event stream so
  swapping model providers or adding a tool doesn't touch the UI.

---

## Build order

Start with **01 (Grounded Citations)** — it's the smallest end-to-end trust loop
and forces the shared `<Citation>`/`<SourcePane>` primitives. Then **02** (reuse
the schema/expand pattern) and **04** (reasoning, cheap once streaming works).
**03** and **05** are heavier (trajectory + PDF coordinates). Finish with **06**,
which layers approval on top of any agent you've already built.
