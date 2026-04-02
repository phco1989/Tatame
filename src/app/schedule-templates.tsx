/**
 * Schedule Templates Screen
 *
 * Lets managers save a weekly recurring schedule once, then generate
 * classes for the current month or next 30 days from those templates.
 *
 * Data model (Firestore):
 *   schedule_templates/{templateId}
 *     schoolId        string
 *     level           ClassLevel
 *     weekday         0-6  (0=Sunday)
 *     startHour       number  (0-23)
 *     startMinute     number  (0-59)
 *     endHour         number
 *     endMinute       number
 *     isActive        boolean
 *     createdBy       string
 *     createdAt       Timestamp
 *     updatedAt       Timestamp
 *
 * Generated lessons get two extra fields in the "lessons" collection:
 *   templateId        string  (links back to template)
 *   isGenerated       boolean  (true = created by template generation)
 *   isException       boolean  (true = manager manually edited this occurrence)
 *
 * Generation logic:
 *   - For each active template, for each matching weekday in the range
 *   - Check if a lesson already exists for (schoolId + templateId + startsAt day)
 *   - If yes → skip (no duplicates)
 *   - If no  → create lesson
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import {
  ChevronLeft,
  Plus,
  X,
  CalendarDays,
  Clock,
  Zap,
  Trash2,
  Pencil,
  ToggleLeft,
  ToggleRight,
} from "lucide-react-native";
import DateTimePicker from "@react-native-community/datetimepicker";

import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  serverTimestamp,
  Timestamp,
  orderBy,
} from "firebase/firestore";
import { db, waitForAuthReady } from "@/lib/firebase-config";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";

// ─── Types ────────────────────────────────────────────────────────────────────

type ClassLevel = "fundamentals" | "intermediate" | "advanced" | "all_levels";

interface ScheduleTemplate {
  id: string;
  schoolId: string;
  level: ClassLevel;
  weekday: number; // 0 = Sunday
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt?: Date;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LEVELS: { value: ClassLevel; label: string; color: string; bg: string }[] = [
  { value: "fundamentals", label: "Fundamentals", color: "#0891B2", bg: "rgba(6,182,212,0.15)" },
  { value: "intermediate", label: "Intermediate", color: "#7C3AED", bg: "rgba(124,58,237,0.15)" },
  { value: "advanced", label: "Advanced", color: "#DC2626", bg: "rgba(239,68,68,0.15)" },
  { value: "all_levels", label: "All Levels", color: "#059669", bg: "rgba(16,185,129,0.15)" },
];

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDate(v: unknown): Date {
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number") return new Date(v);
  return new Date();
}

function levelConfig(level: ClassLevel) {
  return LEVELS.find((l) => l.value === level) ?? LEVELS[3];
}

function formatHM(h: number, m: number): string {
  const date = new Date();
  date.setHours(h, m, 0, 0);
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

/**
 * Build a Date for a specific weekday occurrence in the given year/month.
 * monthIndex is 0-based.
 */
function buildDate(year: number, monthIndex: number, day: number, hour: number, minute: number): Date {
  const d = new Date(year, monthIndex, day, hour, minute, 0, 0);
  return d;
}

/**
 * Get all dates within [start, end) that match the given weekday (0=Sun).
 */
function getDatesForWeekday(weekday: number, rangeStart: Date, rangeEnd: Date): Date[] {
  const dates: Date[] = [];
  const cur = new Date(rangeStart);
  // Advance to first matching weekday
  while (cur.getDay() !== weekday) {
    cur.setDate(cur.getDate() + 1);
  }
  while (cur < rangeEnd) {
    dates.push(new Date(cur));
    cur.setDate(cur.getDate() + 7);
  }
  return dates;
}

