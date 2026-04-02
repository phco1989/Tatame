// Type declaration for firebase/auth/react-native subpath
// Re-exports from @firebase/auth RN-specific types which include getReactNativePersistence
declare module "firebase/auth/react-native" {
  export { getReactNativePersistence } from "@firebase/auth/dist/src/platform_react_native/persistence/react_native";
  export {
    initializeAuth,
    getAuth,
    onAuthStateChanged,
    signInAnonymously,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    sendPasswordResetEmail,
    updateProfile,
    updateEmail,
    updatePassword,
    deleteUser,
    reauthenticateWithCredential,
    EmailAuthProvider,
    GoogleAuthProvider,
    OAuthProvider,
    User,
    UserCredential,
    Auth,
    Unsubscribe,
  } from "@firebase/auth";
}
