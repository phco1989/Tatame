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
import {
  ChevronLeft,
  Wallet,
  Save,
  CheckCircle,
  AlertCircle,
  Copy,
} from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import { db } from "@/lib/firebase-config";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import { useFinanceGuard } from "@/lib/premiumAccess";
import type { CoachPayoutMethod } from "@/types/payments";
import { DEFAULT_COACH_PAYOUT_METHOD } from "@/types/payments";

const C = {
  bg: "#070D1A",
  surface: "rgba(255,255,255,0.04)",
  surfaceHover: "rgba(255,255,255,0.07)",
  border: "rgba(255,255,255,0.08)",
  text: "rgba(255,255,255,0.92)",
  textSub: "rgba(255,255,255,0.70)",
  textMuted: "rgba(255,255,255,0.55)",
  gold: "#D4A017",
  goldMuted: "rgba(212,160,23,0.20)",
  success: "#34D399",
  danger: "#F87171",
  inputBg: "rgba(255,255,255,0.06)",
};

type ToastType = "success" | "error";

function useToast() {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");
  const [type, setType] = useState<ToastType>("success");
  const opacity = React.useRef(new Animated.Value(0)).current;

  const show = useCallback(
    (msg: string, t: ToastType = "success") => {
      setMessage(msg);
      setType(t);
      setVisible(true);
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(2000),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(() => setVisible(false));
    },
    [opacity]
  );

  return { show, visible, message, type, opacity };
}

const PIX_KEY_TYPES = ["CPF", "Email", "Phone", "Random"] as const;

