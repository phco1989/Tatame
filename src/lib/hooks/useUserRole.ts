import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase-config";

type Role = "manager" | "coach" | "student" | null;

export function useUserRole() {
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<Role>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setRole(null);
        setSchoolId(null);
        setLoading(false);
        return;
      }

      try {
        const snap = await getDoc(doc(db, "users", user.uid));

        if (snap.exists()) {
          const data = snap.data();
          setRole(data.role ?? null);
          setSchoolId(data.schoolId ?? null);
        } else {
          setRole(null);
          setSchoolId(null);
        }
      } catch (err) {
        console.warn("Failed to load user role:", err);
        setRole(null);
        setSchoolId(null);
      } finally {
        setLoading(false);
      }
    });

    return unsub;
  }, []);

  return { loading, role, schoolId };
}
