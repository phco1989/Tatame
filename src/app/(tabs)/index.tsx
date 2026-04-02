import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Linking,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, Redirect } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import {
  BookOpen,
  BarChart3,
  MessageCircle,
  ChevronRight,
  Sparkles,
  Award,
  Clock,
  Target,
  Calendar,
  CheckCircle,
} from "lucide-react-native";
import Animated, {
  FadeInDown,
  FadeInUp,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { waitForAuthReady, ensureSignedIn, db, auth } from "@/lib/firebase-config";
import { doc, getDoc, onSnapshot, collection, query, where, orderBy, getDocs, Timestamp, updateDoc, serverTimestamp, limit as firestoreLimit } from "firebase/firestore";
import { AnnouncementsHomeSection } from "@/components/AnnouncementsHomeSection";
import { MuralHomeSection } from "@/components/MuralHomeSection";
import { CompetitionMuralHomeSection } from "@/components/CompetitionMuralHomeSection";
import { BeltBadge } from "@/components/BeltBadge";
import { AdminDashboardPanel } from "@/components/AdminDashboardPanel";
import { useTranslations } from "@/lib/i18n";
import { useTenantStore, selectIsNgo } from "@/lib/state/tenant-store";
import { useLanguageStore } from "@/lib/i18n/language-store";
import { beltColor, getBeltDisplay } from "@/lib/belt";
import type { UserRole } from "@/lib/hooks/useCurrentUser";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_GAP = 12;
const HORIZONTAL_PADDING = 20;
const GRID_ITEM_WIDTH = (SCREEN_WIDTH - HORIZONTAL_PADDING * 2 - CARD_GAP) / 2;

// Tatame Design System — Dark Theme
const COLORS = {
  // Background
  backgroundStart: "#0B1220",
  backgroundEnd: "#111827",

  // Glass surfaces
  glassBackground: "rgba(255, 255, 255, 0.05)",
  glassBorder: "rgba(255, 255, 255, 0.06)",
  glassHighlight: "rgba(255, 255, 255, 0.08)",

  // Text
  text: "#FFFFFF",
  textSecondary: "rgba(255, 255, 255, 0.7)",
  textMuted: "rgba(255, 255, 255, 0.5)",

  // Gold accent (Primary)
  accent: "#FBBF24",
  accentLight: "#FBBF24",
  accentMuted: "rgba(251, 191, 36, 0.15)",
  accentGlow: "rgba(251, 191, 36, 0.25)",

  // Belt colors
  beltWhite: "#FFFFFF",
  beltBlue: "#1E40AF",
  beltPurple: "#7C3AED",
  beltBrown: "#8B4513",
  beltBlack: "#1A1A1A",

  // Status colors
  success: "#10B981",
  warning: "#FBBF24",

  // Shadows
  shadowColor: "#000",
};

interface UserData {
  name?: string;
  phone?: string;
  beltRank?: string;
  schoolId?: string;
  role?: UserRole;
  photoURL?: string;
}

export default function HomeScreen() {
  const router = useRouter();
  const tr = useTranslations();
  useLanguageStore((s) => s.locale);
  const isNgo = useTenantStore(selectIsNgo);
  const isFocused = useIsFocused();

  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [userDocExists, setUserDocExists] = useState(true);
  const [currentUid, setCurrentUid] = useState<string | null>(null);
  const [nextLesson, setNextLesson] = useState<{ id: string; startsAt: Date; endsAt: Date; level: string } | null>(null);
  const [monthlyStats, setMonthlyStats] = useState({ classes: 0, matMinutes: 0 });
  const [nextLessonAssignment, setNextLessonAssignment] = useState<{ id: string; attended: boolean } | null>(null);
  const [confirmingAttendance, setConfirmingAttendance] = useState(false);
  const [focusCount, setFocusCount] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);

  // Bump focusCount on screen focus to trigger data refresh
  useFocusEffect(
    useCallback(() => {
      setFocusCount((c) => c + 1);
    }, [])
  );

  // Load user data from Firestore
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const loadUserData = async () => {
      try {
        await waitForAuthReady();
        await ensureSignedIn();
        const uid = auth.currentUser?.uid;

        if (!uid) {
          setLoading(false);
          setUserDocExists(false);
          return;
        }

        setCurrentUid(uid);

        // Fetch profile photo once (stored in user_avatars, not the users doc)
        getDoc(doc(db, "user_avatars", uid))
          .then((snap) => {
            if (snap.exists()) setAvatarUrl(snap.data().avatar_url as string);
          })
          .catch(() => { /* silently ignore — avatar is cosmetic */ });

        const userRef = doc(db, "users", uid);
        unsubscribe = onSnapshot(
          userRef,
          (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.data() as UserData;
              setUserData(data);
              setUserDocExists(true);
            } else {
              setUserData(null);
              setUserDocExists(false);
            }
            setLoading(false);
          },
          (error) => {
            console.log("[Home] Error loading user:", error);
            setLoading(false);
            setUserDocExists(false);
          }
        );
      } catch (error) {
        console.log("[Home] Error setting up listener:", error);
        setLoading(false);
        setUserDocExists(false);
      }
    };

    loadUserData();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  // Fetch next upcoming lesson for this school
  useEffect(() => {
    if (!userData?.schoolId) return;
    const schoolId = userData.schoolId;
    const now = new Date();

    getDocs(
      query(
        collection(db, "lessons"),
        where("schoolId", "==", schoolId),
        orderBy("startsAt", "asc")
      )
    )
      .then((snap) => {
        const all = snap.docs.map((d) => {
          const data = d.data();
          const rawStart = data.startsAt;
          const startsAt = rawStart instanceof Timestamp ? rawStart.toDate() : rawStart instanceof Date ? rawStart : new Date(rawStart);
          const rawEnd = data.endsAt;
          const endsAt = rawEnd instanceof Timestamp ? rawEnd.toDate() : rawEnd instanceof Date ? rawEnd : rawStart ? new Date(startsAt.getTime() + 60 * 60 * 1000) : new Date();
          return { id: d.id, startsAt, endsAt, level: (data.level ?? "all_levels") as string };
        });
        const upcoming = all.find((l) => l.startsAt > now);
        setNextLesson(upcoming ?? null);
      })
      .catch(() => {
        // index not ready or permission issue — leave null
      });
  }, [userData?.schoolId, focusCount]);

  // Fetch monthly training stats from attended lesson_assignments
  useEffect(() => {
    // Wait for both uid and user doc to be loaded with a valid schoolId
    if (!currentUid || !userData?.schoolId) {
      setMonthlyStats({ classes: 0, matMinutes: 0 });
      return;
    }

    const now = new Date();
    // monthStart in local time (midnight on the 1st of the current month)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    console.log("[MatTime] timezone:", tz, "monthStart:", monthStart.toISOString());

    (async () => {
      try {
      await waitForAuthReady();
const assignSnap = await getDocs(
  query(
    collection(db, "lesson_assignments"),
    where("studentUid", "==", currentUid),
    where("schoolId", "==", userData.schoolId)
  )
);

        let classCount = 0;
        let totalMinutes = 0;
        let skipped = 0;

        // Collect assignments that need lesson lookup for duration
        const needsLessonLookup: { docId: string; lessonId: string }[] = [];
        const counted: { docId: string; mins: number }[] = [];


assignSnap.forEach((d) => {
  const data = d.data();

  // Must be attended
  if (data.attended !== true) { skipped++; return; }

  const raw = data.attendedAt;
  if (!raw) { skipped++; return; }

  const attendedAt =
    raw instanceof Timestamp ? raw.toDate() :
    raw instanceof Date ? raw :
    new Date(raw);

  if (isNaN(attendedAt.getTime()) || attendedAt < monthStart) { skipped++; return; }

  const mins = typeof data.durationMinutes === "number" && data.durationMinutes > 0
    ? data.durationMinutes
    : -1; // sentinel: needs lesson lookup

  if (mins > 0) {
    counted.push({ docId: d.id, mins });
  } else if (data.lessonId) {
    needsLessonLookup.push({ docId: d.id, lessonId: data.lessonId });
  } else {
    skipped++;
    console.log("[MatTime] skipped (no durationMinutes, no lessonId):", d.id);
  }
});

        // For assignments missing durationMinutes, fetch lessons and compute
        for (const item of needsLessonLookup) {
          try {
            const lessonSnap = await getDoc(doc(db, "lessons", item.lessonId));
            if (lessonSnap.exists()) {
              const ld = lessonSnap.data();
              const start = ld.startsAt instanceof Timestamp ? ld.startsAt.toDate() : new Date(ld.startsAt);
              const end = ld.endsAt instanceof Timestamp ? ld.endsAt.toDate() : new Date(ld.endsAt);
              const computed = Math.floor((end.getTime() - start.getTime()) / 60000);
              if (computed > 0) {
                counted.push({ docId: item.docId, mins: computed });
              } else {
                skipped++;
                console.log("[MatTime] skipped (computed duration <= 0):", item.docId, "start:", start, "end:", end);
              }
            } else {
              skipped++;
              console.log("[MatTime] skipped (lesson not found):", item.lessonId);
            }
          } catch (e) {
            skipped++;
            console.warn("[MatTime] error fetching lesson:", item.lessonId, e);
          }
        }

        // Deduplicate by docId (prevent double counting)
        const seen = new Set<string>();
        for (const { docId, mins } of counted) {
          if (seen.has(docId)) continue;
          seen.add(docId);
          classCount++;
          totalMinutes += mins;
        }

        console.log("[MatTime] records counted:", classCount, "| minutes summed:", totalMinutes, "| records skipped:", skipped);
        setMonthlyStats({ classes: classCount, matMinutes: totalMinutes });
      } catch (err: any) {
        console.log("[Home] Error fetching monthly stats:", err);
        setMonthlyStats({ classes: 0, matMinutes: 0 });
      }
    })();
  }, [currentUid, userData?.schoolId, focusCount]);

  // Fetch assignment for the next lesson (to check if student joined & attended)
  useEffect(() => {
    if (!currentUid || !nextLesson) {
      setNextLessonAssignment(null);
      return;
    }

    (async () => {
      try {
        // Primary query: studentUid
let snap = await getDocs(
  query(
    collection(db, "lesson_assignments"),
    where("lessonId", "==", nextLesson.id),
    where("studentUid", "==", currentUid),
    where("schoolId", "==", userData?.schoolId ?? ""),
    firestoreLimit(1)
  )
);
        // Fallback: studentId
        if (snap.empty) {
          snap = await getDocs(
            query(
              collection(db, "lesson_assignments"),
              where("lessonId", "==", nextLesson.id),
              where("studentId", "==", currentUid),
              firestoreLimit(1)
            )
          );
        }
        if (!snap.empty) {
          const d = snap.docs[0];
          setNextLessonAssignment({ id: d.id, attended: d.data().attended === true });
        } else {
          setNextLessonAssignment(null);
        }
      } catch {
        setNextLessonAssignment(null);
      }
    })();
  }, [currentUid, nextLesson?.id]);

  // Confirm attendance for next lesson
  const handleConfirmNextLessonAttendance = async () => {
    if (!nextLessonAssignment) return;
    setConfirmingAttendance(true);
    try {
      await waitForAuthReady();
      await updateDoc(doc(db, "lesson_assignments", nextLessonAssignment.id), {
        attended: true,
        attendedAt: serverTimestamp(),
        attendanceConfirmedBy: "student",
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNextLessonAssignment({ ...nextLessonAssignment, attended: true });
    } catch (err: any) {
      console.error("[Home] confirm attendance error:", err);
    } finally {
      setConfirmingAttendance(false);
    }
  };

  const handleOpenCoach = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/(tabs)/chat");
  };

  const quickActions = [
    {
      icon: BookOpen,
      label: tr.lessons.classes,
      subtitle: tr.home.viewClasses,
      onPress: () => router.push("/(tabs)/lessons"),
    },
    {
      icon: BarChart3,
      label: tr.nav.progress,
      subtitle: tr.home.trackJourney,
      onPress: () => router.push("/(tabs)/progress"),
    },
    {
      icon: MessageCircle,
      label: tr.nav.chat,
      subtitle: tr.home.getSupport,
      onPress: () => router.push("/(tabs)/chat"),
    },
  ];

  const isManager = userData?.role === "manager";

  const displayName = userData?.name || "Welcome";
  const firstName = displayName.split(" ")[0];

  // Compute stats for display
  const classesThisMonth = monthlyStats.classes || 0;
  const totalMinutes = monthlyStats.matMinutes || 0;
  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMins = totalMinutes % 60;
  // Format: 0 => "0h", <60min => "Xm", >=60min => "Xh Ym" (hide 0m remainder)
  const matTimeDisplay =
    totalMinutes === 0
      ? "0h"
      : totalMinutes < 60
      ? `${totalMinutes}m`
      : remainingMins === 0
      ? `${totalHours}h`
      : `${totalHours}h ${remainingMins}m`;

  // Intensity Score (0–100)
  const targetClasses = 12;
  const targetMinutes = 720;
  const classFactor = Math.min(classesThisMonth / targetClasses, 1);
  const timeFactor = Math.min(totalMinutes / targetMinutes, 1);
  const intensity: number = Math.round((0.5 * classFactor + 0.5 * timeFactor) * 100) || 0;

  // Only NGO managers get the OMG dashboard. Students and coaches see the
  // standard home screen. Wait for userData to load before checking role.
  // Must be placed AFTER all hooks (Rules of Hooks).
  // Gate on isFocused so the redirect does NOT fire when the user navigates
  // directly to another tab (e.g. /(tabs)/announcements from ONG dashboard).
  if (isFocused && !loading && isNgo && userData?.role === "manager") {
    return <Redirect href="/ong-dashboard" />;
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.backgroundStart, COLORS.backgroundEnd]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* SECTION 1 — HEADER */}
          <Animated.View
            entering={FadeInDown.delay(100).springify()}
            style={styles.headerSection}
          >
            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={COLORS.accentLight} />
                <Text style={styles.loadingText}>{tr.common.loading}</Text>
              </View>
            ) : (
              <>
                <Text style={styles.welcomeText}>{tr.home.welcomeBack}</Text>
                <Text style={styles.userName}>{firstName}</Text>
                {(userData?.beltRank || userData?.role === "manager") && (
                  <View style={{
                    marginTop: 10,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}>
                    {(() => {
                      const belt = getBeltDisplay(userData.role, userData.beltRank, (userData as any).stripes);
                      return (
                        <View style={{
                          shadowColor: beltColor(belt.beltRank),
                          shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: 0.55,
                          shadowRadius: 8,
                        }}>
                          <BeltBadge
                            beltRank={belt.beltRank}
                            stripes={belt.stripes}
                            stripeColor={belt.stripeColor || undefined}
                            size="sm"
                          />
                        </View>
                      );
                    })()}
                  </View>
                )}
              </>
            )}
          </Animated.View>

          {/* SECTION 2 — TRAINING OVERVIEW (students) / MANAGER DASHBOARD (managers) */}
          {userData?.role === "manager" ? (
            <Animated.View
              entering={FadeInUp.delay(150).springify()}
              style={{ marginBottom: 16 }}
            >
              <AdminDashboardPanel
                schoolId={userData.schoolId ?? ""}
                managerName={userData.name}
                isNgo={isNgo}
              />
            </Animated.View>
          ) : (
          <Animated.View
            entering={FadeInUp.delay(150).springify()}
            style={styles.overviewWrapper}
          >
            <View style={styles.glassCard}>
              {/* Card Header */}
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardTitleRow}>
                  <Award size={18} color={COLORS.accentLight} />
                  <Text style={styles.cardTitle}>{tr.home.trainingOverview}</Text>
                </View>
              </View>

              {/* Stats Grid */}
              <View style={styles.statsGrid}>
                <View style={styles.statItem}>
                  <View style={[styles.statIcon, { backgroundColor: "rgba(30, 64, 175, 0.13)" }]}>
                    <Target size={30} color={COLORS.beltBlue} />
                  </View>
                  <Text style={styles.statValue}>{classesThisMonth}</Text>
                  <Text style={styles.statLabel}>{tr.home.classesThisMonth}</Text>
                </View>

                <View style={styles.statItem}>
                  <View style={[styles.statIcon, { backgroundColor: "rgba(212, 160, 23, 0.13)" }]}>
                    <Clock size={30} color={COLORS.accentLight} />
                  </View>
                  <Text style={styles.statValue}>{matTimeDisplay}</Text>
                  <Text style={styles.statLabel}>{tr.home.matTime}</Text>
                </View>

                <View style={styles.statItem}>
                  <View style={[styles.statIcon, { backgroundColor: "rgba(124, 58, 237, 0.13)" }]}>
                    <BarChart3 size={30} color={COLORS.beltPurple} />
                  </View>
                  <Text style={styles.statValue}>{intensity}</Text>
                  <Text style={styles.statLabel}>{tr.home.intensityScore}</Text>
                </View>
              </View>

              {/* Next Class Info */}
              <View style={styles.nextClassContainer}>
                <Text style={styles.nextClassLabel}>{tr.home.nextClass}</Text>
                <View style={styles.nextClassInfo}>
                  <Calendar size={16} color={COLORS.accentLight} />
                  {nextLesson ? (
                    <Text style={styles.nextClassText}>
                      {nextLesson.level === "fundamentals" ? tr.booking.fundamentals
                        : nextLesson.level === "intermediate" ? tr.booking.intermediate
                        : nextLesson.level === "advanced" ? tr.booking.advanced
                        : tr.lessons.allLevels}{" — "}
                      {nextLesson.startsAt.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}{" "}
                      {nextLesson.startsAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </Text>
                  ) : (
                    <Text style={styles.nextClassText}>{tr.home.noUpcomingClasses}</Text>
                  )}
                </View>

                {/* Attendance CTA for completed next class */}
                {nextLesson && nextLessonAssignment && new Date() >= nextLesson.endsAt && !nextLessonAssignment.attended && (
                  <Pressable
                    onPress={handleConfirmNextLessonAttendance}
                    disabled={confirmingAttendance}
                    style={{
                      marginTop: 10,
                      backgroundColor: confirmingAttendance ? "rgba(255,255,255,0.15)" : "#10B981",
                      paddingVertical: 9,
                      borderRadius: 10,
                      alignItems: "center",
                      flexDirection: "row",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    {confirmingAttendance ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <>
                        <CheckCircle size={15} color="#FFFFFF" />
                        <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 13 }}>{tr.home.confirmAttendance}</Text>
                      </>
                    )}
                  </Pressable>
                )}

                {/* Attended badge */}
                {nextLesson && nextLessonAssignment?.attended && (
                  <View style={{
                    marginTop: 10,
                    backgroundColor: "rgba(16,185,129,0.12)",
                    paddingVertical: 7,
                    borderRadius: 10,
                    alignItems: "center",
                    flexDirection: "row",
                    justifyContent: "center",
                    gap: 6,
                  }}>
                    <CheckCircle size={14} color="#059669" />
                    <Text style={{ color: "#059669", fontWeight: "600", fontSize: 12 }}>{tr.home.attended}</Text>
                  </View>
                )}
              </View>
            </View>
          </Animated.View>
          )}

          {/* SECTION 3 — QUICK ACTIONS 2x2 GRID (students only) */}
          {!isManager && (
          <Animated.View
            entering={FadeInUp.delay(200).springify()}
            style={styles.quickActionsSection}
          >
            <Text style={styles.sectionTitle}>{tr.home.quickActions}</Text>
            <View style={styles.quickActionsGrid}>
              {quickActions.map((action, index) => (
                <Pressable
                  key={action.label}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    action.onPress();
                  }}
                  style={({ pressed }) => [
                    styles.quickActionCard,
                    pressed && styles.quickActionPressed,
                  ]}
                >
                  {/* Subtle inner top highlight */}
                  <View style={styles.quickActionInnerHighlight} />

                  <View style={styles.quickActionIconWrap}>
                    <action.icon size={36} color={COLORS.accentLight} />
                  </View>
                  <Text style={styles.quickActionLabel}>{action.label}</Text>
                  <Text style={styles.quickActionSubtitle}>{action.subtitle}</Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>
          )}

         <CompetitionMuralHomeSection
  schoolId={userData?.schoolId ?? ""}
  userId={currentUid}
  userRole={userData?.role ?? "student"}
  userName={userData?.name ?? "Member"}
  userBeltRank={(userData as any)?.beltRank ?? null}
  delay={240}
  isNgo={isNgo}
/>

<MuralHomeSection
  schoolId={userData?.schoolId ?? ""}
  userId={currentUid ?? ""}
  userRole={userData?.role ?? "student"}
  userName={userData?.name ?? "Member"}
  authorPhotoURL={avatarUrl ?? userData?.photoURL}
  authorBeltRank={(userData as any)?.beltRank ?? null}
  authorStripes={(userData as any)?.stripes ?? null}
  delay={280}
  isNgo={isNgo}
/>

          {/* SECTION 7 — BJJ COACH AI CARD (students only) */}
          {!isManager && (
          <Animated.View
            entering={FadeInUp.delay(320).springify()}
            style={styles.cardWrapper}
          >
            <View style={styles.glassCard}>
              {/* Card Header */}
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardTitleRow}>
                  <Sparkles size={18} color={COLORS.accentLight} />
                  <Text style={styles.cardTitle}>{tr.aiCoach.title}</Text>
                </View>
              </View>

              {/* Coach Subtitle */}
              <Text style={styles.coachSubtitle}>
                {tr.home.coachSubtitle}
              </Text>

              {/* Quick Topic Chips */}
              <View style={styles.topicChipsContainer}>
                {[
                  { label: "Guard Basics", prompt: "Explain the fundamentals of playing guard in BJJ" },
                  { label: "Submissions", prompt: "What are the most effective submissions from mount?" },
                  { label: "Escapes", prompt: "How do I escape from side control effectively?" },
                  { label: "Takedowns", prompt: "What takedowns work best for BJJ competitions?" },
                  { label: "Competition", prompt: "How should I prepare for my first BJJ competition?" },
                  { label: "Drilling", prompt: "What drills can I do to improve my BJJ at home?" },
                ].map((topic) => (
                  <Pressable
                    key={topic.label}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push({
                        pathname: "/(tabs)/chat",
                        params: { topic: topic.prompt },
                      });
                    }}
                    style={({ pressed }) => [
                      styles.topicChip,
                      pressed && styles.topicChipPressed,
                    ]}
                  >
                    <Text style={styles.topicChipText}>{topic.label}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Open Coach CTA */}
              <Pressable
                onPress={handleOpenCoach}
                style={({ pressed }) => [
                  styles.coachButton,
                  pressed && styles.coachButtonPressed,
                ]}
              >
              <Sparkles size={18} color="#FFFFFF" />
                <Text style={styles.coachButtonText}>{String(tr.home.openCoach).replace("{name}", String(tr.aiCoach.name))}</Text>
                <ChevronRight size={18} color="#FFFFFF" />
              </Pressable>
            </View>
          </Animated.View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: 12,
    paddingBottom: 32,
  },

  // ── Header ──
  headerSection: {
    paddingTop: 10,
    paddingBottom: 32,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  loadingText: {
    color: COLORS.textMuted,
    marginLeft: 8,
    fontSize: 14,
  },
  welcomeText: {
    color: "rgba(255, 255, 255, 0.55)",
    fontSize: 14,
    fontWeight: "400",
    marginBottom: 4,
  },
  userName: {
    color: "rgba(255, 255, 255, 0.92)",
    fontSize: 37,
    fontWeight: "700",
    letterSpacing: -0.5,
  },

  // ── Glass Card (shared) ──
  overviewWrapper: {
    marginBottom: 16,
  },
  cardWrapper: {
    marginBottom: 16,
  },
  glassCard: {
    backgroundColor: "#111827",
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },

  // ── Card Header ──
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  cardTitle: {
    color: "rgba(255, 255, 255, 0.88)",
    fontSize: 18,
    fontWeight: "600",
    marginLeft: 8,
    letterSpacing: 0.5,
  },

  // ── Stats Grid ──
  statsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  statValue: {
    color: "rgba(255, 255, 255, 0.92)",
    fontSize: 26,
    fontWeight: "700",
  },
  statLabel: {
    color: "rgba(255, 255, 255, 0.55)",
    fontSize: 13,
    textAlign: "center",
    marginTop: 2,
  },

  // ── Next Class ──
  nextClassContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  nextClassLabel: {
    color: "rgba(255, 255, 255, 0.55)",
    fontSize: 12,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  nextClassInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  nextClassText: {
    color: "rgba(255, 255, 255, 0.88)",
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 8,
  },

  // ── Coach Card ──
  coachSubtitle: {
    color: "rgba(255, 255, 255, 0.55)",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  topicChipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 16,
    marginHorizontal: -4,
  },
  topicChip: {
    backgroundColor: COLORS.accentMuted,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    margin: 4,
    borderWidth: 1,
    borderColor: COLORS.accentGlow,
  },
  topicChipPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
  topicChipText: {
    color: COLORS.accentLight,
    fontSize: 13,
    fontWeight: "500",
  },
  coachButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  coachButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  coachButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
    marginLeft: 8,
    flex: 1,
  },

  // ── Quick Actions 2x2 Grid ──
  quickActionsSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: "rgba(255, 255, 255, 0.88)",
    fontSize: 19,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  quickActionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: CARD_GAP,
  },
  quickActionCard: {
    width: GRID_ITEM_WIDTH,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    overflow: "hidden",
  },
  quickActionInnerHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.10)",
  },
  quickActionPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.97 }],
  },
  quickActionIconWrap: {
    marginBottom: 16,
  },
  quickActionLabel: {
    color: "rgba(255, 255, 255, 0.92)",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  quickActionSubtitle: {
    color: "rgba(255, 255, 255, 0.55)",
    fontSize: 13,
  },
});
