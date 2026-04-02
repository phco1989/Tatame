/**
 * belt-intelligence.ts
 *
 * Smart Belt Intelligence — computed entirely in the app layer.
 * No AI API required. Pure deterministic scoring.
 *
 * Inputs: stripeProgress, beltHistory, progressEntries (optional)
 * Outputs: smartBeltScore, promotionReadiness, recommendations, timeline
 */

import type { BeltRank, BeltHistoryEntry } from "./belt";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface BeltIntelligenceInput {
  beltRank: BeltRank;
  stripes: number;
  stripeProgress: number; // 0–100
  beltHistory: BeltHistoryEntry[];
  progressEntryCount?: number; // total progress/feedback entries
  feedbackRatingAvg?: number;  // 1–5 average rating of feedback entries
}

export interface SmartBeltScore {
  /** 0–100 composite score */
  value: number;
  /** Component breakdowns */
  components: {
    stripeProgress: number;      // 0–40
    historyConsistency: number;  // 0–30
    engagementScore: number;     // 0–20
    beltTenure: number;          // 0–10
  };
}

export type ReadinessLevel = "ready" | "developing" | "early";

export interface PromotionReadiness {
  /** 0–100 composite readiness % */
  pct: number;
  level: ReadinessLevel;
  /** Short label for display */
  label: string;
  /** Indicator color hex */
  color: string;
}

export interface SmartRecommendation {
  text: string;
  /** Type for icon selection */
  type: "positive" | "neutral" | "coaching";
}

export interface BeltTimelineEntry {
  beltRank: BeltRank;
  startDate: Date | null;
  endDate: Date | null;
  /** Days spent on this belt, null if current */
  daysOnBelt: number | null;
  isCurrent: boolean;
}

// ─── Scoring Constants ─────────────────────────────────────────────────────────

const READINESS_READY = 85;
const READINESS_DEVELOPING = 60;

// ─── Smart Belt Score ──────────────────────────────────────────────────────────

/**
 * Compute a 0–100 Smart Belt Score from available data.
 * Component weights:
 *   40% stripe progress (raw input)
 *   30% belt history consistency (frequency of stripe events)
 *   20% engagement (progressEntryCount)
 *   10% belt tenure (not too new, not too old = healthy zone)
 */
export function computeSmartBeltScore(input: BeltIntelligenceInput): SmartBeltScore {
  const { stripeProgress, beltHistory, progressEntryCount = 0, beltRank } = input;

  // ── Component 1: Stripe progress (0–40) ──────────────────────────────────
  const stripeProgressComponent = (Math.min(100, Math.max(0, stripeProgress)) / 100) * 40;

  // ── Component 2: History consistency (0–30) ──────────────────────────────
  // Count stripe events for the current belt tier in last 12 months
  const now = Date.now();
  const twelveMonthsAgo = now - 365 * 24 * 60 * 60 * 1000;
  const recentStripeEvents = beltHistory.filter((e) => {
    if (e.type !== "stripe") return false;
    const ts = parseTimestamp(e.timestamp);
    return ts !== null && ts.getTime() > twelveMonthsAgo;
  });

  // 1 event = 10pts, 2 = 20pts, 3+ = 30pts (capped)
  const historyConsistency = Math.min(3, recentStripeEvents.length) * 10;

  // ── Component 3: Engagement (0–20) ───────────────────────────────────────
  // Based on progressEntryCount: 5+ entries = full 20
  const engagementScore = Math.min(5, progressEntryCount) * 4;

  // ── Component 4: Belt tenure score (0–10) ────────────────────────────────
  // Find when current belt started (last belt promotion event)
  const beltStart = findCurrentBeltStart(beltHistory, beltRank);
  let beltTenure = 5; // default neutral if no history
  if (beltStart) {
    const daysSince = (now - beltStart.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince >= 60 && daysSince <= 720) {
      // Sweet spot: 2 months to 2 years
      beltTenure = 10;
    } else if (daysSince < 60) {
      // Too new — scale up
      beltTenure = Math.round((daysSince / 60) * 8);
    } else {
      // Over 2 years — slight penalty (overdue for promotion)
      beltTenure = 7;
    }
  }

  const total = Math.round(
    stripeProgressComponent + historyConsistency + engagementScore + beltTenure
  );

  return {
    value: Math.min(100, Math.max(0, total)),
    components: {
      stripeProgress: Math.round(stripeProgressComponent),
      historyConsistency,
      engagementScore,
      beltTenure,
    },
  };
}

// ─── Promotion Readiness ───────────────────────────────────────────────────────

/**
 * Combine smartBeltScore (60%) + stripeProgress (40%) into a readiness %.
 */
export function computePromotionReadiness(
  smartScore: SmartBeltScore,
  stripeProgress: number
): PromotionReadiness {
  const pct = Math.round(smartScore.value * 0.6 + Math.min(100, stripeProgress) * 0.4);
  const clamped = Math.min(100, Math.max(0, pct));

  let level: ReadinessLevel;
  let label: string;
  let color: string;

  if (clamped >= READINESS_READY) {
    level = "ready";
    label = "Ready for evaluation";
    color = "#10B981"; // green
  } else if (clamped >= READINESS_DEVELOPING) {
    level = "developing";
    label = "Developing";
    color = "#FBBF24"; // gold
  } else {
    level = "early";
    label = "Early stage";
    color = "#60A5FA"; // blue
  }

  return { pct: clamped, level, label, color };
}

