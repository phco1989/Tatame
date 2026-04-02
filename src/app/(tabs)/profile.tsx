
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { Image as RNImage } from "react-native";

import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import {
  User,
  Mail,
  Phone,
  Save,
  LogOut,
  ChevronRight,
  Shield,
  Bell,
  HelpCircle,
  Edit3,
  Trash2,
  AlertTriangle,
  Check,
  X,
  MessageCircle,
  Instagram,
  FileText,
  Wallet,
  CreditCard,
  Crown,
  Camera,
  DollarSign,
  ExternalLink,
  Clock,
  CheckCircle,
  XCircle,
  Upload,
  LayoutDashboard,
  Trophy,
  Users,
  BarChart3,
} from "lucide-react-native";

import { useAuthStore } from "@/lib/state/auth-store";
import {
  useDeletionRequestStore,
  DELETION_REQUEST_TYPE_LABELS,
} from "@/lib/state/deletion-request-store";
import {
  useTenantStore,
  selectSchoolWhatsApp,
  selectSchoolName,
  selectHasFinanceAccess,
} from "@/lib/state/tenant-store";
import { StudentToSchoolButton } from "@/components/WhatsAppButton";
import { LanguageSelector } from "@/components/LanguageSelector";
import { useTranslations } from "@/lib/i18n";
import { useLanguageStore } from "@/lib/i18n/language-store";
import { BeltBadge } from "@/components/BeltBadge";

