import { useMemo } from "react";
import { useLanguageStore } from "./language-store";
import { translations, Locale } from "./translations";

declare const __DEV__: boolean;

function isObject(v: any) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function getAtPath(obj: any, path: string[]): any {
  return path.reduce((acc, key) => (acc && key in acc ? acc[key] : undefined), obj);
}

function makeTranslator(locale: Locale) {
  const dict = translations[locale] ?? translations.en;
  const en = translations.en;

  const buildProxy = (path: string[] = []): any =>
    new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "__locale") return locale;
          if (prop === "__path") return path.join(".");
          if (typeof prop !== "string") return undefined;

          const nextPath = [...path, prop];

          const localized = getAtPath(dict, nextPath);
          if (localized !== undefined) {
            if (isObject(localized)) return buildProxy(nextPath);
            return localized;
          }

          const fallback = getAtPath(en, nextPath);
          if (fallback !== undefined) {
            if (__DEV__) {
              console.warn(`[i18n] Missing key in ${locale}: ${nextPath.join(".")} (fallback to EN)`);
            }
            if (isObject(fallback)) return buildProxy(nextPath);
            return fallback;
          }

          if (__DEV__) {
            console.warn(`[i18n] Missing key in ALL locales: ${nextPath.join(".")}`);
          }
          return nextPath.join(".");
        },
      }
    );

  return buildProxy([]);
}

export function useTranslations() {
  const locale = useLanguageStore((s) => s.locale);
  return useMemo(() => makeTranslator(locale), [locale]);
}

/**
 * useT - returns a scoped section or a dot-notation resolver.
 * useT()          → (key: string) => string
 * useT("common")  → { ok, cancel, ... }
 */
function resolveKey(obj: unknown, path: string): string {
  const parts = path.split(".");
  let current: any = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return path;
    current = current[part];
  }
  if (typeof current === "string") return current;
  return path;
}

export function useT(): (key: string) => string;
export function useT(section: string): any;
export function useT(section?: string): unknown {
  const tr = useTranslations();
  if (!section) {
    return (key: string) => resolveKey(tr, key);
  }
  return (tr as any)[section] ?? {};
}
