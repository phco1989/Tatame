// app/index.tsx — auth gate, no Firestore reads
import React, { useEffect, useState } from "react";
import { View, Text, Image, Dimensions, StyleSheet, ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase-config";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTenantStore, selectIsNgo, selectTenantHydrated, selectCurrentUserRole } from "@/lib/state/tenant-store";
import { resolvePostLoginRoute } from "@/lib/routeAfterLogin";

const { width, height } = Dimensions.get("window");

export default function Index() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const insets = useSafeAreaInsets();

  // Read from persisted Zustand store (populated from AsyncStorage on launch).
  // ONG users are routed to their dedicated dashboard; academy users go to tabs.
  const isNgo = useTenantStore(selectIsNgo);
  const currentUserRole = useTenantStore(selectCurrentUserRole);
  // CRITICAL: Wait for bootstrapTenant to finish before routing.
  // Without this check, onAuthStateChanged fires (setReady=true) before
  // bootstrapTenant completes loading the tenant from Firestore. On first
  // login the tenant store is empty → isNgo=false → ONG users land on /(tabs).
  const tenantHydrated = useTenantStore(selectTenantHydrated);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setSignedIn(!!user);
      setReady(true);
    });
    return unsub;
  }, []);

  if (ready) {
    if (!signedIn) return <Redirect href="/welcome" />;
    // Signed in but bootstrapTenant hasn't finished yet — show branded splash
    // so we never route with a stale (empty) tenant store.
    if (!tenantHydrated) {      return (
        <View style={styles.container}>
          <View style={styles.imageContainer} pointerEvents="none">
            <Image
              source={require("../../assets/images/bjj-hero.png")}
              style={styles.backgroundImage}
              resizeMode="cover"
            />
          </View>
          <View style={styles.overlayContainer} pointerEvents="none">
            <LinearGradient
              colors={["rgba(0,0,0,0.68)", "rgba(0,0,0,0.18)", "rgba(0,0,0,0.18)", "rgba(0,0,0,0.82)"]}
              locations={[0, 0.28, 0.58, 1]}
              style={styles.gradient}
            />
          </View>
          <View style={[styles.content, { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 40 }]}>
            <View style={styles.heroSection}>
              <Text style={styles.title}>TATAME</Text>
              <View style={styles.wordmarkDivider} />
              <Text style={styles.positioning}>The BJJ Management Platform</Text>
            </View>
            <ActivityIndicator color="rgba(255,255,255,0.5)" style={{ marginTop: 48 }} />
          </View>
        </View>
      );
    }
    return <Redirect href={resolvePostLoginRoute(isNgo, currentUserRole) as any} />;
  }

  // Branded splash while Firebase resolves auth state
  return (
    <View style={styles.container}>
      <View style={styles.imageContainer} pointerEvents="none">
        <Image
          source={require("../../assets/images/bjj-hero.png")}
          style={styles.backgroundImage}
          resizeMode="cover"
        />
      </View>
      <View style={styles.overlayContainer} pointerEvents="none">
        <LinearGradient
          colors={[
            "rgba(0,0,0,0.68)",
            "rgba(0,0,0,0.18)",
            "rgba(0,0,0,0.18)",
            "rgba(0,0,0,0.82)",
          ]}
          locations={[0, 0.28, 0.58, 1]}
          style={styles.gradient}
        />
      </View>
      <View
        style={[
          styles.content,
          { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 40 },
        ]}
      >
        <View style={styles.heroSection}>
          <Text style={styles.title}>TATAME</Text>
          <View style={styles.wordmarkDivider} />
          <Text style={styles.positioning}>The BJJ Management Platform</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  imageContainer: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 0,
  },
  backgroundImage: { width, height },
  overlayContainer: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 1,
  },
  gradient: { flex: 1 },
  content: { flex: 1, zIndex: 2, paddingHorizontal: 28, justifyContent: "flex-start" },
  heroSection: { alignItems: "center" },
  title: {
    fontSize: 52,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 8,
    textAlign: "center",
    textTransform: "uppercase",
    marginBottom: 14,
  },
  wordmarkDivider: {
    width: 120,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.20)",
    alignSelf: "center",
    marginBottom: 14,
  },
  positioning: {
    fontSize: 15,
    fontWeight: "500",
    color: "rgba(255,255,255,0.75)",
    textAlign: "center",
    letterSpacing: 0.1,
  },
});
