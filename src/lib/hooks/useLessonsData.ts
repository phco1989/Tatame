/**
 * useLessonsData — shared hook for lessons CRUD.
 * Used by both the Lessons tab and the Admin panel so that both screens
 * always use the same Firestore query and the same save/delete logic.
 */

import { useState, useCallback } from "react";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  query,
  where,
  serverTimestamp,
  Timestamp,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";
import { db, waitForAuthReady } from "@/lib/firebase-config";
import { canAddClass, showClassLimitAlert } from "@/lib/premiumAccess";
import type { ClassLevel } from "@/types";
import type { Router } from "expo-router";

// ─── Lesson type ──────────────────────────────────────────────────────────────

export interface Lesson {
  id: string;
  schoolId: string;
  startsAt: Date;
  endsAt: Date;
  level: ClassLevel;
  coachId?: string;
  createdBy: string;
  createdAt: Date;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function toDate(v: unknown): Date {
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

export function normalizeLesson(docId: string, data: Record<string, unknown>): Lesson {
  return {
    id: docId,
    schoolId: (data?.schoolId as string) ?? "",
    startsAt: toDate(data?.startsAt),
    endsAt: toDate(data?.endsAt),
    level: ((data?.level as ClassLevel) ?? "all_levels"),
    coachId: data?.coachId as string | undefined,
    createdBy: (data?.createdBy as string) ?? "",
    createdAt: toDate(data?.createdAt),
  };
}

// ─── Save params ──────────────────────────────────────────────────────────────

export interface SaveLessonParams {
  schoolId: string;
  uid: string;
  startsAt: Date;
  endsAt: Date;
  level: ClassLevel;
  editingLessonId: string | null;
  currentLessonCount: number;
  isPro: boolean;
  router: Router;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useLessonsData(schoolId: string | null | undefined) {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(false);

  /**
   * Sets up a real-time Firestore listener.
   * Returns an unsubscribe function — call it in a useEffect cleanup.
   * NOTE: no orderBy here to avoid composite-index requirement; we sort client-side.
   */
  const fetchLessons = useCallback((): (() => void) => {
    if (!schoolId) return () => {};
    setLoading(true);
    const q = query(
      collection(db, "lessons"),
      where("schoolId", "==", schoolId)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Lesson[] = snap.docs.map((d) => normalizeLesson(d.id, d.data() as Record<string, unknown>));
        list.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
        setLessons(list);
        setLoading(false);
      },
      (err) => {
        console.warn("[useLessonsData] snapshot error:", err);
        setLessons([]);
        setLoading(false);
      }
    );
    return unsub;
  }, [schoolId]);

  /**
   * Create or update a lesson.
   * Enforces class limit for free accounts.
   * Returns true on success, false otherwise.
   */
  const saveLesson = async (params: SaveLessonParams): Promise<boolean> => {
    const {
      schoolId: sid,
      uid,
      startsAt,
      endsAt,
      level,
      editingLessonId,
      currentLessonCount,
      isPro,
      router,
    } = params;

    if (!sid || !uid) {
      console.warn("[useLessonsData] saveLesson: missing schoolId or uid");
      return false;
    }

    if (endsAt <= startsAt) {
      return false; // caller should validate and show alert before calling
    }

    // Class limit gate — only checked when creating, not editing
    if (!editingLessonId && !canAddClass(currentLessonCount, isPro)) {
      showClassLimitAlert(router);
      return false;
    }

    await waitForAuthReady();

    const payload = { schoolId: sid, startsAt, endsAt, level };

    if (editingLessonId) {
      await updateDoc(doc(db, "lessons", editingLessonId), payload);
      console.log("[useLessonsData] saveLesson: updated", editingLessonId);
    } else {
      const ref = await addDoc(collection(db, "lessons"), {
        ...payload,
        createdBy: uid,
        createdAt: serverTimestamp(),
      });
      console.log("[useLessonsData] saveLesson: created", ref.id);
    }
    return true;
  };

  /**
   * Delete a lesson by ID.
   */
  const deleteLesson = async (lessonId: string): Promise<void> => {
    await waitForAuthReady();
    await deleteDoc(doc(db, "lessons", lessonId));
    console.log("[useLessonsData] deleteLesson:", lessonId);
  };

  return { lessons, loading, fetchLessons, saveLesson, deleteLesson };
}
