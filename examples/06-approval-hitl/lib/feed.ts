import type {
  ActionEvent,
  ApprovalRequest,
  ApprovalUIMessage,
  DoneData,
  StepNote,
} from "./types";

type Part = ApprovalUIMessage["parts"][number];

/** One row of the activity feed, in arrival order — narration and actions interleaved. */
export type FeedItem =
  | { kind: "step"; step: StepNote }
  | { kind: "action"; action: ActionEvent };

export interface FeedState {
  items: FeedItem[];
  actions: ActionEvent[];
  approvals: ApprovalRequest[];
  done: DoneData | null;
}

/**
 * Fold the streamed message parts into feed state. `data-action` upserts a row
 * in place (running → ok, awaiting → executed/rejected all patch the same row);
 * steps interleave in arrival order so the feed reads as a transcript of the
 * run. Pure — the page re-derives this on every render from the parts `useChat`
 * has collected.
 */
export function reduceParts(parts: Part[]): FeedState {
  const actionMap = new Map<string, ActionEvent>();
  const order: Array<{ kind: "step"; step: StepNote } | { kind: "action"; id: string }> = [];
  const approvals: ApprovalRequest[] = [];
  let done: DoneData | null = null;

  for (const p of parts) {
    switch (p.type) {
      case "data-action": {
        const a = p.data;
        if (!actionMap.has(a.id)) order.push({ kind: "action", id: a.id });
        actionMap.set(a.id, { ...actionMap.get(a.id), ...a });
        break;
      }
      case "data-actionUpdate": {
        const { id, patch } = p.data;
        const cur = actionMap.get(id);
        if (cur) actionMap.set(id, { ...cur, ...patch });
        break;
      }
      case "data-step":
        order.push({ kind: "step", step: p.data });
        break;
      case "data-approval":
        approvals.push(p.data);
        break;
      case "data-done":
        done = p.data;
        break;
    }
  }

  const items: FeedItem[] = order.map((o) =>
    o.kind === "step" ? o : { kind: "action", action: actionMap.get(o.id)! },
  );
  return { items, actions: [...actionMap.values()], approvals, done };
}
