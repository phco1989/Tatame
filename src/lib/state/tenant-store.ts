import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db, waitForAuthReady } from "@/lib/firebase-config";
import { getThemeFromPrimaryColor } from "@/lib/theme";
import type { Tenant } from "@/types";
import {
  computeEntitlements,
  listenSchoolPaymentMethods,
  type Entitlements,
} from "@/lib/entitlements";
import { getCustomerInfo } from "@/lib/revenuecatClient";

const RC_ENTITLEMENT_ID = "premium";

interface TenantState {
  tenant: Tenant | null;
  isLoading: boolean;
  tenantHydrated: boolean;
  entitlements: Entitlements | null;
  entitlementsHydrated: boolean;
  /** True when the RevenueCat "premium" entitlement is active. */
  rcHasProAccess: boolean;
  /** True while fetching CustomerInfo from RevenueCat. */
  rcSubscriptionLoading: boolean;
  /** Role of the currently signed-in user. Not persisted. */
  currentUserRole: string | null;
  /** Firestore status field of the currently signed-in user. Not persisted. */
  currentUserStatus: string | null;
}

interface TenantActions {
  setTenant: (tenant: Tenant) => void;
  updateTenant: (updates: Partial<Tenant>) => void;
  updateGoogleReviewUrl: (url: string) => void;
  updateWhatsAppPhone: (phone: string) => void;
  loadTenant: () => void;
  loadTenantFromFirestore: (schoolId: string) => Promise<void>;
  saveTenantToFirestore: () => Promise<void>;
  clearTenant: () => void;
  setTenantHydrated: (value: boolean) => void;
  setEntitlements: (entitlements: Entitlements) => void;
  setEntitlementsHydrated: (value: boolean) => void;
  /** Fetches fresh CustomerInfo from RevenueCat and updates rcHasProAccess. */
  refreshSubscriptionStatus: () => Promise<void>;
  setCurrentUserRole: (role: string | null) => void;
  setCurrentUserStatus: (status: string | null) => void;
}

// Module-level unsubscribe for the entitlements listener — prevents duplicates.
let _entitlementsUnsubscribe: (() => void) | null = null;

export const useTenantStore = create<TenantState & TenantActions>()(
  persist(
    (set, get) => ({
      tenant: null,
      isLoading: false,
      tenantHydrated: false,
      entitlements: null,
      entitlementsHydrated: false,
      rcHasProAccess: false,
      rcSubscriptionLoading: false,
      currentUserRole: null,
      currentUserStatus: null,

      setEntitlements: (entitlements) => set({ entitlements }),
      setEntitlementsHydrated: (value) => set({ entitlementsHydrated: value }),

      refreshSubscriptionStatus: async () => {
        set({ rcSubscriptionLoading: true });
        const result = await getCustomerInfo();
        if (result.ok) {
          const active = Boolean(result.data.entitlements.active?.[RC_ENTITLEMENT_ID]);
          set({ rcHasProAccess: active, rcSubscriptionLoading: false });
        } else {
          set({ rcSubscriptionLoading: false });
        }
      },

      setTenant: (tenant) => {
        set({ tenant });
      },

      setTenantHydrated: (value: boolean) => {
        set({ tenantHydrated: value });
      },

      setCurrentUserRole: (role: string | null) => {
        set({ currentUserRole: role });
      },

      setCurrentUserStatus: (status: string | null) => {
        set({ currentUserStatus: status });
      },

      updateTenant: (updates) => {
        const current = get().tenant;
        if (current) {
          set({
            tenant: {
              ...current,
              ...updates,
              updatedAt: new Date().toISOString(),
            },
          });
        }
      },

      updateGoogleReviewUrl: (url) => {
        const current = get().tenant;
        if (current) {
          set({
            tenant: {
              ...current,
              googleReviewUrl: url,
              updatedAt: new Date().toISOString(),
            },
          });
        }
      },

      updateWhatsAppPhone: (phone) => {
        const current = get().tenant;
        if (current) {
          set({
            tenant: {
              ...current,
              whatsappPhone: phone,
              updatedAt: new Date().toISOString(),
            },
          });
        }
      },

      loadTenant: () => {
        // Tenant is automatically loaded from AsyncStorage via persist middleware
        set({ isLoading: false });
      },

      loadTenantFromFirestore: async (schoolId: string) => {
        if (!schoolId) return;

        set({ isLoading: true });
        try {
          await waitForAuthReady();
          const schoolRef = doc(db, "schools", schoolId);
          const schoolSnap = await getDoc(schoolRef);

          if (schoolSnap.exists()) {
            const data = schoolSnap.data();
            const theme = getThemeFromPrimaryColor(data.primaryColor);

            const tenant: Tenant = {
              id: schoolId,
              name: data.name || "",
              whatsappPhone: data.whatsappPhone || "",
              googleReviewUrl: data.googleReviewUrl || "",
              logoUrl: data.logoUrl || "",
              primaryColor: theme.primary,
              secondaryColor: theme.secondary,
              accentColor: data.accentColor || "#F59E0B",
              description: data.description || "",
              createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
              updatedAt: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
              organizationType: data.organizationType || undefined,
              featureFlags: data.featureFlags || undefined,
            };

            // Compute initial entitlements from the same snapshot
            const initialEntitlements = computeEntitlements(data.paymentMethods);
            set({
              tenant,
              isLoading: false,
              entitlements: initialEntitlements,
              entitlementsHydrated: true,
              tenantHydrated: true,
            });
          } else {
            set({ isLoading: false, tenantHydrated: true, entitlementsHydrated: true });
          }
        } catch (error) {
          console.warn("[TenantStore] Failed to load from Firestore:", error);
          set({ isLoading: false, tenantHydrated: true, entitlementsHydrated: true });
        }

        // Attach lightweight real-time listener so plan changes propagate instantly.
        // Detach any previous listener first to avoid duplicates.
        if (_entitlementsUnsubscribe) {
          _entitlementsUnsubscribe();
          _entitlementsUnsubscribe = null;
        }

        _entitlementsUnsubscribe = listenSchoolPaymentMethods(schoolId, (entitlements) => {
          useTenantStore.setState({ entitlements, entitlementsHydrated: true });
        });
      },

      saveTenantToFirestore: async () => {
        const tenant = get().tenant;
        if (!tenant?.id) return;

        try {
          await waitForAuthReady();
          const schoolRef = doc(db, "schools", tenant.id);

          await updateDoc(schoolRef, {
            name: tenant.name,
            primaryColor: tenant.primaryColor,
            secondaryColor: tenant.secondaryColor,
            accentColor: tenant.accentColor,
            logoUrl: tenant.logoUrl,
            description: tenant.description,
            whatsappPhone: tenant.whatsappPhone,
            googleReviewUrl: tenant.googleReviewUrl,
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          console.warn("[TenantStore] Failed to save to Firestore:", error);
        }
      },

      clearTenant: () => {
        // Also detach the entitlements listener on sign-out
        if (_entitlementsUnsubscribe) {
          _entitlementsUnsubscribe();
          _entitlementsUnsubscribe = null;
        }
        set({ tenant: null, entitlements: null, entitlementsHydrated: false });
      },
    }),
    {
      name: "ayon-flow-tenant",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ tenant: state.tenant }),
    }
  )
);

