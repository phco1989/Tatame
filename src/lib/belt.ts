/**
 * belt.ts — Belt Progress System helpers
 *
 * Single source of truth for belt order, colors, labels, and logic.
 */

export type BeltRank = "white" | "blue" | "purple" | "brown" | "black";

// ─── Order ────────────────────────────────────────────────────────────────────

export const BELT_ORDER: BeltRank[] = ["white", "blue", "purple", "brown", "black"];

// ─── Colors (hex, used for glow / ring effects) ───────────────────────────────

export const BELT_HEX: Record<BeltRank, string> = {
  white:  "#E2E8F0",
  blue:   "#1E40AF",
  purple: "#6D28D9",
  brown:  "#7C2D12",
  black:  "#1A1A2E",
};

/** Returns primary hex color for the given belt (for glow, ring, highlights) */
export function beltColor(rank: BeltRank | string | null | undefined): string {
  if (!rank || !BELT_HEX[rank as BeltRank]) return "#64748B";
  return BELT_HEX[rank as BeltRank];
}

/** Returns a slightly brighter glow color with opacity */
export function beltGlowColor(rank: BeltRank | string | null | undefined): string {
  const hex = beltColor(rank);
  // Append alpha for glow
  return hex + "80"; // 50% opacity glow
}

// ─── Stripe progress ──────────────────────────────────────────────────────────

/** Clamps a number to [0, 100] */
export function clampStripeProgress(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

// ─── Belt progression ─────────────────────────────────────────────────────────

/** Returns the next belt after the given one, or null if already black */
export function nextBelt(rank: BeltRank | string | null | undefined): BeltRank | null {
  if (!rank) return null;
  const idx = BELT_ORDER.indexOf(rank as BeltRank);
  if (idx < 0 || idx >= BELT_ORDER.length - 1) return null;
  return BELT_ORDER[idx + 1];
}

/** Returns true if the belt can be promoted (i.e. is not black) */
export function canPromoteBelt(rank: BeltRank | string | null | undefined): boolean {
  return nextBelt(rank) !== null;
}

/** Returns true if stripes can be awarded (max 4) */
export function canAwardStripe(stripes: number): boolean {
  return stripes < 4;
}

// ─── Labels (i18n keys are in translations.ts; these are the raw EN labels) ───

export const BELT_LABELS: Record<BeltRank, string> = {
  white:  "White",
  blue:   "Blue",
  purple: "Purple",
  brown:  "Brown",
  black:  "Black",
};

/** Returns i18n key for belt label */
export function beltLabelKey(rank: BeltRank | string): string {
  return `belt.${rank}`;
}

/** Returns formatted string like "Blue • 2 stripes" for display */
export function beltDisplayLabel(rank: BeltRank | string | null | undefined, stripes: number): string {
  if (!rank || !BELT_LABELS[rank as BeltRank]) return "";
  const label = BELT_LABELS[rank as BeltRank];
  if (stripes === 0) return label;
  return `${label} • ${stripes} ${stripes === 1 ? "stripe" : "stripes"}`;
}

// ─── Belt history entry types ─────────────────────────────────────────────────

export type BeltHistoryType = "stripe" | "belt";

export interface BeltHistoryEntry {
  type: BeltHistoryType;
  beltRank: BeltRank;
  stripes: number;
  awardedBy: string;
  awardedByName?: string;
  timestamp: unknown; // Firestore Timestamp or serverTimestamp()
}

// ─── Belt fields that coaches are allowed to modify ───────────────────────────

export const BELT_UPDATABLE_FIELDS: string[] = [
  "beltRank",
  "stripes",
  "stripeProgress",
  "beltUpdatedAt",
  "beltHistory",
  "lastPromotionAt",
];

// ─── Manager belt display override ───────────────────────────────────────────

export interface BeltDisplay {
  beltRank: BeltRank;
  stripes: number;
  stripeColor: string; // hex — overrides the default stripe dot color
}

/**
 * Returns the belt display values for a user.
 * Managers ALWAYS display as: Black belt, 2 red stripes.
 * All other roles use their actual beltRank/stripes from Firestore.
 */
export function getBeltDisplay(
  role: string | null | undefined,
  beltRank: string | null | undefined,
  stripes: number | null | undefined
): BeltDisplay {
  if (role === "manager") {
    return { beltRank: "black", stripes: 2, stripeColor: "#EF4444" };
  }
  const rank = BELT_ORDER.includes(beltRank as BeltRank)
    ? (beltRank as BeltRank)
    : "white";
  return { beltRank: rank, stripes: Math.min(4, Math.max(0, Math.floor(stripes ?? 0))), stripeColor: "" };
}
