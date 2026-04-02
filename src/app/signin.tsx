import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  ImageBackground,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Mail,
  Lock,
  ChevronLeft,
  Eye,
  EyeOff,
  AlertTriangle,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db, waitForAuthReady } from "@/lib/firebase-config";
import { useTenantStore, selectIsNgo } from "@/lib/state/tenant-store";
import { resolvePostLoginRoute } from "@/lib/routeAfterLogin";
import { useT } from "@/lib/i18n/t";
import { useTranslations } from "@/lib/i18n";
import { normalizeEmail, normalizePassword, validateEmailBasic } from "@/lib/authUtils";

const C_WHITE = "rgba(255,255,255,0.95)";
const C_SUB = "rgba(255,255,255,0.78)";
const C_MUTED = "rgba(255,255,255,0.55)";
const C_BORDER = "rgba(255,255,255,0.22)";
const C_INPUT_BG = "rgba(255,255,255,0.04)";

export default function SignInScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ role?: string }>();
  const role = params.role === "coach" ? "coach" : "student";

  const loadTenantFromFirestore = useTenantStore((s) => s.loadTenantFromFirestore);
  const authT = useT("auth");
  const tr = useTranslations();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotLinkedMessage, setShowNotLinkedMessage] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const handleSignIn = async () => {
    const emailN = normalizeEmail(email);
    const passwordN = normalizePassword(password);

    if (!validateEmailBasic(emailN)) {
      setError(authT.invalidEmail);
      return;
    }

    if (passwordN.length < 6) {
      setError(authT.invalidPassword);
      return;
    }

    setLoading(true);
    setError(null);
    setShowNotLinkedMessage(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await waitForAuthReady();

      // Sign in with normalized email/password
      const credential = await signInWithEmailAndPassword(auth, emailN, passwordN);
      const user = credential.user;

      // Load user document from Firestore
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        setShowNotLinkedMessage(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }

      const userData = userSnap.data();

      if (!userData.schoolId) {
        setShowNotLinkedMessage(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await loadTenantFromFirestore(userData.schoolId);

      if (!userData.profileComplete) {
        router.replace("/complete-profile");
        return;
      }

      // Route based on both org type AND user role.
      // NGO managers → dedicated panel; NGO students/coaches → tabs.
      const isNgo = selectIsNgo(useTenantStore.getState() as any);
      router.replace(resolvePostLoginRoute(isNgo, userData.role ?? null) as any);
    } catch (e: any) {
      const code: string = e?.code ?? "";
      console.error("[SignIn] auth error", code, e?.message);

      if (
        code === "auth/invalid-credential" ||
        code === "auth/wrong-password" ||
        code === "auth/user-not-found"
      ) {
        setError(authT.incorrectCredentials);
      } else if (code === "auth/invalid-email") {
        setError(authT.invalidEmail);
      } else if (code === "auth/too-many-requests") {
        setError(authT.tooManyAttempts);
      } else if (code === "unavailable" || e?.message?.includes("offline")) {
        setError(authT.noInternet);
      } else {
        setError(authT.somethingWrong);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const emailN = normalizeEmail(email);
    if (!validateEmailBasic(emailN)) {
      setError(authT.invalidEmail);
      return;
    }

    setSendingReset(true);
    setError(null);

    try {
      await sendPasswordResetEmail(auth, emailN);
      setResetEmailSent(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      console.error("[SignIn] Password reset error:", e?.code, e?.message);

      if (e.code === "auth/user-not-found") {
        setError(authT.noAccountFound);
      } else if (e.code === "auth/invalid-email") {
        setError(authT.invalidEmail);
      } else {
        setError(authT.couldNotSendReset);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSendingReset(false);
    }
  };

  const handleGoToJoin = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({ pathname: "/join", params: { role } });
  };

  const roleTitle = role === "coach" ? "Coach" : "Student";

  // Show "Not Linked" message screen
  if (showNotLinkedMessage) {
    return (
      <ImageBackground
        source={require("../../assets/images/landing-bg.png")}
        style={styles.container}
        resizeMode="cover"
      >
        {/* Dark Gradient Overlay */}
        <View style={styles.overlayContainer} pointerEvents="none">
          <LinearGradient
            colors={[
              "rgba(0,0,0,0.3)",
              "rgba(0,0,0,0.5)",
              "rgba(0,0,0,0.85)",
            ]}
            locations={[0, 0.5, 1]}
            style={styles.gradient}
          />
        </View>

        {/* Content */}
        <View style={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 }]}>
          {/* Back Button */}
          <Pressable
            onPress={() => setShowNotLinkedMessage(false)}
            style={styles.backButton}
          >
            <ChevronLeft size={24} color="white" />
            <Text style={styles.backText}>{tr.common.back}</Text>
          </Pressable>

          {/* Hero Section */}
          <View style={styles.heroSection}>
            <View style={styles.warningIcon}>
              <AlertTriangle size={32} color="#FFFFFF" />
            </View>
            <Text style={styles.title}>{authT.notLinkedTitle}</Text>
            <Text style={styles.subtitle}>
              {authT.notLinkedBody}
            </Text>
          </View>

          {/* Spacer */}
          <View style={styles.middleSpacer} />

          {/* Action Button */}
          <View style={styles.formSection}>
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
              ]}
              onPress={handleGoToJoin}
            >
              <Text style={styles.primaryButtonText}>{authT.joinWithInvite}</Text>
            </Pressable>
          </View>
        </View>
      </ImageBackground>
    );
  }

  return (
    <ImageBackground
      source={require("../../assets/images/landing-bg.png")}
      style={styles.container}
      resizeMode="cover"
    >
      {/* Dark Gradient Overlay */}
      <View style={styles.overlayContainer} pointerEvents="none">
        <LinearGradient
          colors={[
            "rgba(0,0,0,0.3)",
            "rgba(0,0,0,0.5)",
            "rgba(0,0,0,0.85)",
          ]}
          locations={[0, 0.5, 1]}
          style={styles.gradient}
        />
      </View>

      {/* Content */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 }]}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          {/* Back Button */}
          <Pressable onPress={handleBack} style={styles.backButton}>
            <ChevronLeft size={24} color="white" />
            <Text style={styles.backText}>{tr.common.back}</Text>
          </Pressable>

          {/* Hero Section */}
          <View style={styles.heroSection}>
            <Text style={styles.title}>{authT.welcomeBack}</Text>
            <Text style={styles.subtitle}>
              {authT.signInAs.replace("{role}", roleTitle)}
            </Text>
          </View>

          {/* Spacer */}
          <View style={styles.middleSpacer} />

          {/* Form Section */}
          <View style={styles.formSection}>
            {/* Email Input */}
            <View style={styles.inputContainer}>
              <Mail size={20} color={C_MUTED} style={styles.inputIcon} />
              <TextInput
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  setError(null);
                  setResetEmailSent(false);
                }}
                placeholder={authT.emailAddressPlaceholder}
                placeholderTextColor={C_MUTED}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
                style={styles.input}
              />
            </View>

            {/* Password Input */}
            <View style={styles.inputContainer}>
              <Lock size={20} color={C_MUTED} style={styles.inputIcon} />
              <TextInput
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  setError(null);
                }}
                placeholder={authT.password}
                placeholderTextColor={C_MUTED}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                editable={!loading}
                style={styles.input}
              />
              <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                {showPassword ? (
                  <EyeOff size={20} color={C_MUTED} />
                ) : (
                  <Eye size={20} color={C_MUTED} />
                )}
              </Pressable>
            </View>

            {/* Forgot Password Link */}
            <Pressable
              onPress={handleForgotPassword}
              disabled={sendingReset}
              style={styles.forgotPasswordButton}
            >
              {sendingReset ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.forgotPasswordText}>{authT.forgotPasswordText}</Text>
              )}
            </Pressable>

            {/* Reset Email Sent Message */}
            {resetEmailSent && (
              <View style={styles.successMessage}>
                <Mail size={18} color="#4ADE80" />
                <Text style={styles.successMessageText}>
                  {authT.passwordResetSent}
                </Text>
              </View>
            )}

            {/* Error Message */}
            {error && (
              <View style={styles.errorMessage}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Sign In Button */}
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
                loading && styles.buttonDisabled,
              ]}
              onPress={handleSignIn}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.primaryButtonText}>{authT.signIn}</Text>
              )}
            </Pressable>

            {/* Join with Invite Code Link */}
            <View style={styles.joinLinkContainer}>
              <Text style={styles.joinLinkLabel}>{authT.dontHaveAccount}</Text>
              <Pressable onPress={handleGoToJoin}>
                <Text style={styles.joinLinkText}>{authT.joinWithInvite}</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  overlayContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  gradient: {
    flex: 1,
  },
  content: {
    flex: 1,
    zIndex: 2,
    paddingHorizontal: 32,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "flex-start",
    paddingBottom: 24,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },
  backText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "500",
    marginLeft: 4,
  },
  heroSection: {
    marginBottom: 32,
  },
  warningIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 42,
    fontWeight: "700",
    color: C_WHITE,
    letterSpacing: -1.5,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: "400",
    color: C_SUB,
    lineHeight: 26,
    letterSpacing: -0.2,
  },
  middleSpacer: {
    flex: 1,
    minHeight: 40,
  },
  formSection: {
    gap: 16,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: C_BORDER,
    borderRadius: 14,
    backgroundColor: C_INPUT_BG,
  },
  inputIcon: {
    marginLeft: 16,
  },
  input: {
    flex: 1,
    paddingVertical: 18,
    paddingHorizontal: 12,
    color: C_WHITE,
    fontSize: 16,
  },
  eyeButton: {
    padding: 16,
  },
  forgotPasswordButton: {
    alignSelf: "flex-end",
  },
  forgotPasswordText: {
    color: C_WHITE,
    fontSize: 14,
    fontWeight: "500",
    textDecorationLine: "underline",
  },
  successMessage: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(74,222,128,0.15)",
    padding: 12,
    borderRadius: 12,
    gap: 8,
  },
  successMessageText: {
    color: "#4ADE80",
    fontSize: 14,
    flex: 1,
  },
  errorMessage: {
    backgroundColor: "rgba(252,165,165,0.15)",
    padding: 12,
    borderRadius: 12,
  },
  errorText: {
    color: "#FCA5A5",
    fontSize: 14,
    textAlign: "center",
  },
  primaryButton: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonPressed: {
    backgroundColor: "rgba(255,255,255,0.9)",
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },
  joinLinkContainer: {
    alignItems: "center",
    marginTop: 24,
    paddingTop: 12,
  },
  joinLinkLabel: {
    color: C_MUTED,
    fontSize: 14,
  },
  joinLinkText: {
    color: C_WHITE,
    fontSize: 16,
    fontWeight: "600",
    marginTop: 6,
    textDecorationLine: "underline",
  },
});
