/**
 * Competition Detail Screen
 *
 * Shows full details for a competition.
 * Students: "I'm Competing" button → registers them in competition_participants.
 * Manager/coach: see participant list.
 * Route: /competition-detail?competitionId=xxx
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Linking,
  Alert,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import {
  Trophy,
  ChevronLeft,
  CalendarDays,
  MapPin,
  Clock,
  Link2,
  Users,
  CheckCircle2,
  Swords,
  FileText,
} from "lucide-react-native";
import { useUserRole } from "@/lib/hooks/useUserRole";
import { useT } from "@/lib/i18n/useTranslations";
import {
  fetchCompetition,
  fetchParticipants,
  checkAlreadyRegistered,
  registerForCompetition,
  type Competition,
  type CompetitionParticipant,
} from "@/lib/competitions";
import { waitForAuthReady, auth, db } from "@/lib/firebase-config";
import { doc, getDoc } from "firebase/firestore";

const C = {
  bg: "#0B1220",
  card: "#111827",
  cardBorder: "rgba(255,255,255,0.06)",
  text: "#FFFFFF",
  textSecondary: "rgba(255,255,255,0.70)",
  textMuted: "rgba(255,255,255,0.45)",
  accent: "#FBBF24",
  accentMuted: "rgba(251,191,36,0.15)",
  accentGlow: "rgba(251,191,36,0.25)",
  green: "#10B981",
  greenMuted: "rgba(16,185,129,0.15)",
  blue: "#4C7BF4",
  blueMuted: "rgba(76,123,244,0.15)",
  inputBg: "#1F2937",
  border: "rgba(255,255,255,0.08)",
};

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function daysUntil(date: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export default function CompetitionDetailScreen() {
  const router = useRouter();
  const c = useT("competitions");
  const params = useLocalSearchParams();
  const rawCompetitionId = params.competitionId;
  const competitionId = useMemo(() => {
    if (Array.isArray(rawCompetitionId)) return rawCompetitionId[0] ?? null;
    return typeof rawCompetitionId === "string" ? rawCompetitionId : null;
  }, [rawCompetitionId]);

  const { role, schoolId } = useUserRole();

  const [competition, setCompetition] = useState<Competition | null>(null);
  const [participants, setParticipants] = useState<CompetitionParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [myParticipantId, setMyParticipantId] = useState<string | null>(null);

  const canViewParticipants = role === "manager" || role === "coach";

  const loadData = useCallback(async () => {
    if (!competitionId) {
      setCompetition(null);
      setParticipants([]);
      setMyParticipantId(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      await waitForAuthReady();
      const uid = auth.currentUser?.uid;

      const [comp, parts] = await Promise.all([
        fetchCompetition(competitionId),
        fetchParticipants(competitionId),
      ]);

      setCompetition(comp);
      setParticipants(parts);

      if (uid) {
        const existing = await checkAlreadyRegistered(competitionId, uid);
        setMyParticipantId(existing);
      } else {
        setMyParticipantId(null);
      }
    } catch (err) {
      console.warn("[CompetitionDetail] load error:", err);
      setCompetition(null);
      setParticipants([]);
      setMyParticipantId(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [competitionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const handleRegister = async () => {
    if (!competitionId) return;

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRegistering(true);

    try {
      await waitForAuthReady();
      const uid = auth.currentUser?.uid;
      if (!uid || !schoolId) throw new Error("Not authenticated");

      const userSnap = await getDoc(doc(db, "users", uid));
      const userData = userSnap.exists() ? userSnap.data() : {};
      const studentName: string = (userData.name as string) ?? "Unknown";
      const beltRank: string | null = (userData.beltRank as string) ?? null;

      const participantId = await registerForCompetition({
        competitionId,
        schoolId,
        studentUid: uid,
        studentName,
        beltRank,
      });

      setMyParticipantId(participantId);
      setParticipants((prev) => [
        ...prev.filter((p) => p.studentUid !== uid),
        {
          id: participantId,
          competitionId,
          schoolId,
          studentUid: uid,
          studentName,
          beltRank,
          weight: null,
          registeredAt: new Date(),
        },
      ]);

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : c.failedRegister;
      Alert.alert(c.errorTitle, msg);
    } finally {
      setRegistering(false);
    }
  };

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: C.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator size="large" color={C.accent} />
      </View>
    );
  }

  if (!competition) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
          <Pressable
            onPress={() => router.back()}
            style={{
              margin: 20,
              width: 38,
              height: 38,
              borderRadius: 12,
              backgroundColor: C.inputBg,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ChevronLeft size={20} color={C.text} />
          </Pressable>

          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: C.textMuted, fontSize: 16 }}>
              {c.notFound}
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const days = daysUntil(competition.eventDate);
  const alreadyRegistered = myParticipantId !== null;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: 16,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              backgroundColor: C.inputBg,
              alignItems: "center",
              justifyContent: "center",
              marginRight: 14,
            }}
          >
            <ChevronLeft size={20} color={C.text} />
          </Pressable>

          <Text
            style={{ color: C.text, fontSize: 20, fontWeight: "700", flex: 1 }}
            numberOfLines={1}
          >
            {competition.name}
          </Text>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadData();
              }}
              tintColor={C.accent}
            />
          }
        >
          <Animated.View
            entering={FadeInDown.delay(50).springify()}
            style={{
              backgroundColor: C.card,
              borderRadius: 24,
              padding: 22,
              borderWidth: 1,
              borderColor: days <= 30 ? C.accentGlow : C.cardBorder,
              marginBottom: 16,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                justifyContent: "space-between",
                marginBottom: 14,
              }}
            >
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text
                  style={{
                    color: C.text,
                    fontSize: 22,
                    fontWeight: "800",
                    marginBottom: 4,
                  }}
                >
                  {competition.name}
                </Text>

                {competition.organization && (
                  <Text style={{ color: C.textMuted, fontSize: 14 }}>
                    {competition.organization}
                  </Text>
                )}
              </View>

              <View
                style={{
                  alignItems: "center",
                  backgroundColor: C.accentMuted,
                  borderRadius: 14,
                  padding: 10,
                }}
              >
                <Trophy size={24} color={C.accent} />
              </View>
            </View>

            {days >= 0 && (
              <View
                style={{
                  alignSelf: "flex-start",
                  backgroundColor:
                    days <= 7
                      ? "rgba(239,68,68,0.15)"
                      : days <= 30
                        ? C.accentMuted
                        : C.blueMuted,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  marginBottom: 16,
                }}
              >
                <Text
                  style={{
                    color:
                      days <= 7 ? "#EF4444" : days <= 30 ? C.accent : C.blue,
                    fontSize: 13,
                    fontWeight: "700",
                  }}
                >
                  {days === 0 ? c.todayExclaim : days === 1 ? c.tomorrow : c.daysAway.replace("{days}", String(days))}
                </Text>
              </View>
            )}

            <View style={{ gap: 12 }}>
              <DetailRow
                icon={<CalendarDays size={16} color={C.accent} />}
                label={c.eventDate}
                value={formatDate(competition.eventDate)}
              />

              {competition.registrationDeadline && (
                <DetailRow
                  icon={<Clock size={16} color={days <= 7 ? "#EF4444" : C.textMuted} />}
                  label={c.registrationDeadline}
                  value={formatShortDate(competition.registrationDeadline)}
                  valueColor={days <= 7 ? "#EF4444" : undefined}
                />
              )}

              {competition.location && (
                <DetailRow
                  icon={<MapPin size={16} color={C.textMuted} />}
                  label={c.location}
                  value={competition.location}
                />
              )}

              {competition.registrationLink && (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    Linking.openURL(competition.registrationLink!).catch(() =>
                      Alert.alert(c.couldNotOpenLink, competition.registrationLink!),
                    );
                  }}
                >
                  <DetailRow
                    icon={<Link2 size={16} color={C.blue} />}
                    label={c.registerOnline}
                    value={c.openRegistrationLink}
                    valueColor={C.blue}
                  />
                </Pressable>
              )}
            </View>

            {competition.notes && (
              <View
                style={{
                  marginTop: 16,
                  backgroundColor: C.inputBg,
                  borderRadius: 14,
                  padding: 14,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 8,
                  }}
                >
                  <FileText size={14} color={C.textMuted} />
                  <Text
                    style={{
                      color: C.textMuted,
                      fontSize: 12,
                      fontWeight: "600",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    {c.notes}
                  </Text>
                </View>

                <Text
                  style={{
                    color: C.textSecondary,
                    fontSize: 14,
                    lineHeight: 20,
                  }}
                >
                  {competition.notes}
                </Text>
              </View>
            )}
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(100).springify()} style={{ marginBottom: 16 }}>
            {alreadyRegistered ? (
              <View
                style={{
                  backgroundColor: C.greenMuted,
                  borderRadius: 18,
                  paddingVertical: 16,
                  paddingHorizontal: 20,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  borderWidth: 1,
                  borderColor: "rgba(16,185,129,0.25)",
                }}
              >
                <CheckCircle2 size={20} color={C.green} />
                <Text style={{ color: C.green, fontSize: 16, fontWeight: "700" }}>
                  {c.youreRegistered}
                </Text>
              </View>
            ) : (
              <Pressable
                onPress={handleRegister}
                disabled={registering}
                style={({ pressed }) => ({
                  backgroundColor: C.accent,
                  borderRadius: 18,
                  paddingVertical: 16,
                  paddingHorizontal: 20,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  opacity: registering || pressed ? 0.75 : 1,
                })}
              >
                {registering ? (
                  <ActivityIndicator size="small" color="#0B1220" />
                ) : (
                  <>
                    <Swords size={20} color="#0B1220" />
                    <Text
                      style={{
                        color: "#0B1220",
                        fontSize: 16,
                        fontWeight: "700",
                      }}
                    >
                      {c.imCompeting}
                    </Text>
                  </>
                )}
              </Pressable>
            )}
          </Animated.View>

          {canViewParticipants && (
            <Animated.View entering={FadeInDown.delay(150).springify()}>
              <View
                style={{
                  backgroundColor: C.card,
                  borderRadius: 20,
                  padding: 18,
                  borderWidth: 1,
                  borderColor: C.cardBorder,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 14,
                  }}
                >
                  <Users size={16} color={C.textMuted} />
                  <Text style={{ color: C.text, fontSize: 16, fontWeight: "700" }}>
                    {c.team} ({participants.length})
                  </Text>
                </View>

                {participants.length === 0 ? (
                  <Text style={{ color: C.textMuted, fontSize: 14 }}>
                    {c.noTeamMembers}
                  </Text>
                ) : (
                  participants.map((p, idx) => (
                    <View
                      key={p.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingVertical: 10,
                        borderTopWidth: idx > 0 ? 1 : 0,
                        borderTopColor: C.border,
                      }}
                    >
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: C.inputBg,
                          alignItems: "center",
                          justifyContent: "center",
                          marginRight: 12,
                        }}
                      >
                        <Text
                          style={{
                            color: C.textMuted,
                            fontSize: 14,
                            fontWeight: "700",
                          }}
                        >
                          {(p.studentName?.[0] ?? "?").toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{ color: C.text, fontSize: 14, fontWeight: "600" }}
                        >
                          {p.studentName}
                        </Text>
                        {p.beltRank && (
                          <Text style={{ color: C.textMuted, fontSize: 12 }}>
                            {p.beltRank}
                          </Text>
                        )}
                      </View>
                    </View>
                  ))
                )}
              </View>
            </Animated.View>
          )}

          {!canViewParticipants && participants.length > 0 && (
            <Animated.View entering={FadeInDown.delay(150).springify()}>
              <View
                style={{
                  backgroundColor: C.card,
                  borderRadius: 16,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: C.cardBorder,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <Users size={16} color={C.textMuted} />
                <Text style={{ color: C.textSecondary, fontSize: 14 }}>
                  {participants.length !== 1
                    ? c.teammates.replace("{count}", String(participants.length))
                    : c.teammate.replace("{count}", String(participants.length))}
                </Text>
              </View>
            </Animated.View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function DetailRow({
  icon,
  label,
  value,
  valueColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
      <View style={{ marginTop: 2 }}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: "rgba(255,255,255,0.45)",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            marginBottom: 2,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            color: valueColor ?? "rgba(255,255,255,0.88)",
            fontSize: 14,
            fontWeight: "500",
          }}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}