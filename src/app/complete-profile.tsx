import React, { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Dimensions,
  Image,
  StatusBar,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  User,
  Phone,
  AlertCircle,
  CheckCircle,
  ChevronLeft,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { doc, updateDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { auth, db, waitForAuthReady } from "@/lib/firebase-config";
import { useTenantStore, selectIsNgo, selectTenantHydrated } from "@/lib/state/tenant-store";
import { resolvePostLoginRoute } from "@/lib/routeAfterLogin";
import { useTranslations } from "@/lib/i18n";

const { width, height } = Dimensions.get("window");

export default function CompleteProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<"student" | "coach">("student");
  const tr = useTranslations();
  const cp = tr.completeProfile;

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

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

  // Check if user is authenticated and get their role
  useEffect(() => {
    const checkUser = async () => {
      try {
        await waitForAuthReady();
        const user = auth.currentUser;

        if (!user) {
          router.replace("/welcome");
          return;
        }

        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          router.replace("/welcome");
          return;
        }

        const userData = userSnap.data();
        setRole(userData.role || "student");

        if (userData.profileComplete) {
          // User already has a complete profile — load tenant then route correctly.
          // We must load the school doc (not user doc) because only the school has
          // organizationType: "ngo". ONG students/coaches who joined via invite won't
          // have that field on their user doc, causing wrong routing if we rely on it.
          if (userData.schoolId) {
            await useTenantStore.getState().loadTenantFromFirestore(userData.schoolId);
          }
          const isNgo = selectIsNgo(useTenantStore.getState() as any);
          router.replace(resolvePostLoginRoute(isNgo, userData.role ?? null) as any);
          return;
        }

        if (userData.schoolId) {
          useTenantStore.getState().loadTenantFromFirestore(userData.schoolId);
        }
      } catch (e) {
        console.error("[CompleteProfile] Auth check error:", e);
      } finally {
        setCheckingAuth(false);
      }
    };

    checkUser();
  }, []);

  const handleSaveProfile = async () => {
    if (!fullName.trim()) {
      setError(cp.enterFullName);
      return;
    }

    setLoading(true);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const user = auth.currentUser;
      if (!user) {
        setError(cp.notAuthenticated);
        return;
      }

      const userRef = doc(db, "users", user.uid);

      await updateDoc(userRef, {
        fullName: fullName.trim(),
        name: fullName.trim(),
        phone: phone.trim() || null,
        profileComplete: true,
        updatedAt: serverTimestamp(),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Tenant was loaded from schoolId in checkUser above.
      // `role` state was set from userData.role during the checkUser phase.
      const isNgo = selectIsNgo(useTenantStore.getState() as any);
      router.replace(resolvePostLoginRoute(isNgo, role) as any);
    } catch (e: any) {
      console.error("[CompleteProfile] Save error:", e);

      if (e.code === "unavailable" || e.message?.includes("offline")) {
        setError(cp.noInternet);
      } else {
        setError(cp.somethingWrong);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const accentColor = role === "coach" ? "#10B981" : "#06B6D4";

  if (checkingAuth) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.imageContainer} pointerEvents="none">
          <Image
            source={require("../../assets/images/bjj-hero-2.png")}
            style={styles.backgroundImage}
            resizeMode="cover"
          />
        </View>
        <View style={styles.overlayContainer} pointerEvents="none">
          <LinearGradient
            colors={["rgba(0,0,0,0.15)", "rgba(0,0,0,0.35)", "rgba(0,0,0,0.55)"]}
            locations={[0, 0.5, 1]}
            style={styles.gradient}
          />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", zIndex: 2 }}>
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      {/* Background Image */}
      <View style={styles.imageContainer} pointerEvents="none">
        <Image
          source={require("../../assets/images/bjj-hero-2.png")}
          style={styles.backgroundImage}
          resizeMode="cover"
        />
      </View>

      {/* Lighter gradient overlay */}
      <View style={styles.overlayContainer} pointerEvents="none">
        <LinearGradient
          colors={[
            "rgba(0,0,0,0.15)",
            "rgba(0,0,0,0.35)",
            "rgba(0,0,0,0.60)",
            "rgba(0,0,0,0.82)",
          ]}
          locations={[0, 0.3, 0.65, 1]}
          style={styles.gradient}
        />
      </View>

      {/* Content */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1 }}
        >
          {/* Back Button */}
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ChevronLeft size={24} color="white" />
            <Text style={styles.backText}>{tr.common.back}</Text>
          </Pressable>

          {/* Hero */}
          <View style={styles.heroSection}>
            <View style={[styles.iconCircle, { backgroundColor: `${accentColor}33` }]}>
              <User size={36} color={accentColor} />
            </View>
            <Text style={styles.title}>{cp.title}</Text>
            <Text style={styles.subtitle}>{cp.subtitle}</Text>
          </View>

          <View style={{ flex: 1, minHeight: 40 }} />

          {/* Form */}
          <Animated.View
            style={{
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
              gap: 14,
            }}
          >
            {/* Full Name Input */}
            <View style={styles.inputWrapper}>
              <User size={18} color="rgba(255,255,255,0.55)" style={{ marginLeft: 16 }} />
              <TextInput
                value={fullName}
                onChangeText={(text) => { setFullName(text); setError(null); }}
                placeholder={cp.fullNamePlaceholder}
                placeholderTextColor="rgba(255,255,255,0.40)"
                autoCapitalize="words"
                autoCorrect={false}
                editable={!loading}
                style={styles.input}
              />
            </View>

            {/* Phone Input */}
            <View style={styles.inputWrapper}>
              <Phone size={18} color="rgba(255,255,255,0.55)" style={{ marginLeft: 16 }} />
              <TextInput
                value={phone}
                onChangeText={(text) => { setPhone(text); setError(null); }}
                placeholder={cp.phonePlaceholder}
                placeholderTextColor="rgba(255,255,255,0.40)"
                keyboardType="phone-pad"
                editable={!loading}
                style={styles.input}
              />
            </View>

            {/* Error */}
            {error && (
              <View style={styles.errorBox}>
                <AlertCircle size={16} color="#EF4444" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* CTA Button */}
            <Pressable
              onPress={handleSaveProfile}
              disabled={loading || !fullName.trim()}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
                (loading || !fullName.trim()) && { opacity: 0.55 },
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#0B1220" />
              ) : (
                <>
                  <CheckCircle size={20} color="#0B1220" />
                  <Text style={styles.primaryButtonText}>{cp.completeSetup}</Text>
                </>
              )}
            </Pressable>

            {/* Footer note */}
            <Text style={styles.footerNote}>{cp.footer}</Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B1220",
  },
  imageContainer: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 0,
  },
  backgroundImage: {
    width,
    height,
  },
  overlayContainer: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 1,
  },
  gradient: {
    flex: 1,
  },
  content: {
    flex: 1,
    zIndex: 2,
    paddingHorizontal: 28,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 28,
  },
  backText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "500",
    marginLeft: 4,
  },
  heroSection: {
    marginBottom: 8,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  title: {
    fontSize: 36,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: -1,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: "400",
    color: "rgba(255,255,255,0.75)",
    lineHeight: 24,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    backgroundColor: "#1F2937",
  },
  input: {
    flex: 1,
    paddingVertical: 18,
    paddingHorizontal: 12,
    color: "rgba(255,255,255,0.95)",
    fontSize: 16,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(239,68,68,0.12)",
    padding: 12,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.2)",
  },
  errorText: {
    color: "#EF4444",
    fontSize: 14,
    flex: 1,
  },
  primaryButton: {
    backgroundColor: "#FBBF24",
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  primaryButtonPressed: {
    backgroundColor: "rgba(251,191,36,0.85)",
    transform: [{ scale: 0.98 }],
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#0B1220",
    letterSpacing: -0.2,
  },
  footerNote: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 13,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 16,
  },
});