import {
  waitForAuthReady,
  ensureSignedIn,
  auth,
  db,
} from "@/lib/firebase-config";
import {
  doc,
  onSnapshot,
  updateDoc,
  setDoc,
  deleteDoc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";

import { signOut, deleteUser } from "firebase/auth";
import type { DeletionRequestType } from "@/types";

import { beltColor, getBeltDisplay } from "@/lib/belt";
import type { BeltHistoryEntry, BeltRank } from "@/lib/belt";
import { BELT_LABELS, BELT_HEX } from "@/lib/belt";
import { buildBeltTimeline, formatDuration } from "@/lib/belt-intelligence";
import { useUserRole } from "@/lib/hooks/useUserRole";

import { uploadProfilePhoto, deleteProfilePhoto } from "@/lib/uploadProfilePhoto";
import { uploadPaymentProof } from "@/lib/uploadPaymentProof";

// Tatame Design System — Dark Theme
const COLORS = {
  background: "#0B1220",
  card: "#111827",
  cardBorder: "rgba(255, 255, 255, 0.06)",
  text: "#FFFFFF",
  textSecondary: "rgba(255, 255, 255, 0.7)",
  textMuted: "rgba(255, 255, 255, 0.5)",
  accent: "#FBBF24",
  accentGlow: "rgba(251, 191, 36, 0.3)",
  accentLight: "rgba(251, 191, 36, 0.15)",
  border: "rgba(255, 255, 255, 0.08)",
  shadowColor: "#FBBF24",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
  blue: "#4C7BF4",
  inputBackground: "#1F2937",
};

interface UserData {
  name?: string;
  phone?: string;
  instagram?: string;
  role?: string;
  schoolId?: string;
  beltRank?: BeltRank;
  stripes?: number;
  beltHistory?: BeltHistoryEntry[];
  photoURL?: string | null;
}

export default function ProfileScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { role: userRole } = useUserRole();
  const isStudent = userRole === "student";
  const isCoach = userRole === "coach";
  const isManager = userRole === "manager";

  // Debug: log role and My Payments visibility
  useEffect(() => {
    const uid = auth.currentUser?.uid ?? "unknown";
    console.log("[Profile] uid:", uid, "| role:", userRole, "| isStudent:", isStudent, "| My Payments visible:", isStudent);
  }, [userRole, isStudent]);

  const tr = useTranslations();
  useLanguageStore((s) => s.locale);

  // Tenant store for WhatsApp
  const schoolWhatsApp = useTenantStore(selectSchoolWhatsApp);
  const schoolName = useTenantStore(selectSchoolName);
  const hasFinance = useTenantStore(selectHasFinanceAccess);

  // Firestore user data
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [instagram, setInstagram] = useState("");

  // Email from auth
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [authUid, setAuthUid] = useState<string | null>(null);

  // School name fetched from schools collection
  const [fetchedSchoolName, setFetchedSchoolName] = useState<string | null>(
    null
  );

  // Deletion request modal state
  const [showDeletionModal, setShowDeletionModal] = useState(false);
  const [deletionType, setDeletionType] =
    useState<DeletionRequestType>("delete_account");
  const [deletionSubmitted, setDeletionSubmitted] = useState(false);

  // Account deletion state
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // Deletion request store
  const addDeletionRequest = useDeletionRequestStore((s) => s.addRequest);

  // Profile photo state
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [avatarData, setAvatarData] = useState<{
    avatar_url: string;
    file_id: string;
  } | null>(null);

  // Payment requests state (students only)
  type PaymentStatus = "due" | "submitted" | "approved" | "rejected";
  type PaymentRequest = {
    id: string;
    title: string;
    amount: number;
    currency: string;
    dueDate: Date;
    studentUid: string;
    studentName: string;
    schoolId: string;
    note?: string;
    paymentInstructions?: string;
    paymentLink?: string;
    status: PaymentStatus;
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
    createdByName: string;
    proofUrl?: string;
    proofUploadedAt?: Date;
    reviewNote?: string;
  };
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentRequest | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);

  // Load user data from Firestore
  useEffect(() => {
    let unsubscribeUser: (() => void) | undefined;
    let unsubscribeAvatar: (() => void) | undefined;

    const loadUserData = async () => {
      try {
        await waitForAuthReady();
        await ensureSignedIn();
        const uid = auth.currentUser?.uid;
        const email = auth.currentUser?.email;

        setAuthEmail(email || null);
        setAuthUid(uid || null);

        if (!uid) {
          setLoading(false);
          return;
        }

        // Listen to user doc
        const userRef = doc(db, "users", uid);
        unsubscribeUser = onSnapshot(
          userRef,
          async (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.data() as UserData;
              setUserData(data);
              setName(data.name || "");
              setPhone(data.phone || "");
              setInstagram(data.instagram || "");

              if (data.schoolId) {
                try {
                  const schoolRef = doc(db, "schools", data.schoolId);
                  const schoolSnap = await getDoc(schoolRef);
                  if (schoolSnap.exists()) {
                    const schoolData = schoolSnap.data();
                    setFetchedSchoolName((schoolData as any)?.name || null);
                  }
                } catch (schoolError) {
                  console.log("[Profile] Error fetching school:", schoolError);
                }
              }
            }
            setLoading(false);
          },
          (error) => {
            console.log("[Profile] Error loading user:", error);
            setLoading(false);
          }
        );

        // Listen to user_avatars doc
        const avatarRef = doc(db, "user_avatars", uid);
        unsubscribeAvatar = onSnapshot(
          avatarRef,
          (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.data();
              setAvatarData({
                avatar_url: data.avatar_url || "",
                file_id: data.file_id || "",
              });
            } else {
              setAvatarData(null);
            }
          },
          (error) => {
            console.log("[Profile] Error loading avatar:", error);
          }
        );
      } catch (error) {
        console.log("[Profile] Error setting up listener:", error);
        setLoading(false);
      }
    };

    loadUserData();

    return () => {
      if (unsubscribeUser) unsubscribeUser();
      if (unsubscribeAvatar) unsubscribeAvatar();
    };
  }, []);

  // Legacy payment_requests collection is no longer used.
  // Invoices (schools/{schoolId}/invoices) are now the source of truth.
  // The /my-payments screen loads invoices directly.
  useEffect(() => {
    if (!isStudent) return;
    setPaymentRequests([]);
    setPaymentsLoading(false);
  }, [isStudent]);

  const handleSave = async () => {
    const uid = auth.currentUser?.uid;

    if (!uid) {
      Alert.alert("Error", "Not signed in");
      return;
    }

    setSaving(true);
    try {
      const userRef = doc(db, "users", uid);

      // Only update name, phone, instagram - NOT role or schoolId
      await updateDoc(userRef, {
        name: name.trim(),
        phone: phone.trim(),
        instagram: instagram.trim(),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", "Your profile has been updated.");
      setIsEditing(false);
    } catch (error) {
      console.log("[Profile] Error saving:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", "Failed to save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await signOut(auth);
    } catch (_) {}
    logout();
    router.replace("/welcome");
  };

  const handleChangePhoto = async () => {
    const pick = async (useCamera: boolean) => {
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Permission Required",
            "Camera access is needed to take a photo."
          );
          return null;
        }
        return ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          allowsEditing: true,
          quality: 0.8,
        });
      } else {
        const { status } =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Permission Required",
            "Photo library access is needed to choose a photo."
          );
          return null;
        }
        return ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsEditing: true,
          quality: 0.8,
        });
      }
    };

    Alert.alert("Change Photo", "Choose a source", [
      {
        text: "Camera",
        onPress: async () => {
          const result = await pick(true);
          if (!result || result.canceled || !result.assets?.[0]) return;
          await uploadAndSave(result.assets[0].uri);
        },
      },
      {
        text: "Photo Library",
        onPress: async () => {
          const result = await pick(false);
          if (!result || result.canceled || !result.assets?.[0]) return;
          await uploadAndSave(result.assets[0].uri);
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const uploadAndSave = async (uri: string) => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        Alert.alert("Error", "You must be signed in to change your photo.");
        return;
      }

      setUploadingPhoto(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Delete old file from storage if exists
      if (avatarData?.file_id) {
        try {
          await deleteProfilePhoto(avatarData.file_id);
        } catch {
          // Old file may already be gone, continue
        }
      }

      const result = await uploadProfilePhoto(uri);

      // Save to user_avatars collection
      const avatarRef = doc(db, "user_avatars", uid);
      await setDoc(avatarRef, {
        user_id: uid,
        avatar_url: result.url,
        file_id: result.id,
        updatedAt: serverTimestamp(),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      console.log("[Profile] Photo upload error:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", "Upload failed. Try again.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = () => {
    Alert.alert(
      "Remove Photo",
      "Are you sure you want to remove your profile photo?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            const uid = auth.currentUser?.uid;
            if (!uid) return;

            setUploadingPhoto(true);
            try {
              // Delete file from storage
              if (avatarData?.file_id) {
                await deleteProfilePhoto(avatarData.file_id);
              }

              // Delete the user_avatars document
              const avatarRef = doc(db, "user_avatars", uid);
              await deleteDoc(avatarRef);

              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success
              );
            } catch (error: any) {
              console.log("[Profile] Photo removal error:", error);
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Error
              );
              Alert.alert("Error", "Could not remove photo. Please try again.");
            } finally {
              setUploadingPhoto(false);
            }
          },
        },
      ]
    );
  };

  const handleUploadProof = async (paymentId: string) => {
    Alert.alert(tr.paymentRequests.uploadProof, tr.paymentRequests.submitPaymentConfirmation, [
      { text: tr.paymentRequests.cancel, style: "cancel" },
      {
        text: tr.paymentRequests.uploadProof,
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== "granted") {
            Alert.alert("Permission Required", "Photo library access is needed.");
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            quality: 0.8,
          });
          if (result.canceled || !result.assets?.[0]) return;

          setUploadingProof(true);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          try {
            const uploaded = await uploadPaymentProof(result.assets[0].uri);
            await updateDoc(doc(db, "payment_requests", paymentId), {
              proofUrl: uploaded.url,
              proofUploadedAt: serverTimestamp(),
              status: "submitted",
              updatedAt: serverTimestamp(),
            });
            setSelectedPayment(null);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (e) {
            console.log("[Profile] Proof upload error:", e);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert("Error", "Failed to upload proof. Please try again.");
          } finally {
            setUploadingProof(false);
          }
        },
      },
    ]);
  };

  const menuItems = [
    ...(isManager && hasFinance
      ? [
          {
            icon: <CreditCard size={22} color="#4C7BF4" />,
            label: tr.profileScreen.plansBilling,
            onPress: () => router.push("/(tabs)/plans"),
          },
          {
            icon: <Crown size={22} color="#FBBF24" />,
            label: "Upgrade to Pro",
            onPress: () => router.push("/paywall"),
          },
        ]
      : []),
    ...(isStudent && hasFinance
      ? [
          {
            icon: <Wallet size={22} color="#D4A017" />,
            label: tr.profileScreen.myPayments,
            onPress: () => {
              console.log("[Profile] My Payments tapped → /my-payments");
              router.push("/my-payments");
            },
          },
        ]
      : []),
    ...(isCoach && hasFinance
      ? [
          {
            icon: <Wallet size={22} color="#34D399" />,
            label: tr.profileScreen.payoutMethods,
            onPress: () => router.push("/coach-payout-methods"),
          },
        ]
      : []),
    {
      icon: <Bell size={22} color={COLORS.accent} />,
      label: tr.profileScreen.notifications,
      onPress: () => {},
    },
    {
      icon: <Shield size={22} color={COLORS.accent} />,
      label: tr.profileScreen.privacySecurity,
      onPress: () => router.push("/legal/privacy"),
    },
    {
      icon: <FileText size={22} color={COLORS.accent} />,
      label: tr.profileScreen.waiver,
      onPress: () => router.push("/legal/waiver"),
    },
    {
      icon: <HelpCircle size={22} color={COLORS.accent} />,
      label: tr.profileScreen.helpSupport,
      onPress: () => router.push("/(tabs)/chat"),
    },
  ];

  const handleDataDeletionRequest = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowDeletionModal(true);
    setDeletionSubmitted(false);
  };

  const handleSubmitDeletionRequest = () => {
    if (!user) return;

    addDeletionRequest({
      requesterUserId: user.id,
      requesterName: name || user.name,
      requesterEmail: authEmail || user.email || "",
      requesterPhone: phone || user.phone,
      requestType: deletionType,
    });

    setDeletionSubmitted(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  // Handle permanent account deletion via Cloud Function
  const handleDeleteAccount = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    Alert.alert(
      "Delete Account?",
      "Are you sure you want to delete your account? This will remove all your data.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "This is permanent.",
              "Your account and all associated data will be permanently deleted. This action cannot be undone.",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: executeAccountDeletion },
              ]
            );
          },
        },
      ]
    );
  };

  const executeAccountDeletion = async () => {
    setIsDeletingAccount(true);

    try {
      const currentUser = auth.currentUser;

      if (!currentUser) {
        Alert.alert("Error", "You must be signed in to delete your account.");
        setIsDeletingAccount(false);
        return;
      }

      await deleteUser(currentUser);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      Alert.alert("Account Deleted", "Your account has been successfully deleted.", [
        {
          text: "OK",
          onPress: () => {
            logout();
            router.replace("/welcome");
          },
        },
      ]);
    } catch (error: any) {
      console.log("[Profile] Account deletion error:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

      if (error?.code === "auth/requires-recent-login") {
        Alert.alert(
          "Re-authentication Required",
          "For security, please log out and log in again, then try deleting your account again.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Log Out",
              style: "destructive",
              onPress: async () => {
                try {
                  await signOut(auth);
                  logout();
                  router.replace("/welcome");
                } catch (_) {
                  logout();
                  router.replace("/welcome");
                }
              },
            },
          ]
        );
      } else {
        const errorMessage =
          error?.message || "Failed to delete account. Please try again later.";
        Alert.alert("Error", errorMessage);
      }
    } finally {
      setIsDeletingAccount(false);
    }
  };

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: COLORS.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={{ color: COLORS.textMuted, marginTop: 16 }}>
          {tr.profileScreen.loadingProfile}
        </Text>
      </View>
    );
  }

  const displayRole = userData?.role || user?.role || "student";

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        {/* Header */}
        <View
          style={{
            backgroundColor: "transparent",
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 40,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: "700" }}>
              {tr.nav.profile}
            </Text>
            <Pressable
              onPress={() => {
                if (isEditing) handleSave();
                else setIsEditing(true);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              disabled={saving}
              style={{
                backgroundColor: COLORS.accentLight,
                borderRadius: 12,
                padding: 10,
                borderWidth: 1,
                borderColor: COLORS.cardBorder,
              }}
            >
              {saving ? (
                <ActivityIndicator size="small" color={COLORS.accent} />
              ) : isEditing ? (
                <Save size={22} color={COLORS.accent} />
              ) : (
                <Edit3 size={22} color={COLORS.accent} />
              )}
            </Pressable>
          </View>

          {/* Profile Avatar with Belt Color Glow */}
          <View style={{ alignItems: "center" }}>
            {(() => {
              const belt = getBeltDisplay(
                userData?.role,
                (userData as any)?.beltRank,
                (userData as any)?.stripes
              );
              const ringColor = beltColor(belt.beltRank);
              const photoURL = avatarData?.avatar_url || null;
              const initials = (name || userData?.name || "U")
                .split(" ")
                .map((w) => w[0])
                .join("")
                .toUpperCase()
                .slice(0, 2);

              return (
                <>
                  <Pressable
                    onPress={handleChangePhoto}
                    disabled={uploadingPhoto}
                    style={{
                      borderRadius: 60,
                      padding: 4,
                      marginBottom: 12,
                      borderWidth: 3,
                      borderColor: ringColor,
                      shadowColor: ringColor,
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.65,
                      shadowRadius: 18,
                      elevation: 8,
                    }}
                  >
                    {uploadingPhoto ? (
                      <View
                        style={{
                          backgroundColor: ringColor + "25",
                          borderRadius: 56,
                          width: 96,
                          height: 96,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <ActivityIndicator size="small" color={ringColor} />
                      </View>
                    ) : photoURL ? (
                      <Image
                        source={{ uri: photoURL }}
                        style={{ borderRadius: 56, width: 96, height: 96 }}
                        contentFit="cover"
                        transition={200}
                      />
                    ) : (
                      <View
                        style={{
                          backgroundColor: ringColor + "25",
                          borderRadius: 56,
                          width: 96,
                          height: 96,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={{
                            color: ringColor,
                            fontSize: 32,
                            fontWeight: "700",
                          }}
                        >
                          {initials}
                        </Text>
                      </View>
                    )}

                    {/* Camera overlay badge */}
                    <View
                      style={{
                        position: "absolute",
                        bottom: 10,
                        right: 0,
                        backgroundColor: COLORS.card,
                        borderRadius: 14,
                        width: 28,
                        height: 28,
                        alignItems: "center",
                        justifyContent: "center",
                        borderWidth: 2,
                        borderColor: ringColor,
                      }}
                    >
                      <Camera size={14} color={ringColor} />
                    </View>
                  </Pressable>

                  {/* Photo action buttons */}
                  <View style={{ flexDirection: "row", gap: 12, marginBottom: 4 }}>
                    <Pressable
                      onPress={handleChangePhoto}
                      disabled={uploadingPhoto}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 6,
                        borderRadius: 16,
                        backgroundColor: COLORS.accentLight,
                        borderWidth: 1,
                        borderColor: COLORS.accent + "30",
                      }}
                    >
                      <Text
                        style={{
                          color: COLORS.accent,
                          fontSize: 12,
                          fontWeight: "600",
                        }}
                      >
                        {tr.profileScreen.changePhoto}
                      </Text>
                    </Pressable>

                    {photoURL ? (
                      <Pressable
                        onPress={handleRemovePhoto}
                        disabled={uploadingPhoto}
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 6,
                          borderRadius: 16,
                          backgroundColor: "rgba(239, 68, 68, 0.1)",
                          borderWidth: 1,
                          borderColor: "rgba(239, 68, 68, 0.2)",
                        }}
                      >
                        <Text
                          style={{
                            color: COLORS.danger,
                            fontSize: 12,
                            fontWeight: "600",
                          }}
                        >
                          {tr.profileScreen.removePhoto}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </>
              );
            })()}

            <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: "600" }}>
              {name || userData?.name || "User"}
            </Text>
            <Text
              style={{
                color: COLORS.textMuted,
                fontSize: 14,
                marginTop: 4,
                textTransform: "capitalize",
              }}
            >
              {displayRole}
            </Text>

            {fetchedSchoolName && (
              <Text style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 2 }}>
                {fetchedSchoolName}
              </Text>
            )}

            {/* Belt badge under name */}
            {((userData as any)?.beltRank || userData?.role === "manager") && (
              <View style={{ marginTop: 8 }}>
                {(() => {
                  const belt = getBeltDisplay(
                    userData?.role,
                    (userData as any)?.beltRank,
                    (userData as any)?.stripes
                  );
                  return (
                    <BeltBadge
                      beltRank={belt.beltRank}
                      stripes={belt.stripes}
                      stripeColor={belt.stripeColor || undefined}
                      size="md"
                    />
                  );
                })()}
              </View>
            )}
          </View>
        </View>

        <ScrollView style={{ flex: 1, marginTop: -20 }} showsVerticalScrollIndicator={false}>
          {/* Profile Info Card - Glass Style */}
          <Animated.View
            entering={FadeInDown.springify()}
            style={{
              backgroundColor: COLORS.card,
              borderRadius: 20,
              padding: 20,
              marginHorizontal: 20,
              marginTop: 36,
              marginBottom: 16,
              borderWidth: 1,
              borderColor: COLORS.cardBorder,
            }}
          >
            <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: "600", marginBottom: 16 }}>
              {tr.profileScreen.personalInfo}
            </Text>

            {/* Name */}
            <View style={{ marginBottom: 16 }}>
              <Text style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 8 }}>
                {tr.profileScreen.fullName}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <User size={20} color={COLORS.textMuted} />
                {isEditing ? (
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="Enter your name"
                    placeholderTextColor={COLORS.textMuted}
                    style={{
                      flex: 1,
                      marginLeft: 12,
                      color: COLORS.text,
                      fontSize: 15,
                      backgroundColor: COLORS.inputBackground,
                      borderRadius: 12,
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                    }}
                  />
                ) : (
                  <Text style={{ marginLeft: 12, color: COLORS.textSecondary, fontSize: 15 }}>
                    {name || tr.profileScreen.notSet}
                  </Text>
                )}
              </View>
            </View>

            {/* Email (read-only) */}
            <View style={{ marginBottom: 16 }}>
              <Text style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 8 }}>
                {tr.profileScreen.email}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Mail size={20} color={COLORS.textMuted} />
                <Text style={{ marginLeft: 12, color: COLORS.textMuted, fontSize: 15 }}>
                  {authEmail || tr.profileScreen.notSet}
                </Text>
              </View>
            </View>

            {/* Phone */}
            <View style={{ marginBottom: 16 }}>
              <Text style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 8 }}>
                {tr.profileScreen.phoneOptional}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Phone size={20} color={COLORS.textMuted} />
                {isEditing ? (
                  <TextInput
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="+1 (555) 123-4567"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="phone-pad"
                    style={{
                      flex: 1,
                      marginLeft: 12,
                      color: COLORS.text,
                      fontSize: 15,
                      backgroundColor: COLORS.inputBackground,
                      borderRadius: 12,
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                    }}
                  />
                ) : (
                  <Text style={{ marginLeft: 12, color: COLORS.textSecondary, fontSize: 15 }}>
                    {phone || tr.profileScreen.notSet}
                  </Text>
                )}
              </View>
            </View>

            {/* Instagram */}
            <View>
              <Text style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 8 }}>
                {tr.profileScreen.instagramOptional}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Instagram size={20} color={COLORS.textMuted} />
                {isEditing ? (
                  <TextInput
                    value={instagram}
                    onChangeText={setInstagram}
                    placeholder="@username"
                    placeholderTextColor={COLORS.textMuted}
                    autoCapitalize="none"
                    style={{
                      flex: 1,
                      marginLeft: 12,
                      color: COLORS.text,
                      fontSize: 15,
                      backgroundColor: COLORS.inputBackground,
                      borderRadius: 12,
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                    }}
                  />
                ) : (
                  <Text style={{ marginLeft: 12, color: COLORS.textSecondary, fontSize: 15 }}>
                    {instagram || tr.profileScreen.notSet}
                  </Text>
                )}
              </View>
            </View>

            {isEditing && (
              <Pressable
                onPress={handleSave}
                disabled={saving}
                style={{
                  backgroundColor: COLORS.accent,
                  borderRadius: 12,
                  paddingVertical: 14,
                  marginTop: 24,
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={{ color: "#FFFFFF", textAlign: "center", fontWeight: "600", fontSize: 15 }}>
                    {tr.profileScreen.saveChanges}
                  </Text>
                )}
              </Pressable>
            )}
          </Animated.View>

          {/* Manager Tools — shown only to managers */}
          {isManager && (
            <Animated.View
              entering={FadeInDown.delay(85).springify()}
              style={{
                backgroundColor: COLORS.card,
                borderRadius: 20,
                padding: 20,
                marginHorizontal: 20,
                marginBottom: 16,
                borderWidth: 1,
                borderColor: "rgba(76, 123, 244, 0.25)",
              }}
            >
              {/* Section header */}
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
                <View
                  style={{
                    backgroundColor: "rgba(76,123,244,0.15)",
                    borderRadius: 10,
                    padding: 8,
                    marginRight: 12,
                  }}
                >
                  <LayoutDashboard size={20} color={COLORS.blue} />
                </View>
                <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: "700", flex: 1 }}>
                  {tr.admin.managerTools}
                </Text>
                <View
                  style={{
                    backgroundColor: "rgba(76,123,244,0.15)",
                    borderRadius: 8,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                  }}
                >
                  <Text style={{ color: COLORS.blue, fontSize: 10, fontWeight: "700" }}>ADMIN</Text>
                </View>
              </View>

              {/* Tool grid: 2 columns */}
              {[
                [
                  { icon: <LayoutDashboard size={20} color={COLORS.blue} />, label: tr.admin.managerPanel, route: "/manager" as const },
                  ...(hasFinance ? [{ icon: <DollarSign size={20} color="#10B981" />, label: tr.admin.payments, route: "/manager-payment-requests" as const }] : []),
                ],
                [
                  { icon: <Trophy size={20} color="#F59E0B" />, label: tr.competitions.title, route: "/competitions" as const },
                  ...(hasFinance ? [{ icon: <BarChart3 size={20} color="#A78BFA" />, label: tr.admin.coachPayouts, route: "/coach-payouts" as const }] : []),
                ],
                [
                  ...(hasFinance ? [{ icon: <CreditCard size={20} color={COLORS.blue} />, label: tr.plans.plansBilling, route: "/(tabs)/plans" as const }] : []),
                  { icon: <Users size={20} color="#34D399" />, label: tr.admin.adminDashboard, route: "/(tabs)/admin" as const },
                ],
              ].filter((row) => row.length > 0).map((row, rowIdx) => (
                <View key={rowIdx} style={{ flexDirection: "row", gap: 10, marginBottom: rowIdx < 2 ? 10 : 0 }}>
                  {row.map((item) => (
                    <Pressable
                      key={item.label}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        router.push(item.route as any);
                      }}
                      style={{
                        flex: 1,
                        backgroundColor: COLORS.inputBackground,
                        borderRadius: 14,
                        padding: 14,
                        alignItems: "center",
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        gap: 8,
                      }}
                    >
                      <View
                        style={{
                          backgroundColor: "rgba(255,255,255,0.06)",
                          borderRadius: 10,
                          padding: 8,
                        }}
                      >
                        {item.icon}
                      </View>
                      <Text
                        style={{
                          color: COLORS.textSecondary,
                          fontSize: 12,
                          fontWeight: "600",
                          textAlign: "center",
                        }}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ))}
            </Animated.View>
          )}

          {/* Promotion Timeline — shown to all users with belt history */}
          {(() => {
            const beltHistory = userData?.beltHistory ?? [];
            const currentBelt = (userData as any)?.beltRank as BeltRank | undefined;
            if (!currentBelt || beltHistory.length === 0) return null;
            const timeline = buildBeltTimeline(currentBelt, beltHistory);

            return (
              <Animated.View
                entering={FadeInDown.delay(90).springify()}
                style={{
                  backgroundColor: COLORS.card,
                  borderRadius: 20,
                  padding: 20,
                  marginHorizontal: 20,
                  marginBottom: 16,
                  borderWidth: 1,
                  borderColor: COLORS.cardBorder,
                }}
              >
                <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: "600", marginBottom: 16 }}>
                  {tr.profileScreen.beltJourney}
                </Text>

                {timeline.map((entry, idx) => {
                  const entryColor = BELT_HEX[entry.beltRank] ?? "#64748B";
                  const label = BELT_LABELS[entry.beltRank] ?? entry.beltRank;

                  return (
                    <View key={entry.beltRank} style={{ flexDirection: "row", marginBottom: 0 }}>
                      <View style={{ alignItems: "center", width: 28, marginRight: 12 }}>
                        <View
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: 7,
                            backgroundColor: entry.isCurrent ? entryColor : "rgba(255,255,255,0.15)",
                            borderWidth: entry.isCurrent ? 2 : 1,
                            borderColor: entry.isCurrent ? entryColor : "rgba(255,255,255,0.2)",
                            shadowColor: entry.isCurrent ? entryColor : "transparent",
                            shadowOffset: { width: 0, height: 0 },
                            shadowOpacity: 0.8,
                            shadowRadius: 6,
                          }}
                        />
                        {idx < timeline.length - 1 && (
                          <View
                            style={{
                              width: 1,
                              flex: 1,
                              minHeight: 28,
                              backgroundColor: "rgba(255,255,255,0.1)",
                              marginVertical: 3,
                            }}
                          />
                        )}
                      </View>

                      <View style={{ flex: 1, paddingBottom: idx < timeline.length - 1 ? 16 : 0 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Text
                            style={{
                              color: entry.isCurrent ? entryColor : COLORS.textSecondary,
                              fontWeight: entry.isCurrent ? "700" : "500",
                              fontSize: 14,
                            }}
                          >
                            {label} Belt
                          </Text>
                          {entry.isCurrent && (
                            <View
                              style={{
                                backgroundColor: entryColor + "20",
                                borderRadius: 6,
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                              }}
                            >
                              <Text style={{ color: entryColor, fontSize: 10, fontWeight: "700" }}>
                                {tr.profileScreen.current}
                              </Text>
                            </View>
                          )}
                        </View>

                        <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                          {entry.daysOnBelt !== null
                            ? entry.isCurrent
                              ? `${formatDuration(entry.daysOnBelt)} on this belt`
                              : formatDuration(entry.daysOnBelt)
                            : "Started"}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </Animated.View>
            );
          })()}

          {/* Menu Items + Language */}
          <Animated.View
            entering={FadeInDown.delay(100).springify()}
            style={{
              backgroundColor: COLORS.card,
              borderRadius: 20,
              marginHorizontal: 20,
              marginBottom: 16,
              borderWidth: 1,
              borderColor: COLORS.cardBorder,
              overflow: "hidden",
            }}
          >
            {menuItems.map((item, index) => (
              <Pressable
                key={item.label}
                onPress={() => {
                  item.onPress();
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  padding: 16,
                  borderBottomWidth: index < menuItems.length - 1 ? 1 : 0,
                  borderBottomColor: COLORS.border,
                }}
              >
                <View style={{ backgroundColor: COLORS.accentLight, borderRadius: 10, padding: 8, marginRight: 14 }}>
                  {item.icon}
                </View>
                <Text style={{ flex: 1, color: COLORS.text, fontWeight: "500", fontSize: 15 }}>
                  {item.label}
                </Text>
                <ChevronRight size={20} color={COLORS.textMuted} />
              </Pressable>
            ))}
            <LanguageSelector />
          </Animated.View>

          {/* WhatsApp Contact Section - Students Only */}
          {isStudent && (
            <Animated.View
              entering={FadeInDown.delay(125).springify()}
              style={{
                backgroundColor: COLORS.card,
                borderRadius: 20,
                padding: 20,
                marginHorizontal: 20,
                marginBottom: 16,
                borderWidth: 1,
                borderColor: COLORS.cardBorder,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
                <View style={{ backgroundColor: "rgba(37, 211, 102, 0.15)", borderRadius: 10, padding: 8, marginRight: 12 }}>
                  <MessageCircle size={20} color="#25D366" />
                </View>
                <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: "600" }}>
                  {tr.profileScreen.contactUs}
                </Text>
              </View>

              <StudentToSchoolButton schoolPhone={schoolWhatsApp} studentName={name || userData?.name} />
            </Animated.View>
          )}

          {/* Data Deletion Request */}
          <Animated.View entering={FadeInDown.delay(180).springify()} style={{ paddingHorizontal: 20, marginBottom: 16 }}>
            <Pressable
              onPress={handleDataDeletionRequest}
              style={{
                backgroundColor: COLORS.card,
                borderRadius: 20,
                padding: 16,
                flexDirection: "row",
                alignItems: "center",
                borderWidth: 1,
                borderColor: COLORS.cardBorder,
              }}
            >
              <View style={{ backgroundColor: COLORS.inputBackground, borderRadius: 10, padding: 8, marginRight: 14 }}>
                <Trash2 size={20} color={COLORS.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.text, fontWeight: "500", fontSize: 15 }}>
                  {tr.profileScreen.requestDeletion}
                </Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                  {tr.profileScreen.submitDeletionDesc}
                </Text>
              </View>
              <ChevronRight size={20} color={COLORS.textMuted} />
            </Pressable>
          </Animated.View>

          {/* Delete Account Button */}
          <Animated.View entering={FadeInDown.delay(190).springify()} style={{ paddingHorizontal: 20, marginBottom: 16 }}>
            <Pressable
              onPress={handleDeleteAccount}
              disabled={isDeletingAccount}
              style={{
                backgroundColor: "rgba(255, 59, 48, 0.12)",
                borderRadius: 20,
                padding: 16,
                flexDirection: "row",
                alignItems: "center",
                borderWidth: 1,
                borderColor: "rgba(255, 59, 48, 0.25)",
                opacity: isDeletingAccount ? 0.6 : 1,
              }}
            >
              {isDeletingAccount ? (
                <ActivityIndicator size="small" color={COLORS.danger} style={{ marginRight: 14 }} />
              ) : (
                <View style={{ backgroundColor: "rgba(255, 59, 48, 0.15)", borderRadius: 10, padding: 8, marginRight: 14 }}>
                  <Trash2 size={20} color={COLORS.danger} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.danger, fontWeight: "600", fontSize: 15 }}>
                  {tr.profileScreen.deleteAccount}
                </Text>
                <Text style={{ color: COLORS.danger, fontSize: 12, marginTop: 2, opacity: 0.8 }}>
                  {tr.profileScreen.deleteAccountDesc}
                </Text>
              </View>
            </Pressable>
          </Animated.View>

          {/* Logout Button */}
          <Animated.View entering={FadeInDown.delay(200).springify()} style={{ paddingHorizontal: 20, marginBottom: 16 }}>
            <Pressable
              onPress={handleLogout}
              style={{
                backgroundColor: "rgba(255, 59, 48, 0.12)",
                borderRadius: 20,
                padding: 16,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "rgba(255, 59, 48, 0.25)",
              }}
            >
              <LogOut size={22} color={COLORS.danger} />
              <Text style={{ color: COLORS.danger, fontWeight: "500", marginLeft: 8, fontSize: 15 }}>
                {tr.profileScreen.logOut}
              </Text>
            </Pressable>
          </Animated.View>

          {/* App Info */}
          <Animated.View entering={FadeInDown.delay(300).springify()} style={{ alignItems: "center", paddingVertical: 32 }}>
            <RNImage
              source={require("../../../assets/images/ayon-logo.png")}
              style={{ width: 180, height: 90, opacity: 0.9 }}
              resizeMode="contain"
            />
          </Animated.View>

          <View style={{ height: 32 }} />
        </ScrollView>
      </SafeAreaView>

      {/* Data Deletion Request Modal */}
      <Modal visible={showDeletionModal} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: "rgba(0, 0, 0, 0.7)", justifyContent: "flex-end" }}>
          <Animated.View
            entering={FadeIn}
            style={{
              backgroundColor: "#111827",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              paddingBottom: 40,
              borderTopWidth: 1,
              borderColor: COLORS.cardBorder,
            }}
          >
            {deletionSubmitted ? (
              <View style={{ alignItems: "center", paddingVertical: 24 }}>
                <View
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 40,
                    backgroundColor: "rgba(52, 199, 89, 0.2)",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 24,
                  }}
                >
                  <Check size={40} color={COLORS.success} />
                </View>
                <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: "600", textAlign: "center", marginBottom: 12 }}>
                  {tr.profileScreen.requestSubmitted}
                </Text>
                <Text style={{ color: COLORS.textMuted, textAlign: "center", marginBottom: 24, lineHeight: 20 }}>
                  {tr.profileScreen.requestSubmittedBody}
                </Text>
                <Pressable
                  onPress={() => setShowDeletionModal(false)}
                  style={{ backgroundColor: COLORS.accent, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32 }}
                >
                  <Text style={{ color: "#FFFFFF", fontWeight: "600" }}>
                    {tr.profileScreen.done}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
                  <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: "600" }}>
                    {tr.profileScreen.requestDataDeletion}
                  </Text>
                  <Pressable
                    onPress={() => setShowDeletionModal(false)}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: COLORS.inputBackground,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <X size={20} color={COLORS.textMuted} />
                  </Pressable>
                </View>

                <View
                  style={{
                    backgroundColor: "rgba(255, 149, 0, 0.15)",
                    borderRadius: 12,
                    padding: 16,
                    flexDirection: "row",
                    alignItems: "flex-start",
                    marginBottom: 24,
                    borderWidth: 1,
                    borderColor: "rgba(255, 149, 0, 0.25)",
                  }}
                >
                  <AlertTriangle size={20} color={COLORS.warning} />
                  <Text style={{ color: COLORS.textSecondary, fontSize: 13, marginLeft: 12, flex: 1, lineHeight: 18 }}>
                    {tr.profileScreen.deletionWarning}
                  </Text>
                </View>

                <Text style={{ color: COLORS.text, marginBottom: 12, fontWeight: "500" }}>
                  {tr.profileScreen.whatToDelete}
                </Text>

                {(["delete_account", "delete_chat", "delete_all"] as DeletionRequestType[]).map((type) => (
                  <Pressable
                    key={type}
                    onPress={() => {
                      setDeletionType(type);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      padding: 16,
                      marginBottom: 8,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: deletionType === type ? COLORS.accent : COLORS.border,
                      backgroundColor: deletionType === type ? COLORS.accentLight : COLORS.inputBackground,
                    }}
                  >
                    <View
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        borderWidth: 2,
                        borderColor: deletionType === type ? COLORS.accent : COLORS.textMuted,
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: 12,
                      }}
                    >
                      {deletionType === type && (
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.accent }} />
                      )}
                    </View>
                    <Text
                      style={{
                        flex: 1,
                        color: deletionType === type ? COLORS.accent : COLORS.text,
                        fontWeight: deletionType === type ? "500" : "400",
                      }}
                    >
                      {DELETION_REQUEST_TYPE_LABELS[type]}
                    </Text>
                  </Pressable>
                ))}

                <View
                  style={{
                    backgroundColor: COLORS.inputBackground,
                    borderRadius: 12,
                    padding: 16,
                    marginTop: 8,
                    marginBottom: 24,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                  }}
                >
                  <Text style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 8 }}>
                    {tr.profileScreen.requestSubmittedFor}
                  </Text>
                  <Text style={{ color: COLORS.text, fontWeight: "500" }}>
                    {name || userData?.name || user?.name}
                  </Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 2 }}>
                    {authEmail || user?.email}
                  </Text>
                </View>

                <View style={{ flexDirection: "row" }}>
                  <Pressable
                    onPress={() => setShowDeletionModal(false)}
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      borderRadius: 12,
                      paddingVertical: 14,
                      marginRight: 8,
                    }}
                  >
                    <Text style={{ color: COLORS.textMuted, textAlign: "center", fontWeight: "500" }}>
                      {tr.common.cancel}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handleSubmitDeletionRequest}
                    style={{
                      flex: 1,
                      backgroundColor: COLORS.danger,
                      borderRadius: 12,
                      paddingVertical: 14,
                      marginLeft: 8,
                    }}
                  >
                    <Text style={{ color: "#FFFFFF", textAlign: "center", fontWeight: "500" }}>
                      {tr.profileScreen.submitRequest}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </Animated.View>
        </View>
      </Modal>

      {/* Student Payment Detail Modal */}
      <Modal visible={!!selectedPayment} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: "#111827", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: "85%", borderTopWidth: 1, borderColor: COLORS.cardBorder }}>
            {selectedPayment && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: "700", flex: 1, marginRight: 12 }}>{selectedPayment.title}</Text>
                  <Pressable onPress={() => setSelectedPayment(null)} style={{ backgroundColor: COLORS.inputBackground, borderRadius: 20, padding: 8 }}>
                    <X size={20} color={COLORS.textMuted} />
                  </Pressable>
                </View>

                {/* Status badge */}
                {(() => {
                  const isOverdue = selectedPayment.status === "due" && selectedPayment.dueDate < new Date();
                  type PaymentStatusLocal = "due" | "submitted" | "approved" | "rejected";
                  const cfgs: Record<PaymentStatusLocal, { bg: string; color: string; border: string; label: string }> = {
                    due: { bg: "rgba(251,191,36,0.15)", color: COLORS.warning, border: "rgba(251,191,36,0.3)", label: tr.paymentRequests.due },
                    submitted: { bg: "rgba(76,123,244,0.15)", color: COLORS.blue, border: "rgba(76,123,244,0.3)", label: tr.paymentRequests.submitted },
                    approved: { bg: "rgba(16,185,129,0.15)", color: COLORS.success, border: "rgba(16,185,129,0.3)", label: tr.paymentRequests.approved },
                    rejected: { bg: "rgba(239,68,68,0.15)", color: COLORS.danger, border: "rgba(239,68,68,0.3)", label: tr.paymentRequests.rejected },
                  };
                  const cfg = cfgs[selectedPayment.status as PaymentStatusLocal] ?? cfgs.due;
                  const bg = isOverdue ? "rgba(239,68,68,0.15)" : cfg.bg;
                  const color = isOverdue ? COLORS.danger : cfg.color;
                  const border = isOverdue ? "rgba(239,68,68,0.3)" : cfg.border;
                  const label = isOverdue ? tr.paymentRequests.overdue : cfg.label;
                  return (
                    <View style={{ alignSelf: "flex-start", backgroundColor: bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: border, marginBottom: 16 }}>
                      <Text style={{ color, fontWeight: "700", fontSize: 12 }}>{label}</Text>
                    </View>
                  );
                })()}

                {/* Info rows */}
                {[
                  { label: tr.paymentRequests.amount, value: `${selectedPayment.currency} ${selectedPayment.amount.toFixed(2)}` },
                  { label: tr.paymentRequests.dueDate, value: selectedPayment.dueDate.toLocaleDateString() },
                ].map((row) => (
                  <View key={row.label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                    <Text style={{ color: COLORS.textMuted, fontSize: 14 }}>{row.label}</Text>
                    <Text style={{ color: COLORS.text, fontSize: 14, fontWeight: "500" }}>{row.value}</Text>
                  </View>
                ))}

                {selectedPayment.note ? (
                  <View style={{ marginTop: 12, backgroundColor: COLORS.inputBackground, borderRadius: 12, padding: 12 }}>
                    <Text style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>Note</Text>
                    <Text style={{ color: COLORS.textSecondary, fontSize: 14 }}>{selectedPayment.note}</Text>
                  </View>
                ) : null}

                {selectedPayment.paymentInstructions ? (
                  <View style={{ marginTop: 12, backgroundColor: COLORS.inputBackground, borderRadius: 12, padding: 12 }}>
                    <Text style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>{tr.paymentRequests.paymentInstructions}</Text>
                    <Text style={{ color: COLORS.textSecondary, fontSize: 14 }}>{selectedPayment.paymentInstructions}</Text>
                  </View>
                ) : null}

                {selectedPayment.reviewNote ? (
                  <View style={{ marginTop: 12, backgroundColor: "rgba(239,68,68,0.08)", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "rgba(239,68,68,0.2)" }}>
                    <Text style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>{tr.paymentRequests.reviewNote}</Text>
                    <Text style={{ color: COLORS.textSecondary, fontSize: 14 }}>{selectedPayment.reviewNote}</Text>
                  </View>
                ) : null}

                {selectedPayment.proofUrl ? (
                  <View style={{ marginTop: 16 }}>
                    <Text style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 8 }}>{tr.paymentRequests.viewProof}</Text>
                    <Image source={{ uri: selectedPayment.proofUrl }} style={{ width: "100%", height: 200, borderRadius: 12 }} contentFit="cover" />
                  </View>
                ) : null}

                {/* Student actions for "due" status */}
                {selectedPayment.status === "due" && (
                  <View style={{ marginTop: 20, gap: 12 }}>
                    {selectedPayment.paymentLink ? (
                      <Pressable
                        onPress={() => {
                          if (selectedPayment.paymentLink) Linking.openURL(selectedPayment.paymentLink);
                        }}
                        style={{ backgroundColor: COLORS.blue, borderRadius: 14, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}
                      >
                        <ExternalLink size={18} color="#FFF" />
                        <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 15 }}>{tr.paymentRequests.openPaymentLink}</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={() => handleUploadProof(selectedPayment.id)}
                      disabled={uploadingProof}
                      style={{ backgroundColor: COLORS.accent, borderRadius: 14, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, opacity: uploadingProof ? 0.7 : 1 }}
                    >
                      {uploadingProof ? (
                        <ActivityIndicator size="small" color="#000" />
                      ) : (
                        <>
                          <Upload size={18} color="#000" />
                          <Text style={{ color: "#000", fontWeight: "700", fontSize: 15 }}>{tr.paymentRequests.uploadProof}</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}