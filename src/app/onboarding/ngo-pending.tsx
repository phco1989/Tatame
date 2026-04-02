import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Clock, CheckCircle, LogOut, RefreshCw } from "lucide-react-native";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db, waitForAuthReady } from "@/lib/firebase-config";
import { useTenantStore, selectIsNgo } from "@/lib/state/tenant-store";
import { resolvePostLoginRoute } from "@/lib/routeAfterLogin";

const { width, height } = Dimensions.get("window");

export default function NgoPendingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [checking, setChecking] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleCheckStatus = async () => {
    setChecking(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await waitForAuthReady();
      const user = auth.currentUser;
      if (!user) { router.replace("/welcome"); return; }

      const snap = await getDoc(doc(db, "users", user.uid));
      if (!snap.exists()) { router.replace("/welcome"); return; }

      const data = snap.data();

      if (data.status === "active" && data.profileComplete === true) {
        // Guardian approved — load tenant and route in
        if (data.schoolId) {
          await useTenantStore.getState().loadTenantFromFirestore(data.schoolId);
        }
        useTenantStore.getState().setCurrentUserStatus("active");
        useTenantStore.getState().setCurrentUserRole(data.role ?? null);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const isNgo = selectIsNgo(useTenantStore.getState() as any);
        router.replace(resolvePostLoginRoute(isNgo, data.role ?? null) as any);
      } else {
        // Still pending
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    } catch (e) {
      console.error("[NgoPending] check error", e);
    } finally {
      setChecking(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      useTenantStore.getState().clearTenant();
      useTenantStore.getState().setCurrentUserRole(null);
      useTenantStore.getState().setCurrentUserStatus(null);
      await signOut(auth);
      router.replace("/welcome");
    } catch (e) {
      console.error("[NgoPending] sign out error", e);
      setSigningOut(false);
    }
  };

  return (
    <View style={styles.container}>
      <BgImage />
      <View style={[styles.content, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 }]}>

        {/* Icon */}
        <Animated.View entering={FadeInDown.delay(60).springify()} style={styles.iconSection}>
          <View style={styles.iconRing}>
            <Clock size={36} color="#F59E0B" />
          </View>
          <View style={styles.statusBadge}>
            <View style={styles.statusDot} />
            <Text style={styles.statusBadgeText}>Awaiting Approval</Text>
          </View>
        </Animated.View>

        {/* Header text */}
        <Animated.View entering={FadeInDown.delay(120).springify()} style={styles.header}>
          <Text style={styles.title}>Pending{"\n"}Guardian Consent</Text>
          <Text style={styles.subtitle}>
            A consent request has been sent to your guardian. Your account will be
            activated once they approve your participation.
          </Text>
        </Animated.View>

        {/* Steps */}
        <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.steps}>
          <StepRow icon="check" done label="Consent request submitted" />
          <StepRow icon="pending" done={false} label="Guardian email notification sent" />
          <StepRow icon="pending" done={false} label="Guardian reviews and approves" />
          <StepRow icon="pending" done={false} label="Account activated" />
        </Animated.View>

        <View style={{ flex: 1 }} />

        {/* CTA */}
        <Animated.View entering={FadeIn.delay(320).duration(400)} style={styles.actions}>
          <Pressable
            onPress={handleCheckStatus}
            disabled={checking || signingOut}
            style={({ pressed }) => [
              styles.checkBtn,
              pressed && styles.checkBtnPressed,
              (checking || signingOut) && styles.btnDisabled,
            ]}
          >
            {checking ? (
              <ActivityIndicator color="#0B1220" />
            ) : (
              <>
                <RefreshCw size={18} color="#0B1220" />
                <Text style={styles.checkBtnText}>Check Approval Status</Text>
              </>
            )}
          </Pressable>

          <Pressable
            onPress={handleSignOut}
            disabled={checking || signingOut}
            style={({ pressed }) => [
              styles.signOutBtn,
              pressed && styles.signOutBtnPressed,
              (checking || signingOut) && styles.btnDisabled,
            ]}
          >
            {signingOut ? (
              <ActivityIndicator color="rgba(255,255,255,0.55)" size="small" />
            ) : (
              <>
                <LogOut size={16} color="rgba(255,255,255,0.55)" />
                <Text style={styles.signOutBtnText}>Sign Out</Text>
              </>
            )}
          </Pressable>

          <Text style={styles.footnote}>
            If you need help, contact your coach or school administrator.
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

function StepRow({ icon, done, label }: { icon: "check" | "pending"; done: boolean; label: string }) {
  return (
    <View style={stepStyles.row}>
      <View style={[stepStyles.dot, done && stepStyles.dotDone]}>
        {done ? (
          <CheckCircle size={14} color="#F59E0B" />
        ) : (
          <View style={stepStyles.emptyDot} />
        )}
      </View>
      <Text style={[stepStyles.label, done && stepStyles.labelDone]}>{label}</Text>
    </View>
  );
}

function BgImage() {
  return (
    <>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Image
          source={require("../../../assets/images/bjj-hero-2.png")}
          style={{ width, height }}
          resizeMode="cover"
        />
      </View>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient
          colors={["rgba(11,18,32,0.30)", "rgba(11,18,32,0.72)", "rgba(11,18,32,0.98)"]}
          locations={[0, 0.40, 1]}
          style={{ flex: 1 }}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220" },
  content: { flex: 1, zIndex: 2, paddingHorizontal: 28 },

  iconSection: { alignItems: "flex-start", marginBottom: 28 },
  iconRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1.5,
    borderColor: "rgba(245,158,11,0.40)",
    backgroundColor: "rgba(245,158,11,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(245,158,11,0.10)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.25)",
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#F59E0B",
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#F59E0B",
    letterSpacing: 0.4,
  },

  header: { marginBottom: 36 },
  title: {
    fontSize: 38,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -1,
    lineHeight: 44,
    marginBottom: 14,
  },
  subtitle: {
    fontSize: 15,
    color: "rgba(255,255,255,0.60)",
    lineHeight: 23,
  },

  steps: {
    gap: 16,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(245,158,11,0.20)",
    paddingLeft: 20,
    marginLeft: 6,
  },

  actions: { gap: 12 },
  checkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    backgroundColor: "#F59E0B",
    borderRadius: 14,
    paddingVertical: 18,
  },
  checkBtnPressed: {
    backgroundColor: "rgba(245,158,11,0.85)",
    transform: [{ scale: 0.98 }],
  },
  checkBtnText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#0B1220",
    letterSpacing: -0.2,
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
  },
  signOutBtnPressed: { opacity: 0.7 },
  signOutBtnText: {
    fontSize: 15,
    fontWeight: "500",
    color: "rgba(255,255,255,0.55)",
  },
  btnDisabled: { opacity: 0.5 },
  footnote: {
    fontSize: 13,
    color: "rgba(255,255,255,0.30)",
    textAlign: "center",
    marginTop: 4,
    lineHeight: 19,
  },
});

const stepStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -18,
  },
  dotDone: {
    borderColor: "rgba(245,158,11,0.40)",
    backgroundColor: "rgba(245,158,11,0.08)",
  },
  emptyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  label: {
    fontSize: 14,
    color: "rgba(255,255,255,0.40)",
    fontWeight: "400",
  },
  labelDone: {
    color: "rgba(255,255,255,0.80)",
    fontWeight: "500",
  },
});
