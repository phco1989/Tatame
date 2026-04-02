import React from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useLanguageStore } from "@/lib/i18n";
import { PRIVACY_POLICY, getLocalizedLegalContent } from "@/lib/legal/global-legal";
import Markdown from "react-native-markdown-display";

export default function PrivacyPolicyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const locale = useLanguageStore((s) => s.locale);

  const { title, content, lastUpdated } = getLocalizedLegalContent(PRIVACY_POLICY, locale);

  const markdownStyles = {
    body: {
      fontFamily: "Outfit_400Regular",
      color: "#374151",
      fontSize: 15,
      lineHeight: 24,
    },
    heading1: {
      fontFamily: "Poppins_700Bold",
      color: "#111827",
      fontSize: 28,
      marginBottom: 8,
      marginTop: 0,
    },
    heading2: {
      fontFamily: "Poppins_600SemiBold",
      color: "#111827",
      fontSize: 18,
      marginTop: 24,
      marginBottom: 12,
    },
    heading3: {
      fontFamily: "Outfit_600SemiBold",
      color: "#374151",
      fontSize: 16,
      marginTop: 16,
      marginBottom: 8,
    },
    paragraph: {
      marginBottom: 12,
    },
    strong: {
      fontFamily: "Outfit_600SemiBold",
      fontWeight: "600" as const,
    },
    list_item: {
      marginBottom: 6,
    },
    bullet_list: {
      marginLeft: 8,
    },
    hr: {
      backgroundColor: "#E5E7EB",
      height: 1,
      marginVertical: 24,
    },
  };

  return (
    <View className="flex-1 bg-white" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-gray-100">
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          className="flex-row items-center py-2 pr-4 active:opacity-70"
        >
          <ChevronLeft size={24} color="#0070B8" />
          <Text className="text-ocean text-base ml-1" style={{ fontFamily: "Outfit_500Medium" }}>
            Back
          </Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1 px-6 pt-6" showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.springify()}>
          <Text className="text-gray-500 mb-6" style={{ fontFamily: "Outfit_400Regular" }}>
            Last updated: {lastUpdated}
          </Text>

          <Markdown style={markdownStyles}>{content}</Markdown>

          <View className="h-12" />
        </Animated.View>
      </ScrollView>
    </View>
  );
}
