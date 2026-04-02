import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Modal,
  FlatList,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import {
  ChevronLeft,
  DollarSign,
  Plus,
  RefreshCw,
  CheckCircle,
  Clock,
  ChevronDown,
  X,
  AlertCircle,
} from "lucide-react-native";
import { db } from "@/lib/firebase-config";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import { useFinanceGuard } from "@/lib/premiumAccess";
import type { CoachPayout, CoachPayoutStatus } from "@/types/payments";
import { format } from "date-fns";

const C = {
  bg: "#070D1A",
  surface: "rgba(255,255,255,0.04)",
  surfaceHover: "rgba(255,255,255,0.07)",
  border: "rgba(255,255,255,0.08)",
  text: "rgba(255,255,255,0.92)",
  textSub: "rgba(255,255,255,0.70)",
  textMuted: "rgba(255,255,255,0.55)",
  gold: "#D4A017",
  goldBg: "rgba(212,160,23,0.12)",
  goldMuted: "rgba(212,160,23,0.20)",
  success: "#34D399",
  successBg: "rgba(52,211,153,0.12)",
  danger: "#F87171",
  warning: "#FBBF24",
  warningBg: "rgba(251,191,36,0.12)",
  inputBg: "rgba(255,255,255,0.06)",
};

interface CoachSummary {
  uid: string;
  name: string;
}

type ToastType = "success" | "error";

function useToast() {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");
  const [type, setType] = useState<ToastType>("success");
  const opacity = React.useRef(new Animated.Value(0)).current;

  const show = useCallback(
    (msg: string, t: ToastType = "success") => {
      setMessage(msg);
      setType(t);
      setVisible(true);
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(2200),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(() => setVisible(false));
    },
    [opacity]
  );

  return { show, visible, message, type, opacity };
}

