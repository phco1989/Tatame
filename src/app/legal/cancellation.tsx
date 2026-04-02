import React from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

export default function CancellationPolicyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

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
          <Text className="text-3xl font-bold text-gray-900 mb-2" style={{ fontFamily: "Poppins_700Bold" }}>
            Cancellation & Refund Policy
          </Text>
          <Text className="text-gray-500 mb-6" style={{ fontFamily: "Outfit_400Regular" }}>
            Please review our cancellation terms
          </Text>

          <View className="space-y-6 pb-12">
            <Section title="Cancellation by Customer">
              <Text className="text-gray-700 leading-6" style={{ fontFamily: "Outfit_400Regular" }}>
                <Text className="font-semibold">24+ hours before lesson:</Text>{"\n"}
                Full refund or free rescheduling available.{"\n\n"}
                <Text className="font-semibold">12-24 hours before lesson:</Text>{"\n"}
                50% refund or free rescheduling with 50% credit toward next lesson.{"\n\n"}
                <Text className="font-semibold">Less than 12 hours before lesson:</Text>{"\n"}
                No refund available. Rescheduling may be offered at our discretion.{"\n\n"}
                <Text className="font-semibold">No-show:</Text>{"\n"}
                No refund. The full lesson fee will be charged.
              </Text>
            </Section>

            <Section title="Cancellation by Tatame">
              <Text className="text-gray-700 leading-6" style={{ fontFamily: "Outfit_400Regular" }}>
                We may cancel lessons due to:{"\n\n"}
                - Facility unavailability or closures{"\n"}
                - Severe weather (lightning, storms){"\n"}
                - Instructor emergency{"\n"}
                - Other unforeseen circumstances{"\n\n"}
                In all cases of cancellation by Tatame, you will receive a full refund or free rescheduling at your preference.
              </Text>
            </Section>

            <Section title="Rescheduling">
              <Text className="text-gray-700 leading-6" style={{ fontFamily: "Outfit_400Regular" }}>
                To reschedule your lesson:{"\n\n"}
                - Contact us through the app chat at least 24 hours before your lesson{"\n"}
                - Rescheduled lessons are subject to availability{"\n"}
                - Lesson credits must be used within 90 days{"\n"}
                - Package lessons follow the same rescheduling policy
              </Text>
            </Section>

            <Section title="Refund Processing">
              <Text className="text-gray-700 leading-6" style={{ fontFamily: "Outfit_400Regular" }}>
                Approved refunds will be processed within 5-7 business days:{"\n\n"}
                - Refunds will be issued to the original payment method{"\n"}
                - Bank processing times may vary{"\n"}
                - For cash payments, refunds will be issued via check or in-person
              </Text>
            </Section>

            <Section title="Package Lessons">
              <Text className="text-gray-700 leading-6" style={{ fontFamily: "Outfit_400Regular" }}>
                Lesson packages have the following terms:{"\n\n"}
                - Individual lessons within a package follow standard cancellation policy{"\n"}
                - Full package refunds are available within 7 days of purchase if no lessons have been used{"\n"}
                - Partial package refunds (for unused lessons) are not available{"\n"}
                - Package credits expire 6 months from purchase date
              </Text>
            </Section>

            <Section title="How to Cancel">
              <Text className="text-gray-700 leading-6" style={{ fontFamily: "Outfit_400Regular" }}>
                To cancel a lesson:{"\n\n"}
                1. Open the app and go to "My Lessons"{"\n"}
                2. Select the lesson you wish to cancel{"\n"}
                3. Use the chat feature to request cancellation{"\n\n"}
                Or contact us directly through the Chat tab in the app.
              </Text>
            </Section>

            <Section title="Contact Us">
              <Text className="text-gray-700 leading-6" style={{ fontFamily: "Outfit_400Regular" }}>
                For questions about our cancellation policy or to request a refund, please contact us through the app's chat feature. We aim to respond within 24 hours.
              </Text>
            </Section>
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mb-6">
      <Text className="text-lg font-bold text-gray-900 mb-3" style={{ fontFamily: "Poppins_600SemiBold" }}>
        {title}
      </Text>
      {children}
    </View>
  );
}
