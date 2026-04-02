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
  doc,
  getDocs,
  getDoc,
  query,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import {
  ChevronLeft,
  FileText,
  Plus,
  RefreshCw,
  Clock,
  CheckCircle,
  AlertCircle,
  Circle,
} from "lucide-react-native";
import { db } from "@/lib/firebase-config";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import { useFinanceGuard } from "@/lib/premiumAccess";
import type { Invoice, InvoiceStatus, StudentSummary } from "@/types/payments";
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

type FilterTab = "all" | "pending" | "proof_uploaded" | "confirmed" | "rejected" | "due" | "pending_review" | "paid" | "overdue";
const FILTERS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "proof_uploaded", label: "Review" },
  { key: "confirmed", label: "Confirmed" },
  { key: "rejected", label: "Rejected" },
];

function statusColor(status: InvoiceStatus) {
  switch (status) {
    case "pending":
    case "due": return C.blue;
    case "proof_uploaded":
    case "pending_review": return C.warning;
    case "confirmed":
    case "paid": return C.success;
    case "rejected":
    case "overdue": return C.danger;
    default: return C.textMuted;
  }
}
function statusBg(status: InvoiceStatus) {
  switch (status) {
    case "pending":
    case "due": return C.blueBg;
    case "proof_uploaded":
    case "pending_review": return C.warningBg;
    case "confirmed":
    case "paid": return C.successBg;
    case "rejected":
    case "overdue": return C.dangerBg;
    default: return C.surface;
  }
}
function statusLabel(status: InvoiceStatus) {
  switch (status) {
    case "pending":
    case "due": return "Due";
    case "proof_uploaded":
    case "pending_review": return "Proof Uploaded";
    case "confirmed":
    case "paid": return "Paid";
    case "rejected": return "Rejected";
    case "overdue": return "Overdue";
    default: return status;
  }
}
function StatusIcon({ status }: { status: InvoiceStatus }) {
  const color = statusColor(status);
  const s = 14;
  switch (status) {
    case "pending":
    case "due": return <Circle size={s} color={color} />;
    case "proof_uploaded":
    case "pending_review": return <Clock size={s} color={color} />;
    case "confirmed":
    case "paid": return <CheckCircle size={s} color={color} />;
    case "rejected":
    case "overdue": return <AlertCircle size={s} color={color} />;
    default: return <Circle size={s} color={color} />;
  }
}

