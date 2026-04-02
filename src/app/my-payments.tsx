import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import {
  Wallet,
  RefreshCw,
  ChevronRight,
  Clock,
  CheckCircle,
  AlertCircle,
  Circle,
  ArrowRight,
  Upload,
} from "lucide-react-native";
import { db } from "@/lib/firebase-config";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import { useFinanceGuard } from "@/lib/premiumAccess";
import type { Invoice, InvoiceStatus } from "@/types/payments";
import { format } from "date-fns";

const C = {
  bg: "#070D1A",
  surface: "rgba(255,255,255,0.04)",
  surfaceHover: "rgba(255,255,255,0.07)",
  border: "rgba(255,255,255,0.08)",
  text: "#FFFFFF",
  textSub: "rgba(255,255,255,0.60)",
  textMuted: "rgba(255,255,255,0.35)",
  gold: "#D4A017",
  goldBg: "rgba(212,160,23,0.12)",
  success: "#34D399",
  successBg: "rgba(52,211,153,0.12)",
  danger: "#F87171",
  dangerBg: "rgba(248,113,113,0.12)",
  warning: "#FBBF24",
  warningBg: "rgba(251,191,36,0.12)",
  blue: "#60A5FA",
  blueBg: "rgba(96,165,250,0.12)",
};

function statusColor(status: InvoiceStatus): string {
  switch (status) {
    case "pending":
    case "due": return C.blue;
    case "submitted":
    case "proof_uploaded":
    case "pending_review": return C.warning;
    case "confirmed":
    case "paid": return C.success;
    case "rejected":
    case "overdue": return C.danger;
    default: return C.textMuted;
  }
}
function statusBg(status: InvoiceStatus): string {
  switch (status) {
    case "pending":
    case "due": return C.blueBg;
    case "submitted":
    case "proof_uploaded":
    case "pending_review": return C.warningBg;
    case "confirmed":
    case "paid": return C.successBg;
    case "rejected":
    case "overdue": return C.dangerBg;
    default: return C.surface;
  }
}
function statusLabel(status: InvoiceStatus): string {
  switch (status) {
    case "pending":
    case "due": return "Due";
    case "submitted": return "Submitted";
    case "proof_uploaded":
    case "pending_review": return "Proof Uploaded";
    case "confirmed":
    case "paid": return "Paid";
    case "rejected": return "Rejected";
    case "overdue": return "Overdue";
    default: return status;
  }
}
function StatusIcon({ status, size = 14 }: { status: InvoiceStatus; size?: number }) {
  const color = statusColor(status);
  switch (status) {
    case "pending":
    case "due": return <Circle size={size} color={color} />;
    case "submitted":
    case "proof_uploaded":
    case "pending_review": return <Clock size={size} color={color} />;
    case "confirmed":
    case "paid": return <CheckCircle size={size} color={color} />;
    case "rejected":
    case "overdue": return <AlertCircle size={size} color={color} />;
    default: return <Circle size={size} color={color} />;
  }
}

const UNPAID_STATUSES: InvoiceStatus[] = ["pending", "due", "submitted", "proof_uploaded", "pending_review", "rejected", "overdue"];

