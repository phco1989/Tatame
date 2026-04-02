/**
 * BeltBadge — safe, reusable belt rank pill with stripes.
 *
 * Accepts every field name used across the app — callers never need
 * to manually pick the right field:
 *   <BeltBadge beltRank={user.beltRank} stripes={user.stripes} />
 *   <BeltBadge belt={user.belt} />
 *
 * Returns null when no valid belt value is found — never renders a
 * placeholder or silently defaults to "white" when the field is missing.
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslations } from "@/lib/i18n";

export type BeltRank = "white" | "blue" | "purple" | "brown" | "black";

const BELT_COLORS: Record<BeltRank, { bg: string; text: string; stripeBg: string }> = {
  white:  { bg: "#E2E8F0", text: "#1E293B", stripeBg: "#94A3B8" },
  blue:   { bg: "#1E40AF", text: "#FFFFFF", stripeBg: "#60A5FA" },
  purple: { bg: "#6D28D9", text: "#FFFFFF", stripeBg: "#A78BFA" },
  brown:  { bg: "#7C2D12", text: "#FFFFFF", stripeBg: "#D97706" },
  black:  { bg: "#0F172A", text: "#FFFFFF", stripeBg: "#64748B" },
};

const VALID_BELTS: BeltRank[] = ["white", "blue", "purple", "brown", "black"];

function isValidBelt(v: unknown): v is BeltRank {
  return typeof v === "string" && VALID_BELTS.includes(v as BeltRank);
}

/**
 * Reads belt rank from a user-like object trying multiple field names
 * in priority order. Returns undefined if none found.
 * Priority: beltRank → belt → beltColor → rank → beltLevel
 */
export function getBeltFromUser(
  user: Record<string, unknown> | null | undefined
): BeltRank | undefined {
  if (!user) return undefined;
  for (const field of ["beltRank", "belt", "beltColor", "rank", "beltLevel"]) {
    if (isValidBelt(user[field])) return user[field] as BeltRank;
  }
  return undefined;
}

/**
 * Reads stripe count from a user-like object trying multiple field names.
 * Returns 0 if none found.
 * Priority: stripes → beltStripes
 */
export function getStripesFromUser(
  user: Record<string, unknown> | null | undefined
): number {
  if (!user) return 0;
  for (const field of ["stripes", "beltStripes"]) {
    const v = user[field];
    if (typeof v === "number" && v >= 0) return Math.min(4, Math.floor(v));
  }
  return 0;
}

interface BeltBadgeProps {
  /** Primary field name used throughout the app */
  beltRank?: string | null;
  /** Alias field names — checked when beltRank is absent */
  belt?: string | null;
  beltColor?: string | null;
  rank?: string | null;
  beltLevel?: string | null;
  /** Stripe count (0–4) */
  stripes?: number | null;
  /** Alias stripe field */
  beltStripes?: number | null;
  size?: "sm" | "md";
  /** Override stripe dot color (e.g. "#EF4444" for red manager stripes) */
  stripeColor?: string | null;
}

export function BeltBadge({
  beltRank,
  belt,
  beltColor,
  rank,
  beltLevel,
  stripes,
  beltStripes,
  size = "sm",
  stripeColor,
}: BeltBadgeProps) {
  const tr = useTranslations();

  // Resolve belt — first valid value wins across all alias props
  const resolvedRank: BeltRank | undefined =
    isValidBelt(beltRank)   ? beltRank   :
    isValidBelt(belt)       ? belt       :
    isValidBelt(beltColor)  ? beltColor  :
    isValidBelt(rank)       ? rank       :
    isValidBelt(beltLevel)  ? beltLevel  :
    undefined;

  // Render nothing when no valid belt is found — never shows a silent default
  if (!resolvedRank) return null;

  // Resolve stripes
  const rawStripes = stripes ?? beltStripes ?? 0;
  const safeStripes = Math.min(4, Math.max(0, Math.floor(rawStripes ?? 0)));

  const colors = BELT_COLORS[resolvedRank];
  const label = tr.belts[resolvedRank];
  const resolvedStripeColor = stripeColor || colors.stripeBg;

  const isSmall = size === "sm";
  const fontSize = isSmall ? 11 : 13;
  const stripSize = isSmall ? 5 : 7;
  const paddingH = isSmall ? 8 : 10;
  const paddingV = isSmall ? 3 : 5;

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: colors.bg,
          paddingHorizontal: paddingH,
          paddingVertical: paddingV,
        },
      ]}
    >
      <Text style={[styles.label, { color: colors.text, fontSize }]}>
        {label}
      </Text>
      {safeStripes > 0 && (
        <View style={styles.stripesRow}>
          {Array.from({ length: safeStripes }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.stripe,
                {
                  backgroundColor: resolvedStripeColor,
                  width: stripSize,
                  height: stripSize,
                },
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

/** Returns a string like "Blue • 2 stripes" or "Black" — empty string if belt is invalid/missing */
export function beltLabel(beltRankVal?: string | null, stripesVal?: number | null): string {
  if (!isValidBelt(beltRankVal)) return "";
  const s = Math.min(4, Math.max(0, Math.floor(stripesVal ?? 0)));
  const FALLBACK_LABELS: Record<BeltRank, string> = {
    white: "White",
    blue: "Blue",
    purple: "Purple",
    brown: "Brown",
    black: "Black",
  };
  const base = FALLBACK_LABELS[beltRankVal];
  if (s === 0) return base;
  return `${base} • ${s} ${s === 1 ? "stripe" : "stripes"}`;
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    gap: 4,
    alignSelf: "flex-start",
  },
  label: {
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  stripesRow: {
    flexDirection: "row",
    gap: 2,
    alignItems: "center",
  },
  stripe: {
    borderRadius: 50,
  },
});
