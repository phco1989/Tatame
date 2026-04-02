/**
 * MuralFullModal
 * Full-screen modal with:
 *  - Live Firestore feed (posts/{postId}, filtered by schoolId)
 *  - Like toggle (likes/{uid} sub-collection)
 *  - Comment bottom-sheet per post
 *  - Create-post input (manager/coach only)
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import {
  View,
  Text,
  Modal,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import {
  Heart,
  MessageCircle,
  X,
  Send,
  Plus,
  ChevronDown,
} from "lucide-react-native";
import Animated, {
  FadeIn,
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
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  getDoc,
  setDoc,
} from "firebase/firestore";
import { formatDistanceToNow } from "date-fns";
import { db, auth } from "@/lib/firebase-config";
import { BeltBadge } from "@/components/BeltBadge";
import { beltColor } from "@/lib/belt";
import type { UserRole } from "@/lib/hooks/useCurrentUser";

// ─── Types ───────────────────────────────────────────────────────────────────

interface FirePost {
  id: string;
  schoolId: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  authorPhotoURL?: string | null;
  authorBeltRank?: string | null;
  authorStripes?: number | null;
  text: string;
  photoURLs: string[];
  createdAt: Date | null;
  updatedAt: Date | null;
  likesCount: number;
  commentsCount: number;
  isLiked: boolean;
  // System post fields
  systemPost?: boolean;
  studentBeltRank?: string | null;
  studentStripes?: number | null;
}

interface FireComment {
  id: string;
  authorId: string;
  authorName: string;
  authorPhotoURL?: string | null;
  text: string;
  createdAt: Date | null;
}

interface MuralFullModalProps {
  visible: boolean;
  onClose: () => void;
  schoolId: string;
  userId: string;
  userRole: UserRole;
  userName: string;
  authorPhotoURL?: string | null;
  authorBeltRank?: string | null;
  authorStripes?: number | null;
}

// ─── Colors ──────────────────────────────────────────────────────────────────

const COLORS = {
  bg: "#0A1628",
  surface: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.10)",
  text: "#FFFFFF",
  textSub: "rgba(255,255,255,0.65)",
  textMuted: "rgba(255,255,255,0.40)",
  accent: "#D4A017",
  accentMuted: "rgba(212,160,23,0.15)",
  inputBg: "rgba(255,255,255,0.08)",
  red: "#EF4444",
  green: "#34D399",
  badge: {
    manager: { bg: "rgba(124,58,237,0.18)", text: "#A78BFA" },
    coach: { bg: "rgba(5,150,105,0.18)", text: "#6EE7B7" },
    student: { bg: "rgba(8,145,178,0.18)", text: "#67E8F9" },
  },
};

// ─── Helper ──────────────────────────────────────────────────────────────────

function roleBadgeColors(role: string) {
  if (role === "manager") return COLORS.badge.manager;
  if (role === "coach") return COLORS.badge.coach;
  return COLORS.badge.student;
}

function initials(name: string) {
  return name.charAt(0).toUpperCase();
}

function fmtDate(d: Date | null) {
  if (!d) return "";
  try {
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return "";
  }
}

function safeImage(uri?: string | null) {
  if (typeof uri !== "string") return null;
  const cleaned = uri.trim();
  return cleaned.length > 0 ? cleaned : null;
}

// ─── Avatar ──────────────────────────────────────────────────────────────────

function Avatar({
  name,
  photoURL,
  role,
  size = 40,
}: {
  name: string;
  photoURL?: string | null;
  role: string;
  size?: number;
}) {
  const badge = roleBadgeColors(role);
  const avatarUri = safeImage(photoURL);

  if (avatarUri) {
    return (
      <Image
        source={{ uri: avatarUri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: badge.bg,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: badge.text + "40",
      }}
    >
      <Text style={{ color: badge.text, fontWeight: "700", fontSize: size * 0.4 }}>
        {initials(name)}
      </Text>
    </View>
  );
}

// ─── RoleBadge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const badge = roleBadgeColors(role);
  const label = role.charAt(0).toUpperCase() + role.slice(1);
  return (
    <View style={{ backgroundColor: badge.bg, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={{ color: badge.text, fontSize: 11, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

// ─── Like Button ─────────────────────────────────────────────────────────────

function LikeButton({
  post,
  userId,
  onToggle,
}: {
  post: FirePost;
  userId: string;
  onToggle: (post: FirePost) => void;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scale.value = withSequence(
      withSpring(1.35, { damping: 8, stiffness: 400 }),
      withSpring(1, { damping: 15 })
    );
    onToggle(post);
  };

  return (
    <Pressable
      onPress={handlePress}
      style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Animated.View style={animStyle}>
        <Heart
          size={20}
          color={post.isLiked ? COLORS.red : COLORS.textMuted}
          fill={post.isLiked ? COLORS.red : "transparent"}
        />
      </Animated.View>
      <Text style={{ color: post.isLiked ? COLORS.red : COLORS.textMuted, fontSize: 13, fontWeight: "600" }}>
        {post.likesCount}
      </Text>
    </Pressable>
  );
}

// ─── Comment Sheet ────────────────────────────────────────────────────────────

interface CommentSheetProps {
  visible: boolean;
  post: FirePost | null;
  onClose: () => void;
  schoolId: string;
  userId: string;
  userName: string;
  authorPhotoURL?: string | null;
}

function CommentSheet({
  visible,
  post,
  onClose,
  schoolId,
  userId,
  userName,
  authorPhotoURL,
}: CommentSheetProps) {
  const [comments, setComments] = useState<FireComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!visible || !post) return;
    setLoadingComments(true);

    const q = query(
      collection(db, "posts", post.id, "comments"),
      orderBy("createdAt", "asc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const items: FireComment[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            authorId: data.authorId ?? data.authorUid ?? "",
            authorName: data.authorName ?? "Anonymous",
            authorPhotoURL: safeImage(data.authorPhotoURL),
            text: data.text ?? "",
            createdAt: data.createdAt?.toDate?.() ?? null,
          };
        });
        setComments(items);
        setLoadingComments(false);
      },
      (err) => {
        if (err.code === "permission-denied") {
          Alert.alert("Access restricted");
        }
        console.warn("[MuralComments] error:", err);
        setLoadingComments(false);
      }
    );

    return () => unsub();
  }, [visible, post?.id]);

  const handleSend = async () => {
    if (!commentText.trim() || !post || sending) return;
    setSending(true);

    try {
      const currentUid = auth.currentUser?.uid ?? userId;

      await addDoc(collection(db, "posts", post.id, "comments"), {
        schoolId,
        authorUid: currentUid,
        authorId: currentUid,
        authorName: userName,
        authorPhotoURL: safeImage(authorPhotoURL),
        text: commentText.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setCommentText("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      const fireErr = err as { code?: string };
      if (fireErr.code === "permission-denied") {
        Alert.alert("Access restricted");
      }
      console.warn("[MuralComment] send error:", err);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <Animated.View
          entering={FadeIn.duration(200)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}
        >
          <Animated.View
            entering={FadeInUp.delay(50).springify()}
            style={{
              backgroundColor: "#111D2E",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: "80%",
              borderTopWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 4 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border }} />
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 12 }}>
              <Text style={{ color: COLORS.text, fontSize: 17, fontWeight: "700" }}>Comments</Text>
              <Pressable onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={22} color={COLORS.textMuted} />
              </Pressable>
            </View>

            {loadingComments ? (
              <View style={{ alignItems: "center", padding: 32 }}>
                <ActivityIndicator color={COLORS.accent} />
              </View>
            ) : (
              <ScrollView
                style={{ maxHeight: 360 }}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {comments.length === 0 ? (
                  <View style={{ alignItems: "center", paddingVertical: 32 }}>
                    <MessageCircle size={32} color={COLORS.textMuted} />
                    <Text style={{ color: COLORS.textMuted, marginTop: 8, fontSize: 14 }}>No comments yet</Text>
                  </View>
                ) : (
                  comments.map((c) => {
                    const commentAvatar = safeImage(c.authorPhotoURL);

                    return (
                      <View key={c.id} style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
                        {commentAvatar ? (
                          <Image
                            source={{ uri: commentAvatar }}
                            style={{ width: 32, height: 32, borderRadius: 16 }}
                          />
                        ) : (
                          <View style={{
                            width: 32, height: 32, borderRadius: 16,
                            backgroundColor: COLORS.accentMuted,
                            alignItems: "center", justifyContent: "center",
                          }}>
                            <Text style={{ color: COLORS.accent, fontWeight: "700", fontSize: 14 }}>
                              {initials(c.authorName)}
                            </Text>
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Text style={{ color: COLORS.text, fontWeight: "600", fontSize: 13 }}>{c.authorName}</Text>
                            <Text style={{ color: COLORS.textMuted, fontSize: 11 }}>{fmtDate(c.createdAt)}</Text>
                          </View>
                          <Text style={{ color: COLORS.textSub, fontSize: 14, lineHeight: 20, marginTop: 2 }}>{c.text}</Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            )}

            <View style={{
              flexDirection: "row", alignItems: "center", gap: 10,
              paddingHorizontal: 16, paddingVertical: 12,
              borderTopWidth: 1, borderTopColor: COLORS.border,
            }}>
              <TextInput
                value={commentText}
                onChangeText={setCommentText}
                placeholder="Write a comment..."
                placeholderTextColor={COLORS.textMuted}
                multiline
                maxLength={300}
                style={{
                  flex: 1,
                  backgroundColor: COLORS.inputBg,
                  borderRadius: 20,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  color: COLORS.text,
                  fontSize: 14,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  maxHeight: 80,
                }}
              />
              <Pressable
                onPress={handleSend}
                disabled={!commentText.trim() || sending}
                style={{
                  width: 40, height: 40, borderRadius: 20,
                  backgroundColor: commentText.trim() ? COLORS.accent : COLORS.surface,
                  alignItems: "center", justifyContent: "center",
                  opacity: commentText.trim() ? 1 : 0.5,
                }}
              >
                {sending
                  ? <ActivityIndicator size="small" color="#000" />
                  : <Send size={18} color={commentText.trim() ? "#000" : COLORS.textMuted} />
                }
              </Pressable>
            </View>
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Post Card (full modal version) ──────────────────────────────────────────

interface PostCardProps {
  post: FirePost;
  userId: string;
  onToggleLike: (post: FirePost) => void;
  onComment: (post: FirePost) => void;
}

function PostCard({ post, userId, onToggleLike, onComment }: PostCardProps) {
  if (post.systemPost) {
    const beltHex = post.studentBeltRank
      ? beltColor(post.studentBeltRank)
      : "#FBBF24";

    return (
      <Animated.View
        entering={FadeInDown.duration(350).springify()}
        style={{
          backgroundColor: beltHex + "12",
          borderRadius: 20,
          marginBottom: 14,
          borderWidth: 1,
          borderColor: beltHex + "35",
          overflow: "hidden",
          padding: 16,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          {post.studentBeltRank && (
            <BeltBadge
              beltRank={post.studentBeltRank}
              stripes={post.studentStripes ?? 0}
              size="md"
            />
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.text, fontWeight: "700", fontSize: 14, lineHeight: 20 }}>
              {post.text}
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 3 }}>
              {fmtDate(post.createdAt)} · Tatame
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: beltHex + "25" }}>
          <LikeButton post={post} userId={userId} onToggle={onToggleLike} />
        </View>
      </Animated.View>
    );
  }

  const firstPhoto = safeImage(post.photoURLs?.[0]);

  return (
    <Animated.View
      entering={FadeInDown.duration(350).springify()}
      style={{
        backgroundColor: COLORS.surface,
        borderRadius: 20,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: COLORS.border,
        overflow: "hidden",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14, paddingBottom: 10 }}>
        <Avatar name={post.authorName} photoURL={post.authorPhotoURL} role={post.authorRole} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Text style={{ color: COLORS.text, fontWeight: "600", fontSize: 14 }}>{post.authorName}</Text>
            <RoleBadge role={post.authorRole} />
            {post.authorBeltRank && (
              <BeltBadge beltRank={post.authorBeltRank} stripes={post.authorStripes ?? 0} size="sm" />
            )}
          </View>
          <Text style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 1 }}>{fmtDate(post.createdAt)}</Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: 14, paddingBottom: 10 }}>
        <Text style={{ color: COLORS.textSub, fontSize: 15, lineHeight: 22 }}>{post.text}</Text>
      </View>

      {firstPhoto && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 10 }}>
          <Image
            source={{ uri: firstPhoto }}
            style={{ width: "100%", height: 200, borderRadius: 12 }}
            resizeMode="cover"
          />
        </View>
      )}

      <View style={{
        flexDirection: "row", alignItems: "center", gap: 20,
        paddingHorizontal: 14, paddingVertical: 12,
        borderTopWidth: 1, borderTopColor: COLORS.border,
      }}>
        <LikeButton post={post} userId={userId} onToggle={onToggleLike} />
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onComment(post);
          }}
          style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MessageCircle size={20} color={COLORS.textMuted} />
          <Text style={{ color: COLORS.textMuted, fontSize: 13, fontWeight: "600" }}>{post.commentsCount}</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

// ─── Create Post Sheet ────────────────────────────────────────────────────────

interface CreatePostSheetProps {
  visible: boolean;
  onClose: () => void;
  schoolId: string;
  userId: string;
  userRole: UserRole;
  userName: string;
  authorPhotoURL?: string | null;
  authorBeltRank?: string | null;
  authorStripes?: number | null;
}

function CreatePostSheet({
  visible,
  onClose,
  schoolId,
  userId,
  userRole,
  userName,
  authorPhotoURL,
  authorBeltRank,
  authorStripes,
}: CreatePostSheetProps) {
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);

  const handlePost = async () => {
    if (!text.trim() || posting) return;
    setPosting(true);

    try {
      await addDoc(collection(db, "posts"), {
        schoolId,
        authorId: auth.currentUser?.uid ?? userId,
        authorName: userName,
        authorRole: userRole ?? "student",
        authorBeltRank: authorBeltRank ?? null,
        authorStripes: authorStripes ?? null,
        authorPhotoURL: safeImage(authorPhotoURL),
        text: text.trim(),
        photoURLs: [],
        likesCount: 0,
        commentsCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setText("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch (err: unknown) {
      const fireErr = err as { code?: string };
      if (fireErr.code === "permission-denied") {
        Alert.alert("Access restricted");
      }
      console.warn("[MuralCreate] post error:", err);
    } finally {
      setPosting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <Animated.View
          entering={FadeIn.duration(200)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}
        >
          <Animated.View
            entering={FadeInUp.delay(50).springify()}
            style={{
              backgroundColor: "#111D2E",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderTopWidth: 1,
              borderColor: COLORS.border,
              padding: 20,
            }}
          >
            <View style={{ alignItems: "center", marginBottom: 16 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border }} />
            </View>

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <Text style={{ color: COLORS.text, fontSize: 17, fontWeight: "700" }}>New Post</Text>
              <Pressable onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={22} color={COLORS.textMuted} />
              </Pressable>
            </View>

            <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
              <Avatar name={userName} photoURL={authorPhotoURL} role={userRole ?? "student"} size={36} />
              <View style={{ justifyContent: "center" }}>
                <Text style={{ color: COLORS.text, fontWeight: "600", fontSize: 14 }}>{userName}</Text>
                <RoleBadge role={userRole ?? "student"} />
              </View>
            </View>

            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Share something with your academy..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              maxLength={500}
              autoFocus
              style={{
                backgroundColor: COLORS.inputBg,
                borderRadius: 14,
                padding: 14,
                color: COLORS.text,
                fontSize: 15,
                lineHeight: 22,
                borderWidth: 1,
                borderColor: COLORS.border,
                minHeight: 100,
                maxHeight: 180,
                textAlignVertical: "top",
                marginBottom: 16,
              }}
            />

            <Pressable
              onPress={handlePost}
              disabled={!text.trim() || posting}
              style={({ pressed }) => ({
                backgroundColor: text.trim() ? COLORS.accent : COLORS.surface,
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: "center",
                justifyContent: "center",
                opacity: text.trim() ? (pressed ? 0.85 : 1) : 0.5,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              })}
            >
              {posting
                ? <ActivityIndicator color="#000" />
                : <Text style={{ color: text.trim() ? "#000" : COLORS.textMuted, fontWeight: "700", fontSize: 15 }}>Post</Text>
              }
            </Pressable>
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function MuralFullModal({
  visible,
  onClose,
  schoolId,
  userId,
  userRole,
  userName,
  authorPhotoURL,
  authorBeltRank,
  authorStripes,
}: MuralFullModalProps) {
  const [posts, setPosts] = useState<FirePost[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [commentPost, setCommentPost] = useState<FirePost | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const canCreate = userRole === "manager";

  const likeCounts = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!visible || !schoolId) return;
    setLoading(true);
    setFeedError(null);

    const q = query(
      collection(db, "posts"),
      where("schoolId", "==", schoolId),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    const unsub = onSnapshot(
      q,
      async (snap) => {
        const items: FirePost[] = await Promise.all(
          snap.docs.map(async (d) => {
            const data = d.data();

            let isLiked = false;
            let likesCount = 0;

            try {
              const likeDoc = await getDoc(doc(db, "posts", d.id, "likes", userId));
              isLiked = likeDoc.exists();
            } catch {
              // permission-denied → not liked
            }

            const commentsCount = data.commentsCount ?? 0;
            likesCount = data.likesCount ?? 0;

            return {
              id: d.id,
              schoolId: data.schoolId ?? "",
              authorId: data.authorId ?? "",
              authorName: data.authorName ?? "Unknown",
              authorRole: data.authorRole ?? "student",
              authorPhotoURL: safeImage(data.authorPhotoURL),
              authorBeltRank: data.authorBeltRank ?? null,
              authorStripes: typeof data.authorStripes === "number" ? data.authorStripes : null,
              text: data.text ?? "",
              photoURLs: Array.isArray(data.photoURLs)
                ? data.photoURLs.filter((url: unknown) => safeImage(typeof url === "string" ? url : null))
                : [],
              createdAt: data.createdAt?.toDate?.() ?? null,
              updatedAt: data.updatedAt?.toDate?.() ?? null,
              likesCount,
              commentsCount,
              isLiked,
              systemPost: data.systemPost === true,
              studentBeltRank: data.studentBeltRank ?? null,
              studentStripes: typeof data.studentStripes === "number" ? data.studentStripes : null,
            };
          })
        );

        setPosts(items);
        setLoading(false);
      },
      (err) => {
        if (err.code === "permission-denied") {
          setFeedError("You don't have permission to view this feed.");
        } else if (err.code === "failed-precondition") {
          setFeedError("Feed index is being built — check back shortly.");
        } else {
          setFeedError("Unable to load feed right now.");
        }
        console.warn("[MuralFullModal] feed error:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [visible, schoolId, userId]);

  const handleToggleLike = useCallback(
    async (post: FirePost) => {
      const likeRef = doc(db, "posts", post.id, "likes", userId);

      try {
        if (post.isLiked) {
          await deleteDoc(likeRef);
        } else {
          await setDoc(likeRef, {
            schoolId,
            userId,
            createdAt: serverTimestamp(),
          });
        }

        setPosts((prev) =>
          prev.map((p) =>
            p.id === post.id
              ? {
                  ...p,
                  isLiked: !post.isLiked,
                  likesCount: post.isLiked ? p.likesCount - 1 : p.likesCount + 1,
                }
              : p
          )
        );
      } catch (err: unknown) {
        const fireErr = err as { code?: string };
        if (fireErr.code === "permission-denied") {
          Alert.alert("Access restricted");
        }
        console.warn("[MuralToggleLike] error:", err);
      }
    },
    [userId, schoolId]
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 20,
          paddingTop: Platform.OS === "ios" ? 56 : 20,
          paddingBottom: 16,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
        }}>
          <Pressable onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <ChevronDown size={26} color={COLORS.textSub} />
          </Pressable>
          <Text style={{ color: COLORS.text, fontSize: 17, fontWeight: "700", letterSpacing: -0.3 }}>
            Mural
          </Text>
          {canCreate ? (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setShowCreate(true);
              }}
              style={{
                width: 34, height: 34, borderRadius: 17,
                backgroundColor: COLORS.accent,
                alignItems: "center", justifyContent: "center",
              }}
            >
              <Plus size={18} color="#000" />
            </Pressable>
          ) : (
            <View style={{ width: 34 }} />
          )}
        </View>

        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={COLORS.accent} size="large" />
          </View>
        ) : feedError ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
            <MessageCircle size={32} color={COLORS.textMuted} />
            <Text style={{ color: COLORS.textMuted, fontSize: 14, textAlign: "center", marginTop: 12 }}>
              {feedError}
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          >
            {posts.length === 0 ? (
              <Animated.View entering={FadeIn.duration(400)} style={{ alignItems: "center", paddingTop: 60 }}>
                <View style={{
                  width: 64, height: 64, borderRadius: 32,
                  backgroundColor: COLORS.accentMuted,
                  alignItems: "center", justifyContent: "center",
                  marginBottom: 16,
                }}>
                  <MessageCircle size={28} color={COLORS.accent} />
                </View>
                <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: "700", marginBottom: 8 }}>No posts yet</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 14, textAlign: "center", paddingHorizontal: 32 }}>
                  {canCreate
                    ? "Be the first to share something with your academy."
                    : "Your coaches and manager will post updates here."}
                </Text>
              </Animated.View>
            ) : (
              posts.map((p) => (
                <PostCard
                  key={p.id}
                  post={p}
                  userId={userId}
                  onToggleLike={handleToggleLike}
                  onComment={setCommentPost}
                />
              ))
            )}
          </ScrollView>
        )}

        <CommentSheet
          visible={commentPost !== null}
          post={commentPost}
          onClose={() => setCommentPost(null)}
          schoolId={schoolId}
          userId={userId}
          userName={userName}
          authorPhotoURL={authorPhotoURL}
        />

        <CreatePostSheet
          visible={showCreate}
          onClose={() => setShowCreate(false)}
          schoolId={schoolId}
          userId={userId}
          userRole={userRole}
          userName={userName}
          authorPhotoURL={authorPhotoURL}
          authorBeltRank={authorBeltRank}
          authorStripes={authorStripes}
        />
      </View>
    </Modal>
  );
}