// ─── Template Card ────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  index,
  onEdit,
  onDelete,
  onToggle,
}: {
  template: ScheduleTemplate;
  index: number;
  onEdit: (t: ScheduleTemplate) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, isActive: boolean) => void;
}) {
  const cfg = levelConfig(template.level);

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify()}>
      <View
        style={{
          backgroundColor: "#111827",
          borderRadius: 16,
          padding: 16,
          marginBottom: 12,
          opacity: template.isActive ? 1 : 0.5,
          borderWidth: 1,
          borderColor: template.isActive ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
        }}
      >
        {/* Header row */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <View
            style={{
              backgroundColor: cfg.bg,
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 20,
            }}
          >
            <Text style={{ color: cfg.color, fontWeight: "700", fontSize: 12 }}>{cfg.label}</Text>
          </View>

          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <Switch
              value={template.isActive}
              onValueChange={(v) => onToggle(template.id, v)}
              trackColor={{ false: "rgba(255,255,255,0.1)", true: "rgba(251,191,36,0.4)" }}
              thumbColor={template.isActive ? "#FBBF24" : "#6B7280"}
              ios_backgroundColor="rgba(255,255,255,0.1)"
            />
            <Pressable
              onPress={() => onEdit(template)}
              style={{ padding: 6, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.06)" }}
            >
              <Pencil size={14} color="#A78BFA" />
            </Pressable>
            <Pressable
              onPress={() => onDelete(template.id)}
              style={{ padding: 6, borderRadius: 8, backgroundColor: "rgba(239,68,68,0.1)" }}
            >
              <Trash2 size={14} color="#EF4444" />
            </Pressable>
          </View>
        </View>

        {/* Weekday + time */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <CalendarDays size={14} color="rgba(255,255,255,0.4)" />
          <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 15 }}>
            {WEEKDAYS[template.weekday]}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
          <Clock size={14} color="rgba(255,255,255,0.4)" />
          <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>
            {formatHM(template.startHour, template.startMinute)} – {formatHM(template.endHour, template.endMinute)}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ScheduleTemplatesScreen() {
  const router = useRouter();
  const { uid, role, schoolId, loading: userLoading } = useCurrentUser();
  const isManager = role === "manager";

  // ── Templates state ──
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  // ── Generate state ──
  const [generating, setGenerating] = useState(false);

  // ── Create/edit modal ──
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formLevel, setFormLevel] = useState<ClassLevel>("all_levels");
  const [formWeekday, setFormWeekday] = useState(1); // Monday
  // Use Date objects for the time pickers
  const [formStartTime, setFormStartTime] = useState<Date>(() => {
    const d = new Date(); d.setHours(10, 0, 0, 0); return d;
  });
  const [formEndTime, setFormEndTime] = useState<Date>(() => {
    const d = new Date(); d.setHours(11, 0, 0, 0); return d;
  });
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  // ─── Fetch templates ───────────────────────────────────────────────────────

  const fetchTemplates = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      await waitForAuthReady();
      const q = query(
        collection(db, "schedule_templates"),
        where("schoolId", "==", schoolId),
        orderBy("weekday", "asc")
      );
      const snap = await getDocs(q);
      const list: ScheduleTemplate[] = [];
      snap.forEach((d) => {
        const data = d.data();
        list.push({
          id: d.id,
          schoolId: data.schoolId,
          level: data.level ?? "all_levels",
          weekday: data.weekday ?? 1,
          startHour: data.startHour ?? 10,
          startMinute: data.startMinute ?? 0,
          endHour: data.endHour ?? 11,
          endMinute: data.endMinute ?? 0,
          isActive: data.isActive !== false,
          createdBy: data.createdBy ?? "",
          createdAt: toDate(data.createdAt),
        });
      });
      // Sort by weekday then start time
      list.sort((a, b) => {
        if (a.weekday !== b.weekday) return a.weekday - b.weekday;
        return (a.startHour * 60 + a.startMinute) - (b.startHour * 60 + b.startMinute);
      });
      setTemplates(list);
    } catch (err: any) {
      console.warn("[ScheduleTemplates] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    if (!userLoading && schoolId) fetchTemplates();
  }, [userLoading, schoolId, fetchTemplates]);

  // ─── Open create modal ─────────────────────────────────────────────────────

  const openCreate = () => {
    setEditingId(null);
    setFormLevel("all_levels");
    setFormWeekday(1);
    const s = new Date(); s.setHours(10, 0, 0, 0);
    const e = new Date(); e.setHours(11, 0, 0, 0);
    setFormStartTime(s);
    setFormEndTime(e);
    setShowModal(true);
  };

  const openEdit = (t: ScheduleTemplate) => {
    setEditingId(t.id);
    setFormLevel(t.level);
    setFormWeekday(t.weekday);
    const s = new Date(); s.setHours(t.startHour, t.startMinute, 0, 0);
    const e = new Date(); e.setHours(t.endHour, t.endMinute, 0, 0);
    setFormStartTime(s);
    setFormEndTime(e);
    setShowModal(true);
  };

  // ─── Save template ─────────────────────────────────────────────────────────

  const saveTemplate = async () => {
    if (!uid || !schoolId) return;
    const startMins = formStartTime.getHours() * 60 + formStartTime.getMinutes();
    const endMins = formEndTime.getHours() * 60 + formEndTime.getMinutes();
    if (endMins <= startMins) {
      Alert.alert("Invalid time", "End time must be after start time.");
      return;
    }
    setSaving(true);
    try {
      await waitForAuthReady();
      const payload = {
        schoolId,
        level: formLevel,
        weekday: formWeekday,
        startHour: formStartTime.getHours(),
        startMinute: formStartTime.getMinutes(),
        endHour: formEndTime.getHours(),
        endMinute: formEndTime.getMinutes(),
        updatedAt: serverTimestamp(),
      };
      if (editingId) {
        await updateDoc(doc(db, "schedule_templates", editingId), payload);
      } else {
        await addDoc(collection(db, "schedule_templates"), {
          ...payload,
          isActive: true,
          createdBy: uid,
          createdAt: serverTimestamp(),
        });
      }
      setShowModal(false);
      setEditingId(null);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      fetchTemplates();
    } catch (err: any) {
      console.error("[ScheduleTemplates] save error:", err);
      Alert.alert("Error", err?.message ?? "Failed to save template.");
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete template ───────────────────────────────────────────────────────

  const handleDelete = (id: string) => {
    Alert.alert("Delete Template", "This will remove the recurring template. Already generated classes will not be deleted.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await waitForAuthReady();
            await deleteDoc(doc(db, "schedule_templates", id));
            fetchTemplates();
          } catch (err: any) {
            Alert.alert("Error", err?.message ?? "Failed to delete template.");
          }
        },
      },
    ]);
  };

  // ─── Toggle active ─────────────────────────────────────────────────────────

  const handleToggle = async (id: string, isActive: boolean) => {
    try {
      await waitForAuthReady();
      await updateDoc(doc(db, "schedule_templates", id), { isActive, updatedAt: serverTimestamp() });
      setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, isActive } : t)));
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Failed to update template.");
    }
  };

  // ─── Generate classes ──────────────────────────────────────────────────────

  const generateClasses = async (mode: "this_month" | "next_30") => {
    if (!uid || !schoolId) return;
    const activeTemplates = templates.filter((t) => t.isActive);
    if (activeTemplates.length === 0) {
      Alert.alert("No active templates", "Please create and activate at least one template before generating.");
      return;
    }

    setGenerating(true);
    try {
      await waitForAuthReady();

      // Determine date range
      const now = new Date();
      let rangeStart: Date;
      let rangeEnd: Date;
      if (mode === "this_month") {
        rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
        rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      } else {
        rangeStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        rangeEnd = new Date(now.getFullYear(), now.getMonth() + 2, 1);
      }

      // Build a Set of "templateId|dateString" from all existing generated lessons
      // to detect duplicates before creating new ones. Fetch once outside the loop.
      const lessonsSnap = await getDocs(
        query(collection(db, "lessons"), where("schoolId", "==", schoolId))
      );
      const existingKeys = new Set<string>();
      lessonsSnap.forEach((d) => {
        const data = d.data();
        if (!data.templateId) return;
        const startsAt = toDate(data.startsAt);
        const dateStr = startsAt.toISOString().slice(0, 10);
        existingKeys.add(`${data.templateId}|${dateStr}`);
      });

      // Normalize level: guard against legacy values like "beginner" that are not
      // in the ClassLevel union. Fall back to "all_levels" so cards always render.
      const VALID_LEVELS: ClassLevel[] = ["fundamentals", "intermediate", "advanced", "all_levels"];
      const normalizeLevel = (raw: string): ClassLevel =>
        VALID_LEVELS.includes(raw as ClassLevel) ? (raw as ClassLevel) : "all_levels";

      let created = 0;
      let skipped = 0;

      for (const tmpl of activeTemplates) {
        const dates = getDatesForWeekday(tmpl.weekday, rangeStart, rangeEnd);
        for (const date of dates) {
          const startsAt = buildDate(
            date.getFullYear(), date.getMonth(), date.getDate(),
            tmpl.startHour, tmpl.startMinute
          );
          const endsAt = buildDate(
            date.getFullYear(), date.getMonth(), date.getDate(),
            tmpl.endHour, tmpl.endMinute
          );
          const dateStr = startsAt.toISOString().slice(0, 10);
          const key = `${tmpl.id}|${dateStr}`;
          if (existingKeys.has(key)) {
            skipped++;
            continue;
          }
          await addDoc(collection(db, "lessons"), {
            schoolId,
            startsAt,
            endsAt,
            level: normalizeLevel(tmpl.level),
            templateId: tmpl.id,
            isGenerated: true,
            isException: false,
            createdBy: uid,
            createdAt: serverTimestamp(),
          });
          existingKeys.add(key); // avoid duplicates within same run
          created++;
        }
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Classes Generated",
        `Created ${created} new class${created !== 1 ? "es" : ""}. Skipped ${skipped} that already existed.`
      );
    } catch (err: any) {
      console.error("[ScheduleTemplates] generate error:", err);
      Alert.alert("Error", err?.message ?? "Failed to generate classes.");
    } finally {
      setGenerating(false);
    }
  };

  const confirmGenerate = (mode: "this_month" | "next_30") => {
    const label = mode === "this_month" ? "this month" : "next month";
    Alert.alert(
      "Generate Classes",
      `Generate classes for ${label} from your ${templates.filter((t) => t.isActive).length} active template(s)? Existing classes will not be duplicated.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Generate", onPress: () => generateClasses(mode) },
      ]
    );
  };

  // ─── Guard: manager only ───────────────────────────────────────────────────

  if (!userLoading && !isManager) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#0B1220" }} edges={["top"]}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 15 }}>Access restricted to managers.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0B1220" }} edges={["top"]}>
      <View style={{ flex: 1, backgroundColor: "#0B1220" }}>

        {/* Header */}
        <LinearGradient
          colors={["#111827", "#1F2937"]}
          style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16 }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Pressable
                onPress={() => router.back()}
                style={{ padding: 8, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.06)" }}
              >
                <ChevronLeft size={20} color="white" />
              </Pressable>
              <View>
                <Text style={{ color: "white", fontSize: 22, fontWeight: "800" }}>Schedule Templates</Text>
                <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginTop: 1 }}>
                  Recurring weekly schedule
                </Text>
              </View>
            </View>
            <Pressable
              onPress={openCreate}
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
              <Plus size={16} color="#0B1220" />
              <Text style={{ color: "#0B1220", fontWeight: "700", fontSize: 13 }}>New</Text>
            </Pressable>
          </View>
        </LinearGradient>

        {/* Generate buttons */}
        <View
          style={{
            flexDirection: "row",
            gap: 10,
            paddingHorizontal: 16,
            paddingTop: 14,
            paddingBottom: 4,
          }}
        >
          <Pressable
            onPress={() => confirmGenerate("this_month")}
            disabled={generating}
            style={{
              flex: 1,
              backgroundColor: generating ? "rgba(251,191,36,0.2)" : "rgba(251,191,36,0.15)",
              borderWidth: 1,
              borderColor: "rgba(251,191,36,0.3)",
              borderRadius: 12,
              paddingVertical: 12,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: 6,
            }}
          >
            {generating ? (
              <ActivityIndicator size="small" color="#FBBF24" />
            ) : (
              <>
                <Zap size={15} color="#FBBF24" />
                <Text style={{ color: "#FBBF24", fontWeight: "700", fontSize: 13 }}>This Month</Text>
              </>
            )}
          </Pressable>
          <Pressable
            onPress={() => confirmGenerate("next_30")}
            disabled={generating}
            style={{
              flex: 1,
              backgroundColor: generating ? "rgba(167,139,250,0.1)" : "rgba(167,139,250,0.08)",
              borderWidth: 1,
              borderColor: "rgba(167,139,250,0.25)",
              borderRadius: 12,
              paddingVertical: 12,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: 6,
            }}
          >
            {generating ? (
              <ActivityIndicator size="small" color="#A78BFA" />
            ) : (
              <>
                <CalendarDays size={15} color="#A78BFA" />
                <Text style={{ color: "#A78BFA", fontWeight: "700", fontSize: 13 }}>Next Month</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Info hint */}
        <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
          <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, lineHeight: 18 }}>
            Generated classes appear in the Classes tab. Edit individual classes there without affecting this template.
          </Text>
        </View>

        {/* Templates list */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingTop: 4 }}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color="#FBBF24" />
          ) : templates.length === 0 ? (
            <Animated.View entering={FadeInDown.springify()} style={{ alignItems: "center", marginTop: 60 }}>
              <View
                style={{ backgroundColor: "rgba(251,191,36,0.1)", borderRadius: 999, padding: 24, marginBottom: 16 }}
              >
                <CalendarDays size={48} color="#FBBF24" />
              </View>
              <Text style={{ fontSize: 18, fontWeight: "700", color: "#FFFFFF", marginBottom: 8 }}>
                No templates yet
              </Text>
              <Text style={{ color: "rgba(255,255,255,0.4)", textAlign: "center", lineHeight: 20, maxWidth: 280 }}>
                Add your weekly recurring classes once, then generate a full month of classes instantly.
              </Text>
            </Animated.View>
          ) : (
            templates.map((t, i) => (
              <TemplateCard
                key={t.id}
                template={t}
                index={i}
                onEdit={openEdit}
                onDelete={handleDelete}
                onToggle={handleToggle}
              />
            ))
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>

      {/* ── Create / Edit Modal ── */}
      <Modal
        visible={showModal}
        animationType="slide"
        transparent
        onRequestClose={() => { setShowModal(false); setEditingId(null); }}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
          <View
            style={{
              backgroundColor: "#111827",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderTopWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
              padding: 24,
              paddingBottom: 48,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: "800", color: "#FFFFFF" }}>
                {editingId ? "Edit Template" : "New Template"}
              </Text>
              <Pressable onPress={() => { setShowModal(false); setEditingId(null); }}>
                <X size={24} color="rgba(255,255,255,0.5)" />
              </Pressable>
            </View>

            {/* Level */}
            <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: "600", marginBottom: 8 }}>
              Level
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
              {LEVELS.map((l) => (
                <Pressable
                  key={l.value}
                  onPress={() => setFormLevel(l.value)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 20,
                    borderWidth: 2,
                    borderColor: formLevel === l.value ? l.color : "rgba(255,255,255,0.08)",
                    backgroundColor: formLevel === l.value ? l.bg : "#1F2937",
                  }}
                >
                  <Text style={{ color: formLevel === l.value ? l.color : "rgba(255,255,255,0.5)", fontWeight: "700", fontSize: 13 }}>
                    {l.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Weekday */}
            <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: "600", marginBottom: 8 }}>
              Day of Week
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {WEEKDAY_SHORT.map((day, idx) => (
                  <Pressable
                    key={idx}
                    onPress={() => setFormWeekday(idx)}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 2,
                      borderColor: formWeekday === idx ? "#FBBF24" : "rgba(255,255,255,0.08)",
                      backgroundColor: formWeekday === idx ? "rgba(251,191,36,0.15)" : "#1F2937",
                    }}
                  >
                    <Text
                      style={{
                        color: formWeekday === idx ? "#FBBF24" : "rgba(255,255,255,0.5)",
                        fontWeight: "700",
                        fontSize: 12,
                      }}
                    >
                      {day}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {/* Start time */}
            <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: "600", marginBottom: 8 }}>
              Start Time
            </Text>
            <Pressable
              onPress={() => setShowStartTimePicker(true)}
              style={{
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
                borderRadius: 10,
                padding: 12,
                backgroundColor: "#1F2937",
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginBottom: 16,
              }}
            >
              <Clock size={16} color="#FBBF24" />
              <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 14 }}>
                {formatHM(formStartTime.getHours(), formStartTime.getMinutes())}
              </Text>
            </Pressable>
            {showStartTimePicker && (
              <DateTimePicker
                value={formStartTime}
                mode="time"
                display="spinner"
                textColor="#FFFFFF"
                onChange={(_, d) => {
                  setShowStartTimePicker(false);
                  if (d) setFormStartTime(d);
                }}
              />
            )}

            {/* End time */}
            <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: "600", marginBottom: 8 }}>
              End Time
            </Text>
            <Pressable
              onPress={() => setShowEndTimePicker(true)}
              style={{
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
                borderRadius: 10,
                padding: 12,
                backgroundColor: "#1F2937",
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginBottom: 24,
              }}
            >
              <Clock size={16} color="#FBBF24" />
              <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 14 }}>
                {formatHM(formEndTime.getHours(), formEndTime.getMinutes())}
              </Text>
            </Pressable>
            {showEndTimePicker && (
              <DateTimePicker
                value={formEndTime}
                mode="time"
                display="spinner"
                textColor="#FFFFFF"
                onChange={(_, d) => {
                  setShowEndTimePicker(false);
                  if (d) setFormEndTime(d);
                }}
              />
            )}

            {/* Save button */}
            <Pressable
              onPress={saveTemplate}
              disabled={saving}
              style={{
                backgroundColor: saving ? "rgba(255,255,255,0.15)" : "#FBBF24",
                paddingVertical: 16,
                borderRadius: 14,
                alignItems: "center",
              }}
            >
              {saving ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={{ color: "#0B1220", fontWeight: "800", fontSize: 16 }}>
                  {editingId ? "Save Changes" : "Add Template"}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
