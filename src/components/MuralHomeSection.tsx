/**
 * MuralHomeSection
 * Preview of 3 most recent mural posts shown on Home screen.
 * - Dark glass card matching the Home screen aesthetic
 * - "See all" button opens MuralFullModal
 * - Inline like toggle & comment count
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  ActivityIndicator,
} from "react-native";
import {
  Heart,
  MessageCircle,
  ChevronRight,
  Newspaper,
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
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { formatDistanceToNow } from "date-fns";
import { db } from "@/lib/firebase-config";
import { MuralFullModal } from "./MuralFullModal";
import { BeltBadge } from "@/components/BeltBadge";
import type { UserRole } from "@/lib/hooks/useCurrentUser";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CommentPreview {
  id: string;
  authorName: string;
  text: string;
  createdAt: Date | null;
}

interface PreviewPost {
  id: string;
  authorName: string;
  authorRole: string;
  authorPhotoURL?: string | null;
  authorBeltRank?: string | null;
  authorStripes?: number | null;
  text: string;
  likesCount: number;
  commentsCount: number;
  isLiked: boolean;
  createdAt: Date | null;
  commentsPreview: CommentPreview[];
}

interface MuralHomeSectionProps {
  schoolId: string;
  userId: string;
  userRole: UserRole;
  userName: string;
  authorPhotoURL?: string;
  authorBeltRank?: string | null;
  authorStripes?: number | null;
  delay?: number;
  isNgo?: boolean;
}

// ─── Colors (matches Home screen palette) ────────────────────────────────────

const C = {
  glass: "rgba(255,255,255,0.05)",
  border: "rgba(255,255,255,0.08)",
  highlight: "rgba(255,255,255,0.12)",
  text: "#FFFFFF",
  textSub: "rgba(255,255,255,0.7)",
  textMuted: "rgba(255,255,255,0.5)",
  accent: "#4C7BF4",
  accentMuted: "rgba(76,123,244,0.15)",
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

// ─── Mini like button ─────────────────────────────────────────────────────────

function MiniLike({ post, onToggle }: { post: PreviewPost; onToggle: () => void }) {
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

// ─── Mini post row ────────────────────────────────────────────────────────────

function MiniPostRow({
  post,
  onToggleLike,
  onPressComment,
  index,
}: {
  post: PreviewPost;
  onToggleLike: (post: PreviewPost) => void;
  onPressComment: () => void;
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
        {/* Avatar dot */}
        {post.authorPhotoURL ? (
          <Image
            source={{ uri: post.authorPhotoURL }}
            style={{ width: 28, height: 28, borderRadius: 14 }}
          />
        ) : (
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
        )}
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

      {/* Actions */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <MiniLike post={post} onToggle={() => onToggleLike(post)} />
        <Pressable
          onPress={onPressComment}
          style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MessageCircle size={16} color={C.textMuted} />
          <Text style={{ color: C.textMuted, fontSize: 12, fontWeight: "600" }}>{post.commentsCount}</Text>
        </Pressable>
      </View>

      {/* Compact comments preview */}
      {post.commentsPreview.length > 0 && (
        <View style={{
          marginTop: 8,
          paddingLeft: 10,
          borderLeftWidth: 2,
          borderLeftColor: C.border,
          gap: 4,
        }}>
          {post.commentsPreview.map((c) => (
            <View key={c.id} style={{ flexDirection: "row", gap: 5, alignItems: "flex-start" }}>
              <Text style={{ color: C.textSub, fontSize: 12, fontWeight: "600", flexShrink: 0 }}>
                {c.authorName}
              </Text>
              <Text
                numberOfLines={1}
                style={{ color: C.textMuted, fontSize: 12, flex: 1 }}
              >
                {c.text}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Animated.View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function MuralHomeSection({
  schoolId,
  userId,
  userRole,
  userName,
  authorPhotoURL,
  authorBeltRank,
  authorStripes,
  delay = 300,
}: MuralHomeSectionProps) {
  const [posts, setPosts] = useState<PreviewPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // ── Live preview (3 latest) ──────────────────
  useEffect(() => {
    if (!schoolId) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "posts"),
      where("schoolId", "==", schoolId),
      orderBy("createdAt", "desc"),
      limit(3)
    );

    const unsub = onSnapshot(
      q,
      async (snap) => {
        const items: PreviewPost[] = await Promise.all(
          snap.docs.map(async (d) => {
            const data = d.data();
            let isLiked = false;
            try {
              const likeDoc = await getDoc(doc(db, "posts", d.id, "likes", userId));
              isLiked = likeDoc.exists();
            } catch {
              /* permission-denied → treat as not liked */
            }

            // Fetch up to 3 latest comments for this post
            let commentsPreview: CommentPreview[] = [];
            try {
              const cq = query(
                collection(db, "posts", d.id, "comments"),
                orderBy("createdAt", "desc"),
                limit(3)
              );
              const csnap = await getDocs(cq);
              // reverse so they read oldest-to-newest in the preview
              commentsPreview = csnap.docs
                .map((cd) => {
                  const cd_data = cd.data();
                  return {
                    id: cd.id,
                    authorName: cd_data.authorName ?? "Unknown",
                    text: cd_data.text ?? "",
                    createdAt: cd_data.createdAt?.toDate?.() ?? null,
                  };
                })
                .reverse();
            } catch {
              /* If comment fetch fails, just show no preview */
            }

            return {
              id: d.id,
              authorName: data.authorName ?? "Unknown",
              authorRole: data.authorRole ?? "student",
              authorPhotoURL: typeof data.authorPhotoURL === "string" ? data.authorPhotoURL : null,
              authorBeltRank: data.authorBeltRank ?? null,
              authorStripes: typeof data.authorStripes === "number" ? data.authorStripes : null,
              text: data.text ?? "",
              likesCount: data.likesCount ?? 0,
              commentsCount: data.commentsCount ?? 0,
              isLiked,
              createdAt: data.createdAt?.toDate?.() ?? null,
              commentsPreview,
            };
          })
        );
        setFeedError(null);
        setPosts(items);
        setLoading(false);
      },
      (err) => {
        if (err.code === "failed-precondition") {
          setFeedError("Feed index is being built — check back shortly.");
        } else if (err.code === "permission-denied") {
          setFeedError("You don't have permission to view this feed.");
        } else {
          setFeedError("Unable to load feed right now.");
        }
        console.warn("[MuralHomeSection] error:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [schoolId, userId]);

  // ── Like toggle ──────────────────────────────
  const handleToggleLike = useCallback(
    async (post: PreviewPost) => {
      const likeRef = doc(db, "posts", post.id, "likes", userId);
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
        } else {
          await setDoc(likeRef, { schoolId, userId, createdAt: serverTimestamp() });
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
        console.warn("[MuralLike] error:", err);
      }
    },
    [userId, schoolId]
  );

  return (
    <>
      <Animated.View entering={FadeInUp.delay(delay).springify()} style={{ marginBottom: 16 }}>
        {/* Card */}
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
              <Newspaper size={18} color={C.accent} />
              <Text style={{ color: C.text, fontSize: 16, fontWeight: "600" }}>Mural</Text>
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
              <MessageCircle size={24} color={C.textMuted} style={{ marginBottom: 8 }} />
              <Text style={{ color: C.textMuted, fontSize: 13, textAlign: "center" }}>{feedError}</Text>
            </Animated.View>
          ) : posts.length === 0 ? (
            <Animated.View entering={FadeInDown.duration(300)} style={{ alignItems: "center", paddingVertical: 20 }}>
              <MessageCircle size={24} color={C.textMuted} style={{ marginBottom: 8 }} />
              <Text style={{ color: C.textMuted, fontSize: 14 }}>No posts yet</Text>
            </Animated.View>
          ) : (
            posts.map((p, i) => (
              <MiniPostRow
                key={p.id}
                post={p}
                index={i}
                onToggleLike={handleToggleLike}
                onPressComment={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setModalVisible(true);
                }}
              />
            ))
          )}
        </View>
      </Animated.View>

      {/* Full modal */}
      <MuralFullModal
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
