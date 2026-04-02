import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StatusBar,
  ActivityIndicator,
  TextInput,
  Modal,
  FlatList,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  Target,
  Calendar,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Wind,
  Plus,
  User,
  FileText,
  Star,
  X,
  Search,
  Check,
  Edit3,
  Trash2,
} from "lucide-react-native";
import Animated, { FadeInDown, FadeInRight } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useTranslations } from "@/lib/i18n";
import { useLanguageStore } from "@/lib/i18n/language-store";
import { useUserRole } from "@/lib/hooks/useUserRole";
import { BeltProgressCard } from "@/components/BeltProgressCard";
import { useTenantStore, selectTenantHydrated, selectIsPro, selectIsNgo } from "@/lib/state/tenant-store";
import { showProRequiredAlert } from "@/lib/premiumAccess";
import { db, auth, waitForAuthReady } from "@/lib/firebase-config";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  Timestamp,
  limit as firestoreLimit,
} from "firebase/firestore";

// --------------------
// Types
// --------------------
type ProgressEntry = {
  id: string;
  schoolId: string;
  studentId: string;
  bookingId?: string;
  createdBy: string;
  createdByRole: "coach" | "manager";
  createdByName?: string;
  type: "feedback" | "note";
  rating?: number;
  tags?: string[];
  text: string;
  createdAt?: Date;
  updatedAt?: Date;
};

/** A note doc from the root `student_notes` collection */
type StudentNote = {
  id: string;
  schoolId: string;
  studentId: string;
  title?: string;
  type?: string;
  text?: string;
  note?: string;
  content?: string;
  authorName?: string;
  createdByName?: string;
  coachName?: string;
  authorId?: string;
  authorUid?: string;
  createdBy?: string;
  createdAt?: Date;
  _resolvedCoachName?: string;
};

type StudentUser = {
  id: string;
  name: string;
  email?: string;
};

// --------------------
// Helpers
// --------------------
function normalizeProgressEntry(docId: string, data: any): ProgressEntry {
  const createdAt =
    data?.createdAt instanceof Timestamp
      ? data.createdAt.toDate()
      : data?.createdAt instanceof Date
      ? data.createdAt
      : undefined;
  const updatedAt =
    data?.updatedAt instanceof Timestamp
      ? data.updatedAt.toDate()
      : data?.updatedAt instanceof Date
      ? data.updatedAt
      : undefined;

  return {
    id: docId,
    schoolId: data?.schoolId ?? "",
    studentId: data?.studentId ?? "",
    bookingId: data?.bookingId,
    createdBy: data?.createdBy ?? "",
    createdByRole: data?.createdByRole ?? "coach",
    createdByName: data?.createdByName ?? data?.authorName,
    type: data?.type ?? "feedback",
    rating: data?.rating,
    tags: data?.tags,
    text: data?.text ?? data?.note ?? data?.content ?? "",
    createdAt,
    updatedAt,
  };
}

function normalizeStudentNote(docId: string, data: any): StudentNote {
  const createdAt =
    data?.createdAt instanceof Timestamp
      ? data.createdAt.toDate()
      : data?.createdAt instanceof Date
      ? data.createdAt
      : undefined;

  return {
    id: docId,
    schoolId: data?.schoolId ?? "",
    studentId: data?.studentId ?? data?.studentUid ?? "",
    title: data?.title,
    type: data?.type,
    text: data?.text,
    note: data?.note,
    content: data?.content,
    authorName: data?.authorName,
    createdByName: data?.createdByName,
    coachName: data?.coachName,
    authorId: data?.authorId,
    authorUid: data?.authorUid,
    createdBy: data?.createdBy,
    createdAt,
  };
}