function getCurrentPeriod() {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${m}`;
}

export default function CoachPayoutsScreen() {
  const router = useRouter();
  const hasFinance = useFinanceGuard();
  const { uid, schoolId, role, loading: userLoading } = useCurrentUser();
  const toast = useToast();

  const [payouts, setPayouts] = useState<CoachPayout[]>([]);
  const [coaches, setCoaches] = useState<Record<string, CoachSummary>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "paid">("all");

  // Create modal state
  const [showCreate, setShowCreate] = useState(false);
  const [selectedCoach, setSelectedCoach] = useState<CoachSummary | null>(null);
  const [coachList, setCoachList] = useState<CoachSummary[]>([]);
  const [showCoachPicker, setShowCoachPicker] = useState(false);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"USD" | "BRL">("USD");
  const [note, setNote] = useState("");
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [creating, setCreating] = useState(false);

  const loadPayouts = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, "schools", schoolId, "coach_payouts"),
          orderBy("createdAt", "desc")
        )
      );
      const list: CoachPayout[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<CoachPayout, "id">),
      }));
      setPayouts(list);

      // fetch coach names
      const uids = [...new Set(list.map((p) => p.coachUid))];
      const map: Record<string, CoachSummary> = {};
      await Promise.all(
        uids.map(async (u) => {
          try {
            const us = await getDoc(doc(db, "users", u));
            if (us.exists()) {
              const d = us.data();
              map[u] = { uid: u, name: d.displayName ?? d.name ?? d.email ?? "Unknown" };
            } else {
              map[u] = { uid: u, name: "Unknown" };
            }
          } catch {
            map[u] = { uid: u, name: "Unknown" };
          }
        })
      );
      setCoaches(map);
    } catch (e) {
      console.error("[CoachPayouts] load error", e);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  const loadCoaches = useCallback(async () => {
    if (!schoolId) return;
    try {
      const snap = await getDocs(
        query(collection(db, "users"), where("schoolId", "==", schoolId), where("role", "==", "coach"))
      );
      const list: CoachSummary[] = snap.docs.map((d) => ({
        uid: d.id,
        name: (d.data().displayName ?? d.data().name ?? d.data().email ?? "Unknown") as string,
      }));
      setCoachList(list);
    } catch (e) {
      console.error("[CoachPayouts] loadCoaches error", e);
    }
  }, [schoolId]);

  useEffect(() => {
    if (!userLoading && schoolId) {
      loadPayouts();
      loadCoaches();
    }
  }, [userLoading, schoolId, loadPayouts, loadCoaches]);

  const handleCreate = useCallback(async () => {
    if (!schoolId || !uid || !selectedCoach || !amount) return;
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      toast.show("Enter a valid amount", "error");
      return;
    }
    setCreating(true);
    try {
      await addDoc(collection(db, "schools", schoolId, "coach_payouts"), {
        coachUid: selectedCoach.uid,
        amount: parsed,
        currency,
        status: "pending" as CoachPayoutStatus,
        note: note.trim() || null,
        period,
        createdAt: serverTimestamp(),
        createdBy: uid,
        paidAt: null,
      });
      toast.show("Payout record created", "success");
      setShowCreate(false);
      setSelectedCoach(null);
      setAmount("");
      setNote("");
      setPeriod(getCurrentPeriod());
      loadPayouts();
    } catch (e) {
      toast.show("Couldn't create payout. Check permissions.", "error");
    } finally {
      setCreating(false);
    }
  }, [schoolId, uid, selectedCoach, amount, currency, note, period, toast, loadPayouts]);

  const markPaid = useCallback(
    async (payoutId: string) => {
      if (!schoolId) return;
      try {
        await updateDoc(doc(db, "schools", schoolId, "coach_payouts", payoutId), {
          status: "paid",
          paidAt: serverTimestamp(),
        });
        toast.show("Marked as paid", "success");
        loadPayouts();
      } catch (e) {
        toast.show("Couldn't update. Check permissions.", "error");
      }
    },
    [schoolId, toast, loadPayouts]
  );

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
    filter === "all" ? payouts : payouts.filter((p) => p.status === filter);

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
          <DollarSign size={20} color={C.gold} style={{ marginRight: 8 }} />
          <Text style={{ color: C.text, fontSize: 20, fontWeight: "700", flex: 1 }}>
            Coach Payouts
          </Text>
          <Pressable
            onPress={loadPayouts}
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
            onPress={() => setShowCreate(true)}
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
          {(["all", "pending", "paid"] as const).map((f) => (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 7,
                borderRadius: 20,
                backgroundColor: filter === f ? C.gold : C.surface,
                borderWidth: 1,
                borderColor: filter === f ? C.gold : C.border,
              }}
            >
              <Text
                style={{
                  color: filter === f ? "#000" : C.textSub,
                  fontSize: 13,
                  fontWeight: "600",
                  textTransform: "capitalize",
                }}
              >
                {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
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
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 40 }}>
            <DollarSign size={40} color={C.textMuted} />
            <Text style={{ color: C.textMuted, fontSize: 16, marginTop: 12, textAlign: "center" }}>
              No payout records found
            </Text>
            <Pressable
              onPress={() => setShowCreate(true)}
              style={({ pressed }) => ({
                marginTop: 20,
                paddingHorizontal: 24,
                paddingVertical: 12,
                borderRadius: 14,
                backgroundColor: pressed ? "rgba(212,160,23,0.8)" : C.gold,
              })}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                Create Payout Record
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
              const coach = coaches[item.coachUid];
              const isPending = item.status === "pending";
              return (
                <View
                  style={{
                    backgroundColor: C.surface,
                    borderRadius: 16,
                    padding: 16,
                    borderWidth: 1,
                    borderColor: C.border,
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text style={{ color: C.text, fontSize: 15, fontWeight: "700" }}>
                        {coach?.name ?? item.coachUid}
                      </Text>
                      <Text style={{ color: C.textMuted, fontSize: 12, marginTop: 2 }}>
                        Period: {item.period}
                      </Text>
                      {item.note ? (
                        <Text style={{ color: C.textSub, fontSize: 13, marginTop: 4 }} numberOfLines={2}>
                          {item.note}
                        </Text>
                      ) : null}
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ color: C.gold, fontSize: 20, fontWeight: "800" }}>
                        {item.currency} {item.amount.toFixed(2)}
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                          marginTop: 6,
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderRadius: 20,
                          backgroundColor: isPending ? C.warningBg : C.successBg,
                        }}
                      >
                        {isPending ? (
                          <Clock size={12} color={C.warning} />
                        ) : (
                          <CheckCircle size={12} color={C.success} />
                        )}
                        <Text
                          style={{
                            color: isPending ? C.warning : C.success,
                            fontSize: 11,
                            fontWeight: "700",
                          }}
                        >
                          {isPending ? "Pending" : "Paid"}
                        </Text>
                      </View>
                    </View>
                  </View>
                  {item.paidAt ? (
                    <Text style={{ color: C.textMuted, fontSize: 12, marginTop: 8 }}>
                      Paid {format(item.paidAt.toDate(), "MMM d, yyyy")}
                    </Text>
                  ) : (
                    item.createdAt && (
                      <Text style={{ color: C.textMuted, fontSize: 12, marginTop: 8 }}>
                        Created {format(item.createdAt.toDate(), "MMM d, yyyy")}
                      </Text>
                    )
                  )}
                  {isPending && (
                    <Pressable
                      onPress={() => markPaid(item.id)}
                      style={({ pressed }) => ({
                        marginTop: 12,
                        paddingVertical: 10,
                        borderRadius: 12,
                        backgroundColor: pressed ? "rgba(52,211,153,0.25)" : "rgba(52,211,153,0.15)",
                        borderWidth: 1,
                        borderColor: "rgba(52,211,153,0.30)",
                        alignItems: "center",
                        flexDirection: "row",
                        justifyContent: "center",
                        gap: 6,
                      })}
                    >
                      <CheckCircle size={16} color={C.success} />
                      <Text style={{ color: C.success, fontWeight: "700", fontSize: 14 }}>
                        Mark as Paid
                      </Text>
                    </Pressable>
                  )}
                </View>
              );
            }}
          />
        )}

        {/* Create Modal */}
        <Modal visible={showCreate} transparent animationType="slide">
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
            <View
              style={{
                backgroundColor: "#0F1A2E",
                borderTopLeftRadius: 28,
                borderTopRightRadius: 28,
                padding: 24,
                paddingBottom: 40,
              }}
            >
              {/* Modal header */}
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 24 }}>
                <Text style={{ color: C.text, fontSize: 20, fontWeight: "700", flex: 1 }}>
                  New Payout Record
                </Text>
                <Pressable
                  onPress={() => setShowCreate(false)}
                  style={{ padding: 6, borderRadius: 10, backgroundColor: C.surface }}
                >
                  <X size={20} color={C.textSub} />
                </Pressable>
              </View>

              {/* Coach picker */}
              <Text style={styles.fieldLabel}>Coach</Text>
              <Pressable
                onPress={() => setShowCoachPicker(true)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: C.inputBg,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 13,
                  borderWidth: 1,
                  borderColor: C.border,
                  marginTop: 6,
                  marginBottom: 14,
                }}
              >
                <Text style={{ flex: 1, color: selectedCoach ? C.text : C.textMuted, fontSize: 15 }}>
                  {selectedCoach?.name ?? "Select coach..."}
                </Text>
                <ChevronDown size={18} color={C.textMuted} />
              </Pressable>

              {/* Amount + Currency */}
              <View style={{ flexDirection: "row", gap: 12, marginBottom: 14 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Amount</Text>
                  <TextInput
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="0.00"
                    placeholderTextColor={C.textMuted}
                    keyboardType="decimal-pad"
                    style={{
                      backgroundColor: C.inputBg,
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      color: C.text,
                      fontSize: 15,
                      marginTop: 6,
                      borderWidth: 1,
                      borderColor: C.border,
                    }}
                  />
                </View>
                <View>
                  <Text style={styles.fieldLabel}>Currency</Text>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                    {(["USD", "BRL"] as const).map((cur) => (
                      <Pressable
                        key={cur}
                        onPress={() => setCurrency(cur)}
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 12,
                          borderRadius: 12,
                          backgroundColor: currency === cur ? C.gold : C.inputBg,
                          borderWidth: 1,
                          borderColor: currency === cur ? C.gold : C.border,
                        }}
                      >
                        <Text
                          style={{
                            color: currency === cur ? "#000" : C.textSub,
                            fontSize: 14,
                            fontWeight: "700",
                          }}
                        >
                          {cur}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>

              {/* Period */}
              <Text style={styles.fieldLabel}>Period (YYYY-MM)</Text>
              <TextInput
                value={period}
                onChangeText={setPeriod}
                placeholder="2026-02"
                placeholderTextColor={C.textMuted}
                style={{
                  backgroundColor: C.inputBg,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  color: C.text,
                  fontSize: 15,
                  marginTop: 6,
                  marginBottom: 14,
                  borderWidth: 1,
                  borderColor: C.border,
                }}
                autoCapitalize="none"
                autoCorrect={false}
              />

              {/* Note */}
              <Text style={styles.fieldLabel}>Note (optional)</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="e.g. February private lessons"
                placeholderTextColor={C.textMuted}
                multiline
                style={{
                  backgroundColor: C.inputBg,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  color: C.text,
                  fontSize: 15,
                  marginTop: 6,
                  marginBottom: 20,
                  borderWidth: 1,
                  borderColor: C.border,
                  minHeight: 70,
                  textAlignVertical: "top",
                }}
              />

              {/* Submit */}
              <Pressable
                onPress={handleCreate}
                disabled={creating || !selectedCoach || !amount}
                style={({ pressed }) => ({
                  backgroundColor:
                    !selectedCoach || !amount
                      ? "rgba(212,160,23,0.35)"
                      : pressed
                      ? "rgba(212,160,23,0.8)"
                      : C.gold,
                  borderRadius: 14,
                  paddingVertical: 15,
                  alignItems: "center",
                  opacity: creating ? 0.7 : 1,
                })}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
                    Create Payout Record
                  </Text>
                )}
              </Pressable>
            </View>
          </View>

          {/* Coach picker modal */}
          <Modal visible={showCoachPicker} transparent animationType="fade">
            <Pressable
              style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 24 }}
              onPress={() => setShowCoachPicker(false)}
            >
              <View
                style={{
                  backgroundColor: "#0F1A2E",
                  borderRadius: 20,
                  overflow: "hidden",
                  maxHeight: 400,
                }}
              >
                <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: C.border }}>
                  <Text style={{ color: C.text, fontSize: 17, fontWeight: "700" }}>Select Coach</Text>
                </View>
                {coachList.length === 0 ? (
                  <View style={{ padding: 32, alignItems: "center" }}>
                    <Text style={{ color: C.textMuted, fontSize: 15 }}>No coaches found</Text>
                  </View>
                ) : (
                  <FlatList
                    data={coachList}
                    keyExtractor={(item) => item.uid}
                    renderItem={({ item }) => (
                      <Pressable
                        onPress={() => {
                          setSelectedCoach(item);
                          setShowCoachPicker(false);
                        }}
                        style={({ pressed }) => ({
                          flexDirection: "row",
                          alignItems: "center",
                          padding: 16,
                          backgroundColor:
                            selectedCoach?.uid === item.uid
                              ? C.goldBg
                              : pressed
                              ? C.surfaceHover
                              : "transparent",
                          borderBottomWidth: 1,
                          borderBottomColor: C.border,
                        })}
                      >
                        <Text style={{ color: C.text, fontSize: 15, flex: 1 }}>{item.name}</Text>
                        {selectedCoach?.uid === item.uid && (
                          <CheckCircle size={18} color={C.gold} />
                        )}
                      </Pressable>
                    )}
                  />
                )}
              </View>
            </Pressable>
          </Modal>
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

const styles = {
  fieldLabel: {
    color: "rgba(255,255,255,0.70)" as const,
    fontSize: 12,
    fontWeight: "600" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
};