export default function MyPaymentsScreen() {
  const router = useRouter();
  const hasFinance = useFinanceGuard();
  const { uid, schoolId, loading: userLoading } = useCurrentUser();

  useEffect(() => {
    console.log("[MyPayments] screen mounted | uid:", uid, "| schoolId:", schoolId);
  }, [uid, schoolId]);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!schoolId || !uid) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, "schools", schoolId, "invoices"),
        where("studentUid", "==", uid)
      );
      const snap = await getDocs(q);
      const list: Invoice[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Invoice, "id">),
      }));
      // Sort client-side to avoid requiring a composite Firestore index
      list.sort((a, b) => {
        const aMs = a.dueAt?.toMillis?.() ?? 0;
        const bMs = b.dueAt?.toMillis?.() ?? 0;
        return aMs - bMs;
      });
      console.log(`[MyPayments] loaded ${list.length} invoices for student ${uid}`);
      setInvoices(list);
    } catch (e) {
      console.error("[MyPayments] load error", e);
    } finally {
      setLoading(false);
    }
  }, [schoolId, uid]);

  useEffect(() => {
    if (userLoading) return;
    if (schoolId && uid) {
      load();
    } else {
      setLoading(false);
    }
  }, [userLoading, schoolId, uid, load]);

  if (userLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={C.gold} size="large" />
      </View>
    );
  }

  const nextUnpaid = invoices.find((i) => UNPAID_STATUSES.includes(i.status));
  const history = nextUnpaid ? invoices.filter((i) => i.id !== nextUnpaid.id) : invoices;

  const navigateToInvoice = (invoice: Invoice) => {
    router.push({
      pathname: "/invoice-details",
      params: { schoolId: schoolId!, invoiceId: invoice.id },
    });
  };

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
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 14,
            borderBottomWidth: 1,
            borderBottomColor: C.border,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Wallet size={22} color={C.gold} style={{ marginRight: 10 }} />
            <Text style={{ color: C.text, fontSize: 22, fontWeight: "700", flex: 1 }}>
              My Payments
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
          <Text style={{ color: C.textMuted, fontSize: 13, marginTop: 4, marginLeft: 32 }}>
            Pay outside the app, then upload proof here
          </Text>
        </View>

        {loading ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <ActivityIndicator color={C.gold} />
          </View>
        ) : invoices.length === 0 ? (
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              paddingHorizontal: 40,
            }}
          >
            <CheckCircle size={48} color={C.success} />
            <Text
              style={{
                color: C.text,
                fontSize: 20,
                fontWeight: "700",
                marginTop: 16,
                textAlign: "center",
              }}
            >
              All clear!
            </Text>
            <Text
              style={{
                color: C.textMuted,
                fontSize: 15,
                marginTop: 8,
                textAlign: "center",
              }}
            >
              No invoices found.
            </Text>
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Next unpaid card */}
            {nextUnpaid && (
              <Pressable
                onPress={() => navigateToInvoice(nextUnpaid)}
                style={({ pressed }) => ({
                  borderRadius: 20,
                  overflow: "hidden",
                  marginBottom: 24,
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <LinearGradient
                  colors={
                    nextUnpaid.status === "overdue"
                      ? ["rgba(248,113,113,0.18)", "rgba(248,113,113,0.06)"]
                      : nextUnpaid.status === "rejected"
                      ? ["rgba(248,113,113,0.15)", "rgba(248,113,113,0.04)"]
                      : (nextUnpaid.status === "submitted" || nextUnpaid.status === "proof_uploaded" || nextUnpaid.status === "pending_review")
                      ? ["rgba(251,191,36,0.15)", "rgba(251,191,36,0.04)"]
                      : ["rgba(212,160,23,0.20)", "rgba(212,160,23,0.06)"]
                  }
                  style={{
                    borderRadius: 20,
                    padding: 24,
                    borderWidth: 1,
                    borderColor:
                      (nextUnpaid.status === "overdue" || nextUnpaid.status === "rejected")
                        ? "rgba(248,113,113,0.30)"
                        : (nextUnpaid.status === "submitted" || nextUnpaid.status === "proof_uploaded" || nextUnpaid.status === "pending_review")
                        ? "rgba(251,191,36,0.30)"
                        : "rgba(212,160,23,0.30)",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginBottom: 8,
                    }}
                  >
                    <StatusIcon status={nextUnpaid.status} size={16} />
                    <Text
                      style={{
                        color: statusColor(nextUnpaid.status),
                        fontSize: 12,
                        fontWeight: "700",
                        textTransform: "uppercase",
                        letterSpacing: 0.8,
                        marginLeft: 6,
                      }}
                    >
                      {statusLabel(nextUnpaid.status)}
                    </Text>
                  </View>
                  <Text
                    style={{
                      color: C.text,
                      fontSize: 36,
                      fontWeight: "800",
                      letterSpacing: -0.5,
                    }}
                  >
                    {nextUnpaid.currency}{" "}
                    {nextUnpaid.amount.toFixed(2)}
                  </Text>
                  <Text
                    style={{
                      color: C.textSub,
                      fontSize: 15,
                      marginTop: 4,
                    }}
                    numberOfLines={2}
                  >
                    {nextUnpaid.description}
                  </Text>
                  {nextUnpaid.dueAt?.toDate && (
                    <Text
                      style={{
                        color: C.textMuted,
                        fontSize: 13,
                        marginTop: 8,
                      }}
                    >
                      Due {format(nextUnpaid.dueAt.toDate(), "MMMM d, yyyy")}
                    </Text>
                  )}

                  {/* CTA — varies by status */}
                  {(nextUnpaid.status === "submitted" || nextUnpaid.status === "proof_uploaded" || nextUnpaid.status === "pending_review") ? (
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 16, gap: 6 }}>
                      <Clock size={14} color={C.warning} />
                      <Text style={{ color: C.warning, fontSize: 13, fontWeight: "600" }}>
                        Proof submitted — waiting for manager review
                      </Text>
                    </View>
                  ) : (nextUnpaid.status === "rejected") ? (
                    <View
                      style={{
                        marginTop: 16,
                        backgroundColor: "rgba(248,113,113,0.15)",
                        borderRadius: 14,
                        paddingVertical: 14,
                        paddingHorizontal: 18,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        borderWidth: 1,
                        borderColor: "rgba(248,113,113,0.30)",
                      }}
                    >
                      <Upload size={16} color={C.danger} />
                      <Text style={{ color: C.danger, fontSize: 15, fontWeight: "700" }}>
                        Resubmit Payment Proof
                      </Text>
                    </View>
                  ) : (
                    <View
                      style={{
                        marginTop: 16,
                        backgroundColor: "rgba(212,160,23,0.90)",
                        borderRadius: 14,
                        paddingVertical: 14,
                        paddingHorizontal: 18,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                      }}
                    >
                      <Upload size={16} color="#fff" />
                      <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>
                        Submit Payment Proof
                      </Text>
                    </View>
                  )}
                </LinearGradient>
              </Pressable>
            )}

            {/* History */}
            {history.length > 0 && (
              <>
                <Text
                  style={{
                    color: C.textMuted,
                    fontSize: 12,
                    fontWeight: "700",
                    textTransform: "uppercase",
                    letterSpacing: 0.8,
                    marginBottom: 12,
                  }}
                >
                  History
                </Text>
                <View
                  style={{
                    backgroundColor: C.surface,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: C.border,
                    overflow: "hidden",
                  }}
                >
                  {history.map((invoice, idx) => (
                    <React.Fragment key={invoice.id}>
                      {idx > 0 && (
                        <View
                          style={{
                            height: 1,
                            backgroundColor: C.border,
                            marginHorizontal: 16,
                          }}
                        />
                      )}
                      <Pressable
                        onPress={() => navigateToInvoice(invoice)}
                        style={({ pressed }) => ({
                          flexDirection: "row",
                          alignItems: "center",
                          padding: 16,
                          backgroundColor: pressed ? C.surfaceHover : "transparent",
                        })}
                      >
                        <View style={{ flex: 1 }}>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 6,
                              marginBottom: 3,
                            }}
                          >
                            <StatusIcon status={invoice.status} size={13} />
                            <Text
                              style={{
                                color: statusColor(invoice.status),
                                fontSize: 11,
                                fontWeight: "600",
                              }}
                            >
                              {statusLabel(invoice.status)}
                            </Text>
                          </View>
                          <Text
                            style={{
                              color: C.text,
                              fontSize: 14,
                              fontWeight: "600",
                            }}
                            numberOfLines={1}
                          >
                            {invoice.description}
                          </Text>
                          {invoice.dueAt?.toDate && (
                            <Text
                              style={{ color: C.textMuted, fontSize: 12, marginTop: 2 }}
                            >
                              {format(invoice.dueAt.toDate(), "MMM d, yyyy")}
                            </Text>
                          )}
                        </View>
                        <View style={{ alignItems: "flex-end", marginLeft: 12 }}>
                          <Text
                            style={{
                              color:
                                invoice.status === "paid" ? C.success : C.text,
                              fontSize: 16,
                              fontWeight: "700",
                            }}
                          >
                            {invoice.currency} {invoice.amount.toFixed(2)}
                          </Text>
                          <ChevronRight size={16} color={C.textMuted} />
                        </View>
                      </Pressable>
                    </React.Fragment>
                  ))}
                </View>
              </>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}
