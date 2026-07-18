import type { ModelMessage, UIMessageStreamWriter } from "ai";
import type {
  ActionEvent,
  ApprovalRequest,
  ApprovalUIMessage,
  DoneData,
  StepNote,
} from "./types";

// The durable thread — the run's whole state, keyed by session id. The server
// holds the authoritative feed (every action, approval, and narration line), so
// a page refresh rehydrates via the GET handler instead of losing the run. The
// live agent additionally keeps its model-message transcript here: an approval
// is an interrupted tool call, and the resolution has to resume *that exact*
// conversation with a tool result.
//
// A `Map` is the demo-grade store (same call as example 03): swap it for a
// Postgres/Redis row keyed by `sessionId` and nothing in the agent changes.

/** Where the choreographed mock resumes; the live agent uses modelMessages instead. */
export type Stage =
  | "investigate" // read tools → propose the refund
  | "fallback" // refund rejected → propose the escalation ticket
  | "notify" // remedy settled → propose the customer email
  | "wrap" // emit the done card
  | "awaiting" // paused on an open approval
  | "done";

export interface PendingCall {
  toolCallId: string;
  toolName: string;
  /** The call surfaced to the user. Extras are auto-deferred with a note. */
  primary: boolean;
}

export interface ThreadState {
  sessionId: string;
  mocked: boolean;
  started: boolean;
  stage: Stage;
  outcomes: Record<string, string>; // approvalId → approved | edited | rejected
  rejectReason?: string; // the last rejection's note (feeds the fallback beat)
  steps: StepNote[];
  actions: ActionEvent[]; // authoritative feed, first-seen order
  approvals: ApprovalRequest[];
  done: DoneData | null;
  pendingApprovalId: string | null;
  // --- live mode only ---
  modelMessages: ModelMessage[]; // the interrupted conversation
  pendingCalls: PendingCall[]; // tool calls awaiting results on resume
  liveTurns: number; // guard against a runaway loop
  nextActionId: number;
}

const THREADS = new Map<string, ThreadState>();

export function getThread(sessionId: string): ThreadState | undefined {
  return THREADS.get(sessionId);
}

export function getOrCreateThread(
  sessionId: string,
  mocked: boolean,
): { thread: ThreadState; created: boolean } {
  const existing = THREADS.get(sessionId);
  if (existing) return { thread: existing, created: false };
  const thread: ThreadState = {
    sessionId,
    mocked,
    started: false,
    stage: "investigate",
    outcomes: {},
    steps: [],
    actions: [],
    approvals: [],
    done: null,
    pendingApprovalId: null,
    modelMessages: [],
    pendingCalls: [],
    liveTurns: 0,
    nextActionId: 1,
  };
  THREADS.set(sessionId, thread);
  return { thread, created: true };
}

/** The client feed shape, straight from server state — used by the GET rehydrate. */
export function feedSnapshot(thread: ThreadState) {
  return {
    mocked: thread.mocked,
    started: thread.started,
    steps: thread.steps,
    actions: thread.actions,
    approvals: thread.approvals,
    done: thread.done,
    pendingApprovalId: thread.pendingApprovalId,
  };
}

type Writer = UIMessageStreamWriter<ApprovalUIMessage>;
// The stream-chunk type the writer accepts (a data-part chunk, not a message part).
type Chunk = Parameters<Writer["write"]>[0];

/**
 * A thin wrapper over the AI SDK stream writer that **mirrors every part it
 * writes into the thread**. Both the mock player and the live agent write
 * through this, so the server-side feed is always a faithful copy of what the
 * client received — which is what makes a mid-run refresh recoverable.
 */
export class ThreadRecorder {
  constructor(
    private writer: Writer,
    private thread: ThreadState,
  ) {}

  /** Write a part to the stream and fold it into thread state. */
  write(part: Chunk): void {
    this.apply(part);
    this.writer.write(part);
  }

  /** The user has answered the open approval; it's no longer pending. */
  clearPending(): void {
    this.thread.pendingApprovalId = null;
  }

  private apply(part: Chunk): void {
    const t = this.thread;
    if (!("data" in part)) return; // text/tool chunks aren't feed state
    switch (part.type) {
      case "data-action": {
        const a = part.data as ActionEvent;
        const i = t.actions.findIndex((x) => x.id === a.id);
        if (i === -1) t.actions.push(a);
        else t.actions[i] = { ...t.actions[i], ...a };
        break;
      }
      case "data-actionUpdate": {
        const { id, patch } = part.data as { id: string; patch: Partial<ActionEvent> };
        const i = t.actions.findIndex((x) => x.id === id);
        if (i !== -1) t.actions[i] = { ...t.actions[i], ...patch };
        break;
      }
      case "data-step":
        t.steps.push(part.data as StepNote);
        break;
      case "data-approval":
        t.approvals.push(part.data as ApprovalRequest);
        t.pendingApprovalId = (part.data as ApprovalRequest).id; // the run now waits here
        break;
      case "data-done":
        t.done = part.data as DoneData;
        t.pendingApprovalId = null;
        break;
      // data-mode is transient metadata, not feed state.
    }
  }
}
