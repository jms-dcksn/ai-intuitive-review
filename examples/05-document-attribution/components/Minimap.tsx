"use client";

import type { FindingCategory } from "@/lib/types";

export interface MinimapMarker {
  id: string;
  /** Vertical position as a fraction of the document's scroll height. */
  ratio: number;
  category: FindingCategory;
}

interface MinimapProps {
  markers: MinimapMarker[];
  /** Visible window, as fractions of scroll height. */
  viewport: { top: number; height: number };
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * The whole document at a glance: one marker per finding at its true position
 * in the filing, plus the current viewport. This is the piece a findings list
 * can't give you — whether the evidence clusters where it should.
 */
export function Minimap({ markers, viewport, selectedId, onSelect }: MinimapProps) {
  return (
    <div className="minimap" aria-label="Finding locations in document">
      <div
        className="minimap-viewport"
        style={{
          top: `${viewport.top * 100}%`,
          height: `${Math.max(viewport.height * 100, 1.5)}%`,
        }}
      />
      {markers.map((m) => (
        <button
          key={m.id}
          className={`minimap-marker cat-${m.category}${
            m.id === selectedId ? " selected" : ""
          }`}
          style={{ top: `${m.ratio * 100}%` }}
          title={m.id}
          onClick={() => onSelect(m.id)}
        />
      ))}
    </div>
  );
}
