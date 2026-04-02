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
  StatusBar,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Mail,
  Lock,
  ChevronLeft,
  AlertCircle,
  Users,
  GraduationCap,
  Eye,
  EyeOff,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  doc,
  runTransaction,
  serverTimestamp,
  getDoc,
  increment,
} from "firebase/firestore";
import { auth, db, waitForAuthReady, ensureSignedIn } from "@/lib/firebase-config";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTenantStore } from "@/lib/state/tenant-store";
import { useTranslations } from "@/lib/i18n";

const INVITE_CODE_STORAGE_KEY = "pending_invite_code";

type InviteDoc = {
  active: boolean;
  code: string;
  role: "student" | "coach";
  schoolId: string;
  usedCount: number;
  maxUses?: number;
};

export default function SignupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; role?: string }>();

  const inviteCode = params.code || "";
  const roleFromParam = (params.role || "student").toLowerCase();
  const role = roleFromParam === "coach" ? "coach" : "student";

  const loadTenantFromFirestore = useTenantStore((s) => s.loadTenantFromFirestore);
  const tr = useTranslations();
  const s = tr.signup;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleSignup = async () => {
    // Validate inputs
    if (!email.trim()) {
      setError(s.enterEmail);
      return;
    }

    if (!password) {
      setError(s.enterPassword);
      return;
    }

    if (password.length < 6) {
      setError(s.passwordTooShort);
      return;
    }

    if (password !== confirmPassword) {
      setError(s.passwordsMismatch);
      return;
    }

    if (!inviteCode) {
      setError(s.missingInviteCode);
      return;
    }

    setLoading(true);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await waitForAuthReady();

      // Create the Firebase user
      const credential = await createUserWithEmailAndPassword(
        auth,
        email.trim().toLowerCase(),
        password
      );
      const user = credential.user;

      // Ensure signed in after account creation
      await ensureSignedIn();

      // Redeem the invite code in a transaction
      // Use doc(db, "school_invites", code) - DO NOT use query
      const inviteRef = doc(db, "school_invites", inviteCode);
      const userRef = doc(db, "users", user.uid);

      let resolvedSchoolId = "";

      await runTransaction(db, async (tx) => {
        // Read invite using doc reference (NOT query)
        const inviteSnap = await tx.get(inviteRef);
        if (!inviteSnap.exists()) {
          throw new Error("invite_not_found");
        }

        const inviteData = inviteSnap.data() as InviteDoc;

        // Validate invite.active === true
        if (inviteData.active !== true) {
          throw new Error("invite_inactive");
        }

        if (!inviteData.schoolId) {
          throw new Error("missing_schoolId");
        }

        resolvedSchoolId = inviteData.schoolId;

        // Create or merge users/{uid} with ONLY these fields:
        // role, schoolId, profileComplete: true, updatedAt: serverTimestamp()
        tx.set(
          userRef,
          {
            role: inviteData.role,
            schoolId: inviteData.schoolId,
            profileComplete: true,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        // IMPORTANT: Update invite with ONLY these 2 fields allowed by Firestore rules
        // DO NOT add role, schoolId, active, createdBy, createdAt, maxUses or any other fields
        tx.update(inviteRef, {
          usedCount: increment(1),
          lastUsedAt: serverTimestamp(),
        });
      });

      // Clear stored invite code
      await AsyncStorage.removeItem(INVITE_CODE_STORAGE_KEY);

      // Hydrate tenant store so all screens see the correct schoolId immediately
      if (resolvedSchoolId) {
        await loadTenantFromFirestore(resolvedSchoolId);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Navigate to tabs after successful join
      router.replace("/(tabs)");
    } catch (e: any) {
      console.error("[Signup] Error:", e);

      // Handle Firebase auth errors
      if (e.code === "auth/email-already-in-use") {
        setError(s.emailInUse);
      } else if (e.code === "auth/invalid-email") {
        setError(s.invalidEmail);
      } else if (e.code === "auth/weak-password") {
        setError(s.weakPassword);
      } else if (e.message === "invite_not_found") {
        setError(s.inviteNotFound);
      } else if (e.message === "invite_inactive") {
        setError(s.inviteInactive);
      } else if (e.code === "unavailable" || e.message?.includes("offline")) {
        setError(s.noInternet);
      } else {
        setError(s.somethingWrong);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const RoleIcon = role === "coach" ? Users : GraduationCap;
  // Dark navy header gradient — same for both roles
  const gradientColors: [string, string] = ["#0A1628", "#111827"];

  return (
    <View style={{ flex: 1, backgroundColor: "#0B1220" }}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Header */}
            <LinearGradient
              colors={gradientColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 }}
            >
              <Pressable
                onPress={handleBack}
                style={{ flexDirection: "row", alignItems: "center", marginBottom: 24 }}
              >
                <ChevronLeft size={24} color="rgba(255,255,255,0.9)" />
                <Text
                  style={{ color: "rgba(255,255,255,0.9)", fontSize: 16, marginLeft: 4, fontFamily: "Outfit_500Medium" }}
                >
                  {tr.common.back}
                </Text>
              </Pressable>

              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 16,
                    backgroundColor: "rgba(76,123,244,0.15)",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 16,
                    borderWidth: 1,
                    borderColor: "rgba(76,123,244,0.25)",
                  }}
                >
                  <RoleIcon size={28} color="#4C7BF4" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ color: "#FFFFFF", fontSize: 24, fontWeight: "700", fontFamily: "Poppins_700Bold" }}
                  >
                    {s.title}
                  </Text>
                  <Text
                    style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, fontFamily: "Outfit_400Regular" }}
                  >
                    {s.signUpAs.replace("{role}", role === "coach" ? tr.welcome.coach : tr.welcome.student)}
                  </Text>
                </View>
              </View>
            </LinearGradient>

            {/* Form Card */}
            <Animated.View
              style={{
                paddingHorizontal: 20,
                marginTop: -4,
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              }}
            >
              <View
                style={{
                  backgroundColor: "#111827",
                  borderRadius: 16,
                  padding: 24,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.06)",
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.4,
                  shadowRadius: 16,
                  elevation: 4,
                }}
              >
                {/* Email Input */}
                <Text
                  style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: "500", marginBottom: 8, fontFamily: "Outfit_500Medium" }}
                >
                  {s.emailAddress}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: "#1F2937",
                    borderRadius: 12,
                    paddingHorizontal: 16,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.08)",
                    marginBottom: 16,
                  }}
                >
                  <Mail size={18} color="rgba(255,255,255,0.4)" />
                  <TextInput
                    value={email}
                    onChangeText={(text) => {
                      setEmail(text);
                      setError(null);
                    }}
                    placeholder={s.emailPlaceholder}
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!loading}
                    style={{
                      flex: 1,
                      paddingVertical: 16,
                      paddingHorizontal: 12,
                      fontSize: 16,
                      color: "#FFFFFF",
                      fontFamily: "Outfit_400Regular",
                    }}
                  />
                </View>

                {/* Password Input */}
                <Text
                  style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: "500", marginBottom: 8, fontFamily: "Outfit_500Medium" }}
                >
                  {s.passwordLabel}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: "#1F2937",
                    borderRadius: 12,
                    paddingHorizontal: 16,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.08)",
                    marginBottom: 16,
                  }}
                >
                  <Lock size={18} color="rgba(255,255,255,0.4)" />
                  <TextInput
                    value={password}
                    onChangeText={(text) => {
                      setPassword(text);
                      setError(null);
                    }}
                    placeholder={s.passwordPlaceholder}
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    editable={!loading}
                    style={{
                      flex: 1,
                      paddingVertical: 16,
                      paddingHorizontal: 12,
                      fontSize: 16,
                      color: "#FFFFFF",
                      fontFamily: "Outfit_400Regular",
                    }}
                  />
                  <Pressable onPress={() => setShowPassword(!showPassword)}>
                    {showPassword ? (
                      <EyeOff size={18} color="rgba(255,255,255,0.4)" />
                    ) : (
                      <Eye size={18} color="rgba(255,255,255,0.4)" />
                    )}
                  </Pressable>
                </View>

                {/* Confirm Password Input */}
                <Text
                  style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: "500", marginBottom: 8, fontFamily: "Outfit_500Medium" }}
                >
                  {s.confirmPassword}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: "#1F2937",
                    borderRadius: 12,
                    paddingHorizontal: 16,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.08)",
                  }}
                >
                  <Lock size={18} color="rgba(255,255,255,0.4)" />
                  <TextInput
                    value={confirmPassword}
                    onChangeText={(text) => {
                      setConfirmPassword(text);
                      setError(null);
                    }}
                    placeholder={s.confirmPasswordPlaceholder}
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    editable={!loading}
                    style={{
                      flex: 1,
                      paddingVertical: 16,
                      paddingHorizontal: 12,
                      fontSize: 16,
                      color: "#FFFFFF",
                      fontFamily: "Outfit_400Regular",
                    }}
                  />
                </View>

                {/* Error Message */}
                {error && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginTop: 16,
                      backgroundColor: "rgba(239,68,68,0.12)",
                      padding: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: "rgba(239,68,68,0.2)",
                    }}
                  >
                    <AlertCircle size={18} color="#EF4444" />
                    <Text
                      style={{ color: "#EF4444", fontSize: 14, marginLeft: 8, flex: 1, fontFamily: "Outfit_400Regular" }}
                    >
                      {error}
                    </Text>
                  </View>
                )}

                {/* Sign Up Button */}
                <Pressable
                  onPress={handleSignup}
                  disabled={loading}
                  style={({ pressed }) => [{ marginTop: 24, opacity: pressed ? 0.85 : 1 }]}
                >
                  <View
                    style={{
                      borderRadius: 16,
                      paddingVertical: 16,
                      alignItems: "center",
                      backgroundColor: loading ? "#374151" : "#FBBF24",
                    }}
                  >
                    {loading ? (
                      <ActivityIndicator color="rgba(255,255,255,0.7)" />
                    ) : (
                      <Text
                        style={{ color: "#0B1220", fontWeight: "600", fontSize: 16, fontFamily: "Outfit_600SemiBold" }}
                      >
                        {s.createAccount}
                      </Text>
                    )}
                  </View>
                </Pressable>
              </View>

              {/* Login Link */}
              <View style={{ alignItems: "center", marginTop: 24, marginBottom: 32 }}>
                <Text
                  style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, fontFamily: "Outfit_400Regular" }}
                >
                  {s.alreadyHaveAccount}
                </Text>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push("/login");
                  }}
                  style={{ marginTop: 8 }}
                >
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "600",
                      fontFamily: "Outfit_600SemiBold",
                      color: "#FBBF24",
                    }}
                  >
                    {s.logIn}
                  </Text>
                </Pressable>
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
