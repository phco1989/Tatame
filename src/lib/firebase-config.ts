import { getStorage } from "firebase/storage";
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  type Auth,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { setUserId } from "@/lib/revenuecatClient";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID!,
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth: Auth = getAuth(app);
export const storage = getStorage(app);
export const db: Firestore = getFirestore(app);

let _ready = false;
let _readyPromise: Promise<void> | null = null;

export function waitForAuthReady(): Promise<void> {
  if (_ready) return Promise.resolve();
  if (!_readyPromise) {
    _readyPromise = new Promise<void>((resolve) => {
      const unsub = onAuthStateChanged(auth, () => {
        _ready = true;
        unsub();
        resolve();
      });
    });
  }
  return _readyPromise;
}

export async function ensureSignedIn() {
  await waitForAuthReady();

  if (!auth.currentUser) {
    const cred = await signInAnonymously(auth);
    await setUserId(cred.user.uid);
    return cred.user;
  }

  await setUserId(auth.currentUser.uid);
  return auth.currentUser;
}