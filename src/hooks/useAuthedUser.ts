import { useState, useEffect, useRef, useCallback } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db, waitForAuthReady, ensureSignedIn } from "@/lib/firebase-config";
import { useTenantStore } from "@/lib/state/tenant-store";

// User data from Firestore users/{uid} collection
export interface FirestoreUserData {
  uid: string;
  role: "student" | "coach" | "manager";
  schoolId?: string;
  name?: string;
  email?: string;
  phone?: string;
  status?: "active" | "disabled";
  createdAt?: string;
  updatedAt?: string;
}

export interface UseAuthedUserResult {
  loading: boolean;
  userData: FirestoreUserData | null;
  error: string | null;
  uid: string | null;
  reload: () => Promise<void>;
}

/**
 * Centralized hook for authenticated user data.
 *
 * This hook ensures:
 * 1. Firebase Auth is ready before any Firestore reads
 * 2. User is signed in (anonymously if needed)
 * 3. User document is fetched from Firestore
 * 4. Handles "unavailable" errors gracefully
 *
 * Usage:
 * ```tsx
 * const { loading, userData, error, uid } = useAuthedUser();
 *
 * if (loading) return <ActivityIndicator />;
 * if (error) return <ErrorMessage message={error} />;
 *
 * // Safe to use userData
 * ```
 */
export function useAuthedUser(): UseAuthedUserResult {
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<FirestoreUserData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);

  // Track component mount state to prevent state updates on unmounted component
  const mountedRef = useRef(true);
  // Prevent duplicate loads
  const loadingRef = useRef(false);

  const load = useCallback(async () => {
    // Prevent duplicate concurrent loads
    if (loadingRef.current) return;
    loadingRef.current = true;

    try {
      setLoading(true);
      setError(null);

      // Step 1: Wait for Firebase Auth to be ready
      // This prevents "client is offline" errors from premature Firestore access
      await waitForAuthReady();

      // Step 2: Ensure user is signed in (creates anonymous user if needed)
      const user = await ensureSignedIn();

      if (!mountedRef.current) return;
      setUid(user.uid);

      // Step 3: Fetch user document from Firestore
      const userRef = doc(db, "users", user.uid);
      const snap = await getDoc(userRef);

      if (!mountedRef.current) return;

      if (!snap.exists()) {
        // User document doesn't exist yet - this is OK for new users
        // They may need to join with an invite code first
        setUserData(null);
        setError(null); // Not an error, just no profile yet
      } else {
        const data = snap.data() as FirestoreUserData;
        setUserData({
          uid: user.uid,
          role: data.role || "student",
          schoolId: data.schoolId,
          name: data.name,
          email: data.email,
          phone: data.phone,
          status: data.status,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        });

        // Load school theme from Firestore if user has a schoolId
        if (data.schoolId) {
          const loadTenantFromFirestore = useTenantStore.getState().loadTenantFromFirestore;
          loadTenantFromFirestore(data.schoolId);
        }
      }
    } catch (e: unknown) {
      if (!mountedRef.current) return;

      console.log("[useAuthedUser] Error:", e);

      // Handle specific Firebase errors
      const firebaseError = e as { code?: string; message?: string };

      if (firebaseError.code === "unavailable") {
        setError("Unable to connect. Please check your internet connection and try again.");
      } else if (firebaseError.code === "permission-denied") {
        setError("Access denied. Please try signing in again.");
      } else if (firebaseError.code === "not-found") {
        // Document doesn't exist - not really an error
        setUserData(null);
        setError(null);
      } else {
        setError(firebaseError.message || "Something went wrong. Please try again.");
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();

    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  const reload = useCallback(async () => {
    loadingRef.current = false; // Reset to allow reload
    await load();
  }, [load]);

  return {
    loading,
    userData,
    error,
    uid,
    reload,
  };
}

// Helper type guard for checking if user is a manager
export function isManager(userData: FirestoreUserData | null): boolean {
  return userData?.role === "manager";
}

// Helper type guard for checking if user is a coach
export function isCoach(userData: FirestoreUserData | null): boolean {
  return userData?.role === "coach" || userData?.role === "manager";
}

// Helper type guard for checking if user is staff (coach or manager)
export function isStaff(userData: FirestoreUserData | null): boolean {
  return userData?.role === "coach" || userData?.role === "manager";
}
