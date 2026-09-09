import type { BinType } from "@/lib/model";
import { cn } from "@/lib/utils";

/**
 * A wheelie bin whose lid carries the sorting colour from SVOA's brochure.
 * Shared bins (Kärl 1–3) get a split lid: two colours, one bin. The body is
 * always the neutral foreground so the lid is the only thing that varies.
 */
const LIDS: Record<BinType, [string, string?]> = {
  rest: ["var(--bin-rest)"],
  mat: ["var(--bin-mat)"],
  restmat: ["var(--bin-rest)", "var(--bin-mat)"],
  papper: ["var(--bin-papper)"],
  plast: ["var(--bin-plast)"],
  papperplast: ["var(--bin-papper)", "var(--bin-plast)"],
  glas: ["var(--bin-glas)"],
  metall: ["var(--bin-metall)"],
  glasmetall: ["var(--bin-glas)", "var(--bin-metall)"],
  tradgard: ["var(--bin-tradgard)"],
  other: ["var(--bin-other)"],
};

export function lidColors(type: BinType): [string, string?] {
  return LIDS[type];
}

export function BinIcon({ type, className }: { type: BinType; className?: string }) {
  const [a, b] = LIDS[type];
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden
      className={cn("size-10 shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Lid: filled, the only colour. Split down the middle for shared bins. */}
      {b ? (
        <>
          <path d="M8 16 H24 V12 H10.5 Z" fill={a} stroke="none" />
          <path d="M24 16 H40 L37.5 12 H24 Z" fill={b} stroke="none" />
          <path d="M8 16 L10.5 12 H37.5 L40 16 Z" />
        </>
      ) : (
        <path d="M8 16 L10.5 12 H37.5 L40 16 Z" fill={a} stroke={a} />
      )}
      {/* Body and wheels. */}
      <path d="M11 17 L13 37 H35 L37 17" />
      <path d="M19 22 L19.8 33 M29 22 L28.2 33" opacity="0.5" />
      <circle cx="16" cy="41" r="2.4" />
      <circle cx="32" cy="41" r="2.4" />
    </svg>
  );
}
