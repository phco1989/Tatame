import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  Plus,
  X,
  Calendar,
  Clock,
  CheckCircle,
  BookOpen,
  ClipboardList,
  RefreshCw,
  Pencil,
  Trash2,
  CalendarDays,
} from "lucide-react-native";
import { useRouter, useFocusEffect } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import DateTimePicker from "@react-native-community/datetimepicker";

import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  Timestamp,
  onSnapshot,
  updateDoc,
  increment,
} from "firebase/firestore";
import { db, waitForAuthReady } from "@/lib/firebase-config";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import { useLessonsData, type Lesson } from "@/lib/hooks/useLessonsData";
import { useTenantStore, selectIsPro } from "@/lib/state/tenant-store";
import { useTranslations } from "@/lib/i18n";
import { useLanguageStore } from "@/lib/i18n/language-store";

// ─── Types ────────────────────────────────────────────────────────────────────

type ClassLevel = "fundamentals" | "intermediate" | "advanced" | "all_levels";

interface LessonAssignment {
  id: string;
  schoolId: string;
  lessonId: string;
  studentUid: string;
  status: string;
  createdAt: Date;
  attended?: boolean;
  durationMinutes?: number;
  attendedAt?: Date;
  attendanceConfirmedBy?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LEVELS: { value: ClassLevel; label: string; color: string; bg: string }[] = [
  { value: "fundamentals", label: "Fundamentals", color: "#0891B2", bg: "#E0F2FE" },
  { value: "intermediate", label: "Intermediate", color: "#7C3AED", bg: "#EDE9FE" },
  { value: "advanced", label: "Advanced", color: "#DC2626", bg: "#FEE2E2" },
  { value: "all_levels", label: "All Levels", color: "#059669", bg: "#D1FAE5" },
];

// ─── Dark badge backgrounds per level ─────────────────────────────────────────

const LEVEL_DARK_BG: Record<ClassLevel, string> = {
  fundamentals: "rgba(6,182,212,0.15)",
  intermediate: "rgba(124,58,237,0.15)",
  advanced: "rgba(239,68,68,0.15)",
  all_levels: "rgba(16,185,129,0.15)",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDate(v: unknown): Date {
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number") return new Date(v);
  return new Date();
}

function formatDate(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(d: Date, locale: string): string {
  return d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

function levelConfig(level: ClassLevel) {
  return LEVELS.find((l) => l.value === level) ?? LEVELS[3];
}

// ─── Lesson Card ──────────────────────────────────────────────────────────────

interface LessonCardProps {
  lesson: Lesson;
  index: number;
  isStudent: boolean;
  isManager: boolean;
  myAssignments: LessonAssignment[];
  onJoin: (lesson: Lesson) => void;
  joiningId: string | null;
  onEdit: (lesson: Lesson) => void;
  onDelete: (id: string) => void;
  onConfirmAttendance: (assignmentId: string) => void;
  confirmingId: string | null;
  tr: ReturnType<typeof useTranslations>;
  locale: string;
}

function LessonCard({
  lesson,
  index,
  isStudent,
  isManager,
  myAssignments,
  onJoin,
  joiningId,
  onEdit,
  onDelete,
  onConfirmAttendance,
  confirmingId,
  tr,
  locale,
}: LessonCardProps) {
  const cfg = levelConfig(lesson.level);
  const myAssignment = myAssignments.find((a) => a.lessonId === lesson.id);
  const alreadyJoined = !!myAssignment;
  const isJoining = joiningId === lesson.id;

  // Determine if class is complete
  const now = new Date();
  const classComplete = lesson.endsAt ? now >= lesson.endsAt : false;
  const attended = myAssignment?.attended === true;
  const isConfirming = confirmingId === myAssignment?.id;

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify()}>
      <View
        style={{
          backgroundColor: "#111827",
          borderRadius: 16,
          padding: 16,
          marginBottom: 12,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.2,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        {/* Level badge + manager actions */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View
              style={{
                backgroundColor: LEVEL_DARK_BG[lesson.level],
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 20,
              }}
            >
              <Text style={{ color: cfg.color, fontWeight: "700", fontSize: 12 }}>{cfg.label}</Text>
            </View>
            {alreadyJoined && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <CheckCircle size={14} color="#059669" />
                <Text style={{ color: "#059669", fontWeight: "600", fontSize: 12 }}>{tr.lessons.joined}</Text>
              </View>
            )}
          </View>
          {isManager && (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={() => onEdit(lesson)}
                style={{ padding: 6, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.06)" }}
              >
                <Pencil size={15} color="#A78BFA" />
              </Pressable>
              <Pressable
                onPress={() => onDelete(lesson.id)}
                style={{ padding: 6, borderRadius: 8, backgroundColor: "rgba(239,68,68,0.1)" }}
              >
                <Trash2 size={15} color="#EF4444" />
              </Pressable>
            </View>
          )}
        </View>

        {/* Date & time */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6, gap: 6 }}>
          <Calendar size={15} color="rgba(255,255,255,0.5)" />
          <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 14 }}>
            {formatDate(lesson.startsAt, locale)}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Clock size={15} color="rgba(255,255,255,0.5)" />
          <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
            {formatTime(lesson.startsAt, locale)} – {formatTime(lesson.endsAt, locale)}
          </Text>
        </View>

        {/* Join button (students only) */}
        {isStudent && !alreadyJoined && (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onJoin(lesson);
            }}
            disabled={isJoining}
            style={{
              marginTop: 12,
              backgroundColor: isJoining ? "rgba(255,255,255,0.2)" : "#FBBF24",
              paddingVertical: 10,
              borderRadius: 10,
              alignItems: "center",
            }}
          >
            {isJoining ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={{ color: "#0B1220", fontWeight: "700", fontSize: 14 }}>{tr.lessons.joinClass}</Text>
            )}
          </Pressable>
        )}

