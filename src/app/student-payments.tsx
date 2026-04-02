import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Modal,
  Animated,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  updateDoc,
  limit as firestoreLimit,
} from "firebase/firestore";
import {
  ChevronLeft,
  Wallet,
  Send,
  X,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  RefreshCw,
  Edit3,
  MessageCircle,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import AnimatedRN, { FadeInDown } from "react-native-reanimated";
import { db, auth } from "@/lib/firebase-config";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import { useFinanceGuard } from "@/lib/premiumAccess";
import { formatDistanceToNow } from "date-fns";

// ── Colors ──────────────────────────────────────────────────────────────────
const C = {
  bg: "#070D1A",
  surface: "rgba(255,255,255,0.04)",
  surfaceHover: "rgba(255,255,255,0.07)",
  border: "rgba(255,255,255,0.08)",
  borderActive: "rgba(76,123,244,0.50)",
  text: "#FFFFFF",
  textSub: "rgba(255,255,255,0.70)",
  textMuted: "rgba(255,255,255,0.40)",
  accent: "#4C7BF4",
  accentBg: "rgba(76,123,244,0.12)",
  gold: "#FBBF24",
  goldBg: "rgba(251,191,36,0.12)",
  success: "#34D399",
  successBg: "rgba(52,211,153,0.12)",
  danger: "#F87171",
  dangerBg: "rgba(248,113,113,0.12)",
  warning: "#FBBF24",
  warningBg: "rgba(251,191,36,0.12)",
  blue: "#60A5FA",
  blueBg: "rgba(96,165,250,0.12)",
  inputBg: "rgba(255,255,255,0.06)",
};

// ── Types ───────────────────────────────────────────────────────────────────
type PaymentType = "membership" | "dropin" | "private";
type InvoiceStatus = "submitted" | "approved" | "rejected" | "due" | "paid";

interface ManualPaymentSettings {
  provider?: string;
  currency?: string;
  membershipMonthlyPrice?: number;
  dropInPrice?: number;
  privatePrice?: number;
  isPaymentEnabled?: boolean;
}

interface StudentInvoice {
  id: string;
  studentUid: string;
  studentName: string;
  type: PaymentType;
  amount: number;
  currency: string;
  description: string;
  status: InvoiceStatus;
  proofNote: string;
  proofUrl: string;
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  approvedAt: any;
  approvedBy: string | null;
  rejectedAt: any;
  rejectedBy: string | null;
}

// ── Toast ───────────────────────────────────────────────────────────────────
function useToast() {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");
  const [type, setType] = useState<"success" | "error">("success");
  const opacity = React.useRef(new Animated.Value(0)).current;

  const show = useCallback(
    (msg: string, t: "success" | "error" = "success") => {
      setMessage(msg);
      setType(t);
      setVisible(true);
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(2500),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(() => setVisible(false));
    },
    [opacity]
  );

  return { show, visible, message, type, opacity };
}

// ── Status helpers ──────────────────────────────────────────────────────────
function statusColor(status: InvoiceStatus): string {
  switch (status) {
    case "submitted": return C.warning;
    case "approved": return C.success;
    case "rejected": return C.danger;
    case "due": return C.blue;
    case "paid": return C.success;
    default: return C.textMuted;
  }
}
function statusBg(status: InvoiceStatus): string {
  switch (status) {
    case "submitted": return C.warningBg;
    case "approved": return C.successBg;
    case "rejected": return C.dangerBg;
    case "due": return C.blueBg;
    case "paid": return C.successBg;
    default: return C.surface;
  }
}
function statusLabel(status: InvoiceStatus): string {
  switch (status) {
    case "submitted": return "Submitted";
    case "approved": return "Approved";
    case "rejected": return "Rejected";
    case "due": return "Due";
    case "paid": return "Paid";
    default: return status;
  }
}
function StatusIcon({ status }: { status: InvoiceStatus }) {
  const color = statusColor(status);
  const s = 14;
  switch (status) {
    case "submitted": return <Clock size={s} color={color} />;
    case "approved": return <CheckCircle size={s} color={color} />;
    case "rejected": return <XCircle size={s} color={color} />;
    case "due": return <Clock size={s} color={color} />;
    case "paid": return <CheckCircle size={s} color={color} />;
    default: return <Clock size={s} color={color} />;
  }
}

const PAYMENT_OPTIONS: { type: PaymentType; label: string; description: string; priceKey: keyof ManualPaymentSettings }[] = [
  { type: "membership", label: "Monthly Membership", description: "Membership", priceKey: "membershipMonthlyPrice" },
  { type: "dropin", label: "Drop-in Class", description: "Drop-in", priceKey: "dropInPrice" },
  { type: "private", label: "Private Lesson", description: "Private", priceKey: "privatePrice" },
];

export default function StudentPaymentsScreen() {
  const router = useRouter();
  const hasFinance = useFinanceGuard();
  const toast = useToast();
  const { uid, schoolId, loading: userLoading } = useCurrentUser();

  const [settings, setSettings] = useState<ManualPaymentSettings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [invoices, setInvoices] = useState<StudentInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [userName, setUserName] = useState("");

  // Modal state
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [selectedType, setSelectedType] = useState<PaymentType | null>(null);
  const [proofNote, setProofNote] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Edit proof modal
  const [editInvoice, setEditInvoice] = useState<StudentInvoice | null>(null);
  const [editProofNote, setEditProofNote] = useState("");
  const [editProofUrl, setEditProofUrl] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Load payment settings
  useEffect(() => {
    if (!schoolId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "schools", schoolId, "payment_settings", "default"));
        if (snap.exists()) {
          setSettings(snap.data() as ManualPaymentSettings);
        } else {
          setSettings(null);
        }
      } catch (e: any) {
        if (e?.code === "permission-denied") {
          toast.show("You don't have access.", "error");
        } else {
          toast.show("Network issue. Try again.", "error");
        }
      } finally {
        setLoadingSettings(false);
      }
    })();
  }, [schoolId]);

  // Load user name
  useEffect(() => {
    if (!uid) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", uid));
        if (snap.exists()) {
          const d = snap.data();
          setUserName(d.displayName ?? d.name ?? "");
        }
      } catch {}
    })();
  }, [uid]);

  // Load invoices
  const loadInvoices = useCallback(async () => {
    if (!schoolId || !uid) return;
    setLoadingInvoices(true);
    try {
      const q = query(
        collection(db, "schools", schoolId, "invoices"),
        where("studentUid", "==", uid),
        orderBy("createdAt", "desc"),
        firestoreLimit(50)
      );
      const snap = await getDocs(q);
      const list: StudentInvoice[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<StudentInvoice, "id">),
      }));
      setInvoices(list);
    } catch (e: any) {
      if (e?.code === "permission-denied") {
        toast.show("You don't have access.", "error");
      } else {
        console.log("[StudentPayments] loadInvoices error", e);
      }
    } finally {
      setLoadingInvoices(false);
    }
  }, [schoolId, uid]);

  useEffect(() => {
    if (!userLoading && schoolId && uid) {
      loadInvoices();
    }
  }, [userLoading, schoolId, uid, loadInvoices]);

  // Submit payment
  const handleSubmit = async () => {
    if (!selectedType || !schoolId || !uid) return;
    const option = PAYMENT_OPTIONS.find((o) => o.type === selectedType);
    if (!option || !settings) return;
    const price = (settings as any)[option.priceKey] ?? 0;

    setSubmitting(true);
    try {
      await addDoc(collection(db, "schools", schoolId, "invoices"), {
        studentUid: uid,
        studentName: userName || "",
        type: selectedType,
        amount: price,
        currency: settings.currency ?? "usd",
        description: option.description,
        status: "submitted",
        proofNote: proofNote.trim() || "",
        proofUrl: proofUrl.trim() || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: uid,
        approvedAt: null,
        approvedBy: null,
        rejectedAt: null,
        rejectedBy: null,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show("Sent to manager for approval.", "success");
      setShowSubmitModal(false);
      setProofNote("");
      setProofUrl("");
      setSelectedType(null);
      // Reload invoices
      loadInvoices();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (e?.code === "permission-denied") {
        toast.show("You don't have access.", "error");
      } else {
        toast.show("Network issue. Try again.", "error");
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Edit proof
  const handleEditProof = async () => {
    if (!editInvoice || !schoolId) return;
    setEditSaving(true);
    try {
      await updateDoc(doc(db, "schools", schoolId, "invoices", editInvoice.id), {
        proofNote: editProofNote.trim(),
        proofUrl: editProofUrl.trim(),
        updatedAt: serverTimestamp(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show("Proof updated.", "success");
      setEditInvoice(null);
      loadInvoices();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (e?.code === "permission-denied") {
        toast.show("You don't have access.", "error");
      } else {
        toast.show("Network issue. Try again.", "error");
      }
    } finally {
      setEditSaving(false);
    }
  };

  const openEditProof = (inv: StudentInvoice) => {
    setEditInvoice(inv);
    setEditProofNote(inv.proofNote || "");
    setEditProofUrl(inv.proofUrl || "");
  };

  const openSubmitModal = (type: PaymentType) => {
    setSelectedType(type);
    setProofNote("");
    setProofUrl("");
    setShowSubmitModal(true);
  };

  // Loading state
  if (userLoading || loadingSettings) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={C.accent} size="large" />
      </View>
    );
  }

  // Not enabled
  const isEnabled = settings?.isPaymentEnabled === true;

  const currency = (settings?.currency ?? "usd").toUpperCase();

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <LinearGradient
        colors={["#0A1628", "#070D1A"]}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 20,
            paddingVertical: 16,
            borderBottomWidth: 1,
            borderBottomColor: C.border,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => ({
              opacity: pressed ? 0.6 : 1,
              padding: 8,
              marginRight: 8,
              borderRadius: 12,
              backgroundColor: C.surface,
            })}
          >
            <ChevronLeft size={22} color={C.text} />
          </Pressable>
          <Wallet size={20} color={C.accent} style={{ marginRight: 8 }} />
          <Text style={{ color: C.text, fontSize: 20, fontWeight: "700", flex: 1 }}>
            Payments
          </Text>
          <Pressable
            onPress={loadInvoices}
            style={({ pressed }) => ({
              opacity: pressed ? 0.5 : 1,
              padding: 8,
              borderRadius: 12,
              backgroundColor: C.surface,
            })}
          >
            <RefreshCw size={18} color={C.textSub} />
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
        >
          {!isEnabled ? (
            /* Payments not enabled */
            <AnimatedRN.View entering={FadeInDown.springify()} style={{ alignItems: "center", paddingTop: 80 }}>
              <View
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 36,
                  backgroundColor: C.accentBg,
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 20,
                }}
              >
                <Wallet size={32} color={C.accent} />
              </View>
              <Text style={{ color: C.text, fontSize: 18, fontWeight: "700", textAlign: "center", marginBottom: 8 }}>
                Payments are not enabled
              </Text>
              <Text style={{ color: C.textMuted, fontSize: 14, textAlign: "center", lineHeight: 20, paddingHorizontal: 20 }}>
                Payments are not enabled for this academy. Contact your manager for more information.
              </Text>
            </AnimatedRN.View>
          ) : (
            <>
              {/* Payment Options */}
              <Text style={{ color: C.textSub, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14 }}>
                Submit Payment
              </Text>

              {PAYMENT_OPTIONS.map((option, idx) => {
                const price = (settings as any)?.[option.priceKey] ?? 0;
                if (price <= 0) return null;
                return (
                  <AnimatedRN.View key={option.type} entering={FadeInDown.delay(idx * 60).springify()}>
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        openSubmitModal(option.type);
                      }}
                      style={({ pressed }) => ({
                        backgroundColor: pressed ? C.surfaceHover : C.surface,
                        borderRadius: 16,
                        padding: 18,
                        marginBottom: 10,
                        borderWidth: 1,
                        borderColor: C.border,
                        flexDirection: "row",
                        alignItems: "center",
                      })}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: C.text, fontSize: 16, fontWeight: "600" }}>
                          {option.label}
                        </Text>
                        <Text style={{ color: C.accent, fontSize: 20, fontWeight: "800", marginTop: 4 }}>
                          {currency} {price.toFixed(2)}
                        </Text>
                      </View>
                      <View
                        style={{
                          backgroundColor: C.accentBg,
                          borderRadius: 12,
                          paddingHorizontal: 16,
                          paddingVertical: 10,
                          borderWidth: 1,
                          borderColor: "rgba(76,123,244,0.25)",
                        }}
                      >
                        <Text style={{ color: C.accent, fontSize: 13, fontWeight: "700" }}>
                          Submit
                        </Text>
                      </View>
                    </Pressable>
                  </AnimatedRN.View>
                );
              })}

              {/* My Payments section */}
              <Text style={{ color: C.textSub, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginTop: 28, marginBottom: 14 }}>
                My Payments
              </Text>

              {loadingInvoices ? (
                <View style={{ paddingVertical: 32, alignItems: "center" }}>
                  <ActivityIndicator color={C.accent} />
                </View>
              ) : invoices.length === 0 ? (
                <View
                  style={{
                    backgroundColor: C.surface,
                    borderRadius: 16,
                    padding: 24,
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: C.border,
                  }}
                >
                  <Text style={{ color: C.textMuted, fontSize: 14 }}>
                    No payment submissions yet.
                  </Text>
                </View>
              ) : (
                <View
                  style={{
                    backgroundColor: C.surface,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: C.border,
                    overflow: "hidden",
                  }}
                >
                  {invoices.map((inv, idx) => {
                    const createdAt = inv.createdAt?.toDate?.();
                    const relativeTime = createdAt
                      ? formatDistanceToNow(createdAt, { addSuffix: true })
                      : "";
                    const isSubmitted = inv.status === "submitted";
                    const isRejected = inv.status === "rejected";

                    return (
                      <React.Fragment key={inv.id}>
                        {idx > 0 && (
                          <View style={{ height: 1, backgroundColor: C.border, marginHorizontal: 16 }} />
                        )}
                        <View style={{ padding: 16 }}>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <View style={{ flex: 1, marginRight: 12 }}>
                              <Text style={{ color: C.text, fontSize: 15, fontWeight: "600" }}>
                                {inv.description}
                              </Text>
                              <Text style={{ color: C.textMuted, fontSize: 12, marginTop: 2 }}>
                                {relativeTime}
                              </Text>
                            </View>
                            <Text style={{ color: C.accent, fontSize: 17, fontWeight: "800" }}>
                              {(inv.currency ?? "usd").toUpperCase()} {inv.amount?.toFixed(2) ?? "0.00"}
                            </Text>
                          </View>

                          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 5,
                                paddingHorizontal: 10,
                                paddingVertical: 4,
                                borderRadius: 20,
                                backgroundColor: statusBg(inv.status as InvoiceStatus),
                              }}
                            >
                              <StatusIcon status={inv.status as InvoiceStatus} />
                              <Text
                                style={{
                                  color: statusColor(inv.status as InvoiceStatus),
                                  fontSize: 12,
                                  fontWeight: "600",
                                }}
                              >
                                {statusLabel(inv.status as InvoiceStatus)}
                              </Text>
                            </View>

                            {isSubmitted && (
                              <Pressable
                                onPress={() => {
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                  openEditProof(inv);
                                }}
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 4,
                                  paddingHorizontal: 10,
                                  paddingVertical: 5,
                                  borderRadius: 8,
                                  backgroundColor: C.accentBg,
                                }}
                              >
                                <Edit3 size={12} color={C.accent} />
                                <Text style={{ color: C.accent, fontSize: 12, fontWeight: "600" }}>
                                  Edit proof
                                </Text>
                              </Pressable>
                            )}
                          </View>

                          {isRejected && (
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 5,
                                marginTop: 8,
                                backgroundColor: C.dangerBg,
                                borderRadius: 8,
                                paddingHorizontal: 10,
                                paddingVertical: 6,
                              }}
                            >
                              <MessageCircle size={12} color={C.danger} />
                              <Text style={{ color: C.danger, fontSize: 12 }}>
                                Contact manager for details
                              </Text>
                            </View>
                          )}
                        </View>
                      </React.Fragment>
                    );
                  })}
                </View>
              )}
            </>
          )}
        </ScrollView>

        {/* Submit Payment Modal */}
        <Modal visible={showSubmitModal} animationType="slide" transparent>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
            <View
              style={{
                backgroundColor: "#111827",
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                padding: 24,
                paddingBottom: 40,
                borderTopWidth: 1,
                borderColor: C.border,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <Text style={{ color: C.text, fontSize: 20, fontWeight: "700" }}>
                  Submit Payment
                </Text>
                <Pressable
                  onPress={() => setShowSubmitModal(false)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: C.inputBg,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <X size={18} color={C.textMuted} />
                </Pressable>
              </View>

              {selectedType && settings && (() => {
                const option = PAYMENT_OPTIONS.find((o) => o.type === selectedType);
                const price = option ? (settings as any)[option.priceKey] ?? 0 : 0;
                return (
                  <View style={{ backgroundColor: C.accentBg, borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: "rgba(76,123,244,0.20)" }}>
                    <Text style={{ color: C.textSub, fontSize: 13 }}>{option?.label}</Text>
                    <Text style={{ color: C.accent, fontSize: 28, fontWeight: "800", marginTop: 4 }}>
                      {currency} {price.toFixed(2)}
                    </Text>
                  </View>
                );
              })()}

              <Text style={{ color: C.textSub, fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                Proof Note (optional)
              </Text>
              <TextInput
                value={proofNote}
                onChangeText={setProofNote}
                placeholder="Add note (optional)"
                placeholderTextColor={C.textMuted}
                multiline
                style={{
                  backgroundColor: C.inputBg,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  color: C.text,
                  fontSize: 15,
                  borderWidth: 1,
                  borderColor: C.border,
                  minHeight: 60,
                  textAlignVertical: "top",
                  marginBottom: 16,
                }}
              />

              <Text style={{ color: C.textSub, fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                Receipt / Link (optional)
              </Text>
              <TextInput
                value={proofUrl}
                onChangeText={setProofUrl}
                placeholder="Paste receipt/link (optional)"
                placeholderTextColor={C.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={{
                  backgroundColor: C.inputBg,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  color: C.text,
                  fontSize: 15,
                  borderWidth: 1,
                  borderColor: C.border,
                  marginBottom: 24,
                }}
              />

              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  onPress={() => setShowSubmitModal(false)}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: C.border,
                    borderRadius: 14,
                    paddingVertical: 14,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: C.textSub, fontWeight: "600", fontSize: 15 }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSubmit}
                  disabled={submitting}
                  style={({ pressed }) => ({
                    flex: 2,
                    backgroundColor: pressed ? "rgba(76,123,244,0.8)" : C.accent,
                    borderRadius: 14,
                    paddingVertical: 14,
                    alignItems: "center",
                    flexDirection: "row",
                    justifyContent: "center",
                    gap: 8,
                    opacity: submitting ? 0.6 : 1,
                  })}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Send size={16} color="#fff" />
                      <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Send to Manager</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Edit Proof Modal */}
        <Modal visible={!!editInvoice} animationType="slide" transparent>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
            <View
              style={{
                backgroundColor: "#111827",
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                padding: 24,
                paddingBottom: 40,
                borderTopWidth: 1,
                borderColor: C.border,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <Text style={{ color: C.text, fontSize: 20, fontWeight: "700" }}>
                  Edit Proof
                </Text>
                <Pressable
                  onPress={() => setEditInvoice(null)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: C.inputBg,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <X size={18} color={C.textMuted} />
                </Pressable>
              </View>

              <Text style={{ color: C.textSub, fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                Proof Note
              </Text>
              <TextInput
                value={editProofNote}
                onChangeText={setEditProofNote}
                placeholder="Add note (optional)"
                placeholderTextColor={C.textMuted}
                multiline
                style={{
                  backgroundColor: C.inputBg,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  color: C.text,
                  fontSize: 15,
                  borderWidth: 1,
                  borderColor: C.border,
                  minHeight: 60,
                  textAlignVertical: "top",
                  marginBottom: 16,
                }}
              />

              <Text style={{ color: C.textSub, fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                Receipt / Link
              </Text>
              <TextInput
                value={editProofUrl}
                onChangeText={setEditProofUrl}
                placeholder="Paste receipt/link (optional)"
                placeholderTextColor={C.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={{
                  backgroundColor: C.inputBg,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  color: C.text,
                  fontSize: 15,
                  borderWidth: 1,
                  borderColor: C.border,
                  marginBottom: 24,
                }}
              />

              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  onPress={() => setEditInvoice(null)}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: C.border,
                    borderRadius: 14,
                    paddingVertical: 14,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: C.textSub, fontWeight: "600", fontSize: 15 }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleEditProof}
                  disabled={editSaving}
                  style={({ pressed }) => ({
                    flex: 2,
                    backgroundColor: pressed ? "rgba(76,123,244,0.8)" : C.accent,
                    borderRadius: 14,
                    paddingVertical: 14,
                    alignItems: "center",
                    opacity: editSaving ? 0.6 : 1,
                  })}
                >
                  {editSaving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Save</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Toast */}
        {toast.visible && (
          <Animated.View
            style={{
              position: "absolute",
              bottom: 40,
              left: 20,
              right: 20,
              opacity: toast.opacity,
              backgroundColor:
                toast.type === "success"
                  ? "rgba(52,211,153,0.95)"
                  : "rgba(248,113,113,0.95)",
              borderRadius: 14,
              padding: 16,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
            }}
          >
            {toast.type === "success" ? (
              <CheckCircle size={18} color="#fff" />
            ) : (
              <AlertCircle size={18} color="#fff" />
            )}
            <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600", flex: 1 }}>
              {toast.message}
            </Text>
          </Animated.View>
        )}
      </SafeAreaView>
    </View>
  );
}
