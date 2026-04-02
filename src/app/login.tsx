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
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Mail,
  Lock,
  ChevronLeft,
  AlertCircle,
  LogIn,
  Eye,
  EyeOff,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db, waitForAuthReady } from "@/lib/firebase-config";

export default function LoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  const handleLogin = async () => {
    if (!email.trim()) {
      setError("Please enter your email address");
      return;
    }

    if (!password) {
      setError("Please enter your password");
      return;
    }

    setLoading(true);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await waitForAuthReady();

      // Sign in with email/password
      const credential = await signInWithEmailAndPassword(
        auth,
        email.trim().toLowerCase(),
        password
      );
      const user = credential.user;

      // Check if user document exists
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (!userSnap.exists()) {
        // User exists in Firebase Auth but not in Firestore - send to welcome
        router.replace("/welcome");
        return;
      }

      const userData = userSnap.data();

      // Check if profile is complete
      if (!userData.profileComplete) {
        router.replace("/complete-profile");
        return;
      }

      // Route based on role and schoolId
      if (userData.role === "manager") {
        if (!userData.schoolId) {
          router.replace("/create-school");
        } else {
          router.replace("/(tabs)");
        }
      } else {
        // Student or coach
        if (!userData.schoolId) {
          // No school - need to join with invite code
          router.replace({
            pathname: "/join",
            params: { role: userData.role || "student" },
          });
        } else {
          router.replace("/(tabs)");
        }
      }
    } catch (e: any) {
      console.error("[Login] Error:", e);

      // Handle Firebase auth errors
      if (e.code === "auth/invalid-email") {
        setError("Please enter a valid email address.");
      } else if (e.code === "auth/user-not-found") {
        setError("No account found with this email. Please sign up first.");
      } else if (e.code === "auth/wrong-password") {
        setError("Incorrect password. Please try again.");
      } else if (e.code === "auth/invalid-credential") {
        setError("Invalid email or password. Please try again.");
      } else if (e.code === "auth/too-many-requests") {
        setError("Too many failed attempts. Please try again later.");
      } else if (e.code === "unavailable" || e.message?.includes("offline")) {
        setError("No internet connection. Please try again.");
      } else {
        setError("Something went wrong. Please try again.");
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
              colors={["#0A1628", "#111827"]}
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
                  Back
                </Text>
              </Pressable>

              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 16,
                    backgroundColor: "rgba(251,191,36,0.15)",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 16,
                    borderWidth: 1,
                    borderColor: "rgba(251,191,36,0.25)",
                  }}
                >
                  <LogIn size={28} color="#FBBF24" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ color: "#FFFFFF", fontSize: 24, fontWeight: "700", fontFamily: "Poppins_700Bold" }}
                  >
                    Welcome Back
                  </Text>
                  <Text
                    style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, fontFamily: "Outfit_400Regular" }}
                  >
                    Log in to your account
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
                  Email Address
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
                    placeholder="your@email.com"
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
                  Password
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
                    value={password}
                    onChangeText={(text) => {
                      setPassword(text);
                      setError(null);
                    }}
                    placeholder="Enter your password"
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

                {/* Login Button */}
                <Pressable
                  onPress={handleLogin}
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
                        Log In
                      </Text>
                    )}
                  </View>
                </Pressable>
              </View>

              {/* Sign Up Link */}
              <View style={{ alignItems: "center", marginTop: 24, marginBottom: 32 }}>
                <Text
                  style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, fontFamily: "Outfit_400Regular" }}
                >
                  Don't have an account?
                </Text>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push("/welcome");
                  }}
                  style={{ marginTop: 8 }}
                >
                  <Text
                    style={{ color: "#FBBF24", fontSize: 16, fontWeight: "600", fontFamily: "Outfit_600SemiBold" }}
                  >
                    Sign Up
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
