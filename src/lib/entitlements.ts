/**
 * Entitlements — source of truth for plan/billing access.
 *
 * IMPORTANT SECURITY CONSTRAINT:
 *  - Client MUST NEVER write paymentMethods.* fields on schools/{schoolId}.
 *  - This file only READS paymentMethods to compute derived access flags.
 */

import { onSnapshot, doc } from "firebase/firestore";
import { db } from "@/lib/firebase-config";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Plan = "starter" | "pro";
export type PlanStatus = "active" | "trial" | "expired";

export interface PaymentMethods {
  plan?: Plan;
  planStatus?: PlanStatus;
  trialEndsAt?: { toDate: () => Date } | Date | null;
  subscriptionEndsAt?: { toDate: () => Date } | Date | null;
  planActivatedAt?: unknown;
  planUpdatedAt?: unknown;
  trialUsed?: boolean;
}

export interface Entitlements {
  plan: Plan;
  status: PlanStatus;
  hasProAccess: boolean;
  isTrialActive: boolean;
  /** ceil of remaining trial days, or 0 */
  daysLeftInTrial: number;
  trialEndsAt: Date | null;
  subscriptionEndsAt: Date | null;
  statusLabel: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  // Firestore Timestamp
  if (typeof (value as any).toDate === "function") {
    return (value as any).toDate();
  }
  return null;
}

// ─── computeEntitlements ─────────────────────────────────────────────────────

/**
 * Pure function: compute entitlements from raw paymentMethods and a reference
 * date (defaults to now). This enables deterministic testing.
 */
export function computeEntitlements(
  paymentMethods: PaymentMethods | undefined | null,
  nowDate: Date = new Date()
): Entitlements {
  const pm = paymentMethods ?? {};

  const plan: Plan = pm.plan ?? "starter";
  const status: PlanStatus = pm.planStatus ?? "active";
  const trialEndsAt = toDate(pm.trialEndsAt);
  const subscriptionEndsAt = toDate(pm.subscriptionEndsAt);

  // ─── Determine hasProAccess ───────────────────────────────────────────────
  let hasProAccess = false;

  if (subscriptionEndsAt && subscriptionEndsAt > nowDate) {
    hasProAccess = true;
  } else if (plan === "pro" && status === "active") {
    hasProAccess = true;
  } else if (plan === "pro" && status === "trial" && trialEndsAt && trialEndsAt > nowDate) {
    hasProAccess = true;
  }

  // ─── Trial info ───────────────────────────────────────────────────────────
  const isTrialActive =
    plan === "pro" && status === "trial" && trialEndsAt !== null && trialEndsAt > nowDate;

  let daysLeftInTrial = 0;
  if (isTrialActive && trialEndsAt) {
    const msLeft = trialEndsAt.getTime() - nowDate.getTime();
    daysLeftInTrial = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
    if (daysLeftInTrial < 0) daysLeftInTrial = 0;
  }

  // ─── Status label ─────────────────────────────────────────────────────────
  let statusLabel: string;
  if (hasProAccess) {
    if (isTrialActive) {
      statusLabel = "trial";
    } else {
      statusLabel = "active";
    }
  } else {
    if (status === "expired" || (plan === "pro" && !hasProAccess)) {
      statusLabel = "expired";
    } else {
      statusLabel = "active";
    }
  }

  return {
    plan,
    status,
    hasProAccess,
    isTrialActive,
    daysLeftInTrial,
    trialEndsAt,
    subscriptionEndsAt,
    statusLabel,
  };
}

// ─── listenSchoolPaymentMethods ───────────────────────────────────────────────

/**
 * Attaches a real-time listener to the school doc and calls onChange with
 * freshly computed entitlements whenever the doc changes.
 *
 * Returns an unsubscribe function.
 *
 * NOTE: We read the full school doc here because paymentMethods is a nested
 * map on the schools/{schoolId} document. The client is allowed to READ it;
 * it must never WRITE to paymentMethods.* fields.
 */
export function listenSchoolPaymentMethods(
  schoolId: string,
  onChange: (entitlements: Entitlements) => void
): () => void {
  if (!schoolId) return () => {};

  const schoolRef = doc(db, "schools", schoolId);

  const unsubscribe = onSnapshot(
    schoolRef,
    (snap) => {
      if (!snap.exists()) {
        onChange(computeEntitlements(null));
        return;
      }
      const data = snap.data();
      const paymentMethods: PaymentMethods | undefined = data?.paymentMethods;
      onChange(computeEntitlements(paymentMethods));
    },
    (error) => {
      // Permission denied or network error — keep previous state, log quietly
      console.warn("[Entitlements] Listener error:", error?.code ?? error);
    }
  );

  return unsubscribe;
}
