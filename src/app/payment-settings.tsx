import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Switch,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { ChevronLeft, CreditCard, Save, CheckCircle, AlertCircle } from "lucide-react-native";
import { db } from "@/lib/firebase-config";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import type {
  PaymentSettings,
} from "@/types/payments";
import { DEFAULT_PAYMENT_SETTINGS } from "@/types/payments";
import { useFinanceGuard } from "@/lib/premiumAccess";

const C = {
  bg: "#070D1A",
  surface: "rgba(255,255,255,0.04)",
  surfaceHover: "rgba(255,255,255,0.07)",
  border: "rgba(255,255,255,0.08)",
  borderActive: "rgba(76,123,244,0.60)",
  text: "rgba(255,255,255,0.92)",
  textSub: "rgba(255,255,255,0.70)",
  textMuted: "rgba(255,255,255,0.55)",
  gold: "#3A69E0",
  goldMuted: "rgba(76,123,244,0.20)",
  success: "#34D399",
  danger: "#F87171",
  inputBg: "rgba(255,255,255,0.06)",
  divider: "rgba(255,255,255,0.06)",
};

type PixKeyType = "CPF" | "Email" | "Phone" | "Random";
const PIX_KEY_TYPES: PixKeyType[] = ["CPF", "Email", "Phone", "Random"];

type ToastType = "success" | "error";

function useToast() {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");
  const [type, setType] = useState<ToastType>("success");
  const opacity = React.useRef(new Animated.Value(0)).current;

  const show = useCallback((msg: string, t: ToastType = "success") => {
    setMessage(msg);
    setType(t);
    setVisible(true);
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setVisible(false));
  }, [opacity]);

  return { show, visible, message, type, opacity };
}

