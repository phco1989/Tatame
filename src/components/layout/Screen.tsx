import React from "react";
import { View, ScrollView, StyleSheet, StatusBar, ViewStyle, StyleProp } from "react-native";
import { SafeAreaView, Edge } from "react-native-safe-area-context";

interface ScreenProps {
  children: React.ReactNode;
  /** Enable scrolling (default: true) */
  scroll?: boolean;
  /** Disable scrolling - shorthand for scroll={false} */
  noScroll?: boolean;
  /** Background color (default: #0B1220 - Tatame dark bg) */
  backgroundColor?: string;
  /** Container style */
  style?: StyleProp<ViewStyle>;
  /** ScrollView content container style */
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Safe area edges to respect (default: ["top"]) */
  edges?: Edge[];
  /** Status bar style (default: "dark-content") */
  statusBarStyle?: "light-content" | "dark-content";
  /** Hide status bar */
  hideStatusBar?: boolean;
}

/**
 * Screen - A reusable wrapper component for consistent safe-area layout across all screens.
 *
 * Usage:
 * <Screen>...</Screen>                    // Scrollable content with safe area
 * <Screen noScroll>...</Screen>           // Non-scrollable (for screens with own scroll)
 * <Screen scroll={false}>...</Screen>     // Same as noScroll
 * <Screen edges={["top", "bottom"]}>      // Custom safe area edges
 */
export function Screen({
  children,
  scroll = true,
  noScroll = false,
  backgroundColor = "#0B1220",
  style,
  contentContainerStyle,
  edges = ["top"],
  statusBarStyle = "light-content",
  hideStatusBar = false,
}: ScreenProps) {
  const shouldScroll = scroll && !noScroll;

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <StatusBar
        barStyle={statusBarStyle}
        backgroundColor="transparent"
        translucent
        hidden={hideStatusBar}
      />
      <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={edges}>
        {shouldScroll ? (
          <ScrollView
            style={[styles.scrollView, style]}
            contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.content, style]}>{children}</View>
        )}
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
    flexGrow: 1,
  },
  content: {
    flex: 1,
  },
});

export default Screen;