// ─── Smart Recommendations ────────────────────────────────────────────────────

/**
 * Generate a contextual recommendation text from score data.
 * Entirely local — no API calls.
 */
export function generateRecommendation(
  input: BeltIntelligenceInput,
  readiness: PromotionReadiness
): SmartRecommendation {
  const { stripes, stripeProgress, progressEntryCount = 0, feedbackRatingAvg, beltHistory } = input;

  const beltStart = findCurrentBeltStart(input.beltHistory, input.beltRank);
  const daysSinceBelt = beltStart
    ? (Date.now() - beltStart.getTime()) / (1000 * 60 * 60 * 24)
    : null;

  // Ready
  if (readiness.level === "ready") {
    if (stripes >= 3) {
      return { text: "Strong technical evolution. Ready for belt evaluation.", type: "positive" };
    }
    if (feedbackRatingAvg && feedbackRatingAvg >= 4.5) {
      return { text: "Exceptional performance scores. Belt promotion warranted.", type: "positive" };
    }
    return { text: "Consistent progress across all metrics. Consider scheduling evaluation.", type: "positive" };
  }

  // Developing
  if (readiness.level === "developing") {
    if (stripeProgress >= 60 && stripes < 2) {
      return { text: "Momentum is building. Award stripe to acknowledge consistent mat time.", type: "neutral" };
    }
    if (progressEntryCount < 2) {
      return { text: "Consistency improving. Document observations to track evolution.", type: "coaching" };
    }
    if (daysSinceBelt && daysSinceBelt > 365) {
      return { text: "High engagement over extended tenure. Consider stripe evaluation.", type: "neutral" };
    }
    return { text: "Consistency improving. Needs more mat time to solidify technique.", type: "coaching" };
  }

  // Early stage
  if (stripeProgress < 20) {
    return { text: "Early in current belt phase. Focus on fundamentals.", type: "coaching" };
  }
  if (beltHistory.length === 0) {
    return { text: "No recorded history yet. Start tracking to surface insights.", type: "coaching" };
  }
  return { text: "Building foundation. Regular training will accelerate progression.", type: "coaching" };
}

// ─── Belt Timeline ─────────────────────────────────────────────────────────────

/**
 * Build a timeline of belts from beltHistory, including current belt.
 * Returns entries from white → current belt.
 */
import { BELT_ORDER } from "./belt";

export function buildBeltTimeline(
  currentBeltRank: BeltRank,
  beltHistory: BeltHistoryEntry[]
): BeltTimelineEntry[] {
  const beltPromotions = beltHistory
    .filter((e) => e.type === "belt")
    .map((e) => ({
      beltRank: e.beltRank as BeltRank,
      date: parseTimestamp(e.timestamp),
    }))
    .sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));

  const currentIdx = BELT_ORDER.indexOf(currentBeltRank);
  const beltsToShow = BELT_ORDER.slice(0, currentIdx + 1);

  return beltsToShow.map((belt, i) => {
    const isCurrent = belt === currentBeltRank;

    // Find promotion event that put them on this belt
    const promotionEvent = beltPromotions.find((p) => p.beltRank === belt);
    const startDate = promotionEvent?.date ?? null;

    // End date = next belt's start date, or null if current
    const nextBelt = beltsToShow[i + 1];
    let endDate: Date | null = null;
    if (nextBelt) {
      const nextPromotion = beltPromotions.find((p) => p.beltRank === nextBelt);
      endDate = nextPromotion?.date ?? null;
    }

    let daysOnBelt: number | null = null;
    if (startDate && endDate) {
      daysOnBelt = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    } else if (startDate && isCurrent) {
      daysOnBelt = Math.round((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    }

    return {
      beltRank: belt,
      startDate,
      endDate,
      daysOnBelt,
      isCurrent,
    };
  });
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function parseTimestamp(ts: unknown): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts === "string") {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }
  // Firestore Timestamp-like object
  if (typeof ts === "object" && ts !== null && "toDate" in ts && typeof (ts as any).toDate === "function") {
    return (ts as any).toDate();
  }
  if (typeof ts === "object" && ts !== null && "seconds" in ts) {
    return new Date((ts as any).seconds * 1000);
  }
  return null;
}

function findCurrentBeltStart(history: BeltHistoryEntry[], currentBelt: BeltRank): Date | null {
  // The most recent "belt" event for the current belt rank
  const events = history
    .filter((e) => e.type === "belt" && e.beltRank === currentBelt)
    .map((e) => parseTimestamp(e.timestamp))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime());

  return events[0] ?? null;
}

/** Format days into readable string e.g. "180 days", "2.1 years" */
export function formatDuration(days: number): string {
  if (days < 365) return `${days} days`;
  const years = days / 365;
  return `${years.toFixed(1)} years`;
}
