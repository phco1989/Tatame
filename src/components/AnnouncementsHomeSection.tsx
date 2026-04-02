/**
 * AnnouncementsHomeSection
 * Preview of the 3 most recent announcements shown on the Home screen.
 * - "See all" button opens AnnouncementsModal (full feed)
 * - Inline like toggle
 * - No comments
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
} from "react-native";
import {
  Heart,
  ChevronRight,
  Megaphone,
} from "lucide-react-native";
import Animated, {
  FadeInDown,
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDoc,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  runTransaction,
  increment,
} from "firebase/firestore";
import { formatDistanceToNow } from "date-fns";
import { db } from "@/lib/firebase-config";
import { AnnouncementsModal } from "./AnnouncementsModal";
import { BeltBadge } from "@/components/BeltBadge";
import type { UserRole } from "@/lib/hooks/useCurrentUser";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PreviewAnnouncement {
  id: string;
  authorName: string;
  authorRole: string;
  authorBeltRank?: string | null;
  authorStripes?: number | null;
  text: string;
  likesCount: number;
  isLiked: boolean;
  createdAt: Date | null;
}

interface AnnouncementsHomeSectionProps {
  schoolId: string;
  userId: string;
  userRole: UserRole;
  userName: string;
  authorPhotoURL?: string;
  authorBeltRank?: string | null;
  authorStripes?: number | null;
  delay?: number;
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const C = {
  glass: "rgba(255,255,255,0.05)",
  border: "rgba(255,255,255,0.08)",
  text: "#FFFFFF",
  textSub: "rgba(255,255,255,0.7)",
  textMuted: "rgba(255,255,255,0.5)",
  accent: "#4C7BF4",
  red: "#EF4444",
  badge: {
    manager: { bg: "rgba(124,58,237,0.18)", text: "#A78BFA" },
    coach: { bg: "rgba(5,150,105,0.18)", text: "#6EE7B7" },
    student: { bg: "rgba(8,145,178,0.18)", text: "#67E8F9" },
  },
};

function roleBadge(role: string) {
  if (role === "manager") return C.badge.manager;
  if (role === "coach") return C.badge.coach;
  return C.badge.student;
}

function fmtDate(d: Date | null) {
  if (!d) return "";
  try {
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return "";
  }
}

// ─── Mini Like Button ─────────────────────────────────────────────────────────

function MiniLike({ post, onToggle }: { post: PreviewAnnouncement; onToggle: () => void }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scale.value = withSequence(
      withSpring(1.4, { damping: 8, stiffness: 400 }),
      withSpring(1, { damping: 15 })
    );
    onToggle();
  };

  return (
    <Pressable
      onPress={handlePress}
      style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Animated.View style={animStyle}>
        <Heart
          size={16}
          color={post.isLiked ? C.red : C.textMuted}
          fill={post.isLiked ? C.red : "transparent"}
        />
      </Animated.View>
      <Text style={{ color: post.isLiked ? C.red : C.textMuted, fontSize: 12, fontWeight: "600" }}>
        {post.likesCount}
      </Text>
    </Pressable>
  );
}

// ─── Mini Post Row ────────────────────────────────────────────────────────────

function MiniRow({
  post,
  onToggleLike,
  index,
}: {
  post: PreviewAnnouncement;
  onToggleLike: (post: PreviewAnnouncement) => void;
  index: number;
}) {
  const badge = roleBadge(post.authorRole);

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 60).duration(300).springify()}
      style={{
        paddingVertical: 12,
        borderBottomWidth: index < 2 ? 1 : 0,
        borderBottomColor: C.border,
      }}
    >
      {/* Author row */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <View style={{
          width: 28, height: 28, borderRadius: 14,
          backgroundColor: badge.bg,
          alignItems: "center", justifyContent: "center",
          borderWidth: 1, borderColor: badge.text + "40",
        }}>
          <Text style={{ color: badge.text, fontSize: 12, fontWeight: "700" }}>
            {post.authorName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={{ color: C.text, fontWeight: "600", fontSize: 13 }}>{post.authorName}</Text>
        <View style={{ backgroundColor: badge.bg, borderRadius: 20, paddingHorizontal: 6, paddingVertical: 1 }}>
          <Text style={{ color: badge.text, fontSize: 10, fontWeight: "600" }}>
            {post.authorRole.charAt(0).toUpperCase() + post.authorRole.slice(1)}
          </Text>
        </View>
        {post.authorBeltRank && (
          <BeltBadge beltRank={post.authorBeltRank} stripes={post.authorStripes ?? 0} size="sm" />
        )}
        <Text style={{ color: C.textMuted, fontSize: 11, marginLeft: "auto" }}>{fmtDate(post.createdAt)}</Text>
      </View>

      {/* Post text */}
      <Text
        numberOfLines={2}
        style={{ color: C.textSub, fontSize: 14, lineHeight: 20, marginBottom: 8 }}
      >
        {post.text}
      </Text>

      {/* Actions — like only */}
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <MiniLike post={post} onToggle={() => onToggleLike(post)} />
      </View>
    </Animated.View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AnnouncementsHomeSection({
  schoolId,
  userId,
  userRole,
  userName,
  authorPhotoURL,
  authorBeltRank,
  authorStripes,
  delay = 300,
}: AnnouncementsHomeSectionProps) {
  const [posts, setPosts] = useState<PreviewAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // ── Live preview (3 latest) ──────────────────
  useEffect(() => {
    if (!schoolId) return;

    const q = query(
      collection(db, "posts"),
      where("schoolId", "==", schoolId),
      orderBy("createdAt", "desc"),
      limit(3)
    );

    const unsub = onSnapshot(
      q,
      async (snap) => {
        const items: PreviewAnnouncement[] = await Promise.all(
          snap.docs.map(async (d) => {
            const data = d.data();
            let isLiked = false;
            try {
              const likeDoc = await getDoc(doc(db, "posts", d.id, "likes", userId));
              isLiked = likeDoc.exists();
            } catch {
              /* permission-denied → treat as not liked */
            }
            return {
              id: d.id,
              authorName: data.authorName ?? "Professor",
              authorRole: data.authorRole ?? "manager",
              authorBeltRank: data.authorBeltRank ?? null,
              authorStripes: typeof data.authorStripes === "number" ? data.authorStripes : null,
              text: data.text ?? "",
              likesCount: data.likesCount ?? 0,
              isLiked,
              createdAt: data.createdAt?.toDate?.() ?? null,
            };
          })
        );
        setFeedError(null);
        setPosts(items);
        setLoading(false);
      },
      (err) => {
        console.warn("[AnnouncementsHomeSection] error:", err);
        setFeedError("Unable to load announcements. Please try again.");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [schoolId, userId]);

  // ── Like toggle ──────────────────────────────
  const handleToggleLike = useCallback(
    async (post: PreviewAnnouncement) => {
      if (!userId || !schoolId) return;
      const likeRef = doc(db, "posts", post.id, "likes", userId);
      const postRef = doc(db, "posts", post.id);

      // Optimistic
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? { ...p, isLiked: !post.isLiked, likesCount: post.isLiked ? p.likesCount - 1 : p.likesCount + 1 }
            : p
        )
      );

      try {
        if (post.isLiked) {
          await deleteDoc(likeRef);
          await runTransaction(db, async (tx) => {
            const snap = await tx.get(postRef);
            if (snap.exists()) tx.update(postRef, { likesCount: increment(-1), updatedAt: serverTimestamp() });
          });
        } else {
          await setDoc(likeRef, { userId, schoolId, createdAt: serverTimestamp() });
          await runTransaction(db, async (tx) => {
            const snap = await tx.get(postRef);
            if (snap.exists()) tx.update(postRef, { likesCount: increment(1), updatedAt: serverTimestamp() });
          });
        }
      } catch (err: unknown) {
        // Revert optimistic
        setPosts((prev) =>
          prev.map((p) =>
            p.id === post.id
              ? { ...p, isLiked: post.isLiked, likesCount: post.likesCount }
              : p
          )
        );
        console.warn("[AnnouncementsLike] error:", err);
      }
    },
    [userId, schoolId]
  );

  return (
    <>
      <Animated.View entering={FadeInUp.delay(delay).springify()} style={{ marginBottom: 16 }}>
        <View style={{
          backgroundColor: "#0A1628",
          borderRadius: 20,
          padding: 20,
          borderWidth: 1,
          borderColor: C.border,
        }}>
          {/* Header */}
          <View style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: loading ? 16 : posts.length > 0 ? 4 : 16,
          }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Megaphone size={18} color={C.accent} />
              <Text style={{ color: C.text, fontSize: 16, fontWeight: "600" }}>Latest Announcements</Text>
            </View>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setModalVisible(true);
              }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 2,
                opacity: pressed ? 0.7 : 1,
              })}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={{ color: C.accent, fontSize: 13, fontWeight: "600" }}>See all</Text>
              <ChevronRight size={14} color={C.accent} />
            </Pressable>
          </View>

          {/* Content */}
          {loading ? (
            <View style={{ alignItems: "center", paddingVertical: 20 }}>
              <ActivityIndicator color={C.accent} />
            </View>
          ) : feedError ? (
            <Animated.View entering={FadeInDown.duration(300)} style={{ alignItems: "center", paddingVertical: 20 }}>
              <Megaphone size={24} color={C.textMuted} style={{ marginBottom: 8 }} />
              <Text style={{ color: C.textMuted, fontSize: 13, textAlign: "center" }}>{feedError}</Text>
            </Animated.View>
          ) : posts.length === 0 ? (
            <Animated.View entering={FadeInDown.duration(300)} style={{ alignItems: "center", paddingVertical: 20 }}>
              <Megaphone size={24} color={C.textMuted} style={{ marginBottom: 8 }} />
              <Text style={{ color: C.textMuted, fontSize: 14 }}>No announcements yet.</Text>
            </Animated.View>
          ) : (
            posts.map((p, i) => (
              <MiniRow
                key={p.id}
                post={p}
                index={i}
                onToggleLike={handleToggleLike}
              />
            ))
          )}
        </View>
      </Animated.View>

      {/* Full modal */}
      <AnnouncementsModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        schoolId={schoolId}
        userId={userId}
        userRole={userRole}
        userName={userName}
        authorPhotoURL={authorPhotoURL}
        authorBeltRank={authorBeltRank}
        authorStripes={authorStripes}
      />
    </>
  );
}
