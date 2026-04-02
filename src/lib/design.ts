/**
 * Tatame Visual Identity v1.0 — Permanent Design Tokens
 * Dark premium martial-arts aesthetic.
 * DO NOT change these without a design system update.
 */

export const TATAME = {
  // ── Backgrounds ──────────────────────────────────────────────────────────
  bg: "#0B1220",
  bgCard: "#111827",
  bgElevated: "#1F2937",
  bgInput: "#1F2937",

  // ── Text ─────────────────────────────────────────────────────────────────
  text: "#FFFFFF",
  textSecondary: "rgba(255,255,255,0.7)",
  textMuted: "rgba(255,255,255,0.5)",

  // ── Accents ──────────────────────────────────────────────────────────────
  gold: "#4C7BF4",
  goldGlow: "rgba(76,123,244,0.25)",
  goldMuted: "rgba(76,123,244,0.15)",
  success: "#10B981",
  successMuted: "rgba(16,185,129,0.15)",
  danger: "#EF4444",
  dangerMuted: "rgba(239,68,68,0.15)",
  teal: "#06B6D4",
  tealGlow: "rgba(6,182,212,0.25)",
  tealMuted: "rgba(6,182,212,0.15)",

  // ── Card / Surface System ─────────────────────────────────────────────────
  cardBorderRadius: 20,
  cardBorder: "rgba(255,255,255,0.06)",
  inputBorder: "rgba(255,255,255,0.08)",

  // ── Button Radii ─────────────────────────────────────────────────────────
  btnPrimaryRadius: 16,
  btnSecondaryBg: "#1F2937",
  btnSecondaryBorder: "rgba(255,255,255,0.1)",

  // ── Spacing ───────────────────────────────────────────────────────────────
  spacingXs: 8,
  spacingSm: 12,
  spacingMd: 16,
  spacingLg: 20,
  spacingXl: 24,

  // ── Soft shadow ───────────────────────────────────────────────────────────
  softShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },

  // ── Semantic surface ──────────────────────────────────────────────────────
  soft: "rgba(255,255,255,0.10)",
  border: "rgba(255,255,255,0.08)",
} as const;
