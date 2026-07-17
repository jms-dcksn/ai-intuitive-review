import type { UIMessageStreamWriter } from "ai";
import type {
  Checkpoint,
  Decision,
  DoneData,
  Phase,
  Policy,
  ReviewUIMessage,
  TrustDial,
} from "./types";

// The durable thread — the run's whole state, keyed by session id. In the mock
// this only ever needed a resume cursor; the live agent needs more (adopted
// policies to keep resumes consistent, the growing ledger to survive a refresh),
// so the *server* holds the authoritative ledger here. A page reload rehydrates
// from this via the GET handler instead of losing everything the way a
// client-only ledger would.
//
// A `Map` is the demo-grade store. Decision 1 in PLAN.md is that this is a
// *persistence* choice, not a framework one: swap this Map for a Postgres/Redis
// row keyed by `sessionId` and nothing else in the agent has to change.

export interface ThreadState {
  sessionId: string;
  dial: TrustDial;
  mocked: boolean;
  started: boolean;
  cursor: number; // next unprocessed plan step
  decisions: Decision[]; // authoritative ledger, first-seen order
  phases: Phase[];
  policies: Policy[];
  checkpoints: Checkpoint[];
  done: DoneData | null;
  // The checkpoint the run is currently waiting on (null when running or done).
  // Lets a rehydrating client tell which checkpoint is still open vs. resolved.
  pendingCheckpointId: string | null;
  // Reading chosen for each policy class (e.g. meridian-notice -> "business
  // months"); the live agent consults this so a resumed run stays consistent.
  policyChoices: Record<string, string>;
}

const THREADS = new Map<string, ThreadState>();

export function getThread(sessionId: string): ThreadState | undefined {
  return THREADS.get(sessionId);
}

export function getOrCreateThread(
  sessionId: string,
  dial: TrustDial,
  mocked: boolean,
): { thread: ThreadState; created: boolean } {
  const existing = THREADS.get(sessionId);
  if (existing) {
    existing.dial = dial; // the dial can move mid-run
    return { thread: existing, created: false };
  }
  const thread: ThreadState = {
    sessionId,
    dial,
    mocked,
    started: false,
    cursor: 0,
    decisions: [],
    phases: [],
    policies: [],
    checkpoints: [],
    done: null,
    pendingCheckpointId: null,
    policyChoices: {},
  };
  THREADS.set(sessionId, thread);
  return { thread, created: true };
}

/** The client ledger shape, straight from server state — used by the GET rehydrate. */
export function ledgerSnapshot(thread: ThreadState) {
  return {
    mocked: thread.mocked,
    started: thread.started,
    dial: thread.dial,
    decisions: thread.decisions,
    phases: thread.phases,
    policies: thread.policies,
    checkpoints: thread.checkpoints,
    done: thread.done,
    pendingCheckpointId: thread.pendingCheckpointId,
  };
}

type Writer = UIMessageStreamWriter<ReviewUIMessage>;
// The stream-chunk type the writer accepts (a data-part chunk, not a message part).
type Chunk = Parameters<Writer["write"]>[0];

/**
 * A thin wrapper over the AI SDK stream writer that **mirrors every part it
 * writes into the thread**. Both the mock player and the live agent write
 * through this, so the server-side ledger is always a faithful copy of what the
 * client received — which is exactly what makes a mid-run refresh recoverable.
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

  setCursor(i: number): void {
    this.thread.cursor = i;
  }

  setPolicyChoice(classId: string, choice: string): void {
    this.thread.policyChoices[classId] = choice;
  }

  /** The user has answered the open checkpoint; it's no longer pending. */
  clearPending(): void {
    this.thread.pendingCheckpointId = null;
  }

  private apply(part: Chunk): void {
    const t = this.thread;
    if (!("data" in part)) return; // text/tool chunks aren't ledger state
    switch (part.type) {
      case "data-decision": {
        const d = part.data;
        const i = t.decisions.findIndex((x) => x.id === d.id);
        if (i === -1) t.decisions.push(d);
        else t.decisions[i] = { ...t.decisions[i], ...d };
        break;
      }
      case "data-decisionUpdate": {
        const { id, patch } = part.data;
        const i = t.decisions.findIndex((x) => x.id === id);
        if (i !== -1) t.decisions[i] = { ...t.decisions[i], ...patch };
        break;
      }
      case "data-phase":
        t.phases.push(part.data as Phase);
        break;
      case "data-policy":
        t.policies.push(part.data as Policy);
        break;
      case "data-checkpoint":
        t.checkpoints.push(part.data as Checkpoint);
        t.pendingCheckpointId = (part.data as Checkpoint).id; // the run now waits here
        break;
      case "data-done":
        t.done = part.data as DoneData;
        t.pendingCheckpointId = null;
        break;
      // data-mode is transient metadata, not ledger state.
    }
  }
}
