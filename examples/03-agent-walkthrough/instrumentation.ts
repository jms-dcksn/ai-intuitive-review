// Next.js runs this once at server startup. We wire the Vercel AI SDK's OpenTelemetry
// output into LangSmith so every `generateObject` call the agent makes appears as a
// model span — with model, tokens, latency, and prompt/completion — nested under the
// `traceable` orchestration spans in `lib/agent.ts`.
//
// This is orthogonal to the "no LangGraph" decision: the LangSmith SDK traces any
// function, so dropping LangGraph costs nothing here. Tracing only produces spans
// when there are real model calls (i.e. live mode) and when LANGSMITH_TRACING=true;
// otherwise this is a no-op.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.LANGSMITH_TRACING !== "true") return;

  const { registerOTel } = await import("@vercel/otel");
  const { AISDKExporter } = await import("langsmith/vercel");

  registerOTel({
    serviceName: process.env.LANGSMITH_PROJECT || "working-in-the-open",
    traceExporter: new AISDKExporter(),
  });
}
