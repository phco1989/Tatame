import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert } from "react-native";
import { create } from "zustand";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  type Timestamp,
} from "firebase/firestore";
import { Copy, Trash2, ToggleLeft, ToggleRight, Plus, Users } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";

import { db, ensureSignedIn, waitForAuthReady } from "@/lib/firebase-config";
import { useAuthStore } from "@/lib/state/auth-store";
import { useTenantStore, selectTenantId } from "@/lib/state/tenant-store";
import type { InviteCode, InviteCodeRole } from "@/types";

const INVITES_COL = "school_invites";

function random6DigitCode(): string {
  const num = Math.floor(Math.random() * 1000000);
  return num.toString().padStart(6, "0");
}

function toISO(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "toDate" in value) {
    return (value as Timestamp).toDate().toISOString();
  }
  return "";
}

function normalizeInviteDoc(docId: string, data: Record<string, unknown>): InviteCode {
  const schoolId = (data?.schoolId as string) ?? (data?.academyId as string) ?? "";
  return {
    id: docId,
    code: (data?.code as string) ?? docId,
    academyId: schoolId, // keep your UI/type expecting academyId, but treat it as schoolId
    role: ((data?.role as string) ?? "student") as InviteCodeRole,
    active: !!data?.active,
    usedCount: Number(data?.usedCount ?? 0),
    createdBy: (data?.createdBy as string) ?? "",
    createdAt: toISO(data?.createdAt),
    lastUsedAt: toISO(data?.lastUsedAt),
  };
}

type InviteCodeState = {
  codes: InviteCode[];
  isLoading: boolean;
  loadCodes: (schoolId: string) => Promise<void>;
  generateCode: (schoolId: string, role: InviteCodeRole, userId: string) => Promise<string>;
  toggleCodeActive: (codeId: string) => Promise<void>;
  deleteCode: (codeId: string) => Promise<void>;
};

export const useInviteCodeStore = create<InviteCodeState>((set, get) => ({
  codes: [],
  isLoading: false,

  loadCodes: async (schoolId: string) => {
    if (!schoolId) return;
    set({ isLoading: true });
    try {
      await waitForAuthReady();
      await ensureSignedIn();

      // Prefer canonical "schoolId"
      const q1 = query(collection(db, INVITES_COL), where("schoolId", "==", schoolId));
      const snap1 = await getDocs(q1);
      const docs1 = snap1.docs.map((d) => normalizeInviteDoc(d.id, d.data() as any));

      // Backward-compat: legacy "academyId"
      const q2 = query(collection(db, INVITES_COL), where("academyId", "==", schoolId));
      const snap2 = await getDocs(q2);
      const docs2 = snap2.docs
        .map((d) => normalizeInviteDoc(d.id, d.data() as any))
        .filter((d) => !docs1.some((x) => x.id === d.id));

      // Show active first, then inactive; newest first if you store createdAt
      const merged = [...docs1, ...docs2].sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return (b.createdAt || "").localeCompare(a.createdAt || "");
      });

      set({ codes: merged });
    } catch (e) {
      console.warn("[InviteCodes] loadCodes failed:", e);
    } finally {
      set({ isLoading: false });
    }
  },

  generateCode: async (schoolId: string, role: InviteCodeRole, userId: string) => {
    if (!schoolId) throw new Error("Missing schoolId");
    if (role !== "student" && role !== "coach") throw new Error("Invalid role");

    await waitForAuthReady();
    await ensureSignedIn();

    for (let attempt = 0; attempt < 12; attempt++) {
      const code = random6DigitCode();
      const ref = doc(db, INVITES_COL, code);

      try {
        await runTransaction(db, async (tx) => {
          const existing = await tx.get(ref);
          if (existing.exists()) throw new Error("code_exists");

          // Write BOTH fields so old UI and new rules work
          tx.set(ref, {
            code,
            schoolId,
            academyId: schoolId,
            role,
            active: true,
            usedCount: 0,
            createdBy: userId,
            createdAt: serverTimestamp(),
            lastUsedAt: null,
            redeemedBy: null,
            redeemedAt: null,
          });
        });

        // optimistic update; still reload after
        set((s) => ({
          codes: [
            {
              id: code,
              code,
              academyId: schoolId,
              role,
              active: true,
              usedCount: 0,
              createdBy: userId,
              createdAt: new Date().toISOString(),
              lastUsedAt: undefined,
            },
            ...s.codes,
          ],
        }));

        return code;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("code_exists")) continue;
        throw e;
      }
    }

    throw new Error("Failed to generate unique code. Try again.");
  },

  toggleCodeActive: async (codeId: string) => {
    await waitForAuthReady();
    await ensureSignedIn();

    const current = get().codes.find((c) => c.id === codeId);
    if (!current) return;

    await updateDoc(doc(db, INVITES_COL, codeId), { active: !current.active });
    set((s) => ({ codes: s.codes.map((c) => (c.id === codeId ? { ...c, active: !c.active } : c)) }));
  },

  deleteCode: async (codeId: string) => {
    await waitForAuthReady();
    await ensureSignedIn();

    await deleteDoc(doc(db, INVITES_COL, codeId));
    set((s) => ({ codes: s.codes.filter((c) => c.id !== codeId) }));
  },
}));

