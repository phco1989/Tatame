import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
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
  query,
  where,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  ChevronLeft,
  FileText,
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  ExternalLink,
  Check,
  X,
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
  text: "#FFFFFF",
  textSub: "rgba(255,255,255,0.70)",
  textMuted: "rgba(255,255,255,0.40)",
  accent: "#4C7BF4",
  accentBg: "rgba(76,123,244,0.12)",
  success: "#34D399",
  successBg: "rgba(52,211,153,0.12)",
  danger: "#F87171",
  dangerBg: "rgba(248,113,113,0.12)",
  warning: "#FBBF24",
  warningBg: "rgba(251,191,36,0.12)",
  inputBg: "rgba(255,255,255,0.06)",
};

// ── Types ───────────────────────────────────────────────────────────────────
// Invoice statuses that map to the proof submission review workflow
type FilterTab = "submitted" | "approved" | "rejected";

// Map UI filter tabs to actual Firestore invoice status values
const STATUS_MAP: Record<FilterTab, string[]> = {
  submitted: ["proof_uploaded", "pending_review"],
  approved: ["confirmed", "approved", "paid"],
  rejected: ["rejected"],
};

interface PaymentRequest {
  id: string;
  studentUid: string;
  studentName: string;
  type: string;
  amount: number;
  currency: string;
  description: string;
  status: string; // raw invoice status
  proofNote: string;
  proofUrl: string;
  createdAt: any;
  updatedAt: any;
}

const FILTERS: { key: FilterTab; label: string; color: string }[] = [
  { key: "submitted", label: "Needs Review", color: C.warning },
  { key: "approved", label: "Approved", color: C.success },
  { key: "rejected", label: "Rejected", color: C.danger },
];

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

