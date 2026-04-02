/**
 * Competition feature — types and Firestore helpers.
 *
 * Firestore schema (do NOT change field names in Firestore):
 *   competitions/{competitionId}
 *     schoolId, title, location, eventDate, signupDeadline,
 *     signupLink, notes, createdBy, createdAt, updatedAt, isArchived
 *
 *   competitionParticipants/{participantId}
 *     competitionId, schoolId, userId, userName, belt, confirmedAt
 *
 * UI model uses: name, registrationDeadline, registrationLink (mapped from Firestore)
 * Participant UI uses: studentUid, studentName, beltRank, registeredAt (mapped from Firestore)
 */

import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  Timestamp,
  limit as firestoreLimit,
} from "firebase/firestore";
import { db } from "@/lib/firebase-config";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Competition {
  id: string;
  schoolId: string;
  name: string; // mapped from Firestore field: title
  organization: string | null;
  location: string | null;
  eventDate: Date;
  registrationDeadline: Date | null; // mapped from Firestore field: signupDeadline
  registrationLink: string | null; // mapped from Firestore field: signupLink
  notes: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompetitionParticipant {
  id: string;
  competitionId: string;
  schoolId: string;
  studentUid: string; // mapped from Firestore field: userId
  studentName: string; // mapped from Firestore field: userName
  beltRank: string | null; // mapped from Firestore field: belt
  weight: string | null;
  registeredAt: Date; // mapped from Firestore field: confirmedAt
}

// ─── Normalizers ──────────────────────────────────────────────────────────────

function toDate(raw: unknown): Date {
  if (raw instanceof Timestamp) return raw.toDate();
  if (raw instanceof Date) return raw;

  if (typeof raw === "string" || typeof raw === "number") {
    const parsed = new Date(raw);
    return isNaN(parsed.getTime()) ? new Date(0) : parsed;
  }

  return new Date(0);
}

function toDateOrNull(raw: unknown): Date | null {
  if (raw == null) return null;
  const parsed = toDate(raw);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isArchivedValue(raw: unknown): boolean {
  return raw === true;
}

/**
 * Normalize a Firestore competition document to the UI Competition model.
 * Firestore fields: title, signupDeadline, signupLink
 * UI fields:        name,  registrationDeadline, registrationLink
 */
export function normalizeCompetition(
  id: string,
  data: Record<string, unknown>,
): Competition {
  const normalized: Competition = {
    id,
    schoolId: (data.schoolId as string) ?? "",
    name: (data.title as string) ?? (data.name as string) ?? "",
    organization: (data.organization as string | null) ?? null,
    location: (data.location as string | null) ?? null,
    eventDate: toDate(data.eventDate),
    registrationDeadline: toDateOrNull(
      data.signupDeadline ?? data.registrationDeadline,
    ),
    registrationLink:
      (data.signupLink as string | null) ??
      (data.registrationLink as string | null) ??
      null,
    notes: (data.notes as string | null) ?? null,
    createdBy: (data.createdBy as string) ?? "",
    createdByName: (data.createdByName as string) ?? "",
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };

  console.log("[competitions] raw competition", { id, ...data });
  console.log("[competitions] normalized competition", normalized);

  return normalized;
}

/**
 * Normalize a Firestore competitionParticipants document to the UI model.
 * Firestore fields: userId, userName, belt, confirmedAt
 * UI fields:        studentUid, studentName, beltRank, registeredAt
 */
export function normalizeParticipant(
  id: string,
  data: Record<string, unknown>,
): CompetitionParticipant {
  const normalized: CompetitionParticipant = {
    id,
    competitionId: (data.competitionId as string) ?? "",
    schoolId: (data.schoolId as string) ?? "",
    studentUid: (data.userId as string) ?? (data.studentUid as string) ?? "",
    studentName:
      (data.userName as string) ?? (data.studentName as string) ?? "",
    beltRank:
      (data.belt as string | null) ??
      (data.beltRank as string | null) ??
      null,
    weight: (data.weight as string | null) ?? null,
    registeredAt: toDate(data.confirmedAt ?? data.registeredAt),
  };

  console.log("[competitions] raw participant", { id, ...data });
  console.log("[competitions] normalized participant", normalized);

  return normalized;
}

// ─── Internal loaders ─────────────────────────────────────────────────────────

async function fetchCompetitionsBySchool(schoolId: string): Promise<Competition[]> {
  const q = query(
    collection(db, "competitions"),
    where("schoolId", "==", schoolId),
  );

  const snap = await getDocs(q);

  return snap.docs
    .map((d) => normalizeCompetition(d.id, d.data() as Record<string, unknown>))
    .filter((comp) => !!comp.schoolId && !isArchivedValue((snap.docs.find(x => x.id === comp.id)?.data() as Record<string, unknown>)?.isArchived));
}

function sortByEventDateAsc(a: Competition, b: Competition): number {
  return a.eventDate.getTime() - b.eventDate.getTime();
}

function sortByEventDateDesc(a: Competition, b: Competition): number {
  return b.eventDate.getTime() - a.eventDate.getTime();
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Fetch upcoming competitions for a school.
 * Safer approach: fetch by schoolId, then filter/sort client-side.
 * This avoids brittle composite-index issues on the mural.
 */
export async function fetchUpcomingCompetitions(
  schoolId: string,
  maxResults?: number,
): Promise<Competition[]> {
  const today = startOfDay(new Date());

  const all = await fetchCompetitionsBySchool(schoolId);

  const upcoming = all
    .filter((comp) => startOfDay(comp.eventDate).getTime() >= today.getTime())
    .sort(sortByEventDateAsc);

  return typeof maxResults === "number"
    ? upcoming.slice(0, maxResults)
    : upcoming;
}

/** Fetch a single competition by id. */
export async function fetchCompetition(
  competitionId: string,
): Promise<Competition | null> {
  const snap = await getDoc(doc(db, "competitions", competitionId));
  if (!snap.exists()) return null;
  return normalizeCompetition(snap.id, snap.data() as Record<string, unknown>);
}

/** Fetch participants for a competition. */
export async function fetchParticipants(
  competitionId: string,
): Promise<CompetitionParticipant[]> {
  const q = query(
    collection(db, "competitionParticipants"),
    where("competitionId", "==", competitionId),
  );

  const snap = await getDocs(q);

  return snap.docs
    .map((d) => normalizeParticipant(d.id, d.data() as Record<string, unknown>))
    .sort((a, b) => a.registeredAt.getTime() - b.registeredAt.getTime());
}

/** Check whether a student is already registered for a competition. */
export async function checkAlreadyRegistered(
  competitionId: string,
  studentUid: string,
): Promise<string | null> {
  const q = query(
    collection(db, "competitionParticipants"),
    where("competitionId", "==", competitionId),
    where("userId", "==", studentUid),
    firestoreLimit(1),
  );

  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].id;
}

/** Register a student for a competition. Returns the new participant doc id. */
export async function registerForCompetition(opts: {
  competitionId: string;
  schoolId: string;
  studentUid: string;
  studentName: string;
  beltRank: string | null;
}): Promise<string> {
  const existing = await checkAlreadyRegistered(
    opts.competitionId,
    opts.studentUid,
  );
  if (existing) return existing;

  const payload = {
    competitionId: opts.competitionId,
    schoolId: opts.schoolId,
    userId: opts.studentUid,
    userName: opts.studentName,
    belt: opts.beltRank ?? null,
    confirmedAt: serverTimestamp(),
  };

  console.log("[competitions] register payload", payload);

  const ref = await addDoc(collection(db, "competitionParticipants"), payload);
  return ref.id;
}

/** Create a new competition. Writes Firestore fields: title, signupDeadline, signupLink, isArchived. */
export async function createCompetition(opts: {
  schoolId: string;
  name: string;
  organization: string | null;
  location: string | null;
  eventDate: Date;
  registrationDeadline: Date | null;
  registrationLink: string | null;
  notes: string | null;
  createdBy: string;
  createdByName: string;
}): Promise<string> {
  if (!opts.schoolId) throw new Error("schoolId is required");
  if (!opts.createdBy) throw new Error("createdBy (uid) is required");
  if (!opts.name?.trim()) throw new Error("Competition name is required");

  const payload = {
    schoolId: opts.schoolId,
    title: opts.name.trim(),
    organization: opts.organization ?? null,
    location: opts.location ?? null,
    eventDate: Timestamp.fromDate(opts.eventDate),
    signupDeadline: opts.registrationDeadline
      ? Timestamp.fromDate(opts.registrationDeadline)
      : null,
    signupLink: opts.registrationLink ?? null,
    notes: opts.notes ?? null,
    createdBy: opts.createdBy,
    createdByName: opts.createdByName,
    isArchived: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  console.log("[competitions] create payload", payload);

  try {
    const ref = await addDoc(collection(db, "competitions"), payload);
    console.log("[competitions] created competition id:", ref.id);
    return ref.id;
  } catch (error) {
    console.error("[competitions] create failed", error);
    throw error;
  }
}

/** Update an existing competition. Writes Firestore fields: title, signupDeadline, signupLink. */
export async function updateCompetition(
  competitionId: string,
  opts: {
    name?: string;
    organization?: string | null;
    location?: string | null;
    eventDate?: Date;
    registrationDeadline?: Date | null;
    registrationLink?: string | null;
    notes?: string | null;
  },
): Promise<void> {
  const updates: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (opts.name !== undefined) updates.title = opts.name;
  if (opts.organization !== undefined) updates.organization = opts.organization;
  if (opts.location !== undefined) updates.location = opts.location;
  if (opts.eventDate !== undefined) {
    updates.eventDate = Timestamp.fromDate(opts.eventDate);
  }
  if (opts.registrationDeadline !== undefined) {
    updates.signupDeadline = opts.registrationDeadline
      ? Timestamp.fromDate(opts.registrationDeadline)
      : null;
  }
  if (opts.registrationLink !== undefined) {
    updates.signupLink = opts.registrationLink;
  }
  if (opts.notes !== undefined) {
    updates.notes = opts.notes;
  }

  console.log("[competitions] update payload", updates);

  await updateDoc(doc(db, "competitions", competitionId), updates as any);
}

/** Soft-delete a competition by setting isArchived=true. */
export async function deleteCompetition(
  competitionId: string,
): Promise<void> {
  await updateDoc(doc(db, "competitions", competitionId), {
    isArchived: true,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Fetch all competitions for a school including past ones.
 * Safer approach: fetch by schoolId, then filter archived client-side.
 */
export async function fetchAllCompetitions(
  schoolId: string,
): Promise<Competition[]> {
  const q = query(
    collection(db, "competitions"),
    where("schoolId", "==", schoolId),
  );

  const snap = await getDocs(q);

  return snap.docs
    .filter((d) => (d.data().isArchived as boolean | undefined) !== true)
    .map((d) => normalizeCompetition(d.id, d.data() as Record<string, unknown>))
    .sort(sortByEventDateAsc);
}