/**
 * Competitions List Screen
 *
 * Shows all upcoming competitions for the user's school.
 * Manager/coach can create competitions via the + button.
 * Route: /competitions
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import {
  Trophy,
  ChevronLeft,
  Plus,
  CalendarDays,
  MapPin,
  ChevronRight,
  X,
} from "lucide-react-native";
import { useUserRole } from "@/lib/hooks/useUserRole";
import { useT } from "@/lib/i18n/useTranslations";
import {
  fetchUpcomingCompetitions,
  createCompetition,
  type Competition,
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
  blue: "#4C7BF4",
  blueMuted: "rgba(76,123,244,0.15)",
  inputBg: "#1F2937",
  border: "rgba(255,255,255,0.08)",
};

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
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

interface FormState {
  name: string;
  organization: string;
  location: string;
  eventDateStr: string;
  deadlineDateStr: string;
  registrationLink: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  organization: "",
  location: "",
  eventDateStr: "",
  deadlineDateStr: "",
  registrationLink: "",
  notes: "",
};

export default function CompetitionsScreen() {
  const router = useRouter();
  const c = useT("competitions");
  const { role, schoolId, loading: roleLoading } = useUserRole();

  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const canCreate = role === "manager" || role === "coach";

  const loadData = useCallback(async () => {
    if (!schoolId) {
      setCompetitions([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const data = await fetchUpcomingCompetitions(schoolId);
      setCompetitions(data);
    } catch (err) {
      console.warn("[Competitions] load error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [schoolId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleCreate = async () => {
    if (!form.name.trim()) {
      Alert.alert(c.required, c.enterName);
      return;
    }

    if (!form.eventDateStr.trim()) {
      Alert.alert(c.required, c.enterValidDate);
      return;
    }

    const eventDate = new Date(form.eventDateStr.trim());
    if (isNaN(eventDate.getTime())) {
      Alert.alert(c.invalidDate, c.enterValidDate);
      return;
    }

    let deadline: Date | null = null;
    if (form.deadlineDateStr.trim()) {
      deadline = new Date(form.deadlineDateStr.trim());
      if (isNaN(deadline.getTime())) {
        Alert.alert(c.invalidDeadline, c.enterValidDeadline);
        return;
      }
    }

    setCreating(true);

    try {
      await waitForAuthReady();

      const uid = auth.currentUser?.uid;
      if (!uid || !schoolId) {
        throw new Error("Not authenticated");
      }

      const userSnap = await getDoc(doc(db, "users", uid));
      const creatorName: string = userSnap.exists()
        ? ((userSnap.data().name as string) ?? "Unknown")
        : "Unknown";

      await createCompetition({
        schoolId,
        name: form.name.trim(),
        organization: form.organization.trim() || null,
        location: form.location.trim() || null,
        eventDate,
        registrationDeadline: deadline,
        registrationLink: form.registrationLink.trim() || null,
        notes: form.notes.trim() || null,
        createdBy: uid,
        createdByName: creatorName,
      });

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setForm(EMPTY_FORM);
      setShowCreate(false);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : c.failedCreate;
      Alert.alert(c.errorTitle, msg);
    } finally {
      setCreating(false);
    }
  };

  if (roleLoading || (loading && !refreshing)) {
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
          <Pressable onPress={() => router.back()} style={s.iconBtn}>
            <ChevronLeft size={20} color={C.text} />
          </Pressable>

          <View
            style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}
          >
            <Trophy size={20} color={C.accent} />
            <Text style={{ color: C.text, fontSize: 20, fontWeight: "700" }}>
              {c.title}
            </Text>
          </View>

          {canCreate && (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowCreate((v) => !v);
                if (showCreate) setForm(EMPTY_FORM);
              }}
              style={[s.iconBtn, showCreate && { backgroundColor: C.accent }]}
            >
              {showCreate ? (
                <X size={18} color="#0B1220" />
              ) : (
                <Plus size={20} color={C.text} />
              )}
            </Pressable>
          )}
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={C.accent}
            />
          }
        >
          {showCreate && canCreate && (
            <Animated.View
              entering={FadeInDown.springify()}
              style={{
                backgroundColor: C.card,
                borderRadius: 20,
                padding: 20,
                borderWidth: 1,
                borderColor: C.accentGlow,
                marginBottom: 20,
              }}
            >
              <Text
                style={{
                  color: C.text,
                  fontSize: 17,
                  fontWeight: "700",
                  marginBottom: 16,
                }}
              >
                {c.newCompetition}
              </Text>

              {(
                [
                  {
                    label: c.competitionName,
                    key: "name",
                    placeholder: "e.g. São Paulo Open",
                  },
                  {
                    label: c.organization,
                    key: "organization",
                    placeholder: "e.g. IBJJF",
                  },
                  {
                    label: c.location,
                    key: "location",
                    placeholder: "e.g. São Paulo, Brazil",
                  },
                  {
                    label: c.eventDate,
                    key: "eventDateStr",
                    placeholder: "2025-09-14",
                  },
                  {
                    label: c.registrationDeadline,
                    key: "deadlineDateStr",
                    placeholder: "2025-08-30",
                  },
                  {
                    label: c.registrationLink,
                    key: "registrationLink",
                    placeholder: "https://...",
                  },
                  {
                    label: c.notes,
                    key: "notes",
                    placeholder: "...",
                    multiline: true,
                  },
                ] as Array<{
                  label: string;
                  key: keyof FormState;
                  placeholder: string;
                  multiline?: boolean;
                }>
              ).map((field) => (
                <View key={field.key} style={{ marginBottom: 12 }}>
                  <Text style={s.fieldLabel}>{field.label}</Text>
                  <TextInput
                    style={[
                      s.input,
                      field.multiline && {
                        height: 72,
                        textAlignVertical: "top",
                      },
                    ]}
                    placeholder={field.placeholder}
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    value={form[field.key]}
                    onChangeText={(v) =>
                      setForm((p) => ({ ...p, [field.key]: v }))
                    }
                    multiline={field.multiline}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              ))}

              <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                <Pressable
                  onPress={() => {
                    setShowCreate(false);
                    setForm(EMPTY_FORM);
                  }}
                  style={{
                    flex: 1,
                    backgroundColor: C.inputBg,
                    borderRadius: 14,
                    paddingVertical: 13,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: C.textMuted, fontWeight: "600" }}>
                    {c.cancel}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={handleCreate}
                  disabled={creating}
                  style={{
                    flex: 2,
                    backgroundColor: C.accent,
                    borderRadius: 14,
                    paddingVertical: 13,
                    alignItems: "center",
                    opacity: creating ? 0.6 : 1,
                  }}
                >
                  {creating ? (
                    <ActivityIndicator size="small" color="#0B1220" />
                  ) : (
                    <Text
                      style={{ color: "#0B1220", fontWeight: "700", fontSize: 15 }}
                    >
                      {c.create}
                    </Text>
                  )}
                </Pressable>
              </View>
            </Animated.View>
          )}

          {!loading && competitions.length === 0 && (
            <View style={{ alignItems: "center", paddingTop: 60, paddingBottom: 40 }}>
              <Trophy size={48} color={C.textMuted} />
              <Text
                style={{
                  color: C.textMuted,
                  fontSize: 16,
                  textAlign: "center",
                  lineHeight: 24,
                  marginTop: 16,
                }}
              >
                {c.noUpcoming}{canCreate ? `\n${c.tapPlus}` : ""}
              </Text>
            </View>
          )}

          {competitions.map((comp, idx) => {
            const days = daysUntil(comp.eventDate);
            const urgent = days <= 7;
            const soon = days <= 30;

            return (
              <Animated.View
                key={comp.id}
                entering={FadeInDown.delay(idx * 50).springify()}
                style={{ marginBottom: 12 }}
              >
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push({
                      pathname: "/competition-detail",
                      params: { competitionId: comp.id },
                    });
                  }}
                  style={({ pressed }) => ({
                    backgroundColor: C.card,
                    borderRadius: 20,
                    padding: 18,
                    borderWidth: 1,
                    borderColor: soon ? C.accentGlow : C.cardBorder,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                    }}
                  >
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text
                        style={{
                          color: C.text,
                          fontSize: 16,
                          fontWeight: "700",
                          marginBottom: 3,
                        }}
                        numberOfLines={2}
                      >
                        {comp.name}
                      </Text>

                      {comp.organization && (
                        <Text
                          style={{
                            color: C.textMuted,
                            fontSize: 12,
                            marginBottom: 10,
                          }}
                          numberOfLines={1}
                        >
                          {comp.organization}
                        </Text>
                      )}

                      <View style={{ gap: 5 }}>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <CalendarDays size={13} color={C.accent} />
                          <Text style={{ color: C.textSecondary, fontSize: 13 }}>
                            {formatDate(comp.eventDate)}
                          </Text>
                        </View>

                        {comp.location && (
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <MapPin size={13} color={C.textMuted} />
                            <Text
                              style={{ color: C.textMuted, fontSize: 13 }}
                              numberOfLines={1}
                            >
                              {comp.location}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <View style={{ alignItems: "flex-end", gap: 8 }}>
                      {days >= 0 && (
                        <View
                          style={{
                            backgroundColor: urgent
                              ? "rgba(239,68,68,0.15)"
                              : soon
                                ? C.accentMuted
                                : C.blueMuted,
                            borderRadius: 10,
                            paddingHorizontal: 9,
                            paddingVertical: 4,
                          }}
                        >
                          <Text
                            style={{
                              color: urgent ? "#EF4444" : soon ? C.accent : C.blue,
                              fontSize: 11,
                              fontWeight: "700",
                            }}
                          >
                            {days === 0 ? c.today : `${days}d`}
                          </Text>
                        </View>
                      )}
                      <ChevronRight size={16} color={C.textMuted} />
                    </View>
                  </View>
                </Pressable>
              </Animated.View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#1F2937",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  fieldLabel: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    marginBottom: 5,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: "#1F2937",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: "#FFFFFF",
    fontSize: 14,
  },
});