/**
 * AdminDashboardPanel
 *
 * Operational overview for managers on the home screen.
 * Loads data once on mount + on screen focus via a single Promise.all.
 * Uses getDocs (one-time reads) — no live listeners — to keep Firestore cost low.
 *
 * Layout:
 *   1. Alert strip   — only visible when action is required
 *   2. KPI grid      — 2×2 cards: students, classes today, pending invoices, pending payouts
 *   3. Competitions  — upcoming events, max 2
 *   4. Tool shortcuts — existing quick-nav tiles (unchanged)
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import Animated, {
  FadeInDown,
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import {
  collection,
  query,
  where,
  onSnapshot,
  Timestamp,
  orderBy,
  type QuerySnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase-config";
import {
  Users,
  DollarSign,
  AlertTriangle,
  ChevronRight,
  LayoutDashboard,
  Trophy,
  RefreshCcw,
  CalendarDays,
} from "lucide-react-native";
import { useTranslations } from "@/lib/i18n";
import { useTenantStore, selectHasFinanceAccess } from "@/lib/state/tenant-store";

// ── Design tokens (matches index.tsx dark theme) ──────────────────────────────
const C = {
  bg: "#111827",
  bgDeep: "#0B1220",
  glass: "rgba(255,255,255,0.05)",
  glassBorder: "rgba(255,255,255,0.07)",
  glassHighlight: "rgba(255,255,255,0.09)",
  text: "#FFFFFF",
  textSub: "rgba(255,255,255,0.68)",
  textMuted: "rgba(255,255,255,0.42)",
  gold: "#FBBF24",
  goldMuted: "rgba(251,191,36,0.14)",
  blue: "#60A5FA",
  blueMuted: "rgba(96,165,250,0.14)",
  green: "#10B981",
  greenMuted: "rgba(16,185,129,0.14)",
  amber: "#F59E0B",
  amberMuted: "rgba(245,158,11,0.14)",
  red: "#EF4444",
  redMuted: "rgba(239,68,68,0.14)",
  purple: "#A78BFA",
  purpleMuted: "rgba(167,139,250,0.14)",
};


// ── Data model ────────────────────────────────────────────────────────────────
interface DashboardData {
  studentCount: number;
  coachCount: number;
  classesToday: number;
  classesThisWeek: number;
  proofPendingCount: number;   // proof_uploaded — needs confirmation
  overdueCount: number;        // pending AND dueAt < now
  pendingPayouts: number;
  pendingBookings: number;     // bookings with status="pending" — Manage tool data
  upcomingCompetitions: { id: string; title: string; eventDate: Date; daysUntil: number }[];
}

// ── Snapshot storage type ──────────────────────────────────────────────────
type SnapRecord = {
  students: QuerySnapshot | null;
  coaches: QuerySnapshot | null;
  lessons: QuerySnapshot | null;
  invoices: QuerySnapshot | null;
  payouts: QuerySnapshot | null;
  competitions: QuerySnapshot | null;
  bookings: QuerySnapshot | null;
};
const SNAP_KEYS: (keyof SnapRecord)[] = [
  "students", "coaches", "lessons", "invoices", "payouts", "competitions", "bookings",
];

// ── Sub-components ────────────────────────────────────────────────────────────

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Compact KPI number card */
function KpiCard({
  label,
  value,
  sub,
  icon,
  accentColor,
  accentBg,
  onPress,
  loading,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  accentColor: string;
  accentBg: string;
  onPress?: () => void;
  loading?: boolean;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      onPressIn={() => { if (onPress) scale.value = withSpring(0.97, { damping: 18, stiffness: 300 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 18, stiffness: 300 }); }}
      onPress={onPress}
      style={[animStyle, {
        flex: 1,
        backgroundColor: C.glass,
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: C.glassBorder,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }]}
    >
      {/* Icon pill */}
      <View style={{
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: accentBg,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}>
        {loading
          ? <ActivityIndicator size="small" color={accentColor} />
          : icon}
      </View>

      {/* Text block */}
      <View style={{ flex: 1 }}>
        {loading ? (
          <View style={{ width: 36, height: 24, backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 6 }} />
        ) : (
          <Text style={{
            color: C.text,
            fontSize: 24,
            fontWeight: "700",
            letterSpacing: -0.5,
            lineHeight: 28,
          }}>
            {value}
          </Text>
        )}
        <Text style={{
          color: C.textSub,
          fontSize: 11,
          fontWeight: "500",
          marginTop: 2,
        }} numberOfLines={1}>
          {label}
        </Text>
        {sub && (
          <Text style={{
            color: accentColor,
            fontSize: 10,
            fontWeight: "600",
            marginTop: 1,
            opacity: 0.85,
          }} numberOfLines={1}>
            {sub}
          </Text>
        )}
      </View>
    </AnimatedPressable>
  );
}

/** Small shortcut pill for bottom action row */
function ShortcutPill({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      onPressIn={() => { scale.value = withSpring(0.95, { damping: 20, stiffness: 340 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 20, stiffness: 340 }); }}
      onPress={onPress}
      style={[animStyle, {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        backgroundColor: C.glass,
        borderWidth: 1,
        borderColor: C.glassBorder,
        borderRadius: 12,
        paddingVertical: 11,
        paddingHorizontal: 8,
      }]}
    >
      {icon}
      <Text style={{ color: C.textSub, fontSize: 12, fontWeight: "600" }}>{label}</Text>
    </AnimatedPressable>
  );
}

/** Alert banner — rendered only when there is something to action */
function AlertBanner({
  proofPending,
  overdue,
  onPress,
}: {
  proofPending: number;
  overdue: number;
  onPress: () => void;
}) {
  if (proofPending === 0 && overdue === 0) return null;

  let label = "";
  if (proofPending > 0 && overdue > 0) {
    label = `${proofPending} proof${proofPending > 1 ? "s" : ""} to confirm · ${overdue} overdue`;
  } else if (proofPending > 0) {
    label = `${proofPending} payment proof${proofPending > 1 ? "s" : ""} waiting for confirmation`;
  } else {
    label = `${overdue} invoice${overdue > 1 ? "s" : ""} overdue`;
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: overdue > 0 ? C.redMuted : C.amberMuted,
        borderWidth: 1,
        borderColor: overdue > 0 ? "rgba(239,68,68,0.28)" : "rgba(245,158,11,0.28)",
        borderRadius: 14,
        paddingVertical: 12,
        paddingHorizontal: 14,
        marginBottom: 14,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{
        width: 30,
        height: 30,
        borderRadius: 9,
        backgroundColor: overdue > 0 ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.2)",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}>
        <AlertTriangle size={16} color={overdue > 0 ? C.red : C.amber} />
      </View>
      <Text style={{
        flex: 1,
        color: overdue > 0 ? "#FCA5A5" : "#FCD34D",
        fontSize: 13,
        fontWeight: "600",
        lineHeight: 18,
      }}>
        {label}
      </Text>
      <ChevronRight size={15} color={overdue > 0 ? "#FCA5A5" : "#FCD34D"} />
    </Pressable>
  );
}

/** Competition chip */
function CompetitionChip({
  title,
  daysUntil,
  onPress,
}: {
  title: string;
  daysUntil: number;
  onPress: () => void;
}) {
  const urgency = daysUntil <= 7 ? "high" : daysUntil <= 21 ? "mid" : "low";
  const chipColor = urgency === "high" ? C.red : urgency === "mid" ? C.amber : C.gold;
  const chipBg = urgency === "high" ? C.redMuted : urgency === "mid" ? C.amberMuted : C.goldMuted;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: C.glass,
        borderWidth: 1,
        borderColor: C.glassBorder,
        borderRadius: 13,
        paddingVertical: 11,
        paddingHorizontal: 13,
        marginBottom: 8,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <View style={{
        width: 32,
        height: 32,
        borderRadius: 9,
        backgroundColor: chipBg,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}>
        <Trophy size={15} color={chipColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.text, fontSize: 13, fontWeight: "600", lineHeight: 18 }} numberOfLines={1}>
          {title}
        </Text>
        <Text style={{ color: chipColor, fontSize: 11, fontWeight: "600", marginTop: 1 }}>
          {daysUntil === 0 ? "Today!" : daysUntil === 1 ? "Tomorrow" : `In ${daysUntil} days`}
        </Text>
      </View>
      <ChevronRight size={14} color={C.textMuted} />
    </Pressable>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
interface AdminDashboardPanelProps {
  schoolId: string;
  managerName?: string;
  /** @deprecated Use selectHasFinanceAccess from tenant-store instead */
  isNgo?: boolean;
}

export function AdminDashboardPanel({ schoolId, managerName }: AdminDashboardPanelProps) {
  const router = useRouter();
  const tr = useTranslations();
  const hasFinance = useTenantStore(selectHasFinanceAccess);

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // Incrementing this re-tears-down and re-creates all listeners (used by the refresh button)
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Snapshot storage — each live listener writes its latest result here ──────
  const snapRef = useRef<SnapRecord>({
    students: null, coaches: null, lessons: null,
    invoices: null, payouts: null, competitions: null, bookings: null,
  });
  const readyKeys = useRef(new Set<keyof SnapRecord>());

  // ── Derive all KPIs from the current snapshot set and commit to state ────────
  // No deps: reads only from stable refs and stable React setState functions.
  const recompute = useCallback(() => {
    // Wait until every listener has emitted at least one snapshot
    if (SNAP_KEYS.some(k => !readyKeys.current.has(k))) return;
    const s = snapRef.current as { [K in keyof SnapRecord]: NonNullable<SnapRecord[K]> };

    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + (weekStart.getDay() === 0 ? -6 : 1));
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);

    // Classes today vs this week
    let classesToday = 0;
    let classesThisWeek = 0;
    s.lessons.forEach((doc) => {
      const raw = doc.data().startsAt;
      const ts: Date = raw instanceof Timestamp ? raw.toDate() : new Date(raw);
      if (ts >= weekStart && ts < weekEnd) classesThisWeek++;
      if (ts >= todayStart && ts < tomorrowStart) classesToday++;
    });

    // Invoice split
    let proofPendingCount = 0;
    let overdueCount = 0;
    s.invoices.forEach((doc) => {
      const inv = doc.data();
      if (inv.status === "proof_uploaded") {
        proofPendingCount++;
      } else if (inv.status === "pending") {
        const dueAt = inv.dueAt instanceof Timestamp ? inv.dueAt.toDate() : inv.dueAt ? new Date(inv.dueAt) : null;
        if (dueAt && dueAt < now) overdueCount++;
      }
    });

    // Competitions: future only, sorted, max 3
    const comps: DashboardData["upcomingCompetitions"] = [];
    s.competitions.forEach((doc) => {
      const comp = doc.data();
      const raw = comp.eventDate;
      const eventDate: Date =
        raw instanceof Timestamp ? raw.toDate() :
        raw instanceof Date ? raw :
        typeof raw === "string" ? new Date(raw) :
        null as unknown as Date;
      if (!eventDate || isNaN(eventDate.getTime())) return;
      const daysUntil = Math.ceil((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntil >= 0) comps.push({ id: doc.id, title: comp.title ?? "Competition", eventDate, daysUntil });
    });
    comps.sort((a, b) => a.daysUntil - b.daysUntil);

    setData({
      studentCount: s.students.size,
      coachCount: s.coaches.size,
      classesToday,
      classesThisWeek,
      proofPendingCount,
      overdueCount,
      pendingPayouts: s.payouts.size,
      pendingBookings: s.bookings.size,
      upcomingCompetitions: comps.slice(0, 3),
    });
    setLoading(false);
    setLoadError(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Wire 7 live Firestore listeners ─────────────────────────────────────────
  useEffect(() => {
    if (!schoolId) return;

    setLoading(true);
    setLoadError(false);
    readyKeys.current = new Set();
    snapRef.current = { students: null, coaches: null, lessons: null, invoices: null, payouts: null, competitions: null, bookings: null };

    const unsubs: (() => void)[] = [];

    function mark(key: keyof SnapRecord, snap: QuerySnapshot) {
      snapRef.current[key] = snap;
      readyKeys.current.add(key);
      recompute();
    }
    function onErr(key: keyof SnapRecord, err: Error) {
      console.warn(`[AdminDashboard] ${key} listener error:`, err);
      setLoadError(true);
      setLoading(false);
    }

    // Week bounds for lessons query (computed once per effect run)
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + (weekStart.getDay() === 0 ? -6 : 1));
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);

    // 1. Students
    unsubs.push(onSnapshot(
      query(collection(db, "users"), where("schoolId", "==", schoolId), where("role", "==", "student")),
      snap => mark("students", snap),
      err => onErr("students", err),
    ));

    // 2. Coaches
    unsubs.push(onSnapshot(
      query(collection(db, "users"), where("schoolId", "==", schoolId), where("role", "==", "coach")),
      snap => mark("coaches", snap),
      err => onErr("coaches", err),
    ));

    // 3. Lessons this week — falls back to all-school lessons if composite index missing
    const lessonsQ = query(
      collection(db, "lessons"),
      where("schoolId", "==", schoolId),
      where("startsAt", ">=", Timestamp.fromDate(weekStart)),
      where("startsAt", "<", Timestamp.fromDate(weekEnd)),
      orderBy("startsAt", "asc"),
    );
    const lessonsFallbackQ = query(
      collection(db, "lessons"),
      where("schoolId", "==", schoolId),
    );
    unsubs.push(onSnapshot(
      lessonsQ,
      snap => mark("lessons", snap),
      () => unsubs.push(onSnapshot(lessonsFallbackQ, snap => mark("lessons", snap), err => onErr("lessons", err))),
    ));

    // 4. Invoices needing action
    unsubs.push(onSnapshot(
      query(collection(db, "schools", schoolId, "invoices"), where("status", "in", ["pending", "proof_uploaded"])),
      snap => mark("invoices", snap),
      err => onErr("invoices", err),
    ));

    // 5. Pending coach payouts
    unsubs.push(onSnapshot(
      query(collection(db, "schools", schoolId, "coach_payouts"), where("status", "==", "pending")),
      snap => mark("payouts", snap),
      err => onErr("payouts", err),
    ));

    // 6. Competitions
    unsubs.push(onSnapshot(
      query(collection(db, "competitions"), where("schoolId", "==", schoolId)),
      snap => mark("competitions", snap),
      err => onErr("competitions", err),
    ));

    // 7. Pending bookings — Manage tool data wired here
    unsubs.push(onSnapshot(
      query(collection(db, "bookings"), where("schoolId", "==", schoolId), where("status", "==", "pending")),
      snap => mark("bookings", snap),
      err => onErr("bookings", err),
    ));

    return () => { unsubs.forEach(u => u()); };
  }, [schoolId, refreshKey, recompute]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1 }}>

      {/* ── Section header ──────────────────────────────────────────────── */}
      <Animated.View
        entering={FadeInDown.delay(120).springify()}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            backgroundColor: C.blueMuted,
            alignItems: "center",
            justifyContent: "center",
          }}>
            <LayoutDashboard size={18} color={C.blue} />
          </View>
          <View>
            <Text style={{ color: C.text, fontSize: 17, fontWeight: "700", letterSpacing: -0.2 }}>
              {tr.admin.operationalPanel}
            </Text>
            <Text style={{ color: C.textMuted, fontSize: 11, fontWeight: "500", marginTop: 1 }}>
              {tr.admin.todayOverview}
            </Text>
          </View>
        </View>

        {/* Refresh button */}
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setRefreshKey(k => k + 1); }}
          style={({ pressed }) => ({
            width: 34,
            height: 34,
            borderRadius: 10,
            backgroundColor: C.glass,
            borderWidth: 1,
            borderColor: C.glassBorder,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <RefreshCcw size={15} color={C.textMuted} />
        </Pressable>
      </Animated.View>

      {/* ── Invoice urgency strip ────────────────────────────────────────── */}
      {hasFinance && !loading && data && (data.proofPendingCount > 0 || data.overdueCount > 0) && (
        <Animated.View entering={FadeInDown.delay(160).springify()}>
          <AlertBanner
            proofPending={data.proofPendingCount}
            overdue={data.overdueCount}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push("/invoices" as any);
            }}
          />
        </Animated.View>
      )}

      {/* ── Compact KPI row: Active Students + Classes Today ─────────────── */}
      <Animated.View
        entering={FadeInUp.delay(180).springify()}
        style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}
      >
        <KpiCard
          label={tr.admin.activeStudents}
          value={loading ? "—" : (data?.studentCount ?? 0)}
          sub={`${data?.coachCount ?? 0} ${(data?.coachCount ?? 0) !== 1 ? tr.admin.coachesLabel : tr.admin.coachLabel}`}
          icon={<Users size={18} color={C.blue} />}
          accentColor={C.blue}
          accentBg={C.blueMuted}
          loading={loading}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/(tabs)/admin" as any);
          }}
        />
        <KpiCard
          label={tr.admin.classesToday}
          value={loading ? "—" : (data?.classesToday ?? 0)}
          sub={`${data?.classesThisWeek ?? 0} ${tr.admin.thisWeek}`}
          icon={<CalendarDays size={18} color={C.gold} />}
          accentColor={C.gold}
          accentBg={C.goldMuted}
          loading={loading}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/(tabs)/lessons" as any);
          }}
        />
      </Animated.View>

      {/* ── Upcoming Competitions ────────────────────────────────────────── */}
      {!loading && data && data.upcomingCompetitions.length > 0 && (
        <Animated.View
          entering={FadeInUp.delay(220).springify()}
          style={{ marginBottom: 16 }}
        >
          <View style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
              <Trophy size={13} color={C.gold} />
              <Text style={{ color: C.textSub, fontSize: 12, fontWeight: "700", letterSpacing: 0.7, textTransform: "uppercase" }}>
                {tr.competitions.title}
              </Text>
            </View>
            <Pressable onPress={() => router.push("/competitions" as any)}>
              <Text style={{ color: C.blue, fontSize: 12, fontWeight: "600" }}>{tr.admin.viewAll}</Text>
            </Pressable>
          </View>
          {data.upcomingCompetitions.map((comp) => (
            <CompetitionChip
              key={comp.id}
              title={comp.title}
              daysUntil={comp.daysUntil}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/competitions" as any);
              }}
            />
          ))}
        </Animated.View>
      )}

      {/* ── Load error state ─────────────────────────────────────────────── */}
      {loadError && (
        <View style={{
          backgroundColor: C.redMuted,
          borderRadius: 13,
          padding: 14,
          marginBottom: 14,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}>
          <AlertTriangle size={16} color={C.red} />
          <Text style={{ color: "#FCA5A5", fontSize: 13, flex: 1 }}>
            {tr.admin.loadError}
          </Text>
        </View>
      )}

      {/* ── Bottom shortcut row ───────────────────────────────────────────── */}
      <Animated.View
        entering={FadeInUp.delay(260).springify()}
        style={{ flexDirection: "row", gap: 8 }}
      >
        {hasFinance && (
          <ShortcutPill
            icon={<DollarSign size={14} color={C.green} />}
            label={tr.admin.invoices}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/invoices" as any);
            }}
          />
        )}
        <ShortcutPill
          icon={<CalendarDays size={14} color={C.gold} />}
          label={tr.admin.classesToday}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/(tabs)/lessons" as any);
          }}
        />
        <ShortcutPill
          icon={<Users size={14} color={C.blue} />}
          label={tr.admin.adminDashboard}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/(tabs)/admin" as any);
          }}
        />
      </Animated.View>
    </View>
  );
}
