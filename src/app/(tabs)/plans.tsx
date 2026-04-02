/**
 * Plans & Billing Screen
 *
 * VISIBLE ONLY to manager role.
 * READ-ONLY — never writes to paymentMethods.* fields.
 *
 * Free state:  shows plan as "Free" + "Upgrade to Pro" button → /paywall
 * Premium state: shows plan as "Pro" + "Manage Subscription" / "Restore Purchases"
 */

import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import {
  CreditCard,
  Star,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronLeft,
  Zap,
  RefreshCw,
  Lock,
  Unlock,
  Settings,
  RotateCcw,
} from "lucide-react-native";

import { useUserRole } from "@/lib/hooks/useUserRole";
import { useFinanceGuard } from "@/lib/premiumAccess";
import {
  useTenantStore,
  selectEntitlements,
  selectEntitlementsHydrated,
  selectTenantId,
} from "@/lib/state/tenant-store";
import { useT } from "@/lib/i18n";
import { restorePurchases } from "@/lib/revenuecatClient";

// ─── Design tokens (dark, consistent with rest of app) ─────────────────────
const C = {
  bg: "#0B1220",
  card: "#111827",
  cardBorder: "rgba(255,255,255,0.06)",
  text: "#FFFFFF",
  textSecondary: "rgba(255,255,255,0.7)",
  textMuted: "rgba(255,255,255,0.45)",
  accent: "#4C7BF4",
  accentLight: "rgba(76,123,244,0.15)",
  gold: "#FBBF24",
  goldLight: "rgba(251,191,36,0.15)",
  green: "#10B981",
  greenLight: "rgba(16,185,129,0.15)",
  red: "#EF4444",
  redLight: "rgba(239,68,68,0.12)",
  border: "rgba(255,255,255,0.08)",
  inputBg: "#1F2937",
};

function StatusPill({ status }: { status: string }) {
  const isActive = status === "active";
  const isTrial = status === "trial";

  const color = isActive ? C.green : isTrial ? C.gold : C.red;
  const bgColor = isActive ? C.greenLight : isTrial ? C.goldLight : C.redLight;
  const Icon = isActive ? CheckCircle2 : isTrial ? Clock : AlertCircle;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: bgColor,
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 5,
        alignSelf: "flex-start",
      }}
    >
      <Icon size={13} color={color} />
      <Text
        style={{
          color,
          fontSize: 12,
          fontWeight: "600",
          marginLeft: 5,
          textTransform: "capitalize",
        }}
      >
        {status}
      </Text>
    </View>
  );
}