export default function PaymentRequestsScreen() {
  const router = useRouter();
  const hasFinance = useFinanceGuard();
  const toast = useToast();
  const { uid, schoolId, role, loading: userLoading } = useCurrentUser();

  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("submitted");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const statuses = STATUS_MAP[filter];
      const q = query(
        collection(db, "schools", schoolId, "invoices"),
        where("status", "in", statuses)
      );
      const snap = await getDocs(q);
      const list: PaymentRequest[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<PaymentRequest, "id">),
      }));
      // Sort newest first client-side
      list.sort((a, b) => {
        const aMs = a.createdAt?.toMillis?.() ?? 0;
        const bMs = b.createdAt?.toMillis?.() ?? 0;
        return bMs - aMs;
      });
      // Backfill student names for invoices that predate the studentName field
      const missing = list.filter((r) => !r.studentName && r.studentUid);
      if (missing.length > 0) {
        const uids = [...new Set(missing.map((r) => r.studentUid))];
        const nameMap: Record<string, string> = {};
        await Promise.all(
          uids.map(async (u) => {
            try {
              const snap = await getDoc(doc(db, "users", u));
              if (snap.exists()) {
                const d = snap.data();
                nameMap[u] = d.displayName ?? d.name ?? d.email ?? "Student";
              }
            } catch { /* silent */ }
          })
        );
        for (const r of list) {
          if (!r.studentName && nameMap[r.studentUid]) {
            r.studentName = nameMap[r.studentUid];
          }
        }
      }
      console.log(`[PaymentRequests] loaded ${list.length} items for filter "${filter}"`);
      setRequests(list);
    } catch (e: any) {
      if (e?.code === "permission-denied") {
        toast.show("You don't have access.", "error");
      } else {
        console.log("[PaymentRequests] load error", e);
        toast.show("Network issue. Try again.", "error");
      }
    } finally {
      setLoading(false);
    }
  }, [schoolId, filter]);

  useEffect(() => {
    if (!userLoading && schoolId) {
      load();
    }
  }, [userLoading, schoolId, load]);

  const handleApprove = (req: PaymentRequest) => {
    Alert.alert(
      "Approve Payment",
      `Approve ${req.studentName || "student"}'s ${req.description} (${(req.currency ?? "usd").toUpperCase()} ${req.amount?.toFixed(2)})?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Approve",
          onPress: async () => {
            setActionLoading(req.id);
            try {
              // Use invoice-canonical fields: status="confirmed", paid=true, paidAt
              // This is the single source of truth for financial reporting
              await updateDoc(doc(db, "schools", schoolId!, "invoices", req.id), {
                status: "confirmed",
                paid: true,
                paidAt: serverTimestamp(),
                confirmedBy: uid,
                updatedAt: serverTimestamp(),
              });
              console.log("[PaymentRequests] approved invoice", req.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              toast.show("Payment approved.", "success");
              load();
            } catch (e: any) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              console.log("[PaymentRequests] approve error", e);
              if (e?.code === "permission-denied") {
                toast.show("You don't have access.", "error");
              } else {
                toast.show("Network issue. Try again.", "error");
              }
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleReject = (req: PaymentRequest) => {
    Alert.alert(
      "Reject Payment",
      `Reject ${req.studentName || "student"}'s ${req.description}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reject",
          style: "destructive",
          onPress: async () => {
            setActionLoading(req.id);
            try {
              // Keep invoice unpaid; student can resubmit proof
              await updateDoc(doc(db, "schools", schoolId!, "invoices", req.id), {
                status: "rejected",
                paid: false,
                updatedAt: serverTimestamp(),
              });
              console.log("[PaymentRequests] rejected invoice", req.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              toast.show("Payment rejected.", "success");
              load();
            } catch (e: any) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              console.log("[PaymentRequests] reject error", e);
              if (e?.code === "permission-denied") {
                toast.show("You don't have access.", "error");
              } else {
                toast.show("Network issue. Try again.", "error");
              }
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  if (userLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={C.accent} size="large" />
      </View>
    );
  }

  if (role !== "manager") {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: C.textSub, fontSize: 16 }}>Access denied</Text>
      </View>
    );
  }

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
          <FileText size={20} color={C.accent} style={{ marginRight: 8 }} />
          <Text style={{ color: C.text, fontSize: 20, fontWeight: "700", flex: 1 }}>
            Payment Requests
          </Text>
          <Pressable
            onPress={load}
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

        {/* Segmented Control */}
        <View
          style={{
            flexDirection: "row",
            marginHorizontal: 20,
            marginTop: 16,
            marginBottom: 12,
            backgroundColor: C.surface,
            borderRadius: 12,
            padding: 3,
            borderWidth: 1,
            borderColor: C.border,
          }}
        >
          {FILTERS.map((f) => {
            const isActive = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setFilter(f.key);
                }}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 10,
                  backgroundColor: isActive ? "#1F2937" : "transparent",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: isActive ? f.color : C.textMuted,
                    fontSize: 13,
                    fontWeight: isActive ? "700" : "500",
                  }}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Content */}
        {loading ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <ActivityIndicator color={C.accent} />
          </View>
        ) : requests.length === 0 ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 40 }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: C.accentBg,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <FileText size={28} color={C.accent} />
            </View>
            <Text style={{ color: C.textMuted, fontSize: 15, textAlign: "center" }}>
              No {filter === "submitted" ? "pending review" : filter} payment proofs.
            </Text>
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          >
            {requests.map((req, idx) => {
              const createdAt = req.createdAt?.toDate?.();
              const relativeTime = createdAt
                ? formatDistanceToNow(createdAt, { addSuffix: true })
                : "";
              const isSubmitted = req.status === "proof_uploaded" || req.status === "pending_review";
              const isLoading = actionLoading === req.id;

              return (
                <AnimatedRN.View
                  key={req.id}
                  entering={FadeInDown.delay(idx * 50).springify()}
                  style={{
                    backgroundColor: C.surface,
                    borderRadius: 16,
                    padding: 18,
                    marginBottom: 12,
                    borderWidth: 1,
                    borderColor: C.border,
                  }}
                >
                  {/* Student info + amount */}
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text style={{ color: C.text, fontSize: 16, fontWeight: "600" }}>
                        {req.studentName || "Unknown Student"}
                      </Text>
                      <Text style={{ color: C.textMuted, fontSize: 13, marginTop: 2 }}>
                        {req.description} {relativeTime ? `\u00B7 ${relativeTime}` : ""}
                      </Text>
                    </View>
                    <Text style={{ color: C.accent, fontSize: 20, fontWeight: "800" }}>
                      {(req.currency ?? "usd").toUpperCase()} {req.amount?.toFixed(2) ?? "0.00"}
                    </Text>
                  </View>

                  {/* Proof note */}
                  {req.proofNote ? (
                    <View
                      style={{
                        backgroundColor: C.inputBg,
                        borderRadius: 10,
                        padding: 12,
                        marginTop: 12,
                        borderWidth: 1,
                        borderColor: C.border,
                      }}
                    >
                      <Text style={{ color: C.textMuted, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                        Note
                      </Text>
                      <Text style={{ color: C.textSub, fontSize: 14, lineHeight: 20 }}>
                        {req.proofNote}
                      </Text>
                    </View>
                  ) : null}

                  {/* Proof URL */}
                  {req.proofUrl ? (
                    <Pressable
                      onPress={() => Linking.openURL(req.proofUrl).catch(() => {})}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        marginTop: 10,
                        backgroundColor: C.accentBg,
                        borderRadius: 8,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        alignSelf: "flex-start",
                      }}
                    >
                      <ExternalLink size={14} color={C.accent} />
                      <Text style={{ color: C.accent, fontSize: 13, fontWeight: "600" }} numberOfLines={1}>
                        View Receipt
                      </Text>
                    </Pressable>
                  ) : null}

                  {/* Actions (only for submitted) */}
                  {isSubmitted && (
                    <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
                      <Pressable
                        onPress={() => handleReject(req)}
                        disabled={isLoading}
                        style={({ pressed }) => ({
                          flex: 1,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                          paddingVertical: 12,
                          borderRadius: 12,
                          backgroundColor: pressed ? "rgba(248,113,113,0.20)" : C.dangerBg,
                          borderWidth: 1,
                          borderColor: "rgba(248,113,113,0.25)",
                          opacity: isLoading ? 0.5 : 1,
                        })}
                      >
                        <X size={16} color={C.danger} />
                        <Text style={{ color: C.danger, fontWeight: "700", fontSize: 14 }}>Reject</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleApprove(req)}
                        disabled={isLoading}
                        style={({ pressed }) => ({
                          flex: 1,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                          paddingVertical: 12,
                          borderRadius: 12,
                          backgroundColor: pressed ? "rgba(52,211,153,0.20)" : C.successBg,
                          borderWidth: 1,
                          borderColor: "rgba(52,211,153,0.25)",
                          opacity: isLoading ? 0.5 : 1,
                        })}
                      >
                        {isLoading ? (
                          <ActivityIndicator color={C.success} size="small" />
                        ) : (
                          <>
                            <Check size={16} color={C.success} />
                            <Text style={{ color: C.success, fontWeight: "700", fontSize: 14 }}>Approve</Text>
                          </>
                        )}
                      </Pressable>
                    </View>
                  )}

                  {/* Status badge (non-submitted) */}
                  {!isSubmitted && (
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12, gap: 6 }}>
                      {(req.status === "confirmed" || req.status === "approved" || req.status === "paid") ? (
                        <CheckCircle size={14} color={C.success} />
                      ) : (
                        <XCircle size={14} color={C.danger} />
                      )}
                      <Text
                        style={{
                          color: (req.status === "confirmed" || req.status === "approved" || req.status === "paid") ? C.success : C.danger,
                          fontSize: 13,
                          fontWeight: "600",
                        }}
                      >
                        {(req.status === "confirmed" || req.status === "approved" || req.status === "paid") ? "Approved" : "Rejected"}
                      </Text>
                    </View>
                  )}
                </AnimatedRN.View>
              );
            })}
          </ScrollView>
        )}

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
              <XCircle size={18} color="#fff" />
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
