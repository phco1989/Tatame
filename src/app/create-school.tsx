import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Building2,
  ChevronLeft,
  AlertCircle,
  Mail,
  Globe,
  MapPin,
  Phone,
  Instagram,
  Facebook,
  FileText,
  Palette,
  Link,
  Check,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";

import { doc, setDoc, collection, serverTimestamp } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";
import { auth, db, waitForAuthReady, ensureSignedIn } from "@/lib/firebase-config";
import { useTenantStore } from "@/lib/state/tenant-store";
import { TATAME } from "@/lib/design";
import { useTranslations } from "@/lib/i18n";

// Color swatches for brand editor (matching admin.tsx)
const COLOR_SWATCHES = [
  "#8B5CF6", "#7C3AED", "#6D28D9", "#5B21B6",
  "#3B82F6", "#2563EB", "#1D4ED8", "#1E40AF",
  "#059669", "#10B981", "#34D399", "#6EE7B7",
  "#F59E0B", "#D97706", "#B45309", "#92400E",
  "#EF4444", "#DC2626", "#B91C1C", "#991B1B",
  "#EC4899", "#DB2777", "#BE185D", "#9D174D",
];

export default function CreateSchool() {
  const router = useRouter();
  const setTenant = useTenantStore((s) => s.setTenant);

  // Required fields
  const [schoolName, setSchoolName] = useState("");
  const [email, setEmail] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#8B5CF6");

  // Optional fields
  const [logoUrl, setLogoUrl] = useState("");
  const [tagline, setTagline] = useState("");
  const [instagram, setInstagram] = useState("");
  const [facebook, setFacebook] = useState("");
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [location, setLocation] = useState("");

  const [showColorPicker, setShowColorPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tr = useTranslations();
  const cs = tr.createSchool;

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const validateForm = (): boolean => {
    if (!schoolName.trim()) {
      setError(cs.enterSchoolName);
      return false;
    }
    if (!email.trim()) {
      setError(cs.enterEmail);
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError(cs.enterValidEmail);
      return false;
    }
    return true;
  };

  const handleSaveAndContinue = async () => {
    if (!validateForm()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setLoading(true);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Ensure user is signed in
      await waitForAuthReady();
      const user = await ensureSignedIn();

      // Generate a new school ID
      const schoolRef = doc(collection(db, "schools"));
      const schoolId = schoolRef.id;

      // IMPORTANT: Create school document FIRST (rules require createdBy == auth.uid)
      await setDoc(schoolRef, {
        name: schoolName.trim(),
        createdBy: user.uid,
        setupComplete: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        // Optional branding fields
        branding: {
          primaryColor,
          logoUrl: logoUrl.trim() || "",
          website: website.trim() || "",
          instagram: instagram.trim() || "",
          facebook: facebook.trim() || "",
        },
        // Additional optional fields stored at root level
        email: email.trim(),
        description: tagline.trim() || "",
        whatsappPhone: whatsappPhone.trim() || "",
        location: location.trim() || "",
      });

      // THEN create user document with manager role
      const userRef = doc(db, "users", user.uid);
      await setDoc(userRef, {
        role: "manager",
        schoolId,
        status: "active",
        profileComplete: true,
        beltRank: "black",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });

      // Update local tenant store
      setTenant({
        id: schoolId,
        name: schoolName.trim(),
        primaryColor,
        secondaryColor: primaryColor,
        accentColor: "#10B981",
        logoUrl: logoUrl.trim() || "",
        description: tagline.trim() || "",
        whatsappPhone: whatsappPhone.trim() || "",
        googleReviewUrl: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/secure-account");
    } catch (e: any) {
      console.error("Create school error:", e);

      // Provide more specific error messages
      const msg = String(e?.message ?? "");
      const errCode = String(e?.code ?? "");

      if (errCode === "permission-denied" || msg.includes("Missing or insufficient permissions")) {
        setError(cs.permissionDenied);
      } else if (errCode === "unavailable" || msg.toLowerCase().includes("offline")) {
        setError(cs.noInternet);
      } else {
        setError(cs.somethingWrong);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = schoolName.trim() && email.trim();

  return (
    <View className="flex-1" style={{ backgroundColor: TATAME.bg }}>
      <SafeAreaView className="flex-1" edges={["top"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
        >
          {/* Header */}
          <View style={{ backgroundColor: "#0B1220" }}>
            <LinearGradient
              colors={["#0B1220", "#0F1929", "#111827"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32, overflow: "hidden" }}
            >
              {/* Subtle radial glow behind icon area */}
              <View
                style={{
                  position: "absolute",
                  top: -40,
                  left: -20,
                  width: 220,
                  height: 220,
                  borderRadius: 110,
                  backgroundColor: "rgba(147,197,253,0.06)",
                }}
                pointerEvents="none"
              />
              {/* Dojo spotlight beam — overhead, ultra-low opacity */}
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  left: "25%",
                  width: "50%",
                  height: 120,
                  backgroundColor: "rgba(255,255,255,0.045)",
                  borderBottomLeftRadius: 80,
                  borderBottomRightRadius: 80,
                  transform: [{ scaleX: 1.4 }],
                }}
                pointerEvents="none"
              />

              <Pressable
                onPress={handleBack}
                className="flex-row items-center mb-6"
              >
                <ChevronLeft size={24} color="white" />
                <Text
                  className="text-white text-base ml-1"
                  style={{ fontFamily: "Outfit_500Medium" }}
                >
                  {tr.common.back}
                </Text>
              </Pressable>

              <View className="flex-row items-center">
                {/* Glassmorphism icon container */}
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 16,
                    backgroundColor: "rgba(255,255,255,0.05)",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.08)",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 16,
                    shadowColor: "rgba(147,197,253,0.15)",
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 1,
                    shadowRadius: 12,
                  }}
                >
                  <Building2 size={28} color="rgba(255,255,255,0.90)" />
                </View>
                <View className="flex-1">
                  <Text
                    style={{ fontFamily: "Poppins_700Bold", fontSize: 22, color: "#FFFFFF", lineHeight: 28 }}
                  >
                    {cs.title}
                  </Text>
                  <Text
                    style={{ fontFamily: "Outfit_400Regular", fontSize: 13, color: "rgba(255,255,255,0.65)", marginTop: 2 }}
                  >
                    {cs.subtitle}
                  </Text>
                </View>
              </View>
            </LinearGradient>
          </View>

          <ScrollView
            className="flex-1 -mt-4"
            contentContainerStyle={{ paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Required Fields Card */}
            <View className="px-5 mb-4">
              <View
                className="rounded-2xl p-5"
                style={{
                  backgroundColor: TATAME.bgCard,
                  borderWidth: 1,
                  borderColor: TATAME.cardBorder,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 16,
                  elevation: 4,
                }}
              >
                <Text
                  className="text-lg font-semibold mb-4"
                  style={{ fontFamily: "Poppins_600SemiBold", color: TATAME.text }}
                >
                  {cs.schoolInfoSection}
                </Text>

                {/* School Name */}
                <View className="mb-4">
                  <Text
                    className="text-sm mb-2"
                    style={{ fontFamily: "Outfit_500Medium", color: TATAME.textSecondary }}
                  >
                    {cs.schoolNameLabel}
                  </Text>
                  <View className="flex-row items-center rounded-xl px-4" style={{ backgroundColor: TATAME.bgInput, borderWidth: 1, borderColor: TATAME.inputBorder }}>
                    <Building2 size={18} color={TATAME.textMuted} />
                    <TextInput
                      value={schoolName}
                      onChangeText={(text) => {
                        setSchoolName(text);
                        setError(null);
                      }}
                      placeholder={cs.schoolNamePlaceholder}
                      placeholderTextColor={TATAME.textMuted}
                      className="flex-1 py-3.5 ml-3"
                      style={{ fontFamily: "Outfit_400Regular", fontSize: 16, color: TATAME.text }}
                    />
                  </View>
                </View>

                {/* Email */}
                <View className="mb-4">
                  <Text
                    className="text-sm mb-2"
                    style={{ fontFamily: "Outfit_500Medium", color: TATAME.textSecondary }}
                  >
                    Email *
                  </Text>
                  <View className="flex-row items-center rounded-xl px-4" style={{ backgroundColor: TATAME.bgInput, borderWidth: 1, borderColor: TATAME.inputBorder }}>
                    <Mail size={18} color={TATAME.textMuted} />
                    <TextInput
                      value={email}
                      onChangeText={(text) => {
                        setEmail(text);
                        setError(null);
                      }}
                      placeholder="contact@yourschool.com"
                      placeholderTextColor={TATAME.textMuted}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      className="flex-1 py-3.5 ml-3"
                      style={{ fontFamily: "Outfit_400Regular", fontSize: 16, color: TATAME.text }}
                    />
                  </View>
                </View>

                {/* Primary Color */}
                <View>
                  <Text
                    className="text-sm mb-2"
                    style={{ fontFamily: "Outfit_500Medium", color: TATAME.textSecondary }}
                  >
                    Brand Color *
                  </Text>
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setShowColorPicker(!showColorPicker);
                    }}
                    className="flex-row items-center rounded-xl px-4 py-3.5"
                    style={{ backgroundColor: TATAME.bgInput, borderWidth: 1, borderColor: TATAME.inputBorder }}
                  >
                    <Palette size={18} color={TATAME.textMuted} />
                    <View
                      className="w-6 h-6 rounded-lg ml-3 mr-2"
                      style={{ backgroundColor: primaryColor }}
                    />
                    <Text
                      className="flex-1"
                      style={{ fontFamily: "Outfit_400Regular", fontSize: 16, color: TATAME.text }}
                    >
                      {primaryColor}
                    </Text>
                    <ChevronLeft
                      size={18}
                      color={TATAME.textMuted}
                      style={{
                        transform: [{ rotate: showColorPicker ? "FFFF" : "-90deg" }],
                      }}
                    />
                  </Pressable>

                  {/* Color Picker Grid */}
                  {showColorPicker && (
                    <View className="mt-3 flex-row flex-wrap gap-2">
                      {COLOR_SWATCHES.map((color) => (
                        <Pressable
                          key={color}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setPrimaryColor(color);
                          }}
                          className="items-center justify-center"
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 12,
                            backgroundColor: color,
                            borderWidth: primaryColor === color ? 3 : 0,
                            borderColor: "white",
                            shadowColor: primaryColor === color ? color : "transparent",
                            shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: 0.4,
                            shadowRadius: 4,
                          }}
                        >
                          {primaryColor === color && (
                            <Check size={20} color="white" strokeWidth={3} />
                          )}
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* Optional Fields Card */}
            <View className="px-5 mb-4">
              <View
                className="rounded-2xl p-5"
                style={{
                  backgroundColor: TATAME.bgCard,
                  borderWidth: 1,
                  borderColor: TATAME.cardBorder,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.2,
                  shadowRadius: 8,
                  elevation: 2,
                }}
              >
                <Text
                  className="text-lg font-semibold mb-1"
                  style={{ fontFamily: "Poppins_600SemiBold", color: TATAME.text }}
                >
                  Additional Info
                </Text>
                <Text
                  className="text-sm mb-4"
                  style={{ fontFamily: "Outfit_400Regular", color: TATAME.textMuted }}
                >
                  Optional - you can add these later
                </Text>

                {/* Logo URL */}
                <View className="mb-4">
                  <Text
                    className="text-sm mb-2"
                    style={{ fontFamily: "Outfit_500Medium", color: TATAME.textSecondary }}
                  >
                    Logo URL
                  </Text>
                  <View className="flex-row items-center rounded-xl px-4" style={{ backgroundColor: TATAME.bgInput, borderWidth: 1, borderColor: TATAME.inputBorder }}>
                    <Link size={18} color={TATAME.textMuted} />
                    <TextInput
                      value={logoUrl}
                      onChangeText={setLogoUrl}
                      placeholder="https://..."
                      placeholderTextColor={TATAME.textMuted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      className="flex-1 py-3.5 ml-3"
                      style={{ fontFamily: "Outfit_400Regular", fontSize: 16, color: TATAME.text }}
                    />
                  </View>
                </View>

                {/* Tagline */}
                <View className="mb-4">
                  <Text
                    className="text-sm mb-2"
                    style={{ fontFamily: "Outfit_500Medium", color: TATAME.textSecondary }}
                  >
                    Tagline / Description
                  </Text>
                  <View className="flex-row items-start rounded-xl px-4" style={{ backgroundColor: TATAME.bgInput, borderWidth: 1, borderColor: TATAME.inputBorder }}>
                    <FileText size={18} color={TATAME.textMuted} style={{ marginTop: 14 }} />
                    <TextInput
                      value={tagline}
                      onChangeText={setTagline}
                      placeholder="Premier jiu-jitsu training..."
                      placeholderTextColor={TATAME.textMuted}
                      multiline
                      numberOfLines={2}
                      className="flex-1 py-3.5 ml-3"
                      style={{
                        fontFamily: "Outfit_400Regular",
                        fontSize: 16,
                        color: TATAME.text,
                        textAlignVertical: "top",
                        minHeight: 60,
                      }}
                    />
                  </View>
                </View>

                {/* Instagram */}
                <View className="mb-4">
                  <Text
                    className="text-sm mb-2"
                    style={{ fontFamily: "Outfit_500Medium", color: TATAME.textSecondary }}
                  >
                    Instagram
                  </Text>
                  <View className="flex-row items-center rounded-xl px-4" style={{ backgroundColor: TATAME.bgInput, borderWidth: 1, borderColor: TATAME.inputBorder }}>
                    <Instagram size={18} color={TATAME.textMuted} />
                    <TextInput
                      value={instagram}
                      onChangeText={setInstagram}
                      placeholder="@yourschool"
                      placeholderTextColor={TATAME.textMuted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      className="flex-1 py-3.5 ml-3"
                      style={{ fontFamily: "Outfit_400Regular", fontSize: 16, color: TATAME.text }}
                    />
                  </View>
                </View>

                {/* Facebook */}
                <View className="mb-4">
                  <Text
                    className="text-sm mb-2"
                    style={{ fontFamily: "Outfit_500Medium", color: TATAME.textSecondary }}
                  >
                    Facebook
                  </Text>
                  <View className="flex-row items-center rounded-xl px-4" style={{ backgroundColor: TATAME.bgInput, borderWidth: 1, borderColor: TATAME.inputBorder }}>
                    <Facebook size={18} color={TATAME.textMuted} />
                    <TextInput
                      value={facebook}
                      onChangeText={setFacebook}
                      placeholder="facebook.com/yourschool"
                      placeholderTextColor={TATAME.textMuted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      className="flex-1 py-3.5 ml-3"
                      style={{ fontFamily: "Outfit_400Regular", fontSize: 16, color: TATAME.text }}
                    />
                  </View>
                </View>

                {/* WhatsApp / Phone */}
                <View className="mb-4">
                  <Text
                    className="text-sm mb-2"
                    style={{ fontFamily: "Outfit_500Medium", color: TATAME.textSecondary }}
                  >
                    WhatsApp / Phone
                  </Text>
                  <View className="flex-row items-center rounded-xl px-4" style={{ backgroundColor: TATAME.bgInput, borderWidth: 1, borderColor: TATAME.inputBorder }}>
                    <Phone size={18} color={TATAME.textMuted} />
                    <TextInput
                      value={whatsappPhone}
                      onChangeText={setWhatsappPhone}
                      placeholder="+1 555 123 4567"
                      placeholderTextColor={TATAME.textMuted}
                      keyboardType="phone-pad"
                      className="flex-1 py-3.5 ml-3"
                      style={{ fontFamily: "Outfit_400Regular", fontSize: 16, color: TATAME.text }}
                    />
                  </View>
                </View>

                {/* Website */}
                <View className="mb-4">
                  <Text
                    className="text-sm mb-2"
                    style={{ fontFamily: "Outfit_500Medium", color: TATAME.textSecondary }}
                  >
                    Website
                  </Text>
                  <View className="flex-row items-center rounded-xl px-4" style={{ backgroundColor: TATAME.bgInput, borderWidth: 1, borderColor: TATAME.inputBorder }}>
                    <Globe size={18} color={TATAME.textMuted} />
                    <TextInput
                      value={website}
                      onChangeText={setWebsite}
                      placeholder="https://yourschool.com"
                      placeholderTextColor={TATAME.textMuted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                      className="flex-1 py-3.5 ml-3"
                      style={{ fontFamily: "Outfit_400Regular", fontSize: 16, color: TATAME.text }}
                    />
                  </View>
                </View>

                {/* Location */}
                <View>
                  <Text
                    className="text-sm mb-2"
                    style={{ fontFamily: "Outfit_500Medium", color: TATAME.textSecondary }}
                  >
                    Location
                  </Text>
                  <View className="flex-row items-center rounded-xl px-4" style={{ backgroundColor: TATAME.bgInput, borderWidth: 1, borderColor: TATAME.inputBorder }}>
                    <MapPin size={18} color={TATAME.textMuted} />
                    <TextInput
                      value={location}
                      onChangeText={setLocation}
                      placeholder="Miami Beach, FL"
                      placeholderTextColor={TATAME.textMuted}
                      className="flex-1 py-3.5 ml-3"
                      style={{ fontFamily: "Outfit_400Regular", fontSize: 16, color: TATAME.text }}
                    />
                  </View>
                </View>
              </View>
            </View>

            {/* Error Message */}
            {error && (
              <View className="px-5 mb-4">
                <View className="flex-row items-center bg-red-50 p-4 rounded-xl">
                  <AlertCircle size={18} color="#DC2626" />
                  <Text
                    className="text-red-600 text-sm ml-2 flex-1"
                    style={{ fontFamily: "Outfit_400Regular" }}
                  >
                    {error}
                  </Text>
                </View>
              </View>
            )}

            {/* Save Button */}
            <View className="px-5">
              <Pressable
                onPress={handleSaveAndContinue}
                disabled={loading || !isFormValid}
                className="active:opacity-90"
              >
                <LinearGradient
                  colors={
                    loading || !isFormValid
                      ? ["#D1D5DB", "#9CA3AF"]
                      : ["#7C3AED", "#8B5CF6"]
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{
                    borderRadius: 14,
                    paddingVertical: 16,
                    alignItems: "center",
                  }}
                >
                  {loading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text
                      className="text-white font-semibold text-base"
                      style={{ fontFamily: "Outfit_600SemiBold" }}
                    >
                      Save & Continue
                    </Text>
                  )}
                </LinearGradient>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