function formatDate(date?: Date): string {
  if (!date) return "";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getNoteBody(n: StudentNote): string {
  return n.text || n.note || n.content || "";
}

function getInlineCoachName(n: StudentNote): string | undefined {
  return n.authorName || n.createdByName || n.coachName || n._resolvedCoachName;
}

function getCoachUid(n: StudentNote): string | undefined {
  return n.authorId || n.authorUid || n.createdBy;
}

// --------------------
// Progress Entry Card Component (coach/manager view)
// --------------------
function ProgressEntryCard({
  entry,
  index,
  canEdit,
  onEdit,
  onDelete,
  tr,
}: {
  entry: ProgressEntry;
  index: number;
  canEdit: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  tr: any;
}) {
  const isFeedback = entry.type === "feedback";

  return (
    <Animated.View entering={FadeInDown.delay(index * 100).springify()}>
      <View
        style={{
          backgroundColor: "#111827",
          borderRadius: 20,
          padding: 16,
          marginBottom: 12,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.06)",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center flex-1">
            <View
              className="rounded-full p-2 mr-3"
              style={{
                backgroundColor: isFeedback
                  ? "rgba(6,182,212,0.15)"
                  : "rgba(251,191,36,0.15)",
              }}
            >
              {isFeedback ? (
                <MessageSquare size={18} color="#06B6D4" />
              ) : (
                <FileText size={18} color="#FBBF24" />
              )}
            </View>
            <View className="flex-1">
              <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 16 }}>
                {isFeedback ? tr.progressScreen.feedback : tr.progressScreen.note}
              </Text>
              <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
                {entry.createdByName || tr.progressScreen.coach} • {formatDate(entry.createdAt)}
              </Text>
            </View>
          </View>
          {canEdit && (
            <View className="flex-row gap-2">
              <Pressable
                onPress={onEdit}
                style={{ padding: 8, backgroundColor: "#1F2937", borderRadius: 8 }}
              >
                <Edit3 size={16} color="rgba(255,255,255,0.5)" />
              </Pressable>
              <Pressable
                onPress={onDelete}
                style={{
                  padding: 8,
                  backgroundColor: "rgba(239,68,68,0.1)",
                  borderRadius: 8,
                }}
              >
                <Trash2 size={16} color="#EF4444" />
              </Pressable>
            </View>
          )}
        </View>

        {/* Rating */}
        {entry.rating && (
          <View className="flex-row items-center mb-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                size={16}
                color={star <= entry.rating! ? "#F59E0B" : "#E5E7EB"}
                fill={star <= entry.rating! ? "#F59E0B" : "transparent"}
              />
            ))}
          </View>
        )}

        {/* Text Content */}
        <Text style={{ color: "rgba(255,255,255,0.8)", lineHeight: 22 }}>
          {entry.text}
        </Text>

        {/* Tags */}
        {entry.tags && entry.tags.length > 0 && (
          <View className="flex-row flex-wrap gap-2 mt-3">
            {entry.tags.map((tag, i) => (
              <View
                key={i}
                style={{
                  backgroundColor: "rgba(6,182,212,0.15)",
                  paddingHorizontal: 12,
                  paddingVertical: 4,
                  borderRadius: 999,
                }}
              >
                <Text style={{ color: "#06B6D4", fontSize: 12, fontWeight: "500" }}>
                  {tag}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Booking Link */}
        {entry.bookingId && (
          <View
            style={{
              marginTop: 12,
              paddingTop: 12,
              borderTopWidth: 1,
              borderTopColor: "rgba(255,255,255,0.08)",
            }}
          >
            <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
              {tr.progressScreen.linkedToLesson}
            </Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

// --------------------
// Student Note Card Component (student view)
// --------------------
function StudentNoteCard({
  note,
  index,
  tr,
}: {
  note: StudentNote;
  index: number;
  tr: any;
}) {
  const isFeedback = note.type === "feedback";
  const title = note.title
    ? note.title
    : isFeedback
    ? tr.progressScreen.feedback
    : tr.progressScreen.note;
  const coachName = getInlineCoachName(note) || tr.progressScreen.coach;
  const body = getNoteBody(note);

  return (
    <Animated.View entering={FadeInDown.delay(index * 100).springify()}>
      <View
        style={{
          backgroundColor: "#111827",
          borderRadius: 20,
          padding: 16,
          marginBottom: 12,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.06)",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        {/* Header */}
        <View className="flex-row items-center mb-3">
          <View
            className="rounded-full p-2 mr-3"
            style={{
              backgroundColor: isFeedback
                ? "rgba(6,182,212,0.15)"
                : "rgba(251,191,36,0.15)",
            }}
          >
            {isFeedback ? (
              <MessageSquare size={18} color="#06B6D4" />
            ) : (
              <FileText size={18} color="#FBBF24" />
            )}
          </View>
          <View className="flex-1">
            <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 16 }}>
              {title}
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
              {coachName} • {formatDate(note.createdAt)}
            </Text>
          </View>
        </View>

        {/* Body */}
        {body.length > 0 && (
          <Text
            style={{ color: "rgba(255,255,255,0.8)", lineHeight: 22 }}
            numberOfLines={4}
          >
            {body}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

// --------------------
// Student Selector Component
// --------------------
function StudentSelector({
  students,
  selectedStudent,
  onSelect,
  loading,
  tr,
}: {
  students: StudentUser[];
  selectedStudent: StudentUser | null;
  onSelect: (student: StudentUser) => void;
  loading: boolean;
  tr: any;
}) {
  const [expanded, setExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredStudents = students.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.email && s.email.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <View className="mb-4">
      <Pressable
        onPress={() => {
          setExpanded(!expanded);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        style={{
          backgroundColor: "#111827",
          borderRadius: 12,
          padding: 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
        }}
      >
        <View className="flex-row items-center">
          <View
            style={{
              backgroundColor: "rgba(6,182,212,0.15)",
              borderRadius: 999,
              padding: 8,
              marginRight: 12,
            }}
          >
            <User size={20} color="#06B6D4" />
          </View>
          <View>
            <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
              {tr.progressScreen.selectedStudent}
            </Text>
            <Text style={{ color: "#FFFFFF", fontWeight: "600" }}>
              {selectedStudent?.name || tr.progressScreen.selectStudent}
            </Text>
          </View>
        </View>
        {expanded ? (
          <ChevronUp size={20} color="rgba(255,255,255,0.4)" />
        ) : (
          <ChevronDown size={20} color="rgba(255,255,255,0.4)" />
        )}
      </Pressable>

      {expanded && (
        <View
          style={{
            marginTop: 8,
            backgroundColor: "#111827",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
            overflow: "hidden",
          }}
        >
          {/* Search */}
          <View
            style={{
              padding: 12,
              borderBottomWidth: 1,
              borderBottomColor: "rgba(255,255,255,0.08)",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "#1F2937",
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Search size={16} color="rgba(255,255,255,0.4)" />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={tr.progressScreen.searchStudents}
                style={{ flex: 1, marginLeft: 8, color: "#FFFFFF" }}
                placeholderTextColor="rgba(255,255,255,0.4)"
              />
            </View>
          </View>

          {/* Student List */}
          {loading ? (
            <View className="p-6 items-center">
              <ActivityIndicator color="#FBBF24" />
            </View>
          ) : filteredStudents.length === 0 ? (
            <View className="p-6 items-center">
              <Text style={{ color: "rgba(255,255,255,0.5)" }}>
                {tr.progressScreen.noStudentsFound}
              </Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 200 }}>
              {filteredStudents.map((student) => (
                <Pressable
                  key={student.id}
                  onPress={() => {
                    onSelect(student);
                    setExpanded(false);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  style={{
                    padding: 16,
                    borderBottomWidth: 1,
                    borderBottomColor: "rgba(255,255,255,0.06)",
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor:
                      selectedStudent?.id === student.id
                        ? "rgba(6,182,212,0.1)"
                        : "transparent",
                  }}
                >
                  <View>
                    <Text style={{ color: "#FFFFFF", fontWeight: "500" }}>
                      {student.name}
                    </Text>
                    {student.email && (
                      <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>
                        {student.email}
                      </Text>
                    )}
                  </View>
                  {selectedStudent?.id === student.id && (
                    <Check size={20} color="#06B6D4" />
                  )}
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

// --------------------
// Add Entry Modal
// --------------------
function AddEntryModal({
  visible,
  onClose,
  onSave,
  type,
  studentName,
  tr,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (data: {
    type: "feedback" | "note";
    text: string;
    rating?: number;
    tags?: string[];
  }) => void;
  type: "feedback" | "note";
  studentName: string;
  tr: any;
}) {
  const [text, setText] = useState("");
  const [rating, setRating] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!text.trim()) {
      Alert.alert("Error", "Please enter some text");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        type,
        text: text.trim(),
        rating: type === "feedback" && rating > 0 ? rating : undefined,
      });
      setText("");
      setRating(0);
      onClose();
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: "#111827",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderTopWidth: 1,
              borderTopColor: "rgba(255,255,255,0.08)",
              maxHeight: "90%",
            }}
          >
            {/* Drag handle */}
            <View
              style={{ alignItems: "center", paddingTop: 12, paddingBottom: 4 }}
            >
              <View
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: "rgba(255,255,255,0.15)",
                }}
              />
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 20,
                }}
              >
                <Text
                  style={{ color: "#FFFFFF", fontSize: 20, fontWeight: "700" }}
                >
                  {type === "feedback"
                    ? tr.progressScreen.addFeedback
                    : tr.progressScreen.addNote}
                </Text>
                <Pressable onPress={onClose} hitSlop={12}>
                  <X size={24} color="rgba(255,255,255,0.5)" />
                </Pressable>
              </View>

              <Text style={{ color: "rgba(255,255,255,0.5)", marginBottom: 16 }}>
                {tr.progressScreen.forStudent}{" "}
                <Text style={{ color: "#FFFFFF", fontWeight: "500" }}>
                  {studentName}
                </Text>
              </Text>

              {/* Rating (only for feedback) */}
              {type === "feedback" && (
                <View style={{ marginBottom: 20 }}>
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.7)",
                      fontWeight: "500",
                      marginBottom: 10,
                    }}
                  >
                    {tr.progressScreen.ratingOptional}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Pressable
                        key={star}
                        onPress={() => {
                          setRating(star === rating ? 0 : star);
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }}
                        hitSlop={6}
                      >
                        <Star
                          size={32}
                          color={
                            star <= rating
                              ? "#F59E0B"
                              : "rgba(255,255,255,0.2)"
                          }
                          fill={star <= rating ? "#F59E0B" : "transparent"}
                        />
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              {/* Text Input */}
              <View style={{ marginBottom: 20 }}>
                <Text
                  style={{
                    color: "rgba(255,255,255,0.7)",
                    fontWeight: "500",
                    marginBottom: 10,
                  }}
                >
                  {type === "feedback"
                    ? tr.progressScreen.feedback
                    : tr.progressScreen.note}
                </Text>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  placeholder={
                    type === "feedback"
                      ? tr.progressScreen.feedbackPlaceholder
                      : tr.progressScreen.notePlaceholder
                  }
                  multiline
                  numberOfLines={4}
                  style={{
                    backgroundColor: "#1F2937",
                    borderRadius: 12,
                    padding: 16,
                    color: "#FFFFFF",
                    minHeight: 120,
                    fontSize: 15,
                    lineHeight: 22,
                  }}
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  textAlignVertical="top"
                  returnKeyType="default"
                  blurOnSubmit={false}
                />
              </View>

              {/* Save Button */}
              <Pressable
                onPress={handleSave}
                disabled={saving}
                style={{
                  backgroundColor: "#FBBF24",
                  borderRadius: 16,
                  paddingVertical: 16,
                  alignItems: "center",
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? (
                  <ActivityIndicator color="#0B1220" />
                ) : (
                  <Text
                    style={{
                      color: "#0B1220",
                      fontWeight: "700",
                      fontSize: 18,
                    }}
                  >
                    {tr.common.save}
                  </Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// --------------------
// Main Progress Screen
// --------------------
export default function ProgressScreen() {
  const router = useRouter();
  const { role, schoolId, loading: roleLoading } = useUserRole();
  const tenantHydrated = useTenantStore(selectTenantHydrated);
  const isPro = useTenantStore(selectIsPro);
  const isNgo = useTenantStore(selectIsNgo);
  const [uid, setUid] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");

  // Premium gate: redirect non-premium users to the paywall on focus
  useFocusEffect(
    useCallback(() => {
      if (roleLoading || !tenantHydrated) return;
      if (!isPro && !isNgo) {
        showProRequiredAlert(router, "Progress");
        router.replace("/(tabs)");
      }
    }, [roleLoading, tenantHydrated, isPro, isNgo, router])
  );

  // Data state
  const [entries, setEntries] = useState<ProgressEntry[]>([]);
  const [studentNotes, setStudentNotes] = useState<StudentNote[]>([]);
  const [students, setStudents] = useState<StudentUser[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentUser | null>(null);

  // Coach name cache
  const coachNameCache = React.useRef<Map<string, string>>(new Map());

  // UI state
  const [loading, setLoading] = useState(true);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addType, setAddType] = useState<"feedback" | "note">("feedback");

  const tr = useTranslations();
  useLanguageStore((s) => s.locale);

  const isStudent = role === "student";
  const isCoachOrManager = role === "coach" || role === "manager";

  // Get current user
  useEffect(() => {
    waitForAuthReady().then(async () => {
      const user = auth.currentUser;
      if (user) {
        setUid(user.uid);
        setUserName(user.displayName || user.email || "");
      }
    });
  }, []);

  // Fetch students (for coach/manager)
  const fetchStudents = useCallback(async () => {
    if (!schoolId || !isCoachOrManager) return;

    setStudentsLoading(true);
    try {
      const usersRef = collection(db, "users");
      const q = query(
        usersRef,
        where("role", "==", "student"),
        where("schoolId", "==", schoolId)
      );
      const snapshot = await getDocs(q);
      const fetchedStudents: StudentUser[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        fetchedStudents.push({
          id: docSnap.id,
          name: data.displayName || data.name || data.email || "Unknown",
          email: data.email,
        });
      });
      setStudents(fetchedStudents);
    } catch (error) {
      console.log("[Progress] Error fetching students:", error);
    } finally {
      setStudentsLoading(false);
    }
  }, [schoolId, isCoachOrManager]);

  // Resolve coach names for notes without inline names
  const resolveCoachNames = useCallback(
    async (notes: StudentNote[]): Promise<StudentNote[]> => {
      const uidsToFetch: string[] = [];

      for (const n of notes) {
        if (n.authorName || n.createdByName || n.coachName) continue;
        const coachUid = getCoachUid(n);
        if (coachUid && !coachNameCache.current.has(coachUid)) {
          uidsToFetch.push(coachUid);
        }
      }

      const uniqueUids = [...new Set(uidsToFetch)];

      await Promise.all(
        uniqueUids.map(async (uid) => {
          try {
            const userSnap = await getDoc(doc(db, "users", uid));
            if (userSnap.exists()) {
              const d = userSnap.data();
              const name =
                d?.displayName ||
                d?.name ||
                d?.fullName ||
                [d?.firstName, d?.lastName].filter(Boolean).join(" ") ||
                "";
              if (name) coachNameCache.current.set(uid, name);
            }
          } catch {
            // silently ignore
          }
        })
      );

      return notes.map((n) => {
        if (n.authorName || n.createdByName || n.coachName) return n;
        const coachUid = getCoachUid(n);
        const resolved = coachUid
          ? coachNameCache.current.get(coachUid)
          : undefined;
        return resolved ? { ...n, _resolvedCoachName: resolved } : n;
      });
    },
    []
  );

  // Fetch notes from student_notes (student view)
  const fetchStudentNotes = useCallback(async () => {
    if (!schoolId || !uid || !isStudent) return;

    setLoading(true);
    try {
      const notesRef = collection(db, "student_notes");
      let fetchedNotes: StudentNote[] = [];

      for (const field of ["studentUid", "studentId"]) {
        try {
          const q = query(
            notesRef,
            where("schoolId", "==", schoolId),
            where(field, "==", uid),
            orderBy("createdAt", "desc"),
            firestoreLimit(50)
          );
          const snapshot = await getDocs(q);
          if (snapshot.size > 0) {
            snapshot.forEach((docSnap) => {
              fetchedNotes.push(normalizeStudentNote(docSnap.id, docSnap.data()));
            });
            break;
          }
        } catch {
          try {
            const q = query(
              notesRef,
              where("schoolId", "==", schoolId),
              where(field, "==", uid)
            );
            const snapshot = await getDocs(q);
            if (snapshot.size > 0) {
              snapshot.forEach((docSnap) => {
                fetchedNotes.push(
                  normalizeStudentNote(docSnap.id, docSnap.data())
                );
              });
              fetchedNotes.sort((a, b) => {
                if (!a.createdAt && !b.createdAt) return 0;
                if (!a.createdAt) return 1;
                if (!b.createdAt) return -1;
                return b.createdAt.getTime() - a.createdAt.getTime();
              });
              fetchedNotes = fetchedNotes.slice(0, 50);
              break;
            }
          } catch {
            // continue
          }
        }
      }

      const withNames = await resolveCoachNames(fetchedNotes);
      setStudentNotes(withNames);
    } catch (error) {
      console.log("[Progress] Error fetching student_notes:", error);
      setStudentNotes([]);
    } finally {
      setLoading(false);
    }
  }, [schoolId, uid, isStudent, resolveCoachNames]);

  // Fetch entries from student_notes (coach/manager view)
  // FIX: coaches/managers now read from student_notes (same collection they write to)
  const fetchEntries = useCallback(async () => {
    if (!schoolId || !uid) return;
    if (isStudent) return;
    if (!isCoachOrManager || !selectedStudent) {
      setEntries([]);
      return;
    }

    setLoading(true);
    try {
      const notesRef = collection(db, "student_notes");
      let fetchedEntries: ProgressEntry[] = [];

      for (const field of ["studentUid", "studentId"]) {
        try {
          const q = query(
            notesRef,
            where("schoolId", "==", schoolId),
            where(field, "==", selectedStudent.id),
            orderBy("createdAt", "desc")
          );
          const snapshot = await getDocs(q);
          if (snapshot.size > 0) {
            snapshot.forEach((docSnap) => {
              fetchedEntries.push(
                normalizeProgressEntry(docSnap.id, docSnap.data())
              );
            });
            break;
          }
        } catch {
          try {
            const q = query(
              notesRef,
              where("schoolId", "==", schoolId),
              where(field, "==", selectedStudent.id)
            );
            const snapshot = await getDocs(q);
            snapshot.forEach((docSnap) => {
              fetchedEntries.push(
                normalizeProgressEntry(docSnap.id, docSnap.data())
              );
            });
            fetchedEntries.sort((a, b) => {
              if (!a.createdAt && !b.createdAt) return 0;
              if (!a.createdAt) return 1;
              if (!b.createdAt) return -1;
              return b.createdAt.getTime() - a.createdAt.getTime();
            });
            if (fetchedEntries.length > 0) break;
          } catch {
            // continue
          }
        }
      }

      setEntries(fetchedEntries);
    } catch (error) {
      console.log("[Progress] Error fetching entries:", error);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [schoolId, uid, isStudent, isCoachOrManager, selectedStudent]);

  // Initial load
  useEffect(() => {
    if (roleLoading || !uid) return;
    if (isCoachOrManager) {
      fetchStudents();
      fetchEntries();
    }
    if (isStudent) {
      fetchStudentNotes();
    }
  }, [
    roleLoading,
    uid,
    isCoachOrManager,
    isStudent,
    fetchStudents,
    fetchEntries,
    fetchStudentNotes,
  ]);

  // Refresh on focus
  useFocusEffect(
    useCallback(() => {
      if (roleLoading || !uid) return;
      if (isCoachOrManager) fetchEntries();
      if (isStudent) fetchStudentNotes();
    }, [
      roleLoading,
      uid,
      isCoachOrManager,
      isStudent,
      fetchEntries,
      fetchStudentNotes,
    ])
  );

  // Refresh when student selection changes
  useEffect(() => {
    if (selectedStudent && isCoachOrManager) {
      fetchEntries();
    }
  }, [selectedStudent, isCoachOrManager, fetchEntries]);

  // -------------------------------------------------------
  // FIX: handleAddEntry now writes to student_notes
  // so both coaches/managers write and students read
  // from the same collection
  // -------------------------------------------------------
  const handleAddEntry = async (data: {
    type: "feedback" | "note";
    text: string;
    rating?: number;
    tags?: string[];
  }) => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error("You must be signed in to add feedback.");
    }
    const authUid = currentUser.uid;

    // Fetch user doc as source of truth
    let myRole: string | null = null;
    let mySchoolId: string | null = null;
    let myDisplayName = "Coach";
    try {
      const userSnap = await getDoc(doc(db, "users", authUid));
      if (!userSnap.exists()) {
        throw new Error("Your user profile was not found. Please contact support.");
      }
      const userData = userSnap.data();
      myRole = userData?.role ?? null;
      mySchoolId = userData?.schoolId ?? null;
      myDisplayName =
        userData?.displayName ||
        userData?.name ||
        currentUser.displayName ||
        currentUser.email ||
        "Coach";
    } catch (e: any) {
      if (e?.message?.includes("user profile")) throw e;
      throw new Error("Failed to load your profile. Please try again.");
    }

    if (!myRole || !["manager", "coach"].includes(myRole)) {
      throw new Error(
        "You need to be a coach or manager in this school to add feedback."
      );
    }

    if (!mySchoolId) {
      throw new Error(
        "You need to be a coach or manager in this school to add feedback."
      );
    }

    if (!selectedStudent) {
      throw new Error("Please select a student first.");
    }

    const studentUid = selectedStudent.id;

    // FIX: write to student_notes so students can read it
    await addDoc(collection(db, "student_notes"), {
      schoolId: mySchoolId,
      studentUid: studentUid,   // rules check studentUid
      studentId: studentUid,    // keep both for compatibility
      createdBy: authUid,
      authorId: authUid,
      authorUid: authUid,
      authorName: myDisplayName,
      createdByName: myDisplayName,
      authorRole: myRole,
      type: data.type,          // "feedback" or "note"
      rating: data.rating ?? null,
      tags: data.tags || [],
      text: data.text.trim(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    fetchEntries();
  };

  // Delete entry
  const handleDeleteEntry = async (entryId: string) => {
    Alert.alert(
      tr.progressScreen.deleteEntry,
      tr.progressScreen.deleteEntryConfirm,
      [
        { text: tr.common.cancel, style: "cancel" },
        {
          text: tr.lessons.delete,
          style: "destructive",
          onPress: async () => {
            try {
              // FIX: delete from student_notes
              await deleteDoc(doc(db, "student_notes", entryId));
              fetchEntries();
            } catch (e: any) {
              Alert.alert("Error", e?.message || "Failed to delete");
            }
          },
        },
      ]
    );
  };

  const canEditEntry = (entry: ProgressEntry) => {
    if (!uid) return false;
    if (role === "manager") return true;
    if (role === "coach" && entry.createdBy === uid) return true;
    return false;
  };

  // Loading state
  if (roleLoading || !uid || !tenantHydrated) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#0B1220" }} edges={["top"]}>
        <View
          style={{
            flex: 1,
            backgroundColor: "#0B1220",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ActivityIndicator color="#FBBF24" size="large" />
          <Text style={{ color: "rgba(255,255,255,0.5)", marginTop: 16 }}>
            {tr.common.loading}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // No school
  if (!schoolId) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#0B1220" }} edges={["top"]}>
        <View
          style={{
            flex: 1,
            backgroundColor: "#0B1220",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <View
            style={{
              backgroundColor: "#111827",
              borderRadius: 20,
              padding: 28,
              alignItems: "center",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.06)",
              width: "100%",
            }}
          >
            <Wind size={48} color="rgba(255,255,255,0.2)" />
            <Text
              style={{
                color: "#FFFFFF",
                fontSize: 20,
                fontWeight: "700",
                marginTop: 16,
                textAlign: "center",
              }}
            >
              {tr.progressScreen.noSchool}
            </Text>
            <Text
              style={{
                color: "rgba(255,255,255,0.5)",
                textAlign: "center",
                marginTop: 8,
                marginBottom: 24,
                lineHeight: 20,
              }}
            >
              {tr.progressScreen.joinSchool}
            </Text>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.push("/join");
              }}
              style={({ pressed }) => ({
                backgroundColor: "#FBBF24",
                borderRadius: 16,
                paddingVertical: 16,
                paddingHorizontal: 32,
                alignItems: "center",
                opacity: pressed ? 0.85 : 1,
                width: "100%",
              })}
            >
              <Text style={{ color: "#0B1220", fontWeight: "700", fontSize: 16 }}>
                {tr.progressScreen.joinSchoolBtn}
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0B1220" }} edges={["top"]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: "#0B1220" }}>
        {/* Header */}
        <LinearGradient
          colors={["#111827", "#1F2937"]}
          style={{
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: 20,
          }}
        >
          <View className="flex-row items-center mb-2">
            <Wind size={28} color="white" />
            <Text className="text-white text-2xl font-bold ml-2">
              {isStudent
                ? tr.progressScreen.myProgress
                : tr.progressScreen.studentProgress}
            </Text>
          </View>
          <Text className="text-white/80">
            {isStudent
              ? tr.progressScreen.viewFeedback
              : tr.progressScreen.trackStudents}
          </Text>
        </LinearGradient>

        <ScrollView
          className="flex-1 px-4 pt-4"
          style={{ backgroundColor: "#0B1220" }}
          showsVerticalScrollIndicator={false}
        >
          {/* Coach/Manager: Student Selector */}
          {isCoachOrManager && (
            <StudentSelector
              students={students}
              selectedStudent={selectedStudent}
              onSelect={setSelectedStudent}
              loading={studentsLoading}
              tr={tr}
            />
          )}

          {/* Coach/Manager: Action Buttons */}
          {isCoachOrManager && selectedStudent && (
            <View className="flex-row gap-3 mb-4">
              <Pressable
                onPress={() => {
                  setAddType("feedback");
                  setShowAddModal(true);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                }}
                style={{
                  flex: 1,
                  backgroundColor: "#FBBF24",
                  borderRadius: 16,
                  padding: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Plus size={20} color="#0B1220" />
                <Text
                  style={{ color: "#0B1220", fontWeight: "700", marginLeft: 8 }}
                >
                  {tr.progressScreen.addFeedback}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setAddType("note");
                  setShowAddModal(true);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                }}
                style={{
                  flex: 1,
                  backgroundColor: "#FBBF24",
                  borderRadius: 16,
                  padding: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Plus size={20} color="#0B1220" />
                <Text
                  style={{ color: "#0B1220", fontWeight: "700", marginLeft: 8 }}
                >
                  {tr.progressScreen.addNote}
                </Text>
              </Pressable>
            </View>
          )}

          {/* Belt & Stripes Tool — staff only */}
          {isCoachOrManager && selectedStudent && schoolId && (
            <BeltProgressCard
              studentId={selectedStudent.id}
              studentName={selectedStudent.name}
              currentUserSchoolId={schoolId}
              isManager={role === "manager"}
            />
          )}

          {/* Content */}
          {loading ? (
            <View className="items-center justify-center py-16">
              <ActivityIndicator color="#FBBF24" size="large" />
            </View>
          ) : isCoachOrManager && !selectedStudent ? (
            <Animated.View
              entering={FadeInDown.springify()}
              className="items-center justify-center py-16"
            >
              <View
                style={{
                  backgroundColor: "rgba(6,182,212,0.15)",
                  borderRadius: 999,
                  padding: 24,
                  marginBottom: 16,
                }}
              >
                <User size={48} color="#06B6D4" />
              </View>
              <Text
                style={{
                  color: "#FFFFFF",
                  fontSize: 20,
                  fontWeight: "700",
                  marginBottom: 8,
                  textAlign: "center",
                }}
              >
                {tr.progressScreen.selectStudentTitle}
              </Text>
              <Text
                style={{
                  color: "rgba(255,255,255,0.5)",
                  textAlign: "center",
                  paddingHorizontal: 32,
                }}
              >
                {tr.progressScreen.selectStudentBody}
              </Text>
            </Animated.View>
          ) : isStudent && studentNotes.length === 0 ? (
            <Animated.View
              entering={FadeInDown.springify()}
              className="items-center justify-center py-16"
            >
              <View
                style={{
                  backgroundColor: "rgba(6,182,212,0.15)",
                  borderRadius: 999,
                  padding: 24,
                  marginBottom: 16,
                }}
              >
                <Target size={48} color="#06B6D4" />
              </View>
              <Text
                style={{
                  color: "#FFFFFF",
                  fontSize: 20,
                  fontWeight: "700",
                  marginBottom: 8,
                  textAlign: "center",
                }}
              >
                {tr.progressScreen.studentNoNotes}
              </Text>
              <Text
                style={{
                  color: "rgba(255,255,255,0.5)",
                  textAlign: "center",
                  paddingHorizontal: 32,
                }}
              >
                {tr.progressScreen.studentNoNotesSubtitle}
              </Text>
            </Animated.View>
          ) : isCoachOrManager && entries.length === 0 ? (
            <Animated.View
              entering={FadeInDown.springify()}
              className="items-center justify-center py-16"
            >
              <View
                style={{
                  backgroundColor: "rgba(6,182,212,0.15)",
                  borderRadius: 999,
                  padding: 24,
                  marginBottom: 16,
                }}
              >
                <Target size={48} color="#06B6D4" />
              </View>
              <Text
                style={{
                  color: "#FFFFFF",
                  fontSize: 20,
                  fontWeight: "700",
                  marginBottom: 8,
                  textAlign: "center",
                }}
              >
                {tr.progressScreen.noEntries}
              </Text>
              <Text
                style={{
                  color: "rgba(255,255,255,0.5)",
                  textAlign: "center",
                  paddingHorizontal: 32,
                }}
              >
                {tr.progressScreen.coachNoEntries}
              </Text>
            </Animated.View>
          ) : isStudent ? (
            <>
              <Text
                style={{
                  color: "#FFFFFF",
                  fontSize: 18,
                  fontWeight: "700",
                  marginBottom: 12,
                }}
              >
                {tr.progressScreen.yourProgress}
              </Text>
              {studentNotes.map((note, index) => (
                <StudentNoteCard
                  key={note.id}
                  note={note}
                  index={index}
                  tr={tr}
                />
              ))}
            </>
          ) : (
            <>
              <Text
                style={{
                  color: "#FFFFFF",
                  fontSize: 18,
                  fontWeight: "700",
                  marginBottom: 12,
                }}
              >
                {tr.progressScreen.progressFor.replace(
                  "{name}",
                  selectedStudent?.name ?? ""
                )}
              </Text>
              {entries.map((entry, index) => (
                <ProgressEntryCard
                  key={entry.id}
                  entry={entry}
                  index={index}
                  canEdit={canEditEntry(entry)}
                  onEdit={() => {
                    Alert.alert("Edit", "Edit functionality coming soon");
                  }}
                  onDelete={() => handleDeleteEntry(entry.id)}
                  tr={tr}
                />
              ))}
            </>
          )}

          <View className="h-8" />
        </ScrollView>
      </View>

      {/* Add Entry Modal */}
      {isCoachOrManager && selectedStudent && (
        <AddEntryModal
          visible={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSave={handleAddEntry}
          type={addType}
          studentName={selectedStudent.name}
          tr={tr}
        />
      )}
    </SafeAreaView>
  );
}
