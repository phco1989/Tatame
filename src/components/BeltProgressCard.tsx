/**
 * BeltProgressCard
 *
 * Staff-only (manager + coach) card shown in Student Progress screen.
 * Features:
 *  - Stripe progress slider + ±10 quick buttons
 *  - Award Stripe (with full StripeCeremonyOverlay experience)
 *  - Promote Belt (manager only)
 *  - Promotion Readiness bar (smart intelligence)
 *  - Smart Recommendation toggle (manager only)
 *  - MomentumRing score visualization
 *  - Auto mural system post on stripe award
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  Switch,
} from "react-native";
import Slider from "@react-native-community/slider";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import {
  doc,
  getDoc,
  runTransaction,
  addDoc,
  collection,
  serverTimestamp,
  arrayUnion,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase-config";
import { BeltBadge } from "@/components/BeltBadge";
import { BeltCelebration } from "@/components/BeltCelebration";
import { PromotionReadinessBar } from "@/components/PromotionReadinessBar";
import { MomentumRing } from "@/components/MomentumRing";
import { StripeCeremonyOverlay } from "@/components/StripeCeremonyOverlay";
import {
  beltColor,
  beltDisplayLabel,
  canAwardStripe,
  canPromoteBelt,
  clampStripeProgress,
  nextBelt,
  BELT_LABELS,
} from "@/lib/belt";
import type { BeltRank, BeltHistoryEntry } from "@/lib/belt";
import {
  computeSmartBeltScore,
  computePromotionReadiness,
  generateRecommendation,
} from "@/lib/belt-intelligence";
import { useT } from "@/lib/i18n";
import {
  Award,
  TrendingUp,
  Minus,
  Plus,
  ChevronUp,
  Lightbulb,
  Brain,
} from "lucide-react-native";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentBeltData {
  beltRank: BeltRank;
  stripes: number;
  stripeProgress: number;
  schoolId: string;
  beltHistory: BeltHistoryEntry[];
}

interface BeltProgressCardProps {
  studentId: string;
  studentName: string;
  currentUserSchoolId: string;
  /** If true, shows Smart Recommendation toggle + Promote Belt */
  isManager?: boolean;
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const C = {
  card: "#111827",
  border: "rgba(255,255,255,0.07)",
  text: "#FFFFFF",
  textSub: "rgba(255,255,255,0.7)",
  textMuted: "rgba(255,255,255,0.45)",
  accent: "#FBBF24",
  accentMuted: "rgba(251,191,36,0.12)",
  success: "#10B981",
  successMuted: "rgba(16,185,129,0.12)",
  inputBg: "#1F2937",
  danger: "#EF4444",
  dangerMuted: "rgba(239,68,68,0.12)",
  purple: "#A78BFA",
  purpleMuted: "rgba(167,139,250,0.10)",
};

// ─── Progress bar ─────────────────────────────────────────────────────────────

