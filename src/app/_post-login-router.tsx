// app/_post-login-router.tsx
// Fallback router — not the primary routing path. The main routing is handled
// by index.tsx (app start) and each auth screen (signin.tsx, ong-onboarding.tsx,
// join.tsx) which route directly after login. This screen is a safety net used
// only when navigated to explicitly (e.g., after edge-case recovery).
import React, { useEffect, useRef } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { auth, db } from "@/lib/firebase-config";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useTenantStore, selectIsNgo } from "@/lib/state/tenant-store";
import { resolvePostLoginRoute } from "@/lib/routeAfterLogin";

const VALID_ROLES = new Set(["manager", "coach", "student"]);

export default function PostLoginRouter() {
  const router = useRouter();
  const routedRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const safeReplace = (route: string) => {
      if (routedRef.current) return;
      routedRef.current = true;
      animationFrameRef.current = requestAnimationFrame(() => {
        router.replace(route as any);
      });
    };

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (routedRef.current) return;

      try {
        if (!user) {
          safeReplace("/welcome");
          return;
        }

        const userSnap = await getDoc(doc(db, "users", user.uid));
        if (!userSnap.exists()) {
          safeReplace("/complete-profile");
          return;
        }

        const data = userSnap.data() || {};
        const role = String(data.role || "");
        const schoolId = String(data.schoolId || "");

        if (!VALID_ROLES.has(role)) {
          safeReplace("/complete-profile");
          return;
        }

        // Load tenant so selectIsNgo reflects the school's organizationType.
        // This ensures ONG users land on /ong-dashboard, not /(tabs) or /manager.
        if (schoolId) {
          await useTenantStore.getState().loadTenantFromFirestore(schoolId);
        }

        const isNgo = selectIsNgo(useTenantStore.getState() as any);
        safeReplace(resolvePostLoginRoute(isNgo, role));
      } catch (e) {
        if (!routedRef.current) {
          safeReplace("/welcome");
        }
      }
    });

    const t = setTimeout(() => {
      if (!routedRef.current) {
        safeReplace("/welcome");
      }
    }, 4000);

    return () => {
      clearTimeout(t);
      unsub();
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator color="#FFFFFF" />
      <Text style={styles.text}>Carregando…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#071018",
  },
  text: { marginTop: 10, opacity: 0.8, color: "#fff" },
});
