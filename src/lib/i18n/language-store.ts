import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, NativeModules } from "react-native";
import { Locale, SUPPORTED_LOCALES } from "./translations";

type LanguageState = {
  locale: Locale;
  isAutoDetected: boolean;
  hasHydrated: boolean;
  setLocale: (locale: Locale) => void;
  resetToDeviceLocale: () => void;
  setHydrated: () => void;
};

function detectDeviceLocale(): Locale {
  try {
    let raw = "en";

    if (Platform.OS === "ios") {
      const settings = NativeModules.SettingsManager?.settings;
      raw =
        settings?.AppleLanguages?.[0] ||
        settings?.AppleLocale ||
        settings?.AppleLanguages?.[0] ||
        "en";
    } else if (Platform.OS === "android") {
      raw = NativeModules.I18nManager?.localeIdentifier || "en";
    } else {
      raw = typeof navigator !== "undefined" ? navigator.language : "en";
    }

    // normalize (examples: "pt_BR", "pt-BR", "pt")
    const normalized = String(raw).replace("_", "-");

    // prefer exact match first
    const exact = SUPPORTED_LOCALES.find((l) => l.toLowerCase() === normalized.toLowerCase());
    if (exact) return exact;

    // then base language match (pt -> pt-BR, es -> es, en -> en)
    const base = normalized.split("-")[0].toLowerCase();
    if (base === "pt") return "pt-BR";
    if (base === "es") return "es";
    return "en";
  } catch {
    return "en";
  }
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set, get) => ({
      locale: "en",
      isAutoDetected: true,
      hasHydrated: false,

      setLocale: (locale) =>
        set({
          locale,
          isAutoDetected: false,
        }),

      resetToDeviceLocale: () =>
        set({
          locale: detectDeviceLocale(),
          isAutoDetected: true,
        }),

      setHydrated: () => set({ hasHydrated: true }),
    }),
    {
      name: "tatame_language",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        locale: state.locale,
        isAutoDetected: state.isAutoDetected,
      }),
      onRehydrateStorage: () => (state) => {
        // when persisted state is loaded, mark hydrated
        state?.setHydrated?.();
        // if no persisted locale or auto-detect is on, refresh device locale once
        try {
          const s = state as any;
          if (s?.isAutoDetected) {
            s?.resetToDeviceLocale?.();
          }
        } catch {}
      },
    }
  )
);