export default function CoachPayoutMethodsScreen() {
  const router = useRouter();
  const hasFinance = useFinanceGuard();
  const { uid, schoolId, role, loading: userLoading } = useCurrentUser();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [methods, setMethods] = useState<CoachPayoutMethod>(DEFAULT_COACH_PAYOUT_METHOD);

  useEffect(() => {
    if (!schoolId || !uid) return;
    (async () => {
      try {
        const snap = await getDoc(
          doc(db, "schools", schoolId, "coach_payout_methods", uid)
        );
        if (snap.exists()) {
          const data = snap.data() as CoachPayoutMethod;
          setMethods({ ...DEFAULT_COACH_PAYOUT_METHOD, ...data });
        }
      } catch (e) {
        console.error("[CoachPayoutMethods] load error", e);
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
        doc(db, "schools", schoolId, "coach_payout_methods", uid),
        { ...methods, updatedAt: serverTimestamp() },
        { merge: true }
      );
      toast.show("Saved", "success");
    } catch (e) {
      toast.show("Couldn't save. Check connection & permissions.", "error");
    } finally {
      setSaving(false);
    }
  }, [schoolId, uid, methods, toast]);

  if (userLoading || loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={C.gold} size="large" />
      </View>
    );
  }

  if (role !== "coach" && role !== "manager") {
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
          <Wallet size={20} color={C.gold} style={{ marginRight: 8 }} />
          <Text style={{ color: C.text, fontSize: 20, fontWeight: "700", flex: 1 }}>
            Payout Methods
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
              backgroundColor: pressed ? "rgba(212,160,23,0.8)" : C.gold,
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
            Add your preferred payout methods so the school manager knows how to send your earnings.
          </Text>

          {/* Venmo */}
          <MethodCard title="Venmo" subtitle="US peer-to-peer payment">
            <ToggleRow
              label="Enable Venmo"
              value={methods.venmo.enabled}
              onValueChange={(v) =>
                setMethods((m) => ({ ...m, venmo: { ...m.venmo, enabled: v } }))
              }
            />
            {methods.venmo.enabled && (
              <CopyableInput
                label="Venmo Handle"
                value={methods.venmo.handle}
                placeholder="@yourhandle"
                onChangeText={(v) =>
                  setMethods((m) => ({ ...m, venmo: { ...m.venmo, handle: v } }))
                }
                onCopy={() => Clipboard.setStringAsync(methods.venmo.handle)}
              />
            )}
          </MethodCard>

          {/* Zelle */}
          <MethodCard title="Zelle" subtitle="US bank transfer">
            <ToggleRow
              label="Enable Zelle"
              value={methods.zelle.enabled}
              onValueChange={(v) =>
                setMethods((m) => ({ ...m, zelle: { ...m.zelle, enabled: v } }))
              }
            />
            {methods.zelle.enabled && (
              <>
                <CopyableInput
                  label="Recipient Name"
                  value={methods.zelle.recipientName}
                  placeholder="Full name on account"
                  onChangeText={(v) =>
                    setMethods((m) => ({ ...m, zelle: { ...m.zelle, recipientName: v } }))
                  }
                  onCopy={() => Clipboard.setStringAsync(methods.zelle.recipientName)}
                />
                <CopyableInput
                  label="Email or Phone"
                  value={methods.zelle.contact}
                  placeholder="name@email.com or +1..."
                  onChangeText={(v) =>
                    setMethods((m) => ({ ...m, zelle: { ...m.zelle, contact: v } }))
                  }
                  onCopy={() => Clipboard.setStringAsync(methods.zelle.contact)}
                />
              </>
            )}
          </MethodCard>

          {/* PIX */}
          <MethodCard title="PIX" subtitle="Brazilian instant payment">
            <ToggleRow
              label="Enable PIX"
              value={methods.pix.enabled}
              onValueChange={(v) =>
                setMethods((m) => ({ ...m, pix: { ...m.pix, enabled: v } }))
              }
            />
            {methods.pix.enabled && (
              <>
                <View style={{ marginTop: 16 }}>
                  <Text style={styles.fieldLabel}>Key Type</Text>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    {PIX_KEY_TYPES.map((t) => (
                      <Pressable
                        key={t}
                        onPress={() =>
                          setMethods((m) => ({ ...m, pix: { ...m.pix, keyType: t } }))
                        }
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 7,
                          borderRadius: 20,
                          backgroundColor: methods.pix.keyType === t ? C.gold : C.inputBg,
                          borderWidth: 1,
                          borderColor: methods.pix.keyType === t ? C.gold : C.border,
                        }}
                      >
                        <Text
                          style={{
                            color: methods.pix.keyType === t ? "#000" : C.textSub,
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
                <CopyableInput
                  label="Key Value"
                  value={methods.pix.keyValue}
                  placeholder="e.g. name@email.com"
                  onChangeText={(v) =>
                    setMethods((m) => ({ ...m, pix: { ...m.pix, keyValue: v } }))
                  }
                  onCopy={() => Clipboard.setStringAsync(methods.pix.keyValue)}
                />
              </>
            )}
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

// ── Sub-components ────────────────────────────────────────────────────────────

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
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
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

function CopyableInput({
  label,
  value,
  placeholder,
  onChangeText,
  onCopy,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChangeText: (v: string) => void;
  onCopy: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!value) return;
    await onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <View style={{ marginTop: 14 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, gap: 8 }}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.textMuted}
          style={{
            flex: 1,
            backgroundColor: C.inputBg,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            color: C.text,
            fontSize: 15,
            borderWidth: 1,
            borderColor: C.border,
          }}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable
          onPress={handleCopy}
          style={({ pressed }) => ({
            opacity: pressed ? 0.6 : 1,
            padding: 12,
            borderRadius: 12,
            backgroundColor: copied ? "rgba(52,211,153,0.15)" : C.inputBg,
            borderWidth: 1,
            borderColor: copied ? "rgba(52,211,153,0.30)" : C.border,
          })}
        >
          {copied ? (
            <CheckCircle size={18} color={C.success} />
          ) : (
            <Copy size={18} color={C.textMuted} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = {
  fieldLabel: {
    color: "rgba(255,255,255,0.70)" as const,
    fontSize: 12,
    fontWeight: "600" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
};
