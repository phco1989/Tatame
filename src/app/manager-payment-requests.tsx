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
  FlatList,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import DateTimePicker from "@react-native-community/datetimepicker";

import {
  ArrowLeft,
  Plus,
  X,
  Check,
  Clock,
  AlertCircle,
  Link,
  FileText,
  DollarSign,
  User,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  CalendarDays,
  ChevronLeft,
} from "lucide-react-native";

import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  doc,
  query,
  where,
  orderBy,
  serverTimestamp,
  onSnapshot,
  Timestamp,
  getDoc,
} from "firebase/firestore";

import { db, auth, waitForAuthReady } from "@/lib/firebase-config";
import { useUserRole } from "@/lib/hooks/useUserRole";
import { useFinanceGuard } from "@/lib/premiumAccess";
import { useTranslations } from "@/lib/i18n";
import { useLanguageStore } from "@/lib/i18n/language-store";

// --------------------
// Types
// --------------------
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

type Student = {
  id: string;
  name: string;
};

// student_membership template document
type StudentMembership = {
  id: string;
  studentUid: string;
  schoolId: string;
  title: string;
  amount: number;
  currency: string;
  dueDay: number;
  paymentInstructions?: string;
  paymentLink?: string;
  active: boolean;
  lastGeneratedMonth?: Timestamp | null;
};

// --------------------
// Colors
// --------------------
const COLORS = {
  background: "#0B1220",
  card: "#111827",
  cardBorder: "rgba(255, 255, 255, 0.06)",
  text: "#FFFFFF",
  textSecondary: "rgba(255, 255, 255, 0.7)",
  textMuted: "rgba(255, 255, 255, 0.5)",
  accent: "#FBBF24",
  accentLight: "rgba(251, 191, 36, 0.15)",
  border: "rgba(255, 255, 255, 0.08)",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
  blue: "#4C7BF4",
  inputBackground: "#1F2937",
};

