import React, { useState } from "react";
import { View, Text, Pressable, Modal } from "react-native";
import { Globe, Check } from "lucide-react-native";
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

interface LanguagePillProps {
  style?: object;
}

export function LanguagePill({ style }: LanguagePillProps) {
  const t = useTranslations();
  const locale = useLanguageStore((s) => s.locale);
  const setLocale = useLanguageStore((s) => s.setLocale);
  const [showModal, setShowModal] = useState(false);

  const handleSelectLocale = (newLocale: Locale) => {
    setLocale(newLocale);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowModal(false);
  };

  return (
    <>
      {/* Language Pill Button */}
      <Pressable
        onPress={() => {
          setShowModal(true);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        style={[
          {
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 20,
            backgroundColor: "rgba(255,255,255,0.15)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.25)",
          },
          style,
        ]}
      >
        <Globe size={16} color="white" strokeWidth={2} />
        <Text
          style={{
            color: "white",
            fontSize: 13,
            fontWeight: "600",
            marginLeft: 6,
            letterSpacing: 0.3,
          }}
        >
          {LOCALE_FLAGS[locale]} {locale.toUpperCase()}
        </Text>
      </Pressable>

      {/* Language Selection Modal */}
      <Modal visible={showModal} animationType="fade" transparent>
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.6)",
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
          }}
          onPress={() => setShowModal(false)}
        >
          <Animated.View
            entering={FadeIn.duration(200)}
            style={{
              backgroundColor: "#1a1a2e",
              borderRadius: 24,
              padding: 24,
              width: "100%",
              maxWidth: 320,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.1)",
            }}
          >
            <Text
              style={{
                color: "white",
                fontSize: 20,
                fontWeight: "700",
                marginBottom: 8,
                textAlign: "center",
              }}
            >
              {t.profile.selectLanguage}
            </Text>
            <Text
              style={{
                color: "rgba(255,255,255,0.6)",
                fontSize: 14,
                marginBottom: 20,
                textAlign: "center",
              }}
            >
              {t.profile.chooseLanguage}
            </Text>

            {/* Language Options */}
            {SUPPORTED_LOCALES.map((loc, index) => (
              <Animated.View
                key={loc}
                entering={FadeInDown.delay(index * 50).springify()}
              >
                <Pressable
                  onPress={() => handleSelectLocale(loc)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    padding: 16,
                    marginBottom: 8,
                    borderRadius: 16,
                    backgroundColor:
                      locale === loc
                        ? "rgba(255,255,255,0.15)"
                        : "rgba(255,255,255,0.05)",
                    borderWidth: 1,
                    borderColor:
                      locale === loc
                        ? "rgba(255,255,255,0.3)"
                        : "rgba(255,255,255,0.1)",
                  }}
                >
                  <Text style={{ fontSize: 24, marginRight: 12 }}>
                    {LOCALE_FLAGS[loc]}
                  </Text>
                  <Text
                    style={{
                      flex: 1,
                      color: "white",
                      fontSize: 16,
                      fontWeight: locale === loc ? "600" : "400",
                    }}
                  >
                    {LOCALE_NAMES[loc]}
                  </Text>
                  {locale === loc && <Check size={20} color="white" />}
                </Pressable>
              </Animated.View>
            ))}

            {/* Close button */}
            <Pressable
              onPress={() => setShowModal(false)}
              style={{
                marginTop: 8,
                paddingVertical: 12,
              }}
            >
              <Text
                style={{
                  color: "rgba(255,255,255,0.5)",
                  textAlign: "center",
                  fontSize: 14,
                  fontWeight: "500",
                }}
              >
                {t.common.cancel}
              </Text>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}
