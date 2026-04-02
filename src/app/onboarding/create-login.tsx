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
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle,
  ShieldCheck,
  ChevronLeft,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import {
  linkWithCredential,
  EmailAuthProvider,
} from "firebase/auth";
import { auth, db, waitForAuthReady } from "@/lib/firebase-config";
import { useTenantStore, selectIsNgo } from "@/lib/state/tenant-store";
import { resolvePostLoginRoute } from "@/lib/routeAfterLogin";

const { width, height } = Dimensions.get("window");

export default function CreateLoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<string>("student");

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

  // Check if user is authenticated and needs to create login
  useEffect(() => {
    const checkUser = async () => {
      try {
        await waitForAuthReady();
        const user = auth.currentUser;

        if (!user) {
          router.replace("/welcome");
          return;
        }

        const hasEmailProvider = user.providerData.some(
          (p) => p.providerId === "password"
        );

        if (hasEmailProvider) {
          const userRef = doc(db, "users", user.uid);
          const userSnap = await getDoc(userRef);

          if (userSnap.exists()) {
            const userData = userSnap.data();
            if (userData.profileComplete) {
              if (userData.schoolId) {
                await useTenantStore.getState().loadTenantFromFirestore(userData.schoolId);
              }
              const isNgo = selectIsNgo(useTenantStore.getState() as any);
              router.replace(resolvePostLoginRoute(isNgo, userData.role ?? null) as any);
            } else {
              if (userData.schoolId) {
                await useTenantStore.getState().loadTenantFromFirestore(userData.schoolId);
              }
              const isNgo = selectIsNgo(useTenantStore.getState() as any);
              const userRole = userData.role ?? "student";
              if (isNgo && userRole !== "manager") {
                router.replace("/onboarding/ngo-student");
              } else {
                router.replace("/complete-profile");
              }
            }
          } else {
            router.replace("/welcome");
          }
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

        if (userData.schoolId) {
          useTenantStore.getState().loadTenantFromFirestore(userData.schoolId);
        }
      } catch (e) {
        console.error("[CreateLogin] Auth check error:", e);
      } finally {
        setCheckingAuth(false);
      }
    };

    checkUser();
  }, []);

  const validateForm = (): string | null => {
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) return "Please enter your email address";

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) return "Please enter a valid email address";

    if (!password) return "Please enter a password";
    if (password.length < 6) return "Password must be at least 6 characters";
    if (!confirmPassword) return "Please confirm your password";
    if (password !== confirmPassword) return "Passwords do not match";

    return null;
  };

  const handleCreateLogin = async () => {
    const validationError = validateForm();
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
      if (!user) {
        setError("Not authenticated. Please log in again.");
        router.replace("/welcome");
        return;
      }

      const trimmedEmail = email.trim().toLowerCase();
      const credential = EmailAuthProvider.credential(trimmedEmail, password);
      await linkWithCredential(user, credential);

      const userRef = doc(db, "users", user.uid);
      await setDoc(
        userRef,
        { email: trimmedEmail, updatedAt: serverTimestamp() },
        { merge: true }
      );

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Route NGO students/coaches to their onboarding, others to complete-profile
      const isNgo = selectIsNgo(useTenantStore.getState() as any);
      if (isNgo && role !== "manager") {
        router.replace("/onboarding/ngo-student");
      } else {
        router.replace("/complete-profile");
      }
    } catch (e: any) {
      console.error("[CreateLogin] Link error:", e);

      const code = e?.code || "";
      if (code === "auth/email-already-in-use") {
        setError("This email already has an account. Please sign in instead.");
      } else if (code === "auth/invalid-email") {
        setError("Please enter a valid email address.");
      } else if (code === "auth/weak-password") {
        setError("Password is too weak. Please use at least 6 characters.");
      } else if (code === "auth/credential-already-in-use") {
        setError("This credential is already associated with another account.");
      } else if (code === "auth/provider-already-linked") {
        router.replace("/complete-profile");
        return;
      } else {
        setError("Something went wrong. Please try again.");
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignInInstead = () => {
    router.replace("/login");
  };

  const accentColor = role === "coach" ? "#10B981" : "#38BDF8";

  if (checkingAuth) {
    return (
      <View style={styles.container}>
        <View style={styles.imageContainer} pointerEvents="none">
          <Image
            source={require("../../../assets/images/bjj-hero-2.png")}
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
      {/* Background Image */}
      <View style={styles.imageContainer} pointerEvents="none">
        <Image
          source={require("../../../assets/images/bjj-hero-2.png")}
          style={styles.backgroundImage}
          resizeMode="cover"
        />
      </View>

      {/* Lighter gradient overlay - same image but much lighter */}
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
            <Text style={styles.backText}>Back</Text>
          </Pressable>

          {/* Hero */}
          <View style={styles.heroSection}>
            <View style={[styles.iconCircle, { backgroundColor: `${accentColor}33` }]}>
              <ShieldCheck size={36} color={accentColor} />
            </View>
            <Text style={styles.title}>Create Your Login</Text>
            <Text style={styles.subtitle}>
              Set up your email and password to access your account from any device
            </Text>
          </View>

          <View style={{ flex: 1, minHeight: 32 }} />

          {/* Form */}
          <Animated.View
            style={{
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
              gap: 14,
            }}
          >
            {/* Email Input */}
            <View style={styles.inputWrapper}>
              <Mail size={18} color="rgba(255,255,255,0.55)" style={{ marginLeft: 16 }} />
              <TextInput
                value={email}
                onChangeText={(text) => { setEmail(text); setError(null); }}
                placeholder="Email address"
                placeholderTextColor="rgba(255,255,255,0.40)"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                editable={!loading}
                style={styles.input}
              />
            </View>

            {/* Password Input */}
            <View style={styles.inputWrapper}>
              <Lock size={18} color="rgba(255,255,255,0.55)" style={{ marginLeft: 16 }} />
              <TextInput
                value={password}
                onChangeText={(text) => { setPassword(text); setError(null); }}
                placeholder="Password (min. 6 characters)"
                placeholderTextColor="rgba(255,255,255,0.40)"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                editable={!loading}
                style={styles.input}
              />
              <Pressable onPress={() => setShowPassword(!showPassword)} style={{ padding: 16 }} hitSlop={8}>
                {showPassword ? <EyeOff size={20} color="rgba(255,255,255,0.6)" /> : <Eye size={20} color="rgba(255,255,255,0.6)" />}
              </Pressable>
            </View>

            {/* Confirm Password Input */}
            <View style={styles.inputWrapper}>
              <Lock size={18} color="rgba(255,255,255,0.55)" style={{ marginLeft: 16 }} />
              <TextInput
                value={confirmPassword}
                onChangeText={(text) => { setConfirmPassword(text); setError(null); }}
                placeholder="Confirm password"
                placeholderTextColor="rgba(255,255,255,0.40)"
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                editable={!loading}
                style={styles.input}
              />
              <Pressable onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={{ padding: 16 }} hitSlop={8}>
                {showConfirmPassword ? <EyeOff size={20} color="rgba(255,255,255,0.6)" /> : <Eye size={20} color="rgba(255,255,255,0.6)" />}
              </Pressable>
            </View>

            {/* Error */}
            {error && (
              <View style={styles.errorBox}>
                <AlertCircle size={16} color="#FCA5A5" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Sign In Instead */}
            {error?.includes("already has an account") && (
              <Pressable onPress={handleSignInInstead} style={{ alignItems: "center", paddingVertical: 4 }}>
                <Text style={[styles.linkText, { color: accentColor }]}>Sign in to your existing account</Text>
              </Pressable>
            )}

            {/* CTA Button */}
            <Pressable
              onPress={handleCreateLogin}
              disabled={loading}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
                loading && { opacity: 0.7 },
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <CheckCircle size={20} color="#FFF" />
                  <Text style={styles.primaryButtonText}>Create Login</Text>
                </>
              )}
            </Pressable>

            {/* Footer note */}
            <Text style={styles.footerNote}>
              You can sign in from any device using these credentials.
            </Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
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
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.28)",
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
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
    backgroundColor: "rgba(252,165,165,0.12)",
    padding: 12,
    borderRadius: 12,
    gap: 8,
  },
  errorText: {
    color: "#FCA5A5",
    fontSize: 14,
    flex: 1,
  },
  linkText: {
    fontSize: 15,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  primaryButton: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  primaryButtonPressed: {
    backgroundColor: "rgba(255,255,255,0.9)",
    transform: [{ scale: 0.98 }],
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#000000",
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
