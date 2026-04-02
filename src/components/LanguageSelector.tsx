import React, { useState } from "react";
import { View, Text, Pressable, Modal } from "react-native";
import { Globe, Check, ChevronRight, RefreshCw } from "lucide-react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import {
  useLanguageStore,
  useTranslations,
  type Locale,
  LOCALE_NAMES,
  LOCALE_FLAGS,
  SUPPORTED_LOCALES,
} from "@/lib/i18n";
import { TATAME } from "@/lib/design";

export function LanguageSelector() {
  const t = useTranslations();
  const locale = useLanguageStore((s) => s.locale);
  const isAutoDetected = useLanguageStore((s) => s.isAutoDetected);
  const setLocale = useLanguageStore((s) => s.setLocale);
  const resetToDeviceLocale = useLanguageStore((s) => s.resetToDeviceLocale);

  const [showModal, setShowModal] = useState(false);

  const handleSelectLocale = (newLocale: Locale) => {
    setLocale(newLocale);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowModal(false);
  };

  const handleResetToDevice = () => {
    resetToDeviceLocale();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowModal(false);
  };

  return (
    <>
      {/* Language Button */}
      <Pressable
        onPress={() => {
          setShowModal(true);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          padding: 16,
          borderBottomWidth: 1,
          borderBottomColor: TATAME.cardBorder,
          backgroundColor: pressed ? TATAME.bgElevated : "transparent",
        })}
      >
        <View className="bg-ocean/10 rounded-full p-2 mr-4">
          <Globe size={22} color="#0070B8" />
        </View>
        <View className="flex-1">
          <Text className="font-medium" style={{ fontFamily: "Outfit_500Medium", color: TATAME.text }}>
            {t.common.language}
          </Text>
          <Text className="text-sm" style={{ fontFamily: "Outfit_400Regular", color: TATAME.textMuted }}>
            {LOCALE_FLAGS[locale]} {LOCALE_NAMES[locale]}
            {isAutoDetected && " (Auto)"}
          </Text>
        </View>
        <ChevronRight size={20} color="#9CA3AF" />
      </Pressable>

      {/* Language Selection Modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View className="flex-1 bg-black/50 justify-end">
          <Animated.View
            entering={FadeIn}
            className="bg-white rounded-t-3xl p-6 pb-10"
          >
            <Text className="text-xl font-bold text-gray-900 mb-2" style={{ fontFamily: "Poppins_600SemiBold" }}>
              {t.profile.selectLanguage}
            </Text>
            <Text className="text-gray-500 mb-6" style={{ fontFamily: "Outfit_400Regular" }}>
              {t.profile.chooseLanguage}
            </Text>

            {/* Language Options */}
            {SUPPORTED_LOCALES.map((loc, index) => (
              <Animated.View key={loc} entering={FadeInDown.delay(index * 50).springify()}>
                <Pressable
                  onPress={() => handleSelectLocale(loc)}
                  className={`flex-row items-center p-4 mb-2 rounded-xl border ${
                    locale === loc ? "border-ocean bg-ocean/5" : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <Text className="text-2xl mr-3">{LOCALE_FLAGS[loc]}</Text>
                  <Text
                    className={`flex-1 text-base ${locale === loc ? "text-ocean font-semibold" : "text-gray-700"}`}
                    style={{ fontFamily: locale === loc ? "Outfit_600SemiBold" : "Outfit_400Regular" }}
                  >
                    {LOCALE_NAMES[loc]}
                  </Text>
                  {locale === loc && <Check size={20} color="#0070B8" />}
                </Pressable>
              </Animated.View>
            ))}

            {/* Auto-detect button */}
            <Pressable
              onPress={handleResetToDevice}
              className="flex-row items-center justify-center p-4 mt-4 rounded-xl border border-gray-200"
            >
              <RefreshCw size={18} color="#6B7280" />
              <Text className="text-gray-600 ml-2" style={{ fontFamily: "Outfit_500Medium" }}>
                {t.profile.useDeviceLanguage}
              </Text>
            </Pressable>

            {/* Close button */}
            <Pressable
              onPress={() => setShowModal(false)}
              className="mt-4 py-4"
            >
              <Text className="text-gray-500 text-center" style={{ fontFamily: "Outfit_500Medium" }}>
                {t.common.cancel}
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

