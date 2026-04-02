import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase-config";
import { setUserId } from "@/lib/revenuecatClient";
import { useTenantStore } from "@/lib/state/tenant-store";

export type UserRole = "manager" | "coach" | "student" | null;

export interface CurrentUser {
  uid: string | null;
  role: UserRole;
  schoolId: string | null;
  loading: boolean;
}

export function useCurrentUser(): CurrentUser {
  const [uid, setUid] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubSnap: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
  if (unsubSnap) {
    unsubSnap();
    unsubSnap = null;
  }

  if (!user) {
    setUid(null);
    setRole(null);
    setSchoolId(null);
    setLoading(false);
    return;
  }

  await setUserId(user.uid);
  useTenantStore.getState().refreshSubscriptionStatus();
  setUid(user.uid);

  unsubSnap = onSnapshot(
    doc(db, "users", user.uid),
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setRole((data.role as UserRole) ?? null);
        setSchoolId(data.schoolId ?? null);
      } else {
        setRole(null);
        setSchoolId(null);
      }
      setLoading(false);
    },
    (err) => {
      console.warn("[useCurrentUser] Firestore error:", err);
      setRole(null);
      setSchoolId(null);
      setLoading(false);
    }
  );
});

    return () => {
      unsubAuth();
      if (unsubSnap) unsubSnap();
    };
  }, []);

  return { uid, role, schoolId, loading };
}
