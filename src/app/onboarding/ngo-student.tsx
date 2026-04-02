import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Dimensions,
  Image,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { User, AlertCircle } from "lucide-react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { doc, updateDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { auth, db, waitForAuthReady } from "@/lib/firebase-config";
import { useTenantStore, selectIsNgo } from "@/lib/state/tenant-store";
import { resolvePostLoginRoute } from "@/lib/routeAfterLogin";

const { width, height } = Dimensions.get("window");

function calculateAge(day: string, month: string, year: string): number {
  const d = parseInt(day, 10);
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);
  if (isNaN(d) || isNaN(m) || isNaN(y)) return -1;
  const birth = new Date(y, m - 1, d);
  if (
    birth.getFullYear() !== y ||
    birth.getMonth() !== m - 1 ||
    birth.getDate() !== d
  ) return -1; // invalid date (e.g. 31/02)
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export default function NgoStudentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [fullName, setFullName] = useState("");
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<string>("student");
  const [schoolId, setSchoolId] = useState<string>("");

  const monthRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);

  // Guard: redirect if user shouldn't be here
  useEffect(() => {
    const check = async () => {
      try {
        await waitForAuthReady();
        const user = auth.currentUser;
        if (!user) { router.replace("/welcome"); return; }

        const snap = await getDoc(doc(db, "users", user.uid));
        if (!snap.exists()) { router.replace("/welcome"); return; }

        const data = snap.data();

        // Already completed onboarding
        if (data.profileComplete === true) {
          if (data.schoolId) {
            await useTenantStore.getState().loadTenantFromFirestore(data.schoolId);
          }
          const isNgo = selectIsNgo(useTenantStore.getState() as any);
          router.replace(resolvePostLoginRoute(isNgo, data.role ?? null) as any);
          return;
        }

        // Guardian consent pending — skip to pending screen
        if (data.status === "pending_consent") {
          router.replace("/onboarding/ngo-pending");
          return;
        }

        setRole(data.role ?? "student");
        setSchoolId(data.schoolId ?? "");
      } catch (e) {
        console.error("[NgoStudent] check error", e);
      } finally {
        setChecking(false);
      }
    };
    check();
  }, []);

  const validate = (): string | null => {
    if (!fullName.trim()) return "Full legal name is required.";
    if (fullName.trim().split(" ").length < 2)
      return "Please enter your full name (first and last).";
    if (!day || !month || !year)
      return "Please enter your complete date of birth.";
    const age = calculateAge(day, month, year);
    if (age === -1) return "Please enter a valid date of birth.";
    const currentYear = new Date().getFullYear();
    if (parseInt(year, 10) < 1900 || parseInt(year, 10) > currentYear)
      return "Please enter a valid birth year.";
    if (age < 5) return "Please enter a valid date of birth.";
    if (age > 100) return "Please enter a valid date of birth.";
    return null;
  };

  const handleNext = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    setLoading(true);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const user = auth.currentUser;
      if (!user) { router.replace("/welcome"); return; }

      const age = calculateAge(day, month, year);
      const isMinor = age < 18;
      const birthdate = `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      const trimmedName = fullName.trim();

      if (!isMinor) {
        // Adult: complete profile now
        await updateDoc(doc(db, "users", user.uid), {
          fullName: trimmedName,
          name: trimmedName,
          birthdate,
          profileComplete: true,
          status: "active",
          updatedAt: serverTimestamp(),
        });

        if (schoolId) {
          await useTenantStore.getState().loadTenantFromFirestore(schoolId);
        }
        useTenantStore.getState().setCurrentUserStatus("active");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const isNgo = selectIsNgo(useTenantStore.getState() as any);
        router.replace(resolvePostLoginRoute(isNgo, role) as any);
      } else {
        // Minor: write partial info, proceed to guardian
        await updateDoc(doc(db, "users", user.uid), {
          fullName: trimmedName,
          name: trimmedName,
          birthdate,
          updatedAt: serverTimestamp(),
        });

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push({
          pathname: "/onboarding/ngo-guardian",
          params: { fullName: trimmedName, birthdate },
        });
      }
    } catch (e: any) {
      console.error("[NgoStudent] submit error", e);
      setError("Something went wrong. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const accentColor = role === "coach" ? "#10B981" : "#38BDF8";

  if (checking) {
    return (
      <View style={styles.container}>
        <BgImage />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", zIndex: 2 }}>
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <BgImage />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1, zIndex: 2 }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 40 },
          ]}
        >
          {/* Step label */}
          <Text style={styles.stepLabel}>PERSONAL INFORMATION</Text>

          {/* Header */}
          <Animated.View entering={FadeInDown.delay(60).springify()} style={styles.header}>
            <View style={[styles.iconWrap, { borderColor: `${accentColor}44` }]}>
              <User size={28} color={accentColor} />
            </View>
            <Text style={styles.title}>Your Registration</Text>
            <Text style={styles.subtitle}>
              This information will be kept on record for compliance and
              emergency purposes. Please use your legal name.
            </Text>
          </Animated.View>

          {/* Form */}
          <Animated.View entering={FadeInDown.delay(120).springify()} style={styles.form}>
            {/* Full name */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Full Legal Name</Text>
              <TextInput
                value={fullName}
                onChangeText={(v) => { setFullName(v); setError(null); }}
                placeholder="First and last name"
                placeholderTextColor="rgba(255,255,255,0.30)"
                autoCapitalize="words"
                autoCorrect={false}
                editable={!loading}
                style={styles.input}
              />
            </View>

            {/* Date of birth */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Date of Birth</Text>
              <View style={styles.dobRow}>
                <View style={[styles.dobInputWrap, { flex: 1 }]}>
                  <TextInput
                    value={day}
                    onChangeText={(v) => {
                      const n = v.replace(/\D/g, "").slice(0, 2);
                      setDay(n);
                      setError(null);
                      if (n.length === 2) monthRef.current?.focus();
                    }}
                    placeholder="DD"
                    placeholderTextColor="rgba(255,255,255,0.30)"
                    keyboardType="number-pad"
                    maxLength={2}
                    editable={!loading}
                    style={[styles.input, styles.dobInput]}
                  />
                </View>
                <Text style={styles.dobSep}>/</Text>
                <View style={[styles.dobInputWrap, { flex: 1 }]}>
                  <TextInput
                    ref={monthRef}
                    value={month}
                    onChangeText={(v) => {
                      const n = v.replace(/\D/g, "").slice(0, 2);
                      setMonth(n);
                      setError(null);
                      if (n.length === 2) yearRef.current?.focus();
                    }}
                    placeholder="MM"
                    placeholderTextColor="rgba(255,255,255,0.30)"
                    keyboardType="number-pad"
                    maxLength={2}
                    editable={!loading}
                    style={[styles.input, styles.dobInput]}
                  />
                </View>
                <Text style={styles.dobSep}>/</Text>
                <View style={[styles.dobInputWrap, { flex: 2 }]}>
                  <TextInput
                    ref={yearRef}
                    value={year}
                    onChangeText={(v) => {
                      setYear(v.replace(/\D/g, "").slice(0, 4));
                      setError(null);
                    }}
                    placeholder="YYYY"
                    placeholderTextColor="rgba(255,255,255,0.30)"
                    keyboardType="number-pad"
                    maxLength={4}
                    editable={!loading}
                    style={[styles.input, styles.dobInput]}
                  />
                </View>
              </View>
            </View>

            {/* Error */}
            {!!error && (
              <Animated.View entering={FadeInDown.duration(200)} style={styles.errorBox}>
                <AlertCircle size={15} color="#EF4444" />
                <Text style={styles.errorText}>{error}</Text>
              </Animated.View>
            )}

            {/* Legal note */}
            <Text style={styles.legalNote}>
              If you are under 18, guardian consent will be required before
              your account is activated.
            </Text>

            {/* CTA */}
            <Pressable
              onPress={handleNext}
              disabled={loading}
              style={({ pressed }) => [
                styles.btn,
                pressed && styles.btnPressed,
                loading && styles.btnDisabled,
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#0B1220" />
              ) : (
                <Text style={styles.btnText}>Continue</Text>
              )}
            </Pressable>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function BgImage() {
  return (
    <>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Image
          source={require("../../../assets/images/bjj-hero-2.png")}
          style={{ width, height }}
          resizeMode="cover"
        />
      </View>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient
          colors={["rgba(11,18,32,0.25)", "rgba(11,18,32,0.65)", "rgba(11,18,32,0.97)"]}
          locations={[0, 0.45, 1]}
          style={{ flex: 1 }}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220" },
  scroll: { paddingHorizontal: 28, flexGrow: 1 },
  stepLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.40)",
    letterSpacing: 1.8,
    textTransform: "uppercase",
    marginBottom: 20,
  },
  header: { marginBottom: 36 },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 34,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: -0.8,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: "400",
    color: "rgba(255,255,255,0.65)",
    lineHeight: 22,
  },
  form: { gap: 20 },
  fieldGroup: { gap: 8 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.55)",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: "#1C2534",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    color: "#FFFFFF",
    fontSize: 16,
  },
  dobRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dobInputWrap: {},
  dobInput: { textAlign: "center" },
  dobSep: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 20,
    fontWeight: "300",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(239,68,68,0.10)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.20)",
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  errorText: { color: "#EF4444", fontSize: 14, flex: 1 },
  legalNote: {
    fontSize: 13,
    color: "rgba(255,255,255,0.40)",
    lineHeight: 19,
    borderLeftWidth: 2,
    borderLeftColor: "rgba(255,255,255,0.12)",
    paddingLeft: 12,
  },
  btn: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
    marginTop: 4,
  },
  btnPressed: { backgroundColor: "rgba(255,255,255,0.88)", transform: [{ scale: 0.98 }] },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontSize: 17, fontWeight: "600", color: "#0B1220", letterSpacing: -0.2 },
});
