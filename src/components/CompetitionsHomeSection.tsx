/**
 * CompetitionsHomeSection
 *
 * Shows the next 2 upcoming competitions for the school on the Home screen.
 * Placed BELOW the Mural section.
 */

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Trophy, MapPin, ChevronRight, CalendarDays } from "lucide-react-native";
import { useT } from "@/lib/i18n/useTranslations";
import { fetchUpcomingCompetitions, type Competition } from "@/lib/competitions";

// ─── Design tokens (match Home screen dark system) ────────────────────────────
const C = {
  bg: "#111827",
  border: "rgba(255,255,255,0.06)",
  text: "#FFFFFF",
  textSecondary: "rgba(255,255,255,0.70)",
  textMuted: "rgba(255,255,255,0.50)",
  accent: "#FBBF24",
  accentMuted: "rgba(251,191,36,0.15)",
  accentGlow: "rgba(251,191,36,0.25)",
  blue: "#4C7BF4",
  blueMuted: "rgba(76,123,244,0.15)",
};

function formatEventDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface Props {
  schoolId: string;
  delay?: number;
}

export function CompetitionsHomeSection({ schoolId, delay = 300 }: Props) {
  const router = useRouter();
  const c = useT("competitions");
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchUpcomingCompetitions(schoolId, 2)
      .then((data) => {
        if (!cancelled) setCompetitions(data);
      })
      .catch((err) => {
        console.warn("[CompetitionsHomeSection] fetch error:", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [schoolId]);

  // Don't render the section at all if there are no competitions and we finished loading
  if (!loading && competitions.length === 0) return null;

  return (
    <Animated.View
      entering={FadeInDown.delay(delay).springify()}
      style={{ marginBottom: 16 }}
    >
      {/* Section header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Trophy size={18} color={C.accent} />
          <Text
            style={{
              color: "rgba(255,255,255,0.88)",
              fontSize: 19,
              fontWeight: "600",
              letterSpacing: 0.5,
            }}
          >
          {c.upcomingCompetitions}
          </Text>
        </View>

        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/competitions");
          }}
          style={{ flexDirection: "row", alignItems: "center", gap: 2 }}
        >
          <Text style={{ color: C.blue, fontSize: 13, fontWeight: "500" }}>
            {c.seeAll}
          </Text>
          <ChevronRight size={14} color={C.blue} />
        </Pressable>
      </View>

      {/* Loading state */}
      {loading && (
        <View
          style={{
            backgroundColor: C.bg,
            borderRadius: 20,
            padding: 24,
            borderWidth: 1,
            borderColor: C.border,
            alignItems: "center",
          }}
        >
          <ActivityIndicator size="small" color={C.accent} />
        </View>
      )}

      {/* Competition cards */}
      {!loading &&
        competitions.map((comp, idx) => (
          <Pressable
            key={comp.id}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push({
                pathname: "/competition-detail",
                params: { competitionId: comp.id },
              });
            }}
            style={({ pressed }) => ({
              backgroundColor: C.bg,
              borderRadius: 20,
              padding: 18,
              borderWidth: 1,
              borderColor: idx === 0 ? C.accentGlow : C.border,
              marginBottom: idx < competitions.length - 1 ? 10 : 0,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            {/* Name + arrow */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <View style={{ flex: 1, marginRight: 8 }}>
                {/* Next badge for the first item */}
                {idx === 0 && (
                  <View
                    style={{
                      backgroundColor: C.accentMuted,
                      borderRadius: 8,
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      alignSelf: "flex-start",
                      marginBottom: 6,
                    }}
                  >
                    <Text
                      style={{
                        color: C.accent,
                        fontSize: 10,
                        fontWeight: "700",
                        letterSpacing: 1,
                        textTransform: "uppercase",
                      }}
                    >
                      {c.next}
                    </Text>
                  </View>
                )}
                <Text
                  style={{
                    color: C.text,
                    fontSize: 16,
                    fontWeight: "700",
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
                      marginTop: 2,
                    }}
                    numberOfLines={1}
                  >
                    {comp.organization}
                  </Text>
                )}
              </View>
              <ChevronRight size={18} color={C.textMuted} />
            </View>

            {/* Date + location row */}
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <CalendarDays size={13} color={C.accent} />
                <Text style={{ color: C.textSecondary, fontSize: 13 }}>
                  {formatEventDate(comp.eventDate)}
                </Text>
              </View>

              {comp.location && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
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
          </Pressable>
        ))}
    </Animated.View>
  );
}
