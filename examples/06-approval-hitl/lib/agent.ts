import { generateText, stepCountIs, tool } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

import { COMPANY, READ_TOOLS, TASK, WRITE_TOOLS, isWriteTool } from "./scenario";
import { applyResolution, auditStats } from "./resolve";
import type { Resolution } from "./types";
import type { ThreadRecorder, ThreadState } from "./thread";

// ---------------------------------------------------------------------------
// The live agent. Same contract as the choreographed player (`./run`) — reads
// stream as receipts, a write stops the run with an approval card, the user's
// resolution resumes it — but the loop is a real tool-calling model.
//
// The interrupt mechanism is the AI SDK's own seam: read tools carry `execute`
// and run inside the loop; write tools deliberately have NO `execute`, so the
// first write the model proposes ends `generateText` with an unresolved tool
// call. We surface that call as the approval card, park the transcript in the
// durable thread, and return. The resolution comes back as a *tool result* —
// "executed, receipt RF-2209" or "REJECTED, adapt" — and the model reads it
// like any other tool output. That's why reject-and-adapt needs no extra code
// here: the model re-plans off the rejection text itself.
// ---------------------------------------------------------------------------

const MODEL = process.env.AGENT_MODEL || "claude-sonnet-5";

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = [
  `You are a support-operations agent at ${COMPANY}. You investigate with the read`,
  "tools first, then act. Every write tool (refund, ticket, email) goes to a human",
  "reviewer for approval before it executes — its tool result tells you what the",
  "reviewer decided.",
  "",
  "Rules:",
  "- Propose ONE write action at a time, and briefly say why just before you do.",
  "- If the reviewer rejects an action, never retry it as-is. Adapt: choose a",
  "  different remedy that respects their note, or wrap up honestly.",
  "- If the reviewer edited your arguments, treat the edited values as correct.",
  "- Only claim things in customer emails that actually happened (per tool results).",
  "- When the ticket is handled, stop calling tools and write a 1–2 sentence",
  "  wrap-up of what was done.",
].join("\n");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function buildTools(rec: ThreadRecorder, thread: ThreadState) {
  const readTool = (name: keyof typeof READ_TOOLS, description: string) =>
    tool({
      description,
      inputSchema: z.object({}),
      execute: async () => {
        const id = `a-${thread.nextActionId++}`;
        const r = READ_TOOLS[name].run();
        rec.write({
          type: "data-action",
          data: { id, tool: name, risk: "read", title: r.title, detail: "querying…", status: "running" },
        });
        await sleep(250);
        rec.write({ type: "data-actionUpdate", data: { id, patch: { status: "ok", detail: r.detail } } });
        return r.payload;
      },
    });

  return {
    get_ticket: readTool("get_ticket", "Read the full text of support ticket #4821."),
    lookup_account: readTool(
      "lookup_account",
      "Look up the customer's account: plan, payment method, standing, and the refund policy.",
    ),
    billing_history: readTool("billing_history", "Pull the account's recent invoices and charges."),
    // Write tools: no execute — proposing one pauses the run for approval.
    issue_refund: tool({
      description:
        "Refund a specific invoice to the original payment method. Goes to the human reviewer; propose exact arguments.",
      inputSchema: z.object({
        invoice_id: z.string().describe("The invoice to refund, e.g. INV-8842"),
        amount_usd: z.string().describe("Decimal amount as a string, e.g. '49.00'"),
        reason: z.string().describe("One-line reason, shown to the reviewer and on the billing record"),
      }),
    }),
    create_ticket: tool({
      description: "File an internal ticket to another team. Goes to the human reviewer.",
      inputSchema: z.object({
        queue: z.string().describe("e.g. billing-escalations"),
        priority: z.enum(["low", "normal", "high"]),
        title: z.string(),
        note: z.string().describe("Context for the owning team"),
      }),
    }),
    send_email: tool({
      description:
        "Send an email to the customer. Goes to the human reviewer; write the complete, ready-to-send draft.",
      inputSchema: z.object({
        to: z.string().describe("Name <email>"),
        subject: z.string(),
        body: z.string().describe("The full plain-text body"),
      }),
    }),
  };
}

/** Tool inputs arrive as parsed JSON; the card and executors want flat strings. */
function normalizeArgs(input: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries((input ?? {}) as Record<string, unknown>).map(([k, v]) => [k, String(v ?? "")]),
  );
}

let stepSeq = 0;
function stepNote(rec: ThreadRecorder, text: string): void {
  rec.write({ type: "data-step", data: { id: `ls-${++stepSeq}-${Date.now()}`, text } });
}