        {/* Confirm Attendance (students who joined, class finished, not yet attended) */}
        {isStudent && alreadyJoined && classComplete && !attended && (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onConfirmAttendance(myAssignment!.id);
            }}
            disabled={isConfirming}
            style={{
              marginTop: 12,
              backgroundColor: isConfirming ? "rgba(255,255,255,0.2)" : "#10B981",
              paddingVertical: 10,
              borderRadius: 10,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: 6,
            }}
          >
            {isConfirming ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <>
                <CheckCircle size={16} color="#FFFFFF" />
                <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 14 }}>
                  {tr.home.confirmAttendance}
                </Text>
              </>
            )}
          </Pressable>
        )}

        {/* Attended badge (students who already confirmed) */}
        {isStudent && alreadyJoined && attended && (
          <View
            style={{
              marginTop: 12,
              backgroundColor: "rgba(16,185,129,0.12)",
              paddingVertical: 8,
              borderRadius: 10,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <CheckCircle size={14} color="#059669" />
            <Text style={{ color: "#059669", fontWeight: "600", fontSize: 13 }}>{tr.home.attended}</Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

// ─── Assignment Card ──────────────────────────────────────────────────────────

interface AssignmentCardProps {
  assignment: LessonAssignment;
  lesson?: Lesson;
  index: number;
  isManager: boolean; // in your code you pass (isManager || isCoach) here
  onStaffConfirmAttendance?: (assignmentId: string) => void; // OPTIONAL (won’t break old usage)
  confirmingId?: string | null; // OPTIONAL
}

function AssignmentCard({
  assignment,
  lesson,
  index,
  isManager,
  onStaffConfirmAttendance,
  confirmingId,
}: AssignmentCardProps) {
  const locale = useLanguageStore((s) => s.locale);
  const cfg = lesson ? levelConfig(lesson.level) : LEVELS[3];

  const now = new Date();
  const classComplete = lesson?.endsAt ? now >= lesson.endsAt : false;
  const attended = assignment.attended === true;
  const isConfirming = confirmingId === assignment.id;

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify()}>
      <View
        style={{
          backgroundColor: "#111827",
          borderRadius: 14,
          padding: 14,
          marginBottom: 10,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 6,
          elevation: 1,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <View style={{ backgroundColor: "rgba(16,185,129,0.15)", padding: 8, borderRadius: 10 }}>
          <CheckCircle size={18} color="#059669" />
        </View>

        <View style={{ flex: 1 }}>
          {lesson && (
            <Text style={{ fontWeight: "700", color: "#FFFFFF", fontSize: 14 }}>
              {formatDate(lesson.startsAt, locale)} · {formatTime(lesson.startsAt, locale)}
            </Text>
          )}

          {lesson && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
              <View
                style={{
                  backgroundColor: LEVEL_DARK_BG[lesson.level],
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: 20,
                }}
              >
                <Text style={{ color: cfg.color, fontWeight: "600", fontSize: 11 }}>{cfg.label}</Text>
              </View>

              <View
                style={{
                  backgroundColor: attended ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.06)",
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: 20,
                }}
              >
                <Text
                  style={{
                    color: attended ? "#10B981" : "rgba(255,255,255,0.5)",
                    fontWeight: "600",
                    fontSize: 11,
                  }}
                >
                  {attended ? "attended" : "not attended"}
                </Text>
              </View>
            </View>
          )}

          {isManager && (
            <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 4 }}>
              Student: {assignment.studentUid.slice(0, 8)}...
            </Text>
          )}

          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 }}>
            <View
              style={{
                backgroundColor: "rgba(16,185,129,0.15)",
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 20,
              }}
            >
              <Text style={{ color: "#059669", fontWeight: "600", fontSize: 11, textTransform: "capitalize" }}>
                {assignment.status}
              </Text>
            </View>
          </View>

          {/* Staff confirm button (coach/manager) */}
          {isManager && !!onStaffConfirmAttendance && classComplete && !attended && (
            <Pressable
              onPress={() => onStaffConfirmAttendance(assignment.id)}
              disabled={isConfirming}
              style={{
                marginTop: 10,
                backgroundColor: isConfirming ? "rgba(255,255,255,0.2)" : "#10B981",
                paddingVertical: 10,
                borderRadius: 10,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: 6,
              }}
            >
              {isConfirming ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <CheckCircle size={16} color="#FFFFFF" />
                  <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 13 }}>Confirm attended</Text>
                </>
              )}
            </Pressable>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

