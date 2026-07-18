# AI Intuitive Review

Simple, runnable demos of different ways to show an agent's outputs, decisions,
reasoning, and proposals to a subject matter expert — with the evidence and
surrounding business context that let the SME establish trust in the agent.

## The problem

The bottleneck to agents in business operations isn't model quality — it's
validation. High-risk decisions are hard to verify, so humans become the back
pressure. But a human can't responsibly approve a decision from a one-line
summary, and burdening them with re-executing the entire task defeats the point
of the agent. These demos explore the middle ground: surface enough evidence,
provenance, and context that an expert can validate a decision in seconds
instead of redoing the work.

Each demo answers one of the questions a reviewer actually has:

1. **Where did this come from?** → citations and attribution
2. **How did you get here?** → reasoning and in-flight decision surfacing
3. **Can I see more without drowning?** → progressive disclosure
4. **Are you about to do something I didn't approve?** → human-in-the-loop

## The demos

| # | Demo | The trust question it answers |
|---|------|-------------------------------|
| [01 · Grounded Citations](./examples/01-grounded-citations) | *"Where did this specific claim come from?"* |
| [02 · Progressive Disclosure](./examples/02-progressive-disclosure) | *"Show me more — but only when I ask."* |
| [03 · Working in the Open](./examples/03-agent-walkthrough) | *"Reveal your decisions as you go — don't make me validate 300 at the end."* |
| [04 · Reasoning as Proof](./examples/04-reasoning-as-proof) | *"Show your working, not just the answer."* |
| [05 · Document Attribution](./examples/05-document-attribution) | *"Jump me to the exact place in the source."* |
| [06 · Approval / Human-in-the-loop](./examples/06-approval-hitl) | *"Ask me before you actually do it."* |

01–05 build **understanding**; 06 gates **action**. Together they cover the full
"review → trust → authorize" arc.

**01 · Grounded Citations.** An answer over a small document corpus where each
sentence carries an inline citation; hovering shows the exact quoted source
span, clicking scrolls the source panel to it, and uncited sentences are
visibly flagged. Citations come from the Anthropic Citations API — the model
returns verified quote ranges rather than inventing `[1]` markers in prose, so
the attribution can't be hallucinated.

**02 · Progressive Disclosure.** A concise headline recommendation with
collapsed evidence cards beneath it; raw detail lives one more level down. The
agent emits a tiered tree instead of a wall of text, and the UI reveals depth
only on demand — the default view stays scannable, but nothing is hidden.

**03 · Working in the Open.** An agent runs a pre-visit clinical chart review
over a 7-document patient chart, streaming routine checks into a live decision
ledger and stopping at three consequential checkpoints — each pairing verbatim
document excerpts with the recommendation, its rationale, and Agree/Disagree
buttons. A trust dial controls how often it interrupts, so validation effort
grows sublinearly with the corpus instead of piling up at the end.

**04 · Reasoning as Proof.** The model's extended-thinking stream rendered as a
distinct, de-emphasized reasoning channel — a live ticker while it works on a
contract-termination judgment call, collapsing to a receipt ("reasoned for 12s
— show working") once the answer lands. Deliberation becomes inspectable
proof-of-work without visually outranking the answer.

**05 · Document Attribution.** Agent findings on the left, Chegg's real FY2025
Form 10-K on the right — the task is finding every statement attributing risk
to generative AI. Clicking a finding scrolls the 2MB filing and highlights the
exact span; a minimap shows where all findings cluster. This is 01 scaled to
long documents, where navigation itself is the trust feature.

**06 · Approval / Human-in-the-loop.** A support agent resolves a double-charge
ticket: read-only tools stream by as receipts, but the run stops before every
external action with an approval card — the exact arguments the model chose
(editable, with consequences recomputed live), a plain-language "what this will
do," and a reversibility badge. Rejecting with a note sends it back to the
agent, which reads the feedback and re-plans. Nothing fires without a click.

## Stack

Every demo is a thin Next.js app on the same foundation: Vercel AI SDK (`useChat`
+ typed custom data parts) for streaming, with the Anthropic SDK supplying the
grounded primitives (citation ranges, reasoning tokens). Streaming is the
baseline, not an add-on — partial output with live provenance is itself a trust
feature. Each example's directory has its own README and design notes.
