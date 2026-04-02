import React, { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { Stack } from "expo-router";
import { useLanguageStore } from "@/lib/i18n";
import { bootstrapTenant } from "@/lib/bootstrapTenant";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase-config";

export default function RootLayout() {
  const hasHydrated = useLanguageStore((s) => s.hasHydrated);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    // Run once on mount for the current auth state
    bootstrapTenant();

    // Re-run whenever auth changes (sign in, sign out, anonymous → real user)
    const unsub = onAuthStateChanged(auth, () => {
      bootstrapTenant();
    });

    return unsub;
  }, []);

  useEffect(() => {
    // Fallback: if hydration hasn't completed in 2s, unblock rendering anyway
    if (hasHydrated) return;
    const timer = setTimeout(() => setTimedOut(true), 2000);
    return () => clearTimeout(timer);
  }, [hasHydrated]);

  if (!hasHydrated && !timedOut) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000000", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color="#FFFFFF" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false, animation: "none" }} />
    </View>
  );
}
