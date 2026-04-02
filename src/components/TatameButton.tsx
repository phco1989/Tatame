/**
 * TatameButton — PrimaryButton + SecondaryButton
 * Single source of truth for all CTA buttons across the app.
 */

import React from "react";
import {
  Pressable,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

// ─── Shared config ────────────────────────────────────────────────────────────

const BTN_HEIGHT = 52;
const BTN_RADIUS = 16;
const LETTER_SPACING = 0.3;

// ─── PrimaryButton ────────────────────────────────────────────────────────────

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  /** accent color — defaults to Tatame blue #4C7BF4 */
  color?: string;
  icon?: React.ReactNode;
}

export function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  style,
  textStyle,
  color = "#4C7BF4",
  icon,
}: PrimaryButtonProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    if (disabled || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    scale.value = withSpring(0.97, { damping: 15, stiffness: 400 }, () => {
      scale.value = withSpring(1, { damping: 15 });
    });
    onPress();
  };

  const isInactive = disabled || loading;

  return (
    <Animated.View style={[animStyle, { opacity: isInactive ? 0.55 : 1 }]}>
      <Pressable
        onPress={handlePress}
        disabled={isInactive}
        style={[
          styles.primary,
          { backgroundColor: color, borderRadius: BTN_RADIUS, height: BTN_HEIGHT },
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <>
            {icon}
            <Text
              style={[
                styles.primaryText,
                icon ? { marginLeft: 8 } : {},
                textStyle,
              ]}
            >
              {label}
            </Text>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ─── SecondaryButton ──────────────────────────────────────────────────────────

interface SecondaryButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
}

export function SecondaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  style,
  textStyle,
  icon,
}: SecondaryButtonProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    if (disabled || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scale.value = withSpring(0.97, { damping: 15, stiffness: 400 }, () => {
      scale.value = withSpring(1, { damping: 15 });
    });
    onPress();
  };

  const isInactive = disabled || loading;

  return (
    <Animated.View style={[animStyle, { opacity: isInactive ? 0.55 : 1 }]}>
      <Pressable
        onPress={handlePress}
        disabled={isInactive}
        style={[
          styles.secondary,
          { borderRadius: BTN_RADIUS, height: BTN_HEIGHT },
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator color="rgba(255,255,255,0.7)" size="small" />
        ) : (
          <>
            {icon}
            <Text
              style={[
                styles.secondaryText,
                icon ? { marginLeft: 8 } : {},
                textStyle,
              ]}
            >
              {label}
            </Text>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  primary: {
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 6,
  },
  primaryText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: LETTER_SPACING,
  },
  secondary: {
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    backgroundColor: "#1F2937",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  secondaryText: {
    color: "rgba(255,255,255,0.80)",
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: LETTER_SPACING,
  },
});