type TabType = "lessons" | "attendance";

export default function LessonsScreen() {
  const router = useRouter();
  const { uid, role, schoolId, loading: userLoading } = useCurrentUser();

  const isManager = role === "manager";
  const isCoach = role === "coach";
  const isStudent = role === "student";
  const isPro = useTenantStore(selectIsPro);

  const tr = useTranslations();
  const locale = useLanguageStore((s) => s.locale);

  const [activeTab, setActiveTab] = useState<TabType>("lessons");

  // ── Shared lessons hook ──
  const {
    lessons,
    loading: lessonsLoading,
    fetchLessons,
    saveLesson: saveLessonToFirestore,
    deleteLesson: deleteLessonFromFirestore,
  } = useLessonsData(schoolId);

  // ── Assignments state ──
  const [assignments, setAssignments] = useState<LessonAssignment[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);

  // ── Join state ──
  const [joiningId, setJoiningId] = useState<string | null>(null);

  // ── Confirm attendance state ──
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  // ── Create lesson modal ──
  const [showCreate, setShowCreate] = useState(false);
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [newLevel, setNewLevel] = useState<ClassLevel>("fundamentals");
  const [newStartsAt, setNewStartsAt] = useState<Date>(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d;
  });
  const [newEndsAt, setNewEndsAt] = useState<Date>(() => {
    const d = new Date();
    d.setHours(d.getHours() + 2, 0, 0, 0);
    return d;
  });
  const [showStartPicker, setShowStartPicker] = useState<"date" | "time" | null>(null);
  const [showEndPicker, setShowEndPicker] = useState<"date" | "time" | null>(null);
  const [creating, setCreating] = useState(false);

  // ── Fetch assignments ──
  const fetchAssignments = useCallback(async () => {
    if (!schoolId || !uid) return;
    setAssignmentsLoading(true);
    try {
      let q;
      if (isStudent) {
        q = query(
          collection(db, "lesson_assignments"),
          where("studentUid", "==", uid),
          where("schoolId", "==", schoolId)
        );
      } else {
        q = query(collection(db, "lesson_assignments"), where("schoolId", "==", schoolId));
      }
      const snap = await getDocs(q);
      const list: LessonAssignment[] = [];
      snap.forEach((d) => {
        const data = d.data();
        list.push({
          id: d.id,
          schoolId: data.schoolId,
          lessonId: data.lessonId,
          studentUid: data.studentUid ?? data.studentId,
          status: data.status ?? "assigned",
          createdAt: toDate(data.createdAt),
          attended: data.attended === true,
          durationMinutes: typeof data.durationMinutes === "number" ? data.durationMinutes : undefined,
          attendedAt: data.attendedAt ? toDate(data.attendedAt) : undefined,
          attendanceConfirmedBy: data.attendanceConfirmedBy,
        });
      });
      list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      setAssignments(list);
    } catch (err: any) {
      console.warn("[Lessons] assignments fetch error:", err);
      setAssignments([]);
    } finally {
      setAssignmentsLoading(false);
    }
  }, [schoolId, uid, isStudent]);

  useEffect(() => {
    if (!userLoading && schoolId) {
      const unsub = fetchLessons();
      fetchAssignments();
      return () => unsub();
    }
  }, [userLoading, schoolId, fetchLessons, fetchAssignments]);

  // Refresh assignments when screen is focused (e.g. returning from another tab)
  useFocusEffect(
    useCallback(() => {
      if (!userLoading && schoolId) {
        fetchAssignments();
      }
    }, [userLoading, schoolId, fetchAssignments])
  );

  // ── My assignments (for student join check) ──
  const myAssignments = isStudent ? assignments : [];

  // ── Join lesson ──
  const handleJoin = async (lesson: Lesson) => {
    if (!uid || !schoolId) return;
    setJoiningId(lesson.id);
    try {
      await waitForAuthReady();
      await addDoc(collection(db, "lesson_assignments"), {
        schoolId,
        lessonId: lesson.id,
        studentUid: uid,
        status: "assigned",
        createdAt: serverTimestamp(),
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      fetchAssignments();
    } catch (err: any) {
      console.error("[Lessons] join error:", err);
      Alert.alert("Error", err?.message ?? "Failed to join class.");
    } finally {
      setJoiningId(null);
    }
  };

  // ── Staff confirm attendance (coach/manager) ──
  const handleStaffConfirmAttendance = async (assignmentId: string) => {
    if (!assignmentId || !uid) return;
    setConfirmingId(assignmentId);

    try {
      await waitForAuthReady();

      const assignmentRef = doc(db, "lesson_assignments", assignmentId);
      const snap = await getDoc(assignmentRef);
      if (!snap.exists()) throw new Error("Assignment not found");

      const assignment = snap.data();

      // Avoid double counting
      if (assignment.attended === true) return;

      const studentUid = assignment.studentUid || assignment.studentId;
      if (!studentUid) throw new Error("Assignment missing student uid");

      // Compute durationMinutes from the lesson's startsAt/endsAt if not already stored
      let durationMins: number = typeof assignment.durationMinutes === "number" ? assignment.durationMinutes : 0;
      if (durationMins <= 0 && assignment.lessonId) {
        try {
          const lessonSnap = await getDoc(doc(db, "lessons", assignment.lessonId));
          if (lessonSnap.exists()) {
            const ld = lessonSnap.data();
            const start = ld.startsAt instanceof Timestamp ? ld.startsAt.toDate() : new Date(ld.startsAt);
            const end = ld.endsAt instanceof Timestamp ? ld.endsAt.toDate() : new Date(ld.endsAt);
            const computed = Math.floor((end.getTime() - start.getTime()) / 60000);
            if (computed > 0) durationMins = computed;
          }
        } catch (e) {
          console.warn("[Lessons] could not fetch lesson for duration", e);
        }
      }
      console.log("[Lessons] staff confirm attendance: durationMins =", durationMins, "for assignment", assignmentId);

      // 1) Mark assignment attended, persist computed durationMinutes
      await updateDoc(assignmentRef, {
        attended: true,
        attendedAt: serverTimestamp(),
        attendanceConfirmedBy: isManager ? "manager" : "coach",
        durationMinutes: durationMins,
        updatedAt: serverTimestamp(),
      });

      // 2) Add minutes to that student's profile
      const studentUserRef = doc(db, "users", studentUid);
      await updateDoc(studentUserRef, {
        matMinutes: increment(durationMins),
        lastMatAt: serverTimestamp(),
      });

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      fetchAssignments();
    } catch (err: any) {
      console.error("[Lessons] staff confirm attendance error:", err);
      Alert.alert("Error", err?.message ?? "Failed to confirm attendance.");
    } finally {
      setConfirmingId(null);
    }
  };

  // ── Student confirm attendance ──
  const handleConfirmAttendance = async (assignmentId: string) => {
    if (!assignmentId || !uid) return;

    setConfirmingId(assignmentId);

    try {
      await waitForAuthReady();

      const assignmentRef = doc(db, "lesson_assignments", assignmentId);
      const userRef = doc(db, "users", uid);

      const snap = await getDoc(assignmentRef);
      if (!snap.exists()) throw new Error("Assignment not found");

      const assignment = snap.data();

      if (assignment.attended === true) return;

      // Compute durationMinutes from the lesson's startsAt/endsAt if not already stored
      let durationMins: number = typeof assignment.durationMinutes === "number" ? assignment.durationMinutes : 0;
      if (durationMins <= 0 && assignment.lessonId) {
        try {
          const lessonSnap = await getDoc(doc(db, "lessons", assignment.lessonId));
          if (lessonSnap.exists()) {
            const ld = lessonSnap.data();
            const start = ld.startsAt instanceof Timestamp ? ld.startsAt.toDate() : new Date(ld.startsAt);
            const end = ld.endsAt instanceof Timestamp ? ld.endsAt.toDate() : new Date(ld.endsAt);
            const computed = Math.floor((end.getTime() - start.getTime()) / 60000);
            if (computed > 0) durationMins = computed;
          }
        } catch (e) {
          console.warn("[Lessons] could not fetch lesson for duration", e);
        }
      }
      console.log("[Lessons] student confirm attendance: durationMins =", durationMins, "for assignment", assignmentId);

      await updateDoc(assignmentRef, {
        attended: true,
        attendedAt: serverTimestamp(),
        attendanceConfirmedBy: "student",
        durationMinutes: durationMins,
        updatedAt: serverTimestamp(), // IMPORTANT for your rules changedKeys().hasOnly(...)
      });

      await updateDoc(userRef, {
        matMinutes: increment(durationMins),
        lastMatAt: serverTimestamp(),
      });

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      fetchAssignments();
    } catch (err: any) {
      console.error("[Lessons] confirm attendance error:", err);
      Alert.alert("Error", "You can only confirm your own attendance.");
    } finally {
      setConfirmingId(null);
    }
  };

  // ── Edit lesson ──
  const handleEditLesson = (lesson: Lesson) => {
    setEditingLessonId(lesson.id);
    setNewLevel(lesson.level);
    setNewStartsAt(lesson.startsAt);
    setNewEndsAt(lesson.endsAt);
    setShowCreate(true);
  };

  // ── Delete lesson ──
  const handleDeleteLesson = (lessonId: string) => {
    Alert.alert(tr.lessons.deleteClass, tr.lessons.cannotUndo, [
      { text: tr.common.cancel, style: "cancel" },
      {
        text: tr.lessons.delete,
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "lessons", lessonId));
          } catch (err: any) {
            Alert.alert("Error", err?.message ?? "Failed to delete class.");
          }
        },
      },
    ]);
  };

  // ── Save lesson (create or edit) ──
  const saveLesson = async () => {
    if (!uid || !schoolId) {
      console.warn("[Lessons] saveLesson: missing uid or schoolId", { uid, schoolId });
      return;
    }
    if (newEndsAt <= newStartsAt) {
      Alert.alert("Invalid time", "End time must be after start time.");
      return;
    }
    setCreating(true);
    const payload = {
      schoolId,
      startsAt: newStartsAt,
      endsAt: newEndsAt,
      level: newLevel,
    };
    console.log("[Lessons] saveLesson: submit start", { editingLessonId, payload, uid });
    try {
      await waitForAuthReady();
      if (editingLessonId) {
        await updateDoc(doc(db, "lessons", editingLessonId), payload);
        console.log("[Lessons] saveLesson: updated lesson", editingLessonId);
      } else {
        const docRef = await addDoc(collection(db, "lessons"), {
          ...payload,
          createdBy: uid,
          createdAt: serverTimestamp(),
        });
        console.log("[Lessons] saveLesson: created lesson", docRef.id);
      }
      setShowCreate(false);
      setEditingLessonId(null);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      console.error("[Lessons] saveLesson: write failure", err);
      Alert.alert("Error", err?.message ?? "Failed to save class.");
    } finally {
      setCreating(false);
    }
  };

  // ── Build lesson map for assignments ──
  const lessonMap = Object.fromEntries(lessons.map((l) => [l.id, l]));

  // ── Loading state ──
  if (userLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#0B1220" }} edges={["top"]}>
        <View
          style={{
            flex: 1,
            backgroundColor: "#0B1220",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <ActivityIndicator size="large" color="#FBBF24" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0B1220" }} edges={["top"]}>
      <View style={{ flex: 1, backgroundColor: "#0B1220" }}>
        {/* Header */}
        <LinearGradient
          colors={["#111827", "#1F2937"]}
          style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16 }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 14,
            }}
          >
            <Text style={{ color: "white", fontSize: 24, fontWeight: "800" }}>{tr.lessons.classes}</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={() => {
                  fetchAssignments();
                }}
                style={{ backgroundColor: "rgba(255,255,255,0.2)", padding: 10, borderRadius: 10 }}
              >
                <RefreshCw size={18} color="white" />
              </Pressable>
              {isManager && (
                <Pressable
                  onPress={() => router.push("/schedule-templates")}
                  style={{
                    backgroundColor: "rgba(167,139,250,0.15)",
                    borderWidth: 1,
                    borderColor: "rgba(167,139,250,0.3)",
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 10,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <CalendarDays size={15} color="#A78BFA" />
                  <Text style={{ color: "#A78BFA", fontWeight: "700", fontSize: 13 }}>Templates</Text>
                </Pressable>
              )}
              {isManager && (
                <Pressable
                  onPress={() => setShowCreate(true)}
                  style={{
                    backgroundColor: "#FBBF24",
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 10,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Plus size={16} color="#fff" />
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{tr.lessons.newClass}</Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* Tabs */}
          <View style={{ flexDirection: "row", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 10, padding: 3 }}>
            <Pressable
              onPress={() => {
                setActiveTab("lessons");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={{
                flex: 1,
                paddingVertical: 8,
                borderRadius: 8,
                backgroundColor: activeTab === "lessons" ? "rgba(255,255,255,0.15)" : "transparent",
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <BookOpen size={15} color={activeTab === "lessons" ? "#FBBF24" : "white"} />
              <Text style={{ color: activeTab === "lessons" ? "#FBBF24" : "white", fontWeight: "700", fontSize: 13 }}>
                {tr.lessons.classes}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setActiveTab("attendance");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={{
                flex: 1,
                paddingVertical: 8,
                borderRadius: 8,
                backgroundColor: activeTab === "attendance" ? "rgba(255,255,255,0.15)" : "transparent",
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <ClipboardList size={15} color={activeTab === "attendance" ? "#FBBF24" : "white"} />
              <Text style={{ color: activeTab === "attendance" ? "#FBBF24" : "white", fontWeight: "700", fontSize: 13 }}>
                {tr.lessons.attendance}
              </Text>
            </Pressable>
          </View>
        </LinearGradient>

        {/* ── CLASSES TAB ── */}
        {activeTab === "lessons" && (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={lessonsLoading} onRefresh={fetchLessons} tintColor="#FBBF24" />
            }
          >
            {lessonsLoading && lessons.length === 0 ? (
              <ActivityIndicator style={{ marginTop: 40 }} color="#FBBF24" />
            ) : lessons.length === 0 ? (
              <Animated.View entering={FadeInDown.springify()} style={{ alignItems: "center", marginTop: 60 }}>
                <View style={{ backgroundColor: "rgba(6,182,212,0.15)", borderRadius: 999, padding: 24, marginBottom: 16 }}>
                  <BookOpen size={48} color="#06B6D4" />
                </View>
                <Text style={{ fontSize: 18, fontWeight: "700", color: "#FFFFFF", marginBottom: 8 }}>
                  {tr.lessons.noClassesYet}
                </Text>
                <Text style={{ color: "rgba(255,255,255,0.5)", textAlign: "center", lineHeight: 20 }}>
                  {isManager ? tr.lessons.managerNoClasses : tr.lessons.studentNoClasses}
                </Text>
              </Animated.View>
            ) : (
              lessons.map((lesson, i) => (
                <LessonCard
                  key={lesson.id}
                  lesson={lesson}
                  index={i}
                  isStudent={isStudent}
                  isManager={isManager}
                  myAssignments={myAssignments}
                  onJoin={handleJoin}
                  joiningId={joiningId}
                  onEdit={handleEditLesson}
                  onDelete={handleDeleteLesson}
                  onConfirmAttendance={handleConfirmAttendance}
                  confirmingId={confirmingId}
                  tr={tr}
                  locale={locale}
                />
              ))
            )}
            <View style={{ height: 32 }} />
          </ScrollView>
        )}

        {/* ── ATTENDANCE TAB ── */}
        {activeTab === "attendance" && (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={assignmentsLoading} onRefresh={fetchAssignments} tintColor="#FBBF24" />
            }
          >
            {!isStudent && (
              <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 12, fontWeight: "500" }}>
                {assignments.length} {assignments.length !== 1 ? tr.lessons.enrollments : tr.lessons.enrollment}{" "}
                {tr.lessons.inYourSchool}
              </Text>
            )}

            {assignmentsLoading && assignments.length === 0 ? (
              <ActivityIndicator style={{ marginTop: 40 }} color="#FBBF24" />
            ) : assignments.length === 0 ? (
              <Animated.View entering={FadeInDown.springify()} style={{ alignItems: "center", marginTop: 60 }}>
                <View style={{ backgroundColor: "rgba(16,185,129,0.15)", borderRadius: 999, padding: 24, marginBottom: 16 }}>
                  <ClipboardList size={48} color="#059669" />
                </View>
                <Text style={{ fontSize: 18, fontWeight: "700", color: "#FFFFFF", marginBottom: 8 }}>
                  {tr.lessons.noAttendanceYet}
                </Text>
                <Text style={{ color: "rgba(255,255,255,0.5)", textAlign: "center", lineHeight: 20 }}>
                  {isStudent ? tr.lessons.studentNoAttendance : tr.lessons.managerNoAttendance}
                </Text>
              </Animated.View>
            ) : (
              assignments.map((a, i) => (
                <AssignmentCard
                  key={a.id}
                  assignment={a}
                  lesson={lessonMap[a.lessonId]}
                  index={i}
                  isManager={isManager || isCoach}
                  confirmingId={confirmingId}
                  onStaffConfirmAttendance={isManager || isCoach ? handleStaffConfirmAttendance : undefined}
                />
              ))
            )}

            <View style={{ height: 32 }} />
          </ScrollView>
        )}
      </View>

      {/* ── CREATE / EDIT LESSON MODAL (manager only) ── */}
      <Modal
        visible={showCreate}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setShowCreate(false);
          setEditingLessonId(null);
        }}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View
            style={{
              backgroundColor: "#111827",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderTopWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
              padding: 24,
              paddingBottom: 44,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: "800", color: "#FFFFFF" }}>
                {editingLessonId ? tr.lessons.editClass : tr.lessons.createClass}
              </Text>
              <Pressable
                onPress={() => {
                  setShowCreate(false);
                  setEditingLessonId(null);
                }}
              >
                <X size={24} color="rgba(255,255,255,0.5)" />
              </Pressable>
            </View>

            {/* Level selector */}
            <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: "600", marginBottom: 8 }}>
              {tr.lessons.level}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
              {LEVELS.map((l) => (
                <Pressable
                  key={l.value}
                  onPress={() => setNewLevel(l.value)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 20,
                    borderWidth: 2,
                    borderColor: newLevel === l.value ? l.color : "rgba(255,255,255,0.08)",
                    backgroundColor: newLevel === l.value ? LEVEL_DARK_BG[l.value] : "#1F2937",
                  }}
                >
                  <Text style={{ color: newLevel === l.value ? l.color : "rgba(255,255,255,0.5)", fontWeight: "700", fontSize: 13 }}>
                    {l.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Start datetime */}
            <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: "600", marginBottom: 8 }}>
              {tr.lessons.startsAt}
            </Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              <Pressable
                onPress={() => setShowStartPicker("date")}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                  borderRadius: 10,
                  padding: 12,
                  backgroundColor: "#1F2937",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Calendar size={16} color="#FBBF24" />
                <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 14 }}>
                  {newStartsAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setShowStartPicker("time")}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                  borderRadius: 10,
                  padding: 12,
                  backgroundColor: "#1F2937",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Clock size={16} color="#FBBF24" />
                <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 14 }}>{formatTime(newStartsAt, locale)}</Text>
              </Pressable>
            </View>

            {showStartPicker && (
              <DateTimePicker
                value={newStartsAt}
                mode={showStartPicker}
                display="spinner"
                textColor="#FFFFFF"
                onChange={(_, d) => {
                  setShowStartPicker(null);
                  if (d) setNewStartsAt(d);
                }}
              />
            )}

            {/* End datetime */}
            <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: "600", marginBottom: 8 }}>
              {tr.lessons.endsAt}
            </Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 24 }}>
              <Pressable
                onPress={() => setShowEndPicker("date")}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                  borderRadius: 10,
                  padding: 12,
                  backgroundColor: "#1F2937",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Calendar size={16} color="#FBBF24" />
                <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 14 }}>
                  {newEndsAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setShowEndPicker("time")}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                  borderRadius: 10,
                  padding: 12,
                  backgroundColor: "#1F2937",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Clock size={16} color="#FBBF24" />
                <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 14 }}>{formatTime(newEndsAt, locale)}</Text>
              </Pressable>
            </View>

            {showEndPicker && (
              <DateTimePicker
                value={newEndsAt}
                mode={showEndPicker}
                display="spinner"
                textColor="#FFFFFF"
                onChange={(_, d) => {
                  setShowEndPicker(null);
                  if (d) setNewEndsAt(d);
                }}
              />
            )}

            <Pressable
              onPress={saveLesson}
              disabled={creating}
              style={{
                backgroundColor: creating ? "rgba(255,255,255,0.15)" : "#FBBF24",
                paddingVertical: 16,
                borderRadius: 14,
                alignItems: "center",
              }}
            >
              {creating ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={{ color: "#0B1220", fontWeight: "800", fontSize: 16 }}>
                  {editingLessonId ? tr.lessons.saveChanges : tr.lessons.createClass}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
