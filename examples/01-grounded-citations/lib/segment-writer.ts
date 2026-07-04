import type { UIMessageStreamWriter } from "ai";
import type { Citation, ReviewUIMessage } from "./types";

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

  constructor(private readonly writer: UIMessageStreamWriter<ReviewUIMessage>) {}

  /** Append streamed answer text to the current segment. */
  text(delta: string): void {
    if (!delta) return;
    if (!this.open) {
      this.writer.write({ type: "text-start", id: `s${this.seg}` });
      this.open = true;
    }
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
    this.writer.write({ type: "data-citation", data: citation });
  }

  /** Close the final text segment. Call once when the source stream ends. */
  end(): void {
    this.flush();
  }

  private flush(): void {
    if (this.open) {
      this.writer.write({ type: "text-end", id: `s${this.seg}` });
      this.open = false;
      this.seg++;
    }
  }
}
