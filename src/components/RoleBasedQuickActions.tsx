import React from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { TATAME } from "@/lib/design";
import { Calendar, Clock, MessageCircle, Shield, DollarSign, Ticket, Users } from "lucide-react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import type { UserRole } from "@/types";

interface QuickAction {
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ size: number; color: string }>;
  color: string;
  route: string;
}

interface RoleBasedQuickActionsProps {
  userRole: UserRole;
}

// Role-specific action configurations
const ROLE_ACTIONS: Record<UserRole, QuickAction[]> = {
  student: [
    {
      title: "Book Session",
      subtitle: "Reserve your spot",
      icon: Calendar,
      color: "#0891B2", // cyan
      route: "/book",
    },
    {
      title: "My Lessons",
      subtitle: "View history",
      icon: Clock,
      color: "#059669", // green
      route: "/lessons",
    },
  ],
  coach: [
    {
      title: "View Bookings",
      subtitle: "Manage schedule",
      icon: Calendar,
      color: "#0891B2", // cyan
      route: "/lessons",
    },
    {
      title: "Chat Inbox",
      subtitle: "Student messages",
      icon: MessageCircle,
      color: "#059669", // green
      route: "/chat",
    },
  ],
  manager: [
    {
      title: "Manager Panel",
      subtitle: "School Management",
      icon: Shield,
      color: "#7C3AED", // purple
      route: "/admin",
    },
    {
      title: "Finances",
      subtitle: "Revenue & trends",
      icon: DollarSign,
      color: "#059669", // green
      route: "/admin",
    },
    {
      title: "Invites",
      subtitle: "Generate codes",
      icon: Ticket,
      color: "#8B5CF6", // light purple
      route: "/admin",
    },
    {
      title: "Coaches",
      subtitle: "Manage team",
      icon: Users,
      color: "#0891B2", // cyan
      route: "/admin",
    },
  ],
};

// Individual Quick Action Card
function QuickActionCard({
  title,
  subtitle,
  icon: Icon,
  color,
  onPress,
  delay = 0,
}: {
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ size: number; color: string }>;
  color: string;
  onPress: () => void;
  delay?: number;
}) {
  return (
    <Animated.View entering={FadeInUp.delay(delay).springify()} className="flex-1">
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        className="rounded-2xl p-4 active:opacity-80"
        style={{
          borderRadius: 16,
          backgroundColor: TATAME.bgCard,
          borderWidth: 1,
          borderColor: TATAME.cardBorder,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.2,
          shadowRadius: 12,
          elevation: 3,
        }}
      >
        <View
          className="w-12 h-12 rounded-xl items-center justify-center mb-3"
          style={{ backgroundColor: `${color}15` }}
        >
          <Icon size={24} color={color} />
        </View>
        <Text
          className="font-semibold text-base"
          style={{ fontFamily: "Outfit_600SemiBold", color: TATAME.text }}
        >
          {title}
        </Text>
        <Text
          className="text-sm mt-1"
          style={{ fontFamily: "Outfit_400Regular", color: TATAME.textMuted }}
        >
          {subtitle}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export function RoleBasedQuickActions({ userRole }: RoleBasedQuickActionsProps) {
  const router = useRouter();
  const actions = ROLE_ACTIONS[userRole] || ROLE_ACTIONS.student;

  // For managers with 4 actions, use a 2x2 grid
  if (actions.length === 4) {
    return (
      <View>
        <View className="flex-row mb-3">
          <QuickActionCard
            title={actions[0].title}
            subtitle={actions[0].subtitle}
            icon={actions[0].icon}
            color={actions[0].color}
            onPress={() => router.push(actions[0].route as any)}
            delay={0}
          />
          <View className="w-3" />
          <QuickActionCard
            title={actions[1].title}
            subtitle={actions[1].subtitle}
            icon={actions[1].icon}
            color={actions[1].color}
            onPress={() => router.push(actions[1].route as any)}
            delay={50}
          />
        </View>
        <View className="flex-row">
          <QuickActionCard
            title={actions[2].title}
            subtitle={actions[2].subtitle}
            icon={actions[2].icon}
            color={actions[2].color}
            onPress={() => router.push(actions[2].route as any)}
            delay={100}
          />
          <View className="w-3" />
          <QuickActionCard
            title={actions[3].title}
            subtitle={actions[3].subtitle}
            icon={actions[3].icon}
            color={actions[3].color}
            onPress={() => router.push(actions[3].route as any)}
            delay={150}
          />
        </View>
      </View>
    );
  }

  // Default 2-column layout for students and coaches
  return (
    <View className="flex-row flex-wrap">
      {actions.map((action, index) => (
        <React.Fragment key={action.route + action.title}>
          <QuickActionCard
            title={action.title}
            subtitle={action.subtitle}
            icon={action.icon}
            color={action.color}
            onPress={() => router.push(action.route as any)}
            delay={index * 50}
          />
          {index % 2 === 0 && index < actions.length - 1 && <View className="w-3" />}
        </React.Fragment>
      ))}
    </View>
  );
}

export default RoleBasedQuickActions;
