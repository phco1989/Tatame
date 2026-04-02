import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  collection,
  doc,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import {
  ChevronLeft,
  UserSearch,
  DollarSign,
  FileText,
  Calendar,
  Check,
  ChevronDown,
} from "lucide-react-native";
import { db } from "@/lib/firebase-config";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import { useFinanceGuard } from "@/lib/premiumAccess";
import type { StudentSummary } from "@/types/payments";
import DateTimePicker from "@react-native-community/datetimepicker";

const C = {
  bg: "#070D1A",
  surface: "rgba(255,255,255,0.04)",
  surfaceHover: "rgba(255,255,255,0.07)",
  border: "rgba(255,255,255,0.08)",
  borderActive: "rgba(212,160,23,0.50)",
  text: "#FFFFFF",
  textSub: "rgba(255,255,255,0.60)",
  textMuted: "rgba(255,255,255,0.35)",
  gold: "#D4A017",
  goldBg: "rgba(212,160,23,0.12)",
  inputBg: "rgba(255,255,255,0.06)",
  success: "#34D399",
  danger: "#F87171",
  modalBg: "#0A1628",
};

export default function CreateInvoiceScreen() {
  const router = useRouter();
  const hasFinance = useFinanceGuard();
  const { uid, schoolId, role, loading: userLoading } = useCurrentUser();

  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<StudentSummary | null>(null);
  const [showStudentPicker, setShowStudentPicker] = useState(false);

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 7 * 24 * 3600 * 1000));
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  // load students in same school
  useEffect(() => {
    if (!schoolId) return;
    (async () => {
      try {
        const q = query(
          collection(db, "users"),
          where("schoolId", "==", schoolId),
          where("role", "==", "student")
        );
        const snap = await getDocs(q);
        const list: StudentSummary[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            uid: d.id,
            name: data.displayName ?? data.name ?? data.email ?? d.id,
            photoURL: data.photoURL ?? null,
          };
        });
        setStudents(list);
      } catch (e) {
        console.error("[CreateInvoice] load students error", e);
      } finally {
        setStudentsLoading(false);
      }
    })();
  }, [schoolId]);

  const handleSubmit = useCallback(async () => {
    if (!selectedStudent) {
      Alert.alert("Missing Field", "Please select a student.");
      return;
    }
    const amountNum = parseFloat(amount);
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount.");
      return;
    }
    if (!description.trim()) {
      Alert.alert("Missing Field", "Please enter a description.");
      return;
    }
    if (!schoolId || !uid) return;

    setSubmitting(true);
    try {
      await addDoc(collection(db, "schools", schoolId, "invoices"), {
        studentUid: selectedStudent.uid,
        studentName: selectedStudent.name,
        amount: amountNum,
        currency: "USD",
        description: description.trim(),
        dueAt: Timestamp.fromDate(dueDate),
        status: "pending",
        paid: false,
        methodChosen: null,
        proofUrl: null,
        proofNote: "",
        proofUploadedAt: null,
        paidAt: null,
        confirmedBy: null,
        confirmedByName: null,
        rejectedReason: null,
        createdAt: serverTimestamp(),
        createdBy: uid,
        updatedAt: serverTimestamp(),
        submittedAt: null,
        approvedAt: null,
        approvedBy: null,
      });
      Alert.alert("Invoice Created", `Invoice created for ${selectedStudent.name}.`, [
        {
          text: "OK",
          onPress: () => router.back(),
        },
      ]);
    } catch (e) {
      console.error("[CreateInvoice] submit error", e);
      Alert.alert("Error", "Failed to create invoice. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [selectedStudent, amount, description, dueDate, schoolId, uid, router]);

  if (userLoading || studentsLoading) {
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
          <Text style={{ color: C.text, fontSize: 20, fontWeight: "700", flex: 1 }}>
            New Invoice
          </Text>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Student */}
          <SectionLabel icon={<UserSearch size={16} color={C.gold} />} label="Student" />
          <Pressable
            onPress={() => setShowStudentPicker(true)}
            style={({ pressed }) => ({
              backgroundColor: pressed ? C.surfaceHover : C.inputBg,
              borderRadius: 14,
              paddingHorizontal: 16,
              paddingVertical: 14,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 8,
              marginBottom: 20,
              borderWidth: 1,
              borderColor: selectedStudent ? C.borderActive : C.border,
            })}
          >
            <Text
              style={{
                color: selectedStudent ? C.text : C.textMuted,
                fontSize: 15,
                fontWeight: selectedStudent ? "600" : "400",
              }}
            >
              {selectedStudent ? selectedStudent.name : "Select student..."}
            </Text>
            <ChevronDown size={18} color={C.textMuted} />
          </Pressable>

          {/* Amount */}
          <SectionLabel icon={<DollarSign size={16} color={C.gold} />} label="Amount (USD)" />
          <TextInput
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            placeholderTextColor={C.textMuted}
            keyboardType="decimal-pad"
            style={{
              backgroundColor: C.inputBg,
              borderRadius: 14,
              paddingHorizontal: 16,
              paddingVertical: 14,
              color: C.text,
              fontSize: 22,
              fontWeight: "700",
              marginTop: 8,
              marginBottom: 20,
              borderWidth: 1,
              borderColor: amount ? C.borderActive : C.border,
            }}
          />

          {/* Description */}
          <SectionLabel icon={<FileText size={16} color={C.gold} />} label="Description" />
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Monthly tuition, gi fee, seminar..."
            placeholderTextColor={C.textMuted}
            multiline
            numberOfLines={3}
            style={{
              backgroundColor: C.inputBg,
              borderRadius: 14,
              paddingHorizontal: 16,
              paddingVertical: 12,
              color: C.text,
              fontSize: 15,
              marginTop: 8,
              marginBottom: 20,
              borderWidth: 1,
              borderColor: description ? C.borderActive : C.border,
              minHeight: 80,
              textAlignVertical: "top",
            }}
          />

          {/* Due Date */}
          <SectionLabel icon={<Calendar size={16} color={C.gold} />} label="Due Date" />
          <Pressable
            onPress={() => setShowDatePicker(true)}
            style={({ pressed }) => ({
              backgroundColor: pressed ? C.surfaceHover : C.inputBg,
              borderRadius: 14,
              paddingHorizontal: 16,
              paddingVertical: 14,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 8,
              marginBottom: 32,
              borderWidth: 1,
              borderColor: C.borderActive,
            })}
          >
            <Text style={{ color: C.text, fontSize: 15, fontWeight: "600" }}>
              {dueDate.toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </Text>
            <Calendar size={18} color={C.gold} />
          </Pressable>

          {showDatePicker && (
            <DateTimePicker
              value={dueDate}
              mode="date"
              display="spinner"
              minimumDate={new Date()}
              textColor="#FFFFFF"
              onChange={(_e, date) => {
                setShowDatePicker(false);
                if (date) setDueDate(date);
              }}
            />
          )}

          {/* Submit */}
          <Pressable
            onPress={handleSubmit}
            disabled={submitting}
            style={({ pressed }) => ({
              backgroundColor: pressed ? "rgba(212,160,23,0.8)" : C.gold,
              borderRadius: 16,
              paddingVertical: 16,
              alignItems: "center",
              opacity: submitting ? 0.6 : 1,
            })}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Check size={18} color="#fff" />
                <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
                  Create Invoice
                </Text>
              </View>
            )}
          </Pressable>
        </ScrollView>
      </SafeAreaView>

      {/* Student Picker Modal */}
      <Modal
        visible={showStudentPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowStudentPicker(false)}
      >
        <View style={{ flex: 1, backgroundColor: C.modalBg }}>
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
            <Text style={{ color: C.text, fontSize: 18, fontWeight: "700", flex: 1 }}>
              Select Student
            </Text>
            <Pressable onPress={() => setShowStudentPicker(false)}>
              <Text style={{ color: C.gold, fontSize: 16, fontWeight: "600" }}>Cancel</Text>
            </Pressable>
          </View>
          {students.length === 0 ? (
            <View
              style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
            >
              <Text style={{ color: C.textMuted, fontSize: 15 }}>
                No students found in your academy.
              </Text>
            </View>
          ) : (
            <FlatList
              data={students}
              keyExtractor={(item) => item.uid}
              contentContainerStyle={{ padding: 16 }}
              ItemSeparatorComponent={() => (
                <View style={{ height: 1, backgroundColor: C.border }} />
              )}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    setSelectedStudent(item);
                    setShowStudentPicker(false);
                  }}
                  style={({ pressed }) => ({
                    paddingVertical: 14,
                    paddingHorizontal: 4,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text
                    style={{ color: C.text, fontSize: 16, fontWeight: "500" }}
                  >
                    {item.name}
                  </Text>
                  {selectedStudent?.uid === item.uid && (
                    <Check size={18} color={C.gold} />
                  )}
                </Pressable>
              )}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

function SectionLabel({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      {icon}
      <Text
        style={{
          color: C.textSub,
          fontSize: 12,
          fontWeight: "700",
          textTransform: "uppercase",
          letterSpacing: 0.8,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
