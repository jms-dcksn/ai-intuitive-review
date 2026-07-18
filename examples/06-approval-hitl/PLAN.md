# PLAN — 06 · Approval / Human-in-the-loop

The design rationale for the build. The README covers *what* it does; this is
*why it's shaped this way*.

## The reframe

The obvious build is a confirm dialog: agent wants to call a tool, show
"Allow?", wait. That demos in thirty seconds and teaches nothing, because a
bare Allow button transfers no understanding — the user is rubber-stamping a
function name. What makes approval *meaningful* is everything around the
button:

- the user watched the investigation that led here (the read receipts),
- they can see and change the actual arguments,
- the consequences are stated in their language with a reversibility badge,
- and saying no is productive — the agent hears why and re-plans.

So the demo's arc is deliberately: earn → propose → (approve | edit | reject) →
adapt → honest confirmation. The reject branch is the star; approval flows
that only work when you say yes aren't human-in-the-loop, they're theater.

## Decision 1 — The interrupt is the AI SDK's own tool contract

LangGraph `interrupt()`, AG-UI HITL events, and AI SDK `needsApproval` all
exist for this. We build the seam by hand — but the seam itself is native: a
tool defined **without `execute`** ends the `generateText` step loop with an
unresolved tool call. That *is* the interrupt. Park the transcript, render the
card, and when the human answers, append the outcome as the parked call's tool
result and re-enter the loop.

Why by hand: the point of this repo is to make the trust mechanics
inspectable. Framework HITL wraps this exact flow in configuration; here you
can read the whole loop in `lib/agent.ts` in one sitting. The framework
versions are the production swap, not a different architecture.

The consequence that falls out for free: **reject-and-adapt needs no code.**
The rejection ("REJECTED — the reviewer said: …") is just a tool result; the
model re-plans the same way it would after any failed call. The mock stages
this branch deterministically (`lib/run.ts`), the live model does it for real.

## Decision 2 — Args from the model, framing from the product

The approval card mixes two provenances, and keeping them straight is the
trust design:

- **Model-authored:** the arguments (`amount_usd: "49.00"`, the email body)
  and the rationale line. This is the thing being reviewed.
- **Deterministic (`TOOL_META` in `lib/scenario.ts`):** how those args are
  labeled, which are editable, what "what this will do" claims, the
  reversibility badge, and the consequence-stating approve label.

The "will do" bullets are rendered from the *current* field values — edit the
amount and the promise updates live. If the model wrote its own consequence
copy, a persuasive model could soften it; because it's a pure function of the
args, the card can't be sweet-talked.

## Decision 3 — One interrupt mechanism for both modes (same as 03)

The mock and the live agent share: the thread store (`lib/thread.ts`), the
recorder that mirrors every streamed part into it, `applyResolution`
(`lib/resolve.ts` — the **only** code path that executes a write, in either
mode), and the client. They differ only in the cursor: the mock resumes a
named stage; the live agent resumes a model transcript. This is the same
"interrupt = return + durable state, resolution = fresh POST" spine as
example 03 — deliberately, so 03 and 06 read as one system applied to
decisions vs. actions.

Two details worth keeping:

- **Parallel writes are serialized.** If the model proposes two writes in one
  step, only the first becomes a card; the rest get a "deferred — one action
  at a time" tool result. One card, one human decision, no modal stacks.
- **The human's outcome is stamped, not inferred.** `executed` /
  `edited-by-you` / `rejected (never fired)` land on the feed row from the
  resolution itself, and the audit stats are computed from the feed —
  the "0 actions fired without a click" line is derived, not asserted.

## Decision 4 — The scenario needs all three severities

One dangerous tool would demo the mechanism; three calibrate it. The severity
classes style the card and teach that approval isn't binary paranoia:

| Tool | Class | Reversible | Card |
|------|-------|-----------|------|
| `issue_refund` | money | no | red |
| `send_email` | external | no | amber |
| `create_ticket` | internal | yes | blue |

The double-charge ticket was chosen because the *evidence is legible in one
line* ("two $49.00 charges, 41 seconds apart") — the user can genuinely judge
the proposal, which is the precondition for approval meaning anything. The
policy snippet in the account fixture gives the live model real grounding for
"full refund without sign-off."

## Rejected alternatives

- **LangGraph + `interrupt()`** — right answer in production, wrong for an
  inspectable demo (Decision 1). Noted in the README as the swap.
- **Client-side tool execution (`onToolCall`)** — puts the write on the wrong
  side of the trust boundary; the server must be the thing that refuses to
  execute without a resolution.
- **A blanket "auto-approve low-risk" dial** — 03 already owns the
  trust-dial idea for decisions. Here the split is categorical (reads free,
  writes ask) to keep the one new idea sharp.