// --------------------
// Status badge
// --------------------
function StatusBadge({ status, dueDate, tr }: { status: PaymentStatus; dueDate: Date; tr: any }) {
  const isOverdue = status === "due" && dueDate < new Date();

  if (isOverdue) {
    return (
      <View style={{ backgroundColor: "rgba(239,68,68,0.15)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: "rgba(239,68,68,0.3)" }}>
        <Text style={{ color: COLORS.danger, fontSize: 11, fontWeight: "700" }}>{tr.paymentRequests.overdue}</Text>
      </View>
    );
  }

  const configs: Record<PaymentStatus, { bg: string; color: string; border: string; label: string }> = {
    due: { bg: "rgba(251,191,36,0.15)", color: COLORS.warning, border: "rgba(251,191,36,0.3)", label: tr.paymentRequests.due },
    submitted: { bg: "rgba(76,123,244,0.15)", color: COLORS.blue, border: "rgba(76,123,244,0.3)", label: tr.paymentRequests.submitted },
    approved: { bg: "rgba(16,185,129,0.15)", color: COLORS.success, border: "rgba(16,185,129,0.3)", label: tr.paymentRequests.approved },
    rejected: { bg: "rgba(239,68,68,0.15)", color: COLORS.danger, border: "rgba(239,68,68,0.3)", label: tr.paymentRequests.rejected },
  };

  const cfg = configs[status] ?? configs.due;
  return (
    <View style={{ backgroundColor: cfg.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: cfg.border }}>
      <Text style={{ color: cfg.color, fontSize: 11, fontWeight: "700" }}>{cfg.label}</Text>
    </View>
  );
}

// --------------------
// Main screen
// --------------------
export default function ManagerPaymentRequestsScreen() {
  const router = useRouter();
  const hasFinance = useFinanceGuard();
  const tr = useTranslations();
  useLanguageStore((s) => s.locale);
  const { role, schoolId } = useUserRole();

  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<PaymentRequest | null>(null);
  const [filterStatus, setFilterStatus] = useState<PaymentStatus | "all">("all");
  const [reviewNote, setReviewNote] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);

  // Generate monthly payments state
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateYear, setGenerateYear] = useState(() => new Date().getFullYear());
  const [generateMonth, setGenerateMonth] = useState(() => new Date().getMonth()); // 0-indexed
  const [generateResult, setGenerateResult] = useState<string | null>(null);

  // Create form state
  const [formTitle, setFormTitle] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formCurrency, setFormCurrency] = useState("USD");
  const [formDueDate, setFormDueDate] = useState(new Date(Date.now() + 7 * 24 * 3600 * 1000));
  const [formStudentUid, setFormStudentUid] = useState("");
  const [formStudentName, setFormStudentName] = useState("");
  const [formNote, setFormNote] = useState("");
  const [formInstructions, setFormInstructions] = useState("");
  const [formLink, setFormLink] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStudentPicker, setShowStudentPicker] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!schoolId) return;

    const loadStudents = async () => {
      try {
        const q = query(
          collection(db, "users"),
          where("schoolId", "==", schoolId),
          where("role", "==", "student")
        );
        const snap = await getDocs(q);
        const list: Student[] = snap.docs.map((d) => ({
          id: d.id,
          name: (d.data() as any).name || "Unknown",
        }));
        setStudents(list);
      } catch (e) {
        console.log("[ManagerPayments] Error loading students:", e);
      }
    };

    loadStudents();

    // Real-time listener on payment_requests for this school
    const q = query(
      collection(db, "payment_requests"),
      where("schoolId", "==", schoolId),
      orderBy("dueDate", "asc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: PaymentRequest[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            title: data.title || "",
            amount: data.amount || 0,
            currency: data.currency || "USD",
            dueDate: data.dueDate instanceof Timestamp ? data.dueDate.toDate() : new Date(data.dueDate),
            studentUid: data.studentUid || "",
            studentName: data.studentName || "",
            schoolId: data.schoolId || "",
            note: data.note,
            paymentInstructions: data.paymentInstructions,
            paymentLink: data.paymentLink,
            status: data.status || "due",
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : new Date(),
            createdBy: data.createdBy || "",
            createdByName: data.createdByName || "",
            proofUrl: data.proofUrl,
            proofUploadedAt: data.proofUploadedAt instanceof Timestamp ? data.proofUploadedAt.toDate() : undefined,
            reviewNote: data.reviewNote,
          };
        });
        setPaymentRequests(list);
        setLoading(false);
      },
      (err) => {
        console.log("[ManagerPayments] Snapshot error:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [schoolId]);

  // -----------------------------------------------
  // Generate monthly payment_requests from memberships
  // -----------------------------------------------
  const handleGenerateMonthly = async () => {
    if (!schoolId) return;
    setGenerating(true);
    setGenerateResult(null);

    // Build target month string "YYYY-MM" for duplicate detection
    const mm = String(generateMonth + 1).padStart(2, "0");
    const targetMonth = `${generateYear}-${mm}`;
    console.log(`[GenerateMonthly] Target month: ${targetMonth}`);

    try {
      await waitForAuthReady();
      const uid = auth.currentUser?.uid;

      // 1. Load all active memberships for this school
      const membSnap = await getDocs(
        query(
          collection(db, "student_membership"),
          where("schoolId", "==", schoolId),
          where("active", "==", true)
        )
      );
      const memberships: StudentMembership[] = membSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<StudentMembership, "id">),
      }));
      console.log(`[GenerateMonthly] Active memberships found: ${memberships.length}`);

      // 2. Load existing generated payment_requests for this school + month to detect duplicates
      const existingSnap = await getDocs(
        query(
          collection(db, "payment_requests"),
          where("schoolId", "==", schoolId),
          where("generatedFromMembership", "==", true),
          where("targetMonth", "==", targetMonth)
        )
      );
      // Build a Set of "studentUid|title" for O(1) lookup
      const existingKeys = new Set<string>();
      existingSnap.docs.forEach((d) => {
        const data = d.data();
        existingKeys.add(`${data.studentUid}|${data.title}`);
      });
      console.log(`[GenerateMonthly] Existing generated requests for ${targetMonth}: ${existingSnap.docs.length}`);

      // 3. Resolve student names in one batch
      const studentNameCache: Record<string, string> = {};
      for (const m of memberships) {
        if (!studentNameCache[m.studentUid]) {
          try {
            const userSnap = await getDoc(doc(db, "users", m.studentUid));
            studentNameCache[m.studentUid] = (userSnap.data() as any)?.name || "";
          } catch {
            studentNameCache[m.studentUid] = "";
          }
        }
      }

      // 4. Generate payment_requests for each membership
      let created = 0;
      let skipped = 0;

      for (const m of memberships) {
        const dupKey = `${m.studentUid}|${m.title}`;
        if (existingKeys.has(dupKey)) {
          console.log(`[GenerateMonthly] SKIP duplicate: ${dupKey} for ${targetMonth}`);
          skipped++;
          continue;
        }

        // Clamp dueDay safely to the last valid day of the target month
        const rawDay = Math.max(1, Math.min(m.dueDay || 1, 31));
        const lastDay = new Date(generateYear, generateMonth + 1, 0).getDate();
        const clampedDay = Math.min(rawDay, lastDay);
        const dueDate = new Date(generateYear, generateMonth, clampedDay);

        const studentName = studentNameCache[m.studentUid] || "";

        // Write payment_request
        const prRef = await addDoc(collection(db, "payment_requests"), {
          title: m.title,
          amount: m.amount,
          currency: m.currency || "USD",
          dueDate: Timestamp.fromDate(dueDate),
          studentUid: m.studentUid,
          studentName,
          schoolId,
          paymentInstructions: m.paymentInstructions || null,
          paymentLink: m.paymentLink || null,
          note: null,
          status: "due",
          generatedFromMembership: true,
          targetMonth,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: uid || "",
          createdByName: "Manager",
        });
        console.log(`[GenerateMonthly] CREATED payment_request ${prRef.id} for ${studentName} (${m.title})`);

        // Write linked invoice so student sees it in My Payments
        await addDoc(collection(db, "schools", schoolId, "invoices"), {
          studentUid: m.studentUid,
          studentName,
          amount: m.amount,
          currency: m.currency || "USD",
          description: m.title,
          dueAt: Timestamp.fromDate(dueDate),
          status: "due",
          paid: false,
          proofUrl: null,
          proofNote: "",
          proofUploadedAt: null,
          methodChosen: null,
          paidAt: null,
          confirmedBy: null,
          confirmedByName: null,
          rejectedReason: null,
          submittedAt: null,
          approvedAt: null,
          approvedBy: null,
          paymentInstructions: m.paymentInstructions || null,
          paymentLink: m.paymentLink || null,
          note: null,
          paymentRequestId: prRef.id,
          generatedFromMembership: true,
          targetMonth,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: uid || "",
        });

        // Update lastGeneratedMonth on the membership template
        try {
          await updateDoc(doc(db, "student_membership", m.id), {
            lastGeneratedMonth: Timestamp.fromDate(new Date(generateYear, generateMonth, 1)),
          });
          console.log(`[GenerateMonthly] Updated lastGeneratedMonth for membership ${m.id}`);
        } catch (e) {
          console.warn(`[GenerateMonthly] Failed to update lastGeneratedMonth for ${m.id} (non-fatal):`, e);
        }

        created++;
      }

      const summary = `Created: ${created}  |  Skipped (duplicates): ${skipped}`;
      console.log(`[GenerateMonthly] Done. ${summary}`);
      setGenerateResult(summary);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.error("[GenerateMonthly] Error:", e);
      setGenerateResult("Error generating payments. Check logs.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setGenerating(false);
    }
  };

  const handleCreate = async () => {
    if (!formTitle.trim()) {
      Alert.alert("", tr.paymentRequests.requiredField + ": " + tr.paymentRequests.titleLabel);
      return;
    }
    if (!formAmount || isNaN(Number(formAmount)) || Number(formAmount) <= 0) {
      Alert.alert("", tr.paymentRequests.requiredField + ": " + tr.paymentRequests.amount);
      return;
    }
    if (!formStudentUid) {
      Alert.alert("", tr.paymentRequests.requiredField + ": " + tr.paymentRequests.student);
      return;
    }
    if (!schoolId) return;

    setCreating(true);
    try {
      await waitForAuthReady();
      const uid = auth.currentUser?.uid;
      const creatorName = students.find((s) => s.id === uid)?.name || auth.currentUser?.email || "Manager";

      // Write to payment_requests (manager's view / source of truth)
      const prRef = await addDoc(collection(db, "payment_requests"), {
        title: formTitle.trim(),
        amount: Number(formAmount),
        currency: formCurrency.trim() || "USD",
        dueDate: Timestamp.fromDate(formDueDate),
        studentUid: formStudentUid,
        studentName: formStudentName,
        schoolId,
        note: formNote.trim() || null,
        paymentInstructions: formInstructions.trim() || null,
        paymentLink: formLink.trim() || null,
        status: "due",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: uid || "",
        createdByName: creatorName,
      });

      // Also write to schools/{schoolId}/invoices so the student can see it
      // in their My Payments screen and submit proof through the standard flow.
      await addDoc(collection(db, "schools", schoolId, "invoices"), {
        studentUid: formStudentUid,
        studentName: formStudentName,
        amount: Number(formAmount),
        currency: formCurrency.trim() || "USD",
        description: formTitle.trim(),
        dueAt: Timestamp.fromDate(formDueDate),
        status: "due",
        paid: false,
        proofUrl: null,
        proofNote: "",
        proofUploadedAt: null,
        methodChosen: null,
        paidAt: null,
        confirmedBy: null,
        confirmedByName: null,
        rejectedReason: null,
        submittedAt: null,
        approvedAt: null,
        approvedBy: null,
        paymentInstructions: formInstructions.trim() || null,
        paymentLink: formLink.trim() || null,
        note: formNote.trim() || null,
        paymentRequestId: prRef.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: uid || "",
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowCreateModal(false);
      resetForm();
    } catch (e) {
      console.log("[ManagerPayments] Create error:", e);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", tr.paymentRequests.failedCreate);
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setFormTitle("");
    setFormAmount("");
    setFormCurrency("USD");
    setFormDueDate(new Date(Date.now() + 7 * 24 * 3600 * 1000));
    setFormStudentUid("");
    setFormStudentName("");
    setFormNote("");
    setFormInstructions("");
    setFormLink("");
  };

  const handleApprove = async (req: PaymentRequest) => {
    Alert.alert(tr.paymentRequests.approvePayment, tr.paymentRequests.confirmApprove, [
      { text: tr.paymentRequests.cancel, style: "cancel" },
      {
        text: tr.paymentRequests.approvePayment,
        onPress: async () => {
          setReviewLoading(true);
          try {
            await updateDoc(doc(db, "payment_requests", req.id), {
              status: "approved",
              reviewNote: reviewNote.trim() || null,
              updatedAt: serverTimestamp(),
            });

            // Also confirm the linked invoice so student sees "Paid"
            try {
              const invSnap = await getDocs(query(collection(db, "schools", req.schoolId, "invoices"), where("paymentRequestId", "==", req.id)));
              for (const d of invSnap.docs) {
                await updateDoc(d.ref, {
                  status: "confirmed",
                  paid: true,
                  paidAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                });
              }
            } catch (syncErr) {
              console.warn("[ManagerPayments] invoice sync on approve failed (non-fatal):", syncErr);
            }

            setReviewNote("");
            setSelectedRequest(null);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (e) {
            Alert.alert("Error", tr.paymentRequests.failedUpdate);
          } finally {
            setReviewLoading(false);
          }
        },
      },
    ]);
  };

  const handleReject = async (req: PaymentRequest) => {
    Alert.alert(tr.paymentRequests.rejectPayment, tr.paymentRequests.confirmReject, [
      { text: tr.paymentRequests.cancel, style: "cancel" },
      {
        text: tr.paymentRequests.rejectPayment,
        style: "destructive",
        onPress: async () => {
          setReviewLoading(true);
          try {
            await updateDoc(doc(db, "payment_requests", req.id), {
              status: "rejected",
              reviewNote: reviewNote.trim() || null,
              updatedAt: serverTimestamp(),
            });

            // Also reject the linked invoice so student can resubmit
            try {
              const invSnap = await getDocs(query(collection(db, "schools", req.schoolId, "invoices"), where("paymentRequestId", "==", req.id)));
              for (const d of invSnap.docs) {
                await updateDoc(d.ref, {
                  status: "rejected",
                  paid: false,
                  rejectedReason: reviewNote.trim() || null,
                  updatedAt: serverTimestamp(),
                });
              }
            } catch (syncErr) {
              console.warn("[ManagerPayments] invoice sync on reject failed (non-fatal):", syncErr);
            }

            setReviewNote("");
            setSelectedRequest(null);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (e) {
            Alert.alert("Error", tr.paymentRequests.failedUpdate);
          } finally {
            setReviewLoading(false);
          }
        },
      },
    ]);
  };

  const filteredRequests = filterStatus === "all"
    ? paymentRequests
    : paymentRequests.filter((r) => r.status === filterStatus);

  const filterTabs: { key: PaymentStatus | "all"; label: string }[] = [
    { key: "all", label: "All" },
    { key: "due", label: tr.paymentRequests.due },
    { key: "submitted", label: tr.paymentRequests.submitted },
    { key: "approved", label: tr.paymentRequests.approved },
    { key: "rejected", label: tr.paymentRequests.rejected },
  ];

  if (role !== "manager") {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.background, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: COLORS.textMuted }}>{tr.admin.accessDenied}</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 }}>
          <Pressable onPress={() => router.back()} style={{ marginRight: 12, padding: 8, borderRadius: 12, backgroundColor: COLORS.card }}>
            <ArrowLeft size={22} color={COLORS.text} />
          </Pressable>
          <Text style={{ flex: 1, color: COLORS.text, fontSize: 20, fontWeight: "700" }}>
            {tr.paymentRequests.title}
          </Text>
          <Pressable
            onPress={() => { setShowGenerateModal(true); setGenerateResult(null); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            style={{ backgroundColor: COLORS.card, borderRadius: 12, padding: 10, marginRight: 8, borderWidth: 1, borderColor: COLORS.border }}
          >
            <CalendarDays size={22} color={COLORS.accent} />
          </Pressable>
          <Pressable
            onPress={() => { setShowCreateModal(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            style={{ backgroundColor: COLORS.accent, borderRadius: 12, padding: 10 }}
          >
            <Plus size={22} color="#000" />
          </Pressable>
        </View>

        {/* Status filter tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
          {filterTabs.map((tab) => (
            <Pressable
              key={tab.key}
              onPress={() => setFilterStatus(tab.key)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 20,
                backgroundColor: filterStatus === tab.key ? COLORS.accent : COLORS.card,
                borderWidth: 1,
                borderColor: filterStatus === tab.key ? COLORS.accent : COLORS.border,
              }}
            >
              <Text style={{ color: filterStatus === tab.key ? "#000" : COLORS.textSecondary, fontWeight: "600", fontSize: 13 }}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* List */}
        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator size="large" color={COLORS.accent} />
          </View>
        ) : filteredRequests.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 }}>
            <DollarSign size={48} color={COLORS.textMuted} />
            <Text style={{ color: COLORS.textMuted, fontSize: 16, textAlign: "center", marginTop: 16 }}>
              {tr.paymentRequests.noPaymentRequests}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredRequests}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 20, gap: 12 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => { setSelectedRequest(item); setReviewNote(item.reviewNote || ""); }}
                style={{
                  backgroundColor: COLORS.card,
                  borderRadius: 16,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: COLORS.cardBorder,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
                  <Text style={{ flex: 1, color: COLORS.text, fontWeight: "700", fontSize: 15, marginRight: 8 }} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <StatusBadge status={item.status} dueDate={item.dueDate} tr={tr} />
                </View>

                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                  <User size={14} color={COLORS.textMuted} />
                  <Text style={{ color: COLORS.textMuted, fontSize: 13, marginLeft: 6 }}>{item.studentName}</Text>
                </View>

                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                  <Text style={{ color: COLORS.accent, fontWeight: "700", fontSize: 16 }}>
                    {item.currency} {item.amount.toFixed(2)}
                  </Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>
                    {tr.paymentRequests.dueOn} {item.dueDate.toLocaleDateString()}
                  </Text>
                </View>

                {item.proofUrl && (
                  <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, backgroundColor: "rgba(76,123,244,0.1)", borderRadius: 8, padding: 8 }}>
                    <FileText size={14} color={COLORS.blue} />
                    <Text style={{ color: COLORS.blue, fontSize: 12, marginLeft: 6 }}>{tr.paymentRequests.proofUploaded}</Text>
                  </View>
                )}
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>

      {/* Detail Modal */}
      <Modal visible={!!selectedRequest} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: "90%", borderTopWidth: 1, borderColor: COLORS.cardBorder }}>
            {selectedRequest && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: "700", flex: 1, marginRight: 12 }}>{selectedRequest.title}</Text>
                  <Pressable onPress={() => setSelectedRequest(null)} style={{ backgroundColor: COLORS.inputBackground, borderRadius: 20, padding: 8 }}>
                    <X size={20} color={COLORS.textMuted} />
                  </Pressable>
                </View>

                <View style={{ marginBottom: 12 }}>
                  <StatusBadge status={selectedRequest.status} dueDate={selectedRequest.dueDate} tr={tr} />
                </View>

                {/* Info rows */}
                {[
                  { label: tr.paymentRequests.student, value: selectedRequest.studentName },
                  { label: tr.paymentRequests.amount, value: `${selectedRequest.currency} ${selectedRequest.amount.toFixed(2)}` },
                  { label: tr.paymentRequests.dueDate, value: selectedRequest.dueDate.toLocaleDateString() },
                ].map((row) => (
                  <View key={row.label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                    <Text style={{ color: COLORS.textMuted, fontSize: 14 }}>{row.label}</Text>
                    <Text style={{ color: COLORS.text, fontSize: 14, fontWeight: "500", flex: 1, textAlign: "right" }}>{row.value}</Text>
                  </View>
                ))}

                {selectedRequest.note ? (
                  <View style={{ marginTop: 12, backgroundColor: COLORS.inputBackground, borderRadius: 12, padding: 12 }}>
                    <Text style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>Note</Text>
                    <Text style={{ color: COLORS.textSecondary, fontSize: 14 }}>{selectedRequest.note}</Text>
                  </View>
                ) : null}

                {selectedRequest.paymentInstructions ? (
                  <View style={{ marginTop: 12, backgroundColor: COLORS.inputBackground, borderRadius: 12, padding: 12 }}>
                    <Text style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>{tr.paymentRequests.paymentInstructions}</Text>
                    <Text style={{ color: COLORS.textSecondary, fontSize: 14 }}>{selectedRequest.paymentInstructions}</Text>
                  </View>
                ) : null}

                {selectedRequest.reviewNote ? (
                  <View style={{ marginTop: 12, backgroundColor: COLORS.inputBackground, borderRadius: 12, padding: 12 }}>
                    <Text style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>{tr.paymentRequests.reviewNote}</Text>
                    <Text style={{ color: COLORS.textSecondary, fontSize: 14 }}>{selectedRequest.reviewNote}</Text>
                  </View>
                ) : null}

                {/* Proof image */}
                {selectedRequest.proofUrl ? (
                  <View style={{ marginTop: 16 }}>
                    <Text style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 8 }}>{tr.paymentRequests.viewProof}</Text>
                    <Image
                      source={{ uri: selectedRequest.proofUrl }}
                      style={{ width: "100%", height: 200, borderRadius: 12 }}
                      contentFit="cover"
                    />
                  </View>
                ) : null}

                {/* Manager actions for submitted requests */}
                {selectedRequest.status === "submitted" && (
                  <>
                    <View style={{ marginTop: 16 }}>
                      <Text style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 8 }}>{tr.paymentRequests.reviewNote}</Text>
                      <TextInput
                        value={reviewNote}
                        onChangeText={setReviewNote}
                        placeholder={tr.paymentRequests.addReviewNote}
                        placeholderTextColor={COLORS.textMuted}
                        multiline
                        style={{
                          backgroundColor: COLORS.inputBackground,
                          borderRadius: 12,
                          padding: 14,
                          color: COLORS.text,
                          fontSize: 14,
                          borderWidth: 1,
                          borderColor: COLORS.border,
                          minHeight: 80,
                        }}
                      />
                    </View>

                    <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
                      <Pressable
                        onPress={() => handleReject(selectedRequest)}
                        disabled={reviewLoading}
                        style={{ flex: 1, backgroundColor: "rgba(239,68,68,0.15)", borderRadius: 12, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: "rgba(239,68,68,0.3)" }}
                      >
                        {reviewLoading ? (
                          <ActivityIndicator size="small" color={COLORS.danger} />
                        ) : (
                          <Text style={{ color: COLORS.danger, fontWeight: "700" }}>{tr.paymentRequests.rejectPayment}</Text>
                        )}
                      </Pressable>
                      <Pressable
                        onPress={() => handleApprove(selectedRequest)}
                        disabled={reviewLoading}
                        style={{ flex: 1, backgroundColor: COLORS.success, borderRadius: 12, paddingVertical: 14, alignItems: "center" }}
                      >
                        {reviewLoading ? (
                          <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                          <Text style={{ color: "#FFF", fontWeight: "700" }}>{tr.paymentRequests.approvePayment}</Text>
                        )}
                      </Pressable>
                    </View>
                  </>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Create Payment Request Modal */}
      <Modal visible={showCreateModal} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: "95%", borderTopWidth: 1, borderColor: COLORS.cardBorder }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: "700" }}>{tr.paymentRequests.createTitle}</Text>
              <Pressable onPress={() => { setShowCreateModal(false); resetForm(); }} style={{ backgroundColor: COLORS.inputBackground, borderRadius: 20, padding: 8 }}>
                <X size={20} color={COLORS.textMuted} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Title */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>{tr.paymentRequests.titleLabel} *</Text>
                <TextInput
                  value={formTitle}
                  onChangeText={setFormTitle}
                  placeholder={tr.paymentRequests.titlePlaceholder}
                  placeholderTextColor={COLORS.textMuted}
                  style={{ backgroundColor: COLORS.inputBackground, borderRadius: 12, padding: 14, color: COLORS.text, fontSize: 15, borderWidth: 1, borderColor: COLORS.border }}
                />
              </View>

              {/* Amount + Currency */}
              <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
                <View style={{ flex: 2 }}>
                  <Text style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>{tr.paymentRequests.amount} *</Text>
                  <TextInput
                    value={formAmount}
                    onChangeText={setFormAmount}
                    placeholder="0.00"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="decimal-pad"
                    style={{ backgroundColor: COLORS.inputBackground, borderRadius: 12, padding: 14, color: COLORS.text, fontSize: 15, borderWidth: 1, borderColor: COLORS.border }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>{tr.paymentRequests.currency}</Text>
                  <TextInput
                    value={formCurrency}
                    onChangeText={setFormCurrency}
                    placeholder="USD"
                    placeholderTextColor={COLORS.textMuted}
                    autoCapitalize="characters"
                    maxLength={5}
                    style={{ backgroundColor: COLORS.inputBackground, borderRadius: 12, padding: 14, color: COLORS.text, fontSize: 15, borderWidth: 1, borderColor: COLORS.border }}
                  />
                </View>
              </View>

              {/* Due Date */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>{tr.paymentRequests.dueDate} *</Text>
                <Pressable
                  onPress={() => setShowDatePicker(true)}
                  style={{ backgroundColor: COLORS.inputBackground, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border, flexDirection: "row", alignItems: "center" }}
                >
                  <Clock size={16} color={COLORS.textMuted} style={{ marginRight: 8 }} />
                  <Text style={{ color: COLORS.text, fontSize: 15 }}>{formDueDate.toLocaleDateString()}</Text>
                </Pressable>
                {showDatePicker && (
                  <DateTimePicker
                    value={formDueDate}
                    mode="date"
                    display="default"
                    minimumDate={new Date()}
                    onChange={(_, date) => {
                      setShowDatePicker(false);
                      if (date) setFormDueDate(date);
                    }}
                  />
                )}
              </View>

              {/* Student picker */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>{tr.paymentRequests.student} *</Text>
                <Pressable
                  onPress={() => setShowStudentPicker(true)}
                  style={{ backgroundColor: COLORS.inputBackground, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                >
                  <Text style={{ color: formStudentName ? COLORS.text : COLORS.textMuted, fontSize: 15 }}>
                    {formStudentName || tr.paymentRequests.selectStudent}
                  </Text>
                  <ChevronRight size={18} color={COLORS.textMuted} />
                </Pressable>
              </View>

              {/* Note */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>{tr.paymentRequests.note}</Text>
                <TextInput
                  value={formNote}
                  onChangeText={setFormNote}
                  placeholder={tr.paymentRequests.notePlaceholder}
                  placeholderTextColor={COLORS.textMuted}
                  multiline
                  style={{ backgroundColor: COLORS.inputBackground, borderRadius: 12, padding: 14, color: COLORS.text, fontSize: 15, borderWidth: 1, borderColor: COLORS.border, minHeight: 70 }}
                />
              </View>

              {/* Payment Instructions */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>{tr.paymentRequests.paymentInstructions}</Text>
                <TextInput
                  value={formInstructions}
                  onChangeText={setFormInstructions}
                  placeholder={tr.paymentRequests.paymentInstructionsPlaceholder}
                  placeholderTextColor={COLORS.textMuted}
                  multiline
                  style={{ backgroundColor: COLORS.inputBackground, borderRadius: 12, padding: 14, color: COLORS.text, fontSize: 15, borderWidth: 1, borderColor: COLORS.border, minHeight: 70 }}
                />
              </View>

              {/* Payment Link */}
              <View style={{ marginBottom: 24 }}>
                <Text style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>{tr.paymentRequests.paymentLink}</Text>
                <TextInput
                  value={formLink}
                  onChangeText={setFormLink}
                  placeholder={tr.paymentRequests.paymentLinkPlaceholder}
                  placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="none"
                  keyboardType="url"
                  style={{ backgroundColor: COLORS.inputBackground, borderRadius: 12, padding: 14, color: COLORS.text, fontSize: 15, borderWidth: 1, borderColor: COLORS.border }}
                />
              </View>

              <Pressable
                onPress={handleCreate}
                disabled={creating}
                style={{ backgroundColor: COLORS.accent, borderRadius: 14, paddingVertical: 16, alignItems: "center", opacity: creating ? 0.7 : 1 }}
              >
                {creating ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <Text style={{ color: "#000", fontWeight: "700", fontSize: 16 }}>{tr.paymentRequests.create}</Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </View>

        {/* Student picker modal - nested inside create modal to fix iOS stacking issue */}
        <Modal visible={showStudentPicker} animationType="slide" transparent>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" }}>
            <View style={{ backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: "70%", borderTopWidth: 1, borderColor: COLORS.cardBorder }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: "700" }}>{tr.paymentRequests.selectStudent}</Text>
                <Pressable onPress={() => setShowStudentPicker(false)} style={{ backgroundColor: COLORS.inputBackground, borderRadius: 20, padding: 8 }}>
                  <X size={20} color={COLORS.textMuted} />
                </Pressable>
              </View>
              {students.length === 0 ? (
                <Text style={{ color: COLORS.textMuted, textAlign: "center", paddingVertical: 24 }}>{tr.progressScreen.noStudentsFound}</Text>
              ) : (
                <FlatList
                  data={students}
                  keyExtractor={(s) => s.id}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => {
                        setFormStudentUid(item.id);
                        setFormStudentName(item.name);
                        setShowStudentPicker(false);
                      }}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        padding: 14,
                        borderRadius: 12,
                        marginBottom: 8,
                        backgroundColor: formStudentUid === item.id ? COLORS.accentLight : COLORS.inputBackground,
                        borderWidth: 1,
                        borderColor: formStudentUid === item.id ? COLORS.accent : COLORS.border,
                      }}
                    >
                      <User size={16} color={formStudentUid === item.id ? COLORS.accent : COLORS.textMuted} />
                      <Text style={{ color: COLORS.text, fontSize: 15, marginLeft: 10, fontWeight: "500" }}>{item.name}</Text>
                      {formStudentUid === item.id && <Check size={16} color={COLORS.accent} style={{ marginLeft: "auto" }} />}
                    </Pressable>
                  )}
                />
              )}
            </View>
          </View>
        </Modal>
      </Modal>

      {/* Generate Monthly Payments Modal */}
      <Modal visible={showGenerateModal} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 44, borderTopWidth: 1, borderColor: COLORS.cardBorder }}>
            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <CalendarDays size={20} color={COLORS.accent} />
                <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: "700" }}>Generate Monthly Payments</Text>
              </View>
              <Pressable
                onPress={() => { setShowGenerateModal(false); setGenerateResult(null); }}
                style={{ backgroundColor: COLORS.inputBackground, borderRadius: 20, padding: 8 }}
              >
                <X size={20} color={COLORS.textMuted} />
              </Pressable>
            </View>

            <Text style={{ color: COLORS.textMuted, fontSize: 13, marginBottom: 24 }}>
              Creates payment requests from active membership templates for the selected month.
            </Text>

            {/* Month picker */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 0, marginBottom: 28 }}>
              <Pressable
                onPress={() => {
                  if (generateMonth === 0) { setGenerateMonth(11); setGenerateYear(y => y - 1); }
                  else setGenerateMonth(m => m - 1);
                }}
                style={{ padding: 12, borderRadius: 12, backgroundColor: COLORS.inputBackground }}
              >
                <ChevronLeft size={22} color={COLORS.text} />
              </Pressable>
              <View style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: "700" }}>
                  {new Date(generateYear, generateMonth, 1).toLocaleString("default", { month: "long" })} {generateYear}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  if (generateMonth === 11) { setGenerateMonth(0); setGenerateYear(y => y + 1); }
                  else setGenerateMonth(m => m + 1);
                }}
                style={{ padding: 12, borderRadius: 12, backgroundColor: COLORS.inputBackground }}
              >
                <ChevronRight size={22} color={COLORS.text} />
              </Pressable>
            </View>

            {/* Result feedback */}
            {generateResult && (
              <View style={{ backgroundColor: generateResult.startsWith("Error") ? "rgba(239,68,68,0.12)" : "rgba(16,185,129,0.12)", borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: generateResult.startsWith("Error") ? "rgba(239,68,68,0.3)" : "rgba(16,185,129,0.3)" }}>
                <Text style={{ color: generateResult.startsWith("Error") ? COLORS.danger : COLORS.success, fontSize: 14, fontWeight: "600", textAlign: "center" }}>
                  {generateResult}
                </Text>
              </View>
            )}

            {/* Generate button */}
            <Pressable
              onPress={handleGenerateMonthly}
              disabled={generating}
              style={{ backgroundColor: COLORS.accent, borderRadius: 14, paddingVertical: 16, alignItems: "center", opacity: generating ? 0.7 : 1 }}
            >
              {generating ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Text style={{ color: "#000", fontWeight: "700", fontSize: 16 }}>Generate Payments</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
