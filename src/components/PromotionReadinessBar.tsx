/**
 * PromotionReadinessBar
 *
 * Animated readiness progress bar with status indicator.
 * Read-only intelligence — displays promotion readiness % and level.
 */

import React, { useEffect, useMemo } from "react";
import { View, Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import type { PromotionReadiness } from "@/lib/belt-intelligence";

interface PromotionReadinessBarProps {
  readiness: PromotionReadiness;
  /** animate on mount */
  animate?: boolean;
}

const C = {
  trackBg: "rgba(255,255,255,0.08)",
  text: "#FFFFFF",
  textMuted: "rgba(255,255,255,0.45)",
  textSub: "rgba(255,255,255,0.65)",
};

function ReadinessIcon({ level }: { level: PromotionReadiness["level"] }) {
  if (level === "ready") return <Text style={{ fontSize: 13 }}>🟢</Text>;
  if (level === "developing") return <Text style={{ fontSize: 13 }}>🟡</Text>;
  return <Text style={{ fontSize: 13 }}>🔵</Text>;
}

export function PromotionReadinessBar({
  readiness,
  animate = true,
}: PromotionReadinessBarProps) {
  const widthPct = useSharedValue(0);

  useEffect(() => {
    widthPct.value = withTiming(readiness.pct, {
      duration: animate ? 800 : 0,
      easing: Easing.out(Easing.cubic),
    });
  }, [readiness.pct]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${widthPct.value}%` as any,
  }));

  return (
    <View style={{ marginBottom: 4 }}>
      {/* Header row */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <ReadinessIcon level={readiness.level} />
          <Text style={{ color: C.textSub, fontSize: 12, fontWeight: "600", letterSpacing: 0.3 }}>
            Promotion Readiness
          </Text>
        </View>
        <Text
          style={{
            color: readiness.color,
            fontSize: 14,
            fontWeight: "700",
            letterSpacing: -0.3,
          }}
        >
          {readiness.pct}%
        </Text>
      </View>

      {/* Track */}
      <View
        style={{
          height: 7,
          backgroundColor: C.trackBg,
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        <Animated.View
          style={[
            {
              height: "100%",
              backgroundColor: readiness.color,
              borderRadius: 4,
              shadowColor: readiness.color,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.7,
              shadowRadius: 6,
            },
            barStyle,
          ]}
        />
      </View>

      {/* Label */}
      <Text
        style={{
          color: readiness.color,
          fontSize: 11,
          fontWeight: "500",
          marginTop: 5,
          opacity: 0.9,
        }}
      >
        {readiness.label}
      </Text>
    </View>
  );
}
