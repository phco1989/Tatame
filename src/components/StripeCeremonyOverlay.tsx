/**
 * StripeCeremonyOverlay
 *
 * Full-screen stripe ceremony — spotlight effect, pulse glow on avatar,
 * then haptic + transaction + celebration animation.
 *
 * Props:
 *   visible        — show overlay
 *   studentName    — name displayed under spotlight
 *   beltRank       — drives glow/spotlight color
 *   phase          — "spotlight" | "done"
 *   onReady        — called after ~1.4s spotlight, triggers actual award
 */

import React, { useEffect, useCallback } from "react";
import { View, Text, Pressable } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withRepeat,
  withDelay,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { beltColor, BELT_LABELS } from "@/lib/belt";
import type { BeltRank } from "@/lib/belt";

export type CeremonyPhase = "spotlight" | "done";

interface StripeCeremonyOverlayProps {
  visible: boolean;
  studentName: string;
  beltRank: BeltRank;
  phase: CeremonyPhase;
  onReady: () => void;  // after spotlight → trigger real write
  onClose: () => void;  // after ceremony done
}

const SPOTLIGHT_DURATION = 1400;

export function StripeCeremonyOverlay({
  visible,
  studentName,
  beltRank,
  phase,
  onReady,
  onClose,
}: StripeCeremonyOverlayProps) {
  const color = beltColor(beltRank);

  // Overlay opacity
  const overlayOpacity = useSharedValue(0);
  // Spotlight scale
  const spotlightScale = useSharedValue(0.4);
  // Glow pulse
  const glowScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.6);
  // Text opacity
  const textOpacity = useSharedValue(0);

  const triggerHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }, []);

  useEffect(() => {
    if (!visible) {
      overlayOpacity.value = withTiming(0, { duration: 300 });
      return;
    }

    // Phase 1: fade in overlay
    overlayOpacity.value = withTiming(1, { duration: 250, easing: Easing.out(Easing.quad) });

    // Phase 2: expand spotlight
    spotlightScale.value = withTiming(1, {
      duration: 600,
      easing: Easing.out(Easing.back(1.2)),
    });

    // Phase 3: pulse glow
    glowScale.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: 400, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.0, { duration: 400, easing: Easing.inOut(Easing.sin) })
      ),
      3,
      false
    );

    // Phase 4: show text
    textOpacity.value = withDelay(300, withTiming(1, { duration: 350 }));

    // Phase 5: after spotlight duration, fire haptic + onReady
    const timer = setTimeout(() => {
      runOnJS(triggerHaptic)();
      runOnJS(onReady)();
    }, SPOTLIGHT_DURATION);

    return () => clearTimeout(timer);
  }, [visible, beltRank]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const spotlightStyle = useAnimatedStyle(() => ({
    transform: [{ scale: spotlightScale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowScale.value }],
    opacity: glowOpacity.value,
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [{ translateY: (1 - textOpacity.value) * 10 }],
  }));

  if (!visible) return null;

  const beltLabel = BELT_LABELS[beltRank] ?? beltRank;

  return (
    <Animated.View
      style={[
        overlayStyle,
        {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(5,8,16,0.96)",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
        },
      ]}
    >
      {/* Outer glow ring */}
      <Animated.View
        style={[
          glowStyle,
          {
            position: "absolute",
            width: 220,
            height: 220,
            borderRadius: 110,
            backgroundColor: color + "15",
            borderWidth: 1,
            borderColor: color + "30",
          },
        ]}
      />

      {/* Spotlight circle */}
      <Animated.View
        style={[
          spotlightStyle,
          {
            width: 140,
            height: 140,
            borderRadius: 70,
            backgroundColor: color + "22",
            borderWidth: 2,
            borderColor: color + "70",
            alignItems: "center",
            justifyContent: "center",
            shadowColor: color,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.9,
            shadowRadius: 32,
            elevation: 20,
          },
        ]}
      >
        {/* Initial */}
        <Text
          style={{
            color,
            fontSize: 52,
            fontWeight: "800",
            letterSpacing: -1,
          }}
        >
          {studentName.charAt(0).toUpperCase()}
        </Text>
      </Animated.View>

      {/* Text */}
      <Animated.View style={[textStyle, { alignItems: "center", marginTop: 32 }]}>
        <Text
          style={{
            color: "rgba(255,255,255,0.45)",
            fontSize: 11,
            fontWeight: "600",
            letterSpacing: 3,
            textTransform: "uppercase",
            marginBottom: 6,
          }}
        >
          {beltLabel} Belt
        </Text>
        <Text
          style={{
            color: "#FFFFFF",
            fontSize: 22,
            fontWeight: "700",
            letterSpacing: -0.5,
          }}
        >
          {studentName}
        </Text>
        <Text
          style={{
            color: color,
            fontSize: 13,
            fontWeight: "600",
            marginTop: 10,
            letterSpacing: 0.5,
          }}
        >
          Stripe Ceremony
        </Text>
      </Animated.View>

      {/* Tap to skip */}
      <Pressable
        onPress={onClose}
        style={{
          position: "absolute",
          bottom: 60,
          paddingVertical: 10,
          paddingHorizontal: 24,
        }}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Text
          style={{
            color: "rgba(255,255,255,0.25)",
            fontSize: 12,
            letterSpacing: 0.5,
          }}
        >
          tap to skip
        </Text>
      </Pressable>
    </Animated.View>
  );
}