export default function InvoicesScreen() {
  const router = useRouter();
  const hasFinance = useFinanceGuard();
  const { uid, schoolId, role, loading: userLoading } = useCurrentUser();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [students, setStudents] = useState<Record<string, StudentSummary>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");

  const load = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, "schools", schoolId, "invoices"),
        orderBy("updatedAt", "desc")
      );
      const snap = await getDocs(q);
      const list: Invoice[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Invoice, "id">),
      }));
      setInvoices(list);

      // Fetch student names
      const uids = [...new Set(list.map((i) => i.studentUid))];
      const studentMap: Record<string, StudentSummary> = {};
      await Promise.all(
        uids.map(async (u) => {
          try {
            const us = await getDoc(doc(db, "users", u));
            if (us.exists()) {
              const d = us.data();
              studentMap[u] = {
                uid: u,
                name: d.displayName ?? d.name ?? d.email ?? "Unknown",
                photoURL: d.photoURL ?? null,
              };
            } else {
              studentMap[u] = { uid: u, name: "Unknown" };
            }
          } catch {
            studentMap[u] = { uid: u, name: "Unknown" };
          }
        })
      );
      setStudents(studentMap);
    } catch (e) {
      console.error("[Invoices] load error", e);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    if (!userLoading && schoolId) {
      load();
    }
  }, [userLoading, schoolId, load]);

  if (userLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={C.gold} size="large" />
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

  const filtered =
    filter === "all" ? invoices : invoices.filter((i) => i.status === filter);

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
          <FileText size={20} color={C.gold} style={{ marginRight: 8 }} />
          <Text style={{ color: C.text, fontSize: 20, fontWeight: "700", flex: 1 }}>
            Invoices
          </Text>
          <Pressable
            onPress={load}
            style={({ pressed }) => ({
              opacity: pressed ? 0.5 : 1,
              padding: 8,
              borderRadius: 12,
              backgroundColor: C.surface,
              marginRight: 8,
            })}
          >
            <RefreshCw size={18} color={C.textSub} />
          </Pressable>
          <Pressable
            onPress={() => router.push("/create-invoice")}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 12,
              backgroundColor: pressed ? "rgba(212,160,23,0.8)" : C.gold,
            })}
          >
            <Plus size={16} color="#fff" style={{ marginRight: 4 }} />
            <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>New</Text>
          </Pressable>
        </View>

        {/* Filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 12, gap: 8 }}
        >
          {FILTERS.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 7,
                borderRadius: 20,
                backgroundColor: filter === f.key ? C.gold : C.surface,
                borderWidth: 1,
                borderColor: filter === f.key ? C.gold : C.border,
              }}
            >
              <Text
                style={{
                  color: filter === f.key ? "#fff" : C.textSub,
                  fontSize: 13,
                  fontWeight: "600",
                }}
              >
                {f.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* List */}
        {loading ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <ActivityIndicator color={C.gold} />
          </View>
        ) : filtered.length === 0 ? (
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              paddingHorizontal: 40,
            }}
          >
            <FileText size={40} color={C.textMuted} />
            <Text
              style={{
                color: C.textMuted,
                fontSize: 16,
                marginTop: 12,
                textAlign: "center",
              }}
            >
              No invoices found
            </Text>
            <Pressable
              onPress={() => router.push("/create-invoice")}
              style={({ pressed }) => ({
                marginTop: 20,
                paddingHorizontal: 24,
                paddingVertical: 12,
                borderRadius: 14,
                backgroundColor: pressed ? "rgba(212,160,23,0.8)" : C.gold,
              })}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                Create Invoice
              </Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            renderItem={({ item }) => {
              const student = students[item.studentUid];
              const dueDate = item.dueAt?.toDate?.();
              return (
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: "/invoice-details",
                      params: { schoolId: schoolId!, invoiceId: item.id },
                    })
                  }
                  style={({ pressed }) => ({
                    backgroundColor: pressed ? C.surfaceHover : C.surface,
                    borderRadius: 16,
                    padding: 16,
                    borderWidth: 1,
                    borderColor: C.border,
                  })}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text style={{ color: C.text, fontSize: 15, fontWeight: "600" }}>
                        {student?.name ?? item.studentUid}
                      </Text>
                      <Text
                        style={{ color: C.textMuted, fontSize: 12, marginTop: 2 }}
                        numberOfLines={1}
                      >
                        {item.description}
                      </Text>
                    </View>
                    <View>
                      <Text
                        style={{
                          color: C.gold,
                          fontSize: 18,
                          fontWeight: "800",
                          textAlign: "right",
                        }}
                      >
                        {item.currency} {item.amount.toFixed(2)}
                      </Text>
                    </View>
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginTop: 12,
                    }}
                  >
                    {dueDate ? (
                      <Text style={{ color: C.textMuted, fontSize: 12 }}>
                        Due {format(dueDate, "MMM d, yyyy")}
                      </Text>
                    ) : (
                      <Text style={{ color: C.textMuted, fontSize: 12 }}>No due date</Text>
                    )}
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 5,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 20,
                        backgroundColor: statusBg(item.status),
                      }}
                    >
                      <StatusIcon status={item.status} />
                      <Text
                        style={{
                          color: statusColor(item.status),
                          fontSize: 12,
                          fontWeight: "600",
                        }}
                      >
                        {statusLabel(item.status)}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            }}
          />
        )}
      </SafeAreaView>
    </View>
  );
}
