/**
 * ONG Dashboard — dedicated home screen for NGO/social project managers.
 *
 * This screen is the entry point for users whose school has organizationType === "ngo".
 * Academy users (paid accounts) never land here.
 *
 * Navigation:
 *   - athletes   → /(tabs)/admin   (athlete & class management)
 *   - posts      → /(tabs)/announcements
 *   - classes    → /(tabs)/lessons
 *   - profile    → /(tabs)/profile
 */

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Clipboard,
} from "react-native";
import { useRouter, Redirect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { signOut, getIdToken } from "firebase/auth";
import {
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase-config";
import {
  useTenantStore,
  selectTenant,
  selectIsNgo,
} from "@/lib/state/tenant-store";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import {
  Users,
  Megaphone,
  BookOpen,
  UserCircle,
  LogOut,
  ChevronRight,
  Heart,
  Ticket,
  Copy,
  Plus,
  CheckCircle,
} from "lucide-react-native";

const BACKEND_URL = process.env.EXPO_PUBLIC_VIBECODE_BACKEND_URL!;

// ─── Types ────────────────────────────────────────────────────────────────────
interface OmgCode {
  id: string;
  code: string;
  isActive: boolean;
  targetRole: "student" | "coach" | "manager";
  currentUses: number;
  maxUses: number;
  createdAt: string;
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const BG = "#071010";
const CARD = "#0F1F17";
const BORDER = "rgba(16,185,129,0.18)";
const BORDER_SUBTLE = "rgba(255,255,255,0.08)";
const TEXT = "#FFFFFF";
const TEXT_SUB = "rgba(255,255,255,0.65)";
const TEXT_MUTED = "rgba(255,255,255,0.38)";
const ACCENT = "#10B981";

// ─── Action definition ────────────────────────────────────────────────────────
interface Action {
  icon: React.ReactNode;
  label: string;
  subtitle: string;
  accentColor: string;
  onPress: () => void;
}

export default function OngDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const tenant = useTenantStore(selectTenant);
  const isNgo = useTenantStore(selectIsNgo);
  const clearTenant = useTenantStore((s) => s.clearTenant);

  const [athleteCount, setAthleteCount] = useState<number | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  // ── Invite code state ──────────────────────────────────────────────────────
  const [inviteCodes, setInviteCodes] = useState<OmgCode[]>([]);
  const [codesLoading, setCodesLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Load existing invite codes via backend (bypasses Firestore rules)
  const loadCodes = useCallback(async () => {
    if (!auth.currentUser) return;
    setCodesLoading(true);
    try {
      console.log("[ong-dashboard] loading invite codes...");
      const token = await getIdToken(auth.currentUser);
      const res = await fetch(`${BACKEND_URL}/api/omg/codes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        codes?: OmgCode[];
        error?: string;
      };
      if (res.ok && body.success && body.codes) {
        setInviteCodes(body.codes);
        console.log("[ong-dashboard] codes loaded:", body.codes.length);
      } else {
        console.warn("[ong-dashboard] loadCodes response error:", res.status, body.error);
      }
    } catch (e) {
      console.warn("[ong-dashboard] loadCodes error:", e);
    } finally {
      setCodesLoading(false);
    }
  }, []);

  const handleGenerateCode = async (targetRole: "student" | "coach" | "manager" = "student") => {
    if (!auth.currentUser) {
      Alert.alert("Erro", "Você precisa estar autenticado.");
      return;
    }
    setGenerating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      console.log("[ong-dashboard] generating invite code...");
      const token = await getIdToken(auth.currentUser);
      const res = await fetch(`${BACKEND_URL}/api/omg/invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ maxUses: 0, targetRole }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        code?: string;
        error?: string;
        message?: string;
      };
      if (!res.ok || !body.success) {
        const msg = body.message ?? body.error ?? "Falha ao gerar código.";
        console.error("[ong-dashboard] generate error:", res.status, body);
        Alert.alert("Erro", msg);
        return;
      }
      console.log("[ong-dashboard] code generated:", body.code);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await loadCodes();
    } catch (e: any) {
      console.error("[ong-dashboard] generate exception:", e);
      Alert.alert("Erro", e?.message ?? "Não foi possível gerar o código.");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async (code: string) => {
    await Clipboard.setString(code);
    setCopiedCode(code);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Load live athlete count from Firestore
  useEffect(() => {
    if (!tenant?.id) return;
    const q = query(
      collection(db, "users"),
      where("schoolId", "==", tenant.id),
      where("role", "==", "student")
    );
    getDocs(q)
      .then((snap) => setAthleteCount(snap.size))
      .catch(() => setAthleteCount(0));
  }, [tenant?.id]);

  // Load invite codes on mount
  useEffect(() => {
    loadCodes();
  }, [loadCodes]);

  // Safety: if tenant is not ONG, don't show this screen
  if (tenant !== null && !isNgo) {
    return <Redirect href="/(tabs)" />;
  }

  const handleSignOut = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSigningOut(true);
    try {
      await signOut(auth);
      clearTenant();
      router.replace("/welcome");
    } catch (e) {
      console.error("[ong-dashboard] sign out error:", e);
      setSigningOut(false);
    }
  };

  const actions: Action[] = [
    {
      icon: <Users size={22} color={ACCENT} />,
      label: "Atletas",
      subtitle: "Gerenciar atletas cadastrados",
      accentColor: "rgba(16,185,129,0.12)",
      onPress: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push("/(tabs)/admin");
      },
    },
    {
      icon: <Megaphone size={22} color="#818CF8" />,
      label: "Comunicados",
      subtitle: "Posts e avisos para a equipe",
      accentColor: "rgba(129,140,248,0.12)",
      onPress: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push("/(tabs)/announcements");
      },
    },
    {
      icon: <BookOpen size={22} color="#F59E0B" />,
      label: "Aulas e Treinos",
      subtitle: "Histórico de sessões",
      accentColor: "rgba(245,158,11,0.12)",
      onPress: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push("/(tabs)/lessons");
      },
    },
    {
      icon: <UserCircle size={22} color="#94A3B8" />,
      label: "Perfil e Configurações",
      subtitle: "Dados da conta",
      accentColor: "rgba(148,163,184,0.10)",
      onPress: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push("/(tabs)/profile");
      },
    },
  ];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Background gradient */}
      <LinearGradient
        colors={["#071010", "#0A1A12"]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(40).springify()} style={styles.header}>
          {/* Badge */}
          <View style={styles.badge}>
            <Heart size={11} color={ACCENT} fill={ACCENT} />
            <Text style={styles.badgeText}>ONG / Projeto Social</Text>
          </View>

          {/* Org name */}
          <Text style={styles.orgName} numberOfLines={2}>
            {tenant?.name ?? "Minha Organização"}
          </Text>

          {/* Location / modality row — pulls from Firestore data stored in school doc */}
          {/* We show what we have in the tenant object */}
        </Animated.View>

        {/* ── Stats strip ─────────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.statsStrip}>
          {/* Athlete count */}
          <View style={[styles.statCard, { borderColor: BORDER }]}>
            <LinearGradient
              colors={["rgba(16,185,129,0.12)", "rgba(16,185,129,0.04)"]}
              style={StyleSheet.absoluteFill}
            />
            <Users size={20} color={ACCENT} style={styles.statIcon} />
            <Text style={styles.statValue}>
              {athleteCount === null ? (
                <ActivityIndicator size="small" color={ACCENT} />
              ) : (
                String(athleteCount)
              )}
            </Text>
            <Text style={styles.statLabel}>Atletas</Text>
          </View>

          {/* OMG partner badge */}
          <View style={[styles.statCard, { borderColor: BORDER_SUBTLE }]}>
            <LinearGradient
              colors={["rgba(129,140,248,0.10)", "rgba(129,140,248,0.03)"]}
              style={StyleSheet.absoluteFill}
            />
            <Heart size={20} color="#818CF8" fill="#818CF8" style={styles.statIcon} />
            <Text style={[styles.statValue, { color: "#818CF8", fontSize: 13, marginTop: 2 }]}>
              Parceiro
            </Text>
            <Text style={styles.statLabel}>OMG</Text>
          </View>

          {/* Status */}
          <View style={[styles.statCard, { borderColor: BORDER_SUBTLE }]}>
            <LinearGradient
              colors={["rgba(74,222,128,0.08)", "rgba(74,222,128,0.02)"]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.onlineDot} />
            <Text style={[styles.statValue, { color: "#4ADE80", fontSize: 13, marginTop: 2 }]}>
              Ativo
            </Text>
            <Text style={styles.statLabel}>Status</Text>
          </View>
        </Animated.View>

        {/* ── Action list ──────────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(160).springify()} style={styles.actionsSection}>
          <Text style={styles.sectionTitle}>GERENCIAR</Text>

          <View style={styles.actionList}>
            {actions.map((action, idx) => (
              <Pressable
                key={action.label}
                style={({ pressed }) => [
                  styles.actionCard,
                  idx === 0 && styles.actionCardFirst,
                  idx === actions.length - 1 && styles.actionCardLast,
                  pressed && { opacity: 0.78 },
                ]}
                onPress={action.onPress}
              >
                <View style={[styles.actionIconWrap, { backgroundColor: action.accentColor }]}>
                  {action.icon}
                </View>
                <View style={styles.actionText}>
                  <Text style={styles.actionLabel}>{action.label}</Text>
                  <Text style={styles.actionSubtitle}>{action.subtitle}</Text>
                </View>
                <ChevronRight size={16} color={TEXT_MUTED} />
              </Pressable>
            ))}
          </View>
        </Animated.View>

        {/* ── Invite Codes Section ──────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.inviteSection}>
          {/* Header row */}
          <View style={styles.inviteHeader}>
            <View style={styles.inviteTitleRow}>
              <View style={styles.inviteIconWrap}>
                <Ticket size={16} color="#818CF8" />
              </View>
              <Text style={styles.inviteTitle}>CÓDIGOS DE ACESSO</Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.generateBtn, pressed && { opacity: 0.72 }]}
              onPress={() => handleGenerateCode("student")}
              disabled={generating}
            >
              {generating ? (
                <ActivityIndicator size="small" color="#818CF8" />
              ) : (
                <>
                  <Plus size={14} color="#818CF8" />
                  <Text style={styles.generateBtnText}>Gerar</Text>
                </>
              )}
            </Pressable>
          </View>

          {/* Codes list */}
          {codesLoading ? (
            <ActivityIndicator color="#818CF8" style={{ marginVertical: 16 }} />
          ) : inviteCodes.length === 0 ? (
            <View style={styles.emptyCodesCard}>
              <Text style={styles.emptyCodesText}>
                Nenhum código gerado ainda. Toque em "Gerar" para criar um código de acesso para novos atletas.
              </Text>
            </View>
          ) : (
            <View style={styles.codesList}>
              {inviteCodes.map((item) => (
                <View key={item.id} style={styles.codeCard}>
                  <View style={styles.codeRow}>
                    <Text style={styles.codeText}>{item.code}</Text>
                    <View style={styles.codeActions}>
                      <View
                        style={[
                          styles.statusPill,
                          { backgroundColor: item.isActive ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)" },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusText,
                            { color: item.isActive ? "#10B981" : "#EF4444" },
                          ]}
                        >
                          {item.isActive ? "Ativo" : "Inativo"}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => handleCopy(item.code)}
                        style={({ pressed }) => [styles.copyBtn, pressed && { opacity: 0.6 }]}
                      >
                        {copiedCode === item.code ? (
                          <CheckCircle size={16} color="#10B981" />
                        ) : (
                          <Copy size={16} color="rgba(255,255,255,0.45)" />
                        )}
                      </Pressable>
                    </View>
                  </View>
                  <Text style={styles.codeUsage}>
                    {item.currentUses} {item.currentUses === 1 ? "uso" : "usos"}
                    {item.maxUses > 0 ? ` / ${item.maxUses} máx` : " · ilimitado"}
                    {" · "}
                    {item.targetRole === "coach" ? "treinador" : item.targetRole === "manager" ? "gestor" : "atleta"}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </Animated.View>

        {/* ── Sign out ─────────────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(220).springify()} style={styles.signOutSection}>
          <Pressable
            style={({ pressed }) => [styles.signOutButton, pressed && { opacity: 0.65 }]}
            onPress={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? (
              <ActivityIndicator size="small" color="#EF4444" />
            ) : (
              <>
                <LogOut size={16} color="#EF4444" />
                <Text style={styles.signOutText}>Sair da conta</Text>
              </>
            )}
          </Pressable>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  scroll: {
    paddingHorizontal: 22,
    paddingTop: 12,
  },

  // Header
  header: {
    marginBottom: 28,
    paddingTop: 8,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: "rgba(16,185,129,0.13)",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.28)",
    borderRadius: 100,
    paddingHorizontal: 11,
    paddingVertical: 5,
    marginBottom: 16,
  },
  badgeText: {
    color: ACCENT,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  orgName: {
    fontSize: 34,
    fontWeight: "800",
    color: TEXT,
    letterSpacing: -1,
    lineHeight: 40,
  },

  // Stats strip
  statsStrip: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 32,
  },
  statCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: "center",
    overflow: "hidden",
    position: "relative",
    gap: 4,
  },
  statIcon: {
    marginBottom: 4,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "800",
    color: TEXT,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: TEXT_MUTED,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#4ADE80",
    marginBottom: 6,
  },

  // Actions
  actionsSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: TEXT_MUTED,
    letterSpacing: 1.4,
    marginBottom: 12,
  },
  actionList: {
    backgroundColor: CARD,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    overflow: "hidden",
  },
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_SUBTLE,
  },
  actionCardFirst: {
    borderTopWidth: 0,
  },
  actionCardLast: {
    borderBottomWidth: 0,
  },
  actionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: {
    flex: 1,
    gap: 2,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: TEXT,
    letterSpacing: -0.2,
  },
  actionSubtitle: {
    fontSize: 12,
    color: TEXT_MUTED,
    letterSpacing: 0.1,
  },

  // Sign out
  signOutSection: {
    marginTop: 4,
  },
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.20)",
    backgroundColor: "rgba(239,68,68,0.06)",
  },
  signOutText: {
    color: "#EF4444",
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: -0.1,
  },

  // Invite codes
  inviteSection: {
    marginBottom: 24,
  },
  inviteHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  inviteTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inviteIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(129,140,248,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  inviteTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.38)",
    letterSpacing: 1.4,
  },
  generateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(129,140,248,0.12)",
    borderWidth: 1,
    borderColor: "rgba(129,140,248,0.28)",
    borderRadius: 100,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  generateBtnText: {
    color: "#818CF8",
    fontSize: 13,
    fontWeight: "600",
  },
  emptyCodesCard: {
    backgroundColor: "#0F1F17",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 18,
  },
  emptyCodesText: {
    color: "rgba(255,255,255,0.38)",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  codesList: {
    gap: 10,
  },
  codeCard: {
    backgroundColor: "#0F1F17",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 6,
  },
  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  codeText: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 3,
  },
  codeActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 100,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  copyBtn: {
    padding: 4,
  },
  codeUsage: {
    fontSize: 12,
    color: "rgba(255,255,255,0.38)",
    fontWeight: "500",
  },
});
