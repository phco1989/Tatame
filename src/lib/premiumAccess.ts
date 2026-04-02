/**
 * Premium Access Helpers
 *
 * Centralised gating logic for free vs Pro plans.
 * Uses the entitlements computed from the tenant store (Firestore paymentMethods)
 * and falls back to a RevenueCat "premium" entitlement check.
 *
 * Free plan limits:
 *  - Max 10 students
 *  - Max 10 classes
 *  - No Reports / Financial analytics access
 *  - No Progress access
 *  - No AI Chat sending
 *  - No Belt promotion editing
 */

import { Alert } from "react-native";
import { useCallback } from "react";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useTenantStore, selectHasFinanceAccess, selectTenantHydrated } from "@/lib/state/tenant-store";
import { hasEntitlement } from "@/lib/revenuecatClient";
import type { Router } from "expo-router";

// ─── Constants ──────────────────────────────────────────────────────────────────

export const FREE_STUDENT_LIMIT = 10;
export const FREE_CLASS_LIMIT = 10;

// ─── Core check ─────────────────────────────────────────────────────────────────

/**
 * Returns `true` when the current school has Pro access.
 *
 * Priority:
 *  1. Tenant-store entitlements (computed from Firestore paymentMethods).
 *  2. RevenueCat "premium" entitlement (covers IAP purchases that haven't
 *     synced to Firestore yet).
 */
export async function checkPremiumAccess(): Promise<boolean> {
  // 1) Check tenant-store entitlements (synchronous, already hydrated)
  const entitlements = useTenantStore.getState().entitlements;
  if (entitlements?.hasProAccess) {
    return true;
  }

  // 2) Fallback: ask RevenueCat directly
  try {
    const result = await hasEntitlement("premium");
    if (result.ok && result.data) {
      return true;
    }
  } catch {
    // RevenueCat unavailable — treat as free
  }

  return false;
}

/**
 * Synchronous version that only reads the tenant store.
 * Use when you cannot await (e.g. inside render or synchronous callbacks).
 * Combines both Firestore entitlements and the RevenueCat cache so it agrees
 * with the Plans & Billing screen.
 */
export function hasPremiumAccessSync(): boolean {
  const state = useTenantStore.getState();
  return (state.entitlements?.hasProAccess === true) || state.rcHasProAccess;
}

// ─── Student limit ──────────────────────────────────────────────────────────────

/**
 * Returns `true` if the school can add more students.
 * Premium schools have no limit; free schools are capped at FREE_STUDENT_LIMIT.
 */
export function canAddStudent(currentStudentCount: number, isPremium: boolean): boolean {
  if (isPremium) return true;
  return currentStudentCount < FREE_STUDENT_LIMIT;
}

/**
 * Returns `true` if the school can create more classes.
 * Premium schools have no limit; free schools are capped at FREE_CLASS_LIMIT.
 */
export function canAddClass(currentClassCount: number, isPremium: boolean): boolean {
  if (isPremium) return true;
  return currentClassCount < FREE_CLASS_LIMIT;
}

// ─── Alert + redirect helpers ───────────────────────────────────────────────────

/**
 * Shows an alert telling the user the feature requires Pro, then navigates
 * to /paywall when they tap "Upgrade".
 */
export function showProRequiredAlert(
  router: Router,
  featureName: string,
): void {
  // NGO/ONG orgs cannot upgrade — silently redirect home instead of
  // showing the paywall CTA.
  const hasFinance = useTenantStore.getState();
  if (!selectHasFinanceAccess(hasFinance)) {
    router.replace("/(tabs)");
    return;
  }

  Alert.alert(
    "Pro Feature",
    `${featureName} is available on the Pro plan. Upgrade to unlock it.`,
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Upgrade",
        onPress: () => router.push("/paywall"),
      },
    ],
  );
}

/**
 * Shows an alert for the student limit, then navigates to /paywall.
 */
export function showStudentLimitAlert(router: Router): void {
  Alert.alert(
    "Student Limit Reached",
    `Free accounts can have up to ${FREE_STUDENT_LIMIT} students. Upgrade to Pro for unlimited students.`,
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Upgrade",
        onPress: () => router.push("/paywall"),
      },
    ],
  );
}

/**
 * Shows an alert for the class limit, then navigates to /paywall.
 */
export function showClassLimitAlert(router: Router): void {
  Alert.alert(
    "Class Limit Reached",
    `Free accounts can create up to ${FREE_CLASS_LIMIT} classes. Upgrade to Pro for unlimited classes.`,
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Upgrade",
        onPress: () => router.push("/paywall"),
      },
    ],
  );
}

// ─── Finance route guard ─────────────────────────────────────────────────────

/**
 * Hook that redirects to /(tabs) when the current tenant has no finance access
 * (NGO/ONG organisations). Drop this one-liner into every finance screen to
 * block deeplink / back-nav access:
 *
 *   const hasFinance = useFinanceGuard();
 *   if (!hasFinance) return null;
 */
export function useFinanceGuard(): boolean {
  const router = useRouter();
  const hasFinance = useTenantStore(selectHasFinanceAccess);
  const hydrated = useTenantStore(selectTenantHydrated);

  useFocusEffect(
    useCallback(() => {
      if (hydrated && !hasFinance) {
        router.replace("/(tabs)");
      }
    }, [hydrated, hasFinance, router]),
  );

  return hasFinance;
}
