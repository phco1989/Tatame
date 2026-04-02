/**
 * BeltCelebration — "Stripe Moment" overlay animation.
 *
 * Shows a glow-pulse + sparkle overlay for ~1.2s when a stripe or belt
 * is awarded. Parent passes `visible` + `type` ("stripe" | "belt").
 * The overlay auto-dismisses after the animation completes.
 */

import React, { useEffect } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withSpring,
  withDelay,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import { beltColor } from "@/lib/belt";
import type { BeltRank } from "@/lib/belt";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// ─── Sparkle dot ─────────────────────────────────────────────────────────────

interface SparkleProps {
  x: number;
  y: number;
  delay: number;
  color: string;
  size: number;
}

function Sparkle({ x, y, delay, color, size }: SparkleProps) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0);
  const translateY = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withSequence(
        withTiming(1, { duration: 200 }),
        withDelay(400, withTiming(0, { duration: 300 }))
      )
    );
    scale.value = withDelay(
      delay,
      withSequence(
        withSpring(1, { damping: 8, stiffness: 300 }),
        withDelay(400, withTiming(0, { duration: 300 }))
      )
    );
    translateY.value = withDelay(
      delay,
      withTiming(-40, { duration: 900, easing: Easing.out(Easing.quad) })
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { translateY: translateY.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: x,
          top: y,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

// ─── Main celebration overlay ─────────────────────────────────────────────────

interface BeltCelebrationProps {
  visible: boolean;
  type: "stripe" | "belt";
  beltRank?: BeltRank | string | null;
  label?: string;
  onDone?: () => void;
}

const SPARKLE_COLORS = ["#FBBF24", "#FCD34D", "#FDE68A", "#FFFFFF", "#FCA5A5"];

function randomSparkles(count: number, glowColor: string) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * SCREEN_WIDTH * 0.8 + SCREEN_WIDTH * 0.1,
    y: Math.random() * SCREEN_HEIGHT * 0.5 + SCREEN_HEIGHT * 0.1,
    delay: Math.random() * 300,
    color: i % 3 === 0 ? glowColor : SPARKLE_COLORS[i % SPARKLE_COLORS.length],
    size: 6 + Math.random() * 8,
  }));
}

export function BeltCelebration({
  visible,
  type,
  beltRank,
  label,
  onDone,
}: BeltCelebrationProps) {
  const glowColor = beltColor(beltRank);
  const opacity = useSharedValue(0);
  const glowScale = useSharedValue(0.6);
  const textScale = useSharedValue(0);
  const sparkles = React.useMemo(() => randomSparkles(18, glowColor), [glowColor]);

  useEffect(() => {
    if (!visible) {
      opacity.value = 0;
      glowScale.value = 0.6;
      textScale.value = 0;
      return;
    }

    // Fade in overlay
    opacity.value = withTiming(1, { duration: 200 });

    // Glow pulse
    glowScale.value = withSequence(
      withSpring(1.2, { damping: 6, stiffness: 200 }),
      withDelay(600, withTiming(0.6, { duration: 400 }))
    );

    // Text pop
    textScale.value = withDelay(
      100,
      withSpring(1, { damping: 10, stiffness: 300 })
    );

    // Auto-dismiss after 1.2s
    const timer = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 300 });
      if (onDone) {
        setTimeout(onDone, 300);
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [visible]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowScale.value }],
  }));

  const textStyle = useAnimatedStyle(() => ({
    transform: [{ scale: textScale.value }],
  }));

  if (!visible) return null;

  const isPromotion = type === "belt";
  const emoji = isPromotion ? "🥋" : "⭐";
  const displayLabel =
    label ||
    (isPromotion ? "Belt Promoted!" : "Stripe Awarded!");

  return (
    <Animated.View
      style={[StyleSheet.absoluteFillObject, styles.overlay, overlayStyle]}
      pointerEvents="none"
    >
      {/* Sparkles */}
      {sparkles.map((s) => (
        <Sparkle key={s.id} {...s} />
      ))}

      {/* Center glow */}
      <View style={styles.center}>
        <Animated.View
          style={[
            styles.glowCircle,
            { backgroundColor: glowColor + "30", shadowColor: glowColor },
            glowStyle,
          ]}
        />
        <Animated.View style={textStyle}>
          <Text style={styles.emoji}>{emoji}</Text>
          <Text style={[styles.label, { color: glowColor }]}>{displayLabel}</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    zIndex: 9999,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  glowCircle: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 40,
    elevation: 20,
  },
  emoji: {
    fontSize: 56,
    textAlign: "center",
    marginBottom: 12,
  },
  label: {
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: 0.5,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
});