function InviteCodeCard({
  invite,
  onToggle,
  onDelete,
  onCopy,
}: {
  invite: InviteCode;
  onToggle: () => void;
  onDelete: () => void;
  onCopy: () => void;
}) {
  return (
    <Animated.View entering={FadeInDown.springify()}>
      <View
        className="bg-white rounded-2xl p-4 mb-3 border border-gray-100"
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        <View className="flex-row items-center justify-between mb-2">
          <View className={`px-2 py-1 rounded-full ${invite.active ? "bg-green-100" : "bg-gray-100"}`}>
            <Text className={`text-xs font-medium ${invite.active ? "text-green-700" : "text-gray-500"}`}>
              {invite.active ? "Active" : "Inactive"}
            </Text>
          </View>

          <View className={`px-2 py-1 rounded-full ${invite.role === "coach" ? "bg-blue-100" : "bg-purple-100"}`}>
            <Text className={`text-xs font-medium ${invite.role === "coach" ? "text-blue-700" : "text-purple-700"}`}>
              {invite.role === "coach" ? "Coach" : "Student"}
            </Text>
          </View>
        </View>

        <Text className="text-2xl font-bold text-gray-900 tracking-wider text-center my-3">{invite.code}</Text>

        <View className="flex-row items-center justify-center mb-3">
          <Users size={14} color="#6B7280" />
          <Text className="text-gray-500 text-sm ml-1">
            Used {invite.usedCount} time{invite.usedCount !== 1 ? "s" : ""}
          </Text>
        </View>

        <View className="flex-row pt-3 border-t border-gray-100">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onCopy();
            }}
            className="flex-1 flex-row items-center justify-center py-2 bg-gray-50 rounded-lg mr-2"
          >
            <Copy size={16} color="#6B7280" />
            <Text className="text-gray-600 text-sm ml-1">Copy</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onToggle();
            }}
            className="flex-1 flex-row items-center justify-center py-2 bg-gray-50 rounded-lg mr-2"
          >
            {invite.active ? <ToggleRight size={16} color="#059669" /> : <ToggleLeft size={16} color="#6B7280" />}
            <Text className="text-gray-600 text-sm ml-1">{invite.active ? "On" : "Off"}</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onDelete();
            }}
            className="flex-1 flex-row items-center justify-center py-2 bg-red-50 rounded-lg"
          >
            <Trash2 size={16} color="#DC2626" />
            <Text className="text-red-600 text-sm ml-1">Delete</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

export function InviteCodesSection() {
  const schoolId = useTenantStore(selectTenantId);
  const user = useAuthStore((s) => s.user);

  const codes = useInviteCodeStore((s) => s.codes);
  const isLoading = useInviteCodeStore((s) => s.isLoading);
  const loadCodes = useInviteCodeStore((s) => s.loadCodes);
  const generateCode = useInviteCodeStore((s) => s.generateCode);
  const toggleCodeActive = useInviteCodeStore((s) => s.toggleCodeActive);
  const deleteCode = useInviteCodeStore((s) => s.deleteCode);

  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (schoolId) loadCodes(schoolId);
  }, [schoolId, loadCodes]);

  const schoolCodes = useMemo(() => codes.filter((c) => c.academyId === schoolId), [codes, schoolId]);

  const handleGenerate = async (role: InviteCodeRole) => {
    if (!schoolId || !user?.id) {
      Alert.alert("Error", "Missing school or user info");
      return;
    }
    setGenerating(true);
    try {
      const code = await generateCode(schoolId, role, user.id);
      await loadCodes(schoolId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Code Created", `New ${role} invite code: ${code}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to generate code";
      Alert.alert("Error", msg);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async (code: string) => {
    await Clipboard.setStringAsync(code);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Copied", `Code ${code} copied`);
  };

  const handleDelete = (codeId: string, code: string) => {
    Alert.alert("Delete Code", `Delete invite code ${code}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteCode(codeId);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {
            Alert.alert("Error", "Failed to delete code");
          }
        },
      },
    ]);
  };

  const handleToggle = async (codeId: string) => {
    try {
      await toggleCodeActive(codeId);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      Alert.alert("Error", "Failed to toggle code");
    }
  };

  if (isLoading && codes.length === 0) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#0070B8" />
        <Text className="text-gray-500 mt-4">Loading invite codes...</Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 px-4 pt-4" showsVerticalScrollIndicator={false}>
      <Text className="text-lg font-bold text-gray-800 mb-3">Generate New Codes</Text>

      <View className="flex-row mb-6">
        <Pressable
          onPress={() => handleGenerate("student")}
          disabled={generating}
          className={`flex-1 flex-row items-center justify-center py-3 rounded-xl mr-2 ${
            generating ? "bg-gray-200" : "bg-purple-500"
          }`}
        >
          <Plus size={18} color="white" />
          <Text className="text-white font-medium ml-2">Student Code</Text>
        </Pressable>

        <Pressable
          onPress={() => handleGenerate("coach")}
          disabled={generating}
          className={`flex-1 flex-row items-center justify-center py-3 rounded-xl ml-2 ${
            generating ? "bg-gray-200" : "bg-blue-500"
          }`}
        >
          <Plus size={18} color="white" />
          <Text className="text-white font-medium ml-2">Coach Code</Text>
        </Pressable>
      </View>

      <Text className="text-lg font-bold text-gray-800 mb-3">Codes ({schoolCodes.length})</Text>

      {schoolCodes.length === 0 ? (
        <View className="items-center py-12 bg-gray-50 rounded-2xl">
          <Users size={48} color="#9CA3AF" />
          <Text className="text-gray-400 mt-4 text-center">
            No invite codes yet.{"\n"}Generate one above to get started.
          </Text>
        </View>
      ) : (
        schoolCodes.map((invite) => (
          <InviteCodeCard
            key={invite.id}
            invite={invite}
            onToggle={() => handleToggle(invite.id)}
            onDelete={() => handleDelete(invite.id, invite.code)}
            onCopy={() => handleCopy(invite.code)}
          />
        ))
      )}

      <View className="h-8" />
    </ScrollView>
  );
}