export default function PlansScreen() {
  const router = useRouter();
  const hasFinance = useFinanceGuard();
  const { role } = useUserRole();
  const t = useT("plans");
  const schoolId = useTenantStore(selectTenantId);
  const entitlements = useTenantStore(selectEntitlements);
  const hydrated = useTenantStore(selectEntitlementsHydrated);
  const loadTenantFromFirestore = useTenantStore(
    (s) => s.loadTenantFromFirestore
  );
  const refreshSubscriptionStatus = useTenantStore(
    (s) => s.refreshSubscriptionStatus
  );
  const rcHasProAccess = useTenantStore((s) => s.rcHasProAccess);

  const [refreshing, setRefreshing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (!schoolId) return;
    setRefreshing(true);
    try {
      await Promise.all([
        loadTenantFromFirestore(schoolId),
        refreshSubscriptionStatus(),
      ]);
    } finally {
      setRefreshing(false);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [schoolId, loadTenantFromFirestore, refreshSubscriptionStatus]);

  const handleRestorePurchases = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRestoring(true);
    try {
      const result = await restorePurchases();
      if (result.ok) {
        await refreshSubscriptionStatus();
        Alert.alert(t.restorePurchases, t.restoreSuccess);
      } else {
        Alert.alert(t.restorePurchases, t.restoreFailed);
      }
    } finally {
      setRestoring(false);
    }
  }, [refreshSubscriptionStatus, t]);

  if (!hydrated || !entitlements) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: C.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator size="large" color={C.accent} />
      </View>
    );
  }

  // Manager-only guard (after all hooks)
  if (role && role !== "manager") {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: C.bg,
          alignItems: "center",
          justifyContent: "center",
          padding: 32,
        }}
      >
        <Lock size={40} color={C.textMuted} />
        <Text
          style={{
            color: C.textMuted,
            marginTop: 16,
            textAlign: "center",
            fontSize: 15,
          }}
        >
          {t.managerOnly}
        </Text>
      </View>
    );
  }

  const {
    plan,
    hasProAccess,
    isTrialActive,
    daysLeftInTrial,
    trialEndsAt,
    subscriptionEndsAt,
    statusLabel,
  } = entitlements;

  // Use the combined check: Firestore entitlement OR RevenueCat active entitlement
  const isPro = plan === "pro" || rcHasProAccess;
  const isSubscribed = hasProAccess || rcHasProAccess;

  const planLabel = isPro ? t.pro : t.starter;

  const trialEndDate = trialEndsAt
    ? trialEndsAt.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const subEndDate = subscriptionEndsAt
    ? subscriptionEndsAt.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        {/* Header */}
        <LinearGradient
          colors={["#111827", "#0B1220"]}
          style={{
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: 20,
          }}
        >
          <Animated.View
            entering={FadeIn.duration(300)}
            style={{ flexDirection: "row", alignItems: "center" }}
          >
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                backgroundColor: C.inputBg,
                alignItems: "center",
                justifyContent: "center",
                marginRight: 14,
              }}
            >
              <ChevronLeft size={20} color={C.text} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontSize: 20, fontWeight: "700" }}>
                {t.plansBilling}
              </Text>
            </View>
            <Pressable
              onPress={handleRefresh}
              disabled={refreshing}
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                backgroundColor: C.inputBg,
                alignItems: "center",
                justifyContent: "center",
                opacity: refreshing ? 0.5 : 1,
              }}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color={C.accent} />
              ) : (
                <RefreshCw size={18} color={C.textMuted} />
              )}
            </Pressable>
          </Animated.View>
        </LinearGradient>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={C.accent}
            />
          }
        >
          {/* Plan Card */}
          <Animated.View
            entering={FadeInDown.springify().delay(50)}
            style={{
              backgroundColor: C.card,
              borderRadius: 20,
              padding: 20,
              marginBottom: 16,
              borderWidth: 1,
              borderColor: isPro
                ? "rgba(251,191,36,0.25)"
                : C.cardBorder,
            }}
          >
            {/* Plan header row */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <View
                style={{
                  backgroundColor: isPro ? C.goldLight : C.accentLight,
                  borderRadius: 12,
                  padding: 10,
                  marginRight: 14,
                }}
              >
                {isPro ? (
                  <Star size={22} color={C.gold} />
                ) : (
                  <CreditCard size={22} color={C.accent} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{ color: C.textMuted, fontSize: 12, marginBottom: 3 }}
                >
                  {t.currentPlan}
                </Text>
                <Text
                  style={{ color: C.text, fontSize: 20, fontWeight: "700" }}
                >
                  {planLabel}
                </Text>
              </View>
              {isPro && (
                <View
                  style={{
                    backgroundColor: C.gold,
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                  }}
                >
                  <Text
                    style={{
                      color: "#0B1220",
                      fontSize: 11,
                      fontWeight: "800",
                      letterSpacing: 1,
                    }}
                  >
                    PRO
                  </Text>
                </View>
              )}
            </View>

            {/* Status row */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text style={{ color: C.textMuted, fontSize: 13 }}>
                {t.planStatus}
              </Text>
              <StatusPill status={statusLabel} />
            </View>

            {/* Pro access indicator */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 14,
                backgroundColor: isSubscribed ? C.greenLight : C.redLight,
                borderRadius: 12,
                padding: 12,
              }}
            >
              {isSubscribed ? (
                <Unlock size={16} color={C.green} />
              ) : (
                <Lock size={16} color={C.red} />
              )}
              <Text
                style={{
                  marginLeft: 10,
                  color: isSubscribed ? C.green : C.red,
                  fontSize: 13,
                  fontWeight: "600",
                  flex: 1,
                }}
              >
                {isSubscribed ? t.proFeaturesUnlocked : t.proFeaturesLocked}
              </Text>
            </View>
          </Animated.View>

          {/* Trial Banner */}
          {isTrialActive && trialEndDate && (
            <Animated.View
              entering={FadeInDown.springify().delay(100)}
              style={{
                backgroundColor: C.goldLight,
                borderRadius: 20,
                padding: 18,
                marginBottom: 16,
                borderWidth: 1,
                borderColor: "rgba(251,191,36,0.25)",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <Clock size={18} color={C.gold} />
                <Text
                  style={{
                    color: C.gold,
                    fontSize: 15,
                    fontWeight: "700",
                    marginLeft: 10,
                  }}
                >
                  {t.trialEndsIn}
                </Text>
              </View>
              <Text
                style={{
                  color: C.text,
                  fontSize: 28,
                  fontWeight: "800",
                  marginBottom: 4,
                }}
              >
                {t.trialDaysLeft.replace("{days}", String(daysLeftInTrial))}
              </Text>
              <Text style={{ color: C.textMuted, fontSize: 13 }}>
                {trialEndDate}
              </Text>
            </Animated.View>
          )}

          {/* Trial ended banner */}
          {!isTrialActive && plan === "pro" && !isSubscribed && trialEndDate && (
            <Animated.View
              entering={FadeInDown.springify().delay(100)}
              style={{
                backgroundColor: C.redLight,
                borderRadius: 20,
                padding: 18,
                marginBottom: 16,
                borderWidth: 1,
                borderColor: "rgba(239,68,68,0.25)",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <AlertCircle size={18} color={C.red} />
                <Text
                  style={{
                    color: C.red,
                    fontSize: 15,
                    fontWeight: "700",
                    marginLeft: 10,
                  }}
                >
                  {t.trialEnded}
                </Text>
              </View>
              <Text style={{ color: C.textMuted, fontSize: 13 }}>
                {t.trialEndedOn} {trialEndDate}
              </Text>
            </Animated.View>
          )}

          {/* Active subscription info */}
          {subEndDate && isSubscribed && !isTrialActive && (
            <Animated.View
              entering={FadeInDown.springify().delay(100)}
              style={{
                backgroundColor: C.greenLight,
                borderRadius: 20,
                padding: 18,
                marginBottom: 16,
                borderWidth: 1,
                borderColor: "rgba(16,185,129,0.25)",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <CheckCircle2 size={18} color={C.green} />
                <Text
                  style={{
                    color: C.green,
                    fontSize: 15,
                    fontWeight: "700",
                    marginLeft: 10,
                  }}
                >
                  {t.subscriptionActive}
                </Text>
              </View>
              <Text style={{ color: C.textMuted, fontSize: 13 }}>
                {subEndDate}
              </Text>
            </Animated.View>
          )}

          {/* ── FREE USER STATE: Upgrade to Pro ─────────────────────────── */}
          {!isSubscribed && (
            <Animated.View entering={FadeInDown.springify().delay(150)}>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push("/paywall");
                }}
                style={{
                  backgroundColor: C.card,
                  borderRadius: 20,
                  padding: 20,
                  marginBottom: 16,
                  borderWidth: 1,
                  borderColor: "rgba(76,123,244,0.2)",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 14,
                  }}
                >
                  <View
                    style={{
                      backgroundColor: C.accentLight,
                      borderRadius: 12,
                      padding: 10,
                      marginRight: 14,
                    }}
                  >
                    <Zap size={22} color={C.accent} />
                  </View>
                  <Text
                    style={{
                      color: C.text,
                      fontSize: 17,
                      fontWeight: "700",
                      flex: 1,
                    }}
                  >
                    {t.upgradeToPro}
                  </Text>
                </View>
                <View
                  style={{
                    backgroundColor: C.accent,
                    borderRadius: 12,
                    paddingVertical: 14,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "700" }}
                  >
                    {t.upgradeButton}
                  </Text>
                </View>
              </Pressable>

              {/* Restore Purchases (free user — in case they already purchased) */}
              <Pressable
                onPress={handleRestorePurchases}
                disabled={restoring}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 14,
                  opacity: restoring ? 0.5 : 1,
                }}
              >
                {restoring ? (
                  <ActivityIndicator size="small" color={C.textMuted} />
                ) : (
                  <RotateCcw size={15} color={C.textMuted} />
                )}
                <Text
                  style={{
                    color: C.textMuted,
                    fontSize: 14,
                    marginLeft: 7,
                  }}
                >
                  {restoring ? t.restoringPurchases : t.restorePurchases}
                </Text>
              </Pressable>
            </Animated.View>
          )}

          {/* ── PREMIUM USER STATE ───────────────────────────────────────── */}
          {isSubscribed && (
            <Animated.View entering={FadeInDown.springify().delay(150)}>
              {/* Pro confirmation banner */}
              <View
                style={{
                  backgroundColor: C.goldLight,
                  borderRadius: 20,
                  padding: 20,
                  marginBottom: 16,
                  borderWidth: 1,
                  borderColor: "rgba(251,191,36,0.2)",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Star size={20} color={C.gold} />
                  <Text
                    style={{
                      color: C.gold,
                      fontSize: 15,
                      fontWeight: "700",
                      marginLeft: 10,
                    }}
                  >
                    {t.yourSchoolIsOnPro}
                  </Text>
                </View>
              </View>

              {/* Manage Subscription button */}
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push("/paywall");
                }}
                style={{
                  backgroundColor: C.card,
                  borderRadius: 16,
                  paddingVertical: 16,
                  paddingHorizontal: 20,
                  marginBottom: 12,
                  borderWidth: 1,
                  borderColor: C.border,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <Settings size={18} color={C.textSecondary} />
                <Text
                  style={{
                    color: C.text,
                    fontSize: 15,
                    fontWeight: "600",
                    marginLeft: 12,
                    flex: 1,
                  }}
                >
                  {t.manageSubscription}
                </Text>
              </Pressable>

              {/* Restore Purchases button */}
              <Pressable
                onPress={handleRestorePurchases}
                disabled={restoring}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 14,
                  opacity: restoring ? 0.5 : 1,
                }}
              >
                {restoring ? (
                  <ActivityIndicator size="small" color={C.textMuted} />
                ) : (
                  <RotateCcw size={15} color={C.textMuted} />
                )}
                <Text
                  style={{
                    color: C.textMuted,
                    fontSize: 14,
                    marginLeft: 7,
                  }}
                >
                  {restoring ? t.restoringPurchases : t.restorePurchases}
                </Text>
              </Pressable>
            </Animated.View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