// Selector helpers
export const selectTenant = (state: TenantState & TenantActions) => state.tenant;
export const selectTenantId = (state: TenantState & TenantActions) => state.tenant?.id ?? "";
export const selectSchoolName = (state: TenantState & TenantActions) => state.tenant?.name ?? "";
export const selectSchoolWhatsApp = (state: TenantState & TenantActions) => state.tenant?.whatsappPhone ?? "";
export const selectGoogleReviewUrl = (state: TenantState & TenantActions) => state.tenant?.googleReviewUrl ?? "";
export const selectPrimaryColor = (state: TenantState & TenantActions) => state.tenant?.primaryColor ?? "#0891B2";
export const selectSecondaryColor = (state: TenantState & TenantActions) => state.tenant?.secondaryColor ?? "#06B6D4";
export const selectAccentColor = (state: TenantState & TenantActions) => state.tenant?.accentColor ?? "#F59E0B";
export const selectLogoUrl = (state: TenantState & TenantActions) => state.tenant?.logoUrl ?? "";
export const selectDescription = (state: TenantState & TenantActions) => state.tenant?.description ?? "";
export const selectTenantHydrated = (state: TenantState & TenantActions) => state.tenantHydrated;
export const selectEntitlements = (state: TenantState & TenantActions) => state.entitlements;
export const selectEntitlementsHydrated = (state: TenantState & TenantActions) => state.entitlementsHydrated;
/**
 * Combined Pro access check: true when either Firestore entitlement OR
 * RevenueCat "premium" entitlement is active.  This is the single selector
 * all premium gates should use so Plans & Billing and feature gates agree.
 */
export const selectIsPro = (state: TenantState & TenantActions): boolean =>
  (state.entitlements?.hasProAccess ?? false) || state.rcHasProAccess;

/** True when this school is an NGO/ONG (hides finance features) */
export const selectIsNgo = (state: TenantState & TenantActions): boolean =>
  state.tenant?.organizationType === "ngo" ||
  state.tenant?.featureFlags?.financialDashboard === false;

/**
 * Centralized finance capability gate.
 * Returns true when finance features (payments, billing, subscriptions,
 * reports, coach payouts, upgrade prompts) should be available.
 * Returns false for NGO/ONG organizations — all finance UI, routes,
 * and queries must check this single selector.
 */
export const selectHasFinanceAccess = (state: TenantState & TenantActions): boolean =>
  !selectIsNgo(state);

/** Role of the currently signed-in user (null until bootstrapTenant runs). */
export const selectCurrentUserRole = (state: TenantState & TenantActions): string | null =>
  state.currentUserRole;

/** Firestore status of the currently signed-in user (null until bootstrapTenant runs). */
export const selectCurrentUserStatus = (state: TenantState & TenantActions): string | null =>
  state.currentUserStatus;

// Memoized theme gradient value to prevent infinite re-renders
// This is needed because arrays are compared by reference in Zustand's shallow comparison
let cachedGradient: readonly [string, string] = ["#0891B2", "#06B6D4"];
let cachedPrimary = "#0891B2";
let cachedSecondary = "#06B6D4";

// Theme gradient selector - returns [primary, secondary] for LinearGradient
export const selectThemeGradient = (state: TenantState & TenantActions): readonly [string, string] => {
  const primary = state.tenant?.primaryColor ?? "#0891B2";
  const secondary = state.tenant?.secondaryColor ?? "#06B6D4";

  // Only create a new array if values actually changed
  if (primary !== cachedPrimary || secondary !== cachedSecondary) {
    cachedPrimary = primary;
    cachedSecondary = secondary;
    cachedGradient = [primary, secondary] as const;
  }

  return cachedGradient;
};
