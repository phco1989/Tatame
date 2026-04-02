import {
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { signInAnonymously, signOut } from "firebase/auth";
import { auth, db, waitForAuthReady } from "@/lib/firebase-config";

export interface JoinResult {
  role: "student" | "coach" | "manager" | "ngo";
  schoolId: string;
  needsEmailSetup: boolean;
}

/**
 * joinWithInviteCode — redeems an invite code.
 *
 * Lookup order:
 *  1) omg_access_code/{code}  — NGO/OMG partner codes (e.g. "OMG123")
 *  2) school_invites/{code}   — school coach/student invite codes
 */
export async function joinWithInviteCode(code: string): Promise<JoinResult> {
  const clean = (code ?? "").trim().toUpperCase();

  if (!clean || clean.length < 1) {
    throw new Error("Please enter an invite code.");
  }

  // Step 1: Ensure auth is initialized
  await waitForAuthReady();

  // Step 2: Ensure we have a signed-in user (anonymous is fine)
  if (!auth.currentUser) {
    try {
      await signInAnonymously(auth);
    } catch (authErr: any) {
      if (
        authErr?.code === "auth/invalid-credential" ||
        String(authErr?.message ?? "").includes("invalid-credential")
      ) {
        console.warn("[join] Anonymous sign-in failed, clearing and retrying:", authErr.code);
        try {
          await signOut(auth);
        } catch (_) {}
        await signInAnonymously(auth);
      } else {
        throw authErr;
      }
    }
  }

  await waitForAuthReady();

  if (!auth.currentUser) {
    throw new Error("Sign-in failed. Please try again.");
  }

  const uid = auth.currentUser.uid;

  // ─── Try omg_access_codes first ───────────────────────────────────────────
  // NOTE: collection is "omg_access_codes" (plural) — matches ong-onboarding.tsx
  const omgRef = doc(db, "omg_access_codes", clean);
  let inviteRole: JoinResult["role"] = "student";
  let inviteSchoolId: string = "";

  let isOmgCode = false;
  try {
    await runTransaction(db, async (tx) => {
      const omgSnap = await tx.get(omgRef);

      if (omgSnap.exists()) {
        // ── OMG / NGO path ──────────────────────────────────────────────────
        isOmgCode = true;
        const omg = omgSnap.data() as {
          isActive?: boolean;
          status?: string;
          code?: string;
          type?: string;
          maxUses?: number;
          currentUses?: number;
          schoolId?: string | null;
          targetRole?: string;
        };

        // 1. Validate schoolId exists on the code doc
        const rawSchoolId = omg.schoolId ?? "";
        if (!rawSchoolId) {
          throw new Error("invite_missing_school");
        }

        // 2. Verify active
        const active = omg.isActive === true || omg.status === "active";
        if (!active) {
          throw new Error("invite_inactive");
        }

        // 3. Verify capacity
        const maxUses = Number(omg.maxUses ?? 0);
        const currentUses = Number(omg.currentUses ?? 0);
        if (maxUses > 0 && currentUses >= maxUses) {
          throw new Error("invite_inactive");
        }

        // 4. Verify school document exists inside the transaction
        const schoolRef = doc(db, "schools", rawSchoolId);
        const schoolSnap = await tx.get(schoolRef);
        if (!schoolSnap.exists()) {
          throw new Error("invite_missing_school");
        }

        // 5. Fetch user doc
        const userRef = doc(db, "users", uid);
        const userSnap = await tx.get(userRef);
        const existingUser = userSnap.exists() ? userSnap.data() : null;

        // 6. Duplicate redemption guard — already assigned, return existing state
        if (existingUser?.role && existingUser?.schoolId) {
          inviteRole = existingUser.role as JoinResult["role"];
          inviteSchoolId = existingUser.schoolId as string;
          return; // do NOT increment
        }

        // 7. Resolve role — only "student" or "coach" are valid from invite codes
        const resolvedRole: "student" | "coach" =
          omg.targetRole === "coach" ? "coach" : "student";
        inviteRole = resolvedRole;
        inviteSchoolId = rawSchoolId;

        // 8. Write user doc (new assignment only)
        tx.set(
          userRef,
          {
            uid,
            role: resolvedRole,
            organizationType: "ngo",
            type: omg.type ?? "ngo",
            schoolId: rawSchoolId,
            status: "active",
            profileComplete: false,
            updatedAt: serverTimestamp(),
            ...(existingUser ? {} : { createdAt: serverTimestamp() }),
          },
          { merge: true }
        );

        // 9. Increment usage only on new assignment
        tx.update(omgRef, {
          currentUses: currentUses + 1,
          lastUsedAt: serverTimestamp(),
          usedByUid: uid,
          usedAt: serverTimestamp(),
        });
      } else {
        // ── school_invites fallback ──────────────────────────────────────────
        const inviteRef = doc(db, "school_invites", clean);
        const inviteSnap = await tx.get(inviteRef);

        if (!inviteSnap.exists()) {
          throw new Error("invite_not_found");
        }

        const invite = inviteSnap.data() as {
          isActive?: boolean;
          active?: boolean;
          role?: string;
          schoolId?: string;
          academyId?: string;
          usedCount?: number;
        };

        const isActive = invite.isActive ?? invite.active;
        if (isActive !== true) {
          throw new Error("invite_inactive");
        }

        const resolvedSchoolId = invite.schoolId || invite.academyId;
        if (!resolvedSchoolId) {
          throw new Error("Invite is missing school reference.");
        }

        // Verify school exists
        const schoolRef = doc(db, "schools", resolvedSchoolId);
        const schoolSnap = await tx.get(schoolRef);
        if (!schoolSnap.exists()) {
          throw new Error("The school for this invite no longer exists.");
        }

        inviteRole = (invite.role as "student" | "coach" | "manager") || "student";
        inviteSchoolId = resolvedSchoolId;

        const userRef = doc(db, "users", uid);
        const userSnap = await tx.get(userRef);
        const existingUser = userSnap.exists() ? userSnap.data() : null;

        if (existingUser?.role && existingUser?.schoolId) {
          inviteRole = existingUser.role as JoinResult["role"];
          inviteSchoolId = existingUser.schoolId as string;
        } else {
          // Propagate organizationType from school doc so signin.tsx can route ONG members correctly.
          const schoolOrgType = schoolSnap.data()?.organizationType as string | undefined;
          tx.set(
            userRef,
            {
              uid,
              role: invite.role ?? "student",
              schoolId: resolvedSchoolId,
              ...(schoolOrgType ? { organizationType: schoolOrgType } : {}),
              status: "active",
              profileComplete: true,
              updatedAt: serverTimestamp(),
              ...(existingUser ? {} : { createdAt: serverTimestamp() }),
            },
            { merge: true }
          );
        }

        const currentUsed = Number(invite.usedCount ?? 0);
        tx.update(inviteRef, {
          usedCount: currentUsed + 1,
          lastUsedAt: serverTimestamp(),
          redeemedBy: uid,
          redeemedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    });
  } catch (err: any) {
    const msg = String(err?.message ?? "");
    console.error("[join] transaction error:", msg);
    throw err;
  }

  // Step 4: Check if user needs to set up email/password
  const user = auth.currentUser!;
  const hasEmailProvider = user.providerData.some(
    (p) => p.providerId === "password"
  );

  return {
    role: inviteRole,
    schoolId: inviteSchoolId,
    needsEmailSetup: !hasEmailProvider,
  };
}
