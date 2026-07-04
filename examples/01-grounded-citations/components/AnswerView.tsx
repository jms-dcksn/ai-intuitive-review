"use client";

import type { AnswerBlock, Citation } from "@/lib/types";
import { CitationMarker } from "./Citation";

/**
 * Renders the answer as a sequence of blocks. Each grounded block is followed by
 * its citation markers; each ungrounded block (a claim with no source) is
 * underlined and badged so the reviewer can see exactly what is *not* backed by a
 * document. Making the gaps visible is as important as showing the citations.
 */
export function AnswerView({
  blocks,
  activeCitation,
  onSelect,
}: {
  blocks: AnswerBlock[];
  activeCitation: Citation | null;
  onSelect: (c: Citation) => void;
}) {
  return (
    <div className="answer">
      {blocks.map((block, i) => {
        const grounded = block.citations.length > 0;
        return (
          <span key={i}>
            <span className={grounded ? undefined : "ungrounded"}>
              {block.text}
            </span>
            {grounded ? (
              block.citations.map((c) => (
                <CitationMarker
                  key={c.n}
                  citation={c}
                  active={activeCitation?.n === c.n}
                  onSelect={onSelect}
                />
              ))
            ) : (
              isMeaningful(block.text) && (
                <span className="ungrounded-badge" title="No source cited">
                  ungrounded
                </span>
              )
            )}
          </span>
        );
      })}
    </div>
  );
}

function isMeaningful(text: string): boolean {
  return text.trim().length > 0;
}
