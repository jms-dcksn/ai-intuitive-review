"use client";

/**
 * The answer — the visually primary channel. Plain streamed text with a caret
 * while tokens arrive; the reasoning pane above never outranks this.
 */
export function AnswerView({
  text,
  streaming,
}: {
  text: string;
  streaming: boolean;
}) {
  if (!text) {
    return streaming ? (
      <p className="hint">The answer will appear here once the model has reasoned it through.</p>
    ) : null;
  }
  return (
    <div className="answer">
      {text}
      {streaming && <span className="caret" />}
    </div>
  );
}
