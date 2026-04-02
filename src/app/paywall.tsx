/**
 * Paywall Screen — RevenueCat-managed paywall
 *
 * Presents the paywall configured in the RevenueCat dashboard.
 * Products, pricing, trial copy, and layout are all controlled remotely.
 *
 * RevenueCat config expected:
 * - Offering: default (current)
 * - Entitlement: premium
 */

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Alert, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import RevenueCatUI from "react-native-purchases-ui";
import * as Haptics from "expo-haptics";
import { X, WifiOff } from "lucide-react-native";

import { isRevenueCatEnabled, getOfferings } from "@/lib/revenuecatClient";
import { useFinanceGuard } from "@/lib/premiumAccess";

export default function PaywallScreen() {
  const router = useRouter();
  const hasFinance = useFinanceGuard();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-check: make sure RevenueCat is configured and offerings load.
  // RevenueCatUI.Paywall handles everything else.
  useEffect(() => {
    (async () => {
      if (!isRevenueCatEnabled()) {
        setError("Subscriptions are not available on this platform.");
        return;
      }

      const result = await getOfferings();
      if (!result.ok) {
        setError("Could not load subscription options. Please try again.");
        return;
      }

      if (!result.data.current) {
        setError("No subscription options are available right now.");
        return;
      }

      setReady(true);
    })();
  }, []);

  const handleDismiss = useCallback(() => {
    router.back();
  }, [router]);

  const handlePurchaseCompleted = useCallback(
    ({ customerInfo }: { customerInfo: any }) => {
      const hasPremium = Boolean(customerInfo?.entitlements?.active?.["premium"]);
      if (hasPremium) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      // Stay on paywall — user can dismiss via the built-in close button
    },
    [],
  );

  const handleRestoreCompleted = useCallback(
    ({ customerInfo }: { customerInfo: any }) => {
      const hasPremium = Boolean(customerInfo?.entitlements?.active?.["premium"]);
      if (hasPremium) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Restored!", "Your subscription has been restored.", [
          { text: "OK", onPress: () => router.back() },
        ]);
      }
    },
    [router],
  );

  const handlePurchaseError = useCallback(({ error: purchaseError }: { error: any }) => {
    const userCancelled =
      purchaseError?.userCancelled === true ||
      purchaseError?.code === "1" ||
      purchaseError?.code === 1 ||
      String(purchaseError?.message ?? "").toLowerCase().includes("cancel");

    if (!userCancelled) {
      Alert.alert("Purchase Failed", "Something went wrong. Please try again.");
    }
  }, []);

  // Error / fallback state
  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0B1220" }}>
        <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Pressable
            onPress={() => router.back()}
            style={{
              position: "absolute",
              top: Platform.OS === "ios" ? 56 : 16,
              right: 20,
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: "rgba(255,255,255,0.08)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={18} color="rgba(255,255,255,0.45)" />
          </Pressable>

          <WifiOff size={48} color="rgba(255,255,255,0.3)" style={{ marginBottom: 16 }} />
          <Text
            style={{
              color: "#FFFFFF",
              fontSize: 18,
              fontWeight: "700",
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            Couldn't Load Subscriptions
          </Text>
          <Text
            style={{
              color: "rgba(255,255,255,0.6)",
              fontSize: 14,
              textAlign: "center",
              lineHeight: 20,
              maxWidth: 300,
              marginBottom: 24,
            }}
          >
            {error}
          </Text>
          <Pressable
            onPress={() => {
              setError(null);
              setReady(false);
              // Re-trigger the effect
              (async () => {
                if (!isRevenueCatEnabled()) {
                  setError("Subscriptions are not available on this platform.");
                  return;
                }
                const result = await getOfferings();
                if (!result.ok) {
                  setError("Could not load subscription options. Please try again.");
                  return;
                }
                if (!result.data.current) {
                  setError("No subscription options are available right now.");
                  return;
                }
                setReady(true);
              })();
            }}
            style={{
              backgroundColor: "rgba(76,123,244,0.15)",
              borderRadius: 12,
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderWidth: 1,
              borderColor: "rgba(76,123,244,0.3)",
            }}
          >
            <Text style={{ color: "#4C7BF4", fontSize: 15, fontWeight: "600" }}>
              Try Again
            </Text>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  // Loading state while checking offerings
  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#0B1220",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator size="large" color="#4C7BF4" />
      </View>
    );
  }

  // RevenueCat native paywall
  return (
    <RevenueCatUI.Paywall
      style={{ flex: 1 }}
      options={{ displayCloseButton: true }}
      onDismiss={handleDismiss}
      onPurchaseCompleted={handlePurchaseCompleted}
      onRestoreCompleted={handleRestoreCompleted}
      onPurchaseError={handlePurchaseError}
    />
  );
}