/**
 * Resume (or start) the live run: fold any resolution back into the transcript
 * as tool results, then run the model until it proposes a write (pause) or
 * finishes (done).
 */
export async function runLiveAgent(
  rec: ThreadRecorder,
  thread: ThreadState,
  resolution?: Resolution,
): Promise<void> {
  if (resolution) {
    const out = applyResolution(rec, thread, resolution);
    if (out && thread.pendingCalls.length > 0) {
      // Answer every parked tool call: the primary gets the human's verdict;
      // any extras were auto-deferred (one action at a time).
      thread.modelMessages.push({
        role: "tool",
        content: thread.pendingCalls.map((pc) => ({
          type: "tool-result" as const,
          toolCallId: pc.toolCallId,
          toolName: pc.toolName,
          output: {
            type: "text" as const,
            value: pc.primary
              ? out.approved
                ? `The reviewer APPROVED this action${
                    out.edited ? ` after editing the arguments — final arguments: ${JSON.stringify(out.args)}` : ""
                  }. It has been executed. Receipt: ${out.receipt}`
                : `The reviewer REJECTED this action${
                    out.reason ? ` with the note: "${out.reason}"` : ""
                  }. It was NOT executed. Do not retry it as-is — adapt or wrap up honestly.`
              : "Deferred — the reviewer sees one action at a time. Propose it again after this one, if still needed.",
          },
        })),
      });
      thread.pendingCalls = [];
    }
  }

  if (thread.modelMessages.length === 0) {
    thread.modelMessages.push({
      role: "user",
      content: `${TASK}\n\nStart by reading ticket #4821, and investigate before acting.`,
    });
  }

  const tools = buildTools(rec, thread);

  while (thread.liveTurns < 10) {
    thread.liveTurns++;

    const result = await generateText({
      model: anthropic(MODEL),
      system: SYSTEM,
      messages: thread.modelMessages,
      tools,
      stopWhen: stepCountIs(6),
      onStepFinish: (step) => {
        // Narrate between tool calls — but a step that proposes a write keeps
        // its text for the approval card's rationale instead.
        const proposesWrite = step.toolCalls.some((c) => isWriteTool(c.toolName));
        if (step.text.trim() && step.toolCalls.length > 0 && !proposesWrite) {
          stepNote(rec, step.text.trim());
        }
      },
    });

    thread.modelMessages.push(...result.response.messages);

    // Unresolved tool calls from the final step = the writes awaiting approval.
    const answered = new Set(result.toolResults.map((r) => r.toolCallId));
    const pendingWrites = result.toolCalls.filter(
      (c) => !answered.has(c.toolCallId) && isWriteTool(c.toolName),
    );

    if (pendingWrites.length === 0) {
      // The model stopped calling tools — it considers the ticket handled.
      rec.write({
        type: "data-done",
        data: {
          // The card renders plain text; drop any markdown emphasis the model adds.
          summary: result.text.trim().replace(/\*\*|^#+\s*/g, "") || "Run complete.",
          stats: auditStats(thread),
        },
      });
      return;
    }

    const [primary, ...extras] = pendingWrites;
    thread.pendingCalls = [
      { toolCallId: primary.toolCallId, toolName: primary.toolName, primary: true },
      ...extras.map((c) => ({ toolCallId: c.toolCallId, toolName: c.toolName, primary: false })),
    ];

    const meta = WRITE_TOOLS[primary.toolName];
    const args = normalizeArgs(primary.input);
    const fields = meta.fields(args);
    const actionId = `a-${thread.nextActionId++}`;
    const approvalId = `ap-${actionId}`;

    rec.write({
      type: "data-action",
      data: {
        id: actionId,
        tool: primary.toolName,
        risk: "write",
        title: meta.feedTitle(args),
        detail: "Proposed — waiting for your approval",
        args: fields,
        status: "awaiting",
      },
    });
    rec.write({
      type: "data-approval",
      data: {
        id: approvalId,
        actionId,
        tool: primary.toolName,
        klass: meta.klass,
        title: meta.title,
        rationale:
          result.text.trim() || "Proposed from the investigation above — see the feed for the receipts.",
        willDo: meta.willDo(args),
        reversible: meta.reversible,
        args: fields,
        approveLabel: meta.approveLabel(args),
      },
    });
    return; // parked — the resolution re-enters this function
  }

  rec.write({
    type: "data-done",
    data: {
      summary: "The run hit its turn limit before wrapping up — restart to try again.",
      stats: auditStats(thread),
    },
  });
}
