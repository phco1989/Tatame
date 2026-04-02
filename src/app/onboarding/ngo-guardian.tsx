import React, { useEffect, useState } from "react";
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
import { useRouter, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Shield, AlertCircle } from "lucide-react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";
import { auth, db, waitForAuthReady } from "@/lib/firebase-config";
import { useTenantStore } from "@/lib/state/tenant-store";

const { width, height } = Dimensions.get("window");

const RELATIONSHIPS = ["Father", "Mother", "Legal Guardian", "Other"] as const;
type Relationship = (typeof RELATIONSHIPS)[number];

export default function NgoGuardianScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ fullName: string; birthdate: string }>();

  const [guardianName, setGuardianName] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [relationship, setRelationship] = useState<Relationship | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect if missing params (navigated here incorrectly)
  useEffect(() => {
    if (!params.fullName || !params.birthdate) {
      router.replace("/onboarding/ngo-student");
    }
  }, []);

  const validate = (): string | null => {
    if (!guardianName.trim()) return "Guardian full name is required.";
    if (guardianName.trim().split(" ").length < 2)
      return "Please enter the guardian's full name.";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(guardianEmail.trim()))
      return "Please enter a valid guardian email address.";
    if (!guardianPhone.trim()) return "Guardian phone number is required.";
    if (!relationship) return "Please select your relationship to this athlete.";
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      setError(err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    setLoading(true);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await waitForAuthReady();
      const user = auth.currentUser;
      if (!user) { router.replace("/welcome"); return; }

      const userSnap = await getDoc(doc(db, "users", user.uid));
      if (!userSnap.exists()) { router.replace("/welcome"); return; }

      const userData = userSnap.data();
      const schoolId: string = userData.schoolId ?? "";

      // Get school name for the consent record
      let schoolName = "";
      if (schoolId) {
        const schoolSnap = await getDoc(doc(db, "schools", schoolId));
        if (schoolSnap.exists()) {
          schoolName = schoolSnap.data().name ?? "";
        }
        // Ensure tenant is loaded
        const store = useTenantStore.getState();
        if (!store.tenant) {
          await store.loadTenantFromFirestore(schoolId);
        }
        schoolName = schoolName || useTenantStore.getState().tenant?.name || schoolId;
      }

      // Write guardian_consents document
      await addDoc(collection(db, "guardian_consents"), {
        userId: user.uid,
        schoolId,
        schoolNameAtConsent: schoolName,
        inviteCode: userData.inviteCode ?? "",
        guardianName: guardianName.trim(),
        guardianEmail: guardianEmail.trim().toLowerCase(),
        guardianPhone: guardianPhone.trim(),
        guardianRelationship: relationship,
        consentType: "minor_participation",
        status: "pending",
        requestedAt: serverTimestamp(),
        approvedAt: null,
        revokedAt: null,
        consentVersion: "v1_minor_participation",
        userNameAtConsent: params.fullName ?? userData.fullName ?? "",
        userBirthdate: params.birthdate ?? userData.birthdate ?? "",
        createdBySystem: true,
      });

      // Activate immediately — consent is captured for audit, not for gating
      await updateDoc(doc(db, "users", user.uid), {
        status: "active",
        profileComplete: true,
        guardianConsentRequired: true,
        guardianConsentReceived: false,
        updatedAt: serverTimestamp(),
      });

      useTenantStore.getState().setCurrentUserStatus("active");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (e: any) {
      console.error("[NgoGuardian] submit error", e);
      setError("Something went wrong. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

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
          <Text style={styles.stepLabel}>GUARDIAN CONSENT — STEP 2 OF 2</Text>

          {/* Header */}
          <Animated.View entering={FadeInDown.delay(60).springify()} style={styles.header}>
            <View style={styles.iconWrap}>
              <Shield size={28} color="#F59E0B" />
            </View>
            <Text style={styles.title}>Guardian Information</Text>
            <Text style={styles.subtitle}>
              Because this registration is for a minor, we collect guardian
              information for safety and consent records. Your guardian will be
              notified and their details stored securely for emergency contact.
            </Text>
          </Animated.View>

          {/* Form */}
          <Animated.View entering={FadeInDown.delay(120).springify()} style={styles.form}>
            {/* Guardian name */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Guardian Full Name</Text>
              <TextInput
                value={guardianName}
                onChangeText={(v) => { setGuardianName(v); setError(null); }}
                placeholder="First and last name"
                placeholderTextColor="rgba(255,255,255,0.30)"
                autoCapitalize="words"
                autoCorrect={false}
                editable={!loading}
                style={styles.input}
              />
            </View>

            {/* Guardian email */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Guardian Email</Text>
              <TextInput
                value={guardianEmail}
                onChangeText={(v) => { setGuardianEmail(v); setError(null); }}
                placeholder="guardian@email.com"
                placeholderTextColor="rgba(255,255,255,0.30)"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
                style={styles.input}
              />
            </View>

            {/* Guardian phone */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Guardian Phone</Text>
              <TextInput
                value={guardianPhone}
                onChangeText={(v) => { setGuardianPhone(v); setError(null); }}
                placeholder="+1 (555) 000-0000"
                placeholderTextColor="rgba(255,255,255,0.30)"
                keyboardType="phone-pad"
                editable={!loading}
                style={styles.input}
              />
            </View>

            {/* Relationship */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Relationship to Athlete</Text>
              <View style={styles.chipRow}>
                {RELATIONSHIPS.map((r) => (
                  <Pressable
                    key={r}
                    onPress={() => { setRelationship(r); setError(null); }}
                    style={[styles.chip, relationship === r && styles.chipActive]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        relationship === r && styles.chipTextActive,
                      ]}
                    >
                      {r}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Error */}
            {!!error && (
              <Animated.View entering={FadeInDown.duration(200)} style={styles.errorBox}>
                <AlertCircle size={15} color="#EF4444" />
                <Text style={styles.errorText}>{error}</Text>
              </Animated.View>
            )}

            {/* Disclosure */}
            <View style={styles.disclosure}>
              <Text style={styles.disclosureText}>
                By submitting this form, you confirm that you are the legal
                parent or guardian of the registered minor and authorize their
                participation in the program. Guardian contact information will
                be used solely for consent and emergency communication purposes.
              </Text>
            </View>

            {/* CTA */}
            <Pressable
              onPress={handleSubmit}
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
                <Text style={styles.btnText}>Complete Registration</Text>
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
  header: { marginBottom: 32 },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.35)",
    backgroundColor: "rgba(245,158,11,0.08)",
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
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  chipActive: {
    borderColor: "#F59E0B",
    backgroundColor: "rgba(245,158,11,0.12)",
  },
  chipText: { fontSize: 14, fontWeight: "500", color: "rgba(255,255,255,0.60)" },
  chipTextActive: { color: "#F59E0B", fontWeight: "600" },
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
  disclosure: {
    borderLeftWidth: 2,
    borderLeftColor: "rgba(245,158,11,0.30)",
    paddingLeft: 14,
    paddingVertical: 4,
  },
  disclosureText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.40)",
    lineHeight: 19,
  },
  btn: {
    backgroundColor: "#F59E0B",
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
    marginTop: 4,
  },
  btnPressed: { backgroundColor: "rgba(245,158,11,0.85)", transform: [{ scale: 0.98 }] },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontSize: 17, fontWeight: "600", color: "#0B1220", letterSpacing: -0.2 },
});