export default function PaymentSettingsScreen() {
  const router = useRouter();
  const hasFinance = useFinanceGuard();
  const { uid, schoolId, role, loading: userLoading } = useCurrentUser();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<PaymentSettings>(DEFAULT_PAYMENT_SETTINGS);

  useEffect(() => {
    if (!schoolId) return;
    (async () => {
      try {
        const snap = await getDoc(
          doc(db, "schools", schoolId, "payment_settings", "main")
        );
        if (snap.exists()) {
          const data = snap.data() as PaymentSettings;
          setSettings({
            ...DEFAULT_PAYMENT_SETTINGS,
            ...data,
            stripe: { ...DEFAULT_PAYMENT_SETTINGS.stripe, ...(data.stripe ?? {}) },
          });
        } else {
          const defaults = { ...DEFAULT_PAYMENT_SETTINGS, updatedBy: uid ?? "" };
          await setDoc(
            doc(db, "schools", schoolId, "payment_settings", "main"),
            { ...defaults, updatedAt: serverTimestamp() },
            { merge: true }
          );
          setSettings(defaults);
        }
      } catch (e) {
        console.error("[PaymentSettings] load error", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [schoolId, uid]);

  const handleSave = useCallback(async () => {
    if (!schoolId || !uid) return;
    setSaving(true);
    try {
      await setDoc(
        doc(db, "schools", schoolId, "payment_settings", "main"),
        { ...settings, updatedAt: serverTimestamp(), updatedBy: uid },
        { merge: true }
      );
      toast.show("Saved", "success");
    } catch (e) {
      toast.show("Couldn't save. Check connection & permissions.", "error");
    } finally {
      setSaving(false);
    }
  }, [schoolId, uid, settings, toast]);

  if (userLoading || loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={C.gold} size="large" />
      </View>
    );
  }

  if (role !== "manager") {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: C.textSub, fontSize: 16 }}>Access denied</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <LinearGradient
        colors={["#0A1628", "#070D1A"]}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 20,
            paddingVertical: 16,
            borderBottomWidth: 1,
            borderBottomColor: C.border,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => ({
              opacity: pressed ? 0.6 : 1,
              padding: 8,
              marginRight: 8,
              borderRadius: 12,
              backgroundColor: C.surface,
            })}
          >
            <ChevronLeft size={22} color={C.text} />
          </Pressable>
          <CreditCard size={20} color={C.gold} style={{ marginRight: 8 }} />
          <Text style={{ color: C.text, fontSize: 20, fontWeight: "700", flex: 1 }}>
            Payment Methods
          </Text>
          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 12,
              backgroundColor: pressed ? "rgba(76,123,244,0.8)" : C.gold,
              opacity: saving ? 0.6 : 1,
            })}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Save size={14} color="#fff" style={{ marginRight: 4 }} />
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>Save</Text>
              </>
            )}
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={{ color: C.textMuted, fontSize: 13, marginBottom: 20, lineHeight: 18 }}>
            Configure payment methods students can use to submit proof of payment.
          </Text>

          {/* PIX Card */}
          <MethodCard title="PIX" subtitle="Brazilian instant payment">
            <ToggleRow
              label="Enable PIX"
              value={settings.pix.enabled}
              onValueChange={(v) =>
                setSettings((s) => ({ ...s, pix: { ...s.pix, enabled: v } }))
              }
            />
            {settings.pix.enabled && (
              <>
                <View style={{ marginTop: 16 }}>
                  <Text style={styles.fieldLabel}>Key Type</Text>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    {PIX_KEY_TYPES.map((t) => (
                      <Pressable
                        key={t}
                        onPress={() =>
                          setSettings((s) => ({
                            ...s,
                            pix: { ...s.pix, keyType: t },
                          }))
                        }
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 7,
                          borderRadius: 20,
                          backgroundColor:
                            settings.pix.keyType === t ? C.gold : C.inputBg,
                          borderWidth: 1,
                          borderColor:
                            settings.pix.keyType === t ? C.gold : C.border,
                        }}
                      >
                        <Text
                          style={{
                            color: settings.pix.keyType === t ? "#000" : C.textSub,
                            fontSize: 13,
                            fontWeight: "600",
                          }}
                        >
                          {t}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <InputField
                  label="Key Value"
                  value={settings.pix.keyValue}
                  placeholder="e.g. name@email.com"
                  onChangeText={(v) =>
                    setSettings((s) => ({ ...s, pix: { ...s.pix, keyValue: v } }))
                  }
                />
                <InputField
                  label="QR Code Image URL (optional)"
                  value={settings.pix.qrUrl}
                  placeholder="https://..."
                  onChangeText={(v) =>
                    setSettings((s) => ({ ...s, pix: { ...s.pix, qrUrl: v } }))
                  }
                />
              </>
            )}
          </MethodCard>

          {/* Venmo Card */}
          <MethodCard title="Venmo" subtitle="US peer-to-peer payment">
            <ToggleRow
              label="Enable Venmo"
              value={settings.venmo.enabled}
              onValueChange={(v) =>
                setSettings((s) => ({ ...s, venmo: { ...s.venmo, enabled: v } }))
              }
            />
            {settings.venmo.enabled && (
              <>
                <InputField
                  label="Venmo Handle"
                  value={settings.venmo.handle}
                  placeholder="@yourhandle"
                  onChangeText={(v) =>
                    setSettings((s) => ({ ...s, venmo: { ...s.venmo, handle: v } }))
                  }
                />
                <InputField
                  label="QR Code Image URL (optional)"
                  value={settings.venmo.qrUrl}
                  placeholder="https://..."
                  onChangeText={(v) =>
                    setSettings((s) => ({ ...s, venmo: { ...s.venmo, qrUrl: v } }))
                  }
                />
              </>
            )}
          </MethodCard>

          {/* Zelle Card */}
          <MethodCard title="Zelle" subtitle="US bank transfer">
            <ToggleRow
              label="Enable Zelle"
              value={settings.zelle.enabled}
              onValueChange={(v) =>
                setSettings((s) => ({ ...s, zelle: { ...s.zelle, enabled: v } }))
              }
            />
            {settings.zelle.enabled && (
              <>
                <InputField
                  label="Recipient Name"
                  value={settings.zelle.recipientName}
                  placeholder="Full name on account"
                  onChangeText={(v) =>
                    setSettings((s) => ({ ...s, zelle: { ...s.zelle, recipientName: v } }))
                  }
                />
                <InputField
                  label="Email or Phone"
                  value={settings.zelle.contact}
                  placeholder="name@email.com or +1..."
                  onChangeText={(v) =>
                    setSettings((s) => ({ ...s, zelle: { ...s.zelle, contact: v } }))
                  }
                />
              </>
            )}
          </MethodCard>

          {/* Stripe Card (informational only) */}
          <MethodCard title="Stripe" subtitle="Online card payments — informational only">
            <ToggleRow
              label="Show Stripe info to students"
              value={settings.stripe?.enabled ?? false}
              onValueChange={(v) =>
                setSettings((s) => ({ ...s, stripe: { ...(s.stripe ?? { enabled: false, publicNote: "" }), enabled: v } }))
              }
            />
            {(settings.stripe?.enabled) && (
              <InputField
                label="Public Note (e.g. payment link or instructions)"
                value={settings.stripe?.publicNote ?? ""}
                placeholder="Pay via Stripe at https://..."
                multiline
                onChangeText={(v) =>
                  setSettings((s) => ({ ...s, stripe: { ...(s.stripe ?? { enabled: false, publicNote: "" }), publicNote: v } }))
                }
              />
            )}
            <View
              style={{
                marginTop: 14,
                backgroundColor: "rgba(76,123,244,0.08)",
                borderRadius: 10,
                padding: 12,
                borderWidth: 1,
                borderColor: "rgba(76,123,244,0.18)",
              }}
            >
              <Text style={{ color: C.textMuted, fontSize: 12, lineHeight: 17 }}>
                Phase 1: Stripe is informational only. Full integration coming in a future update.
              </Text>
            </View>
          </MethodCard>
        </ScrollView>

        {/* Toast */}
        {toast.visible && (
          <Animated.View
            style={{
              position: "absolute",
              bottom: 40,
              left: 20,
              right: 20,
              opacity: toast.opacity,
              backgroundColor:
                toast.type === "success"
                  ? "rgba(52,211,153,0.95)"
                  : "rgba(248,113,113,0.95)",
              borderRadius: 14,
              padding: 16,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
            }}
          >
            {toast.type === "success" ? (
              <CheckCircle size={18} color="#fff" />
            ) : (
              <AlertCircle size={18} color="#fff" />
            )}
            <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600", flex: 1 }}>
              {toast.message}
            </Text>
          </Animated.View>
        )}
      </SafeAreaView>
    </View>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function MethodCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        backgroundColor: C.surface,
        borderRadius: 20,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: C.border,
      }}
    >
      <Text style={{ color: C.text, fontSize: 17, fontWeight: "700", marginBottom: 2 }}>
        {title}
      </Text>
      <Text style={{ color: C.textMuted, fontSize: 13, marginBottom: 16 }}>{subtitle}</Text>
      {children}
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <Text style={{ color: C.textSub, fontSize: 15, fontWeight: "500" }}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: C.inputBg, true: C.goldMuted }}
        thumbColor={value ? C.gold : "rgba(255,255,255,0.4)"}
        ios_backgroundColor={C.inputBg}
      />
    </View>
  );
}

function InputField({
  label,
  value,
  placeholder,
  onChangeText,
  multiline,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChangeText: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.textMuted}
        multiline={multiline}
        style={{
          backgroundColor: C.inputBg,
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 12,
          color: C.text,
          fontSize: 15,
          marginTop: 6,
          borderWidth: 1,
          borderColor: C.border,
          minHeight: multiline ? 80 : undefined,
          textAlignVertical: multiline ? "top" : undefined,
        }}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

const styles = {
  fieldLabel: {
    color: C.textSub,
    fontSize: 12,
    fontWeight: "600" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
};
