/**
 * CompetitionMuralHomeSection
 *
 * Calendar/event-board style preview of upcoming competitions on the Home screen.
 * Replaces the "Latest Announcements" section.
 * Shows up to 3 upcoming competitions.
 * - Event date, name, location, signup deadline, signup status, participant count
 * - Students can tap "I'm Competing" inline (if deadline not passed)
 * - "See all" navigates to the full Competition Mural screen
 */

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Linking,
  Alert,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  Trophy,
  MapPin,
  ChevronRight,
  CalendarDays,
  Clock,
  Users,
  CheckCircle2,
  Swords,
  Link2,
} from "lucide-react-native";
import {
  fetchUpcomingCompetitions,
  fetchParticipants,
  checkAlreadyRegistered,
  registerForCompetition,
  type Competition,
} from "@/lib/competitions";
import { waitForAuthReady, auth, db } from "@/lib/firebase-config";
import { doc, getDoc } from "firebase/firestore";
import { useT } from "@/lib/i18n/useTranslations";

// ─── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg: "#0A1628",
  border: "rgba(255,255,255,0.08)",
  text: "#FFFFFF",
  textSub: "rgba(255,255,255,0.70)",
  textMuted: "rgba(255,255,255,0.50)",
  accent: "#FBBF24",
  accentMuted: "rgba(251,191,36,0.15)",
  accentGlow: "rgba(251,191,36,0.25)",
  blue: "#4C7BF4",
  blueMuted: "rgba(76,123,244,0.15)",
  green: "#10B981",
  greenMuted: "rgba(16,185,129,0.15)",
  red: "#EF4444",
  redMuted: "rgba(239,68,68,0.15)",
  cardBg: "#111827",
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatEventDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function daysUntil(date: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

type SignupStatus = "open" | "closing_soon" | "closed" | "no_deadline";

function getSignupStatus(comp: Competition): SignupStatus {
  if (!comp.registrationDeadline) return "no_deadline";
  const now = new Date();
  if (comp.registrationDeadline < now) return "closed";
  const daysLeft = daysUntil(comp.registrationDeadline);
  if (daysLeft <= 7) return "closing_soon";
  return "open";
}

function SignupStatusPill({ status }: { status: SignupStatus }) {
  const c = useT("competitions");
  if (status === "no_deadline") return null;

  const config = {
    open: { label: c.open, bg: C.greenMuted, color: C.green },
    closing_soon: { label: c.closingSoon, bg: C.accentMuted, color: C.accent },
    closed: { label: c.closed, bg: C.redMuted, color: C.red },
  }[status];

  return (
    <View
      style={{
        backgroundColor: config.bg,
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 3,
        alignSelf: "flex-start",
      }}
    >
      <Text style={{ color: config.color, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 }}>
        {config.label}
      </Text>
    </View>
  );
}

// ─── Per-competition card with inline confirm ───────────────────────────────────

interface CompCard {
  comp: Competition;
  index: number;
  userId: string | null;
  schoolId: string;
  userRole: string;
  userName: string;
  userBeltRank: string | null;
}

function CompetitionCard({ comp, index, userId, schoolId, userRole, userName, userBeltRank }: CompCard) {
  const router = useRouter();
  const c = useT("competitions");
  const [participantCount, setParticipantCount] = useState<number>(0);
  const [registered, setRegistered] = useState<boolean>(false);
  const [registering, setRegistering] = useState(false);
  const signupStatus = getSignupStatus(comp);
  const days = daysUntil(comp.eventDate);
  const isDeadlinePassed = signupStatus === "closed";

  useEffect(() => {
    let cancelled = false;
    fetchParticipants(comp.id).then((parts) => {
      if (cancelled) return;
      setParticipantCount(parts.length);
    }).catch(() => {});

    if (userId) {
      checkAlreadyRegistered(comp.id, userId).then((id) => {
        if (cancelled) return;
        setRegistered(id !== null);
      }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [comp.id, userId]);

  const handleRegister = async () => {
    if (!userId || !schoolId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRegistering(true);
    try {
      await waitForAuthReady();
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("Not authenticated");

      const participantId = await registerForCompetition({
        competitionId: comp.id,
        schoolId,
        studentUid: uid,
        studentName: userName,
        beltRank: userBeltRank,
      });
      setRegistered(participantId !== null);
      setParticipantCount((c) => c + 1);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to register.";
      Alert.alert(c.errorTitle, msg);
    } finally {
      setRegistering(false);
    }
  };

  const isNext = index === 0;

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 60).springify()}
      style={{ marginBottom: index < 2 ? 10 : 0 }}
    >
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push({ pathname: "/competition-detail", params: { competitionId: comp.id } });
        }}
        style={({ pressed }) => ({
          backgroundColor: C.cardBg,
          borderRadius: 18,
          padding: 16,
          borderWidth: 1,
          borderColor: isNext ? C.accentGlow : C.border,
          opacity: pressed ? 0.88 : 1,
        })}
      >
        {/* Top row: date badge + name + arrow */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
          {/* Calendar date badge */}
          <View
            style={{
              width: 48,
              height: 52,
              borderRadius: 12,
              backgroundColor: isNext ? C.accentMuted : "rgba(255,255,255,0.06)",
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: isNext ? C.accentGlow : "rgba(255,255,255,0.06)",
              flexShrink: 0,
            }}
          >
            <Text style={{ color: isNext ? C.accent : C.textMuted, fontSize: 9, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" }}>
              {comp.eventDate.toLocaleDateString(undefined, { month: "short" })}
            </Text>
            <Text style={{ color: isNext ? C.accent : C.textSub, fontSize: 20, fontWeight: "800", lineHeight: 24 }}>
              {comp.eventDate.getDate()}
            </Text>
          </View>

          {/* Name + status pills */}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
              {isNext && (
                <View style={{ backgroundColor: C.accentMuted, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ color: C.accent, fontSize: 9, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" }}>
                    {c.next}
                  </Text>
                </View>
              )}
              <SignupStatusPill status={signupStatus} />
            </View>
            <Text style={{ color: C.text, fontSize: 15, fontWeight: "700", lineHeight: 20 }} numberOfLines={2}>
              {comp.name}
            </Text>
            {comp.organization && (
              <Text style={{ color: C.textMuted, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
                {comp.organization}
              </Text>
            )}
          </View>

          {/* Days countdown + arrow */}
          <View style={{ alignItems: "center", gap: 4 }}>
            {days >= 0 && (
              <View style={{
                backgroundColor: days <= 7 ? C.redMuted : days <= 30 ? C.accentMuted : C.blueMuted,
                borderRadius: 8,
                paddingHorizontal: 7,
                paddingVertical: 3,
              }}>
                <Text style={{ color: days <= 7 ? C.red : days <= 30 ? C.accent : C.blue, fontSize: 10, fontWeight: "700" }}>
                  {days === 0 ? c.today : `${days}d`}
                </Text>
              </View>
            )}
            <ChevronRight size={14} color={C.textMuted} />
          </View>
        </View>

        {/* Detail row: location, deadline, participants */}
        <View style={{ gap: 5 }}>
          {comp.location && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <MapPin size={11} color={C.textMuted} />
              <Text style={{ color: C.textMuted, fontSize: 12 }} numberOfLines={1}>{comp.location}</Text>
            </View>
          )}
          {comp.registrationDeadline && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <Clock size={11} color={isDeadlinePassed ? C.red : C.textMuted} />
              <Text style={{ color: isDeadlinePassed ? C.red : C.textMuted, fontSize: 12 }}>
                {c.deadline}: {formatShortDate(comp.registrationDeadline)}
              </Text>
            </View>
          )}
          {participantCount > 0 && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <Users size={11} color={C.textMuted} />
              <Text style={{ color: C.textMuted, fontSize: 12 }}>
                {participantCount !== 1
                  ? c.teammates.replace("{count}", String(participantCount))
                  : c.teammate.replace("{count}", String(participantCount))}
              </Text>
            </View>
          )}
        </View>

        {/* External registration link */}
        {comp.registrationLink ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              Linking.openURL(comp.registrationLink!).catch(() =>
                Alert.alert(c.couldNotOpenLink, comp.registrationLink!)
              );
            }}
            style={({ pressed }) => ({
              marginTop: 12,
              backgroundColor: pressed ? C.blueMuted : "rgba(76,123,244,0.12)",
              borderRadius: 12,
              paddingVertical: 9,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              borderWidth: 1,
              borderColor: "rgba(76,123,244,0.25)",
            })}
          >
            <Link2 size={13} color={C.blue} />
            <Text style={{ color: C.blue, fontSize: 13, fontWeight: "600" }}>{c.registerOnline}</Text>
          </Pressable>
        ) : null}

        {/* Signup action */}
        {!isDeadlinePassed && !registered && (userRole === "student" || userRole === "coach" || userRole === "manager") && (
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              handleRegister();
            }}
            disabled={registering}
            style={({ pressed }) => ({
              marginTop: 12,
              backgroundColor: registering || pressed ? "rgba(251,191,36,0.7)" : C.accent,
              borderRadius: 12,
              paddingVertical: 10,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            })}
          >
            {registering ? (
              <ActivityIndicator size="small" color="#0B1220" />
            ) : (
              <>
                <Swords size={14} color="#0B1220" />
                <Text style={{ color: "#0B1220", fontSize: 13, fontWeight: "700" }}>{c.imCompeting}</Text>
              </>
            )}
          </Pressable>
        )}

        {registered && (
          <View style={{
            marginTop: 12,
            backgroundColor: C.greenMuted,
            borderRadius: 12,
            paddingVertical: 10,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            borderWidth: 1,
            borderColor: "rgba(16,185,129,0.25)",
          }}>
            <CheckCircle2 size={14} color={C.green} />
            <Text style={{ color: C.green, fontSize: 13, fontWeight: "700" }}>{c.youreRegistered}</Text>
          </View>
        )}

        {isDeadlinePassed && !registered && (
          <View style={{
            marginTop: 12,
            backgroundColor: C.redMuted,
            borderRadius: 12,
            paddingVertical: 10,
            alignItems: "center",
          }}>
            <Text style={{ color: C.red, fontSize: 12, fontWeight: "600" }}>{c.registrationClosed}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ─── Main Section ──────────────────────────────────────────────────────────────

interface Props {
  schoolId: string;
  userId: string | null;
  userRole: string;
  userName: string;
  userBeltRank?: string | null;
  delay?: number;
  isNgo?: boolean;
}

export function CompetitionMuralHomeSection({
  schoolId,
  userId,
  userRole,
  userName,
  userBeltRank = null,
  delay = 240,
}: Props) {
  const router = useRouter();
  const c = useT("competitions");
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFetchError(false);
    fetchUpcomingCompetitions(schoolId, 3)
      .then((data) => { if (!cancelled) setCompetitions(data); })
      .catch((err) => {
        console.warn("[CompetitionMuralHomeSection] fetch error:", err);
        if (!cancelled) setFetchError(true);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [schoolId]);

  return (
    <Animated.View entering={FadeInDown.delay(delay).springify()} style={{ marginBottom: 16 }}>
      <View style={{
        backgroundColor: C.bg,
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: C.border,
      }}>
        {/* Header */}
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Trophy size={18} color={C.accent} />
            <Text style={{ color: C.text, fontSize: 16, fontWeight: "600" }}>{c.mural}</Text>
          </View>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/competition-mural");
            }}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 2,
              opacity: pressed ? 0.7 : 1,
            })}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={{ color: C.blue, fontSize: 13, fontWeight: "600" }}>{c.seeAll}</Text>
            <ChevronRight size={14} color={C.blue} />
          </Pressable>
        </View>

        {/* Content */}
        {loading ? (
          <View style={{ alignItems: "center", paddingVertical: 20 }}>
            <ActivityIndicator color={C.accent} />
          </View>
        ) : fetchError ? (
          <View style={{ alignItems: "center", paddingVertical: 20 }}>
            <Trophy size={24} color={C.textMuted} />
            <Text style={{ color: C.textMuted, fontSize: 13, marginTop: 8, textAlign: "center" }}>
              Unable to load competitions right now.
            </Text>
          </View>
        ) : competitions.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 20 }}>
            <Trophy size={24} color={C.textMuted} />
            <Text style={{ color: C.textMuted, fontSize: 14, marginTop: 8, textAlign: "center" }}>
              {c.noUpcoming}
            </Text>
          </View>
        ) : (
          competitions.map((comp, i) => (
            <CompetitionCard
              key={comp.id}
              comp={comp}
              index={i}
              userId={userId}
              schoolId={schoolId}
              userRole={userRole}
              userName={userName}
              userBeltRank={userBeltRank ?? null}
            />
          ))
        )}
      </View>
    </Animated.View>
  );
}
