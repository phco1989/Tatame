/**
 * Competition Mural Screen
 *
 * Full competition calendar/event board.
 * - Shows upcoming competitions sorted by nearest date
 * - Past competitions in a separate collapsed section
 * - Managers can create, edit, delete competitions
 * - Students/coaches can confirm they are competing
 * - Route: /competition-mural
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput,
  StyleSheet,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import {
  Trophy,
  ChevronLeft,
  Plus,
  CalendarDays,
  MapPin,
  ChevronRight,
  Clock,
  Users,
  CheckCircle2,
  Swords,
  X,
  Pencil,
  Trash2,
  ChevronDown,
} from "lucide-react-native";
import { useUserRole } from "@/lib/hooks/useUserRole";
import { useT } from "@/lib/i18n/useTranslations";
import {
  fetchAllCompetitions,
  fetchParticipants,
  checkAlreadyRegistered,
  registerForCompetition,
  createCompetition,
  updateCompetition,
  deleteCompetition,
  type Competition,
  type CompetitionParticipant,
} from "@/lib/competitions";
import { waitForAuthReady, auth, db } from "@/lib/firebase-config";
import { doc, getDoc } from "firebase/firestore";

// ─── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg: "#0B1220",
  card: "#111827",
  cardBorder: "rgba(255,255,255,0.06)",
  text: "#FFFFFF",
  textSecondary: "rgba(255,255,255,0.70)",
  textMuted: "rgba(255,255,255,0.45)",
  accent: "#FBBF24",
  accentMuted: "rgba(251,191,36,0.15)",
  accentGlow: "rgba(251,191,36,0.25)",
  blue: "#4C7BF4",
  blueMuted: "rgba(76,123,244,0.15)",
  green: "#10B981",
  greenMuted: "rgba(16,185,129,0.15)",
  red: "#EF4444",
  redMuted: "rgba(239,68,68,0.15)",
  inputBg: "#1F2937",
  border: "rgba(255,255,255,0.08)",
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function daysUntil(date: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

type SignupStatus = "open" | "closing_soon" | "closed" | "no_deadline";

function getSignupStatus(comp: Competition): SignupStatus {
  if (!comp.registrationDeadline) return "no_deadline";
  const now = new Date();
  if (comp.registrationDeadline < now) return "closed";
  const daysLeft = daysUntil(comp.registrationDeadline);
  if (daysLeft <= 7) return "closing_soon";
  return "open";
}

function SignupStatusPill({ status, labels }: { status: SignupStatus; labels: { open: string; closingSoon: string; closed: string } }) {
  if (status === "no_deadline") return null;
  const config = {
    open: { label: labels.open, bg: C.greenMuted, color: C.green },
    closing_soon: { label: labels.closingSoon, bg: C.accentMuted, color: C.accent },
    closed: { label: labels.closed, bg: C.redMuted, color: C.red },
  }[status];
  return (
    <View style={{ backgroundColor: config.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start" }}>
      <Text style={{ color: config.color, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 }}>{config.label}</Text>
    </View>
  );
}

// ─── Form state ─────────────────────────────────────────────────────────────────

interface FormState {
  name: string;
  organization: string;
  location: string;
  eventDateStr: string;
  deadlineDateStr: string;
  registrationLink: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  organization: "",
  location: "",
  eventDateStr: "",
  deadlineDateStr: "",
  registrationLink: "",
  notes: "",
};

function competitionToForm(comp: Competition): FormState {
  const toStr = (d: Date | null) =>
    d ? d.toISOString().slice(0, 10) : "";
  return {
    name: comp.name,
    organization: comp.organization ?? "",
    location: comp.location ?? "",
    eventDateStr: toStr(comp.eventDate),
    deadlineDateStr: toStr(comp.registrationDeadline),
    registrationLink: comp.registrationLink ?? "",
    notes: comp.notes ?? "",
  };
}

// ─── Competition row card ───────────────────────────────────────────────────────

interface CompRowProps {
  comp: Competition;
  isPast: boolean;
  userId: string | null;
  schoolId: string;
  userRole: string;
  userName: string;
  userBeltRank: string | null;
  canManage: boolean;
  onEdit: (comp: Competition) => void;
  onDelete: (comp: Competition) => void;
}

function CompetitionRow({
  comp,
  isPast,
  userId,
  schoolId,
  userRole,
  userName,
  userBeltRank,
  canManage,
  onEdit,
  onDelete,
}: CompRowProps) {
  const router = useRouter();
  const c = useT("competitions");
  const [participants, setParticipants] = useState<CompetitionParticipant[]>([]);
  const [registered, setRegistered] = useState(false);
  const [registering, setRegistering] = useState(false);

  const signupStatus = getSignupStatus(comp);
  const isDeadlinePassed = signupStatus === "closed";
  const days = isPast ? -1 : daysUntil(comp.eventDate);

  useEffect(() => {
    let cancelled = false;
    fetchParticipants(comp.id).then((p) => { if (!cancelled) setParticipants(p); }).catch(() => {});
    if (userId) {
      checkAlreadyRegistered(comp.id, userId).then((id) => { if (!cancelled) setRegistered(id !== null); }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [comp.id, userId]);

  const handleRegister = async () => {
    if (!userId || !schoolId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRegistering(true);
    try {
      await waitForAuthReady();
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("Not authenticated");
      const id = await registerForCompetition({ competitionId: comp.id, schoolId, studentUid: uid, studentName: userName, beltRank: userBeltRank });
      setRegistered(id !== null);
      setParticipants((prev) => [...prev, { id, competitionId: comp.id, schoolId, studentUid: uid, studentName: userName, beltRank: userBeltRank, weight: null, registeredAt: new Date() }]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      Alert.alert(c.errorTitle, err instanceof Error ? err.message : c.failedRegister);
    } finally {
      setRegistering(false);
    }
  };

  // Group participants by belt for manager view
  const beltOrder = ["black", "brown", "purple", "blue", "white"];
  const grouped = beltOrder
    .map((belt) => ({ belt, members: participants.filter((p) => (p.beltRank ?? "white") === belt) }))
    .filter((g) => g.members.length > 0);
  const ungrouped = participants.filter((p) => !p.beltRank);

  const isUpcoming = !isPast;
  const statusLabels = { open: c.open, closingSoon: c.closingSoon, closed: c.closed };

  return (
    <Animated.View entering={FadeInDown.springify()} style={{ marginBottom: 12 }}>
      <View
        style={{
          backgroundColor: C.card,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: isUpcoming && days <= 30 ? C.accentGlow : C.cardBorder,
          overflow: "hidden",
        }}
      >
        {/* Main card body — tap to open detail */}
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push({ pathname: "/competition-detail", params: { competitionId: comp.id } });
          }}
          style={({ pressed }) => ({ padding: 18, opacity: pressed ? 0.88 : 1 })}
        >
          {/* Top: date badge + info + countdown */}
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
            {/* Date badge */}
            <View style={{
              width: 50,
              height: 56,
              borderRadius: 14,
              backgroundColor: isPast ? "rgba(255,255,255,0.04)" : C.accentMuted,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: isPast ? "rgba(255,255,255,0.06)" : C.accentGlow,
              flexShrink: 0,
            }}>
              <Text style={{ color: isPast ? C.textMuted : C.accent, fontSize: 9, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" }}>
                {comp.eventDate.toLocaleDateString(undefined, { month: "short" })}
              </Text>
              <Text style={{ color: isPast ? C.textMuted : C.accent, fontSize: 22, fontWeight: "800", lineHeight: 26 }}>
                {comp.eventDate.getDate()}
              </Text>
              <Text style={{ color: isPast ? C.textMuted : C.accent, fontSize: 9, fontWeight: "600" }}>
                {comp.eventDate.getFullYear()}
              </Text>
            </View>

            {/* Info */}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                <SignupStatusPill status={signupStatus} labels={statusLabels} />
                {days === 0 && <View style={{ backgroundColor: C.redMuted, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}><Text style={{ color: C.red, fontSize: 9, fontWeight: "700", letterSpacing: 0.5 }}>{c.today.toUpperCase()}</Text></View>}
              </View>
              <Text style={{ color: isPast ? C.textSecondary : C.text, fontSize: 16, fontWeight: "700", marginBottom: 2 }} numberOfLines={2}>
                {comp.name}
              </Text>
              {comp.organization && (
                <Text style={{ color: C.textMuted, fontSize: 12, marginBottom: 6 }} numberOfLines={1}>{comp.organization}</Text>
              )}
              <View style={{ gap: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <CalendarDays size={11} color={C.accent} />
                  <Text style={{ color: C.textSecondary, fontSize: 12 }}>{formatDate(comp.eventDate)}</Text>
                </View>
                {comp.location && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <MapPin size={11} color={C.textMuted} />
                    <Text style={{ color: C.textMuted, fontSize: 12 }} numberOfLines={1}>{comp.location}</Text>
                  </View>
                )}
                {comp.registrationDeadline && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <Clock size={11} color={isDeadlinePassed ? C.red : C.textMuted} />
                    <Text style={{ color: isDeadlinePassed ? C.red : C.textMuted, fontSize: 12 }}>
                      {c.deadline}: {formatShortDate(comp.registrationDeadline)}
                    </Text>
                  </View>
                )}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <Users size={11} color={C.textMuted} />
                  <Text style={{ color: C.textMuted, fontSize: 12 }}>
                    {participants.length} {c.registered}
                  </Text>
                </View>
              </View>
            </View>

            {/* Right: countdown + chevron */}
            <View style={{ alignItems: "center", gap: 6 }}>
              {!isPast && days >= 0 && (
                <View style={{
                  backgroundColor: days <= 7 ? C.redMuted : days <= 30 ? C.accentMuted : C.blueMuted,
                  borderRadius: 8,
                  paddingHorizontal: 7,
                  paddingVertical: 3,
                }}>
                  <Text style={{ color: days <= 7 ? C.red : days <= 30 ? C.accent : C.blue, fontSize: 10, fontWeight: "700" }}>
                    {days === 0 ? c.today : `${days}d`}
                  </Text>
                </View>
              )}
              <ChevronRight size={14} color={C.textMuted} />
            </View>
          </View>

          {/* Signup CTA */}
          {!isPast && !isDeadlinePassed && !registered && (
            <Pressable
              onPress={(e) => { e.stopPropagation?.(); handleRegister(); }}
              disabled={registering}
              style={({ pressed }) => ({
                marginTop: 14,
                backgroundColor: pressed || registering ? "rgba(251,191,36,0.7)" : C.accent,
                borderRadius: 12,
                paddingVertical: 10,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              })}
            >
              {registering ? <ActivityIndicator size="small" color="#0B1220" /> : (
                <>
                  <Swords size={14} color="#0B1220" />
                  <Text style={{ color: "#0B1220", fontSize: 13, fontWeight: "700" }}>{c.imCompeting}</Text>
                </>
              )}
            </Pressable>
          )}

          {registered && (
            <View style={{
              marginTop: 14,
              backgroundColor: C.greenMuted,
              borderRadius: 12,
              paddingVertical: 10,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              borderWidth: 1,
              borderColor: "rgba(16,185,129,0.25)",
            }}>
              <CheckCircle2 size={14} color={C.green} />
              <Text style={{ color: C.green, fontSize: 13, fontWeight: "700" }}>{c.youreRegistered}</Text>
            </View>
          )}

          {!isPast && isDeadlinePassed && !registered && (
            <View style={{ marginTop: 14, backgroundColor: C.redMuted, borderRadius: 12, paddingVertical: 10, alignItems: "center" }}>
              <Text style={{ color: C.red, fontSize: 12, fontWeight: "600" }}>{c.registrationClosed}</Text>
            </View>
          )}
        </Pressable>

        {/* Manager: participant list grouped by belt */}
        {canManage && participants.length > 0 && (
          <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingHorizontal: 18, paddingVertical: 14 }}>
            <Text style={{ color: C.textMuted, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
              {c.team} ({participants.length})
            </Text>
            {grouped.map((group) => (
              <View key={group.belt} style={{ marginBottom: 8 }}>
                <Text style={{ color: C.textMuted, fontSize: 10, fontWeight: "700", textTransform: "capitalize", letterSpacing: 0.5, marginBottom: 4 }}>
                  {c.beltGroup.replace("{belt}", group.belt)}
                </Text>
                {group.members.map((p) => (
                  <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: C.inputBg, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: C.textMuted, fontSize: 12, fontWeight: "700" }}>{(p.studentName?.[0] ?? "?").toUpperCase()}</Text>
                    </View>
                    <Text style={{ color: C.textSecondary, fontSize: 13 }}>{p.studentName}</Text>
                  </View>
                ))}
              </View>
            ))}
            {ungrouped.map((p) => (
              <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: C.inputBg, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: C.textMuted, fontSize: 12, fontWeight: "700" }}>{(p.studentName?.[0] ?? "?").toUpperCase()}</Text>
                </View>
                <Text style={{ color: C.textSecondary, fontSize: 13 }}>{p.studentName}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Manager: edit/delete actions */}
        {canManage && (
          <View style={{
            flexDirection: "row",
            borderTopWidth: 1,
            borderTopColor: C.border,
          }}>
            <Pressable
              onPress={() => onEdit(comp)}
              style={({ pressed }) => ({
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                paddingVertical: 12,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Pencil size={14} color={C.blue} />
              <Text style={{ color: C.blue, fontSize: 13, fontWeight: "600" }}>{c.edit}</Text>
            </Pressable>
            <View style={{ width: 1, backgroundColor: C.border }} />
            <Pressable
              onPress={() => onDelete(comp)}
              style={({ pressed }) => ({
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                paddingVertical: 12,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Trash2 size={14} color={C.red} />
              <Text style={{ color: C.red, fontSize: 13, fontWeight: "600" }}>{c.delete}</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

// ─── Inline form (create / edit) ───────────────────────────────────────────────

function CompetitionForm({
  title,
  form,
  onChangeForm,
  onSubmit,
  onCancel,
  submitting,
}: {
  title: string;
  form: FormState;
  onChangeForm: (f: FormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  const c = useT("competitions");
  const fields: Array<{ label: string; key: keyof FormState; placeholder: string; multiline?: boolean }> = [
    { label: c.competitionName, key: "name", placeholder: "e.g. São Paulo Open" },
    { label: c.organization, key: "organization", placeholder: "e.g. IBJJF" },
    { label: c.location, key: "location", placeholder: "e.g. São Paulo, Brazil" },
    { label: c.eventDate, key: "eventDateStr", placeholder: "2025-09-14" },
    { label: c.registrationDeadline, key: "deadlineDateStr", placeholder: "2025-08-30" },
    { label: c.registrationLink, key: "registrationLink", placeholder: "https://..." },
    { label: c.notes, key: "notes", placeholder: "...", multiline: true },
  ];

  return (
    <Animated.View
      entering={FadeInDown.springify()}
      style={{ backgroundColor: C.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: C.accentGlow, marginBottom: 20 }}
    >
      <Text style={{ color: C.text, fontSize: 17, fontWeight: "700", marginBottom: 16 }}>{title}</Text>
      {fields.map((field) => (
        <View key={field.key} style={{ marginBottom: 12 }}>
          <Text style={s.fieldLabel}>{field.label}</Text>
          <TextInput
            style={[s.input, field.multiline && { height: 72, textAlignVertical: "top" }]}
            placeholder={field.placeholder}
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={form[field.key]}
            onChangeText={(v) => onChangeForm({ ...form, [field.key]: v })}
            multiline={field.multiline}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      ))}
      <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
        <Pressable
          onPress={onCancel}
          style={{ flex: 1, backgroundColor: C.inputBg, borderRadius: 14, paddingVertical: 13, alignItems: "center" }}
        >
          <Text style={{ color: C.textMuted, fontWeight: "600" }}>{c.cancel}</Text>
        </Pressable>
        <Pressable
          onPress={onSubmit}
          disabled={submitting}
          style={{ flex: 2, backgroundColor: C.accent, borderRadius: 14, paddingVertical: 13, alignItems: "center", opacity: submitting ? 0.6 : 1 }}
        >
          {submitting ? <ActivityIndicator size="small" color="#0B1220" /> : (
            <Text style={{ color: "#0B1220", fontWeight: "700", fontSize: 15 }}>{c.save}</Text>
          )}
        </Pressable>
      </View>
    </Animated.View>
  );
}

// ─── Main Screen ────────────────────────────────────────────────────────────────

export default function CompetitionMuralScreen() {
  const router = useRouter();
  const c = useT("competitions");
  const { role, schoolId, loading: roleLoading } = useUserRole();
  const uid = auth.currentUser?.uid ?? null;
  const [allComps, setAllComps] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingComp, setEditingComp] = useState<Competition | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [showPast, setShowPast] = useState(false);

  // User profile for registration
  const [userName, setUserName] = useState("Member");
  const [userBeltRank, setUserBeltRank] = useState<string | null>(null);

  const canManage = role === "manager";

  const loadData = useCallback(async () => {
    if (!schoolId) return;
    try {
      const data = await fetchAllCompetitions(schoolId);
      setAllComps(data);
    } catch (err) {
      console.warn("[CompetitionMural] load error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [schoolId]);

  useEffect(() => {
    if (schoolId) loadData();
  }, [schoolId]);

  useFocusEffect(useCallback(() => { if (schoolId) loadData(); }, [schoolId]));

  // Load user profile
  useEffect(() => {
    if (!uid) return;
    getDoc(doc(db, "users", uid)).then((snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setUserName((d.name as string) ?? "Member");
        setUserBeltRank((d.beltRank as string) ?? null);
      }
    }).catch(() => {});
  }, [uid]);

  const now = new Date();
  const upcoming = allComps.filter((comp) => comp.eventDate >= now).sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime());
  const past = allComps.filter((comp) => comp.eventDate < now).sort((a, b) => b.eventDate.getTime() - a.eventDate.getTime());

  function parseFormToOpts(f: FormState): { eventDate: Date; deadline: Date | null } | null {
    const eventDate = new Date(f.eventDateStr.trim());
    if (isNaN(eventDate.getTime())) {
      Alert.alert(c.invalidDate, c.enterValidDate);
      return null;
    }
    let deadline: Date | null = null;
    if (f.deadlineDateStr.trim()) {
      deadline = new Date(f.deadlineDateStr.trim());
      if (isNaN(deadline.getTime())) {
        Alert.alert(c.invalidDeadline, c.enterValidDeadline);
        return null;
      }
    }
    return { eventDate, deadline };
  }

  const handleCreate = async () => {
    if (!form.name.trim()) { Alert.alert(c.required, c.enterName); return; }
    const parsed = parseFormToOpts(form);
    if (!parsed) return;

    setSubmitting(true);
    try {
      await waitForAuthReady();
      const currentUid = auth.currentUser?.uid;
      if (!currentUid || !schoolId) throw new Error("Not authenticated");
      const userSnap = await getDoc(doc(db, "users", currentUid));
      const creatorName = userSnap.exists() ? (userSnap.data().name as string) ?? "Unknown" : "Unknown";

      await createCompetition({
        schoolId,
        name: form.name.trim(),
        organization: form.organization.trim() || null,
        location: form.location.trim() || null,
        eventDate: parsed.eventDate,
        registrationDeadline: parsed.deadline,
        registrationLink: form.registrationLink.trim() || null,
        notes: form.notes.trim() || null,
        createdBy: currentUid,
        createdByName: creatorName,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setForm(EMPTY_FORM);
      setShowCreate(false);
      loadData();
    } catch (err: unknown) {
      Alert.alert(c.errorTitle, err instanceof Error ? err.message : c.failedCreate);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingComp) return;
    if (!form.name.trim()) { Alert.alert(c.required, c.enterName); return; }
    const parsed = parseFormToOpts(form);
    if (!parsed) return;

    setSubmitting(true);
    try {
      await updateCompetition(editingComp.id, {
        name: form.name.trim(),
        organization: form.organization.trim() || null,
        location: form.location.trim() || null,
        eventDate: parsed.eventDate,
        registrationDeadline: parsed.deadline,
        registrationLink: form.registrationLink.trim() || null,
        notes: form.notes.trim() || null,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditingComp(null);
      setForm(EMPTY_FORM);
      loadData();
    } catch (err: unknown) {
      Alert.alert(c.errorTitle, err instanceof Error ? err.message : c.failedUpdate);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (comp: Competition) => {
    Alert.alert(
      c.deleteTitle,
      c.deleteConfirm.replace("{name}", comp.name),
      [
        { text: c.cancel, style: "cancel" },
        {
          text: c.delete,
          style: "destructive",
          onPress: async () => {
            try {
              await deleteCompetition(comp.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              loadData();
            } catch (err: unknown) {
              Alert.alert(c.errorTitle, err instanceof Error ? err.message : c.failedDelete);
            }
          },
        },
      ]
    );
  };

  const handleEditPress = (comp: Competition) => {
    setEditingComp(comp);
    setForm(competitionToForm(comp));
    setShowCreate(false);
  };

  if (roleLoading || (loading && !refreshing)) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={C.accent} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
          <Pressable onPress={() => router.back()} style={s.iconBtn}>
            <ChevronLeft size={20} color={C.text} />
          </Pressable>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
            <Trophy size={20} color={C.accent} />
            <Text style={{ color: C.text, fontSize: 20, fontWeight: "700" }}>{c.mural}</Text>
          </View>
          {canManage && (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (showCreate) { setShowCreate(false); setForm(EMPTY_FORM); }
                else { setShowCreate(true); setEditingComp(null); setForm(EMPTY_FORM); }
              }}
              style={[s.iconBtn, showCreate && { backgroundColor: C.accent }]}
            >
              {showCreate ? <X size={18} color="#0B1220" /> : <Plus size={20} color={C.text} />}
            </Pressable>
          )}
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={C.accent} />}
        >
          {/* Create form */}
          {showCreate && canManage && (
            <CompetitionForm
              title={c.newCompetition}
              form={form}
              onChangeForm={setForm}
              onSubmit={handleCreate}
              onCancel={() => { setShowCreate(false); setForm(EMPTY_FORM); }}
              submitting={submitting}
            />
          )}

          {/* Edit form */}
          {editingComp && canManage && (
            <CompetitionForm
              title={c.editCompetition}
              form={form}
              onChangeForm={setForm}
              onSubmit={handleUpdate}
              onCancel={() => { setEditingComp(null); setForm(EMPTY_FORM); }}
              submitting={submitting}
            />
          )}

          {/* Upcoming */}
          {upcoming.length === 0 && !showCreate && !editingComp ? (
            <View style={{ alignItems: "center", paddingTop: 60, paddingBottom: 40 }}>
              <Trophy size={48} color={C.textMuted} />
              <Text style={{ color: C.textMuted, fontSize: 16, textAlign: "center", lineHeight: 24, marginTop: 16 }}>
                {c.noUpcoming}{canManage ? `\n${c.tapPlus}` : ""}
              </Text>
            </View>
          ) : (
            <>
              {upcoming.length > 0 && (
                <>
                  <Text style={{ color: C.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
                    {c.upcoming} ({upcoming.length})
                  </Text>
                  {upcoming.map((comp) => (
                    <CompetitionRow
                      key={comp.id}
                      comp={comp}
                      isPast={false}
                      userId={uid ?? null}
                      schoolId={schoolId ?? ""}
                      userRole={role ?? "student"}
                      userName={userName}
                      userBeltRank={userBeltRank}
                      canManage={canManage}
                      onEdit={handleEditPress}
                      onDelete={handleDelete}
                    />
                  ))}
                </>
              )}
            </>
          )}

          {/* Past competitions */}
          {past.length > 0 && (
            <>
              <Pressable
                onPress={() => setShowPast((v) => !v)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 8,
                  marginBottom: 12,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ color: C.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 }}>
                  {c.past} ({past.length})
                </Text>
                <ChevronDown size={14} color={C.textMuted} style={{ transform: [{ rotate: showPast ? "180deg" : "0deg" }] }} />
              </Pressable>

              {showPast && past.map((comp) => (
                <CompetitionRow
                  key={comp.id}
                  comp={comp}
                  isPast={true}
                  userId={uid ?? null}
                  schoolId={schoolId ?? ""}
                  userRole={role ?? "student"}
                  userName={userName}
                  userBeltRank={userBeltRank}
                  canManage={canManage}
                  onEdit={handleEditPress}
                  onDelete={handleDelete}
                />
              ))}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#1F2937",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  fieldLabel: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    marginBottom: 5,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: "#1F2937",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: "#FFFFFF",
    fontSize: 14,
  },
});
