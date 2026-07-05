import { SAMPLE_REPORT } from "./sample-data";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Streams the recorded report as raw JSON text, in small slices, exactly like the
 * AI SDK's `toTextStreamResponse()` does for a live `streamObject`. The client's
 * `useObject` runs a partial-JSON parser over the accumulating text, so slicing
 * the serialized object left-to-right reproduces the real top-down reveal: the
 * verdict resolves first, then each finding fills in one at a time.
 *
 * This keeps the streaming *and* progressive-disclosure UX fully reviewable with
 * no API key (same idea as `rlm-deep-agents`).
 */
export function streamMockReport(): Response {
  const json = JSON.stringify(SAMPLE_REPORT);
  const CHUNK = 22;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      for (let i = 0; i < json.length; i += CHUNK) {
        controller.enqueue(encoder.encode(json.slice(i, i + CHUNK)));
        await sleep(12);
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
