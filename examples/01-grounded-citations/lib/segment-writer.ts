import type { UIMessageStreamWriter } from "ai";
import type { AnswerSegment, Citation, ReviewUIMessage } from "./types";

/**
 * Turns a linear stream of *text* and *citation* events into ordered AI SDK
 * message parts that render inline as `…cited text [1] more text [2]…`.
 *
 * The trick: give each run of text its own `text-*` id, and close the current
 * run whenever a citation arrives. That way the parts land in the message in
 * exactly the order they were produced — `[text][citation][text][citation]…` —
 * instead of all text collapsing into one block with the markers floating loose.
 *
 * It also owns citation numbering: identical spans (`docId:start:end`) share one
 * footnote number `n`, but still emit a marker at every position they're cited.
 */
export class SegmentWriter {
  private seg = 0;
  private open = false;
  private seen = new Map<string, Citation>();
  private count = 0;
  private full = "";
  // The rendered answer as an ordered list of text runs, each tagged with the
  // citations attached to it. `segs[i]` is exactly the i-th `text` part the client
  // renders (`s{i}`), so the judge and the UI index segments identically.
  private segs: AnswerSegment[] = [];

  constructor(private readonly writer: UIMessageStreamWriter<ReviewUIMessage>) {}

  /** Append streamed answer text to the current segment. */
  text(delta: string): void {
    if (!delta) return;
    this.full += delta;
    if (!this.open) {
      this.segs.push({ text: "", cites: [] });
      this.writer.write({ type: "text-start", id: `s${this.seg}` });
      this.open = true;
    }
    this.segs[this.segs.length - 1].text += delta;
    this.writer.write({ type: "text-delta", id: `s${this.seg}`, delta });
  }

  /** Emit a grounded citation marker after the text it grounds. */
  citation(span: Omit<Citation, "n">): void {
    this.flush();
    const key = `${span.docId}:${span.startChar}:${span.endChar}`;
    let citation = this.seen.get(key);
    if (!citation) {
      citation = { n: ++this.count, ...span };
      this.seen.set(key, citation);
    }
    // Attach to the run this citation grounds — the one just closed by flush().
    this.segs[this.segs.length - 1]?.cites.push(citation);
    this.writer.write({ type: "data-citation", data: citation });
  }

  /** Close the final text segment. Call once when the source stream ends. */
  end(): void {
    this.flush();
  }

  /** The full assembled answer text — what the faithfulness judge scores. */
  fullText(): string {
    return this.full;
  }

  /** The unique grounded citations produced, in first-seen order. */
  citations(): Citation[] {
    return [...this.seen.values()];
  }

  /** The rendered answer as text runs + their citations — what the judge scores. */
  segments(): AnswerSegment[] {
    return this.segs;
  }

  private flush(): void {
    if (this.open) {
      this.writer.write({ type: "text-end", id: `s${this.seg}` });
      this.open = false;
      this.seg++;
    }
  }
}
