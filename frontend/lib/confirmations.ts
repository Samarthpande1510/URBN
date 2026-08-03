import type { ProductRow } from "./products-context";

/**
 * The four Part 1 confirmations on the Golden Sample form.
 *
 * These used to gate Compliance and Packaging. They no longer do — those tracks
 * run in parallel — so the outstanding ones are surfaced as a stage pill instead
 * of being enforced by a lock.
 */
const PART1 = [
  { key: "colourConfirmedAt", short: "COLOUR" },
  { key: "logoMarkingConfirmedAt", short: "LOGO" },
  { key: "ratingLabelConfirmedAt", short: "RATING LABEL" },
  { key: "bomConfirmedAt", short: "BOM" },
] as const;

/** Short names of the confirmations still outstanding, in form order. */
export function pendingConfirmations(p: ProductRow): string[] {
  const gw = p.goldenWorkflow;
  // Only meaningful once the product is actually in the Golden Sample stage.
  if (!gw?.purchaseNotifiedAt) return [];
  const d = gw.details;
  if (!d) return PART1.map((f) => f.short);   // nothing confirmed yet
  return PART1.filter((f) => !d[f.key]).map((f) => f.short);
}

/**
 * Stage pill listing what's still to confirm, e.g. "PENDING: LOGO, BOM".
 * Returns null when nothing is outstanding, so callers can spread it directly.
 */
export function pendingConfirmationsPill(p: ProductRow): string | null {
  const pending = pendingConfirmations(p);
  if (pending.length === 0) return null;
  return `PENDING: ${pending.join(", ")}`;
}

/** The pill's text is dynamic, so it can't live in the static style maps. */
export const PENDING_PILL_PREFIX = "PENDING:";
export const PENDING_PILL_STYLE = "bg-amber-500/10 text-amber-600 border-amber-500/30";
