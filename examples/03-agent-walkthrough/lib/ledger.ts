import type { Checkpoint, Decision, DoneData, Phase, Policy, ReviewUIMessage } from "./types";

type Part = ReviewUIMessage["parts"][number];

export interface LedgerState {
  decisions: Decision[]; // in first-seen order
  phases: Phase[];
  policies: Policy[];
  checkpoints: Checkpoint[]; // in arrival order
  done: DoneData | null;
}

/**
 * Fold the streamed message parts into ledger state. `data-decision` upserts a
 * row; `data-decisionUpdate` patches one (this is how a promoted policy rewrites
 * its whole dependent class live). Everything else accumulates. Pure — the page
 * re-derives this on every render from the parts `useChat` has collected.
 */
export function reduceParts(parts: Part[]): LedgerState {
  const map = new Map<string, Decision>();
  const order: string[] = [];
  const phases: Phase[] = [];
  const policies: Policy[] = [];
  const checkpoints: Checkpoint[] = [];
  let done: LedgerState["done"] = null;

  for (const p of parts) {
    switch (p.type) {
      case "data-decision": {
        const d = p.data;
        if (!map.has(d.id)) order.push(d.id);
        map.set(d.id, { ...map.get(d.id), ...d });
        break;
      }
      case "data-decisionUpdate": {
        const { id, patch } = p.data;
        const cur = map.get(id);
        if (cur) map.set(id, { ...cur, ...patch });
        break;
      }
      case "data-phase":
        phases.push(p.data);
        break;
      case "data-policy":
        policies.push(p.data);
        break;
      case "data-checkpoint":
        checkpoints.push(p.data);
        break;
      case "data-done":
        done = p.data;
        break;
    }
  }

  return { decisions: order.map((id) => map.get(id)!), phases, policies, checkpoints, done };
}
