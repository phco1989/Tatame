/**
 * MomentumRing
 *
 * Animated circular ring showing the smart belt score as a fill arc.
 * Used in Profile screen and Belt card as a premium visual element.
 */

import React, { useEffect } from "react";
import { View, Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import type { BeltRank } from "@/lib/belt";
import { beltColor } from "@/lib/belt";

interface MomentumRingProps {
  score: number;        // 0–100
  beltRank: BeltRank;
  size?: number;        // outer diameter, default 80
  strokeWidth?: number;
  /** Show score number in center */
  showScore?: boolean;
  animate?: boolean;
}

export function MomentumRing({
  score,
  beltRank,
  size = 80,
  strokeWidth = 6,
  showScore = true,
  animate = true,
}: MomentumRingProps) {
  const color = beltColor(beltRank);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  // 0 = full circle, circumference = empty
  const targetOffset = circumference - (score / 100) * circumference;

  const progressOffset = useSharedValue(circumference);
  const glowOpacity = useSharedValue(0.4);

  useEffect(() => {
    progressOffset.value = withTiming(targetOffset, {
      duration: animate ? 1000 : 0,
      easing: Easing.out(Easing.cubic),
    });

    // Subtle pulse glow
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.9, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.4, { duration: 1800, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );
  }, [score, beltRank]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  // Score color
  let scoreColor = "#60A5FA"; // blue = early
  if (score >= 85) scoreColor = "#10B981"; // green = ready
  else if (score >= 60) scoreColor = "#FBBF24"; // gold = developing

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {/* Glow halo */}
      <Animated.View
        style={[
          glowStyle,
          {
            position: "absolute",
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color + "18",
          },
        ]}
      />

      <Svg width={size} height={size}>
        {/* Track ring */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc — rotated so it starts at top */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={targetOffset}
          transform={`rotate(-90 ${center} ${center})`}
          opacity={0.9}
        />
      </Svg>

      {/* Center score */}
      {showScore && (
        <View
          style={{
            position: "absolute",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: scoreColor,
              fontSize: size * 0.22,
              fontWeight: "800",
              letterSpacing: -0.5,
            }}
          >
            {score}
          </Text>
          <Text
            style={{
              color: "rgba(255,255,255,0.35)",
              fontSize: size * 0.1,
              fontWeight: "600",
              letterSpacing: 0.5,
            }}
          >
            SCORE
          </Text>
        </View>
      )}
    </View>
  );
}
