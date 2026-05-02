// #39 — Shared court preview SVG (reused in drills library + catalog cards)
// Renders a compact court diagram for a given CourtLayoutType.

import type { CourtLayoutType } from "@basketball-clipper/shared/types";

export function CourtSVG({ layout, className }: { layout: CourtLayoutType; className?: string }) {
  const isFull = layout === "full_fiba" || layout === "mini_fiba";

  if (isFull) {
    return (
      <svg viewBox="0 0 130 70" className={className} xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="128" height="68" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5"/>
        <line x1="65" y1="1" x2="65" y2="69" stroke="currentColor" strokeWidth="1"/>
        <circle cx="65" cy="35" r="9" fill="none" stroke="currentColor" strokeWidth="1"/>
        <rect x="1" y="24" width="19" height="22" fill="none" stroke="currentColor" strokeWidth="1"/>
        <path d="M 20,24 A 13,13 0 0,1 20,46" fill="none" stroke="currentColor" strokeWidth="1"/>
        <path d="M 1,10 A 38,38 0 0,1 1,60" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2,2"/>
        <rect x="110" y="24" width="19" height="22" fill="none" stroke="currentColor" strokeWidth="1"/>
        <path d="M 110,24 A 13,13 0 0,0 110,46" fill="none" stroke="currentColor" strokeWidth="1"/>
        <path d="M 129,10 A 38,38 0 0,0 129,60" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2,2"/>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 120 80" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="118" height="78" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="42" y="1" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1"/>
      <path d="M 42,37 A 18,18 0 0,0 78,37" fill="none" stroke="currentColor" strokeWidth="1"/>
      <path d="M 6,79 A 70,70 0 0,1 114,79" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2,2"/>
      <circle cx="60" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  );
}
