import { signInAnonymously } from "firebase/auth";
import { auth } from "@/lib/firebase-config";
import { setUserId } from "@/lib/revenuecatClient";

/**
 * Ensures Firebase has a current user and keeps RevenueCat
 * linked to that same Firebase UID.
 */
export async function ensureAnonAuth() {
  // If a Firebase user already exists, make sure RevenueCat
  // is logged in with the same UID before returning.
  if (auth.currentUser) {
    await setUserId(auth.currentUser.uid);
    return auth.currentUser;
  }

  // Otherwise create an anonymous Firebase user.
  const cred = await signInAnonymously(auth);

  // IMPORTANT:
  // Link RevenueCat to the exact same Firebase UID.
  await setUserId(cred.user.uid);

  return cred.user;
}