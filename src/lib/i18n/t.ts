/**
 * i18n helper utilities
 *
 * RULE: Never hardcode user-visible strings in UI.
 * Always add new keys to translations.ts and consume via useT() or useTranslations().
 *
 * Usage:
 *   // In a component:
 *   const t = useTranslations();
 *   <Text>{t.join.continue}</Text>
 *
 *   // For a specific section only:
 *   const joinT = useT("join");
 *   <Text>{joinT.continue}</Text>
 */

export { useTranslations, useT } from "./useTranslations";
export { translations, SUPPORTED_LOCALES, LOCALE_NAMES, LOCALE_FLAGS } from "./translations";
export type { Locale, Translations } from "./translations";
