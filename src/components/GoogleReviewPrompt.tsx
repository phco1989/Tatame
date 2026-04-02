import React from "react";
import { View, Text, Pressable, Modal, Linking, Alert } from "react-native";
import { Star, X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeIn,
  FadeOut,
  SlideInUp,
  SlideOutDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
  withRepeat,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useReviewRequestStore } from "@/lib/state/review-request-store";
import { useTenantStore, selectGoogleReviewUrl, selectTenantId, selectSchoolName } from "@/lib/state/tenant-store";
import { useAuthStore } from "@/lib/state/auth-store";
import type { UserRole } from "@/types";

interface GoogleReviewPromptProps {
  visible: boolean;
  lessonId: string;
  studentId: string;
  onClose: () => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function GoogleReviewPrompt({ visible, lessonId, studentId, onClose }: GoogleReviewPromptProps) {
  const googleReviewUrl = useTenantStore(selectGoogleReviewUrl);
  const tenantId = useTenantStore(selectTenantId);
  const schoolName = useTenantStore(selectSchoolName);
  const user = useAuthStore((s) => s.user);

  const markAsShown = useReviewRequestStore((s) => s.markAsShown);
  const markAsClicked = useReviewRequestStore((s) => s.markAsClicked);
  const markAsDismissed = useReviewRequestStore((s) => s.markAsDismissed);
  const trackEvent = useReviewRequestStore((s) => s.trackEvent);

  const buttonScale = useSharedValue(1);
  const starRotation = useSharedValue(0);

  // Animate stars on mount
  React.useEffect(() => {
    if (visible) {
      starRotation.value = withRepeat(
        withSequence(
          withSpring(5, { damping: 2 }),
          withSpring(-5, { damping: 2 }),
          withSpring(0, { damping: 5 })
        ),
        2,
        false
      );

      // Mark as shown when modal becomes visible
      markAsShown(lessonId, studentId);

      // Track analytics
      if (user) {
        trackEvent(
          "review_prompt_shown",
          tenantId,
          user.id,
          user.role as UserRole,
          lessonId
        );
      }
    }
  }, [visible]);

  const starAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${starRotation.value}deg` }],
  }));

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const handleReviewPress = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    buttonScale.value = withSpring(0.95, { damping: 15 });

    setTimeout(() => {
      buttonScale.value = withSpring(1, { damping: 15 });
    }, 100);

    // Mark as clicked
    markAsClicked(lessonId, studentId);

    // Track analytics
    if (user) {
      trackEvent(
        "review_click",
        tenantId,
        user.id,
        user.role as UserRole,
        lessonId
      );
    }

    // Open Google Review URL
    if (googleReviewUrl) {
      try {
        const canOpen = await Linking.canOpenURL(googleReviewUrl);
        if (canOpen) {
          await Linking.openURL(googleReviewUrl);
        } else {
          Alert.alert("Error", "Could not open the review link. Please try again later.");
        }
      } catch (error) {
        console.error("Error opening Google Review URL:", error);
        Alert.alert("Error", "Could not open the review link. Please try again later.");
      }
    }

    onClose();
  };

  const handleDismiss = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Mark as dismissed
    markAsDismissed(lessonId, studentId);

    // Track analytics
    if (user) {
      trackEvent(
        "review_dismiss",
        tenantId,
        user.id,
        user.role as UserRole,
        lessonId
      );
    }

    onClose();
  };

  const hasValidReviewUrl = googleReviewUrl && googleReviewUrl.trim().length > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleDismiss}
    >
      <Animated.View
        entering={FadeIn.duration(300)}
        exiting={FadeOut.duration(200)}
        className="flex-1 bg-black/60 justify-center items-center px-6"
      >
        <Animated.View
          entering={SlideInUp.springify().damping(18).stiffness(200)}
          exiting={SlideOutDown.duration(200)}
          className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl"
        >
          {/* Header with gradient */}
          <LinearGradient
            colors={["#0070B8", "#30A8F0"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ paddingTop: 32, paddingBottom: 24, paddingHorizontal: 24 }}
          >
            {/* Close button */}
            <Pressable
              onPress={handleDismiss}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 items-center justify-center"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={18} color="#FFFFFF" />
            </Pressable>

            {/* Stars animation */}
            <Animated.View style={starAnimatedStyle} className="items-center mb-4">
              <View className="flex-row gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star
                    key={i}
                    size={28}
                    color="#FFD700"
                    fill="#FFD700"
                  />
                ))}
              </View>
            </Animated.View>

            <Text className="text-white text-2xl font-bold text-center">
              Your feedback helps us grow
            </Text>
          </LinearGradient>

          {/* Content */}
          <View className="px-6 py-6">
            <Text className="text-gray-600 text-base text-center leading-6 mb-6">
              If you enjoyed your lesson, leaving a quick Google review really helps our instructors and {schoolName || "school"}.
            </Text>

            {/* Review Button */}
            {hasValidReviewUrl ? (
              <AnimatedPressable
                onPress={handleReviewPress}
                style={buttonAnimatedStyle}
              >
                <LinearGradient
                  colors={["#FBBF24", "#F59E0B"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{
                    paddingVertical: 16,
                    paddingHorizontal: 24,
                    borderRadius: 16,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  <Star size={22} color="#FFFFFF" fill="#FFFFFF" />
                  <Text className="text-white text-lg font-bold">
                    Leave a Google Review
                  </Text>
                </LinearGradient>
              </AnimatedPressable>
            ) : (
              <View className="bg-gray-100 rounded-xl px-4 py-4">
                <Text className="text-gray-500 text-center text-sm">
                  Ask your school for the review link.
                </Text>
              </View>
            )}

            {/* Skip button */}
            <Pressable
              onPress={handleDismiss}
              className="mt-4 py-3"
              hitSlop={{ top: 10, bottom: 10 }}
            >
              <Text className="text-gray-400 text-center text-sm">
                Maybe later
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

