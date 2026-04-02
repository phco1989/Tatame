/**
 * Announcements Tab Screen
 * Full announcements feed for the dedicated tab.
 * - Manager can create announcements
 * - Everyone in the same school can read and like
 * - No comments
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Heart,
  Plus,
  Megaphone,
  X,
  Send,
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
  runTransaction,
  increment,
} from "firebase/firestore";
import { formatDistanceToNow } from "date-fns";
import { db, auth, waitForAuthReady, ensureSignedIn } from "@/lib/firebase-config";
import { BeltBadge } from "@/components/BeltBadge";
import { beltColor } from "@/lib/belt";
import { useTranslations } from "@/lib/i18n";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Announcement {
  id: string;
  schoolId: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  authorPhotoURL?: string;
  authorBeltRank?: string | null;
  authorStripes?: number | null;
  text: string;
  photoURLs: string[];
  createdAt: Date | null;
  likesCount: number;
  isLiked: boolean;
  systemPost?: boolean;
  studentBeltRank?: string | null;
  studentStripes?: number | null;
}

interface UserData {
  name?: string;
  role?: string;
  schoolId?: string;
  photoURL?: string;
  beltRank?: string;
  stripes?: number;
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const COLORS = {
  bg: "#0B1220",
  surface: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.08)",
  text: "#FFFFFF",
  textSub: "rgba(255,255,255,0.65)",
  textMuted: "rgba(255,255,255,0.40)",
  accent: "#D4A017",
  accentMuted: "rgba(212,160,23,0.15)",
  inputBg: "rgba(255,255,255,0.08)",
  red: "#EF4444",
  badge: {
    manager: { bg: "rgba(124,58,237,0.18)", text: "#A78BFA" },
    coach: { bg: "rgba(5,150,105,0.18)", text: "#6EE7B7" },
    student: { bg: "rgba(8,145,178,0.18)", text: "#67E8F9" },
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function roleBadgeColors(role: string) {
  if (role === "manager") return COLORS.badge.manager;
  if (role === "coach") return COLORS.badge.coach;
  return COLORS.badge.student;
}

function fmtDate(d: Date | null) {
  if (!d) return "";
  try { return formatDistanceToNow(d, { addSuffix: true }); } catch { return ""; }
}

function initials(name: string) { return name.charAt(0).toUpperCase(); }

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, photoURL, role, size = 40 }: { name: string; photoURL?: string; role: string; size?: number }) {
  const badge = roleBadgeColors(role);
  if (photoURL) {
    return <Image source={{ uri: photoURL }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: badge.bg, alignItems: "center", justifyContent: "center",
      borderWidth: 1, borderColor: badge.text + "40",
    }}>
      <Text style={{ color: badge.text, fontWeight: "700", fontSize: size * 0.4 }}>{initials(name)}</Text>
    </View>
  );
}

// ─── RoleBadge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const badge = roleBadgeColors(role);
  return (
    <View style={{ backgroundColor: badge.bg, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={{ color: badge.text, fontSize: 11, fontWeight: "600" }}>
        {role.charAt(0).toUpperCase() + role.slice(1)}
      </Text>
    </View>
  );
}

// ─── Like Button ──────────────────────────────────────────────────────────────

function LikeButton({ post, onToggle }: { post: Announcement; onToggle: () => void }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scale.value = withSequence(
      withSpring(1.35, { damping: 8, stiffness: 400 }),
      withSpring(1, { damping: 15 })
    );
    onToggle();
  };

  return (
    <Pressable
      onPress={handlePress}
      style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Animated.View style={animStyle}>
        <Heart size={20} color={post.isLiked ? COLORS.red : COLORS.textMuted} fill={post.isLiked ? COLORS.red : "transparent"} />
      </Animated.View>
      <Text style={{ color: post.isLiked ? COLORS.red : COLORS.textMuted, fontSize: 13, fontWeight: "600" }}>
        {post.likesCount}
      </Text>
    </Pressable>
  );
}

// ─── Announcement Card ────────────────────────────────────────────────────────

function AnnouncementCard({ post, onToggleLike }: { post: Announcement; onToggleLike: () => void }) {
  if (post.systemPost) {
    const beltHex = post.studentBeltRank ? beltColor(post.studentBeltRank) : "#FBBF24";
    return (
      <Animated.View
        entering={FadeInDown.duration(350).springify()}
        style={{
          backgroundColor: beltHex + "12",
          borderRadius: 20, marginBottom: 14,
          borderWidth: 1, borderColor: beltHex + "35",
          overflow: "hidden", padding: 16,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          {post.studentBeltRank && (
            <BeltBadge beltRank={post.studentBeltRank} stripes={post.studentStripes ?? 0} size="md" />
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.text, fontWeight: "700", fontSize: 14, lineHeight: 20 }}>{post.text}</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 3 }}>{fmtDate(post.createdAt)} · Tatame</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: beltHex + "25" }}>
          <LikeButton post={post} onToggle={onToggleLike} />
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      entering={FadeInDown.duration(350).springify()}
      style={{
        backgroundColor: COLORS.surface, borderRadius: 20, marginBottom: 14,
        borderWidth: 1, borderColor: COLORS.border, overflow: "hidden",
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

      {post.photoURLs.length > 0 && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 10 }}>
          <Image source={{ uri: post.photoURLs[0] }} style={{ width: "100%", height: 200, borderRadius: 12 }} resizeMode="cover" />
        </View>
      )}

      <View style={{
        flexDirection: "row", alignItems: "center",
        paddingHorizontal: 14, paddingVertical: 12,
        borderTopWidth: 1, borderTopColor: COLORS.border,
      }}>
        <LikeButton post={post} onToggle={onToggleLike} />
      </View>
    </Animated.View>
  );
}

// ─── Create Sheet ─────────────────────────────────────────────────────────────

function CreateSheet({
  visible,
  onClose,
  schoolId,
  userData,
}: {
  visible: boolean;
  onClose: () => void;
  schoolId: string;
  userData: UserData;
}) {
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const tr = useTranslations();
  const a = tr.announcements;

  const handlePost = async () => {
    if (!text.trim() || posting) return;
    setPosting(true);
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("not-authenticated");
      await addDoc(collection(db, "posts"), {
        schoolId,
        authorId: uid,
        authorName: userData.name ?? "Professor",
        authorRole: "manager",
        authorBeltRank: userData.beltRank ?? null,
        authorStripes: userData.stripes ?? null,
        authorPhotoURL: userData.photoURL ?? null,
        text: text.trim(),
        photoURLs: [],
        likesCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setText("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch (err: unknown) {
      const fireErr = err as { code?: string };
      if (fireErr.code === "permission-denied") {
        Alert.alert(a.accessRestricted, a.managersOnlyPost);
      } else {
        Alert.alert(tr.common.close, a.couldNotPost);
      }
      console.warn("[Announcements] post error:", err);
    } finally {
      setPosting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <Animated.View entering={FadeIn.duration(200)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
          <Animated.View
            entering={FadeInUp.delay(50).springify()}
            style={{ backgroundColor: "#111D2E", borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: COLORS.border, padding: 20 }}
          >
            <View style={{ alignItems: "center", marginBottom: 16 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border }} />
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <Text style={{ color: COLORS.text, fontSize: 17, fontWeight: "700" }}>{a.newAnnouncement}</Text>
              <Pressable onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={22} color={COLORS.textMuted} />
              </Pressable>
            </View>

            <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
              <Avatar name={userData.name ?? "P"} photoURL={userData.photoURL} role="manager" size={36} />
              <View style={{ justifyContent: "center" }}>
                <Text style={{ color: COLORS.text, fontWeight: "600", fontSize: 14 }}>{userData.name ?? "Professor"}</Text>
                <RoleBadge role="manager" />
              </View>
            </View>

            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={a.postPlaceholder}
              placeholderTextColor={COLORS.textMuted}
              multiline
              maxLength={500}
              autoFocus
              style={{
                backgroundColor: COLORS.inputBg, borderRadius: 14, padding: 14,
                color: COLORS.text, fontSize: 15, lineHeight: 22,
                borderWidth: 1, borderColor: COLORS.border,
                minHeight: 100, maxHeight: 180, textAlignVertical: "top", marginBottom: 16,
              }}
            />

            <Pressable
              onPress={handlePost}
              disabled={!text.trim() || posting}
              style={({ pressed }) => ({
                backgroundColor: text.trim() ? COLORS.accent : COLORS.surface,
                borderRadius: 14, paddingVertical: 14,
                alignItems: "center", justifyContent: "center",
                opacity: text.trim() ? (pressed ? 0.85 : 1) : 0.5,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              })}
            >
              {posting
                ? <ActivityIndicator color="#000" />
                : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{a.postButton}</Text>
              }
            </Pressable>
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function AnnouncementsScreen() {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [posts, setPosts] = useState<Announcement[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const tr = useTranslations();
  const a = tr.announcements;

  // ── Load user ─────────────────────────────────
  useEffect(() => {
    let unsub: (() => void) | undefined;

    const load = async () => {
      try {
        await waitForAuthReady();
        await ensureSignedIn();
        const uid = auth.currentUser?.uid;
        if (!uid) {
          console.log("[Announcements] no uid after auth ready");
          setUserLoading(false);
          return;
        }
        setUserId(uid);

        unsub = onSnapshot(
          doc(db, "users", uid),
          (snap) => {
            if (snap.exists()) {
              const data = snap.data() as UserData;
              console.log("[Announcements] user loaded — role:", data.role, "schoolId:", data.schoolId ? "yes" : "no");
              setUserData(data);
            } else {
              console.warn("[Announcements] user doc does not exist for uid:", uid);
            }
            setUserLoading(false);
          },
          (err) => {
            console.warn("[Announcements] user snapshot error:", err);
            setUserLoading(false);
          }
        );
      } catch (err) {
        console.warn("[Announcements] load error:", err);
        setUserLoading(false);
      }
    };

    load();
    return () => { if (unsub) unsub(); };
  }, []);

  // ── Live feed ─────────────────────────────────
  useEffect(() => {
    // Wait for the user doc to finish loading before evaluating.
    // Without this, the effect fires while userData is still null,
    // the guard returns early, and feedLoading never clears (infinite spinner).
    if (userLoading) return;

    if (!userData?.schoolId || !userId) {
      // User loaded but schoolId is missing — unblock the spinner.
      setFeedLoading(false);
      return;
    }

    const q = query(
      collection(db, "posts"),
      where("schoolId", "==", userData.schoolId),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    const unsub = onSnapshot(
      q,
      async (snap) => {
        const items: Announcement[] = await Promise.all(
          snap.docs.map(async (d) => {
            const data = d.data();
            let isLiked = false;
            try {
              const likeDoc = await getDoc(doc(db, "posts", d.id, "likes", userId));
              isLiked = likeDoc.exists();
            } catch { /* not liked */ }

            return {
              id: d.id,
              schoolId: data.schoolId ?? "",
              authorId: data.authorId ?? "",
              authorName: data.authorName ?? "Professor",
              authorRole: data.authorRole ?? "manager",
              authorPhotoURL: data.authorPhotoURL ?? undefined,
              authorBeltRank: data.authorBeltRank ?? null,
              authorStripes: typeof data.authorStripes === "number" ? data.authorStripes : null,
              text: data.text ?? "",
              photoURLs: Array.isArray(data.photoURLs) ? data.photoURLs : [],
              createdAt: data.createdAt?.toDate?.() ?? null,
              likesCount: data.likesCount ?? 0,
              isLiked,
              systemPost: data.systemPost === true,
              studentBeltRank: data.studentBeltRank ?? null,
              studentStripes: typeof data.studentStripes === "number" ? data.studentStripes : null,
            };
          })
        );
        setFeedError(null);
        setPosts(items);
        setFeedLoading(false);
      },
      (err) => {
        console.warn("[AnnouncementsScreen] feed error:", err);
        setFeedError(a.unableToLoad);
        setFeedLoading(false);
      }
    );

    return () => unsub();
  }, [userLoading, userData?.schoolId, userId]);

  // ── Toggle like ───────────────────────────────
  const handleToggleLike = useCallback(
    async (post: Announcement) => {
      if (!userId || !userData?.schoolId) return;
      const likeRef = doc(db, "posts", post.id, "likes", userId);
      const postRef = doc(db, "posts", post.id);

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
          await setDoc(likeRef, { userId, schoolId: userData?.schoolId ?? "", createdAt: serverTimestamp() });
          await runTransaction(db, async (tx) => {
            const snap = await tx.get(postRef);
            if (snap.exists()) tx.update(postRef, { likesCount: increment(1), updatedAt: serverTimestamp() });
          });
        }
      } catch (err) {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === post.id ? { ...p, isLiked: post.isLiked, likesCount: post.likesCount } : p
          )
        );
        console.warn("[AnnouncementsLike] error:", err);
      }
    },
    [userId, userData?.schoolId]
  );

  const isManager = userData?.role === "manager";

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        {/* Header */}
        <Animated.View
          entering={FadeInDown.delay(50).springify()}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: 16,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.border,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: COLORS.accentMuted,
              alignItems: "center", justifyContent: "center",
            }}>
              <Megaphone size={18} color={COLORS.accent} />
            </View>
            <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: "700", letterSpacing: -0.3 }}>
              {a.title}
            </Text>
          </View>

          {isManager && !!userData?.schoolId && (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setShowCreate(true);
              }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                backgroundColor: COLORS.accent,
                borderRadius: 20,
                paddingHorizontal: 14,
                paddingVertical: 8,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Plus size={16} color="#fff" />
              <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>New</Text>
            </Pressable>
          )}
        </Animated.View>

        {/* Feed */}
        {userLoading || feedLoading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={COLORS.accent} size="large" />
          </View>
        ) : feedError ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
            <Megaphone size={40} color={COLORS.textMuted} />
            <Text style={{ color: COLORS.textMuted, fontSize: 14, textAlign: "center", marginTop: 16 }}>
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
                  width: 72, height: 72, borderRadius: 36,
                  backgroundColor: COLORS.accentMuted,
                  alignItems: "center", justifyContent: "center", marginBottom: 20,
                }}>
                  <Megaphone size={32} color={COLORS.accent} />
                </View>
                <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: "700", marginBottom: 10 }}>
                  {a.emptyTitle}
                </Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 14, textAlign: "center", paddingHorizontal: 32 }}>
                  {isManager ? a.managerEmptyBody : a.studentEmptyBody}
                </Text>
              </Animated.View>
            ) : (
              posts.map((p) => (
                <AnnouncementCard
                  key={p.id}
                  post={p}
                  onToggleLike={() => handleToggleLike(p)}
                />
              ))
            )}
          </ScrollView>
        )}
      </SafeAreaView>

      {/* Create Sheet — manager only */}
      {isManager && userData && userData.schoolId && (
        <CreateSheet
          visible={showCreate}
          onClose={() => setShowCreate(false)}
          schoolId={userData.schoolId}
          userData={userData}
        />
      )}
    </View>
  );
}
