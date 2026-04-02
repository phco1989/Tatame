import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";
import { db, ensureSignedIn, waitForAuthReady } from "@/lib/firebase-config";

type InviteRole = "student" | "coach" | "manager";

function make6DigitCode(): string {
  // exactly 6 digits, leading zeros allowed
  const num = Math.floor(Math.random() * 1000000);
  return num.toString().padStart(6, "0");
}

async function getMySchoolId(db: Firestore, uid: string): Promise<string> {
  const userSnap = await getDoc(doc(db, "users", uid));
  const schoolId = userSnap.data()?.schoolId;
  if (!schoolId) throw new Error("manager_missing_schoolId");
  return schoolId;
}

/**
 * Creates a 6-digit invite code in /school_invites/{code}
 * Writes canonical fields + backward compatible academyId.
 */
export async function createInvite(role: InviteRole): Promise<string> {
  await waitForAuthReady();
  const user = await ensureSignedIn();
  const schoolId = await getMySchoolId(db, user.uid);

  const MAX_TRIES = 12;

  for (let i = 0; i < MAX_TRIES; i++) {
    const code = make6DigitCode();
    const inviteRef = doc(db, "school_invites", code);

    try {
      await runTransaction(db, async (tx) => {
        const existing = await tx.get(inviteRef);
        if (existing.exists()) throw new Error("code_collision");

        tx.set(inviteRef, {
          code,
          schoolId: schoolId,     // canonical
          academyId: schoolId,    // optional legacy (ok to keep)
          role,
          active: true,
          usedCount: 0,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
        });
      });

      return code;
    } catch (e: any) {
      if (e?.message === "code_collision") continue;
      throw e;
    }
  }

  throw new Error("invite_generation_failed_try_again");
}


