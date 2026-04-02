import { doc, getDoc } from "firebase/firestore";
import { auth, db, waitForAuthReady } from "@/lib/firebase-config";
import { useTenantStore } from "@/lib/state/tenant-store";
import { setUserId } from "@/lib/revenuecatClient";

export async function bootstrapTenant(): Promise<void> {
  try {
    await waitForAuthReady();

    const user = auth.currentUser;

    if (!user) {
      // No session at all — user needs to join or sign in
      useTenantStore.getState().setTenantHydrated(true);
      return;
    }

    // IMPORTANT:
    // Re-link RevenueCat to the exact same authenticated Firebase user
    // on every app start / auth restore.
    await setUserId(user.uid);

    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      // Auth session exists (anonymous from a previous join attempt or stale)
      // but no Firestore user doc yet — route to Join/Onboarding.
      console.log("[bootstrapTenant] User doc missing; routing to Join");
      useTenantStore.getState().setTenantHydrated(true);
      return;
    }

    const userData = userSnap.data();
    const schoolId: string | undefined = userData?.schoolId;
    const role: string | undefined = userData?.role;
    const status: string | undefined = userData?.status;

    useTenantStore.getState().setCurrentUserRole(role ?? null);
    useTenantStore.getState().setCurrentUserStatus(status ?? null);

    if (schoolId) {
      await useTenantStore.getState().loadTenantFromFirestore(schoolId);
    } else {
      // User doc exists but not yet linked to a school
      useTenantStore.getState().setTenantHydrated(true);
    }
  } catch (error: any) {
    const code = error?.code ?? "";
    if (code === "permission-denied" || code === "unavailable") {
      console.warn("[bootstrapTenant] Firestore error (non-fatal):", code);
    } else {
      console.warn("[bootstrapTenant] Unexpected error:", error);
    }
    useTenantStore.getState().setTenantHydrated(true);
  }
}