function StripeProgressBar({
  value,
  beltRank,
}: {
  value: number;
  beltRank: BeltRank | string;
}) {
  const color = beltColor(beltRank);
  const pct = clampStripeProgress(value);
  return (
    <View
      style={{
        height: 8,
        backgroundColor: "rgba(255,255,255,0.1)",
        borderRadius: 4,
        overflow: "hidden",
        marginVertical: 4,
      }}
    >
      <View
        style={{
          height: "100%",
          width: `${pct}%`,
          backgroundColor: color,
          borderRadius: 4,
          shadowColor: color,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.7,
          shadowRadius: 4,
        }}
      />
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BeltProgressCard({
  studentId,
  studentName,
  currentUserSchoolId,
  isManager = false,
}: BeltProgressCardProps) {
  const bt = useT("belt");
  const ct = useT("common");
  const pt = useT("progress");

  const [data, setData] = useState<StudentBeltData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sliderValue, setSliderValue] = useState(0);
  const [sliderDirty, setSliderDirty] = useState(false);

  // Celebration state
  const [celebVisible, setCelebVisible] = useState(false);
  const [celebType, setCelebType] = useState<"stripe" | "belt">("stripe");
  const [celebLabel, setCelebLabel] = useState("");

  // Stripe Ceremony Mode
  const [ceremonyVisible, setCeremonyVisible] = useState(false);

  // Smart Recommendation toggle (manager only)
  const [showRecommendation, setShowRecommendation] = useState(false);

  // ── Load student belt data ──────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, "users", studentId));
      if (!snap.exists()) {
        setData(null);
        return;
      }
      const d = snap.data();
      const bd: StudentBeltData = {
        beltRank: (d?.beltRank ?? "white") as BeltRank,
        stripes: typeof d?.stripes === "number" ? Math.min(4, Math.max(0, d.stripes)) : 0,
        stripeProgress: typeof d?.stripeProgress === "number" ? clampStripeProgress(d.stripeProgress) : 0,
        schoolId: d?.schoolId ?? "",
        beltHistory: Array.isArray(d?.beltHistory) ? d.beltHistory : [],
      };
      setData(bd);
      setSliderValue(bd.stripeProgress);
      setSliderDirty(false);
    } catch (e) {
      console.log("[BeltProgressCard] load error:", e);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Intelligence computations (memoized) ────────────────────────────────────

  const intelligence = useMemo(() => {
    if (!data) return null;
    const smartScore = computeSmartBeltScore({
      beltRank: data.beltRank,
      stripes: data.stripes,
      stripeProgress: data.stripeProgress,
      beltHistory: data.beltHistory,
    });
    const readiness = computePromotionReadiness(smartScore, data.stripeProgress);
    const recommendation = generateRecommendation(
      {
        beltRank: data.beltRank,
        stripes: data.stripes,
        stripeProgress: data.stripeProgress,
        beltHistory: data.beltHistory,
      },
      readiness
    );
    return { smartScore, readiness, recommendation };
  }, [data]);

  // ── School guard ────────────────────────────────────────────────────────────

  const checkSchool = (studentSchoolId: string): boolean => {
    if (studentSchoolId !== currentUserSchoolId) {
      Alert.alert("Error", "Student is not in your school.");
      return false;
    }
    return true;
  };

  // ── Save stripe progress ────────────────────────────────────────────────────

  const handleSaveProgress = async () => {
    if (!data || !checkSchool(data.schoolId)) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const newProgress = clampStripeProgress(sliderValue);
    setSaving(true);
    try {
      await runTransaction(db, async (tx) => {
        const userRef = doc(db, "users", studentId);
        const snap = await tx.get(userRef);
        if (!snap.exists()) throw new Error("Student not found");
        const current = snap.data();
        if (current?.schoolId !== currentUserSchoolId) throw new Error("School mismatch");
        tx.update(userRef, {
          stripeProgress: newProgress,
          beltUpdatedAt: serverTimestamp(),
        });
      });
      setData((prev) => prev ? { ...prev, stripeProgress: newProgress } : prev);
      setSliderDirty(false);
      console.log("[BeltProgressCard] stripeProgress saved:", newProgress);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to save progress");
    } finally {
      setSaving(false);
    }
  };

  // ── Award stripe — Ceremony Mode ────────────────────────────────────────────

  const handleAwardStripe = () => {
    if (!data || !checkSchool(data.schoolId)) return;
    if (!canAwardStripe(data.stripes)) {
      Alert.alert(bt?.maxStripes ?? "Max stripes reached");
      return;
    }
    // Start ceremony overlay
    setCeremonyVisible(true);
  };

  /** Called by StripeCeremonyOverlay after spotlight completes (~1.4s) */
  const handleCeremonyReady = useCallback(() => {
    setCeremonyVisible(false);
    executeAwardStripe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, currentUserSchoolId, studentId, studentName]);

  const handleCeremonySkip = useCallback(() => {
    setCeremonyVisible(false);
    executeAwardStripe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, currentUserSchoolId, studentId, studentName]);

  const executeAwardStripe = async () => {
    if (!data) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    setSaving(true);
    try {
      let awardedByName = "Professor";
      try {
        const meSnap = await getDoc(doc(db, "users", uid));
        if (meSnap.exists()) {
          awardedByName = meSnap.data()?.displayName || meSnap.data()?.name || "Professor";
        }
      } catch {}

      let newStripes = data.stripes;
      let newBeltRank: BeltRank | null = null;
      const currentBeltRank = data.beltRank;

      await runTransaction(db, async (tx) => {
        const managerRef = doc(db, "users", uid);
        const userRef = doc(db, "users", studentId);

        const [managerSnap, studentSnap] = await Promise.all([
          tx.get(managerRef),
          tx.get(userRef),
        ]);

        if (!studentSnap.exists()) throw new Error("Student not found");
        const managerData = managerSnap.data();
        const current = studentSnap.data();

        const managerSchoolId = managerData?.schoolId ?? currentUserSchoolId;
        const studentSchoolId = current?.schoolId;
        if (studentSchoolId !== managerSchoolId) throw new Error("School mismatch");

        const currentStripes = typeof current?.stripes === "number"
          ? Math.min(4, Math.max(0, current.stripes))
          : 0;
        if (currentStripes >= 4) throw new Error("Already at max stripes");

        const beltRankForEntry = (current?.beltRank ?? "white") as BeltRank;
        newStripes = Math.min(4, currentStripes + 1);

        // ── Auto-promote check ────────────────────────────────────────────
        const shouldAutoPromote = newStripes >= 4 && canPromoteBelt(beltRankForEntry);
        const promotedBelt = shouldAutoPromote ? nextBelt(beltRankForEntry) : null;
        newBeltRank = promotedBelt;

        if (shouldAutoPromote && promotedBelt) {
          // Belt promotion: update belt rank, reset stripes to 0
          const promotionHistoryEntry = {
            type: "belt",
            beltRank: promotedBelt,
            stripes: 0,
            awardedBy: uid,
            awardedByName,
            timestamp: new Date().toISOString(),
          };

          tx.update(doc(db, "users", studentId), {
            beltRank: promotedBelt,
            stripes: 0,
            stripeProgress: 0,
            beltUpdatedAt: serverTimestamp(),
            lastPromotionAt: serverTimestamp(),
            beltAwardedBy: uid,
            beltAwardedByName: awardedByName,
            lastPromotion: serverTimestamp(),
            updatedAt: serverTimestamp(),
            beltHistory: arrayUnion(promotionHistoryEntry),
          });

          // progress_entries: stripe award (reaching 4)
          const stripeProgressRef = doc(collection(db, "progress_entries"));
          tx.set(stripeProgressRef, {
            schoolId: managerSchoolId,
            studentId,
            awardedBy: uid,
            awardedByName,
            type: "stripe",
            beltRank: beltRankForEntry,
            stripes: newStripes,
            createdAt: serverTimestamp(),
          });

          // progress_entries: belt promotion
          const beltProgressRef = doc(collection(db, "progress_entries"));
          tx.set(beltProgressRef, {
            schoolId: managerSchoolId,
            studentId,
            awardedBy: uid,
            awardedByName,
            type: "belt",
            beltRank: promotedBelt,
            stripes: 0,
            createdAt: serverTimestamp(),
          });
        } else {
          // Normal stripe award
          const historyEntry = {
            type: "stripe",
            beltRank: beltRankForEntry,
            stripes: newStripes,
            awardedBy: uid,
            awardedByName,
            timestamp: new Date().toISOString(),
          };

          tx.update(doc(db, "users", studentId), {
            stripes: newStripes,
            stripeProgress: 0,
            beltUpdatedAt: serverTimestamp(),
            beltAwardedBy: uid,
            beltAwardedByName: awardedByName,
            lastPromotion: serverTimestamp(),
            updatedAt: serverTimestamp(),
            beltHistory: arrayUnion(historyEntry),
          });

          const progressRef = doc(collection(db, "progress_entries"));
          tx.set(progressRef, {
            schoolId: managerSchoolId,
            studentId,
            awardedBy: uid,
            awardedByName,
            type: "stripe",
            beltRank: beltRankForEntry,
            stripes: newStripes,
            createdAt: serverTimestamp(),
          });
        }
      });

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      // Capture promoted belt rank into a const so TS can narrow it correctly
      const promotedBeltRank: BeltRank | null = newBeltRank;

      // ── Auto-promotion alert ──────────────────────────────────────────────
      if (promotedBeltRank) {
        const currentBeltLabel = BELT_LABELS[currentBeltRank] ?? currentBeltRank;
        const nextBeltLabel = BELT_LABELS[promotedBeltRank] ?? promotedBeltRank;
        const title = pt?.promotionTitle ?? "Belt Promotion";
        const msg = `${currentBeltLabel} • 4 stripes → ${nextBeltLabel}`;
        Alert.alert(title, msg, [{ text: ct?.ok ?? "OK" }]);
      }

      // Auto mural system post
      try {
        const beltLabel = currentBeltRank.charAt(0).toUpperCase() + currentBeltRank.slice(1);
        if (promotedBeltRank) {
          const pbr: string = promotedBeltRank;
          const newBeltLabel = pbr.charAt(0).toUpperCase() + pbr.slice(1);
          await addDoc(collection(db, "posts"), {
            schoolId: currentUserSchoolId,
            authorId: "system",
            authorName: "Tatame",
            authorRole: "system",
            authorBeltRank: null,
            authorStripes: null,
            text: `${studentName} was promoted to ${newBeltLabel} Belt!`,
            systemPost: true,
            studentId,
            studentBeltRank: promotedBeltRank,
            studentStripes: 0,
            photoURLs: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await addDoc(collection(db, "posts"), {
            schoolId: currentUserSchoolId,
            authorId: "system",
            authorName: "Tatame",
            authorRole: "system",
            authorBeltRank: null,
            authorStripes: null,
            text: `${studentName} earned a stripe on ${beltLabel} Belt!`,
            systemPost: true,
            studentId,
            studentBeltRank: currentBeltRank,
            studentStripes: newStripes,
            photoURLs: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        console.log("[BeltProgressCard] system mural post created");
      } catch (muralErr) {
        console.log("[BeltProgressCard] mural post failed (non-critical):", muralErr);
      }

      if (promotedBeltRank) {
        // State: promoted belt
        setData((prev) =>
          prev
            ? {
                ...prev,
                beltRank: promotedBeltRank,
                stripes: 0,
                stripeProgress: 0,
                beltHistory: [
                  ...prev.beltHistory,
                  {
                    type: "belt" as const,
                    beltRank: promotedBeltRank,
                    stripes: 0,
                    awardedBy: uid,
                    awardedByName,
                    timestamp: new Date().toISOString(),
                  },
                ],
              }
            : prev
        );
        setCelebType("belt");
        setCelebLabel(bt?.beltPromoted ?? "Belt Promoted!");
      } else {
        setData((prev) =>
          prev
            ? {
                ...prev,
                stripes: newStripes,
                stripeProgress: 0,
                beltHistory: [
                  ...prev.beltHistory,
                  {
                    type: "stripe" as const,
                    beltRank: prev.beltRank,
                    stripes: newStripes,
                    awardedBy: uid,
                    awardedByName,
                    timestamp: new Date().toISOString(),
                  },
                ],
              }
            : prev
        );
        setCelebType("stripe");
        setCelebLabel(bt?.stripeAwarded ?? "Stripe Awarded!");
      }

      setSliderValue(0);
      setSliderDirty(false);
      setCelebVisible(true);

      console.log(
        promotedBeltRank
          ? `[BeltProgressCard] auto-promoted to ${promotedBeltRank}`
          : `[BeltProgressCard] stripe awarded, total: ${newStripes}`
      );
    } catch (e: any) {
      console.error("[BeltProgressCard] executeAwardStripe error:", e);
      if (e?.code === "permission-denied") {
        Alert.alert("Permission Denied", "You do not have permission to award this stripe.");
      } else if (e?.code === "unavailable") {
        Alert.alert("Connection Issue", "Connection issue, try again.");
      } else {
        Alert.alert("Error", e?.message || "Failed to award stripe");
      }
    } finally {
      setSaving(false);
    }
  };

  // ── Promote belt ────────────────────────────────────────────────────────────

  const handlePromoteBelt = () => {
    if (!data || !checkSchool(data.schoolId)) return;
    if (!canPromoteBelt(data.beltRank)) {
      Alert.alert(bt?.noMoreBelt ?? "Already at black belt");
      return;
    }
    const next = nextBelt(data.beltRank);
    Alert.alert(
      bt?.confirmPromoteBelt ?? "Promote Belt",
      `${bt?.confirmPromoteBeltMsg ?? "Promote student?"}\n\n${beltDisplayLabel(data.beltRank, data.stripes)} → ${next ? next.charAt(0).toUpperCase() + next.slice(1) : ""}`,
      [
        { text: ct?.cancel ?? "Cancel", style: "cancel" },
        { text: bt?.promoteBelt ?? "Promote", onPress: executePromoteBelt },
      ]
    );
  };

  const executePromoteBelt = async () => {
    if (!data) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const newBelt = nextBelt(data.beltRank);
    if (!newBelt) return;

    setSaving(true);
    try {
      let awardedByName = "Professor";
      try {
        const meSnap = await getDoc(doc(db, "users", uid));
        if (meSnap.exists()) {
          awardedByName = meSnap.data()?.displayName || meSnap.data()?.name || "Professor";
        }
      } catch {}

      await runTransaction(db, async (tx) => {
        const managerRef = doc(db, "users", uid);
        const userRef = doc(db, "users", studentId);

        const [managerSnap, studentSnap] = await Promise.all([
          tx.get(managerRef),
          tx.get(userRef),
        ]);

        if (!studentSnap.exists()) throw new Error("Student not found");
        const managerData = managerSnap.data();
        const current = studentSnap.data();

        const managerSchoolId = managerData?.schoolId ?? currentUserSchoolId;
        const studentSchoolId = current?.schoolId;
        if (studentSchoolId !== managerSchoolId) throw new Error("School mismatch");

        const historyEntry = {
          type: "belt",
          beltRank: newBelt,
          stripes: 0,
          awardedBy: uid,
          awardedByName,
          timestamp: new Date().toISOString(),
        };

        // 1) Update student direct fields (source of truth)
        tx.update(userRef, {
          beltRank: newBelt,
          stripes: 0,
          stripeProgress: 0,
          beltUpdatedAt: serverTimestamp(),
          beltAwardedBy: uid,
          beltAwardedByName: awardedByName,
          lastPromotion: serverTimestamp(),
          updatedAt: serverTimestamp(),
          // Backwards compat: append to beltHistory array
          beltHistory: arrayUnion(historyEntry),
        });

        // 2) Create progress_entries doc
        const progressRef = doc(collection(db, "progress_entries"));
        tx.set(progressRef, {
          schoolId: managerSchoolId,
          studentId,
          awardedBy: uid,
          awardedByName,
          type: "belt",
          beltRank: newBelt,
          stripes: 0,
          createdAt: serverTimestamp(),
        });
      });

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setData((prev) =>
        prev
          ? {
              ...prev,
              beltRank: newBelt,
              stripes: 0,
              stripeProgress: 0,
              beltHistory: [
                ...prev.beltHistory,
                {
                  type: "belt" as const,
                  beltRank: newBelt,
                  stripes: 0,
                  awardedBy: uid,
                  awardedByName,
                  timestamp: new Date().toISOString(),
                },
              ],
            }
          : prev
      );
      setSliderValue(0);
      setSliderDirty(false);

      setCelebType("belt");
      setCelebLabel(bt.beltPromoted);
      setCelebVisible(true);

      console.log("[BeltProgressCard] belt promoted to:", newBelt);
    } catch (e: any) {
      console.error("[BeltProgressCard] executePromoteBelt error:", e);
      if (e?.code === "permission-denied") {
        Alert.alert("Permission Denied", "You do not have permission to promote this student.");
      } else if (e?.code === "unavailable") {
        Alert.alert("Connection Issue", "Connection issue, try again.");
      } else {
        Alert.alert("Error", e?.message || "Failed to promote belt");
      }
    } finally {
      setSaving(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={{ alignItems: "center", padding: 24 }}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  if (!data) return null;

  const glowHex = beltColor(data.beltRank);
  const displayLabel = beltDisplayLabel(data.beltRank, data.stripes);
  const progressPct = clampStripeProgress(sliderValue);
  const canStripe = canAwardStripe(data.stripes);
  const canPromote = canPromoteBelt(data.beltRank);

  return (
    <>
      {/* Stripe Ceremony Overlay */}
      <StripeCeremonyOverlay
        visible={ceremonyVisible}
        studentName={studentName}
        beltRank={data.beltRank}
        phase="spotlight"
        onReady={handleCeremonyReady}
        onClose={handleCeremonySkip}
      />

      <BeltCelebration
        visible={celebVisible}
        type={celebType}
        beltRank={data.beltRank}
        label={celebLabel}
        onDone={() => setCelebVisible(false)}
      />

      <Animated.View
        entering={FadeInDown.springify()}
        style={{
          backgroundColor: C.card,
          borderRadius: 20,
          padding: 20,
          marginBottom: 16,
          borderWidth: 1,
          borderColor: glowHex + "30",
          shadowColor: glowHex,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.15,
          shadowRadius: 12,
          elevation: 4,
        }}
      >
        {/* Header row: title + MomentumRing */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
          <View
            style={{
              backgroundColor: glowHex + "20",
              borderRadius: 10,
              padding: 8,
              marginRight: 12,
            }}
          >
            <Award size={20} color={glowHex} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontWeight: "700", fontSize: 16 }}>
              {bt.beltAndStripes}
            </Text>
            <Text style={{ color: C.textMuted, fontSize: 12, marginTop: 1 }}>
              {studentName}
            </Text>
          </View>
          {intelligence && (
            <MomentumRing
              score={intelligence.smartScore.value}
              beltRank={data.beltRank}
              size={64}
              strokeWidth={5}
              showScore
              animate
            />
          )}
        </View>

        {/* Belt rank + stripes row */}
        <View
          style={{
            backgroundColor: glowHex + "12",
            borderRadius: 12,
            padding: 14,
            marginBottom: 14,
            borderWidth: 1,
            borderColor: glowHex + "25",
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.textMuted, fontSize: 11, marginBottom: 2 }}>Current rank</Text>
            <Text style={{ color: C.text, fontWeight: "700", fontSize: 18 }}>
              {displayLabel}
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
            {[0, 1, 2, 3].map((i) => (
              <View
                key={i}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: i < data.stripes ? glowHex : "rgba(255,255,255,0.12)",
                  borderWidth: 1,
                  borderColor: i < data.stripes ? glowHex + "80" : "rgba(255,255,255,0.08)",
                  shadowColor: i < data.stripes ? glowHex : "transparent",
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.8,
                  shadowRadius: 4,
                }}
              />
            ))}
            <View style={{ marginLeft: 8 }}>
              <BeltBadge beltRank={data.beltRank} stripes={data.stripes} size="md" />
            </View>
          </View>
        </View>

        {/* Promotion Readiness Bar */}
        {intelligence && (
          <Animated.View entering={FadeIn.delay(200).duration(400)} style={{ marginBottom: 14 }}>
            <PromotionReadinessBar readiness={intelligence.readiness} animate />
          </Animated.View>
        )}

        {/* Smart Recommendation toggle — manager only */}
        {isManager && intelligence && (
          <Animated.View
            entering={FadeIn.delay(300).duration(400)}
            style={{
              backgroundColor: C.purpleMuted,
              borderRadius: 12,
              padding: 12,
              marginBottom: 14,
              borderWidth: 1,
              borderColor: C.purple + "25",
            }}
          >
            <Pressable
              onPress={() => {
                setShowRecommendation((v) => !v);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Brain size={15} color={C.purple} />
              <Text style={{ color: C.purple, fontSize: 12, fontWeight: "600", flex: 1 }}>
                Smart Recommendation
              </Text>
              <Switch
                value={showRecommendation}
                onValueChange={(v) => {
                  setShowRecommendation(v);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                trackColor={{ false: "rgba(255,255,255,0.1)", true: C.purple + "60" }}
                thumbColor={showRecommendation ? C.purple : "rgba(255,255,255,0.4)"}
                style={{ transform: [{ scale: 0.8 }] }}
              />
            </Pressable>

            {showRecommendation && (
              <Animated.View
                entering={FadeInDown.duration(250)}
                style={{
                  marginTop: 10,
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 8,
                }}
              >
                <Lightbulb size={14} color={C.purple} style={{ marginTop: 1 }} />
                <Text
                  style={{
                    flex: 1,
                    color: "rgba(255,255,255,0.75)",
                    fontSize: 13,
                    lineHeight: 19,
                    fontStyle: "italic",
                  }}
                >
                  {intelligence.recommendation.text}
                </Text>
              </Animated.View>
            )}
          </Animated.View>
        )}

        {/* Stripe progress */}
        <View style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <TrendingUp size={14} color={C.textMuted} />
              <Text style={{ color: C.textMuted, fontSize: 13 }}>{bt.progressToNextStripe}</Text>
            </View>
            <Text style={{ color: glowHex, fontWeight: "700", fontSize: 14 }}>
              {progressPct}%
            </Text>
          </View>

          <StripeProgressBar value={progressPct} beltRank={data.beltRank} />

          <Slider
            style={{ width: "100%", height: 36, marginTop: 4 }}
            minimumValue={0}
            maximumValue={100}
            step={1}
            value={sliderValue}
            onValueChange={(v) => {
              setSliderValue(v);
              setSliderDirty(true);
            }}
            minimumTrackTintColor={glowHex}
            maximumTrackTintColor="rgba(255,255,255,0.12)"
            thumbTintColor={glowHex}
          />

          <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
            <Pressable
              onPress={() => {
                const v = clampStripeProgress(sliderValue - 10);
                setSliderValue(v);
                setSliderDirty(true);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                backgroundColor: C.inputBg,
                borderRadius: 10,
                paddingVertical: 10,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.06)",
              }}
            >
              <Minus size={14} color={C.textSub} />
              <Text style={{ color: C.textSub, fontWeight: "600", fontSize: 13 }}>10</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                const v = clampStripeProgress(sliderValue + 10);
                setSliderValue(v);
                setSliderDirty(true);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                backgroundColor: C.inputBg,
                borderRadius: 10,
                paddingVertical: 10,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.06)",
              }}
            >
              <Plus size={14} color={C.textSub} />
              <Text style={{ color: C.textSub, fontWeight: "600", fontSize: 13 }}>10</Text>
            </Pressable>

            {sliderDirty && (
              <Pressable
                onPress={handleSaveProgress}
                disabled={saving}
                style={{
                  flex: 2,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: C.accentMuted,
                  borderRadius: 10,
                  paddingVertical: 10,
                  borderWidth: 1,
                  borderColor: C.accent + "40",
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={C.accent} />
                ) : (
                  <Text style={{ color: C.accent, fontWeight: "700", fontSize: 13 }}>Save</Text>
                )}
              </Pressable>
            )}
          </View>
        </View>

        {/* Award Stripe + Promote Belt buttons */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              handleAwardStripe();
            }}
            disabled={saving || !canStripe}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              backgroundColor: canStripe ? C.accentMuted : "rgba(255,255,255,0.04)",
              borderRadius: 12,
              paddingVertical: 13,
              borderWidth: 1,
              borderColor: canStripe ? C.accent + "40" : "rgba(255,255,255,0.06)",
              opacity: saving || !canStripe ? 0.5 : 1,
            }}
          >
            <ChevronUp size={16} color={canStripe ? C.accent : C.textMuted} />
            <Text style={{ color: canStripe ? C.accent : C.textMuted, fontWeight: "700", fontSize: 13 }}>
              {bt.awardStripe}
            </Text>
          </Pressable>

          {isManager && (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                handlePromoteBelt();
              }}
              disabled={saving || !canPromote}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                backgroundColor: canPromote ? C.successMuted : "rgba(255,255,255,0.04)",
                borderRadius: 12,
                paddingVertical: 13,
                borderWidth: 1,
                borderColor: canPromote ? C.success + "40" : "rgba(255,255,255,0.06)",
                opacity: saving || !canPromote ? 0.5 : 1,
              }}
            >
              <Award size={16} color={canPromote ? C.success : C.textMuted} />
              <Text style={{ color: canPromote ? C.success : C.textMuted, fontWeight: "700", fontSize: 13 }}>
                {bt.promoteBelt}
              </Text>
            </Pressable>
          )}
        </View>
      </Animated.View>
    </>
  );
}
