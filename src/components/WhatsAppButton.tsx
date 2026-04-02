import React from "react";
import { Pressable, Text, View, ActivityIndicator } from "react-native";
import { MessageCircle } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { cn } from "@/lib/cn";
import { openWhatsApp, WhatsAppMessages, type WhatsAppActionType } from "@/lib/whatsapp";
import { useReviewRequestStore } from "@/lib/state/review-request-store";
import { useTenantStore, selectTenantId } from "@/lib/state/tenant-store";
import { useAuthStore } from "@/lib/state/auth-store";
import type { UserRole } from "@/types";

interface WhatsAppButtonProps {
  phone: string | undefined;
  label: string;
  message?: string;
  variant?: "primary" | "secondary" | "outline";
  size?: "small" | "medium" | "large";
  actionType: WhatsAppActionType;
  lessonId?: string;
  className?: string;
  disabled?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function WhatsAppButton({
  phone,
  label,
  message,
  variant = "primary",
  size = "medium",
  actionType,
  lessonId,
  className,
  disabled = false,
}: WhatsAppButtonProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const scale = useSharedValue(1);

  const tenantId = useTenantStore(selectTenantId);
  const user = useAuthStore((s) => s.user);
  const trackEvent = useReviewRequestStore((s) => s.trackEvent);

  const getTargetType = (): "academy" | "coach" | "student" => {
    switch (actionType) {
      case "student_to_school":
        return "academy";
      case "student_to_instructor":
        return "coach";
      default:
        return "student";
    }
  };

  const handlePress = async () => {
    if (disabled || isLoading) return;

    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Track analytics event
    if (user) {
      trackEvent(
        "whatsapp_click",
        tenantId,
        user.id,
        user.role as UserRole,
        lessonId,
        getTargetType(),
        { actionType }
      );
    }

    const success = await openWhatsApp(phone, message);

    if (!success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }

    setIsLoading(false);
  };

  const handlePressIn = () => {
    scale.value = withSpring(0.95, { damping: 15, stiffness: 400 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const variantStyles = {
    primary: {
      container: "bg-[#25D366]",
      text: "text-white",
      icon: "#FFFFFF",
    },
    secondary: {
      container: "bg-[#128C7E]",
      text: "text-white",
      icon: "#FFFFFF",
    },
    outline: {
      container: "bg-transparent border-2 border-[#25D366]",
      text: "text-[#25D366]",
      icon: "#25D366",
    },
  };

  const sizeStyles = {
    small: {
      container: "px-3 py-2 rounded-lg",
      text: "text-sm",
      icon: 16,
      gap: "gap-1.5",
    },
    medium: {
      container: "px-4 py-3 rounded-xl",
      text: "text-base",
      icon: 20,
      gap: "gap-2",
    },
    large: {
      container: "px-5 py-4 rounded-2xl",
      text: "text-lg",
      icon: 24,
      gap: "gap-2.5",
    },
  };

  const styles = variantStyles[variant];
  const sizes = sizeStyles[size];
  const isDisabled = disabled || !phone;

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled || isLoading}
      style={animatedStyle}
    >
      <Animated.View
        entering={FadeIn.duration(300)}
        className={cn(
          "flex-row items-center justify-center",
          styles.container,
          sizes.container,
          sizes.gap,
          isDisabled && "opacity-50",
          className
        )}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={styles.icon} />
        ) : (
          <MessageCircle size={sizes.icon} color={styles.icon} />
        )}
        <Text
          className={cn(
            "font-semibold",
            styles.text,
            sizes.text
          )}
        >
          {label}
        </Text>
      </Animated.View>
    </AnimatedPressable>
  );
}

// Pre-configured WhatsApp buttons for specific use cases

interface StudentToSchoolButtonProps {
  schoolPhone: string | undefined;
  studentName?: string;
  className?: string;
}

export function StudentToSchoolButton({ schoolPhone, studentName, className }: StudentToSchoolButtonProps) {
  return (
    <WhatsAppButton
      phone={schoolPhone}
      label="Chat with School on WhatsApp"
      message={WhatsAppMessages.studentToSchool(studentName)}
      variant="primary"
      actionType="student_to_school"
      className={className}
    />
  );
}

interface StudentToInstructorButtonProps {
  coachPhone: string | undefined;
  studentName?: string;
  coachName?: string;
  lessonId?: string;
  className?: string;
}

export function StudentToInstructorButton({
  coachPhone,
  studentName,
  coachName,
  lessonId,
  className,
}: StudentToInstructorButtonProps) {
  return (
    <WhatsAppButton
      phone={coachPhone}
      label="Chat with Instructor on WhatsApp"
      message={WhatsAppMessages.studentToInstructor(studentName, coachName)}
      variant="secondary"
      actionType="student_to_instructor"
      lessonId={lessonId}
      className={className}
    />
  );
}

interface CoachToStudentButtonProps {
  studentPhone: string | undefined;
  studentName?: string;
  coachName?: string;
  lessonId?: string;
  className?: string;
}

export function CoachToStudentButton({
  studentPhone,
  studentName,
  coachName,
  lessonId,
  className,
}: CoachToStudentButtonProps) {
  return (
    <WhatsAppButton
      phone={studentPhone}
      label="Message Student on WhatsApp"
      message={WhatsAppMessages.coachToStudent(studentName, coachName)}
      variant="primary"
      actionType="coach_to_student"
      lessonId={lessonId}
      className={className}
    />
  );
}

interface ManagerToStudentButtonProps {
  studentPhone: string | undefined;
  studentName?: string;
  schoolName?: string;
  lessonId?: string;
  className?: string;
}

export function ManagerToStudentButton({
  studentPhone,
  studentName,
  schoolName,
  lessonId,
  className,
}: ManagerToStudentButtonProps) {
  return (
    <WhatsAppButton
      phone={studentPhone}
      label="Contact Student on WhatsApp"
      message={WhatsAppMessages.managerToStudent(studentName, schoolName)}
      variant="primary"
      actionType="manager_to_student"
      lessonId={lessonId}
      className={className}
    />
  );
}

// Keep AdminToStudentButton as alias for backwards compatibility
export const AdminToStudentButton = ManagerToStudentButton;

