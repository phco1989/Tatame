import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Lock, Mail, Eye, EyeOff } from "lucide-react-native";
import * as Haptics from "expo-haptics";

import {
  EmailAuthProvider,
  linkWithCredential,
  signInAnonymously,
  signOut,
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db, waitForAuthReady } from "@/lib/firebase-config";
import { setUserId } from "@/lib/revenuecatClient";
import { useT } from "@/lib/i18n/t";
import { normalizeEmail, normalizePassword, validateEmailBasic } from "@/lib/authUtils";

export default function SecureAccount() {
  const router = useRouter();
  const authT = useT("auth");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGoToSignIn, setShowGoToSignIn] = useState(false);

  const handleSecure = async () => {
    setError(null);
    setShowGoToSignIn(false);

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
    if (passwordN !== normalizePassword(confirm)) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await waitForAuthReady();

      // Ensure we have a current user — create anon session if missing
      if (!auth.currentUser) {
        const anonCred = await signInAnonymously(auth);
        await setUserId(anonCred.user.uid);
      }

      const user = auth.currentUser!;
      const cred = EmailAuthProvider.credential(emailN, passwordN);
      await linkWithCredential(user, cred);
      await setUserId(user.uid);

      // Persist email so login routing is stable
      await setDoc(
        doc(db, "users", user.uid),
        {
          email: emailN,
          profileComplete: true,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (e: any) {
      const code: string = e?.code ?? "";
      console.error("[secure-account] error", code, e?.message);

      if (
        code === "auth/email-already-in-use" ||
        code === "auth/credential-already-in-use"
      ) {
        setError(authT.emailAlreadyInUse);
        setShowGoToSignIn(true);
      } else if (code === "auth/invalid-credential") {
        setError(authT.secureAccountFailed);
      } else if (code === "auth/requires-recent-login") {
        setError(authT.sessionExpiredTryAgain);
        // Reset session and let user retry
        try {
          await signOut(auth);
          const newCred = await signInAnonymously(auth);
          await setUserId(newCred.user.uid);
        } catch {
          // best-effort
        }
      } else if (code === "auth/invalid-email") {
        setError(authT.invalidEmail);
      } else if (code === "auth/weak-password") {
        setError(authT.invalidPassword);
      } else {
        setError(authT.secureAccountFailed);
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        {/* Header */}
        <LinearGradient
          colors={["#0D0D0D", "#1A1A1A"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.header}
        >
          <Text style={styles.headerTitle}>Secure Manager Account</Text>
          <Text style={styles.headerSubtitle}>
            Create your login so you can sign in later.
          </Text>
        </LinearGradient>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.kav}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Email */}
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputRow}>
              <Mail size={18} color="rgba(255,255,255,0.45)" style={styles.inputIcon} />
              <TextInput
                value={email}
                onChangeText={(t) => { setEmail(t); setError(null); setShowGoToSignIn(false); }}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
                placeholder="manager@email.com"
                placeholderTextColor="rgba(255,255,255,0.3)"
                style={styles.input}
              />
            </View>

            {/* Password */}
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputRow}>
              <Lock size={18} color="rgba(255,255,255,0.45)" style={styles.inputIcon} />
              <TextInput
                value={password}
                onChangeText={(t) => { setPassword(t); setError(null); }}
                secureTextEntry={!showPassword}
                placeholder="6+ characters"
                placeholderTextColor="rgba(255,255,255,0.3)"
                style={styles.input}
              />
              <Pressable onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn}>
                {showPassword
                  ? <EyeOff size={18} color="rgba(255,255,255,0.45)" />
                  : <Eye size={18} color="rgba(255,255,255,0.45)" />}
              </Pressable>
            </View>

            {/* Confirm Password */}
            <Text style={styles.label}>Confirm Password</Text>
            <View style={styles.inputRow}>
              <Lock size={18} color="rgba(255,255,255,0.45)" style={styles.inputIcon} />
              <TextInput
                value={confirm}
                onChangeText={(t) => { setConfirm(t); setError(null); }}
                secureTextEntry={!showConfirm}
                placeholder="Repeat password"
                placeholderTextColor="rgba(255,255,255,0.3)"
                style={styles.input}
              />
              <Pressable onPress={() => setShowConfirm((v) => !v)} style={styles.eyeBtn}>
                {showConfirm
                  ? <EyeOff size={18} color="rgba(255,255,255,0.45)" />
                  : <Eye size={18} color="rgba(255,255,255,0.45)" />}
              </Pressable>
            </View>

            {/* Inline error */}
            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Go to Sign In (only shown on email-already-in-use) */}
            {showGoToSignIn && (
              <Pressable
                onPress={() => router.push("/signin")}
                style={styles.goSignInBtn}
              >
                <Text style={styles.goSignInText}>{authT.goToSignIn}</Text>
              </Pressable>
            )}

            {/* Primary CTA */}
            <Pressable onPress={handleSecure} disabled={loading} style={styles.btnWrapper}>
              <LinearGradient
                colors={loading ? ["#2A2A2A", "#1A1A1A"] : ["#FFFFFF", "#E5E5E5"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.btn}
              >
                {loading ? (
                  <ActivityIndicator color="#888" />
                ) : (
                  <Text style={[styles.btnText, { color: "#000" }]}>
                    {authT.secureAccount}
                  </Text>
                )}
              </LinearGradient>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0D0D0D",
  },
  safe: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 14,
    marginTop: 6,
  },
  kav: {
    flex: 1,
  },
  scroll: {
    padding: 24,
    paddingBottom: 48,
  },
  label: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.3,
    marginBottom: 8,
    marginTop: 16,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  inputIcon: {
    marginLeft: 14,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    color: "#FFFFFF",
    fontSize: 15,
  },
  eyeBtn: {
    padding: 14,
  },
  errorBox: {
    marginTop: 16,
    backgroundColor: "rgba(239,68,68,0.12)",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.25)",
  },
  errorText: {
    color: "#FCA5A5",
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
  },
  goSignInBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  goSignInText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  btnWrapper: {
    marginTop: 28,
  },
  btn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
});
