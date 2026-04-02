// app/manager.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Animated,
  ImageBackground,
  StyleSheet,
  Image,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { doc, getDoc } from "firebase/firestore";
import { auth, db, waitForAuthReady } from "@/lib/firebase-config";

type RouteTarget = "/(tabs)" | "/(tabs)/index" | "/login" | "/create-school";

export default function ManagerOnboarding() {
  const router = useRouter();
  const [checkingExisting, setCheckingExisting] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  // Safe navigation to avoid "navigate before Root Layout mounted"
  const safeReplace = (route: RouteTarget) => {
    requestAnimationFrame(() => {
      try {
        router.replace(route);
      } catch (e) {
        console.error("[manager] router.replace failed:", e);
      }
    });
  };

  const safePush = (route: RouteTarget) => {
    requestAnimationFrame(() => {
      try {
        router.push(route);
      } catch (e) {
        console.error("[manager] router.push failed:", e);
      }
    });
  };

  useEffect(() => {
    let mounted = true;

    const checkAccess = async () => {
      try {
        await waitForAuthReady();

        const user = auth.currentUser;

        if (!mounted) return;

        if (!user) {
          setCheckingExisting(false);
          return;
        }

        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!mounted) return;

        if (!userSnap.exists()) {
          setCheckingExisting(false);
          return;
        }

        const userData = userSnap.data();
        const role = userData?.role;

        // Only managers can access this page
        if (role && role !== "manager") {
          setAccessDenied(true);
          setCheckingExisting(false);
          return;
        }

        // If manager has a school and setupComplete, go to tabs
        if (role === "manager" && userData?.schoolId) {
          const schoolRef = doc(db, "schools", userData.schoolId);
          const schoolSnap = await getDoc(schoolRef);

          if (!mounted) return;

          if (schoolSnap.exists() && schoolSnap.data()?.setupComplete === true) {
            safeReplace("/(tabs)");
            return;
          }
        }

        setCheckingExisting(false);
      } catch (e) {
        console.error("[manager] Error checking access:", e);
        setCheckingExisting(false);
      }
    };

    checkAccess();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  if (checkingExisting) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (accessDenied) {
    return (
      <View style={styles.loadingContainer}>
        <SafeAreaView style={styles.accessDeniedContent}>
          <Text style={styles.accessDeniedTitle}>Access Denied</Text>
          <Text style={styles.accessDeniedText}>
            This page is only available for academy managers.
          </Text>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              safeReplace("/(tabs)/index");
            }}
            style={styles.accessDeniedButton}
          >
            <Text style={styles.accessDeniedButtonText}>Go to Home</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ImageBackground
        // IMPORTANT: keep an image that exists to avoid white-screen crashes.
        // Replace later with tatame-bg.png only after you add the file.
        source={require("../../assets/images/manager-bg.png")}
        resizeMode="cover"
        style={{ flex: 1 }}
      >
        <View style={styles.overlay1} />
        <View style={styles.overlay2} />

        <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
          <Pressable onPress={handleBack} style={styles.backButton}>
            <Text style={styles.backIcon}>{"<"}</Text>
            <Text style={styles.backText}>Back</Text>
          </Pressable>

          <Animated.View
            style={[
              styles.content,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <View style={styles.heroSection}>
              <View style={styles.iconOuterRing}>
                <LinearGradient
                  colors={["#1a6fff", "#0a3fd4", "#0026a8"]}
                  start={{ x: 0.15, y: 0 }}
                  end={{ x: 0.85, y: 1 }}
                  style={styles.iconGradientBg}
                >
                  <Image
                    source={require("../../assets/images/ayon-icon.png")}
                    style={styles.iconImage}
                    resizeMode="contain"
                  />
                </LinearGradient>
              </View>

              <Text style={styles.title}>Academy Manager</Text>

              <Text style={styles.subtitle}>
                Run your Jiu-Jitsu academy with tools for classes, students, belt
                tracking, and payments.
              </Text>
            </View>

            <View style={styles.featuresCard}>
              {[
                { icon: "◎", text: "Full academy control" },
                { icon: "⛓", text: "Manage coaches & students" },
                { icon: "▦", text: "Track belts & attendance" },
              ].map((item, index) => (
                <View
                  key={index}
                  style={[styles.featureRow, index < 2 && { marginBottom: 16 }]}
                >
                  <View style={styles.featureIcon}>
                    <Text style={styles.featureIconText}>{item.icon}</Text>
                  </View>
                  <Text style={styles.featureText}>{item.text}</Text>
                </View>
              ))}
            </View>

            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                safePush("/login");
              }}
              style={styles.signInButton}
            >
              <Text style={styles.signInButtonText}>
                Sign In (Email & Password)
              </Text>
            </Pressable>

            <Text style={styles.signInHint}>
              For managers who already created an academy.
            </Text>

            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                safePush("/create-school");
              }}
              style={styles.createSchoolButton}
            >
              <Text style={styles.createSchoolButtonText}>+</Text>
              <Text style={styles.createSchoolButtonLabel}>Create Academy</Text>
            </Pressable>

            <Text style={styles.createSchoolHint}>
              For new managers setting up Tatame.
            </Text>
          </Animated.View>
        </SafeAreaView>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#071018",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: { marginTop: 12, color: "#fff", fontSize: 16, opacity: 0.8 },
  accessDeniedContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  accessDeniedTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 12,
  },
  accessDeniedText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 24,
  },
  accessDeniedButton: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  accessDeniedButtonText: {
    color: "#071018",
    fontSize: 16,
    fontWeight: "600",
  },
  overlay1: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.10)",
  },
  overlay2: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  backButton: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 12 },
  backIcon: { color: "white", fontSize: 24, fontWeight: "700" },
  backText: { color: "white", fontSize: 16, marginLeft: 4 },
  content: { flex: 1, paddingHorizontal: 24, justifyContent: "center", paddingBottom: 32 },
  heroSection: { alignItems: "center", marginBottom: 32 },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  iconOuterRing: {
    width: 100,
    height: 100,
    borderRadius: 26,
    marginBottom: 24,
    padding: 2.5,
    backgroundColor: "rgba(80,160,255,0.35)",
    borderWidth: 1.5,
    borderColor: "rgba(100,180,255,0.55)",
    shadowColor: "#1a6fff",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.7,
    shadowRadius: 20,
    elevation: 12,
  },
  iconGradientBg: {
    flex: 1,
    borderRadius: 22,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  iconImage: {
    width: "100%",
    height: "100%",
  },
  iconText: { fontSize: 48, color: "white", fontWeight: "700" },
  title: { color: "white", fontSize: 30, fontWeight: "700", textAlign: "center" },
  subtitle: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 16,
    textAlign: "center",
    marginTop: 12,
    paddingHorizontal: 16,
    lineHeight: 24,
  },
  featuresCard: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 32,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  featureRow: { flexDirection: "row", alignItems: "center" },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  featureIconText: { color: "white", fontSize: 18, fontWeight: "700" },
  featureText: { color: "white", fontSize: 16, flex: 1 },
  signInButton: {
    backgroundColor: "white",
    borderRadius: 16,
    paddingVertical: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
  },
  signInButtonText: { color: "#111827", textAlign: "center", fontSize: 18, fontWeight: "700" },
  signInHint: { color: "rgba(255,255,255,0.7)", textAlign: "center", fontSize: 14, marginTop: 8, paddingHorizontal: 16 },
  createSchoolButton: {
    marginTop: 20,
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.9)",
  },
  createSchoolButtonText: { color: "white", fontSize: 20, fontWeight: "700" },
  createSchoolButtonLabel: { color: "white", textAlign: "center", fontSize: 18, fontWeight: "700", marginLeft: 8 },
  createSchoolHint: { color: "rgba(255,255,255,0.7)", textAlign: "center", fontSize: 14, marginTop: 8, paddingHorizontal: 16 },
});
