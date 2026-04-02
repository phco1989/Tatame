import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Image,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, AlertCircle, Wifi, Hash, Search } from "lucide-react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { joinWithInviteCode } from "@/lib/join";
import { useTranslations } from "@/lib/i18n";
import { useTenantStore, selectIsNgo } from "@/lib/state/tenant-store";

const { width, height } = Dimensions.get("window");

// ─── Status steps shown under the button while loading ────────────────────────
const JOIN_STEPS = [
  { key: "checking", icon: Search, labelKey: "statusChecking" },
  { key: "connecting", icon: Wifi, labelKey: "statusConnecting" },
  { key: "creating", icon: Hash, labelKey: "statusCreating" },
] as const;

export default function Join() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ role?: string }>();
  const t = useTranslations();

  const role = (params.role === "coach" ? "coach" : "student") as
    | "student"
    | "coach";

  const loadTenantFromFirestore = useTenantStore((s) => s.loadTenantFromFirestore);

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [focused, setFocused] = useState(false);

  // Advance through steps while loading
  useEffect(() => {
    if (!loading) {
      setStepIndex(0);
      return;
    }
    setStepIndex(0);
    const t1 = setTimeout(() => setStepIndex(1), 1200);
    const t2 = setTimeout(() => setStepIndex(2), 2600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [loading]);

  // Glow pulse on focus
  const glowOpacity = useSharedValue(0);
  useEffect(() => {
    if (focused) {
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.4, { duration: 800, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else {
      glowOpacity.value = withTiming(0, { duration: 300 });
    }
  }, [focused]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const handleContinue = async () => {
    setError(null);

    const clean = (code ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(clean)) {
      setError(t.join.invalidCode);
      return;
    }

    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const result = await joinWithInviteCode(clean);

      // Hydrate tenant store so all screens see the correct schoolId immediately
      if (result.schoolId) {
        await loadTenantFromFirestore(result.schoolId);
      }

      if (result.needsEmailSetup) {
        router.replace("/onboarding/create-login");
      } else {
        // loadTenantFromFirestore was awaited above, so the tenant store is fully
        // hydrated with the school's organizationType and featureFlags.
        const isNgoSchool = selectIsNgo(useTenantStore.getState() as any);
        const isOmgManager = isNgoSchool && result.role === "manager";
        const isNgoMember = isNgoSchool && !isOmgManager; // student or coach in NGO
        if (isOmgManager) {
          router.replace("/ong-dashboard");
        } else if (isNgoMember) {
          // NGO students/coaches need personal info + possible guardian consent
          router.replace("/onboarding/ngo-student");
        } else {
          router.replace("/(tabs)");
        }
      }
    } catch (e: any) {
      console.error("[join] error", e);

      const msg = String(e?.message ?? "");
      const errCode = String(e?.code ?? "");

      if (errCode === "auth/invalid-credential" || msg.includes("invalid-credential")) {
        setError("Sign-in failed. Please try again.");
      } else if (errCode === "permission-denied" || msg.includes("Missing or insufficient permissions")) {
        setError(t.join.couldNotJoin);
      } else if (errCode === "unavailable" || msg.toLowerCase().includes("offline")) {
        setError(t.join.noInternet);
      } else if (msg === "invite_not_found" || msg.includes("invalid or you don't have access")) {
        setError(t.join.notFound);
      } else if (msg === "invite_inactive" || msg.includes("inactive")) {
        setError(t.join.deactivated);
      } else {
        setError(t.join.couldNotJoin);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const roleTitle = role === "coach" ? t.nav.coach : t.nav.profile;
  const canContinue = /^[A-Z0-9]{6}$/.test(code.trim().toUpperCase()) && !loading;
  const currentStep = JOIN_STEPS[stepIndex];

  return (
    <View style={styles.container}>
      <View style={styles.imageContainer} pointerEvents="none">
        <Image
          source={require("../../assets/images/bjj-hero-2.png")}
          style={styles.backgroundImage}
          resizeMode="cover"
        />
      </View>

      <View style={styles.overlayContainer} pointerEvents="none">
        <LinearGradient
          colors={["rgba(11,18,32,0.35)", "rgba(11,18,32,0.60)", "rgba(11,18,32,0.92)"]}
          locations={[0, 0.45, 1]}
          style={styles.gradient}
        />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 }]}
      >
        {/* Back */}
        <Pressable onPress={handleBack} style={styles.backButton}>
          <ChevronLeft size={22} color="white" />
          <Text style={styles.backText}>{t.join.back}</Text>
        </Pressable>

        {/* Hero */}
        <Animated.View entering={FadeInDown.delay(80).springify()} style={styles.heroSection}>
          <Text style={styles.title}>
            {t.join.joinAs.replace("{role}", roleTitle)}
          </Text>
          <Text style={styles.subtitle}>{t.join.subtitle}</Text>
        </Animated.View>

        <View style={styles.middleSpacer} />

        {/* Form */}
        <Animated.View entering={FadeInDown.delay(140).springify()} style={styles.formSection}>
          {/* Input + glow */}
          <View style={styles.inputWrapper}>
            {/* Glow ring */}
            <Animated.View style={[styles.inputGlow, glowStyle]} />
            <TextInput
              value={code}
              onChangeText={(v) => {
                setError(null);
                setCode(v.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6));
              }}
              autoCapitalize="characters"
              placeholder={t.join.codePlaceholder}
              placeholderTextColor="rgba(255,255,255,0.35)"
              style={[
                styles.input,
                focused && styles.inputFocused,
                !!error && styles.inputError,
              ]}
              editable={!loading}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
            />
          </View>

          {/* Inline error card */}
          {!!error && (
            <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOut.duration(180)} style={styles.errorCard}>
              <AlertCircle size={16} color="#FCA5A5" style={{ flexShrink: 0 }} />
              <Text style={styles.errorCardText}>{error}</Text>
            </Animated.View>
          )}

          {/* Continue button */}
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && { transform: [{ scale: 0.97 }] },
              !canContinue && styles.buttonDisabled,
            ]}
            onPress={handleContinue}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.primaryButtonText}>{t.join.continue}</Text>
            )}
          </Pressable>

          {/* Status strip */}
          {loading && currentStep && (
            <Animated.View
              key={currentStep.key}
              entering={FadeInDown.duration(300)}
              exiting={FadeOut.duration(200)}
              style={styles.statusStrip}
            >
              <ActivityIndicator size="small" color="rgba(255,255,255,0.55)" />
              <Text style={styles.statusText}>
                {currentStep.labelKey === "statusChecking"
                  ? t.join.statusChecking ?? "Checking code…"
                  : currentStep.labelKey === "statusConnecting"
                  ? t.join.statusConnecting ?? "Connecting to school…"
                  : t.join.statusCreating ?? "Creating profile…"}
              </Text>
            </Animated.View>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220" },
  imageContainer: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 },
  backgroundImage: { width, height },
  overlayContainer: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 1 },
  gradient: { flex: 1 },
  content: { flex: 1, zIndex: 2, paddingHorizontal: 28, justifyContent: "flex-start" },
  backButton: { flexDirection: "row", alignItems: "center", marginBottom: 24 },
  backText: { color: "rgba(255,255,255,0.80)", fontSize: 16, fontWeight: "500", marginLeft: 4 },
  heroSection: { marginBottom: 32 },
  title: {
    fontSize: 40,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -1.2,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 17,
    fontWeight: "400",
    color: "rgba(255,255,255,0.65)",
    lineHeight: 25,
    letterSpacing: -0.1,
  },
  middleSpacer: { flex: 1 },
  formSection: { gap: 12 },

  // Input
  inputWrapper: { position: "relative" },
  inputGlow: {
    position: "absolute",
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: "rgba(76,123,244,0.55)",
  },
  input: {
    width: "100%",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.20)",
    borderRadius: 14,
    paddingVertical: 20,
    paddingHorizontal: 16,
    color: "#FFFFFF",
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: 10,
    textAlign: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  inputFocused: {
    borderColor: "rgba(76,123,244,0.7)",
    backgroundColor: "rgba(76,123,244,0.06)",
  },
  inputError: {
    borderColor: "rgba(239,68,68,0.6)",
    backgroundColor: "rgba(239,68,68,0.06)",
  },

  // Error card
  errorCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "rgba(239,68,68,0.12)",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.25)",
  },
  errorCardText: {
    color: "#FCA5A5",
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },

  // Button
  primaryButton: {
    backgroundColor: "#4C7BF4",
    borderRadius: 16,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#4C7BF4",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.30,
    shadowRadius: 12,
    elevation: 8,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },

  // Status strip
  statusStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingTop: 4,
  },
  statusText: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 14,
    fontWeight: "500",
  },
});
